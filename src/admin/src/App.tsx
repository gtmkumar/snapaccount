import { RouterProvider } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { router } from './router'
import { queryClient } from './lib/queryClient'
import { ThemeProvider } from './contexts/ThemeContext'

// Note: KeyboardShortcutsProvider and CommandPaletteProvider both depend on
// useNavigate() and must be rendered INSIDE the RouterProvider. They are
// mounted by ProtectedLayout (router.tsx) so all router-aware pages get them.
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
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
      </ThemeProvider>
    </QueryClientProvider>
  )
}
