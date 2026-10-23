# Roadmap

## Phase 0, spikes

- [x] Backend and frontend skeletons, Docker image, CI
- [ ] `webklex/php-imap` against a real Dovecot: master user login, paging a
      20k mailbox by date (does it issue `UID SORT`, or do we go through
      `ImapProtocol` directly), message structure of a few nasty mails
- [ ] CardDAV `addressbook-query` against Davis

## Phase 1, read-only

- [x] Folders with unread counts
- [ ] Message list: paged, sorted by date, virtualized
- [ ] Reader: headers, sanitized HTML, text fallback, attachments, inline images
- [ ] Remote images blocked by default
- [ ] Dark mode, keyboard navigation (`j`, `k`, `enter`, `esc`)

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
