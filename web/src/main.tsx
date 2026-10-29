import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import '@/i18n'
import './index.css'
import App from './App'
import { ThemeProvider } from '@/theme/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
  },
})

const container = document.getElementById('root')
if (!container) throw new Error('#root 容器不存在')

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={320}>
          <HashRouter>
            <App />
          </HashRouter>
          <Toaster
            position="top-center"
            toastOptions={{
              className: 'text-[13px]',
            }}
          />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
