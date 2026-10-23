# Architecture

A thin IMAP proxy with a single-page frontend, shipped as one container.

```
browser ──> Traefik ──(forward-auth: Authelia)──> webmail container
                                                   ├── Caddy      static assets + FastCGI
                                                   └── php-fpm    Symfony API
                                                         ├── IMAP ──> Dovecot   (master user)
                                                         ├── SMTP ──> Postfix   (submission)
                                                         └── CardDAV ──> Davis  (contacts)
```

## Stateless by design

Every API call opens an IMAP session, does its work and closes it. There is no
local copy of the mailbox, no sync job, no queue. On the same Docker network an
IMAP login costs a few milliseconds, which is cheaper than keeping a mailbox
index coherent.

Dovecot does the heavy lifting: `SORT`, `SEARCH`, `STATUS` and `PREVIEW` are
server side, so paging a large mailbox is one `UID SORT` and one `FETCH` of a
page of headers and snippets, about 40 ms on 20k messages.

`webklex/php-imap` is the transport (connection, folders, `APPEND`, `STORE`,
`MOVE`, raw commands). Its query builder and message parser are not used, see
[spikes/2026-10-23-imap.md](spikes/2026-10-23-imap.md). Messages are parsed
with `zbateson/mail-mime-parser`.

Drafts and sent mail live in IMAP (`APPEND`). The only local state is a SQLite
file for user settings and the contacts cache.

## Authentication

The container is only reachable through the reverse proxy, which runs
forward-auth against Authelia and sets `Remote-User`, `Remote-Email` and
`Remote-Name` on every request.

`RemoteUserAuthenticator` turns these headers into the current user, but only
when the request comes from a trusted proxy (`TRUSTED_PROXIES`). A request
reaching php-fpm from anywhere else is unauthenticated, headers or not. The
firewall is stateless: there is no session, no cookie, nothing to invalidate.

## Mailbox access without the user's password

The backend logs into Dovecot as `<login>*<master user>` with the master
password ([Dovecot master users](https://doc.dovecot.org/configuration_manual/authentication/master_users/)).
Dovecot opens the mailbox of `<login>` and the webmail never handles the user's
own credentials. `IMAP_LOGIN_ATTRIBUTE` picks which header is the login:
`email` for servers whose accounts are full addresses (docker-mailserver),
`username` otherwise.

Contacts use the same trick against Davis, with an app key: the backend logs
in as `<login>*<app id>` with the key's secret and Davis acts as `<login>`.
Autocomplete reads a local copy of the address books, since every CardDAV
request costs ~170 ms (Davis checks a bcrypt hash). The first search fills it,
then at most every five minutes and after the response has gone out, one
`PROPFIND` compares each book's sync token and a changed book is fetched again
whole with `addressbook-query`. See
[spikes/2026-10-23-carddav.md](spikes/2026-10-23-carddav.md).

## Rendering mail

Message HTML goes through `symfony/html-sanitizer` on the backend, then into a
sandboxed `iframe` with `srcdoc` on the frontend. Remote images are stripped
unless the user asks for them. Attachments are served with
`Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.

## Frontend

The interface lives in `frontend/src/components`, one component per screen
part, and none of them fetches anything: they take props and call back.
`MailApp.tsx` is the only container. It reads data through the `MailHooks`
contract (`hooks.ts`), implemented on top of the API in `api/mailHooks.ts`,
which is also where optimistic updates and undo live.

Two things the hooks hide from the components:

- UIDs are unique per folder only. Rows from a search across folders get an
  encoded UID (folder slot above 2^32), decoded before any API call.
- A conversation row stands for all its messages: actions on it are expanded
  to every UID of the conversation.

Remote images: the message is fetched with its images, and the sandboxed
frame's Content-Security-Policy blocks them until the user allows them, once
or for that sender.

## Container

One image, three processes under supervisord:

- `php-fpm` on `127.0.0.1:9000`
- `caddy` on `:8080`, serving `public/` and proxying PHP through FastCGI, with
  an SPA fallback for every path that is neither a file nor under `/api`

TLS stays on the reverse proxy. `docker/php.ini` and `docker/Caddyfile` carry
the request size limits, keep them aligned.
