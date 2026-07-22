# Screencast script (v2) — `instagram_business_content_publish`

## Why v1 was rejected

Meta: "the submitted screencast fails to demonstrate the end-to-end experience." The fix is the same as for the other permission — **show the complete login flow, the Instagram consent screen where the permission is granted, and add English captions** — plus clearly show the publish happening and the Reel going live.

## Recording settings

- Record the **production** site, English UI, 1080p, large cursor, **no audio**.
- Add the **on-screen captions** below in your editor. Captions are required.
- One continuous take, ~90–120 seconds.

## Pre-flight

- [ ] Latest build deployed (Publish now + Published section live).
- [ ] `IG_REDIRECT_URI` fix live so the connect step doesn't error.
- [ ] Logged **out** of PostPilot.
- [ ] Instagram **disconnected** in PostPilot.
- [ ] Reviewer app test account ready (email + password).
- [ ] Instagram **professional** test account ready to authorize.
- [ ] A short **READY video** in the Media library.

---

## Shot list with caption overlays

**Shot 1 — Logged-out app (0:00–0:08)**
- Screen: PostPilot `/signin`, URL bar visible.
- Caption: **"PostPilot — web app. Logging in with our own email/password (no Facebook Login)."**

**Shot 2 — Sign in (0:08–0:15)**
- Action: enter test email + password → dashboard.
- Caption: **"Signed in to PostPilot."**

**Shot 3 — Connect Instagram (0:15–0:22)**
- Action: Settings → Connections → click **"Continue with Instagram."**
- Caption: **"Connecting the Instagram professional account via Instagram Login."**

**Shot 4 — Instagram login + CONSENT screen (0:22–0:45)  ← the step that was missing**
- Action: log in on Instagram, let the **consent screen fully display** (it lists the permissions, including content publishing). Hold ~4–5 seconds. Click **Allow**, return to PostPilot showing the connected account.
- Caption: **"Instagram's consent screen. The user grants access, including instagram_business_content_publish. Tapping Allow."**
- Do NOT cut this screen.

**Shot 5 — Create the post (0:45–1:05)**
- Action: Media library → select the READY video → confirm/add a caption → add to queue. Open the Queue page.
- Caption: **"The creator's own uploaded video + caption, added to the queue."**

**Shot 6 — Publish it (1:05–1:25)**
- Action: on the queue row, hover then click **"Publish now."** The row shows a **Publishing** spinner, then moves to the **Published** section with a green ✓ IG badge.
- Caption: **"'Publish now' creates a media container and publishes the Reel via instagram_business_content_publish."**

**Shot 7 — View the live Reel (1:25–1:45)**
- Action: in PostPilot, click the green **✓ IG** badge (it links to the post) OR switch to the Instagram professional account, and show the **published Reel live**, caption matching what you queued.
- Caption: **"The Reel is now live on the user's own Instagram professional account."**

**Shot 8 — Close (optional)**
- Caption: **"PostPilot only publishes the user's own content to the account they connected."**

---

## Checklist before you upload

- [ ] Recording starts logged OUT and shows the PostPilot sign-in.
- [ ] The **Instagram consent screen is clearly visible** and held for several seconds.
- [ ] The **"Publish now" click** is clearly shown.
- [ ] The **published Reel is shown live** on the account (matching caption).
- [ ] English captions on every shot; no audio; production URL visible.

## If a Reel is still "Publishing" at Shot 7

Reels finalize asynchronously (up to ~1 min). Pause the recording and resume once the ✓ badge / live Reel appears, or trim the wait in editing — the final cut must show the published Reel.
