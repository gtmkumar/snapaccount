// Global test setup — runs before every test file.
// Imports @testing-library/jest-dom to extend Vitest's expect
// with DOM matchers like toBeInTheDocument, toHaveTextContent, etc.
import '@testing-library/jest-dom'

// jsdom does not implement scrollIntoView — stub it to prevent unhandled
// "not a function" exceptions from async scrollToBottom timers in chat pages.
window.HTMLElement.prototype.scrollIntoView = function () {}
