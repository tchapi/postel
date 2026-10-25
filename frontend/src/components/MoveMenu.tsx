import { Menu, ScrollArea } from '@mantine/core'
import { FolderIcon } from 'lucide-react'
import type { Folder } from '../types'

export type MoveTarget = { id: string; label: string; depth: number }

/** Flattens the folder tree into Move-to targets, system folders first. */
export function toMoveTargets(
  system: Folder[],
  custom: Folder[],
  label: (f: Folder) => string,
  excludeId?: string,
): MoveTarget[] {
  const out: MoveTarget[] = []
  const walk = (f: Folder, depth: number) => {
    if (f.id !== excludeId && f.role !== 'drafts' && f.role !== 'sent')
      out.push({ id: f.id, label: label(f), depth })
    f.children?.forEach((c) => walk(c, depth + 1))
  }
  system.forEach((f) => walk(f, 0))
  custom.forEach((f) => walk(f, 0))
  return out
}

export function MoveMenuItems({
  targets,
  onMove,
}: {
  targets: MoveTarget[]
  onMove: (folderId: string) => void
}) {
  // Long folder lists scroll inside the menu instead of running off the screen
  return (
    <ScrollArea.Autosize mah="min(360px, 60dvh)" type="auto" offsetScrollbars>
      {targets.map((f) => (
        <Menu.Item
          key={f.id}
          leftSection={<FolderIcon size={16} strokeWidth={1.75} />}
          style={{ paddingLeft: 12 + f.depth * 16 }}
          onClick={() => onMove(f.id)}
        >
          {f.label}
        </Menu.Item>
      ))}
    </ScrollArea.Autosize>
  )
}
