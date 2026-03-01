# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Local development (without Docker)
```bash
# Backend (terminal 1)
cd backend && npm install
DEV_AUTO_LOGIN=true SECURE_COOKIES=false DATA_DIR=../data npm run dev

# Frontend (terminal 2)
cd frontend && npm install && npm run dev
```
Frontend runs on port 5173 and proxies `/api` → `localhost:3000` via `vite.config.ts`.

### Docker (primary workflow)
```bash
cp .env.example .env  # then edit .env
docker compose up --build
docker compose build  # rebuild only
```

### Backend scripts
```bash
cd backend
npm run dev    # ts-node-dev with hot reload
npm run build  # tsc → dist/
npm start      # node dist/index.js
```

### Frontend scripts
```bash
cd frontend
npm run dev    # Vite dev server
npm run build  # tsc + Vite build → dist/
```

## Architecture

### Request Flow
Browser → Express backend (port 3000) → serves built `frontend/dist/` as static files. In development, Vite dev server proxies `/api/*` to the backend.

### Authentication
Manual OIDC PKCE Authorization Code Flow in `backend/src/auth/oidc.ts` (no library). Session stored in files via `session-file-store`. Two auth methods are supported by `requireAuth` middleware:
1. Session cookie (`bt.sid`)
2. Bearer token (API tokens stored in user's JSON file)

`DEV_AUTO_LOGIN=true` bypasses OIDC entirely and logs in as `dev-user`.

### Data Storage
No database. All data is file-based:
- `data/users/{sanitized-userId}/bloodvalues.json` — user profile + blood entries + API tokens
- `data/users/{sanitized-userId}/chat_history.json` — AI chat history
- `data/reference_values.json` — reference values database (versioned, 39+ values)
- `data/sessions/` — express-session file store
- `data/ai_rate_limits.json` — AI request rate limiting (50/user/day)

All file I/O goes through `backend/src/services/fileStore.ts`. The reference DB is cached in-memory (`_referenceCache`); call `saveReferenceDatabase()` to invalidate the cache.

### Reference Values
`data/reference_values.json` has a `version` field (currently `2.2.0`). Values support gender-specific ranges via `ref_min_female`, `ref_max_female`, `ref_min_male`, `ref_max_male`. The helper `getEffectiveRange(ref, gender?)` in `frontend/src/lib/utils.ts` selects the correct range.

### LLM Integration
`backend/src/services/llm.ts` supports: `gemini`, `openai`, `anthropic`, `ollama`, `openai_compatible`. Provider selected via `LLM_PROVIDER` env var. `buildUserContext()` constructs the system prompt context from user blood data including gender-specific reference ranges.

### Admin Area
Routes under `/api/admin/reference` (protected by `requireAdmin`) allow CRUD on `reference_values.json`. Admin users are identified by OIDC `sub` claim or email, configured via `ADMIN_USER_IDS` env var (comma-separated).

## Key Conventions

### Backend
- All async route handlers use `asyncHandler()` from `middleware/requireAuth.ts`
- Config is validated at startup via Zod in `backend/src/config.ts`; access via `getConfig()`
- New routes must be registered in `backend/src/index.ts`

### Frontend
- Path alias `@/` maps to `frontend/src/`
- Auth state lives in `AuthContext` (`frontend/src/contexts/AuthContext.tsx`); access via `useAuth()` hook which exposes `{ user, loading, refetch }`
- `user.gender` is sourced from `/api/auth/me` and stored in `AuthUser`; pass it to `getValueStatus(value, ref, gender?)` and `getEffectiveRange(ref, gender?)` whenever evaluating blood values
- All API calls go through `frontend/src/lib/api.ts`

### Versioning (release commits)
Custom scheme: patch+1 unless patch≥9 then minor+1/patch=0, unless minor≥9 then major+1. Update `backend/package.json` and `frontend/package.json`, then `git tag -a vX.Y.Z`.
