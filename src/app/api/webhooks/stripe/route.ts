// src/app/api/webhooks/stripe/route.ts
// Per-event payment model: Only handle checkout completion for logging
// Event creation happens via API, not webhooks
import { stripe, STRIPE_WEBHOOK_SECRET } from '@/lib/stripe';
import { headers } from 'next/headers';
import Stripe from 'stripe';

export async function POST(req: Request) {
  const body = await req.text();
  const signature = headers().get('stripe-signature');

  if (!signature) {
    console.error('[Stripe Webhook] Missing stripe-signature header');
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured');
    return new Response('Webhook secret not configured', { status: 500 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Stripe Webhook] Signature verification failed:', errorMessage);
    return new Response(`Webhook signature verification failed: ${errorMessage}`, {
      status: 400,
    });
  }

  console.log('[Stripe Webhook] Received event:', event.type, 'id:', event.id);

  // Handle webhook events
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('[Stripe Webhook] Checkout session completed:', {
          sessionId: session.id,
          paymentStatus: session.payment_status,
          amountTotal: session.amount_total,
          userId: session.metadata?.userId,
        });
        // Note: Event creation happens via POST /api/events, not here
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('[Stripe Webhook] Payment intent succeeded:', paymentIntent.id);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('[Stripe Webhook] Payment intent failed:', paymentIntent.id);
        break;
      }

      default:
        console.log('[Stripe Webhook] Unhandled event type:', event.type);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Stripe Webhook] Error processing event:', errorMessage);
    return new Response(`Webhook processing error: ${errorMessage}`, {
      status: 500,
    });
  }
}
