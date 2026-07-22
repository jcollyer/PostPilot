# Screencast script (v2) — `instagram_business_basic`

## Why v1 was rejected

Meta: "the submitted screencast fails to demonstrate the end-to-end experience." In practice this means the **Meta login flow and the permission-granting (Instagram consent) screen were not clearly shown**, and there were **no captions** explaining the UI. v2 fixes all three:
1. Show the complete login flow (start logged OUT).
2. Show the user granting the permission on **Instagram's consent screen** (start with Instagram DISCONNECTED).
3. Overlay an English caption at every step.

## Recording settings

- Record the **production** site, English UI, 1080p, large cursor, **no audio**.
- Add the **on-screen captions** below in your editor (iMovie, CapCut, ScreenPal, etc.). Captions are required — the reviewer specifically cited their absence.
- One continuous take, ~60–90 seconds.

## Pre-flight

- [ ] Logged **out** of PostPilot.
- [ ] Instagram **disconnected** in PostPilot (so the connect + consent happens on camera).
- [ ] Reviewer app test account ready (email + password).
- [ ] Instagram **professional** test account ready to authorize (has a profile picture).

---

## Shot list with caption overlays

**Shot 1 — Logged-out app (0:00–0:08)**
- Screen: PostPilot `/signin` page, URL bar visible.
- Caption to overlay: **"PostPilot — web app. Logging in with our own email/password (no Facebook Login)."**

**Shot 2 — Sign in (0:08–0:15)**
- Action: type the test email + password, click Sign in, land on dashboard.
- Caption: **"Signed in to PostPilot."**

**Shot 3 — Go to Connections (0:15–0:22)**
- Action: Settings → Connections. Instagram Reels shows "Not connected."
- Caption: **"Settings → Connections. Instagram is not connected yet."**

**Shot 4 — Start the Instagram login (0:22–0:28)**
- Action: hover, then click **"Continue with Instagram."**
- Caption: **"Clicking 'Continue with Instagram' to start Instagram Login."**

**Shot 5 — Instagram login + CONSENT screen (0:28–0:48)  ← the step that was missing**
- Action: log in on Instagram, then let the **authorization/consent screen fully display** — the page listing the requested permissions. Hold on it for ~4–5 seconds. Click **Allow**.
- Caption: **"Instagram's consent screen. The user grants access, including instagram_business_basic. Tapping Allow."**
- Do NOT cut or speed through this screen.

**Shot 6 — Back in app, connected (0:48–0:55)**
- Action: redirect returns to PostPilot's Connections page; the "Connected" state appears.
- Caption: **"Back in PostPilot — the Instagram professional account is now connected."**

**Shot 7 — Show the profile info from the permission (0:55–1:15)**
- Action: point the cursor at the **profile picture**, then the **@username** and "Connected ✓" badge. Hold ~5 seconds.
- Caption: **"Profile info read via instagram_business_basic: the account's profile picture and @username are displayed."**

**Shot 8 — Close (optional)**
- Caption: **"PostPilot uses this only to confirm the correct account and run the user's own posting queue."**

---

## Checklist before you upload

- [ ] Recording starts logged OUT and shows the PostPilot sign-in.
- [ ] The **Instagram consent screen is clearly visible** and held for several seconds.
- [ ] The connected **profile picture + @username** are clearly readable.
- [ ] English captions appear on every shot.
- [ ] No audio; production URL visible.
