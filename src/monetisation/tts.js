// /root/scrapletdashboard/src/monetisation/tts.js
import { getProductBySlug } from "./products.js";
import { createOrder } from "./orders.js";
import { issueEntitlement } from "./entitlements.js";
import { enqueueTTSJob } from "../tts/enqueue.js";

const PAID_TTS_PRIORITY = 100;

export async function createPaidTTSJob({
  creatorUserId,
  viewerUserId,
  text,
  voiceId = "en_GB-alba-medium",
  platform = "kick",
  channelSlug,
  paymentIntentId,
}) {
  const product = await getProductBySlug("tts_paid");
  if (!product) throw new Error("Paid TTS product not available");

  const order = await createOrder({
    creatorUserId,
    viewerUserId,
    totalCents: product.base_price_cents,
    paymentProvider: "stripe",
    paymentIntentId,
  });

  const entitlement = await issueEntitlement({
    orderId: order.id,
    productId: product.id,
    creatorUserId,
    viewerUserId,
    metadata: { text, voiceId, platform, channelSlug },
  });

  const ttsJob = await enqueueTTSJob({
    scrapletUserId: creatorUserId,
    platform,
    channelSlug,
    text,
    voiceId,
    source: "paid_tts",
    priority: PAID_TTS_PRIORITY,
    entitlementId: entitlement.id,
  });

  return { order, entitlement, ttsJob };
}
