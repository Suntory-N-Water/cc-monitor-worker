import { sValidator } from '@hono/standard-validator';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import {
  type InsertActiveTime,
  type InsertCostUsage,
  type InsertSessionCount,
  type InsertTokenUsage,
  activeTime,
  costUsage,
  sessionCounts,
  tokenUsage,
} from '../db/schema';
import { resolvePluginId } from '../lib/plugin';
import {
  ATTR,
  METRIC,
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
    const pluginIdCache = new Map<string, number>();

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
            const raw = JSON.stringify(point);

            if (metricName === METRIC.COST_USAGE) {
              const { asDouble } = dataPointValue(point);
              if (asDouble !== undefined) {
                const pluginName = extractAttrString(
                  pointAttrs,
                  ATTR.PLUGIN_NAME,
                );
                const pluginId = pluginName
                  ? await resolvePluginId(db, pluginIdCache, {
                      name: pluginName,
                      marketplaceName: extractAttrString(
                        pointAttrs,
                        ATTR.MARKETPLACE_NAME,
                      ),
                    })
                  : null;
                costRows.push({
                  timestamp,
                  userEmail,
                  sessionId,
                  model,
                  costUsd: asDouble,
                  skillName: extractAttrString(pointAttrs, ATTR.SKILL_NAME),
                  pluginId,
                  appVersion,
                  raw,
                });
              }
              continue;
            }

            if (metricName === METRIC.TOKEN_USAGE) {
              const { asInt, asDouble } = dataPointValue(point);
              const tokenCount =
                asInt ??
                (asDouble !== undefined ? Math.round(asDouble) : undefined);
              if (tokenCount !== undefined) {
                const pluginName = extractAttrString(
                  pointAttrs,
                  ATTR.PLUGIN_NAME,
                );
                const pluginId = pluginName
                  ? await resolvePluginId(db, pluginIdCache, {
                      name: pluginName,
                      marketplaceName: extractAttrString(
                        pointAttrs,
                        ATTR.MARKETPLACE_NAME,
                      ),
                    })
                  : null;
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
                  raw,
                });
              }
              continue;
            }

            if (metricName === METRIC.SESSION_COUNT) {
              const { asInt, asDouble } = dataPointValue(point);
              const count =
                asInt ??
                (asDouble !== undefined ? Math.round(asDouble) : undefined);
              if (count !== undefined) {
                sessionRows.push({
                  timestamp,
                  userEmail,
                  sessionId,
                  count,
                  appVersion,
                  raw,
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
                raw,
              });
            }
          }
        }
      }
    }

    await Promise.all([
      costRows.length > 0 ? db.insert(costUsage).values(costRows) : null,
      tokenRows.length > 0 ? db.insert(tokenUsage).values(tokenRows) : null,
      sessionRows.length > 0
        ? db.insert(sessionCounts).values(sessionRows)
        : null,
      activeTimeRows.length > 0
        ? db.insert(activeTime).values(activeTimeRows)
        : null,
    ]);

    return c.json({ partialSuccess: {} });
  },
);
