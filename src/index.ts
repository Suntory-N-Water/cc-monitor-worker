import { Hono } from 'hono';
import { logsRoute } from './routes/logs';
import { metricsRoute } from './routes/metrics';

type Env = { Bindings: CloudflareBindings };

const v1 = new Hono<Env>();

v1.use('*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader !== `Bearer ${c.env.OTEL_BEARER_TOKEN}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return next();
});

v1.route('/logs', logsRoute);
v1.route('/metrics', metricsRoute);

const app = new Hono<Env>();

app.get('/', (c) => c.text('OK'));
app.route('/v1', v1);

export default app;
