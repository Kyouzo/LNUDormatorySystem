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

# Low-memory, sandbox-safe options. --no-defaults ignores Debian's /etc/mysql/* (log files, syslog, etc).
# Native AIO/io_uring off: Render's sandbox may block io_uring. Errors go to stderr = Render logs.
DB_OPTS="--no-defaults --user=mysql --datadir=/var/lib/mysql
  --innodb-use-native-aio=0 --innodb-buffer-pool-size=16M --innodb-buffer-pool-size-max=64M
  --innodb-log-file-size=8M --innodb-log-buffer-size=2M --performance-schema=OFF
  --skip-name-resolve --max-connections=30 --key-buffer-size=1M --tmp-table-size=8M
  --max-heap-table-size=8M --aria-pagecache-buffer-size=1M"

mkdir -p /run/mysqld
chown mysql:mysql /run/mysqld

# Rebuild the datadir every boot (data is ephemeral; avoids stale build-time state).
rm -rf /var/lib/mysql
mkdir -p /var/lib/mysql
chown -R mysql:mysql /var/lib/mysql
# shellcheck disable=SC2086
mariadb-install-db $DB_OPTS --skip-test-db --auth-root-authentication-method=socket

# shellcheck disable=SC2086
mariadbd $DB_OPTS --socket="$SOCK" --pid-file=/run/mysqld/mysqld.pid \
  --skip-networking &
DB_PID=$!

i=0
until mariadb-admin --socket="$SOCK" ping >/dev/null 2>&1; do
  if ! kill -0 "$DB_PID" 2>/dev/null; then
    st=0
    wait "$DB_PID" || st=$?
    echo "MariaDB process died (exit status $st); see its output above" >&2
    exit 1
  fi
  i=$((i + 1))
  if [ "$i" -gt 90 ]; then
    echo "MariaDB still starting after 90s; giving up" >&2
    exit 1
  fi
  sleep 1
done
echo "MariaDB ready after ${i}s"


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
DB_HOST=localhost
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
