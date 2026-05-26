import { drizzle } from 'drizzle-orm/d1';
import { lt } from 'drizzle-orm';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { rawLogs, rawMetrics } from './db/schema';
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

app.use('*', logger());
app.get('/', (c) => c.text('OK'));
app.route('/v1', v1);

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: CloudflareBindings) {
    const db = drizzle(env.claude_code_analytics_db);
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await Promise.all([
      db.delete(rawLogs).where(lt(rawLogs.timestamp, cutoff)),
      db.delete(rawMetrics).where(lt(rawMetrics.timestamp, cutoff)),
    ]);
  },
};
