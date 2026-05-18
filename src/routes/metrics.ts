import { sValidator } from '@hono/standard-validator';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { costUsage, sessionCounts, tokenUsage } from '../db/schema';
import { upsertPlugin } from '../lib/plugin';
import {
  ATTR,
  OtlpMetricsPayloadSchema,
  dataPointValue,
  extractAttrString,
  nanoToIso,
} from '../lib/otlp';

export const metricsRoute = new Hono<{ Bindings: CloudflareBindings }>();

metricsRoute.post(
  '/',
  sValidator('json', OtlpMetricsPayloadSchema),
  async (c) => {
    const payload = c.req.valid('json');
    const db = drizzle(c.env.claude_code_analytics_db);

    for (const resourceMetric of payload.resourceMetrics ?? []) {
      for (const scopeMetric of resourceMetric.scopeMetrics ?? []) {
        for (const metric of scopeMetric.metrics ?? []) {
          const metricName = metric.name ?? '';
          const dataPoints =
            metric.sum?.dataPoints ?? metric.gauge?.dataPoints ?? [];

          for (const point of dataPoints) {
            const pointAttrs = point.attributes;
            const timestamp = nanoToIso(point.timeUnixNano);
            const userEmail = extractAttrString(pointAttrs, ATTR.USER_EMAIL);
            const sessionId = extractAttrString(pointAttrs, ATTR.SESSION_ID);
            const skillName = extractAttrString(pointAttrs, ATTR.SKILL_NAME);
            const pluginName = extractAttrString(pointAttrs, ATTR.PLUGIN_NAME);
            const marketplaceName = extractAttrString(
              pointAttrs,
              ATTR.MARKETPLACE_NAME,
            );
            const model = extractAttrString(pointAttrs, ATTR.MODEL);
            const raw = JSON.stringify(point);

            const pluginId = pluginName
              ? await upsertPlugin(db, pluginName, marketplaceName)
              : null;

            if (metricName === 'claude_code.cost.usage') {
              const { asDouble } = dataPointValue(point);
              if (asDouble !== undefined) {
                await db.insert(costUsage).values({
                  timestamp,
                  userEmail,
                  sessionId,
                  model,
                  costUsd: asDouble,
                  skillName,
                  pluginId,
                  raw,
                });
              }
              continue;
            }

            if (metricName === 'claude_code.token.usage') {
              const { asInt } = dataPointValue(point);
              if (asInt !== undefined) {
                await db.insert(tokenUsage).values({
                  timestamp,
                  userEmail,
                  sessionId,
                  model,
                  tokenType: extractAttrString(pointAttrs, ATTR.TYPE),
                  tokenCount: asInt,
                  skillName,
                  pluginId,
                  raw,
                });
              }
              continue;
            }

            if (metricName === 'claude_code.session.count') {
              const { asInt } = dataPointValue(point);
              if (asInt !== undefined) {
                await db.insert(sessionCounts).values({
                  timestamp,
                  userEmail,
                  sessionId,
                  count: asInt,
                  raw,
                });
              }
            }
          }
        }
      }
    }

    return c.json({ partialSuccess: {} });
  },
);
