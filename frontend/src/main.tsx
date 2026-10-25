import '@fontsource-variable/figtree'
import '@mantine/core/styles.css'
import '@mantine/dropzone/styles.css'
import '@mantine/notifications/styles.css'
import '@mantine/spotlight/styles.css'
import '@mantine/tiptap/styles.css'
import './global.css'

import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'

import { createMailHooks, partUrl } from './api/mailHooks'
import { MailHooksProvider, useMailHooks } from './hooks'
import { MailApp } from './MailApp'
import { faviconUrl } from './components/Logo'
import { ACCENTS, DEFAULT_ACCENT, cssVariablesResolver, themeWithAccent } from './theme'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
})
const mailHooks = createMailHooks(queryClient)

/** The accent lives in user settings, so the theme is built below the hooks provider. */
function ThemedRoot({ children }: { children: ReactNode }) {
  const { settings } = useMailHooks().useSettings()
  const accent = settings.accent in ACCENTS ? settings.accent : DEFAULT_ACCENT
  // The tab icon follows the accent too
  useEffect(() => {
    document
      .querySelector<HTMLLinkElement>('link[rel="icon"]')
      ?.setAttribute('href', faviconUrl(ACCENTS[accent][6]))
  }, [accent])
  return (
    <MantineProvider
      theme={themeWithAccent(settings.accent)}
      cssVariablesResolver={cssVariablesResolver}
      defaultColorScheme="auto"
    >
      {children}
    </MantineProvider>
  )
}

// An app, not a page: no pinch zoom. iOS ignores user-scalable=no for pinches,
// so its gesture events are refused too.
document.addEventListener('gesturestart', (e) => e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MailHooksProvider value={mailHooks}>
        <ThemedRoot>
          <ModalsProvider>
            <Notifications position="bottom-center" limit={3} />
            <MailApp
              attachmentUrl={(ref, a, disposition) => partUrl(ref, a.id, disposition === 'inline')}
            />
          </ModalsProvider>
        </ThemedRoot>
      </MailHooksProvider>
    </QueryClientProvider>
  </StrictMode>,
)
