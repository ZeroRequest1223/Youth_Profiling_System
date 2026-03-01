PostgreSQL setup (optional)

If you prefer PostgreSQL over the bundled SQLite, set the following environment variables before running migrations.

PowerShell example:

```powershell
$env:POSTGRES_DB = "lydo"
$env:POSTGRES_USER = "postgres"
$env:POSTGRES_PASSWORD = "yourpassword"
$env:POSTGRES_HOST = "localhost"
$env:POSTGRES_PORT = "5432"
```

Unix (bash) example:

```bash
export POSTGRES_DB=lydo
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=yourpassword
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
```

Create the database (run as a Postgres superuser):

```powershell
psql -U postgres -c "CREATE DATABASE lydo;"
```

Run migrations and start the dev server:

```powershell
python manage.py migrate
python manage.py runserver
```

Notes:
- If no Postgres env vars are provided, the project will continue to use `db.sqlite3` for local development.
- `psycopg2-binary` is already listed in `requirements.txt` and provides the adapter Django needs to connect to Postgres.
