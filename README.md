# Unifeye

Unifeye is a Next.js 16 command center for turning uploaded course material into an action plan. It ingests a file, sends it to a Dify workflow, and surfaces follow-up actions for systems like Zulip, Artemis, and TUMonline.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Required environment variables

Set these in `.env.local` for local work, and in your hosting provider's server-side environment settings for production:

- `DIFY_API_URL`
- `DIFY_API_KEY`

These are optional depending on your workflow:

- `DIFY_USER_ID`
- `DIFY_INPUT_ZULIP_EMAIL`
- `DIFY_INPUT_ZULIP_API_KEY`
- `ZULIP_REALM_URL`
- `ZULIP_SUBSCRIPTIONS_URL`
- `ZULIP_EMAIL`
- `ZULIP_API_KEY`

## Secret safety

- Real keys stay in `.env.local` or your deployment platform's secret store.
- `.env*` files are ignored by git; only `.env.example` is tracked.
- Server-side env access is centralized in `lib/server-env.ts`, which rejects `NEXT_PUBLIC_` names for secrets.
- Do not place API keys in client components, `NEXT_PUBLIC_*` variables, or committed config files.

## Scripts

```bash
npm run dev
npm run build
npm run lint
```

## Deploy

Before deploying, add the required environment variables in your production platform and verify they are configured as server-only secrets.
