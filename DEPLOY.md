# Deploy checklist: Supabase + Render

Follow these steps in order. The browser never talks to Supabase directly — only the Express server uses the Supabase **secret** key (`sb_secret_...`).

## 1. Supabase (one-time)

1. Create a project at https://supabase.com
2. Open **SQL Editor** → New query
3. Paste and run the full contents of [`supabase/migrations/001_schema.sql`](supabase/migrations/001_schema.sql)
4. Confirm tables exist under **Table Editor**: `categories`, `scenarios` (both empty is correct)
5. **Project Settings → API**:
   - Copy **Project URL** → use as `SUPABASE_URL`
   - Copy the **secret** key (`sb_secret_...`) → use as `SUPABASE_SECRET_KEY`
6. Do **not** use the legacy `service_role` / anon JWT keys. Do **not** put the secret key in any `VITE_*` variable.

### If check says permission denied

In the SQL Editor, run:

```sql
grant usage on schema public to anon, authenticated, service_role;
grant select on table public.categories to anon, authenticated, service_role;
grant all on table public.categories to service_role;
grant select on table public.scenarios to anon, authenticated, service_role;
grant all on table public.scenarios to service_role;
grant usage, select on all sequences in schema public to service_role;
grant select on public.scenarios_employee to anon, authenticated, service_role;
grant select on public.scenarios_admin to service_role;
```

### Clear old sample data (only if you ran an older seeded migration)

```sql
delete from public.scenarios;
delete from public.categories;
```

### Local verify (optional)

```bash
# .env must include SUPABASE_URL and SUPABASE_SECRET_KEY
npm run check:supabase
```

Expect `storage: supabase` from health, and `connected: true` / `keyType: "secret"` from the check script.

## 2. Render hosting

### Option A — Blueprint (recommended)

1. Push this repo to GitHub (do **not** commit `.env`)
2. Render Dashboard → **New** → **Blueprint** → select the repo
3. Confirm service `qm-playbook` from [`render.yaml`](render.yaml)
4. Set these environment variables:

| Variable | Required | Notes |
|----------|----------|--------|
| `NODE_ENV` | yes | Already `production` in render.yaml |
| `ADMIN_PASSWORD` | yes | Strong unique password |
| `JWT_SECRET` | yes | Long random string (32+ chars) — signs the httpOnly admin session cookie |
| `SUPABASE_URL` | yes | From Supabase |
| `SUPABASE_SECRET_KEY` | yes | New secret key (`sb_secret_...`), not legacy service_role |
| `ADMIN_USER` | recommended | Extra login gate (username) |
| `VITE_API_BASE` | no | Leave unset / empty (same-origin so the session cookie works) |

5. Deploy. Build: `npm ci --include=dev && npm run build`. Start: `node server/index.js`

### Option B — Manual Web Service

1. **New** → **Web Service** → connect the repo
2. Runtime: Node
3. Build command: `npm ci --include=dev && npm run build`
4. Start command: `node server/index.js`
5. Add the same env vars as above
6. Deploy

### After deploy

1. Open `https://YOUR-SERVICE.onrender.com`
2. Hit `/api/health` — expect `"storage":"supabase","ok":true`
3. Sign in at **Admin Portal** (use `ADMIN_USER` + `ADMIN_PASSWORD` if username is set)
4. **Manage Categories** → create categories
5. **Add Scenario** → publish so employees can see it
6. Open **Employee Access** and confirm the scenario appears

Free Render instances sleep when idle; the first request after sleep can take ~30–60s.

## 3. Security baseline (before sharing the URL)

- [ ] Strong `ADMIN_PASSWORD` (not `admin123`)
- [ ] Random `JWT_SECRET` (not a dictionary word) — used to sign the `qm_admin` httpOnly cookie
- [ ] `ADMIN_USER` set
- [ ] `.env` is gitignored and never committed
- [ ] Admin session is cookie-based (`HttpOnly`, `SameSite=Lax`, `Secure` in production) — no JWT in `sessionStorage` / JS
- [ ] Employee reads of categories + published scenarios remain public by design
- [ ] If secrets were ever shared or committed: rotate Supabase secret key + admin password + JWT secret in Supabase/Render

## 4. What you do not need

- Separate frontend and API services on Render
- Putting Supabase keys in the Vite build
- Redis, Docker, or Supabase Auth for day one
