# Screencast script — `instagram_business_content_publish`

Meta's Screen Recordings guide requires three things, all in one recording:
1. **Complete login flow** — from logged-out to logged-in.
2. **Permission granting** — the Business Login for Instagram button + the consent screen where the permission is granted.
3. **Data usage** — the user creating a post, publishing it, then viewing the published post live on the account.

Target length: **90–120 seconds.** One continuous take, English UI, on-screen captions, no audio (reviewers don't listen). Record at 1080p with a large cursor.

---

## Pre-flight checklist

- [ ] Recording the **production** site (real domain in the URL bar), not localhost/ngrok.
- [ ] **Logged out** of PostPilot before you start (the guide requires showing the full login).
- [ ] Reviewer test **app account** ready (email + password) — the same one you put in the description box.
- [ ] Instagram **disconnected** in PostPilot so you can show the connect + consent step.
- [ ] Instagram **professional** test account (@thedronalist) ready to authorize.
- [ ] At least one **READY video** available in the Media library to publish (short is fine).
- [ ] "Publish now" button is deployed (Queue rows → "Publish now").
- [ ] Notifications silenced, cursor enlarged, screen-record tool set to 1080p.

---

## Scene 1 — Login flow (logged-out → logged-in)  (0:00–0:15)

- **On screen:** PostPilot **/signin** page. URL bar visible.
- **Action:** Type the reviewer test email + password, click Sign in, land on the dashboard.
- **Caption:** "App login (no Facebook login). Signing in with test credentials."

## Scene 2 — Connect Instagram + grant the permission  (0:15–0:40)

- **On screen:** Settings → Connections. Instagram Reels shows "Not connected."
- **Action:** Click **"Continue with Instagram."** Log in on Instagram, then let the **consent screen** fully display — this is where `instagram_business_content_publish` is granted. Click Allow, return to PostPilot showing "Connected."
- **Caption:** "The user connects their Instagram professional account and grants instagram_business_content_publish on Instagram's consent screen."
- **Note:** Do not cut the consent screen — reviewers must see the permission being granted.

## Scene 3 — Create the post (the user's own content)  (0:40–0:60)

- **On screen:** Media library.
- **Action:** Select a READY video, add/confirm a caption, and add it to the queue (choose Instagram as a destination if prompted).
- **Caption:** "The creator's own uploaded video + caption, added to the queue."

## Scene 4 — Publish it (uses the permission)  (0:60–1:15)

- **On screen:** Queue page. The item's row shows the **"Publish now"** button.
- **Action:** Click **"Publish now."** The row status moves to **Publishing** (Reels process for a few seconds).
- **Caption:** "'Publish now' creates a media container and publishes the Reel via instagram_business_content_publish."
- **Note:** Hover the "Publish now" button for a beat before clicking so the reviewer clearly sees it.

## Scene 5 — View the published post on the account  (1:15–1:40)

- **On screen:** Switch to the Instagram professional account (app or web).
- **Action:** Show the **newly published Reel live** on @thedronalist. If helpful, open it so its caption matches what you queued.
- **Caption:** "The Reel is now live on the user's own Instagram professional account."

## Scene 6 — Close  (optional, 1:40–1:45)

- **Action:** Hold on the live Reel for 2–3 seconds, then stop.
- **Caption:** "PostPilot only publishes the user's own content to the account they connected."

---

## Tips to avoid a rejection

- Show the **whole flow in one take**: login → consent → create → Publish now → live Reel. Reviewers must be able to reproduce each step.
- Keep the **consent screen** in-frame (Scene 2) and the **"Publish now"** click clearly visible (Scene 4).
- Make the **live Reel** in Scene 5 unmistakably the same post you just published (matching caption).
- Everything on the **live production app** with the test credentials from your description box.
- English captions on every scene; no audio.

## If a Reel is still "Processing" at Scene 5

Instagram finalizes Reels asynchronously, so the post may take up to ~1 minute to appear. Either pause the recording briefly and resume once it's live, or trim the wait in editing — just make sure the final cut shows the published Reel on the account.
