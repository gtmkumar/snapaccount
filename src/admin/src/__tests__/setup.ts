// Global test setup — runs before every test file.
// Imports @testing-library/jest-dom to extend Vitest's expect
// with DOM matchers like toBeInTheDocument, toHaveTextContent, etc.
import '@testing-library/jest-dom'

// jsdom does not implement scrollIntoView — stub it to prevent unhandled
// "not a function" exceptions from async scrollToBottom timers in chat pages.
window.HTMLElement.prototype.scrollIntoView = function () {}

// jsdom does not implement ResizeObserver — stub it so recharts / ResponsiveContainer
// does not throw when it tries to observe element sizes in tests.
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// Stub global fetch for relative URLs (e.g. ErrorBoundary /clientErrors fire-and-forget).
// Real API calls go through the axios mock in individual test files; this only handles
// bare relative-path fetches that would otherwise produce "Invalid URL" unhandled rejections.
const _originalFetch = globalThis.fetch
globalThis.fetch = function stubbedFetch(input, init) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : String(input)
  if (url.startsWith('/')) {
    // Silently swallow relative-URL fire-and-forget calls (e.g. /clientErrors)
    return Promise.resolve(new Response(null, { status: 204 }))
  }
  return _originalFetch.call(this, input, init)
}
