# Webmail

A lean, self-hosted webmail for a mail server you already run. Single
container, no database, no mailbox sync: the backend is a thin IMAP proxy and
the frontend is a single-page app.

- **Backend**: PHP 8.4, Symfony 7.4, [webklex/php-imap](https://github.com/Webklex/php-imap)
- **Frontend**: React 19, [Mantine](https://mantine.dev), TanStack Query, Vite, [Figtree](https://github.com/erikdkennedy/figtree) self-hosted
- **Container**: php-fpm + Caddy under supervisord, one image

> [!NOTE]
> Early days. The skeleton is here, the mailbox is not yet, see
> [docs/roadmap.md](docs/roadmap.md).

## How it fits in

The container sits behind a reverse proxy that does forward-auth (Traefik +
Authelia in the reference setup) and talks to Dovecot with a master user, so
the webmail never sees anybody's password. Details in
[docs/architecture.md](docs/architecture.md).

## Configuration

Everything is an environment variable.

| Variable               | Default       | Purpose                                                                                                 |
| ---------------------- | ------------- | ------------------------------------------------------------------------------------------------------- |
| `APP_SECRET`           |               | Random string, required                                                                                 |
| `TRUSTED_PROXIES`      |               | Comma-separated proxies allowed to set `Remote-User`. Set it to the reverse proxy, or nobody can log in |
| `IMAP_HOST`            | `mail`        | IMAP server                                                                                             |
| `IMAP_PORT`            | `143`         | IMAP port                                                                                               |
| `IMAP_ENCRYPTION`      | `false`       | `false`, `ssl` or `tls` (STARTTLS)                                                                      |
| `IMAP_VALIDATE_CERT`   | `true`        | Verify the IMAP certificate                                                                             |
| `IMAP_MASTER_USER`     | `webmail`     | Dovecot master user                                                                                     |
| `IMAP_MASTER_PASSWORD` |               | Its password, required                                                                                  |
| `IMAP_LOGIN_ATTRIBUTE` | `email`       | Which header is the IMAP login: `email` (`Remote-Email`) or `username` (`Remote-User`)                  |
| `SMTP_HOST` | `mail` | SMTP submission server, authenticated with the same master user |
| `SMTP_PORT` | `587` | Submission port |
| `SMTP_ENCRYPTION` | `tls` | `false`, `ssl` or `tls` (STARTTLS) |
| `SMTP_VALIDATE_CERT` | `true` | Verify the SMTP certificate |
| `LOGOUT_URL` | | Where Sign out goes, e.g. Authelia's logout page. Empty reloads the page |
| `APP_DATA_DIR` | `/app/var/data` | Uploads waiting to be sent, the settings database. Mount a volume there |
| `DATABASE_URL` | `sqlite:////app/var/data/webmail.db` | Settings storage, any Doctrine DSN. Migrations run at start |

### Dovecot master user

With [docker-mailserver](https://docker-mailserver.github.io/docker-mailserver/latest/config/advanced/dovecot-master-accounts/):

```sh
docker exec mailserver setup dovecot-master add webmail
```

Plain Dovecot: see [master users](https://doc.dovecot.org/configuration_manual/authentication/master_users/).

### Reverse proxy

The forward-auth middleware must pass `Remote-User`, `Remote-Email` and
`Remote-Name` to the container. With Traefik and Authelia:

```yaml
- 'traefik.http.middlewares.authelia.forwardauth.address=https://auth.example.com/api/authz/forward-auth'
- 'traefik.http.middlewares.authelia.forwardauth.trustForwardHeader=true'
- 'traefik.http.middlewares.authelia.forwardauth.authResponseHeaders=Remote-User,Remote-Groups,Remote-Name,Remote-Email'
```

## Running it

```sh
docker build -t webmail .
docker run --rm -p 8080:8080 \
  -e APP_SECRET=change-me \
  -e TRUSTED_PROXIES=172.16.0.0/12 \
  -e IMAP_HOST=mail -e IMAP_MASTER_PASSWORD=... \
  webmail
```

`compose.yaml` does the same with variables from a `.env` file.

## Developing

Backend, from `backend/` (PHP 8.4+ and Composer):

```sh
composer install
symfony serve --port=8000      # or: php -S 127.0.0.1:8000 -t public
composer lint && composer stan && composer test
```

Frontend, from `frontend/` (Node 22+):

```sh
npm install
npm run dev                    # proxies /api to the backend on :8000
npm run format && npm run lint && npm run typecheck && npm run build
```

There is no Authelia in front of the dev server, so the Vite proxy asserts the
identity itself (`alice` by default, see `frontend/.env.example`).

A throwaway mail server with a test account, a master user and a synthetic
mailbox (Docker required):

```sh
docker compose -f dev/mailserver/compose.yaml up -d
cd backend && php bin/console app:dev:seed-mailbox --count=2000
```

And a throwaway Davis for contacts, with 300 contacts for `alice`:

```sh
docker compose -f dev/davis/compose.yaml up -d
docker exec webmail-dev-davis sh -c 'cd /var/www/davis && APP_ENV=prod bin/console doctrine:migrations:migrate --no-interaction'
dev/davis/seed.sh
```

Then point the backend at the mail server in `backend/.env.local`:

```sh
IMAP_HOST=127.0.0.1
IMAP_PORT=1143
IMAP_MASTER_PASSWORD=master-password
```

In `dev`, loopback is a trusted proxy, so any client can impersonate a user
with the headers, which is the point:

```sh
curl -H 'Remote-User: alice' -H 'Remote-Email: alice@example.com' http://127.0.0.1:8000/api/folders
```

Findings from the technical spikes live in [docs/spikes](docs/spikes).

## License

[MIT](LICENSE)
