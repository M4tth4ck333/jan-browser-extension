// prompts.js
// Prompt builders for various features

import { MAX_SUMMARY_CHARS, InlineAssistModes } from './constants.js';
import { getSettings } from './settings.js';
import { chatCompletions } from './settings.js';

/**
 * Builds messages for inline assist (rewrite/translate)
 * @param {object} params - Parameters
 * @param {string} params.mode - Mode (rewrite or translate)
 * @param {string} params.text - Text to process
 * @param {string} params.lang - Target language (for translate mode)
 * @returns {{system: string, user: string}} System and user messages
 */
export function buildInlineAssistMessages({ mode, text, lang }) {
  const m = String(mode || InlineAssistModes.REWRITE);
  // Target language only used for translate; otherwise keep input language
  const targetLang = (m === InlineAssistModes.TRANSLATE) ? (lang ? String(lang) : 'English') : null;

  const system = [
    'You are an inline writing assistant that edits short snippets.',
    '- Preserve original meaning and key details; do not add new facts.',
    '- Preserve existing formatting (Markdown/HTML), line breaks, mentions, emojis, URLs, and code fences.',
    '- Keep proper nouns, product names, variables, and commands unchanged unless clearly incorrect.',
    '- Prefer active voice, simple words, and clear structure.',
    '- Output in the SAME LANGUAGE as the input unless the task is Translate. For Translate, output only in the target language.',
    '- Return ONLY the revised text. Do not wrap in quotes, do not add explanations, prefixes, or code blocks.'
  ].join('\n');

  let instruction = '';
  switch (m) {
    case InlineAssistModes.TRANSLATE:
      instruction = `Translate into ${targetLang}. Preserve names, brand terms, code, emojis, URLs, and formatting; no notes or brackets.`;
      break;
    case InlineAssistModes.REWRITE:
    default:
      instruction = [
        'Improve clarity and flow; tighten phrasing; prefer active voice; remove hedging; keep meaning.',
        'Retain formatting and structure.'
      ].join(' ');
      break;
  }

  const user = [
    instruction,
    '',
    'Text:',
    text,
  ].join('\n');

  return { system, user };
}

/**
 * Handles page summarization
 * @param {object} payload - Summarization parameters
 * @param {string} payload.content - Page content
 * @param {string} payload.url - Page URL
 * @param {string} payload.title - Page title
 * @param {string} payload.lang - Page language
 * @param {string} payload.selection - Selected text
 * @param {string} payload.metaDescription - Meta description
 * @returns {Promise<{ok: boolean, summary?: string, error?: string}>}
 */
export async function handleSummarize(payload) {
  try {
    const { content, url, title, lang, selection, metaDescription } = payload || {};
    if (!content && !selection) {
      return { ok: false, error: 'No content to summarize.' };
    }

    const {
      apiBase,
      apiKey,
      useApiKey,
      model,
      temperature,
      provider,
      useCustomCompletionsUrl,
      customCompletionsUrl
    } = await getSettings();

    if (!apiBase) return { ok: false, error: 'Missing API Base URL. Set it in Options.' };
    if (useApiKey && !apiKey) return { ok: false, error: 'Missing API Key. Enable or provide one in Options.' };
    if (!model) return { ok: false, error: 'Missing Model. Set it in Options.' };

    const bodyText = (selection?.trim() || content?.trim() || '').slice(0, MAX_SUMMARY_CHARS);

    const system = `You are an expert assistant that summarizes web pages concisely and accurately.
- Write clear, skimmable Markdown with headings and short bullets.
- Preserve key facts, numbers, and names.
- If the page language is not English, write the summary in English and note the original language.
- If provided, use the page title and URL contextually, but do not fabricate citations.
- Prefer actionability: include actionable steps when applicable.
- Keep it under 250 words unless the user selection is highly technical.`;

    const userPrompt = [
      title ? `Title: ${title}` : null,
      url ? `URL: ${url}` : null,
      lang ? `Detected Language: ${lang}` : null,
      metaDescription ? `Meta: ${metaDescription}` : null,
      '',
      'Content:',
      bodyText
    ].filter(Boolean).join('\n');

    const messages = [
      { role: 'system', content: system },
      {
        role: 'user',
        content: `Summarize with sections: \n\n# TL;DR (1 line)\n# Key Points\n# Actions (if any)\n# Notable Quotes (optional)\n# Glossary (only if necessary)\n\nThen analyze potential biases or missing perspectives in 1-2 bullets.\n\n${userPrompt}`
      }
    ];

    const response = await chatCompletions({
      apiBase,
      apiKey,
      useApiKey,
      model,
      temperature,
      messages,
      provider,
      useCustomCompletionsUrl,
      customCompletionsUrl
    });

    if (!response.ok) return response;

    return {
      ok: true,
      summary: response.data?.choices?.[0]?.message?.content || response.data?.choices?.[0]?.text || '(no content)'
    };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}
