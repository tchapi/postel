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
- [x] Mark as read when opened

## Phase 2, actions

- [x] Flags: seen, flagged
- [x] Move, archive, junk, trash, with undo
- [x] Search on From, To and Subject, unread and starred filters
- [x] Unread polling (folder counts every 30s)
- [ ] Bulk selection and actions
- [ ] Spotlight: folder jump, shortcuts help
- [ ] Body search once an FTS index is in place on the server

## Phase 3, compose

- [x] Composer with `@mantine/tiptap`
- [x] Reply, reply all, forward with quoting, threading headers
- [x] Attachments upload, carried over on forward and draft edits
- [x] Drafts (`APPEND` to Drafts, autosave every 30s, edit from the Drafts folder)
- [x] Send through SMTP submission with the master user, copy to Sent
- [x] Signatures and settings (SQLite): display name, signature, remote images default, density
- [ ] Contacts autocomplete from Davis

## Later

- Threading, sieve filters, FrankenPHP worker mode, IMAP IDLE through SSE,
  i18n, mobile polish

Explicitly out of scope: multiple accounts, labels, calendar, PGP.
