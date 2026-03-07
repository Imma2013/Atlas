import crypto from 'node:crypto';

const STRIPE_API_URL = 'https://api.stripe.com/v1';

const stripeRequest = async (
  path: string,
  body: URLSearchParams,
): Promise<Record<string, any>> => {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error('Missing STRIPE_SECRET_KEY');
  }

  const response = await fetch(`${STRIPE_API_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Stripe API request failed (${response.status}): ${text}`);
  }

  return response.json();
};

export const createCheckoutSession = async (input: {
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}) => {
  const body = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': input.priceId,
    'line_items[0][quantity]': '1',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });

  if (input.customerEmail) {
    body.set('customer_email', input.customerEmail);
  }

  Object.entries(input.metadata || {}).forEach(([key, value]) => {
    body.set(`metadata[${key}]`, value);
  });

  return stripeRequest('/checkout/sessions', body);
};

export const createPortalSession = async (input: {
  customerId: string;
  returnUrl: string;
}) => {
  const body = new URLSearchParams({
    customer: input.customerId,
    return_url: input.returnUrl,
  });

  return stripeRequest('/billing_portal/sessions', body);
};

export const verifyStripeWebhookSignature = (input: {
  payload: string;
  signatureHeader: string;
  secret: string;
  toleranceSeconds?: number;
}) => {
  const tolerance = input.toleranceSeconds ?? 300;
  const items = input.signatureHeader.split(',');
  const timestampItem = items.find((entry) => entry.startsWith('t='));
  const signatureItem = items.find((entry) => entry.startsWith('v1='));

  if (!timestampItem || !signatureItem) {
    return { ok: false, reason: 'Malformed stripe signature header' };
  }

  const timestamp = Number(timestampItem.replace('t=', ''));
  const signature = signatureItem.replace('v1=', '');

  if (!Number.isFinite(timestamp)) {
    return { ok: false, reason: 'Invalid stripe signature timestamp' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > tolerance) {
    return { ok: false, reason: 'Stripe signature timestamp outside tolerance window' };
  }

  const signedPayload = `${timestamp}.${input.payload}`;
  const expected = crypto
    .createHmac('sha256', input.secret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'hex');
  const providedBuffer = Buffer.from(signature, 'hex');

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return { ok: false, reason: 'Stripe signature mismatch' };
  }

  return { ok: true as const };
};
