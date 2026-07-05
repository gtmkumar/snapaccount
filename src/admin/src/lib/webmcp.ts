/**
 * WebMCP (Model Context tools for the web) integration.
 *
 * WebMCP lets a page expose structured, JSON-Schema-described tools that a
 * browser-embedded AI agent can discover and invoke — the page-side inverse of
 * driving the UI by pixels. It is an experimental Chrome capability
 * (origin trial from Chrome 149; enable `chrome://flags/#enable-webmcp-testing`
 * for local development).
 *
 * The API surface moved between Chrome versions:
 *   - Chrome 149:  `navigator.modelContext`
 *   - Chrome 150+: `document.modelContext`  (`navigator.modelContext` deprecated)
 * `getModelContext()` returns whichever exists, or `null` when unsupported, so
 * every caller degrades to a no-op on browsers without the API.
 *
 * Observed gotcha (consumer side, not this file): an agent invokes a tool with
 * `executeTool(tool, args)` where `args` is a JSON *string*; the browser parses
 * it and passes the tool's `execute()` a plain object. Registration below is
 * unaffected — `execute` always receives the parsed input object.
 */

/** A single tool a page exposes to WebMCP agents. */
export interface WebMcpToolDescriptor {
  name: string
  description: string
  /** JSON Schema describing the tool's input object. */
  inputSchema: Record<string, unknown>
  /** Receives the parsed input; returns a short string result for the agent. */
  execute: (input: Record<string, unknown>) => string | Promise<string>
}

interface RegisterOptions {
  /** Aborting the signal unregisters the tool. */
  signal?: AbortSignal
}

/** Minimal shape of the experimental ModelContext object (absent from lib.dom). */
interface ModelContext {
  registerTool: (descriptor: WebMcpToolDescriptor, options?: RegisterOptions) => void | Promise<void>
  getTools: () => Promise<unknown[]>
  executeTool: (tool: unknown, args: string) => Promise<string>
}

declare global {
  // These experimental members are not yet in the standard lib typings.
  interface Navigator {
    modelContext?: ModelContext
  }
  interface Document {
    modelContext?: ModelContext
  }
}

/** Returns the active ModelContext, or null when the browser doesn't support WebMCP. */
export function getModelContext(): ModelContext | null {
  if (typeof document !== 'undefined' && document.modelContext) {
    return document.modelContext
  }
  if (typeof navigator !== 'undefined' && navigator.modelContext) {
    return navigator.modelContext
  }
  return null
}

/** True when the current browser exposes the WebMCP Model Context API. */
export function isWebMcpSupported(): boolean {
  return getModelContext() !== null
}

/**
 * Register a batch of tools and return a cleanup function that unregisters them.
 * A single AbortController backs the whole batch, so one `abort()` on unmount
 * tears every tool down (registerTool honours the `{ signal }` option). A failed
 * registration (duplicate name, unsupported shape) is logged and skipped rather
 * than allowed to break the host app.
 */
export function registerWebMcpTools(descriptors: WebMcpToolDescriptor[]): () => void {
  const mc = getModelContext()
  if (!mc) {
    return () => {}
  }
  const controller = new AbortController()
  for (const descriptor of descriptors) {
    try {
      void mc.registerTool(descriptor, { signal: controller.signal })
    } catch (error) {
      console.warn(`[webmcp] failed to register tool "${descriptor.name}"`, error)
    }
  }
  return () => {
    controller.abort()
  }
}
