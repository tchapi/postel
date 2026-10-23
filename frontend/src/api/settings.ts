import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'

export type Density = 'comfortable' | 'compact'

export type Settings = {
  fromName: string | null
  signature: string | null
  loadRemoteImages: boolean
  density: Density
  threads: boolean
  updatedAt: string | null
}

export const DEFAULT_SETTINGS: Settings = {
  fromName: null,
  signature: null,
  loadRemoteImages: false,
  density: 'comfortable',
  threads: true,
  updatedAt: null,
}

const settingsKey = ['settings'] as const

export function useSettings() {
  return useQuery({
    queryKey: settingsKey,
    queryFn: () => api<Settings>('/settings'),
    staleTime: Infinity,
  })
}

export function useUpdateSettings() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (change: Omit<Settings, 'updatedAt'>) =>
      api<Settings>('/settings', {
        method: 'PUT',
        body: JSON.stringify(change),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: (settings) => {
      client.setQueryData(settingsKey, settings)
      // The remote images default changes what the reader gets
      void client.invalidateQueries({ queryKey: ['message'] })
    },
  })
}
