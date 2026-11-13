import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { AppShell, Drawer } from '@mantine/core'
import { useI18n } from '../lib/i18n'
import { SplitPanes } from './SplitPanes'
import { Brand } from './TopBar'
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
  /** Replaces list + reader (settings, contacts). */
  page?: ReactNode
  mobilePane: 'list' | 'reader'
  listWidth: number
  onListWidthChange: (w: number) => void
  /** Desktop: width of the expanded folder pane. */
  navWidth: number
  onNavWidthChange: (w: number) => void
}

export const DEFAULT_NAV = 240
const MIN_NAV = 180
const MAX_NAV = 360
const clampNav = (w: number) => Math.min(MAX_NAV, Math.max(MIN_NAV, w))

/**
 * ≥1200 three panes · 768–1199 two panes + folder drawer · <768 one pane.
 * Built on Mantine AppShell; below `lg` the navbar is collapsed and folders move to a Drawer.
 */
export function MailAppShell(p: MailAppShellProps) {
  const { t } = useI18n()
  const desktop = p.layout === 'desktop'
  const navDrag = useRef<{ x: number; w: number } | null>(null)
  // No width animation while the pane follows the pointer
  const [resizingNav, setResizingNav] = useState(false)

  const onNavDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    navDrag.current = { x: e.clientX, w: p.navWidth }
    setResizingNav(true)
  }
  const onNavMove = (e: PointerEvent<HTMLDivElement>) => {
    if (navDrag.current)
      p.onNavWidthChange(clampNav(navDrag.current.w + e.clientX - navDrag.current.x))
  }
  const onNavUp = () => {
    navDrag.current = null
    setResizingNav(false)
  }
  const onNavKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') p.onNavWidthChange(clampNav(p.navWidth - 16))
    if (e.key === 'ArrowRight') p.onNavWidthChange(clampNav(p.navWidth + 16))
  }

  const panes = p.page ?? (
    <SplitPanes
      layout={p.layout}
      list={p.list}
      reader={p.reader}
      mobilePane={p.mobilePane}
      listWidth={p.listWidth}
      onListWidthChange={p.onListWidthChange}
    />
  )

  return (
    <AppShell
      classNames={{ navbar: classes.navbar, header: classes.appHeader }}
      header={{ height: p.layout === 'mobile' ? 56 : 52, collapsed: !p.showHeader }}
      transitionDuration={resizingNav ? 0 : 200}
      navbar={{
        width: p.navCollapsed ? 60 : p.navWidth,
        breakpoint: 'lg',
        collapsed: { mobile: true, desktop: false },
      }}
      padding={0}
    >
      <AppShell.Header data-mobile={p.layout === 'mobile' || undefined}>{p.header}</AppShell.Header>
      {desktop && (
        <AppShell.Navbar data-resizing={resizingNav || undefined}>
          {p.renderNav(p.navCollapsed)}
          {!p.navCollapsed && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={t.resizeFolders}
              aria-valuenow={p.navWidth}
              aria-valuemin={MIN_NAV}
              aria-valuemax={MAX_NAV}
              tabIndex={0}
              className={classes.navHandle}
              onPointerDown={onNavDown}
              onPointerMove={onNavMove}
              onPointerUp={onNavUp}
              onPointerCancel={onNavUp}
              onDoubleClick={() => p.onNavWidthChange(DEFAULT_NAV)}
              onKeyDown={onNavKey}
            />
          )}
        </AppShell.Navbar>
      )}
      {/* On phones the list runs under the floating top bar, which tells the list how much room to leave */}
      <AppShell.Main
        className={classes.main}
        style={p.layout === 'mobile' && p.showHeader ? { paddingTop: 0 } : undefined}
      >
        {panes}
      </AppShell.Main>
      {!desktop && (
        <Drawer
          opened={p.drawerOpened}
          onClose={p.onDrawerClose}
          size={p.layout === 'mobile' ? 304 : 280}
          withCloseButton
          title={<Brand />}
          aria-label={t.folders}
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
