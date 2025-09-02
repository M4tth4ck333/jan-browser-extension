// Vitest + RTL setup
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Basic DOM stubs
class ResizeObserver { observe() {} unobserve() {} disconnect() {} }
// @ts-ignore
globalThis.ResizeObserver = globalThis.ResizeObserver || ResizeObserver
class IntersectionObserver { constructor(_: any) {} observe() {} unobserve() {} disconnect() {} }
// @ts-ignore
globalThis.IntersectionObserver = globalThis.IntersectionObserver || IntersectionObserver

// createRange stub
// @ts-ignore
if (!globalThis.document.createRange) {
  // @ts-ignore
  globalThis.document.createRange = () => ({ setStart: () => {}, setEnd: () => {}, commonAncestorContainer: document.createElement('div') } as any)
}

// navigator.clipboard minimal
// @ts-ignore
globalThis.navigator = globalThis.navigator || ({} as any)
// @ts-ignore
globalThis.navigator.clipboard = globalThis.navigator.clipboard || { writeText: async () => {} }

// window.open no-op
// @ts-ignore
globalThis.open = globalThis.open || (() => null)

// Chrome API minimal mocks (promise-based)
// @ts-ignore
const makeChromeMock = () => ({
  runtime: {
    sendMessage: vi.fn().mockResolvedValue({ ok: true }),
    connect: vi.fn().mockReturnValue({ postMessage: vi.fn(), onMessage: { addListener: vi.fn(), removeListener: vi.fn() }, disconnect: vi.fn() }),
    openOptionsPage: vi.fn(),
    getURL: vi.fn((p: string) => p),
  },
  storage: {
    sync: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(void 0) },
    local: { get: vi.fn().mockResolvedValue({ sessions: [], activeSessionId: '' }), set: vi.fn().mockResolvedValue(void 0) },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  tabs: {
    query: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue({ id: 1, status: 'complete', url: 'https://example.com' }),
    create: vi.fn().mockResolvedValue({}),
    sendMessage: vi.fn().mockResolvedValue({ ok: true }),
    onActivated: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  scripting: { executeScript: vi.fn().mockResolvedValue(void 0) },
})

// @ts-ignore
globalThis.chrome = globalThis.chrome || makeChromeMock()

// Mock animation lib
vi.mock('motion', () => ({ animate: () => ({ cancel: () => {} }) }))

// Mock CSS-only import to avoid node/css errors
vi.mock('highlight.js/styles/github.min.css', () => ({}), { virtual: true })

// Keep Streamdown basic: render children so we can assert it's used without heavy deps
import React from 'react'
vi.mock('streamdown', () => ({
  Streamdown: ({ children }: any) => React.createElement('div', { 'data-testid': 'streamdown-output' }, children),
}))
