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

 // --- Site-specific extractors ---
 function isGmail() {
   try { return /(^|\.)mail\.google\.com$/i.test(location.hostname); } catch (_) { return false; }
 }

 function extractGmailContent() {
  try {
    const main = document.querySelector('div[role="main"]') || document.body;
    const subject = (document.querySelector('h2.hP')?.innerText || '').trim();
    const pickBodies = (root) => Array.from(root.querySelectorAll('.a3s, div[data-message-id]'))
      .map(n => (n.innerText || '').trim())
      .filter(Boolean);
    const pickHeaders = (root) => Array.from(root.querySelectorAll('.gD, .go')).slice(0, 5)
      .map(n => (n.innerText || '').trim()).filter(Boolean);

    let bodies = pickBodies(main);
    let headerSnippets = pickHeaders(main);

    // If empty, scan same-origin iframes (Gmail sometimes renders in internal frames)
    if ((!bodies || bodies.length === 0)) {
      const frames = Array.from(document.querySelectorAll('iframe'));
      for (const f of frames) {
        try {
          const fd = f.contentDocument || f.contentWindow?.document;
          if (!fd) continue;
          // Same-origin will succeed
          const fb = pickBodies(fd);
          const fh = pickHeaders(fd);
          if (fb && fb.length) bodies = bodies.concat(fb);
          if (fh && fh.length) headerSnippets = headerSnippets.concat(fh.slice(0, 3));
        } catch (_) { /* cross-origin or inaccessible */ }
      }
    }

    // Dedup and join
    const uniq = (arr) => Array.from(new Set((arr || []).map(s => s.trim()).filter(Boolean)));
    const content = [subject, ...uniq(headerSnippets), ...uniq(bodies)].filter(Boolean).join('\n\n---\n\n');
    return { title: subject || (document.title || ''), content };
  } catch (_) {
    return { title: document.title || '', content: getVisibleText() };
  }
}

 function isYouTube() {
   try { return /(^|\.)youtube\.com$|(^|\.)m\.youtube\.com$|(^|\.)youtu\.be$/i.test(location.hostname); } catch (_) { return false; }
 }

 function extractYouTubeContent() {
   try {
     const title =
       (document.querySelector('h1.ytd-watch-metadata')?.innerText || '') ||
       (document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '') ||
       (document.title || '');
     // Prefer opened transcript panel if present
     const segNodes = Array.from(document.querySelectorAll('ytd-transcript-renderer ytd-transcript-segment-renderer'));
     const segments = segNodes.map(n => (n.innerText || '').trim()).filter(Boolean);
     // Fallback to description if no transcript visible
     const description =
       (document.querySelector('#description')?.innerText || '') ||
       (document.querySelector('meta[name="description"]')?.getAttribute('content') || '');
     const transcript = segments.length ? segments.join('\n') : description;
     return { title: title.trim(), content: transcript.trim() };
   } catch (_) {
     return { title: document.title || '', content: getVisibleText() };
   }
 }

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'PING') {
    try { sendResponse({ ok: true, ready: true, url: location.href }); } catch (_) {}
    return true;
  }
  if (message?.type === 'GET_PAGE_CONTENT') {
    // Only the top frame should respond; it will aggregate from same-origin iframes when needed
    if (window.top !== window) { return false; }
    const maxChars = 100000; // safety cap
    let title = document.title || '';
    let content = '';
    if (isGmail()) {
      const g = extractGmailContent();
      title = g.title || title;
      content = g.content || '';
    } else if (isYouTube()) {
      const y = extractYouTubeContent();
      title = y.title || title;
      content = y.content || '';
    } else {
      content = getVisibleText();
    }
    const selection = getSelectionText();

    sendResponse({
      ok: true,
      url: location.href,
      title: String(title || '').slice(0, 500),
      lang: document.documentElement?.lang || '',
      metaDescription: getMetaDescription(),
      content: String(content || '').slice(0, maxChars),
      selection: String(selection || '').slice(0, maxChars / 4)
    });
    return true;
  }

  // (moved autocomplete helpers into IIFE scope below)

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
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doRun(); return; }
      } catch(_) {}
    };
    shadowRoot.addEventListener('keydown', overlayKeyHandler, true);
  }

  // Handle Google SERP readiness check for search flow
  if (message?.type === 'WAIT_FOR_SERP_READY') {
    (async () => {
      try {
        const timeoutMs = Math.max(1000, Number(message?.payload?.timeoutMs || 15000));
        const minResults = Math.max(1, Number(message?.payload?.minResults || 4));
        const start = Date.now();
        const poll = () => {
          const root = document.querySelector('#search') || document.querySelector('[role="main"]') || document.body;
          const h3s = Array.from(root.querySelectorAll('h3')).filter(h => (h.textContent || '').trim().length > 0);
          let good = 0;
          for (const h3 of h3s) {
            let a = h3.closest('a[href]') || h3.parentElement?.querySelector('a[href]');
            if (a && a.href && /^https?:/i.test(a.href)) good++;
          }
          return good;
        };
        let good = poll();
        while (good < minResults && (Date.now() - start) < timeoutMs) {
          await new Promise(r => setTimeout(r, 250));
          good = poll();
        }
        const elapsedMs = Date.now() - start;
        const ready = good >= minResults;
        const reason = ready ? 'enough_results' : 'timeout';
        sendResponse({ ok: true, ready, counts: { good, minResults, elapsedMs }, reason });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }
  
  // Scrape Google SERP results (used after readiness)
  if (message?.type === 'SCRAPE_GOOGLE_SERP') {
    try {
      const debug = !!(message?.payload?.debug ?? message?.debug);
      const q = new URLSearchParams(location.search).get('q') || '';

      const collect = () => {
        const out = [];
        const seen = new Set();
        const root = document.querySelector('#search') || document.querySelector('[role="main"]') || document.body;
        const h3s = Array.from(root.querySelectorAll('h3')).filter(h => (h.textContent || '').trim().length > 0);
        for (const h3 of h3s) {
          let a = h3.closest('a[href]');
          if (!a) {
            const p = h3.parentElement;
            if (p && p.querySelector('a[href]') && p.querySelector('a[href]')?.contains(h3)) {
              a = p.querySelector('a[href]');
            }
          }
          if (!a) continue;
          const href = a.href;
          if (!href || seen.has(href)) continue;
          const container = h3.closest('div.g, div.MjjYud, div[data-sokoban-container], div.yuRUbf, div[jscontroller]')
            || a.closest('div.g, div.MjjYud, div[data-sokoban-container], div[jscontroller]')
            || h3.parentElement?.parentElement
            || null;
          const snippetEl = container?.querySelector('.VwiC3b, .yXK7lf, .MUxGbd, .UroMUd, .lyLwlc, .kno-rdesc, [data-content-feature="1"]');
          const title = (h3.textContent || '').trim();
          const snippet = (snippetEl?.innerText || '').trim();
          const snippetHtml = (snippetEl?.innerHTML || '').trim();
          const html = container ? container.outerHTML : '';
          out.push({ title, url: href, snippet, snippetHtml, html });
          seen.add(href);
          if (out.length >= 8) break;
        }
        return out;
      };

      let results = collect();
      if (!results.length) {
        setTimeout(() => {
          try {
            let results2 = collect().slice(0, 5);
            const answerBoxCandidates = [
              '#kp-wp-tab-overview',
              'div[data-attrid="wa:/description"]',
              'div[data-attrid^="kc:/"]',
              'div[data-tts]',
              '#search .kp-blk',
              '#search [role="complementary"]'
            ];
            let answerBox2 = '';
            let answerBoxHtml2 = '';
            for (const sel of answerBoxCandidates) {
              const el = document.querySelector(sel);
              if (el && (el.innerText || '').trim()) {
                answerBox2 = el.innerText.trim();
                try { answerBoxHtml2 = el.outerHTML; } catch (_) { answerBoxHtml2 = ''; }
                break;
              }
            }
            if (debug) {
              const pageHtml = String(document.documentElement?.outerHTML || '').slice(0, 120000);
              const allLinks = Array.from(document.querySelectorAll('a[href]')).slice(0, 500).map(a => ({ href: a.href, text: (a.textContent || '').trim().slice(0, 200) }));
              const fallbackOrganic = Array.from(document.querySelectorAll('#search a[href] h3')).map(h3 => { const a = h3.closest('a[href]'); return a ? { title: (h3.textContent || '').trim(), url: a.href } : null; }).filter(Boolean).slice(0, 10);
              sendResponse({ ok: true, query: q, pageTitle: document.title || '', answerBox: answerBox2, answerBoxHtml: answerBoxHtml2, results: results2, debug: { pageHtml, allLinks, fallbackOrganic } });
            } else {
              sendResponse({ ok: true, query: q, pageTitle: document.title || '', answerBox: answerBox2, answerBoxHtml: answerBoxHtml2, results: results2 });
            }
          } catch (err) {
            sendResponse({ ok: false, error: String(err?.message || err) });
          }
        }, 600);
        return true;
      }

      results = results.slice(0, 5);
      const answerBoxCandidates = [
        '#kp-wp-tab-overview',
        'div[data-attrid="wa:/description"]',
        'div[data-attrid^="kc:/"]',
        'div[data-tts]',
        '#search .kp-blk',
        '#search [role="complementary"]'
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
      if (debug) {
        const pageHtml = String(document.documentElement?.outerHTML || '').slice(0, 120000);
        const allLinks = Array.from(document.querySelectorAll('a[href]')).slice(0, 500).map(a => ({ href: a.href, text: (a.textContent || '').trim().slice(0, 200) }));
        const fallbackOrganic = Array.from(document.querySelectorAll('#search a[href] h3')).map(h3 => { const a = h3.closest('a[href]'); return a ? { title: (h3.textContent || '').trim(), url: a.href } : null; }).filter(Boolean).slice(0, 10);
        sendResponse({ ok: true, query: q, pageTitle: document.title || '', answerBox, answerBoxHtml, results, debug: { pageHtml, allLinks, fallbackOrganic } });
      } else {
        sendResponse({ ok: true, query: q, pageTitle: document.title || '', answerBox, answerBoxHtml, results });
      }
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
  // Restrict to only the simplified set
  const ALLOWED_SET = ['rewrite','translate','custom'];
  let allowedActions = ['rewrite','translate','custom'];

  // Load initial settings
  try {
    chrome.storage.sync.get(['inlineAssistEnabled','inlineAssistActions'], (s) => {
      if (typeof s.inlineAssistEnabled === 'boolean') inlineEnabled = s.inlineAssistEnabled;
      if (Array.isArray(s.inlineAssistActions) && s.inlineAssistActions.length) {
        const next = s.inlineAssistActions.filter(id => ALLOWED_SET.includes(id));
        if (next.length) {
          const set = new Set(next);
          set.add('custom');
          allowedActions = Array.from(set);
        }
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
        if (Array.isArray(v) && v.length) {
          const next = v.filter(id => ALLOWED_SET.includes(id));
          if (next.length) {
            const set = new Set(next);
            set.add('custom');
            allowedActions = Array.from(set);
          }
        }
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
  // Autocomplete (Copilot-style)
  let acEnabled = false;
  let acIndicatorEl = null;
  let acGhostEl = null;
  let acTimer = null;
  let acNonce = 0; // increments per request
  let acPendingNonce = 0; // last fired request id

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
      .tip{ position: fixed; display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border-radius:999px; background: rgba(255,255,255,.98); color:#0b1220; font: 12px/1.2 system-ui,-apple-system,Segoe UI,Roboto; border: 1px solid rgba(0,0,0,.06); box-shadow: 0 10px 30px rgba(0,0,0,.15); backdrop-filter: saturate(140%) blur(6px); animation: jan-fade-in .12s ease-out; }
      .tip button{ background: transparent; color: inherit; border: none; cursor: pointer; font: inherit; padding: 2px 8px; border-radius:999px; }
      .tip button:hover{ background: rgba(2,6,23,.06) }
      .menu{ position: fixed; margin-top:6px; padding:6px; background: rgba(255,255,255,.98); color:#0b1220; border-radius:12px; border:1px solid rgba(0,0,0,.06); box-shadow: 0 18px 48px rgba(0,0,0,.2); min-width: 180px; animation: jan-fade-in .12s ease-out; }
      .menu .item{ display:block; padding:8px 10px; border-radius:8px; cursor:pointer; }
      .menu .item:hover{ background: rgba(2,6,23,.06) }
      .card{ position: fixed; max-width: 420px; padding:12px 12px 10px; background: rgba(255,255,255,.98); color:#0b1220; border-radius:14px; border:1px solid rgba(0,0,0,.06); box-shadow: 0 22px 60px rgba(0,0,0,.25); font: 13px/1.35 system-ui,-apple-system,Segoe UI,Roboto; animation: jan-fade-in .12s ease-out; }
      .card .header{ display:flex; align-items:center; gap:8px; margin-bottom:8px; }
      .pill{ display:inline-flex; align-items:center; gap:6px; font-size:11px; color:#334155; background: rgba(2,6,23,.04); border:1px solid rgba(2,6,23,.06); padding:3px 8px; border-radius:999px; }
      .spinner{ width:14px; height:14px; border:2px solid rgba(2,6,23,.15); border-top-color:#0b1220; border-radius:50%; animation: jan-spin .8s linear infinite; }
      .card .actions{ display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
      .btn{ background:#2563eb; color:white; border:none; padding:6px 10px; border-radius:8px; cursor:pointer; font: inherit; box-shadow: 0 6px 18px rgba(37,99,235,.25) }
      .btn.secondary{ background:#e5e7eb; color:#111827 }
      .btn.ghost{ background:transparent; color:#334155; }
      .btn:focus{ outline:2px solid rgba(37,99,235,.6); outline-offset:2px }
      .muted{ color:#475569 }
      .close{ position:absolute; top:8px; right:8px; background:transparent; border:1px solid transparent; color:#64748b; cursor:pointer; border-radius:8px; padding:2px 6px }
      .close:hover{ background: rgba(2,6,23,.06) }
      .pre{ white-space:pre-wrap; word-wrap:break-word; max-height: 240px; overflow:auto; }
      .overlay{ position: fixed; width: 420px; max-width: calc(100vw - 16px); padding:12px; background: rgba(255,255,255,.98); color:#0b1220; border-radius:14px; border:1px solid rgba(0,0,0,.06); box-shadow: 0 22px 60px rgba(0,0,0,.25); font: 13px/1.35 system-ui,-apple-system,Segoe UI,Roboto; animation: jan-fade-in .12s ease-out; }
      .overlay .header{ display:flex; align-items:center; gap:8px; margin-bottom:8px; }
      .overlay textarea{ width:100%; box-sizing:border-box; min-height: 96px; max-height: 240px; resize: vertical; padding:8px 10px; border-radius:10px; border:1px solid rgba(2,6,23,.08); background: rgba(2,6,23,.04); color: inherit; font: inherit; }
      .overlay .actions{ display:flex; gap:8px; margin-top:10px; justify-content:flex-end; }
      .overlay .hint{ font-size:12px; color:#475569; margin-top:6px; }
    `;
    shadowRoot.appendChild(style);
    // While interacting with our UI, ignore selectionchange-triggered hides
    const suppress = () => { suppressSelectionChangeUntil = Date.now() + 2000 }
    shadowRoot.addEventListener('pointerdown', suppress, true);
    shadowRoot.addEventListener('mousedown', suppress, true);
    shadowRoot.addEventListener('click', suppress, true);
  }

  function ensureAcStyles() {
    ensureShadow();
    if (!shadowRoot) return;
    if (shadowRoot.querySelector('style[data-jan-ac]')) return;
    const st = document.createElement('style');
    st.setAttribute('data-jan-ac', '');
    st.textContent = `
      .ac-indicator{ position: fixed; right: 10px; bottom: 10px; padding: 6px 10px; border-radius: 999px; font: 12px/1.2 system-ui,-apple-system,Segoe UI,Roboto; background: rgba(255,255,255,.98); color:#0b1220; border: 1px solid rgba(0,0,0,.06); box-shadow: 0 10px 30px rgba(0,0,0,.2) }
      .ac-ghost{ position: fixed; pointer-events: none; color: #9ca3af; background: transparent; white-space: pre; font: 13px/1.35 system-ui,-apple-system,Segoe UI,Roboto; opacity: .85; text-shadow: 0 0 0 rgba(0,0,0,0.01) }
    `;
    shadowRoot.appendChild(st);
  }

  // --- Autocomplete helpers (IIFE scope) ---
  function hideGhost() {
    if (acGhostEl) { try { acGhostEl.remove(); } catch(_) {} acGhostEl = null; }
  }

  function showGhostAt(rect, text) {
    ensureAcStyles();
    hideGhost();
    acGhostEl = document.createElement('div');
    acGhostEl.className = 'ac-ghost';
    acGhostEl.textContent = text || '';
    const x = Math.max(8, Math.round((rect?.right ?? rect?.left ?? 16) + 1));
    const y = Math.max(8, Math.round((rect?.top ?? 16) + 2));
    acGhostEl.style.left = `${x}px`;
    acGhostEl.style.top = `${y}px`;
    shadowRoot.appendChild(acGhostEl);
  }

  function updateIndicator() {
    ensureAcStyles();
    if (!acEnabled) { if (acIndicatorEl) { acIndicatorEl.remove(); acIndicatorEl = null; } return; }
    if (!acIndicatorEl) {
      acIndicatorEl = document.createElement('div');
      acIndicatorEl.className = 'ac-indicator';
      acIndicatorEl.textContent = 'Jan Autocomplete: On (Tab accept, Esc dismiss)';
      shadowRoot.appendChild(acIndicatorEl);
    }
  }

  function setAutocompleteEnabled(next) {
    acEnabled = !!next;
    if (!acEnabled) { hideGhost(); }
    updateIndicator();
    if (acEnabled) scheduleAutocomplete();
  }

  function getPrefixSuffix(ed) {
    try {
      if (!ed) return { prefix: '', suffix: '' };
      if (ed.isContentEditable) {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return { prefix: '', suffix: '' };
        const caret = sel.getRangeAt(0);
        const all = document.createRange();
        all.selectNodeContents(ed);
        const pre = all.cloneRange(); pre.setEnd(caret.endContainer, caret.endOffset);
        const post = all.cloneRange(); post.setStart(caret.endContainer, caret.endOffset);
        const prefix = String(pre.toString() || '');
        const suffix = String(post.toString() || '');
        return { prefix, suffix };
      } else {
        const t = (ed.tagName || '').toLowerCase();
        if (t === 'textarea' || t === 'input') {
          const v = String(ed.value || '');
          const s = ed.selectionStart || 0;
          const e = ed.selectionEnd || 0;
          return { prefix: v.slice(0, s), suffix: v.slice(e) };
        }
      }
    } catch (_) {}
    return { prefix: '', suffix: '' };
  }

  function scheduleAutocomplete() {
    if (!acEnabled) return;
    if (acTimer) clearTimeout(acTimer);
    acTimer = setTimeout(runAutocomplete, 120);
  }

  async function runAutocomplete() {
    try {
      if (!acEnabled) return hideGhost();
      const ed = currentEditable();
      if (!ed) { hideGhost(); return; }
      const ctx = getSelectionInEditable(ed);
      if (ctx && ctx.text && ctx.text.length > 0) { hideGhost(); return; }
      if ((ed.tagName || '').toLowerCase() === 'input' && (ed.type || '').toLowerCase() === 'password') { hideGhost(); return; }
      const { prefix, suffix } = getPrefixSuffix(ed);
      const pref = String(prefix || '').slice(-1000);
      const suff = String(suffix || '').slice(0, 300);
      if (!pref || /\s$/.test(pref) === false && pref.length < 3) { hideGhost(); return; }
      const myNonce = ++acNonce; acPendingNonce = myNonce;
      const lang = document.documentElement?.lang || '';
      let resp = null;
      try {
        resp = await chrome.runtime.sendMessage({ type: 'AUTOCOMPLETE_SUGGEST', payload: { prefix: pref, suffix: suff, lang } });
      } catch (_) { resp = null; }
      if (acPendingNonce !== myNonce) return; // stale
      const text = String(resp?.text || '').trim();
      if (!resp?.ok || !text) { hideGhost(); return; }
      const rect = getRectForSelection(ed, ctx || { ed, range: null });
      showGhostAt(rect, text);
    } catch (_) { hideGhost(); }
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
      { id: 'translate', label: 'Translate → English' },
      { id: 'custom', label: 'Custom Prompt…' }
    ].filter(i => allowedActions.includes(i.id));
    for (const it of items) {
      const el = document.createElement('div');
      el.className = 'item';
      el.textContent = it.label;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        menuEl?.remove();
        menuEl = null;
        if (it.id === 'custom') {
          try {
            let ed = currentEditable();
            let ctx = lastSelCtx;
            if (!ctx || !ctx.ed) {
              if (ed) {
                const s = getSelectionInEditable(ed);
                ctx = { ed, ...s };
              }
            }
            const rect = ed ? getRectForSelection(ed, ctx) : menuEl?.getBoundingClientRect() || { left: 20, bottom: 20 };
            const rx = rect.left; const ry = rect.bottom + 6;
            showCustomPromptAt(rx, ry);
          } catch (_) {
            // Fallback: center-ish
            showCustomPromptAt(32, 48);
          }
        } else {
          startInline(it.id);
        }
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
      case 'rewrite': return 'Rewrite';
      case 'translate': return 'Translate';
      default: return 'Jan';
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

  // Debounced selection forwarding to background -> side panel
  let selUpdateTimer = null;
  let lastSelSent = null;
  function scheduleSelectionForward() {
    try { if (selUpdateTimer) clearTimeout(selUpdateTimer); } catch (_) {}
    selUpdateTimer = setTimeout(() => {
      try {
        const sel = (getSelectionText() || '').slice(0, 4000);
        if (sel === lastSelSent) return;
        lastSelSent = sel;
        try {
          chrome.runtime.sendMessage({ type: 'SELECTION_UPDATED', payload: { selection: sel, url: location.href, title: document.title || '' } }).catch(() => {});
        } catch (_) {}
      } catch (_) {}
    }, 250);
  }

  // Events
  document.addEventListener('selectionchange', () => {
    if (Date.now() < suppressSelectionChangeUntil) return;
    if (selectionTimer) clearTimeout(selectionTimer);
    selectionTimer = setTimeout(maybeShowTooltip, 100);
    // Forward selection to side panel via background (debounced)
    scheduleSelectionForward();
    // Autocomplete: reposition or hide ghost if caret moved
    if (acEnabled) {
      if (acGhostEl) scheduleAutocomplete();
    } else {
      hideGhost();
    }
  });
  document.addEventListener('keyup', (e) => {
    // For inputs/textarea, selection changes may happen without selectionchange in some cases
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Shift','Meta','Control','Alt'].includes(e.key)) return;
    if (selectionTimer) clearTimeout(selectionTimer);
    selectionTimer = setTimeout(maybeShowTooltip, 100);
    scheduleSelectionForward();
    if (acEnabled) scheduleAutocomplete();
  });
  // Native 'select' event fires on inputs/textareas when selection changes via mouse
  document.addEventListener('select', () => {
    if (selectionTimer) clearTimeout(selectionTimer);
    selectionTimer = setTimeout(maybeShowTooltip, 60);
    scheduleSelectionForward();
  }, true);
  document.addEventListener('mouseup', (e) => {
    lastPointer = { x: e.clientX || 0, y: e.clientY || 0, t: Date.now() };
    if (selectionTimer) clearTimeout(selectionTimer);
    selectionTimer = setTimeout(maybeShowTooltip, 80);
    scheduleSelectionForward();
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

  // Autocomplete event hooks
  document.addEventListener('input', () => { if (acEnabled) scheduleAutocomplete(); }, true);
  document.addEventListener('keydown', (e) => {
    if (!acEnabled) return;
    const k = e.key;
    if (k === 'Tab' && acGhostEl) {
      e.preventDefault();
      const ed = currentEditable();
      if (!ed) { hideGhost(); return; }
      const ctx = getSelectionInEditable(ed);
      const rect = getRectForSelection(ed, ctx);
      const text = acGhostEl?.textContent || '';
      if (text) applyReplacement(ed, ctx?.range || null, text);
      hideGhost();
      // Schedule a follow-up suggestion after insertion
      setTimeout(scheduleAutocomplete, 50);
      return;
    }
    if (k === 'Escape' && acGhostEl) { e.preventDefault(); hideGhost(); return; }
    // For most typing/navigation keys, hide current ghost to avoid visual mismatch; new one will appear after input
    if (acGhostEl && (k.length === 1 || ['Backspace','Delete','Enter'].includes(k))) hideGhost();
  }, true);

  // In-page fallback hotkeys to toggle autocomplete
  document.addEventListener('keydown', (e) => {
    try {
      const key = String(e.key || '').toLowerCase();
      const altK = e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && key === 'k';
      const modShiftK = (e.metaKey || e.ctrlKey) && e.shiftKey && key === 'k';
      if (altK || modShiftK) {
        e.preventDefault();
        setAutocompleteEnabled(!acEnabled);
      }
    } catch(_) {}
  }, true);

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
      } else if (message?.type === 'TOGGLE_AUTOCOMPLETE') {
        setAutocompleteEnabled(!acEnabled);
        sendResponse({ ok: true, enabled: acEnabled });
        return true;
      }
    });
  } catch (_) {}
})();
