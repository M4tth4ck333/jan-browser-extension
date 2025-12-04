// code-mirror-utils.js
// Helpers for detecting and extracting metadata from CodeMirror-based editors

export function isCodeEditorElement(element) {
  if (!element) return false;
  const className = typeof element.className === 'string' ? element.className : '';
  if (className && /(codemirror|cm-editor|cm-content)/i.test(className)) {
    return true;
  }
  try {
    return Boolean(element.closest?.('.CodeMirror, .cm-editor, [data-codemirror]'));
  } catch (_) {
    return false;
  }
}

export function getCodeEditorMeta(element) {
  if (!isCodeEditorElement(element)) return null;

  let root = element;
  try {
    root = element.closest?.('.CodeMirror, .cm-editor, [data-codemirror]') || element;
  } catch (_) {
    // ignore
  }

  const textarea = root?.querySelector?.(
    'textarea[aria-label], textarea[placeholder], textarea[name], textarea[id]',
  );

  const label =
    root?.getAttribute?.('aria-label') ||
    root?.getAttribute?.('data-placeholder') ||
    root?.getAttribute?.('placeholder') ||
    textarea?.getAttribute?.('aria-label') ||
    textarea?.getAttribute?.('placeholder') ||
    textarea?.name ||
    textarea?.id ||
    '';

  const content =
    root?.querySelector?.('.cm-content') ||
    root?.querySelector?.('.CodeMirror-code') ||
    root?.querySelector?.('[contenteditable="true"]');
  const text = (content?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 240);

  return { label, text };
}
