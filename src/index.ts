import { Hono } from 'hono';
import type { Env } from './types';
import { verifyShopifyHmac } from './middleware/hmac';
import { handleRateRequest } from './handlers/rates';

const app = new Hono<{ Bindings: Env; Variables: { rawBody: string } }>();

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/rates', verifyShopifyHmac, handleRateRequest);

app.onError((err, c) => {
  console.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
  });
  return c.json({ error: 'Internal server error' }, 500);
});

app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

export default app;
