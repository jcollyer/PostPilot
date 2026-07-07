# Screencast script — `instagram_business_content_publish`

Meta's Screen Recordings guide requires three things, all in one recording:
1. **Complete login flow** — from logged-out to logged-in.
2. **Permission granting** — the Business Login for Instagram button + the consent screen where the permission is granted.
3. **Data usage** — the user creating a post, publishing it, then viewing the published post live on the account.

Target length: **90–120 seconds.** One continuous take, English UI, on-screen captions, no audio (reviewers don't listen). Record at 1080p with a large cursor.

---

## Pre-flight checklist

- [ ] Latest build **deployed** (Publish now button + Published section are live).
- [ ] `IG_REDIRECT_URI` fix live so "Continue with Instagram" doesn't error.
- [ ] Recording the **production** site (real domain in the URL bar), not localhost/ngrok.
- [ ] **Logged out** of PostPilot before starting.
- [ ] Reviewer test **app account** ready (email + password) — the same one in the description box.
- [ ] Instagram **disconnected** in PostPilot so you can show the connect + consent step.
- [ ] Instagram **professional** test account ready to authorize.
- [ ] At least one **READY video** in the Media library to publish (short is fine).
- [ ] Notifications silenced, cursor enlarged, recorder at 1080p.

---

## Scene 1 — Login flow (logged-out → logged-in)  (0:00–0:15)

- **On screen:** PostPilot **/signin** page. URL bar visible.
- **Action:** Enter the reviewer test email + password, click Sign in, land on the dashboard.
- **Caption:** "App login (no Facebook login). Signing in with test credentials."

## Scene 2 — Connect Instagram + grant the permission  (0:15–0:40)

- **On screen:** Settings → Connections. Instagram Reels shows "Not connected."
- **Action:** Click **"Continue with Instagram."** Log in on Instagram, then let the **consent screen** fully display — this is where `instagram_business_content_publish` is granted. Click Allow, return to PostPilot showing the account **Connected** with its avatar + @username.
- **Caption:** "The user connects their Instagram professional account and grants instagram_business_content_publish on Instagram's consent screen."
- **Note:** Do not cut the consent screen — reviewers must see the permission being granted.

## Scene 3 — Create the post (the user's own content)  (0:40–1:00)

- **On screen:** Media library.
- **Action:** Select a READY video, confirm/add a caption, and add it to the queue (choose Instagram as a destination if prompted). Open the Queue page and show the item sitting in the queue.
- **Caption:** "The creator's own uploaded video + caption, added to the queue."

## Scene 4 — Publish it (uses the permission)  (1:00–1:20)

- **On screen:** Queue page. The item's row shows the **"Publish now"** button.
- **Action:** Hover the **"Publish now"** button for a beat, then click it. The row shows a **Publishing** spinner (Reels process for a few seconds), then the item moves into the **Published** section with a green **✓ IG** badge.
- **Caption:** "'Publish now' creates a media container and publishes the Reel via instagram_business_content_publish."

## Scene 5 — View the published post on the account  (1:20–1:45)

- **On screen:** First show the **Published** section's green **✓ IG** badge in PostPilot (click it — it links to the live post), then switch to the Instagram professional account.
- **Action:** Show the **newly published Reel live** on the account, with the caption matching what you queued.
- **Caption:** "The Reel is now live on the user's own Instagram professional account."

## Scene 6 — Close  (optional, 1:45–1:50)

- **Action:** Hold on the live Reel for 2–3 seconds, then stop.
- **Caption:** "PostPilot only publishes the user's own content to the account they connected."

---

## Tips to avoid a rejection

- Show the **whole flow in one take**: login → consent → create → Publish now → live Reel. Reviewers must be able to reproduce each step.
- Keep the **consent screen** in-frame (Scene 2) and the **"Publish now"** click clearly visible (Scene 4).
- Make the **live Reel** in Scene 5 unmistakably the same post you just published (matching caption).
- Everything on the **live production app** with the test credentials from your description box.
- English captions on every scene; no audio.

## If a Reel is still "Publishing" at Scene 5

Instagram finalizes Reels asynchronously, so the post can take up to ~1 minute to go live. Either pause the recording briefly and resume once the Published ✓ badge appears / the Reel is live, or trim the wait in editing — just make sure the final cut shows the published Reel on the account.
