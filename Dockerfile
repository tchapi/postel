# syntax=docker/dockerfile:1

# ---- frontend ---------------------------------------------------------------
FROM node:26-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- backend dependencies ---------------------------------------------------
FROM composer:2 AS composer
WORKDIR /app
COPY backend/composer.json backend/composer.lock backend/symfony.lock ./
RUN composer install --no-dev --no-scripts --no-progress --prefer-dist --ignore-platform-reqs

# ---- runtime ----------------------------------------------------------------
FROM caddy:2.10.2 AS caddy

FROM php:8.4-fpm-alpine
LABEL org.opencontainers.image.source="https://github.com/tchapi/webmail"

RUN apk add --no-cache supervisor icu-libs \
    && apk add --no-cache --virtual .build-deps icu-dev $PHPIZE_DEPS \
    && docker-php-ext-install -j"$(nproc)" intl opcache \
    && apk del .build-deps

COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY docker/supervisord.conf /etc/supervisord.conf
COPY docker/php.ini "$PHP_INI_DIR/conf.d/zz-webmail.ini"
COPY docker/php-fpm.conf /usr/local/etc/php-fpm.d/zz-webmail.conf

WORKDIR /app
ENV APP_ENV=prod
ENV APP_DATA_DIR=/app/var/data
COPY --chown=www-data:www-data backend/ ./
COPY --from=composer --chown=www-data:www-data /app/vendor ./vendor
COPY --from=frontend --chown=www-data:www-data /app/dist ./public

# Compile the container at build time. Env vars are read at runtime.
RUN php bin/console cache:warmup \
    && mkdir -p var/data \
    && chown -R www-data:www-data var
VOLUME /app/var/data

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
    CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null || exit 1

CMD ["supervisord", "-c", "/etc/supervisord.conf"]
