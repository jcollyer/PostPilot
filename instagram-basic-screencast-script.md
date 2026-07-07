# Screencast script — `instagram_business_basic`

Goal (Meta's two requirements):
1. Show how an Instagram professional account connects to the app.
2. Show the connected account's profile info (username, profile pic, or other) from the previous step.

Target length: **60–90 seconds.** One continuous take, no cuts. English UI. Add the on-screen captions listed below (Meta reviewers rely on them).

---

## Pre-flight checklist (before you hit record)

- [ ] Recording the **production** site (not localhost/ngrok) — the URL bar must show your real domain.
- [ ] Signed in to PostPilot as your **reviewer test account**.
- [ ] The Instagram **professional** test account (@thedronalist) is logged out of / ready to authorize, with a profile picture set.
- [ ] Instagram is currently **disconnected** in PostPilot, so you can show the full connect flow from scratch. (Disconnect it first if needed.)
- [ ] Screen recorder set to 1080p, cursor visible, system notifications silenced.
- [ ] Have the caption text below ready to overlay (or narrate calmly if you prefer voice).

---

## Scene 1 — Establish the live app  (0:00–0:08)

- **On screen:** PostPilot dashboard, signed in. URL bar clearly visible.
- **Action:** Slowly move the cursor to the address bar so the production domain is unmistakable.
- **Caption:** "PostPilot — live web app. Signed in as a creator."

## Scene 2 — Go to Connections  (0:08–0:18)

- **On screen:** Navigate to **Settings → Connections**.
- **Action:** Click into Settings, then Connections. Let the Platforms card render with Instagram Reels showing "Not connected."
- **Caption:** "Settings → Connections. Instagram is not connected yet."

## Scene 3 — Start the Instagram connection  (0:18–0:26)

- **On screen:** The **"Continue with Instagram"** button (with the Instagram glyph) on the Instagram Reels row.
- **Action:** Hover the button for a beat, then click it.
- **Caption:** "The creator clicks 'Continue with Instagram' to connect their professional account."

## Scene 4 — Instagram login + consent  (0:26–0:45)

- **On screen:** Instagram's own OAuth authorization window.
- **Action:** Log in with the professional test account, then let the **permissions/consent screen** fully display. Do **not** cut this — reviewers must see the requested permissions. Click **Allow**.
- **Caption:** "Instagram's consent screen. The user grants access, including instagram_business_basic."
- **Note:** Don't linger on the typed password; move to the consent screen promptly.

## Scene 5 — Redirect back + success  (0:45–0:55)

- **On screen:** Redirect back to PostPilot's Connections page; the green "Connected Instagram Reels." confirmation appears.
- **Action:** Let the page settle on the connected state.
- **Caption:** "Back in PostPilot — the account is now connected."

## Scene 6 — Show the profile info (the key requirement)  (0:55–1:15)

- **On screen:** The connected Instagram Reels row: the **real profile picture (avatar)**, the **@username** in bold, and the **"Connected ✓"** badge.
- **Action:** Move the cursor to the avatar, then to the `@username`. Pause here for ~5 seconds so it's clearly readable.
- **Caption:** "Profile info read via instagram_business_basic: the account's profile picture and username (@thedronalist) are displayed."

## Scene 7 — Close  (1:15–1:25, optional)

- **On screen:** Same connected row.
- **Action:** Hold for 2–3 seconds, then stop recording.
- **Caption:** "PostPilot uses this only to confirm the correct account and operate the user's own posting queue."

---

## Tips to avoid a rejection

- Keep the **consent screen** in the recording — the most common `_basic` rejection is not showing it.
- Make sure the **username and profile picture are clearly visible and readable** in Scene 6; don't rush past it.
- Everything must happen on the **live production app** the reviewer can also reach with your test credentials.
- No jump cuts — a single continuous flow from button click → consent → connected profile is what reviewers want to see.
- English captions on every scene so the reviewer can follow without audio.
