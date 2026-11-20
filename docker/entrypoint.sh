#!/bin/sh
# Starts MariaDB, rebuilds the database from the repo SQL, then runs Apache.
set -eu

APP=/var/www/html
SOCK=/run/mysqld/mysqld.sock
DB_NAME=lnudormatorysystem
DB_USER=lnu
DB_PASS="${DB_PASS:-$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')}"

# Used verbatim inside SQL, so keep it to safe characters (Render's generated value qualifies).
case "$DB_PASS" in
  ''|*[!A-Za-z0-9+/=_.-]*) echo "DB_PASS must match [A-Za-z0-9+/=_.-]+" >&2; exit 1 ;;
esac

export APACHE_PORT="${PORT:-10000}"

mkdir -p /run/mysqld
chown mysql:mysql /run/mysqld
[ -d /var/lib/mysql/mysql ] || mariadb-install-db --user=mysql --datadir=/var/lib/mysql >/dev/null

mariadbd --user=mysql --datadir=/var/lib/mysql --bind-address=127.0.0.1 --port=3306 \
  --innodb-buffer-pool-size=32M --performance-schema=OFF --max-connections=40 &
DB_PID=$!

i=0
until mariadb-admin --socket="$SOCK" ping >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 60 ] || ! kill -0 "$DB_PID" 2>/dev/null; then
    echo "MariaDB did not become ready" >&2
    exit 1
  fi
  sleep 1
done

# Fresh DB every boot (data is intentionally ephemeral). 127.0.0.1 account covers skip-name-resolve.
mariadb --socket="$SOCK" -uroot <<SQL
DROP DATABASE IF EXISTS \`$DB_NAME\`;
CREATE OR REPLACE USER '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
CREATE OR REPLACE USER '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$DB_PASS';
CREATE DATABASE \`$DB_NAME\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
mariadb --socket="$SOCK" -uroot < "$APP/database/schema.sql"
mariadb --socket="$SOCK" -uroot < "$APP/database/seed.sql"

# bootstrap.php reads connection/.env (and real env vars, which win).
cat > "$APP/connection/.env" <<ENV
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=$DB_USER
DB_PASS=$DB_PASS
DB_NAME=$DB_NAME
CSRF_ENFORCE=${CSRF_ENFORCE:-0}
QR_ALLOW_STUDENT_ID=${QR_ALLOW_STUDENT_ID:-0}
ENV
chown root:www-data "$APP/connection/.env"
chmod 640 "$APP/connection/.env"

exec apache2-foreground
