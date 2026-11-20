# Deploying to Render (free, test only)

One Docker container runs Apache + PHP + MariaDB. The database is rebuilt from `database/schema.sql` and
`database/seed.sql` on every start.

## Steps
1. Push this repo to GitHub.
2. Render dashboard -> **New +** -> **Blueprint** (uses `render.yaml`), or **Web Service** -> connect the repo ->
   Runtime **Docker** -> Instance type **Free**. For a manual Web Service set the health check path to `/login/login.html`
   and add env vars `CSRF_ENFORCE=0`, `QR_ALLOW_STUDENT_ID=0` (`DB_PASS` is optional: one is generated at boot if missing).
3. Deploy, then open `https://<name>.onrender.com/login/login.html`.

Demo logins: see `README-LOCAL.md` section 3.

## Caveats
- The free instance sleeps after ~15 min idle; the first request afterwards takes about a minute (cold start + DB rebuild).
- **All data resets on every restart or redeploy** (new accounts, registrations, uploaded receipts and entrance slips,
  announcements): the database and uploads live inside the container.
- The QR camera scanner works because Render serves HTTPS.
- Behind Render's proxy `REMOTE_ADDR` is the proxy, so IP-based login/form throttling is shared by all visitors.
- Free instances have 512 MB RAM; Apache and MariaDB are tuned small.

## For real persistence
Use an external MySQL/MariaDB (set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` as Render env vars and drop MariaDB
from the Dockerfile/entrypoint) and object storage for uploads (the PHP writes to local disk today). Hosted databases such as
TiDB or Aiven require TLS; `connection/db_connect.php` uses a plain `new mysqli(...)` and would need `ssl_set()` /
`real_connect(..., MYSQLI_CLIENT_SSL)` added.
