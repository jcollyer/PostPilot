-- Plans + Stripe billing.
--
-- `plan` is what cap enforcement reads. It is written by the Stripe webhook
-- rather than the post-checkout redirect: a redirect can be dropped by a closed
-- tab or forged by hand, whereas checkout.session.completed and
-- customer.subscription.* are what Stripe actually guarantees.
--
-- Subscription status is TEXT, not an enum. Stripe adds status values over time
-- and a Prisma enum that drifts from them turns an incoming webhook into a
-- crash — which, for billing, means silently losing subscription changes.
CREATE TYPE "Plan" AS ENUM ('FREE', 'CREATOR', 'PRO');

ALTER TABLE "user" ADD COLUMN "plan" "Plan" NOT NULL DEFAULT 'FREE';
ALTER TABLE "user" ADD COLUMN "planSelectedAt" TIMESTAMP(3);
ALTER TABLE "user" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "user" ADD COLUMN "stripeSubscriptionId" TEXT;
ALTER TABLE "user" ADD COLUMN "stripeSubscriptionStatus" TEXT;
ALTER TABLE "user" ADD COLUMN "stripePriceId" TEXT;
ALTER TABLE "user" ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);
ALTER TABLE "user" ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "user_stripeCustomerId_key" ON "user"("stripeCustomerId");
CREATE UNIQUE INDEX "user_stripeSubscriptionId_key" ON "user"("stripeSubscriptionId");

-- ---------------------------------------------------------------------------
-- Grandfathering
--
-- Every account that predates plans is assigned the smallest plan its current
-- usage fits inside, so nobody's next upload fails on a limit that did not
-- exist when they uploaded. Usage is measured exactly as @postpilot/usage
-- measures it: storage counts video sources still present plus images, while
-- the video count includes videos whose source retention already removed.
--
-- An account larger than PRO is put on PRO rather than left unassigned. It will
-- be over its cap and blocked from *new* uploads until it upgrades or clears
-- space, but nothing it already owns is touched — the queue keeps publishing
-- and no media is deleted.
--
-- planSelectedAt is stamped so existing accounts are not forced through the
-- selection gate on their next login. They keep their fitting plan without
-- paying; converting them to paid subscriptions is a separate, deliberate
-- decision rather than a side effect of this migration.
WITH usage AS (
    SELECT
        u.id AS user_id,
        COALESCE(v.bytes, 0) + COALESCE(i.bytes, 0) AS storage_bytes,
        COALESCE(v.video_count, 0) AS video_count
    FROM "user" u
    LEFT JOIN (
        SELECT
            "userId",
            SUM(CASE WHEN "sourceDeletedAt" IS NULL THEN COALESCE("fileSize", 0) ELSE 0 END) AS bytes,
            COUNT(*) AS video_count
        FROM "Video"
        GROUP BY "userId"
    ) v ON v."userId" = u.id
    LEFT JOIN (
        SELECT "userId", SUM(COALESCE("fileSize", 0)) AS bytes
        FROM "Image"
        GROUP BY "userId"
    ) i ON i."userId" = u.id
)
UPDATE "user" u
SET
    "plan" = CASE
        -- FREE: 25 videos / 5 GiB
        WHEN usage.video_count <= 25 AND usage.storage_bytes <= 5368709120 THEN 'FREE'::"Plan"
        -- CREATOR: 300 videos / 60 GiB
        WHEN usage.video_count <= 300 AND usage.storage_bytes <= 64424509440 THEN 'CREATOR'::"Plan"
        -- PRO: 1200 videos / 220 GiB, and the fallback for anything larger.
        ELSE 'PRO'::"Plan"
    END,
    "planSelectedAt" = CURRENT_TIMESTAMP
FROM usage
WHERE usage.user_id = u.id;
