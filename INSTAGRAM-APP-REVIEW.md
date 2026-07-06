# Instagram App Review Guide — PostPilot

Goal: move PostPilot's Instagram integration from **Standard Access** (works only for accounts you own / added as testers) to **Advanced Access** (works for any user in production).

## Your setup (confirmed from the codebase)

- **Login type:** Instagram API *with Instagram Login* (`graph.instagram.com`, authorize at `instagram.com/oauth/authorize`). **No Facebook Page required** — ignore any guide that tells you to link a Page; that only applies to the Facebook-Login variant.
- **Permissions you must get Advanced Access for:**
  - `instagram_business_basic` — read profile + media list (used for account connect, profile snapshot, media backfill).
  - `instagram_business_content_publish` — create media containers + publish Reels. *(Shown in the App Review UI as "instagram_business_content_publishing".)*
- **What the app does with them:** connect an Instagram professional account via OAuth, read the profile/handle and recent media, and publish scheduled Reels from a public CDN URL via the two-step container → media_publish flow.
- **Platform:** Web only. Instagram Login only supports Web / mobile Web — reviewers will test the web app.

Because PostPilot serves *multiple businesses you don't own*, App Review is **required**. Budget ~1–4 weeks; business verification can add time if not already done.

---

## Requirement checklist

### A. Prerequisites (before you can submit)

- [ ] **Meta app is "Live", not "Development"** (App Dashboard → top toggle).
- [ ] **App type / use case** set to Instagram API with Instagram Login (Products → Instagram → *API setup with Instagram login*).
- [ ] **Business Verification** completed for the Meta Business Portfolio that owns the app, using **RushfordColler LLC** as the owning entity. Required for Advanced Access to these permissions. Needs the LLC's **legal name, registered address, and phone**, plus a verification method: an official document (Articles of Organization / Certificate of Formation, business license, or an IRS EIN letter such as CP-575 / 147C), or domain/phone/email verification. The name, address, and phone you enter must match the LLC's state registration **exactly** (including "LLC") — mismatch is the most common cause of verification failure. Add yourself as admin and your co-owner as an admin/employee on the portfolio.
- [ ] **App settings complete** (App Review will block until these exist):
  - App icon, 1024×1024. *(You don't appear to have one yet — create one.)*
  - Privacy Policy URL — you have `/privacy`. Must be publicly reachable at your production domain.
  - App Category set.
  - Business/Contact email set in Developer Settings (this is where review results are sent).
- [ ] **Data Deletion**: provide either a data-deletion callback URL or a data-deletion *instructions* URL. You already ship in-app account deletion (Settings) and a privacy page — add a short public page describing how a user requests deletion, or wire the callback. Don't skip this; it's a common silent blocker.
- [ ] **App is loadable and testable externally** — production URL works without VPN/allowlist, and the Instagram **login/connect button is visible** and follows Meta brand guidelines (don't restyle it into something unrecognizable).

### B. Make one real API call per permission (required)

Meta requires **at least 1 successful API call per requested permission**, logged, before it will grant Advanced Access. Do this on your Live app with a test professional account you've added:

- [ ] `instagram_business_basic` → a successful `GET /me?fields=user_id,username` (your connect flow already does this).
- [ ] `instagram_business_content_publish` → a full publish: `POST /{ig-user-id}/media` then `POST /{ig-user-id}/media_publish` (publish one real Reel).

Calls are logged within ~2 days. Submit **after** the calls show up.

### C. App Verification — reviewer login instructions

You must give reviewers step-by-step instructions and working **test credentials** to reach and exercise each permission. Draft below — paste into *Provide verification details*.

### D. Per-permission: description + screencast

One description and one end-to-end **screencast** per permission (drafts below). Screencast rules: English UI (or captions/tooltips), show the *whole* journey including the Instagram login/consent screen, and show the permission actually being used.

### E. Submit

Products → Instagram → *API setup with Instagram login* → **Complete app review** → *Continue to app review* → in **App Review → Requests**, click **Edit**, complete every action item (all check circles filled), then **Submit**.

---

## Draft copy you can paste

### App verification — instructions for reviewers

> PostPilot is a web app that publishes creators' short-form videos to Instagram on a schedule.
>
> 1. Go to https://<your-production-domain> and sign in with the test account: email `<reviewer@…>` / password `<…>`.
> 2. Go to **Settings → Connections** and click **Connect Instagram**. You'll be sent to Instagram's OAuth screen — log in with the provided Instagram **professional** test account (`<ig_test_handle>` / `<…>`) and approve the requested permissions. This exercises `instagram_business_basic` (we read the account's user_id, username, and recent media to show the connected profile).
> 3. Go to **Media**, upload/select the provided sample video, add a caption, and add it to the queue (or use **Publish now**).
> 4. The app creates a media container and publishes it as a Reel to the connected account — this exercises `instagram_business_content_publish`. The published Reel appears on the test Instagram account within ~1 minute.

### `instagram_business_basic` — how the app uses it

> After a creator connects their Instagram professional account via Instagram Login, PostPilot reads their `user_id` and `username` to display the connected account, and reads their recent media so the creator can confirm the correct account is linked and avoid re-queuing content that's already posted. We do not access ads or tagging. Data is used only to operate the user's own posting queue and is deleted on account disconnect/deletion.

### `instagram_business_content_publish` — how the app uses it

> PostPilot's core function is publishing a creator's own videos to their own Instagram professional account on a schedule they set. When a queued item is due, we create a media container (`POST /{ig-user-id}/media`) pointing at the creator's uploaded video on our CDN, then publish it (`POST /{ig-user-id}/media_publish`) as a Reel. Publishing only ever happens to the account the user explicitly connected and only for content the user uploaded and scheduled.

### Screencast script — `instagram_business_basic`

> 1. Land on PostPilot signed-in dashboard. 2. Settings → Connections → **Connect Instagram**. 3. Show the Instagram OAuth/consent screen and the permissions being requested. 4. Approve → return to app. 5. Show the now-connected account (handle/avatar) and the recent-media confirmation. Add a caption noting "reading username + media via instagram_business_basic."

### Screencast script — `instagram_business_content_publish`

> 1. From the connected account, go to Media and select a sample video + caption. 2. Add to queue / Publish now. 3. Show the publish action firing. 4. Cut to the test Instagram account showing the newly published Reel. Caption it "container created + published via instagram_business_content_publish."

---

## Common rejection reasons to pre-empt

- App not reachable / login button hidden or non-standard → reviewer can't test → rejected.
- Screencast doesn't show the **Instagram consent screen** or doesn't show the permission *actually being used*.
- Requesting a permission the reviewer can't reach with the provided test creds.
- Missing/369 business verification, missing data-deletion URL, or privacy policy not publicly loading.
- Test account is a **personal** IG account — it must be a **professional** (Business or Creator) account.
- Submitting before the required API calls have been logged.

## Sources

- [Instagram API with Instagram Login (no Page required, scope values)](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/)
- [App Review for Instagram API (submission steps, screencast, verification)](https://developers.facebook.com/docs/instagram-platform/app-review)
- [Graph API Access Levels (Standard vs Advanced)](https://developers.facebook.com/docs/graph-api/overview/access-levels)
- [Content Publishing (container → media_publish, 24h expiry)](https://developers.facebook.com/docs/instagram-platform/content-publishing)
