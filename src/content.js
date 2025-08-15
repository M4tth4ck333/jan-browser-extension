// content.js
// Extracts text content from the page and returns it on request

function getMetaDescription() {
  const el = document.querySelector('meta[name="description"]');
  return el?.getAttribute('content') || '';
}

function getSelectionText() {
  const sel = window.getSelection();
  return sel && sel.toString ? sel.toString() : '';
}

function getVisibleText() {
  // Simple baseline: innerText approximates visible text.
  // Could be improved with Readability.js if desired.
  const t = document.body ? document.body.innerText || '' : '';
  return t.replace(/[\t\r]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'GET_PAGE_CONTENT') {
    const maxChars = 100000; // safety cap
    const content = getVisibleText().slice(0, maxChars);
    const selection = getSelectionText().slice(0, maxChars / 4);

    sendResponse({
      ok: true,
      url: location.href,
      title: document.title || '',
      lang: document.documentElement?.lang || '',
      metaDescription: getMetaDescription(),
      content,
      selection
    });
    return true;
  }

  function clampXY(x, y, w = 420, h = 160) {
    const vx = Math.min(Math.max(8, Math.round(x)), Math.max(8, window.innerWidth - w - 8));
    const vy = Math.min(Math.max(8, Math.round(y)), Math.max(8, window.innerHeight - h - 8));
    return { x: vx, y: vy };
  }

  function showCustomPromptAt(x, y) {
    ensureShadow();
    if (overlayEl) overlayEl.remove();
    overlayEl = document.createElement('div');
    overlayEl.className = 'overlay';
    const { x: vx, y: vy } = clampXY(x, y, 420, 220);
    overlayEl.style.left = `${vx}px`;
    overlayEl.style.top = `${vy}px`;
    const header = document.createElement('div');
    header.className = 'header';
    const pill = document.createElement('div'); pill.className = 'pill'; pill.textContent = 'Jan • Custom';
    const close = document.createElement('button'); close.className = 'close'; close.textContent = '✕'; close.addEventListener('click', () => clearUI());
    header.appendChild(pill);
    overlayEl.appendChild(close);
    overlayEl.appendChild(header);
    const ta = document.createElement('textarea');
    ta.placeholder = 'Type your instruction... (e.g., "Summarize the selected text in 3 bullets")';
    overlayEl.appendChild(ta);
    const hint = document.createElement('div'); hint.className = 'hint'; hint.textContent = 'Enter to run • Shift+Enter for newline • Esc to close';
    const actions = document.createElement('div'); actions.className = 'actions';
    const runBtn = document.createElement('button'); runBtn.className = 'btn'; runBtn.textContent = 'Run';
    const cancelBtn = document.createElement('button'); cancelBtn.className = 'btn secondary'; cancelBtn.textContent = 'Cancel';
    actions.appendChild(cancelBtn);
    actions.appendChild(runBtn);
    overlayEl.appendChild(actions);
    overlayEl.appendChild(hint);
    shadowRoot.appendChild(overlayEl);
    try { ta.focus(); } catch(_) {}

    const setBusy = (busy) => {
      runBtn.disabled = !!busy; cancelBtn.disabled = !!busy; ta.disabled = !!busy;
      if (busy) { runBtn.textContent = 'Working…'; } else { runBtn.textContent = 'Run'; }
    };

    const doRun = async () => {
      const prompt = String(ta.value || '').trim();
      if (!prompt) { ta.focus(); return; }
      // Snapshot context (prefer saved selection)
      let ctx = lastSelCtx;
      let ed = ctx?.ed || currentEditable();
      if (!ctx || !ctx.ed) {
        if (ed) {
          const { text, range } = getSelectionInEditable(ed);
          ctx = { ed, text, range };
        } else {
          ctx = { ed: null, text: getSelectionText(), range: null };
        }
      }
      const selection = String(ctx?.text || getSelectionText() || '').trim();
      const payload = {
        prompt,
        title: document.title || '',
        url: location.href,
        lang: document.documentElement?.lang || '',
        metaDescription: getMetaDescription(),
        selection,
        content: getVisibleText()
      };
      setBusy(true);
      try {
        const resp = await chrome.runtime.sendMessage({ type: 'CUSTOM_PROMPT_RUN', payload });
        if (!resp?.ok) {
          setBusy(false);
          hint.textContent = resp?.error || 'Error';
          return;
        }
        const out = String(resp.text || '').trim();
        const rect = ed ? getRectForSelection(ed, ctx) : overlayEl.getBoundingClientRect();
        const rx = rect.left; const ry = rect.bottom + 6;
        clearUI();
        lastCustom = { prompt, ctx, x: rx, y: ry };
        showResultAt(rx, ry, out, {
          onApply: () => applyReplacement(ed || currentEditable(), ctx?.range || null, out),
          onRegenerate: async () => {
            // Re-run with same prompt and context
            try {
              const payload2 = { ...payload };
              const resp2 = await chrome.runtime.sendMessage({ type: 'CUSTOM_PROMPT_RUN', payload: payload2 });
              if (!resp2?.ok) return;
              const out2 = String(resp2.text || '').trim();
              showResultAt(rx, ry, out2, {
                onApply: () => applyReplacement(ed || currentEditable(), ctx?.range || null, out2),
                onRegenerate: () => {},
                mode: 'custom'
              });
            } catch(_) {}
          },
          mode: 'custom'
        });
      } catch (e) {
        setBusy(false);
        hint.textContent = String(e?.message || e);
      }
    };

    cancelBtn.addEventListener('click', () => clearUI());
    runBtn.addEventListener('click', () => doRun());

    if (overlayKeyHandler && shadowRoot) { try { shadowRoot.removeEventListener('keydown', overlayKeyHandler, true); } catch(_) {} }
    overlayKeyHandler = (e) => {
      try {
        if (!overlayEl) return;
        if (e.key === 'Escape') { e.preventDefault(); clearUI(); return; }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'enter') { e.preventDefault(); doRun(); return; }
        if (e.key === 'Enter' && !e.shiftKey) {
          const target = e.target;
          // Only trigger when focus is in textarea
          if (target && target.tagName === 'TEXTAREA') { e.preventDefault(); doRun(); return; }
        }
      } catch(_) {}
    };
    try { shadowRoot.addEventListener('keydown', overlayKeyHandler, true); } catch(_) {}
  }

  if (message?.type === 'SCRAPE_GOOGLE_SERP') {
    try {
      const url = new URL(location.href);
      const q = url.searchParams.get('q') || '';
      const results = [];
      // Prefer organic results inside #search
      const headings = Array.from(document.querySelectorAll('#search a h3')).slice(0, 5);
      for (const h3 of headings) {
        const a = h3.closest('a');
        if (!a) continue;
        const title = (h3.textContent || '').trim();
        const href = a.href;
        // Try to find a snippet within the result container
        const container = h3.closest('div.g') || h3.parentElement?.parentElement || null;
        const snippetEl = container?.querySelector('.VwiC3b, .yXK7lf, .MUxGbd');
        const snippet = (snippetEl?.innerText || '').trim();
        const snippetHtml = (snippetEl?.innerHTML || '').trim();
        const html = container ? container.outerHTML : '';
        results.push({ title, url: href, snippet, snippetHtml, html });
      }
      const answerBoxCandidates = [
        '#kp-wp-tab-overview',
        'div[data-attrid="wa:/description"]',
        'div[data-attrid^="kc:/"]',
        'div[data-tts]'
      ];
      let answerBox = '';
      let answerBoxHtml = '';
      for (const sel of answerBoxCandidates) {
        const el = document.querySelector(sel);
        if (el && (el.innerText || '').trim()) {
          answerBox = el.innerText.trim();
          try { answerBoxHtml = el.outerHTML; } catch (_) { answerBoxHtml = ''; }
          break;
        }
      }
      sendResponse({ ok: true, query: q, pageTitle: document.title || '', answerBox, answerBoxHtml, results });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
    return true;
  }
});

// --- Inline Assistant Tooltip (MVP) ---
;(function() {
  // Config (live-updated from storage)
  let inlineEnabled = true;
  let allowedActions = ['rewrite','fix_grammar','shorten','expand','tone_formal','tone_friendly','summarize','translate'];

  // Load initial settings
  try {
    chrome.storage.sync.get(['inlineAssistEnabled','inlineAssistActions'], (s) => {
      if (typeof s.inlineAssistEnabled === 'boolean') inlineEnabled = s.inlineAssistEnabled;
      if (Array.isArray(s.inlineAssistActions) && s.inlineAssistActions.length) {
        allowedActions = s.inlineAssistActions;
      }
    });
  } catch (_) {}
  // React to settings changes
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      if (Object.prototype.hasOwnProperty.call(changes, 'inlineAssistEnabled')) {
        inlineEnabled = !!changes.inlineAssistEnabled.newValue;
      }
      if (Object.prototype.hasOwnProperty.call(changes, 'inlineAssistActions')) {
        const v = changes.inlineAssistActions.newValue;
        if (Array.isArray(v) && v.length) allowedActions = v;
      }
    });
  } catch (_) {}

  // Shadow UI
  let shadowHost = null;
  let shadowRoot = null;
  let tooltipEl = null;
  let menuEl = null;
  let resultEl = null;
  let overlayEl = null;
  let lastSelCtx = null; // { ed, text, range }
  let selectionTimer = null;
  let suppressSelectionChangeUntil = 0;
  let lastPointer = { x: 0, y: 0, t: 0 };
  let resultKeyHandler = null;
  let overlayKeyHandler = null;
  let lastRun = null; // { mode, ctx, x, y }
  let lastCustom = null; // { prompt, ctx, x, y }

  function ensureShadow() {
    if (shadowRoot) return;
    shadowHost = document.createElement('div');
    shadowHost.id = 'jan-inline-assist-root';
    shadowHost.style.position = 'fixed';
    shadowHost.style.zIndex = '2147483647';
    shadowHost.style.top = '0';
    shadowHost.style.left = '0';
    document.documentElement.appendChild(shadowHost);
    shadowRoot = shadowHost.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      @keyframes jan-fade-in { from { opacity: 0; transform: translateY(-2px) } to { opacity: 1; transform: translateY(0) } }
      @keyframes jan-spin { to { transform: rotate(360deg) } }
      .tip{ position: fixed; display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border-radius:999px; background: rgba(17,24,39,.95); color: white; font: 12px/1.2 system-ui,-apple-system,Segoe UI,Roboto; border: 1px solid rgba(255,255,255,.08); box-shadow: 0 10px 30px rgba(0,0,0,.35); backdrop-filter: saturate(140%) blur(6px); animation: jan-fade-in .12s ease-out; }
      .tip button{ background: transparent; color: inherit; border: none; cursor: pointer; font: inherit; padding: 2px 8px; border-radius:999px; }
      .tip button:hover{ background: rgba(255,255,255,.08) }
      .menu{ position: fixed; margin-top:6px; padding:6px; background: rgba(17,24,39,.97); color: white; border-radius:12px; border:1px solid rgba(255,255,255,.08); box-shadow: 0 18px 48px rgba(0,0,0,.45); min-width: 180px; animation: jan-fade-in .12s ease-out; }
      .menu .item{ display:block; padding:8px 10px; border-radius:8px; cursor:pointer; }
      .menu .item:hover{ background: rgba(255,255,255,.08) }
      .card{ position: fixed; max-width: 420px; padding:12px 12px 10px; background: rgba(17,24,39,.97); color:white; border-radius:14px; border:1px solid rgba(255,255,255,.08); box-shadow: 0 22px 60px rgba(0,0,0,.5); font: 13px/1.35 system-ui,-apple-system,Segoe UI,Roboto; animation: jan-fade-in .12s ease-out; }
      .card .header{ display:flex; align-items:center; gap:8px; margin-bottom:8px; }
      .pill{ display:inline-flex; align-items:center; gap:6px; font-size:11px; color:#d1d5db; background: rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.06); padding:3px 8px; border-radius:999px; }
      .spinner{ width:14px; height:14px; border:2px solid rgba(255,255,255,.25); border-top-color:#fff; border-radius:50%; animation: jan-spin .8s linear infinite; }
      .card .actions{ display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
      .btn{ background:#2563eb; color:white; border:none; padding:6px 10px; border-radius:8px; cursor:pointer; font: inherit; box-shadow: 0 6px 18px rgba(37,99,235,.25) }
      .btn.secondary{ background:#374151 }
      .btn.ghost{ background:transparent; color:#cbd5e1; }
      .btn:focus{ outline:2px solid rgba(37,99,235,.6); outline-offset:2px }
      .muted{ color:#9ca3af }
      .close{ position:absolute; top:8px; right:8px; background:transparent; border:1px solid transparent; color:#9ca3af; cursor:pointer; border-radius:8px; padding:2px 6px }
      .close:hover{ background: rgba(255,255,255,.06) }
      .pre{ white-space:pre-wrap; word-wrap:break-word; max-height: 240px; overflow:auto; }
      .overlay{ position: fixed; width: 420px; max-width: calc(100vw - 16px); padding:12px; background: rgba(17,24,39,.97); color:white; border-radius:14px; border:1px solid rgba(255,255,255,.08); box-shadow: 0 22px 60px rgba(0,0,0,.5); font: 13px/1.35 system-ui,-apple-system,Segoe UI,Roboto; animation: jan-fade-in .12s ease-out; }
      .overlay .header{ display:flex; align-items:center; gap:8px; margin-bottom:8px; }
      .overlay textarea{ width:100%; box-sizing:border-box; min-height: 96px; max-height: 240px; resize: vertical; padding:8px 10px; border-radius:10px; border:1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.03); color: inherit; font: inherit; }
      .overlay .actions{ display:flex; gap:8px; margin-top:10px; justify-content:flex-end; }
      .overlay .hint{ font-size:12px; color:#9ca3af; margin-top:6px; }
      @media (prefers-color-scheme: light) {
        .tip,.menu,.card{ background: rgba(255,255,255,.98); color:#0b1220; border-color: rgba(0,0,0,.06) }
        .pill{ color:#334155; background: rgba(2,6,23,.04); border-color: rgba(2,6,23,.06) }
        .btn.secondary{ background:#e5e7eb; color:#111827 }
        .muted{ color:#475569 }
        .close{ color:#64748b }
        .overlay{ background: rgba(255,255,255,.98); color:#0b1220; border-color: rgba(0,0,0,.06) }
        .overlay textarea{ background: rgba(2,6,23,.04); border-color: rgba(2,6,23,.08) }
      }
    `;
    shadowRoot.appendChild(style);
    // While interacting with our UI, ignore selectionchange-triggered hides
    const suppress = () => { suppressSelectionChangeUntil = Date.now() + 2000 }
    shadowRoot.addEventListener('pointerdown', suppress, true);
    shadowRoot.addEventListener('mousedown', suppress, true);
    shadowRoot.addEventListener('click', suppress, true);
  }

  function clearUI() {
    if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
    if (menuEl) { menuEl.remove(); menuEl = null; }
    if (resultEl) { resultEl.remove(); resultEl = null; }
    if (overlayEl) { overlayEl.remove(); overlayEl = null; }
    if (resultKeyHandler && shadowRoot) { try { shadowRoot.removeEventListener('keydown', resultKeyHandler, true); } catch(_) {} resultKeyHandler = null; }
    if (overlayKeyHandler && shadowRoot) { try { shadowRoot.removeEventListener('keydown', overlayKeyHandler, true); } catch(_) {} overlayKeyHandler = null; }
  }

  function isEditable(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') {
      const t = (el.type || '').toLowerCase();
      return ['text','search','email','url','tel','password'].includes(t) || !t;
    }
    if (el.isContentEditable) return true;
    return false;
  }

  function findEditableAncestor(node) {
    let el = node && node.nodeType === 1 ? node : node?.parentElement;
    while (el) {
      if (isEditable(el)) return el;
      el = el.parentElement;
    }
    return null;
  }

  function currentEditable() {
    const ae = document.activeElement;
    if (isEditable(ae)) return ae;
    const sel = window.getSelection && window.getSelection();
    if (sel && sel.rangeCount) {
      const anchor = sel.anchorNode;
      const ed = findEditableAncestor(anchor);
      if (ed) return ed;
    }
    return null;
  }

  function getSelectionInEditable(ed) {
    if (!ed) return { text: '', range: null };
    if (ed.isContentEditable) {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return { text: '', range: null };
      const range = sel.getRangeAt(0);
      // Ensure selection is inside ed
      const container = range.commonAncestorContainer;
      const within = ed.contains(container.nodeType === 1 ? container : container.parentNode);
      const text = String(sel.toString() || '').trim();
      return within ? { text, range } : { text: '', range: null };
    } else {
      const start = ed.selectionStart || 0;
      const end = ed.selectionEnd || 0;
      const text = String(ed.value || '').slice(start, end);
      return { text, range: { start, end } };
    }
  }

  function getRectForSelection(ed, ctx) {
    try {
      if (ed && ed.isContentEditable) {
        const sel = window.getSelection();
        const range = (ctx && ctx.range && typeof ctx.range.getBoundingClientRect === 'function')
          ? ctx.range
          : (sel && sel.rangeCount ? sel.getRangeAt(0) : null);
        if (range) {
          const clientRects = range.getClientRects();
          if (clientRects && clientRects.length) {
            // Use the first rect (start of selection)
            const r0 = clientRects[0];
            if (r0) return r0;
          }
          const rect = range.getBoundingClientRect();
          if (rect && rect.width >= 0 && rect.height >= 0) return rect;
        }
        return ed.getBoundingClientRect();
      }
      if (ed && (ed.tagName === 'TEXTAREA' || ed.tagName === 'INPUT')) {
        const rect = ed.getBoundingClientRect();
        const cs = window.getComputedStyle(ed);
        const pl = parseFloat(cs.paddingLeft) || 0;
        const pr = parseFloat(cs.paddingRight) || 0;
        const inner = Math.max(0, rect.width - pl - pr);
        const val = String(ed.value || '');
        const start = (ctx && ctx.range && typeof ctx.range.start === 'number') ? ctx.range.start : (ed.selectionStart || 0);
        const ratio = val.length ? Math.min(1, Math.max(0, start / val.length)) : 0;
        const caretX = rect.left + pl + inner * ratio;
        // Return a skinny rect at the caret/end of selection
        return { left: caretX, right: caretX, top: rect.top, bottom: rect.bottom, width: 0, height: rect.height };
      }
    } catch (_) {}
    return { top: 20, left: 20, right: 40, bottom: 40, width: 20, height: 20 };
  }

  function showTooltipAt(x, y) {
    ensureShadow();
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'tip';
      const btn = document.createElement('button');
      btn.textContent = 'Jan ✨';
      btn.title = 'Inline Assistant';
      btn.addEventListener('mousedown', (e) => { e.preventDefault(); });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Open relative to current tooltip position (supports drag)
        const r = tooltipEl.getBoundingClientRect();
        openMenuAt(r.left, r.bottom + 6);
      });
      // Drag to move the tooltip without dismissing it
      let drag = { active: false, startX: 0, startY: 0, origLeft: 0, origTop: 0, moved: false };
      const onMouseDown = (e) => {
        if (e.button !== 0) return; // left click only
        drag.active = true; drag.moved = false;
        const r = tooltipEl.getBoundingClientRect();
        drag.origLeft = r.left; drag.origTop = r.top;
        drag.startX = e.clientX; drag.startY = e.clientY;
        suppressSelectionChangeUntil = Date.now() + 2000;
        window.addEventListener('mousemove', onMouseMove, true);
        window.addEventListener('mouseup', onMouseUp, true);
      };
      const onMouseMove = (e) => {
        if (!drag.active) return;
        const dx = (e.clientX - drag.startX);
        const dy = (e.clientY - drag.startY);
        if (Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true;
        let nx = drag.origLeft + dx;
        let ny = drag.origTop + dy;
        // Clamp within viewport with small padding
        const pad = 8;
        const w = tooltipEl.offsetWidth || 120;
        const h = tooltipEl.offsetHeight || 32;
        nx = Math.min(Math.max(pad, nx), Math.max(pad, window.innerWidth - w - pad));
        ny = Math.min(Math.max(pad, ny), Math.max(pad, window.innerHeight - h - pad));
        tooltipEl.style.left = `${Math.round(nx)}px`;
        tooltipEl.style.top = `${Math.round(ny)}px`;
        suppressSelectionChangeUntil = Date.now() + 200; // keep suppressing while dragging
        e.preventDefault();
        e.stopPropagation();
      };
      const onMouseUp = (e) => {
        window.removeEventListener('mousemove', onMouseMove, true);
        window.removeEventListener('mouseup', onMouseUp, true);
        if (drag.active && drag.moved) { e.preventDefault(); e.stopPropagation(); }
        drag.active = false;
      };
      // Start drag when pressing down anywhere on the pill (not just the button)
      tooltipEl.addEventListener('mousedown', onMouseDown, true);
      tooltipEl.appendChild(btn);
      shadowRoot.appendChild(tooltipEl);
    }
    const vx = Math.min(Math.max(8, Math.round(x)), Math.max(8, window.innerWidth - 120));
    const vy = Math.min(Math.max(8, Math.round(y)), Math.max(8, window.innerHeight - 40));
    tooltipEl.style.left = `${vx}px`;
    tooltipEl.style.top = `${vy}px`;
  }

  function openMenuAt(x, y) {
    ensureShadow();
    if (menuEl) menuEl.remove();
    menuEl = document.createElement('div');
    menuEl.className = 'menu';
    const vx = Math.min(Math.max(8, Math.round(x)), Math.max(8, window.innerWidth - 240));
    const vy = Math.min(Math.max(8, Math.round(y)), Math.max(8, window.innerHeight - 200));
    menuEl.style.left = `${vx}px`;
    menuEl.style.top = `${vy}px`;
    const items = [
      { id: 'rewrite', label: 'Rewrite' },
      { id: 'fix_grammar', label: 'Fix grammar' },
      { id: 'shorten', label: 'Shorten' },
      { id: 'expand', label: 'Expand' },
      { id: 'tone_formal', label: 'Tone: Formal' },
      { id: 'tone_friendly', label: 'Tone: Friendly' },
      { id: 'summarize', label: 'Summarize' },
      { id: 'translate', label: 'Translate → English' }
    ].filter(i => allowedActions.includes(i.id));
    for (const it of items) {
      const el = document.createElement('div');
      el.className = 'item';
      el.textContent = it.label;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        menuEl?.remove();
        menuEl = null;
        startInline(it.id);
      });
      menuEl.appendChild(el);
    }
    shadowRoot.appendChild(menuEl);
  }

  function showResultAt(x, y, text, { onApply, onRegenerate, mode } = {}) {
    ensureShadow();
    if (resultEl) resultEl.remove();
    resultEl = document.createElement('div');
    resultEl.className = 'card';
    const vx = Math.min(Math.max(8, Math.round(x)), Math.max(8, window.innerWidth - 380));
    const vy = Math.min(Math.max(8, Math.round(y)), Math.max(8, window.innerHeight - 120));
    resultEl.style.left = `${vx}px`;
    resultEl.style.top = `${vy}px`;
    const close = document.createElement('button');
    close.className = 'close';
    close.textContent = '✕';
    close.addEventListener('click', () => { resultEl?.remove(); resultEl = null; });
    const header = document.createElement('div');
    header.className = 'header';
    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.textContent = mode ? `Jan • ${labelForMode(mode)}` : 'Jan';
    const pre = document.createElement('div');
    pre.className = 'pre';
    pre.textContent = text || '';
    const actions = document.createElement('div');
    actions.className = 'actions';
    const apply = document.createElement('button');
    apply.className = 'btn';
    apply.textContent = 'Apply';
    apply.addEventListener('click', () => { try { onApply && onApply(); } finally { setTimeout(() => clearUI(), 0); } });
    const copy = document.createElement('button');
    copy.className = 'btn secondary';
    copy.textContent = 'Copy';
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(text || ''); copy.textContent = 'Copied'; setTimeout(() => { try { copy.textContent = 'Copy' } catch(_){} }, 1200); } catch(_) { copy.textContent = 'Copy failed'; setTimeout(() => { try { copy.textContent = 'Copy' } catch(_){} }, 1200); }
    });
    const regen = document.createElement('button');
    regen.className = 'btn secondary';
    regen.textContent = 'Regenerate';
    regen.addEventListener('click', () => { try { onRegenerate && onRegenerate(); } catch(_) {} });
    const cancel = document.createElement('button');
    cancel.className = 'btn ghost';
    cancel.textContent = 'Close';
    cancel.addEventListener('click', () => clearUI());
    header.appendChild(pill);
    actions.appendChild(apply);
    actions.appendChild(regen);
    actions.appendChild(copy);
    actions.appendChild(cancel);
    resultEl.appendChild(close);
    resultEl.appendChild(header);
    resultEl.appendChild(pre);
    resultEl.appendChild(actions);
    shadowRoot.appendChild(resultEl);
    try { resultEl.tabIndex = -1; resultEl.focus(); } catch(_) {}
    // Keyboard shortcuts: Enter=Apply, Esc=Close, Cmd/Ctrl+C=Copy, Cmd/Ctrl+R=Regenerate
    if (resultKeyHandler && shadowRoot) { try { shadowRoot.removeEventListener('keydown', resultKeyHandler, true); } catch(_) {} }
    resultKeyHandler = (e) => {
      try {
        if (!resultEl) return;
        if (e.key === 'Escape') { e.preventDefault(); clearUI(); return; }
        const isMeta = e.metaKey || e.ctrlKey;
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onApply && onApply(); setTimeout(() => clearUI(), 0); return; }
        if (isMeta && e.key.toLowerCase() === 'c') { e.preventDefault(); navigator.clipboard.writeText(text || '').catch(()=>{}); return; }
        if (isMeta && e.key.toLowerCase() === 'r') { e.preventDefault(); onRegenerate && onRegenerate(); return; }
      } catch(_) {}
    };
    try { shadowRoot.addEventListener('keydown', resultKeyHandler, true); } catch(_) {}
  }

  function showWorkingAt(x, y, mode) {
    ensureShadow();
    if (resultEl) resultEl.remove();
    resultEl = document.createElement('div');
    resultEl.className = 'card';
    const vx = Math.min(Math.max(8, Math.round(x)), Math.max(8, window.innerWidth - 380));
    const vy = Math.min(Math.max(8, Math.round(y)), Math.max(8, window.innerHeight - 120));
    resultEl.style.left = `${vx}px`;
    resultEl.style.top = `${vy}px`;
    const header = document.createElement('div');
    header.className = 'header';
    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.textContent = mode ? `Jan • ${labelForMode(mode)}` : 'Jan';
    const row = document.createElement('div');
    row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.gap = '8px';
    const sp = document.createElement('div'); sp.className = 'spinner';
    const txt = document.createElement('span'); txt.className = 'muted'; txt.textContent = 'Working…';
    header.appendChild(pill);
    row.appendChild(sp); row.appendChild(txt);
    resultEl.appendChild(header);
    resultEl.appendChild(row);
    shadowRoot.appendChild(resultEl);
  }

  async function startInline(mode, ctxOverride) {
    let ed = currentEditable();
    if (!inlineEnabled) return;
    // Prefer saved selection context to survive blur
    let ctx = ctxOverride || lastSelCtx;
    if (!ctx || !ctx.ed) {
      if (!ed) return;
      const { text, range } = getSelectionInEditable(ed);
      ctx = { ed, text, range };
    } else {
      ed = ctx.ed;
    }
    const src = String(ctx.text || '').trim();
    if (!src) return;
    const rect = getRectForSelection(ed, ctx);
    const x = rect.left;
    const y = rect.bottom + 6;
    showWorkingAt(x, y, mode);
    lastRun = { mode, ctx, x, y };
    try {
      const payload = { mode, text: src };
      if (mode === 'translate') payload.lang = 'English';
      const resp = await chrome.runtime.sendMessage({ type: 'INLINE_ASSIST_START', payload });
      if (!resp?.ok) {
        resultEl.textContent = resp?.error || 'Error';
        return;
      }
      const out = String(resp.text || '').trim();
      showResultAt(x, y, out, {
        onApply: () => applyReplacement(ed, ctx.range, out),
        onRegenerate: () => { showWorkingAt(x, y, mode); startInline(mode, ctx); },
        mode
      });
    } catch (e) {
      if (resultEl) resultEl.textContent = String(e?.message || e);
    }
  }

  function labelForMode(mode) {
    switch (mode) {
      case 'custom': return 'Custom';
      case 'fix_grammar': return 'Fix grammar';
      case 'shorten': return 'Shorten';
      case 'expand': return 'Expand';
      case 'tone_formal': return 'Formal tone';
      case 'tone_friendly': return 'Friendly tone';
      case 'summarize': return 'Summarize';
      case 'translate': return 'Translate';
      case 'rewrite':
      default: return 'Rewrite';
    }
  }

  function applyReplacement(ed, range, text) {
    try {
      // Resolve target in case original element was detached or changed
      let target = ed;
      if (!target || !document.contains(target)) {
        try {
          if (range && range.commonAncestorContainer) {
            const anc = range.commonAncestorContainer;
            const found = findEditableAncestor(anc);
            if (found) target = found;
          }
        } catch (_) {}
        if (!target || !document.contains(target)) {
          const cur = currentEditable() || document.activeElement;
          if (cur && isEditable(cur)) target = cur;
        }
      }
      if (!target || !isEditable(target)) return;

      if (target.isContentEditable) {
        let did = false;
        let r = range && typeof range.cloneRange === 'function' ? range.cloneRange() : null;
        const sel = window.getSelection();
        if (!r && sel && sel.rangeCount) r = sel.getRangeAt(0).cloneRange();
        // Attempt 1: restore saved range and execCommand/DOM insert
        try {
          if (r && sel) {
            target.focus();
            sel.removeAllRanges();
            sel.addRange(r);
            const ok = document.execCommand && document.execCommand('insertText', false, text);
            if (!ok) {
              r.deleteContents();
              const node = document.createTextNode(text);
              r.insertNode(node);
              const end = document.createRange();
              end.setStart(node, node.textContent.length);
              end.collapse(true);
              sel.removeAllRanges();
              sel.addRange(end);
            }
            did = true;
          }
        } catch (e1) { try { console.debug('[Jan Inline] contenteditable apply attempt1 failed:', e1); } catch(_) {} }
        // Attempt 2: use current selection if inside ed
        if (!did) {
          try {
            const s = window.getSelection();
            if (s && s.rangeCount && target.contains(s.anchorNode)) {
              target.focus();
              const ok2 = document.execCommand && document.execCommand('insertText', false, text);
              if (!ok2) {
                const r2 = s.getRangeAt(0);
                r2.deleteContents();
                r2.insertNode(document.createTextNode(text));
              }
              did = true;
            }
          } catch (e2) { try { console.debug('[Jan Inline] contenteditable apply attempt2 failed:', e2); } catch(_) {} }
        }
        // Attempt 3: last resort append at end
        if (!did) {
          try {
            const node = document.createTextNode(text);
            target.appendChild(node);
            did = true;
          } catch (e3) { try { console.debug('[Jan Inline] contenteditable apply attempt3 failed:', e3); } catch(_) {} }
        }
        // Notify frameworks regardless
        try { target.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true })); } catch (_) { target.dispatchEvent(new Event('input', { bubbles: true })); }
        try { target.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
        target.focus();
      } else if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
        const start = (range && typeof range.start === 'number') ? range.start : (target.selectionStart || 0);
        const end = (range && typeof range.end === 'number') ? range.end : (target.selectionEnd || 0);
        try { target.focus(); } catch (_) {}
        try { target.setSelectionRange(start, end); } catch (_) {}
        let did = false;
        try { target.setRangeText(text, start, end, 'end'); did = true; } catch (_) {}
        if (!did) {
          try {
            const v = String(target.value || '');
            const newVal = v.slice(0, start) + text + v.slice(end);
            // Use native value setter from the element's own window (handles iframes/React)
            const win = target.ownerDocument && target.ownerDocument.defaultView;
            const proto = target.tagName === 'TEXTAREA'
              ? (win ? win.HTMLTextAreaElement.prototype : HTMLTextAreaElement.prototype)
              : (win ? win.HTMLInputElement.prototype : HTMLInputElement.prototype);
            const desc = Object.getOwnPropertyDescriptor(proto, 'value');
            if (desc && typeof desc.set === 'function') desc.set.call(target, newVal); else target.value = newVal;
            // place caret at end
            const pos = (start + text.length);
            try { target.setSelectionRange(pos, pos); } catch (_) {}
            did = true;
          } catch (e4) { try { console.debug('[Jan Inline] input/textarea apply fallback failed:', e4); } catch(_) {} }
        }
        // Notify frameworks (React/Vue controlled inputs)
        try {
          const win = target.ownerDocument && target.ownerDocument.defaultView;
          const InputEvt = (win && win.InputEvent) ? win.InputEvent : InputEvent;
          const Evt = (win && win.Event) ? win.Event : Event;
          target.dispatchEvent(new InputEvt('input', { bubbles: true, cancelable: true, inputType: 'insertReplacementText', data: text }));
          target.dispatchEvent(new Evt('change', { bubbles: true }));
        } catch (_) {
          try { target.dispatchEvent(new Event('input', { bubbles: true })); } catch(_) {}
          try { target.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
        }
        target.focus();
      }
    } catch (_) {}
  }

  function maybeShowTooltip() {
    if (!inlineEnabled) return;
    if (menuEl || resultEl) return; // don't churn position while menu/result is open
    const ed = currentEditable();
    if (!ed) return;
    const sel = getSelectionInEditable(ed);
    if (!sel.text || !sel.text.trim()) { clearUI(); return; }
    // Save selection context to survive blur when opening our UI
    lastSelCtx = { ed, text: sel.text, range: sel.range };
    // Anchor to selection rect
    const rect = getRectForSelection(ed);
    const x = rect.left;
    const y = Math.max(8, rect.top - 32);
    showTooltipAt(x, y);
  }

  // Events
  document.addEventListener('selectionchange', () => {
    if (Date.now() < suppressSelectionChangeUntil) return;
    if (selectionTimer) clearTimeout(selectionTimer);
    selectionTimer = setTimeout(maybeShowTooltip, 100);
  });
  document.addEventListener('keyup', (e) => {
    // For inputs/textarea, selection changes may happen without selectionchange in some cases
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Shift','Meta','Control','Alt'].includes(e.key)) return;
    if (selectionTimer) clearTimeout(selectionTimer);
    selectionTimer = setTimeout(maybeShowTooltip, 100);
  });
  // Native 'select' event fires on inputs/textareas when selection changes via mouse
  document.addEventListener('select', () => {
    if (selectionTimer) clearTimeout(selectionTimer);
    selectionTimer = setTimeout(maybeShowTooltip, 60);
  }, true);
  document.addEventListener('mouseup', (e) => {
    lastPointer = { x: e.clientX || 0, y: e.clientY || 0, t: Date.now() };
    if (selectionTimer) clearTimeout(selectionTimer);
    selectionTimer = setTimeout(maybeShowTooltip, 80);
  }, true);
  window.addEventListener('scroll', () => { clearUI(); }, true);
  document.addEventListener('click', (e) => {
    // Close menus/results if clicking outside our shadow
    const path = e.composedPath ? e.composedPath() : [];
    if (path.includes(shadowHost)) return;
    // Ignore the click that immediately follows selection mouseup
    if (Date.now() - lastPointer.t < 300) return;
    clearUI();
  });

  // Listen for keyboard command-triggered custom prompt
  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type === 'SHOW_CUSTOM_PROMPT') {
        // Anchor near current selection if available; else near last pointer; else center
        let x = Math.round(window.innerWidth / 2 - 200);
        let y = Math.round(window.innerHeight / 2 - 120);
        let ed = currentEditable();
        let ctx = lastSelCtx;
        if ((!ctx || !ctx.ed) && ed) {
          const { text, range } = getSelectionInEditable(ed);
          ctx = { ed, text, range };
        }
        if (ctx && (ctx.text || '').trim()) {
          const rect = getRectForSelection(ctx.ed, ctx);
          x = rect.left; y = rect.bottom + 6;
        } else if (Date.now() - lastPointer.t < 5000) {
          x = lastPointer.x; y = lastPointer.y + 10;
        }
        showCustomPromptAt(x, y);
        sendResponse({ ok: true });
        return true;
      }
    });
  } catch (_) {}
})();
