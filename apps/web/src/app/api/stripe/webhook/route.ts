import type { NextRequest } from 'next/server';

import { handleWebhookEvent, isSignatureError } from '@postpilot/billing';

/**
 * POST /api/stripe/webhook — Stripe's callback, and the only thing that moves a
 * user between plans.
 *
 * Node runtime and force-dynamic because signature verification needs the exact
 * bytes Stripe sent: `req.text()` gives the raw body, and any parsing or
 * caching in front of it would invalidate the signature.
 *
 * Locally, forward events with:
 *   stripe listen --forward-to localhost:3000/api/stripe/webhook
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return new Response('Could not read request body', { status: 400 });
  }

  try {
    const result = await handleWebhookEvent(rawBody, signature);

    if (result.handled) {
      console.log(`[stripe] ${result.type} → user ${result.userId} on ${result.plan}`);
    } else if (result.detail && result.detail !== 'ignored') {
      console.warn(`[stripe] ${result.type} not applied: ${result.detail}`);
    }

    return Response.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // A bad signature will never verify however often it's resent, so it gets a
    // 400 and Stripe stops. Anything else — a database blip, a missing secret,
    // Stripe briefly unreachable — gets a 500 so Stripe retries with its own
    // backoff rather than dropping a subscription change on the floor.
    const badSignature = isSignatureError(err);
    console.error(`[stripe] webhook failed: ${message}`);

    return new Response(badSignature ? 'Invalid signature' : 'Webhook handler failed', {
      status: badSignature ? 400 : 500,
    });
  }
}
