import type { Context, Next } from 'hono';
import type { Env } from '../types';

async function computeHmacSha256(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

export async function verifyShopifyHmac(
  c: Context<{ Bindings: Env; Variables: { rawBody: string } }>,
  next: Next
): Promise<Response | void> {
  const shopifyHmac = c.req.header('X-Shopify-Hmac-Sha256');

  if (!shopifyHmac) {
    console.error('Missing X-Shopify-Hmac-Sha256 header');
    return c.json({ error: 'Unauthorized: Missing HMAC signature' }, 401);
  }

  const body = await c.req.text();

  c.set('rawBody', body);

  const secret = c.env.SHOPIFY_SHARED_SECRET;
  const computedHmac = await computeHmacSha256(body, secret);

  const decodedShopifyHmac = atob(shopifyHmac);
  const shopifyHmacHex = Array.from(decodedShopifyHmac, (char) =>
    char.charCodeAt(0).toString(16).padStart(2, '0')
  ).join('');

  if (!timingSafeEqual(computedHmac, shopifyHmacHex)) {
    console.error('HMAC verification failed', {
      expected: shopifyHmacHex,
      computed: computedHmac,
    });
    return c.json({ error: 'Unauthorized: Invalid HMAC signature' }, 401);
  }

  await next();
}
