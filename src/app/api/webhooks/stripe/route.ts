// src/app/api/webhooks/stripe/route.ts
import { stripe, STRIPE_WEBHOOK_SECRET } from '@/lib/stripe';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import {
  syncSubscriptionFromStripe,
  handleSubscriptionDeleted,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
} from '@/lib/billing/sync';

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
      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('[Stripe Webhook] Subscription created:', subscription.id);
        await syncSubscriptionFromStripe(subscription);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('[Stripe Webhook] Subscription updated:', subscription.id);
        await syncSubscriptionFromStripe(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeCustomerId = subscription.customer as string;
        console.log('[Stripe Webhook] Subscription deleted:', subscription.id);
        await handleSubscriptionDeleted(stripeCustomerId);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId = invoice.customer as string;
        // In API version 2025-12-15.clover, subscription details are nested
        const stripeSubscriptionId = invoice.parent?.subscription_details?.subscription as
          | string
          | null;
        console.log('[Stripe Webhook] Invoice paid:', invoice.id);
        await handleInvoicePaid(stripeCustomerId, stripeSubscriptionId);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId = invoice.customer as string;
        console.log('[Stripe Webhook] Invoice payment failed:', invoice.id);
        await handleInvoicePaymentFailed(stripeCustomerId);
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
