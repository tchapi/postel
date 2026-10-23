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
file for user settings and the contacts cache, planned for phase 3.

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

Contacts will use the same trick against Davis once it supports a master user,
with CardDAV as the API: `addressbook-query` to fill a local cache,
`sync-collection` to refresh it, see
[spikes/2026-10-23-carddav.md](spikes/2026-10-23-carddav.md).

## Rendering mail

Message HTML goes through `symfony/html-sanitizer` on the backend, then into a
sandboxed `iframe` with `srcdoc` on the frontend. Remote images are stripped
unless the user asks for them. Attachments are served with
`Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.

## Container

One image, three processes under supervisord:

- `php-fpm` on `127.0.0.1:9000`
- `caddy` on `:8080`, serving `public/` and proxying PHP through FastCGI, with
  an SPA fallback for every path that is neither a file nor under `/api`

TLS stays on the reverse proxy. `docker/php.ini` and `docker/Caddyfile` carry
the request size limits, keep them aligned.
