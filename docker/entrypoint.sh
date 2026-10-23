#!/bin/sh
# Prepares the data volume and the database, then hands over to supervisord.
set -eu

mkdir -p "$APP_DATA_DIR"
chown -R www-data:www-data "$APP_DATA_DIR"

su-exec www-data php bin/console doctrine:migrations:migrate --no-interaction --allow-no-migration

exec supervisord -c /etc/supervisord.conf
