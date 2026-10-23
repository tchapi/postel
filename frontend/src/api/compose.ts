import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { queryKeys } from './queries'
import type { Address } from './types'

export type MessageRef = { folder: string; uid: number; sections?: string[] }

export type DraftPayload = {
  to: Address[]
  cc: Address[]
  bcc: Address[]
  subject: string
  html: string | null
  text?: string | null
  uploads: string[]
  inReplyTo?: MessageRef
  forwardOf?: MessageRef
  attachmentsFrom?: MessageRef
  replaces?: MessageRef
}

export type Upload = { id: string; name: string; mime: string; size: number }

const json = (body: unknown): RequestInit => ({
  body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json' },
})

export function useSendMessage() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (draft: DraftPayload) => api<void>('/send', { method: 'POST', ...json(draft) }),
    onSuccess: (_data, draft) => {
      void client.invalidateQueries({ queryKey: queryKeys.folders })
      void client.invalidateQueries({ queryKey: ['messages'] })
      if (draft.inReplyTo) {
        void client.invalidateQueries({ queryKey: ['message', draft.inReplyTo.folder] })
      }
    },
  })
}

export function useSaveDraft() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (draft: DraftPayload) =>
      api<{ folder: string; uid: number }>('/drafts', { method: 'PUT', ...json(draft) }),
    onSuccess: (saved) => {
      void client.invalidateQueries({ queryKey: queryKeys.folders })
      void client.invalidateQueries({ queryKey: ['messages', saved.folder] })
    },
  })
}

export async function uploadFile(file: File): Promise<Upload> {
  const body = new FormData()
  body.append('file', file)
  return api<Upload>('/uploads', { method: 'POST', body })
}

export function deleteUpload(id: string): Promise<void> {
  return api<void>(`/uploads/${id}`, { method: 'DELETE' })
}
