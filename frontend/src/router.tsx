import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router'

import { FolderView } from './components/messages/FolderView'
import { AppLayout } from './components/layout/AppLayout'
import { Reader } from './components/reader/Reader'
import { ReaderPlaceholder } from './components/reader/ReaderPlaceholder'

export type FolderSearch = {
  q?: string
  unread?: boolean
  flagged?: boolean
}

const rootRoute = createRootRoute({ component: AppLayout })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/folders/$folderId', params: { folderId: 'INBOX' } })
  },
})

const folderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/folders/$folderId',
  component: FolderView,
  validateSearch: (search: Record<string, unknown>): FolderSearch => ({
    q: typeof search.q === 'string' && search.q !== '' ? search.q : undefined,
    unread: search.unread === true || undefined,
    flagged: search.flagged === true || undefined,
  }),
})

const folderIndexRoute = createRoute({
  getParentRoute: () => folderRoute,
  path: '/',
  component: ReaderPlaceholder,
})

const messageRoute = createRoute({
  getParentRoute: () => folderRoute,
  path: '$uid',
  component: Reader,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  folderRoute.addChildren([folderIndexRoute, messageRoute]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
