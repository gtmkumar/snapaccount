import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { setLocale } from '@/i18n'
import { useAuth } from '@/hooks/useAuth'
import { useCommandPalette } from '@/contexts/CommandPaletteContext'
import { registerWebMcpTools, type WebMcpToolDescriptor } from '@/lib/webmcp'

// Opt-in dev flag — WebMCP tool registration only runs when explicitly enabled.
const WEBMCP_ENABLED = import.meta.env.VITE_WEBMCP === 'true'

interface WebMcpActions {
  navigate: (path: string) => void
  signOut: () => Promise<void>
  openSearch: () => void
}

/**
 * Registers SnapAccount's WebMCP tools for as long as the component is mounted.
 * No-ops entirely when the VITE_WEBMCP flag is off or the browser lacks the
 * Model Context API. Tools are registered once on mount; their handlers read the
 * latest app actions through a ref so re-renders never re-register (which would
 * otherwise thrash on every command-palette open/close).
 */
export function useWebMcpTools(): void {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const commandPalette = useCommandPalette()

  const actionsRef = useRef<WebMcpActions>({
    navigate: (path) => navigate(path),
    signOut,
    openSearch: commandPalette.open,
  })
  actionsRef.current = {
    navigate: (path) => navigate(path),
    signOut,
    openSearch: commandPalette.open,
  }

  useEffect(() => {
    if (!WEBMCP_ENABLED) {
      return
    }

    const tools: WebMcpToolDescriptor[] = [
      {
        name: 'snapaccount_navigate',
        description:
          'Navigate the admin app to an in-app route. Common routes: /dashboard, /documents, ' +
          '/gst, /gst/notices, /loans, /users, /team, /reports, /chat, /callbacks, /settings.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'In-app route path, must start with "/"' },
          },
          required: ['path'],
        },
        execute: (input) => {
          const path = typeof input['path'] === 'string' ? input['path'] : ''
          if (!path.startsWith('/')) {
            return `Rejected: path must start with "/" (received "${path}")`
          }
          actionsRef.current.navigate(path)
          return `Navigated to ${path}`
        },
      },
      {
        name: 'snapaccount_set_locale',
        description: 'Switch the admin UI language. Supported: en (English), hi (Hindi), bn (Bengali).',
        inputSchema: {
          type: 'object',
          properties: { locale: { type: 'string', enum: ['en', 'hi', 'bn'] } },
          required: ['locale'],
        },
        execute: (input) => {
          const locale = input['locale']
          if (locale === 'en' || locale === 'hi' || locale === 'bn') {
            setLocale(locale)
            return `Locale set to ${locale}`
          }
          return `Rejected: unsupported locale "${String(locale)}"`
        },
      },
      {
        name: 'snapaccount_open_search',
        description:
          'Open the global command palette / search so the user can jump to any record or page.',
        inputSchema: { type: 'object', properties: {} },
        execute: () => {
          actionsRef.current.openSearch()
          return 'Opened the command palette'
        },
      },
      {
        name: 'snapaccount_current_route',
        description:
          'Read the current route path and page title. Use this to confirm where the app is before acting.',
        inputSchema: { type: 'object', properties: {} },
        execute: () => JSON.stringify({ path: window.location.pathname, title: document.title }),
      },
      {
        name: 'snapaccount_logout',
        description: 'Sign the current admin user out and return to the login screen.',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => {
          await actionsRef.current.signOut()
          return 'Signed out'
        },
      },
    ]

    // Register exactly once on mount; handlers read actionsRef for the latest
    // actions, so an empty dependency list is intentional (no re-register churn).
    return registerWebMcpTools(tools)
  }, [])
}

/** Renders nothing; mounts SnapAccount's WebMCP tool registration for the app shell. */
export function WebMcpTools(): null {
  useWebMcpTools()
  return null
}
