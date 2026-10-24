# Architecture

Webmail is a small API in front of an IMAP server, with a single-page frontend, shipped as one container.

```
browser ──> reverse proxy ──(forward-auth)──> webmail container
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

Drafts and sent mail are stored in IMAP. The only local state is a SQLite file with the user settings and the contacts cache.

## Authentication

The container is only reachable through the reverse proxy. The proxy runs forward-auth against an identity provider (Authelia, for instance), which sets `Remote-User`, `Remote-Email` and `Remote-Name` on every request it lets through.

`RemoteUserAuthenticator` turns these headers into the current user, but only when the request comes from a proxy listed in `TRUSTED_PROXIES`. A request from anywhere else is refused, whatever its headers. There is no session and no cookie on the webmail side.

When the identity provider's session ends, API calls get a `401`. The frontend then reloads the page, which goes back through the login page.

## Access to the mailbox without the user's password

The backend logs into Dovecot as `<login>*<master user>` with the master password ([Dovecot master users](https://doc.dovecot.org/configuration_manual/authentication/master_users/)). Dovecot opens the mailbox of `<login>`, so the webmail never handles the user's own password. SMTP submission uses the same login. `IMAP_LOGIN_ATTRIBUTE` picks which header is the login: `email` for servers whose accounts are full addresses, like docker-mailserver, `username` otherwise.

Dovecot limits the number of connections per user and IP address (`mail_max_userip_connections`, 10 by default). All the webmail's connections come from the container's address, which is why the app polls for new mail every 30 seconds instead of keeping connections open.

## Contacts

Contacts come from [Davis](https://github.com/tchapi/davis) over CardDAV, with an app key: the backend logs in as `<login>*<app id>` with the key's secret, and Davis acts as `<login>`.

Each CardDAV request costs about 170 ms, because Davis checks a bcrypt hash every time. So autocomplete never asks Davis directly. It searches a copy of the address books kept in SQLite:

- The first search fills the copy.
- After that, at most every five minutes and once the response has been sent, one `PROPFIND` reads each address book's sync token. An address book whose token changed is fetched again in full with `addressbook-query`.
- If Davis is down or refuses the key, the copy stays as it was.

## Displaying mail

Message HTML goes through `symfony/html-sanitizer` on the backend, then into a sandboxed `iframe` on the frontend. The frame's Content-Security-Policy blocks remote images until the user allows them, once or for that sender. Attachments are served with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.

## Frontend

The interface lives in `frontend/src/components`, one component per part of the screen. None of them fetches anything: they take props and call back. `MailApp.tsx` is the only container. It reads data through the `MailHooks` contract (`hooks.ts`), implemented on top of the API in `api/mailHooks.ts`, which also holds the optimistic updates and undo.

The hooks hide two things from the components:

- UIDs are only unique within a folder. Rows from a search across folders get an encoded UID (the folder's slot above 2^32), decoded before any API call.
- A conversation row stands for all its messages, so actions on it apply to every message of the conversation.

## Container

One image runs two processes under supervisord:

- `php-fpm` on `127.0.0.1:9000`
- `caddy` on `:8080`, serving the frontend and passing `/api` to php-fpm, with every other path that is not a file going to the frontend's `index.html`

TLS stays on the reverse proxy. `docker/php.ini` and `docker/Caddyfile` both set the maximum request size, keep them aligned.
