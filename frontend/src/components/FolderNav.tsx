import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Kbd, ScrollArea, Stack, Tooltip, UnstyledButton } from '@mantine/core'
import {
  IconArchive,
  IconBan,
  IconFileText,
  IconFolder,
  IconInbox,
  IconLayoutSidebarLeftCollapse,
  IconPencil,
  IconSend,
  IconTrash,
} from '@tabler/icons-react'
import type { Folder, FolderRole } from '../types'
import { useI18n } from '../lib/i18n'
import { ErrorState, FolderNavSkeleton } from './States'
import { SHORTCUTS, keyLabel } from '../lib/shortcuts'
import classes from './FolderNav.module.css'

const ROLE_ORDER: FolderRole[] = ['inbox', 'drafts', 'sent', 'junk', 'trash', 'archive']
const ROLE_ICON = {
  inbox: IconInbox,
  drafts: IconFileText,
  sent: IconSend,
  junk: IconBan,
  trash: IconTrash,
  archive: IconArchive,
} as const

export function sortFolders(folders: Folder[]): { system: Folder[]; custom: Folder[] } {
  const system = ROLE_ORDER.map((r) => folders.find((f) => f.role === r)).filter(
    (f): f is Folder => !!f,
  )
  const custom = folders.filter((f) => !f.role).sort((a, b) => a.name.localeCompare(b.name))
  return { system, custom }
}

export function useFolderLabel() {
  const { t } = useI18n()
  return (f: Folder) => (f.role ? t.folderRole[f.role] : f.name)
}

// Custom folders all share one icon, which makes the rail useless: each gets a monogram
// in a colour picked from its name, the same in both widths so it is learnt once.
const MONOGRAM_COLORS = [
  'blue',
  'teal',
  'grape',
  'orange',
  'cyan',
  'pink',
  'lime',
  'indigo',
  'yellow',
  'red',
]

function monogramColor(name: string): string {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) | 0
  return MONOGRAM_COLORS[Math.abs(hash) % MONOGRAM_COLORS.length]!
}

function Monogram({ name }: { name: string }) {
  const letters = [...name.replace(/[^\p{L}\p{N}]/gu, '')].slice(0, 2).join('') || '·'
  const color = monogramColor(name)
  return (
    <span
      className={classes.monogram}
      style={{
        background: `var(--mantine-color-${color}-light)`,
        color: `var(--mantine-color-${color}-light-color)`,
      }}
      aria-hidden
    >
      {letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase()}
    </span>
  )
}

/** Drafts show their total, every other folder its unread count. */
function badgeCount(f: Folder): number {
  return f.role === 'drafts' ? f.total : f.unread
}

export type FolderNavProps = {
  folders: Folder[] | undefined
  status: 'pending' | 'error' | 'success'
  onRetry: () => void
  activeId: string | null
  /** Desktop rail mode: icons only. */
  collapsed: boolean
  onSelect: (folderId: string) => void
  /** Omit to hide the collapse toggle (drawer usage). */
  onToggleCollapsed?: () => void
  /** Desktop: primary Compose action at the top of the sidebar. Omit where Compose lives elsewhere (header, FAB). */
  onCompose?: () => void
}

export function FolderNav({
  folders,
  status,
  onRetry,
  activeId,
  collapsed,
  onSelect,
  onToggleCollapsed,
  onCompose,
}: FolderNavProps) {
  const { t } = useI18n()
  const label = useFolderLabel()

  // A small shadow over the footer while more folders hide below it
  const viewport = useRef<HTMLDivElement>(null)
  const [moreBelow, setMoreBelow] = useState(false)
  const measure = useCallback(() => {
    const v = viewport.current
    if (v) setMoreBelow(v.scrollHeight - v.scrollTop - v.clientHeight > 1)
  }, [])
  useEffect(() => {
    const v = viewport.current
    if (!v) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(v)
    if (v.firstElementChild) observer.observe(v.firstElementChild)
    return () => observer.disconnect()
  }, [measure, folders, collapsed])

  // One markup for both widths: icons keep their place, text fades and the pane's width does the rest.
  const compose = onCompose ? (
    <div className={classes.composeWrap}>
      <Tooltip label={t.compose} position="right" disabled={!collapsed}>
        <UnstyledButton className={classes.compose} onClick={onCompose} aria-label={t.compose}>
          <IconPencil size={18} stroke={1.75} className={classes.icon} />
          <span className={`${classes.label} ${classes.fade}`}>{t.compose}</span>
          <Kbd size="xs" className={`${classes.composeKbd} ${classes.fade}`} aria-hidden>
            {SHORTCUTS.compose.keys.map(keyLabel).join(' ')}
          </Kbd>
        </UnstyledButton>
      </Tooltip>
    </div>
  ) : null

  const shell = (children: React.ReactNode) => (
    <Stack gap={0} h="100%" className={classes.root} data-collapsed={collapsed || undefined}>
      {compose}
      {children}
    </Stack>
  )

  if (status === 'pending') return shell(<FolderNavSkeleton collapsed={collapsed} />)
  if (status === 'error' || !folders)
    return shell(
      <ErrorState compact title={collapsed ? '' : t.foldersUnavailable} onRetry={onRetry} />,
    )

  const { system, custom } = sortFolders(folders)

  const renderLink = (f: Folder, depth = 0): React.ReactNode => {
    const Icon = f.role ? ROLE_ICON[f.role] : IconFolder
    const count = badgeCount(f)
    const active = f.id === activeId
    const strong = active || (f.unread > 0 && f.role !== 'drafts' && f.role !== 'sent')
    const inboxPill = f.role === 'inbox' && f.unread > 0
    const tooltip = count ? `${label(f)} · ${count}` : label(f)

    return (
      <div key={f.id}>
        <Tooltip label={tooltip} position="right" disabled={!collapsed}>
          <UnstyledButton
            className={classes.link}
            data-active={active || undefined}
            data-strong={strong || undefined}
            aria-current={active ? 'page' : undefined}
            style={{ '--depth': depth } as React.CSSProperties}
            onClick={() => onSelect(f.id)}
          >
            <span className={classes.iconWrap}>
              {f.role ? (
                <Icon size={18} stroke={1.75} className={classes.icon} />
              ) : (
                <Monogram name={label(f)} />
              )}
              {count > 0 && (
                <span
                  className={classes.corner}
                  data-accent={inboxPill || active || undefined}
                  aria-hidden
                >
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </span>
            <span className={`${classes.label} ${classes.fade}`}>{label(f)}</span>
            {count > 0 && (
              <span
                className={`${inboxPill ? classes.pill : classes.count} ${classes.fade}`}
                aria-label={inboxPill ? t.unreadBadge(f.unread) : undefined}
              >
                {inboxPill && f.unread > 999 ? '999+' : count}
              </span>
            )}
          </UnstyledButton>
        </Tooltip>
        {f.children?.map((c) => renderLink(c, depth + 1))}
      </div>
    )
  }

  return shell(
    <>
      <ScrollArea
        style={{ flex: 1 }}
        type="hover"
        scrollbars="y"
        viewportRef={viewport}
        onScrollPositionChange={measure}
      >
        <Stack gap={2} p={10} component="nav" aria-label={t.folders}>
          {system.map((f) => renderLink(f))}
          {custom.length > 0 && (
            <div className={classes.section}>
              <span className={`${classes.sectionLabel} ${classes.fade}`}>{t.folders}</span>
              <span className={classes.sectionRule} aria-hidden />
            </div>
          )}
          {custom.map((f) => renderLink(f))}
        </Stack>
      </ScrollArea>
      {onToggleCollapsed && (
        <div className={classes.footer} data-more-above={moreBelow || undefined}>
          <Tooltip label={t.expandFolders} position="right" disabled={!collapsed}>
            <UnstyledButton
              className={classes.link}
              onClick={onToggleCollapsed}
              aria-label={collapsed ? t.expandFolders : t.collapseFolders}
              aria-expanded={!collapsed}
            >
              <IconLayoutSidebarLeftCollapse
                size={18}
                stroke={1.75}
                className={`${classes.icon} ${classes.turn}`}
              />
              <span className={`${classes.label} ${classes.fade}`}>{t.collapse}</span>
            </UnstyledButton>
          </Tooltip>
        </div>
      )}
    </>,
  )
}
