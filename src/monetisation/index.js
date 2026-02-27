import { getProductBySlug } from './products.js';
import { createOrder } from './orders.js';
import { issueEntitlement } from './entitlements.js';
import { enqueueJob } from './jobs.js';

export async function purchasePaidTTS({
  creatorUserId,
  viewerUserId,
  text,
  voice,
  paymentIntentId
}) {
  const product = await getProductBySlug('tts_paid');
  if (!product) throw new Error('Paid TTS unavailable');

  const order = await createOrder({
    creatorUserId,
    viewerUserId,
    totalCents: product.base_price_cents,
    paymentProvider: 'stripe',
    paymentIntentId
  });

  const entitlement = await issueEntitlement({
    orderId: order.id,
    productId: product.id,
    creatorUserId,
    viewerUserId,
    metadata: { text, voice }
  });

  await enqueueJob({
    jobType: 'tts',
    entitlementId: entitlement.id,
    creatorUserId,
    priority: 100,
    payload: { text, voice }
  });

  return { order, entitlement };
}
