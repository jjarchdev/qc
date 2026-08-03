# QM Playbook

Quality Management procedure playbook: employees browse published scenarios; admins create and manage all categories and scenarios. Fresh installs start **empty** — no sample data.

## Architecture

- **Render**: one Node web service builds the Vite SPA and runs Express (`server/index.js`), which serves `/api/*` and `dist/`.
- **Supabase**: Postgres is the durable store (required in production). The Express app uses the **secret** API key (`sb_secret_...`) server-side only — not legacy JWT API keys.

```
Browser → Render (Express + SPA) → Supabase Postgres
```

## Deploy (Supabase + Render)

See **[DEPLOY.md](DEPLOY.md)** for the full checklist:

1. Run `supabase/migrations/001_schema.sql` in Supabase
2. Set env vars on Render (`ADMIN_*`, `JWT_SECRET`, `SUPABASE_*`)
3. Admin creates categories, then published scenarios

Local Supabase check (after `.env` is filled):

```bash
npm run check:supabase
```

## Local development

```bash
cp .env.example .env
# Optional: fill SUPABASE_* for DB mode; otherwise file store under data/ (starts empty)
npm install
npm run dev
```

- UI: Vite (proxies `/api` to the API) — http://localhost:5173
- API: http://127.0.0.1:3001
- Dev admin password default: `admin123` (override with `ADMIN_PASSWORD`)

## Admin workflow

1. Open **Admin Portal** and sign in.
2. **Manage Categories** — create and name your categories (required before scenarios).
3. **Add Scenario** — pick a category, write the procedure, toggle **Published** for employee visibility.

Employees only see published scenarios.

## Security notes

- Keep the Supabase **secret** key (`SUPABASE_SECRET_KEY` / `sb_secret_...`) server-only — never `VITE_*`, and avoid legacy `service_role` JWTs
- Use a strong `ADMIN_PASSWORD`, long random `JWT_SECRET`, and preferably set `ADMIN_USER`
- Admin session is an httpOnly cookie (`qm_admin`); `JWT_SECRET` signs it. Keep `VITE_API_BASE` empty so the SPA stays same-origin.
- Categories and published scenarios are readable without login (by design for employees)
- `.env` is gitignored — never commit secrets
