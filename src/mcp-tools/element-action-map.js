export const ELEMENT_ACTION_CAPABILITIES = {
  click: {
    tagNames: ['A', 'BUTTON', 'SUMMARY', 'LABEL', 'INPUT', 'SELECT', 'TEXTAREA', 'OPTION'],
    inputTypes: ['button', 'submit', 'reset', 'checkbox', 'radio', 'image', 'file'],
    roles: ['button', 'link', 'menuitem', 'tab', 'option', 'checkbox', 'radio', 'switch', 'treeitem'],
    attributeHints: ['onclick', 'aria-pressed', 'data-action', 'data-testid', 'data-command', 'data-click'],
    nestedSelectors: [
      'button',
      'a[href]',
      'input[type="button"]',
      'input[type="submit"]',
      'input[type="reset"]',
      'input[type="checkbox"]',
      'input[type="radio"]',
      '[role="button"]',
      '[role="link"]',
      '[role="menuitem"]',
      '[role="tab"]',
      '[role="option"]'
    ],
    pointerCursor: true,
    frameworkDetection: true
  },
  type: {
    tagNames: ['INPUT', 'TEXTAREA'],
    inputTypes: [
      'text',
      'email',
      'search',
      'password',
      'number',
      'url',
      'tel',
      'date',
      'datetime-local',
      'time',
      'month',
      'week'
    ],
    roles: ['textbox', 'combobox', 'searchbox', 'spinbutton'],
    classHints: [
      'ql-editor',
      'public-DraftEditor-content',
      'ProseMirror',
      'notion-page-content',
      'mce-content-body',
      'tox-edit-area',
      'DraftEditor-root',
      'editable',
      'editor',
      'notranslate'
    ],
    attributeHints: ['contenteditable', 'data-slate-editor', 'data-gramm'],
    nestedSelectors: [
      'input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]):not([type=file])',
      'textarea',
      '[contenteditable="true"]',
      '[role="textbox"]',
      '[role="combobox"]',
      '[role="searchbox"]',
      '.ql-editor',
      '.public-DraftEditor-content',
      '.ProseMirror',
      '.notion-page-content',
      '.mce-content-body',
      '.tox-edit-area',
      '.DraftEditor-editorContainer',
      '.DraftEditor-root',
      '.editor',
      '.editable',
      '.notranslate'
    ],
    allowContentEditable: true
  }
};
