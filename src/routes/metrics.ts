import { sValidator } from '@hono/standard-validator';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import {
  type InsertActiveTime,
  type InsertCostUsage,
  type InsertRawMetric,
  type InsertSessionCount,
  type InsertTokenUsage,
  activeTime,
  costUsage,
  rawMetrics,
  sessionCounts,
  tokenUsage,
} from '../db/schema';
import { chunk } from '../lib/array';
import { resolvePluginIdFromAttrs } from '../lib/plugin';
import {
  ATTR,
  METRIC,
  OtlpMetricsPayloadSchema,
  dataPointInt,
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
    const pluginIdCache = new Map<string, number>();

    const rawMetricRows: InsertRawMetric[] = [];
    const costRows: InsertCostUsage[] = [];
    const tokenRows: InsertTokenUsage[] = [];
    const sessionRows: InsertSessionCount[] = [];
    const activeTimeRows: InsertActiveTime[] = [];

    for (const resourceMetric of payload.resourceMetrics ?? []) {
      const appVersion = extractAttrString(
        resourceMetric.resource?.attributes,
        ATTR.SERVICE_VERSION,
      );
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
            const model = extractAttrString(pointAttrs, ATTR.MODEL);

            rawMetricRows.push({
              timestamp,
              metricName,
              raw: JSON.stringify(point),
            });

            if (metricName === METRIC.COST_USAGE) {
              const { asDouble } = dataPointValue(point);
              if (asDouble !== undefined) {
                const pluginId = await resolvePluginIdFromAttrs(
                  db,
                  pluginIdCache,
                  pointAttrs,
                );
                costRows.push({
                  timestamp,
                  userEmail,
                  sessionId,
                  model,
                  costUsd: asDouble,
                  skillName: extractAttrString(pointAttrs, ATTR.SKILL_NAME),
                  pluginId,
                  appVersion,
                });
              }
              continue;
            }

            if (metricName === METRIC.TOKEN_USAGE) {
              const tokenCount = dataPointInt(point);
              if (tokenCount !== undefined) {
                const pluginId = await resolvePluginIdFromAttrs(
                  db,
                  pluginIdCache,
                  pointAttrs,
                );
                tokenRows.push({
                  timestamp,
                  userEmail,
                  sessionId,
                  model,
                  tokenType: extractAttrString(pointAttrs, ATTR.TYPE),
                  tokenCount,
                  skillName: extractAttrString(pointAttrs, ATTR.SKILL_NAME),
                  pluginId,
                  appVersion,
                });
              }
              continue;
            }

            if (metricName === METRIC.SESSION_COUNT) {
              const count = dataPointInt(point);
              if (count !== undefined) {
                sessionRows.push({
                  timestamp,
                  userEmail,
                  sessionId,
                  count,
                  appVersion,
                });
              }
              continue;
            }

            if (metricName === METRIC.ACTIVE_TIME) {
              const { asDouble } = dataPointValue(point);
              activeTimeRows.push({
                timestamp,
                userEmail,
                sessionId,
                type: extractAttrString(pointAttrs, ATTR.TYPE),
                durationSec: asDouble,
                appVersion,
              });
            }
          }
        }
      }
    }

    // D1 の bound parameters 上限(100)を考慮して 10 行ずつ分割
    await Promise.all([
      ...chunk(rawMetricRows, 10).map((rows) =>
        db.insert(rawMetrics).values(rows),
      ),
      ...chunk(costRows, 10).map((rows) => db.insert(costUsage).values(rows)),
      ...chunk(tokenRows, 10).map((rows) => db.insert(tokenUsage).values(rows)),
      ...chunk(sessionRows, 10).map((rows) =>
        db.insert(sessionCounts).values(rows),
      ),
      ...chunk(activeTimeRows, 10).map((rows) =>
        db.insert(activeTime).values(rows),
      ),
    ]);

    return c.json({ partialSuccess: {} });
  },
);
