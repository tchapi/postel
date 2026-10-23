import { useInfiniteQuery, useQuery } from '@tanstack/react-query'

import { api } from './client'
import type { Folder, Me, Message, MessagePage } from './types'

export const queryKeys = {
  me: ['me'] as const,
  folders: ['folders'] as const,
  messages: (folderId: string) => ['messages', folderId] as const,
  message: (folderId: string, uid: number, images: boolean) =>
    ['message', folderId, uid, images] as const,
}

const folderPath = (folderId: string) => `/folders/${encodeURIComponent(folderId)}`

export const PAGE_SIZE = 50

export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: () => api<Me>('/me') })
}

export function useFolders() {
  return useQuery({ queryKey: queryKeys.folders, queryFn: () => api<Folder[]>('/folders') })
}

export function useMessages(folderId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.messages(folderId),
    queryFn: ({ pageParam }) =>
      api<MessagePage>(`${folderPath(folderId)}/messages?page=${pageParam}&perPage=${PAGE_SIZE}`),
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
