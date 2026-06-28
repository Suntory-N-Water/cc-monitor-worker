import { sValidator } from '@hono/standard-validator';
import { sql } from 'drizzle-orm';
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
  metricCatalog,
  rawMetrics,
  sessionCounts,
  tokenUsage,
} from '../db/schema';
import { chunk } from '../lib/array';
import {
  type CatalogEntry,
  catalogMapToRows,
  recordCatalogObservation,
} from '../lib/catalog';
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
    const catalogMap = new Map<string, CatalogEntry>();

    for (const resourceMetric of payload.resourceMetrics ?? []) {
      const appVersion = extractAttrString(
        resourceMetric.resource?.attributes,
        ATTR.SERVICE_VERSION,
        '',
      );
      for (const scopeMetric of resourceMetric.scopeMetrics ?? []) {
        for (const metric of scopeMetric.metrics ?? []) {
          const metricName = metric.name ?? '';
          const dataPoints =
            metric.sum?.dataPoints ?? metric.gauge?.dataPoints ?? [];

          for (const point of dataPoints) {
            const pointAttrs = point.attributes;
            const timestamp = nanoToIso(point.timeUnixNano);
            const userEmail = extractAttrString(
              pointAttrs,
              ATTR.USER_EMAIL,
              '',
            );
            const sessionId = extractAttrString(
              pointAttrs,
              ATTR.SESSION_ID,
              '',
            );

            rawMetricRows.push({
              timestamp,
              metricName,
              raw: JSON.stringify(point),
            });

            recordCatalogObservation(catalogMap, {
              name: metricName,
              timestamp,
              version: appVersion,
            });

            if (metricName === METRIC.COST_USAGE) {
              const { asDouble: costUsd = 0 } = dataPointValue(point);
              const pluginId = await resolvePluginIdFromAttrs(
                db,
                pluginIdCache,
                pointAttrs,
              );
              costRows.push({
                timestamp,
                userEmail,
                sessionId,
                model: extractAttrString(pointAttrs, ATTR.MODEL, ''),
                costUsd,
                querySource: extractAttrString(pointAttrs, ATTR.QUERY_SOURCE),
                agentName: extractAttrString(pointAttrs, ATTR.AGENT_NAME),
                speed: extractAttrString(pointAttrs, ATTR.SPEED),
                effort: extractAttrString(pointAttrs, ATTR.EFFORT),
                skillName: extractAttrString(pointAttrs, ATTR.SKILL_NAME),
                pluginId,
                appVersion,
              });
              continue;
            }

            if (metricName === METRIC.TOKEN_USAGE) {
              const tokenCount = dataPointInt(point) ?? 0;
              const pluginId = await resolvePluginIdFromAttrs(
                db,
                pluginIdCache,
                pointAttrs,
              );
              tokenRows.push({
                timestamp,
                userEmail,
                sessionId,
                model: extractAttrString(pointAttrs, ATTR.MODEL, ''),
                tokenType: extractAttrString(pointAttrs, ATTR.TYPE, ''),
                tokenCount,
                querySource: extractAttrString(pointAttrs, ATTR.QUERY_SOURCE),
                agentName: extractAttrString(pointAttrs, ATTR.AGENT_NAME),
                speed: extractAttrString(pointAttrs, ATTR.SPEED),
                effort: extractAttrString(pointAttrs, ATTR.EFFORT),
                skillName: extractAttrString(pointAttrs, ATTR.SKILL_NAME),
                pluginId,
                appVersion,
              });
              continue;
            }

            if (metricName === METRIC.SESSION_COUNT) {
              const count = dataPointInt(point) ?? 0;
              sessionRows.push({
                timestamp,
                userEmail,
                sessionId,
                count,
                appVersion,
              });
              continue;
            }

            if (metricName === METRIC.ACTIVE_TIME) {
              const { asDouble: durationSec = 0 } = dataPointValue(point);
              activeTimeRows.push({
                timestamp,
                userEmail,
                sessionId,
                type: extractAttrString(pointAttrs, ATTR.TYPE, ''),
                durationSec,
                appVersion,
              });
            }
          }
        }
      }
    }

    const catalogRows = catalogMapToRows(catalogMap);

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
      ...chunk(catalogRows, 10).map((rows) =>
        db
          .insert(metricCatalog)
          .values(rows)
          .onConflictDoUpdate({
            target: metricCatalog.name,
            set: {
              lastSeenAt: sql`CASE WHEN excluded.last_seen_at > ${metricCatalog.lastSeenAt} THEN excluded.last_seen_at ELSE ${metricCatalog.lastSeenAt} END`,
              lastSeenVersion: sql`CASE WHEN excluded.last_seen_at > ${metricCatalog.lastSeenAt} THEN excluded.last_seen_version ELSE ${metricCatalog.lastSeenVersion} END`,
            },
          }),
      ),
    ]);

    return c.json({ partialSuccess: {} });
  },
);
