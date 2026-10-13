# Google sign-in from the Expo app with Better Auth

Research for issue #55 (child of map #53). Researched 2026-10-13 against the
installed versions: `better-auth` 1.6.19, `@better-auth/expo` 1.6.19,
`expo` 54.0.35, `expo-web-browser` 15.0.11, `expo-linking` 8.0.12. Findings
below come from reading the installed package source in `node_modules`, plus the
docs and issues linked at the end.

## Answer in one paragraph

Use the browser-redirect flow that the `expo()`/`expoClient()` plugins already
support. Call `authClient.signIn.social({ provider: 'google', callbackURL: '/' })`.
The plugin opens `expo-web-browser`'s `openAuthSessionAsync`
(ASWebAuthenticationSession on iOS) on the server's
`/api/auth/expo-authorization-proxy`, Google redirects to the **server**
callback `<baseURL>/api/auth/callback/google`, and the server bounces back to
`postpilot://…?cookie=…` (dev build) or `exp://…/--/?cookie=…` (Expo Go). The
client then saves the cookie to SecureStore. The existing **Web application**
OAuth client is enough, and no iOS client ID is needed. Google only ever sees the
server callback, so the only Console change is to make sure that callback URI is
listed for the origin the server uses as `baseURL`. `trustedOrigins` needs no
change for a dev build (`postpilot://` already matches), or for Expo Go under
`next dev` (the expo plugin adds `exp://` itself when `NODE_ENV=development`).

**The one hard rule:** the mobile `API_URL` origin, the server `baseURL` origin
(`BETTER_AUTH_URL` ?? `AUTH_URL`), and the Google redirect URI origin must all be
the **same origin**. If they differ, the sign-in fails with `state_mismatch`
(details below). Today they differ locally: `AUTH_URL` in the root `.env` is an
ngrok HTTPS domain, while the mobile app defaults to `http://<Metro LAN IP>:3000`.

## How the flow actually works (from the installed source)

1. **Client `init` hook** (`@better-auth/expo/dist/client.js`). For
   `/sign-in/social` it converts a relative `callbackURL` (and
   `errorCallbackURL`/`newUserCallbackURL`) with `Linking.createURL(path)`:
   - dev build: `postpilot:///` (or `postpilot://<host>/`, but iOS only matches
     on the scheme, so either works)
   - Expo Go: `exp://<LAN-IP>:8081/--/` (expo-linking ignores custom schemes in Expo Go)

   It also sends an `expo-origin` header (`Linking.createURL('', { scheme })`). The
   server plugin copies that header into `Origin`, so the origin check passes.
   Requests use `credentials: 'omit'` and send the stored cookie by hand.
2. **Server `POST /api/auth/sign-in/social`** (`better-auth/dist/api/routes/sign-in.mjs`).
   It builds the Google URL with `redirectURI: ${ctx.context.baseURL}/callback/google`,
   using the **static server baseURL** and not the request host. Then it stores
   the state, either as a DB verification row (the default, because Prisma makes
   the setup stateful) or as a signed `state` cookie. It returns `{ url, redirect: true }`.
3. **Client `onSuccess` hook.** It sees `redirect: true` and opens
   `WebBrowser.openAuthSessionAsync(`${API_URL}/api/auth/expo-authorization-proxy?authorizationURL=<google url>`, callbackURL)`.
4. **Server `GET /expo-authorization-proxy`** (`@better-auth/expo/dist/index.js`).
   It sets the signed `better-auth.state` cookie **inside the browser session**
   and 302s to Google. The proxy exists because the cookie from step 2 landed in
   the app's fetch, not in the browser.
5. Google redirects to `<baseURL>/api/auth/callback/google?code&state`. In
   1.6.x `parseGenericState` checks the DB row **and** that the browser's signed
   `state` cookie equals `state` (the stricter check added in 1.4, which caused the
   famous `state_mismatch` reports). The cookie is only present if step 4 ran
   on the **same host** as the callback.
6. The callback creates or links the user and sets the session cookie. Then the
   expo plugin's `after` hook rewrites the redirect `Location` (the deep link,
   which must be a trusted origin) to append `?cookie=<Set-Cookie header>`.
7. ASWebAuthenticationSession sees the `postpilot`/`exp` scheme, closes, and
   returns `{ type: 'success', url }`. The client parses `cookie`, merges it
   into SecureStore under `postpilot_cookie`, and fires `$sessionSignal`, so
   `useSession` refetches.

   `signIn.social` does **not** navigate on native, so the screen must do it.
   On cancel (`type !== 'success'`) the hook just returns. `signIn.social` still
   resolves with no `error`, so check the session to tell success from cancel.

## Why the origins must match (the `state_mismatch` trap)

Step 4 sets the state cookie on whatever host `API_URL` points to. Step 5 reads
it on whatever host `baseURL` points to. In this repo:

- `apps/web/src/server/auth.ts`: `baseURL = BETTER_AUTH_URL ?? AUTH_URL ?? 'http://localhost:3000'`.
  Locally `AUTH_URL` is set to an **ngrok https domain**, so Google's
  `redirect_uri` is `https://<ngrok-domain>/api/auth/callback/google`.
- `apps/mobile/src/lib/config.ts`: `API_URL = EXPO_PUBLIC_API_URL ?? http://<Metro hostUri IP>:3000`.
  With `expo start` (LAN mode) that is something like `http://192.168.x.x:3000`,
  even in the iOS Simulator.

Different hosts mean the browser never sends the state cookie to the callback,
which gives `state_security_mismatch`. The user is then redirected to
`<baseURL>/api/auth/error?error=state_mismatch` and stuck there, because it is an
http(s) page and the auth session never closes. The same mismatch would also
break **web** Google sign-in when browsing `http://localhost:3000` while
`AUTH_URL` is the ngrok domain.

**Ways out, best first:**

- **(Recommended) Tunnel origin everywhere.** Set
  `EXPO_PUBLIC_API_URL=https://<same ngrok domain as AUTH_URL>` when testing
  Google. This works from the Simulator, a physical device and Expo Go. Google
  accepts it (https on a public-suffix domain). It also matches how
  TikTok/Instagram/YouTube callbacks already work locally.
- **Localhost everywhere (Simulator only).** Unset `AUTH_URL`/`BETTER_AUTH_URL`
  (or set both to `http://localhost:3000`), set
  `EXPO_PUBLIC_API_URL=http://localhost:3000`, and register
  `http://localhost:3000/api/auth/callback/google`. Google allows `http` only for
  `localhost`. The iOS Simulator shares the Mac's network, so `localhost` works
  there. It **cannot** work on a physical phone, and it breaks the other
  platform callbacks that need the ngrok origin.
- **Not recommended:** `account.skipStateCookieCheck: true` hides the
  mismatch but removes the CSRF binding between the browser and the flow.
  A LAN IP redirect URI (`http://192.168.x.x:3000/...`) is **rejected by Google**
  (no raw IPs, no plain http except localhost).

## Exact changes

### Google Cloud Console (human)

- [ ] Open the OAuth client whose ID is `AUTH_GOOGLE_ID` (a **Web application** client, the same one the web "Continue with Google" button uses). Under **Authorized redirect URIs**, make sure these are listed:
  - `https://<ngrok domain in AUTH_URL>/api/auth/callback/google` (local dev, recommended)
  - `http://localhost:3000/api/auth/callback/google` (only if you use the localhost-only setup)
  - `https://<production domain>/api/auth/callback/google` (when deploying; see DEPLOY.md step 4)
- [ ] No **iOS** OAuth client is needed for this flow. No custom-scheme redirect and no `exp://` URI go in Google. "Authorized JavaScript origins" are not used by the server-side redirect flow.
- [ ] OAuth consent screen: if publishing status is **Testing**, add each tester's Google account as a test user. The scopes `openid email profile` are non-sensitive, so no verification is needed for login itself. The project's YouTube scope does need verification, but that is a separate concern.

### Server `apps/web/src/server/auth.ts`

- [ ] **No change is required** for a dev build or for Expo Go under `next dev`:
  - Non-http origins match by prefix (`url.startsWith(pattern)` in
    `better-auth/dist/auth/trusted-origins.mjs`), so `postpilot://` already covers
    `postpilot:///`, `postpilot://anything/...`.
  - `expo()` injects `trustedOrigins: ['exp://']` when `NODE_ENV === 'development'`
    (`next dev` sets that), which covers every `exp://<ip>:<port>/--/...` URL.
- [ ] Optional, to make Expo Go explicit and self-documenting:
  ```ts
  trustedOrigins: [
    process.env.AUTH_URL ?? 'http://localhost:3000',
    `${APP_SCHEME}://`,
    ...(process.env.NODE_ENV === 'development' ? ['exp://'] : []),
  ],
  ```
  Never ship `exp://` in production.
- [ ] Optional: `account.accountLinking.trustedProviders: ['google']` only if
  you want Google to link to existing **unverified** email/password accounts.
  By default linking requires the local user's email to be verified
  (`requireLocalEmailVerified` defaults to true), and otherwise fails with
  `account not linked`. The default is the safer choice, so leave it.
- [ ] Fix the stale `.env.example` comment ("Defaults to 'saas'"): the code
  default for `MOBILE_APP_SCHEME` is `postpilot`. This is cosmetic.

### Mobile client `apps/mobile/src/lib/auth-client.ts`

- [ ] **No change.** `expoClient({ scheme: 'postpilot', storagePrefix: 'postpilot', storage: SecureStore })`
  is correct. `expo-web-browser` is already a dependency and in `app.json` plugins,
  and `scheme: "postpilot"` is set.

### Mobile dev env

- [ ] To test Google, start Metro with
  `EXPO_PUBLIC_API_URL=https://<ngrok domain in AUTH_URL> npx expo start`
  (Expo Go: add `--go`). Keep the ngrok tunnel to `localhost:3000` running.
  Alternatively, use the localhost-only setup above.

### Sign-in button `apps/mobile/app/signin.tsx`

- [ ] Add a "Continue with Google" button, for example:
  ```tsx
  async function handleGoogle() {
    setError(null);
    setNotice(null);
    setGooglePending(true);
    try {
      const { error } = await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/',          // -> postpilot:/// or exp://…/--/
        errorCallbackURL: '/signin', // closes the browser on server errors instead of stranding the user
      });
      if (error) {
        setError(error.message ?? 'Could not start Google sign-in.');
        return;
      }
      // Resolves after the auth sheet closes; the cookie (if any) is already in SecureStore.
      const { data } = await authClient.getSession();
      if (data?.session) router.replace('/');
      // else: user cancelled or the server redirected to errorCallbackURL; stay here
    } finally {
      setGooglePending(false);
    }
  }
  ```
  The expo plugin does not surface the `?error=` from `errorCallbackURL`. If a
  specific message is wanted, show a generic "Google sign-in didn't complete" when
  the session is missing and no cancel happened. Note that the `/signin` deep link
  also hits expo-router, which is harmless because the screen is already there.

## Dev build vs Expo Go

| | Dev build (`postpilot://`) | Expo Go (`exp://`) |
|---|---|---|
| `callbackURL: '/'` becomes | `postpilot:///` | `exp://<lan-ip>:8081/--/` |
| `expo-origin` header | `postpilot://` | `exp://<lan-ip>:8081` |
| Trusted by | `trustedOrigins` `postpilot://` | expo plugin's dev-only `exp://` (or explicit entry) |
| Works against `next start` / prod | yes | no (unless `exp://` is added explicitly; never in prod) |
| Native `@react-native-google-signin` (idToken) | possible | not available |

In both cases Google itself only sees the https/localhost server callback.

## Gotchas

- **Origin alignment** (above) is the main one. Google 400s
  `redirect_uri_mismatch` if the `baseURL` callback is not registered in the console.
- **ngrok free domains show an interstitial** ("You are about to visit…") to
  browser user agents. It may appear once inside the auth sheet. Tap through it;
  ngrok then remembers it for that browser. App `fetch` calls are not affected.
- **ASWebAuthenticationSession consent alert.** iOS shows "PostPilot wants to
  use <domain> to sign in". This is expected. `preferEphemeralSession` defaults
  to false, so Safari's Google session is reused. Set
  `webBrowserOptions: { preferEphemeralSession: true }` on `expoClient` to force a
  fresh account picker without the alert.
- **Embedded webviews are blocked by Google** (`disallowed_useragent`, enforced
  since Sept 2021). ASWebAuthenticationSession is a system browser and is fine.
  Never open the Google URL in a `WebView`.
- **Cancel looks like success.** `signIn.social` resolves without `error` when
  the user dismisses the sheet, so always confirm via `getSession()`.
- **Account linking.** A pre-existing email/password user with an
  **unverified** email gets `account not linked`. A verified user is linked automatically.
- **Secure cookie names.** Because `baseURL` is https locally, cookies are
  `__Secure-better-auth.*`. The expo client strips or handles the prefix, and the
  cookie is forwarded to tRPC via `authClient.getCookie()` unchanged. No action needed.
- **Version notes.** `state_mismatch` reports
  ([better-auth#5034](https://github.com/better-auth/better-auth/issues/5034)) came from the
  1.4 double-check (DB plus state cookie). The `expo-authorization-proxy` that sets the
  cookie in the browser fixes this for Expo, and it is present in 1.6.19. Reporters
  confirm upgrading both packages together fixes it. Keep `better-auth` and
  `@better-auth/expo` on the **same version**, as they are now (1.6.19).
  The 1.6 docs target Expo SDK 55. SDK 54 (New Architecture on) works with the same APIs.
- **Physical device.** It only works through the tunnel origin. `localhost` and LAN IPs
  can't be Google redirect URIs ([better-auth#4070](https://github.com/better-auth/better-auth/issues/4070)).

## Alternative considered: native idToken flow

`signIn.social({ provider: 'google', idToken: { token } })` with
`@react-native-google-signin/google-signin` gives a native account sheet and no
redirect URIs. However, it requires an **iOS OAuth client ID**, the config plugin and a
dev build (no Expo Go), and server `clientId` handling for the token audience. That
is more setup than needed today. Revisit it only if the browser sheet's UX is not
good enough.

## Sources

- Better Auth Expo integration (v1.6): https://better-auth.com/docs/1.6/integrations/expo
- Better Auth Expo integration (latest): https://www.better-auth.com/docs/integrations/expo
- better-auth#5034 (Expo `state_mismatch` with Google): https://github.com/better-auth/better-auth/issues/5034
- better-auth#4070 (Expo + Google redirect URI / ngrok): https://github.com/better-auth/better-auth/issues/4070
- Google redirect URI validation rules: https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation
- Google embedded-webview policy: https://developers.googleblog.com/2021/06/upcoming-security-changes-to-googles-oauth-2.0-authorization-endpoint.html
- Expo WebBrowser (SDK 54): https://docs.expo.dev/versions/v54.0.0/sdk/webbrowser/
- Installed source: `node_modules/@better-auth/expo/dist/{index,client}.js`,
  `node_modules/better-auth/dist/{state.mjs,oauth2/state.mjs,api/routes/sign-in.mjs,auth/trusted-origins.mjs,oauth2/link-account.mjs}`,
  `node_modules/expo-linking/build/{createURL,Schemes}.js`
