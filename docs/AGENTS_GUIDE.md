# Jan Extension — Agents Guide

What powers the Jan Extension under the hood: agents, message flow, and how to extend it.

## Goals

- Unify page summarization, inline writing assist, and quick web search.
- Support any OpenAI-compatible API (Jan Server/local, Cerebras, OpenAI, etc.).
- Keep UX fast and predictable across content script, background, and side panel.

## Mental Model

- Background (service worker): the router/orchestrator. Hosts agents and tools.
- Content script: runs in the page. Extracts text, shows inline tooltip UI, DOM ops.
- Side panel UI: the app surface. Shows sessions, chat composer, and streaming output.

These talk over a long‑lived port so streaming is smooth and cancellable.
