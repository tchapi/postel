import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { AppShell, Drawer } from '@mantine/core'
import { useI18n } from '../lib/i18n'
import classes from './AppShell.module.css'

export type Layout = 'desktop' | 'tablet' | 'mobile'

export type MailAppShellProps = {
  layout: Layout
  header: ReactNode
  /** Mobile hides the top bar while the reader or composer owns the screen. */
  showHeader: boolean
  /** Desktop: folder rail collapsed to icons. */
  navCollapsed: boolean
  /** Tablet / mobile: folder drawer. */
  drawerOpened: boolean
  onDrawerClose: () => void
  renderNav: (collapsed: boolean) => ReactNode
  list: ReactNode
  reader: ReactNode
  /** Replaces list + reader (settings). */
  page?: ReactNode
  mobilePane: 'list' | 'reader'
  listWidth: number
  onListWidthChange: (w: number) => void
}

const MIN_LIST = 300
const MAX_LIST = 560
const clamp = (w: number) => Math.min(MAX_LIST, Math.max(MIN_LIST, w))

/**
 * ≥1200 three panes · 768–1199 two panes + folder drawer · <768 one pane.
 * Built on Mantine AppShell; below `lg` the navbar is collapsed and folders move to a Drawer.
 */
export function MailAppShell(p: MailAppShellProps) {
  const { t } = useI18n()
  const drag = useRef<{ x: number; w: number } | null>(null)
  const desktop = p.layout === 'desktop'

  const onSplitDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, w: p.listWidth }
  }
  const onSplitMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current) p.onListWidthChange(clamp(drag.current.w + e.clientX - drag.current.x))
  }
  const onSplitKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') p.onListWidthChange(clamp(p.listWidth - 16))
    if (e.key === 'ArrowRight') p.onListWidthChange(clamp(p.listWidth + 16))
  }

  const panes = p.page ?? (
    <>
      {(p.layout !== 'mobile' || p.mobilePane === 'list') && (
        <div
          className={classes.listPane}
          style={{ width: p.layout === 'mobile' ? '100%' : p.listWidth }}
        >
          {p.list}
        </div>
      )}
      {p.layout !== 'mobile' && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={p.listWidth}
          aria-valuemin={MIN_LIST}
          aria-valuemax={MAX_LIST}
          tabIndex={0}
          className={classes.splitter}
          onPointerDown={onSplitDown}
          onPointerMove={onSplitMove}
          onPointerUp={() => (drag.current = null)}
          onKeyDown={onSplitKey}
        />
      )}
      {(p.layout !== 'mobile' || p.mobilePane === 'reader') && (
        <main className={classes.readerPane}>{p.reader}</main>
      )}
    </>
  )

  return (
    <AppShell
      classNames={{ navbar: classes.navbar }}
      header={{ height: p.layout === 'mobile' ? 56 : 52, collapsed: !p.showHeader }}
      navbar={{
        width: p.navCollapsed ? 60 : 240,
        breakpoint: 'lg',
        collapsed: { mobile: true, desktop: false },
      }}
      padding={0}
    >
      <AppShell.Header>{p.header}</AppShell.Header>
      {desktop && <AppShell.Navbar>{p.renderNav(p.navCollapsed)}</AppShell.Navbar>}
      <AppShell.Main className={classes.main}>{panes}</AppShell.Main>
      {!desktop && (
        <Drawer
          opened={p.drawerOpened}
          onClose={p.onDrawerClose}
          size={p.layout === 'mobile' ? 304 : 280}
          withCloseButton
          title={t.folders}
          padding={0}
          classNames={{
            content: classes.drawerContent,
            header: classes.drawerHeader,
            body: classes.drawerBody,
          }}
        >
          {p.renderNav(false)}
        </Drawer>
      )}
    </AppShell>
  )
}
