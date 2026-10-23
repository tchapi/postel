import { useInfiniteQuery, useQuery } from '@tanstack/react-query'

import { api } from './client'
import type { Folder, Me, Message, MessagePage } from './types'

export type ListFilters = {
  q?: string
  unread?: boolean
  flagged?: boolean
}

export const queryKeys = {
  me: ['me'] as const,
  folders: ['folders'] as const,
  messages: (folderId: string, filters: ListFilters = {}) =>
    ['messages', folderId, filters.q ?? '', !!filters.unread, !!filters.flagged] as const,
  message: (folderId: string, uid: number, images: boolean) =>
    ['message', folderId, uid, images] as const,
}

export const folderPath = (folderId: string) => `/folders/${encodeURIComponent(folderId)}`

export const PAGE_SIZE = 50

export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: () => api<Me>('/me') })
}

export function useFolders() {
  return useQuery({
    queryKey: queryKeys.folders,
    queryFn: () => api<Folder[]>('/folders'),
    refetchInterval: 30_000,
  })
}

export function useMessages(folderId: string, filters: ListFilters = {}) {
  const params = new URLSearchParams({ perPage: String(PAGE_SIZE) })
  if (filters.q) params.set('q', filters.q)
  if (filters.unread) params.set('unread', '1')
  if (filters.flagged) params.set('flagged', '1')

  return useInfiniteQuery({
    queryKey: queryKeys.messages(folderId, filters),
    queryFn: ({ pageParam }) =>
      api<MessagePage>(`${folderPath(folderId)}/messages?${params}&page=${pageParam}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.items.length < last.perPage ? undefined : last.page + 1),
  })
}

export function useMessage(folderId: string, uid: number, images: boolean) {
  return useQuery({
    queryKey: queryKeys.message(folderId, uid, images),
    queryFn: () =>
      api<Message>(`${folderPath(folderId)}/messages/${uid}${images ? '?images=1' : ''}`),
  })
}

export function partUrl(folderId: string, uid: number, partId: string, inline = false): string {
  return `/api${folderPath(folderId)}/messages/${uid}/parts/${partId}${inline ? '?inline=1' : ''}`
}
