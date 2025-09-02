// Bun test preloader: provide a DOM and chrome mocks so React tests work
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})

// Global DOM
// @ts-ignore
globalThis.window = dom.window
// @ts-ignore
globalThis.document = dom.window.document
// @ts-ignore
globalThis.navigator = dom.window.navigator
// @ts-ignore
globalThis.HTMLElement = dom.window.HTMLElement
// @ts-ignore
globalThis.CustomEvent = dom.window.CustomEvent
// @ts-ignore
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window)
// requestAnimationFrame shim
// @ts-ignore
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0)
// @ts-ignore
globalThis.cancelAnimationFrame = (id: any) => clearTimeout(id)

// Minimal stubs for observers used by UI libs
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
globalThis.navigator.clipboard = globalThis.navigator.clipboard || { writeText: async () => {} }

// window.open no-op
// @ts-ignore
globalThis.open = globalThis.open || (() => null)

// Chrome API minimal mocks (promise-based)
function makeChromeMock() {
  return {
    runtime: {
      sendMessage: () => Promise.resolve({ ok: true }),
      connect: () => ({ postMessage: () => {}, onMessage: { addListener: () => {}, removeListener: () => {} }, disconnect: () => {} }),
      openOptionsPage: () => {},
      getURL: (p: string) => p,
    },
    storage: {
      sync: { get: () => Promise.resolve({}), set: () => Promise.resolve() },
      local: { get: () => Promise.resolve({ sessions: [], activeSessionId: '' }), set: () => Promise.resolve() },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
    tabs: {
      query: () => Promise.resolve([]),
      get: () => Promise.resolve({ id: 1, status: 'complete', url: 'https://example.com' }),
      create: () => Promise.resolve({}),
      sendMessage: () => Promise.resolve({ ok: true }),
      onActivated: { addListener: () => {}, removeListener: () => {} },
    },
    scripting: { executeScript: () => Promise.resolve() },
  }
}

// @ts-ignore
globalThis.chrome = globalThis.chrome || makeChromeMock()
