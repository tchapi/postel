import { notifications } from '@mantine/notifications'
import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { queryKeys } from './queries'
import type { Message, MessagePage, MessageRow } from './types'

type Flags = { seen?: boolean; flagged?: boolean }

const json = (body: unknown): RequestInit => ({
  body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json' },
})

/**
 * Every cached list page of a folder, whatever the filters.
 */
function updateRows(
  client: ReturnType<typeof useQueryClient>,
  folderId: string,
  update: (row: MessageRow) => MessageRow | null,
) {
  client.setQueriesData<InfiniteData<MessagePage>>(
    { queryKey: ['messages', folderId] },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: page.items.map(update).filter((row): row is MessageRow => row !== null),
        })),
      },
  )
}

export function useFlagMessages() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: ({ folder, uids, ...flags }: { folder: string; uids: number[] } & Flags) =>
      api<void>('/messages/flags', { method: 'PATCH', ...json({ folder, uids, ...flags }) }),
    onMutate: ({ folder, uids, ...flags }) => {
      updateRows(client, folder, (row) => (uids.includes(row.uid) ? { ...row, ...flags } : row))
      client.setQueriesData<Message>({ queryKey: ['message', folder] }, (message) =>
        message && uids.includes(message.uid) ? { ...message, ...flags } : message,
      )
    },
    onSettled: (_data, _error, { folder }) => {
      void client.invalidateQueries({ queryKey: queryKeys.folders })
      void client.invalidateQueries({ queryKey: ['messages', folder] })
    },
  })
}

export function useMoveMessages() {
  const client = useQueryClient()

  const mutation = useMutation({
    mutationFn: ({ folder, uids, to }: { folder: string; uids: number[]; to: string }) =>
      api<{ uids: number[] }>('/messages/move', { method: 'POST', ...json({ folder, uids, to }) }),
    onMutate: ({ folder, uids }) => {
      updateRows(client, folder, (row) => (uids.includes(row.uid) ? null : row))
    },
    onSettled: (_data, _error, { folder, to }) => {
      void client.invalidateQueries({ queryKey: queryKeys.folders })
      void client.invalidateQueries({ queryKey: ['messages', folder] })
      void client.invalidateQueries({ queryKey: ['messages', to] })
    },
  })

  /** Moves, then offers to move back from the toast. */
  const moveWithUndo = (
    args: { folder: string; uids: number[]; to: string },
    label: string,
    toLabel: string,
  ) => {
    const id = `move-${Date.now()}`
    mutation.mutate(args, {
      onSuccess: (result) => {
        notifications.show({
          id,
          message: `${label} ${args.uids.length > 1 ? `${args.uids.length} messages` : 'message'} to ${toLabel}`,
          autoClose: 6000,
          ...undoAction(() => {
            notifications.hide(id)
            if (result.uids.length > 0) {
              mutation.mutate({ folder: args.to, uids: result.uids, to: args.folder })
            }
          }, result.uids.length > 0),
        })
      },
      onError: () =>
        notifications.show({ color: 'red', message: `Could not move the message to ${toLabel}` }),
    })
  }

  return { ...mutation, moveWithUndo }
}

export function useDeleteMessages() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: ({ folder, uids }: { folder: string; uids: number[] }) =>
      api<void>('/messages/delete', { method: 'POST', ...json({ folder, uids }) }),
    onMutate: ({ folder, uids }) => {
      updateRows(client, folder, (row) => (uids.includes(row.uid) ? null : row))
    },
    onSettled: (_data, _error, { folder }) => {
      void client.invalidateQueries({ queryKey: queryKeys.folders })
      void client.invalidateQueries({ queryKey: ['messages', folder] })
    },
  })
}

/** Mantine notifications have no action slot, the undo rides in the message. */
function undoAction(onUndo: () => void, enabled: boolean) {
  if (!enabled) return {}
  return {
    withCloseButton: true,
    onClick: onUndo,
    style: { cursor: 'pointer' },
    title: 'Click to undo',
  }
}
