import { RouterProvider } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { router } from './router'
import { queryClient } from './lib/queryClient'
import { ThemeProvider } from './contexts/ThemeContext'
import { CommandPaletteProvider } from './contexts/CommandPaletteContext'
import { KeyboardShortcutsProvider } from './contexts/KeyboardShortcutsContext'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <KeyboardShortcutsProvider>
          <CommandPaletteProvider>
            <RouterProvider router={router} />
            <Toaster
              position="top-right"
              richColors
              closeButton
              duration={4000}
              toastOptions={{
                classNames: {
                  toast: 'font-sans text-sm',
                },
              }}
            />
          </CommandPaletteProvider>
        </KeyboardShortcutsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
