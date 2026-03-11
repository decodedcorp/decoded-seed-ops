# decoded-seed-ops

`decoded-seed-ops` is an ops dashboard MVP for building/curating cold-start candidates, filling source, and running review workflows.

This app does not run backend reflection/export. n8n workflows own downstream processing:
`Sync -> Ops Dashboard manual review -> Spotter -> Solver`.

## Stack

- Next.js App Router
- TypeScript
- Supabase (DB + Storage)
- Vercel (single deploy: web + server functions)

## 1) Local setup

1. Install dependencies.

```bash
npm install
```

2. Create `.env.local` from `.env.example` and fill values.

```bash
cp .env.example .env.local
```

3. Apply seed schema SQL.

- Use `db/seed_tables.sql` in your warehouse Supabase SQL editor.
- Ensure raw tables (`post`, `image`, `post_image`, `item`) already exist.

4. Run app.

```bash
npm run dev
```

Open `http://localhost:3000`.

## 2) Environment variables

### Public

- `NEXT_PUBLIC_APP_ENV`
- `NEXT_PUBLIC_APP_NAME`

### Server-only (never use `NEXT_PUBLIC_`)

- `APP_BASE_URL`
- `WAREHOUSE_SUPABASE_URL`
- `WAREHOUSE_SUPABASE_SERVICE_ROLE_KEY`
- `WAREHOUSE_DB_SCHEMA`
- `WAREHOUSE_STORAGE_BUCKET`
- `WAREHOUSE_STORAGE_PREFIX`
- `CANDIDATE_START_TS`
- `OPS_AUTH_PROVIDER`
- `OPS_AUDIT_ENABLED`

## 3) Vercel env setup

In Vercel Project Settings -> Environment Variables, add all keys from `.env.example`.

Important:

- Keep `WAREHOUSE_SUPABASE_SERVICE_ROLE_KEY` server-only.
- Do not expose sensitive tokens as `NEXT_PUBLIC_*`.

## 4) Implemented API routes

- `POST /api/candidates/build`
- `GET /api/candidates?status=draft`
- `GET /api/candidates/{id}/alternatives`
- `POST /api/candidates/{id}/source/select`
- `POST /api/candidates/{id}/approve`
- `POST /api/candidates/{id}/reject`

All responses use a unified format:

```json
{
  "ok": true,
  "data": {}
}
```

or

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "..."
  }
}
```

## 5) MVP pages

- `/candidates` draft list + build action
- `/candidates/[id]` details + source select + approve/reject

## Notes

- Backend reflection/export is handled by n8n server, not this app.
- Seed target tables are `seed_posts`, `seed_asset`, `seed_spots`, `seed_solutions`.
- Seed DB and backend DB are separated. No cross-DB FK assumptions.
- `backend_*_id` fields are reference IDs only.
- Candidate build rule follows:
  - `post.ts >= 2025-01-01_00-00-00`
  - `image.with_items = true`
