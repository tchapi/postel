# Design brief

What the interface should feel like, and the constraints it lives with. Written
for whoever designs or builds a screen, human or not.

## Context

A webmail for a single mail domain and a handful of users. The goal is lean,
fast and calm: Fastmail restraint rather than Gmail. It must feel instant and
stay out of the way.

## Constraints

- React 19 and Mantine only: `@mantine/core`, `hooks`, `tiptap`, `dropzone`,
  `spotlight`, `notifications`, `modals`. Mantine primitives everywhere
  (AppShell, NavLink, ScrollArea, ActionIcon, Badge, Menu, Drawer, Modal, Tabs,
  Checkbox, Tooltip, Kbd). No other UI library, no utility CSS framework.
  Styling through Mantine props and CSS modules.
- One theme file ([`frontend/src/theme.ts`](../frontend/src/theme.ts)): one
  accent colour, default radius and spacing, 14px base, system font stack.
  Light and dark are both first-class.
- Data comes from TanStack Query hooks. Components are dumb: props in,
  callbacks out.
- The message list is virtualized, 50 items per page, infinite scroll.
- Message HTML renders in a sandboxed `iframe` with `srcdoc`. The chrome around
  it is ours, the content is not.

## Layout

- Desktop (≥ 1200px): three panes. Folders (240px, collapsible) / message list
  (about 380px) / reader.
- Tablet (768 to 1200px): two panes, folders in a Drawer.
- Mobile (< 768px): one pane, list then reader, composer full screen.
- Top bar: search (opens Spotlight), compose, unread badge, user menu
  (settings, theme, shortcuts).

## Screens

1. **Mailbox.** Folder tree with unread counts, well-known folders first.
   Rows: sender, subject, one-line snippet, relative date, unread as bold plus
   a dot (never a coloured background), star, attachment icon, checkbox on
   hover. Multi-select shows a bulk action bar. Context menu on right-click.
2. **Reader.** Subject, from/to/cc with initials avatars, absolute date on
   hover, attachment chips with size and download, actions toolbar (reply,
   reply all, forward, archive, delete, junk, move, star, unread, more).
   Banner for blocked remote images. Collapsed quoted text. Empty state when
   nothing is selected.
3. **Composer.** Drawer from the right on desktop (about 720px, expandable),
   full screen on mobile. To/Cc/Bcc as chips with contact autocomplete, Cc/Bcc
   hidden until asked. Minimal rich text toolbar (bold, italic, underline,
   link, list, quote, clear). Attachments through a dropzone with progress.
   Footer: Send, Save draft, Discard, "saved 12s ago".
4. **Search.** Spotlight (`/` or ⌘K) with recent searches, folder jump and
   actions. Results reuse the list with filter chips: unread, starred, has
   attachment, this folder or all, date range.
5. **Settings.** Signature, density, remote images default, language, theme,
   shortcuts reference.
6. **States.** Loading skeletons, one-line empty states without illustrations,
   errors with retry, offline toast. Notifications with undo for archive,
   delete, move and send.

## Interactions

- Keyboard first: `j`/`k` next and previous, `enter` open, `r`/`a`/`f` reply,
  reply all, forward, `e` archive, `#` delete, `s` star, `u` unread, `c`
  compose, `/` search, `g i` inbox, `esc` close, `?` help. Shown in tooltips
  with `Kbd`.
- Optimistic updates for flags, move and archive, with an undo toast.
- Mobile: swipe right to archive, swipe left to delete, pull to refresh.
- `prefers-reduced-motion` respected, focus rings visible, AA contrast in
  both themes, list navigable with the keyboard and proper roles.

## Visual direction

Dense but readable. Subtle 1px borders, shadows only on overlays, no
gradients, no hero anything. Unread is weight, not colour. The accent is for
primary actions and the active folder only. Avatars are initials on muted
backgrounds, metadata is `dimmed`. The reader has generous padding, the list
is compact; the density toggle only changes row height.

## Out of scope

Threading, labels, multiple accounts, calendar, PGP, sieve filters.

## Data shapes

See [`frontend/src/api/types.ts`](../frontend/src/api/types.ts).
