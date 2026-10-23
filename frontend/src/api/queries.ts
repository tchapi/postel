import { useQuery } from '@tanstack/react-query'

import { api } from './client'
import type { Folder, Me } from './types'

export const queryKeys = {
  me: ['me'] as const,
  folders: ['folders'] as const,
}

export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: () => api<Me>('/me') })
}

export function useFolders() {
  return useQuery({ queryKey: queryKeys.folders, queryFn: () => api<Folder[]>('/folders') })
}
