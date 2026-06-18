# SaaS Template

A blank-slate monorepo for starting new products quickly. It ships with authentication, a database, a fully typed API, and matching web + mobile clients — so you can delete the demo screens and start building features on day one.

## What's included

- **Turborepo** monorepo with npm workspaces.
- **Next.js (App Router)** web app with React 19.
- **Expo / React Native** mobile app (Expo Router) sharing the same typed API.
- **Better Auth** with email/password sign-in (email verification via Resend) and Google SSO ready to enable later, using the Prisma adapter. Its Expo plugin powers mobile auth.
- **Neon Postgres + Prisma** for data.
- **tRPC + TanStack React Query** for end-to-end typesafe API calls via hooks.
- **Zod** for shared validation schemas.
- **Tailwind CSS** (web) / **NativeWind** (mobile) for styling.
- **Radix UI** primitives (dialog, dropdown menu, etc.) on the web.
- **lucide** icons on both clients.

## Structure

```
apps/
  web/      Next.js web app
  mobile/   Expo React Native app
packages/
  api/      tRPC routers, context, and the AppRouter type
  db/       Prisma schema, client, and seed
  types/    Shared Zod schemas
  config/   Shared TypeScript configs
```

## Features out of the box

- A **login page on the root route** (`/`). Authenticated visitors are redirected to `/home`; unauthenticated visitors hitting a protected route are sent back here.
- A **`/home`** page that greets the signed-in user ("Hello {first name or email}").
- A **global navigation bar** with the user's avatar (photo or initials) on the left. The avatar opens a dropdown with a link to **`/settings`** and a **Sign out** button.
- A **`/settings`** page showing the user's profile, with an editable name and a **delete-account** flow gated behind a typed-confirmation modal.
- The same flows on mobile: sign-in, home greeting, and a settings screen with sign out + delete account.

## Getting started

1. **Install dependencies** (this also runs `prisma generate`):

   ```bash
   npm install
   ```

2. **Configure environment variables.** Copy `.env.example` to `.env` and fill in:

   - `DATABASE_URL` / `DIRECT_URL` — your Neon Postgres connection strings.
   - `AUTH_SECRET` — generate with `openssl rand -base64 32`.
   - `AUTH_URL` — e.g. `http://localhost:3000` in development.
   - `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — Google OAuth credentials.
   - `AUTH_RESEND_KEY` / `EMAIL_FROM` — Resend API key for magic-link email.

   Providers are added conditionally, so the app still boots with only some of these set.

3. **Create the database schema:**

   ```bash
   npm run db:migrate      # or: npm run db:push
   ```

4. **Run the web app:**

   ```bash
   npm run dev             # http://localhost:3000
   ```

5. **Run the mobile app:**

   ```bash
   npm run mobile
   ```

   For a phone to reach your local web server, set `EXPO_PUBLIC_API_URL` to your machine's LAN IP, e.g. `EXPO_PUBLIC_API_URL=http://192.168.1.42:3000 npm run mobile`.

## Common scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js web app |
| `npm run mobile` | Start the Expo dev server |
| `npm run build` | Build all apps via Turbo |
| `npm run typecheck` | Typecheck every workspace |
| `npm run db:migrate` | Create/apply a Prisma migration (dev) |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:seed` | Seed a demo user |
| `npm run format` | Prettier across the repo |

## Renaming the project

The workspace scope is `@saas/*`. To rebrand, find-and-replace `@saas/` with your own scope (e.g. `@acme/`) across `package.json` files and imports, and update `name`/`slug`/`scheme` in `apps/mobile/app.json`.

## How auth works

Authentication is handled by Better Auth, mounted at `/api/auth/*` in the web app. Email/password is the primary method; new accounts must verify their email (link sent via Resend) before signing in. Google SSO registers automatically when its env vars are present. The mobile app authenticates against the same server through Better Auth's Expo plugin, which persists the session cookie in SecureStore; the mobile tRPC client forwards that cookie on every request. Both clients therefore resolve to the exact same session shape on the server.
