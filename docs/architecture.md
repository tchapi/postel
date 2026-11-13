# Architecture

Postel is a small API in front of an IMAP server, with a single-page frontend, shipped as one container.

```
browser ──> reverse proxy ──(forward-auth)──> Postel container
                                               ├── Caddy      static files + FastCGI
                                               └── php-fpm    Symfony API
                                                     ├── IMAP ────> Dovecot   (master user)
                                                     ├── SMTP ────> Postfix   (submission, master user)
                                                     └── CardDAV ─> Davis     (app key, optional)
```

## No copy of the mailbox

Every API call opens an IMAP session, does its work and closes it. There is no local copy of the mailbox, no sync job and no queue. On the same Docker network, an IMAP login takes a few milliseconds.

Dovecot does the heavy work: `SORT`, `SEARCH`, `THREAD`, `STATUS` and `PREVIEW` all run on the server. A page of the message list is one `UID SORT` and one `UID FETCH` of 50 messages' headers and snippets, about 40 ms on a 20,000-message mailbox.

`webklex/php-imap` is only used to connect, list folders, and send `APPEND`, `STORE`, `MOVE` and raw commands. Its query builder is not used: it sends a `NOOP` before every command, sorts by UID instead of date, and can change flags while listing. Its response parser is not used either, because it mangles `ENVELOPE`. The app reads the raw responses with its own small reader (`src/Imap/Protocol`).

Messages are parsed with `zbateson/mail-mime-parser`, which decodes encoded headers properly and lets the app guess the charset when a message doesn't declare one. The test messages in `backend/tests/Fixtures/mail` cover the difficult cases: inline images, `format=flowed`, calendar invites, Latin-1 and undeclared UTF-8, Outlook HTML, nested multiparts, and a message trying to inject scripts.

Drafts and sent mail are stored in IMAP. The only local state is a SQLite file with the user settings and the copy of the address books.

## Authentication

The container is only reachable through the reverse proxy. The proxy runs forward-auth against an identity provider (Authelia, for instance), which sets `Remote-User`, `Remote-Email` and `Remote-Name` on every request it lets through.

`RemoteUserAuthenticator` turns these headers into the current user, but only when the request comes from a proxy listed in `TRUSTED_PROXIES`. A request from anywhere else is refused, whatever its headers. There is no session and no cookie on Postel side.

When the identity provider's session ends, API calls get a `401`. The frontend then reloads the page, which goes back through the login page.

## Access to the mailbox without the user's password

The backend logs into Dovecot as `<login>*<master user>` with the master password ([Dovecot master users](https://doc.dovecot.org/configuration_manual/authentication/master_users/)). Dovecot opens the mailbox of `<login>`, so Postel never handles the user's own password. SMTP submission uses the same login. `IMAP_LOGIN_ATTRIBUTE` picks which header is the login: `email` for servers whose accounts are full addresses, like docker-mailserver, `username` otherwise.

Dovecot limits the number of connections per user and IP address (`mail_max_userip_connections`, 10 by default). All Postel's connections come from the container's address, which is why the app polls for new mail every 30 seconds instead of keeping connections open.

## Contacts

Contacts come from [Davis](https://github.com/tchapi/davis) over CardDAV, with an app key: the backend logs in as `<login>*<app id>` with the key's secret, and Davis acts as `<login>`.

Everything after the login is plain CardDAV (RFC 6352): discovery from the principal, `REPORT`s, `GET`, `PUT` and `DELETE` with ETags. Nothing depends on how Davis lays out its URLs, and the app key is the only part another server would not have.

### The copy

Each CardDAV request costs about 170 ms, because Davis checks a bcrypt hash every time. So neither autocomplete nor the address book asks Davis to show something. They read a copy kept in SQLite: one row per card, with the whole vCard, and one row per email address for autocomplete.

- The first use fills the copy, with one `addressbook-query` per address book.
- After that, when the address book is opened, and otherwise at most every five minutes once the response has been sent, one `PROPFIND` reads each address book's sync token. For a book whose token changed, one `addressbook-query` reads the ETag of every card, and one `addressbook-multiget` fetches only the cards whose ETag differs. Cards that are gone are dropped.
- If Davis is down or refuses the key, the copy stays as it was, and the address book says it shows the last copy.

Cards and books have ids made from the user and the href (a hash), stable across a rebuild of the copy. The browser never sends an href: every URL asked of Davis comes from the copy, looked up by id and user.

### Changes

A change goes to Davis first, then to the copy:

- The browser sends the ETag of the card the user was looking at. The change is made on the copy's vCard, only if the copy is at that version, and sent with `If-Match`. Davis refuses it (`412`) if the card moved on in the meantime.
- A refused change reads that one card again, so what the user sees next is the card as it is. The editor then moves the user's edits onto it (`lib/rebase.ts`) rather than dropping them or writing over the other change.
- When Davis answers without an ETag, it stored something else than what was sent: the card is read back once.
- A merge writes the card that stays, then deletes the other. If it stops half way there is a card too many, never one too few.
- A `.vcf` import is cut into cards in the browser and sent a few at a time, since each card is one request to Davis.

### vCards

Cards are read and edited with `sabre/vobject` (`CardDocument`), in vCard 3.0 or 4.0. Only what the address book shows is touched. Every line nobody edited is written back exactly as it was read, in its place: vobject alone would change the escaping of some values it does not know, and upper-case Apple's `item1.` groups.

Emails, phones, addresses and links carry a `key`, their position among the lines of the same name, so an edit lands on the line it came from and keeps its other parameters, its group and its label.

Pictures are cropped in the browser, then decoded and written again as a 512 px JPEG by the backend, which never stores the bytes it was sent.

## Displaying mail

Message HTML goes through `symfony/html-sanitizer` on the backend, then into a sandboxed `iframe` on the frontend. The frame's Content-Security-Policy blocks remote images until the user allows them, once or for that sender. Attachments are served with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.

## Frontend

The interface lives in `frontend/src/components`, one component per part of the screen. None of them fetches anything: they take props and call back. `MailApp.tsx` is the container for mail, and `ContactsApp.tsx`, loaded when first opened, the one for the address book. They read data through the `MailHooks` contract (`hooks.ts`), implemented on top of the API in `api/mailHooks.ts` and `api/contactsHooks.ts`, which also hold the optimistic updates and undo.

The hooks hide two things from the components:

- UIDs are only unique within a folder. Rows from a search across folders get an encoded UID (the folder's slot above 2^32), decoded before any API call.
- A conversation row stands for all its messages, so actions on it apply to every message of the conversation.

## Container

One image runs two processes under supervisord:

- `php-fpm` on `127.0.0.1:9000`
- `caddy` on `:8080`, serving the frontend and passing `/api` to php-fpm, with every other path that is not a file going to the frontend's `index.html`

TLS stays on the reverse proxy. `docker/php.ini` and `docker/Caddyfile` both set the maximum request size, keep them aligned.
