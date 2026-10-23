# Roadmap

## Phase 0, spikes

- [x] Backend and frontend skeletons, Docker image, CI
- [x] `webklex/php-imap` against a real Dovecot: master user login, paging a
      20k mailbox by date, message structure of the fixture corpus. Outcome in
      [spikes/2026-10-23-imap.md](spikes/2026-10-23-imap.md): webklex as
      transport only, raw `UID SORT` + `FETCH` for the list,
      `zbateson/mail-mime-parser` for bodies
- [x] CardDAV `addressbook-query` against Davis. Outcome in
      [spikes/2026-10-23-carddav.md](spikes/2026-10-23-carddav.md): CardDAV is
      enough, cache contacts locally, Davis needs a master user (PR to open)

## Phase 1, read-only

- [x] Folders with unread counts
- [x] Message list: paged, sorted by date, virtualized
- [x] Reader: headers, sanitized HTML, text fallback, attachments, inline images
- [x] Remote images blocked by default
- [x] Dark mode, keyboard navigation (`j`, `k`, `esc`)
- [ ] Mark as read when opened (needs the flags endpoint, phase 2)

## Phase 2, actions

- [ ] Flags: seen, flagged
- [ ] Move, archive, junk, trash, with undo
- [ ] Search (headers first, body later)
- [ ] Unread polling
- [ ] Spotlight: search, folder jump, shortcuts

## Phase 3, compose

- [ ] Composer with `@mantine/tiptap`
- [ ] Reply, reply all, forward with quoting
- [ ] Attachments upload
- [ ] Drafts (`APPEND` to Drafts, autosave)
- [ ] Send through SMTP submission, copy to Sent
- [ ] Signatures and settings (SQLite)
- [ ] Contacts autocomplete from Davis

## Later

- Threading, sieve filters, FrankenPHP worker mode, IMAP IDLE through SSE,
  i18n, mobile polish

Explicitly out of scope: multiple accounts, labels, calendar, PGP.
