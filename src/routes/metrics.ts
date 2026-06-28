import { sValidator } from '@hono/standard-validator';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import {
  type InsertActiveTime,
  type InsertCostAmount,
  type InsertRawMetric,
  type InsertSessionCount,
  type InsertTokenAmount,
  type InsertUsageEvent,
  activeTime,
  costAmounts,
  metricCatalog,
  rawMetrics,
  sessionCounts,
  tokenAmounts,
  usageEvents,
} from '../db/schema';
import { chunk } from '../lib/array';
import {
  type CatalogEntry,
  catalogMapToRows,
  recordCatalogObservation,
} from '../lib/catalog';
import { resolvePluginIdFromAttrs } from '../lib/plugin';
import { upsertSession } from '../lib/session';
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

type UsageEventGroup = {
  row: InsertUsageEvent;
  costUsd?: number;
  tokens: Map<string, number>;
};

metricsRoute.post(
  '/',
  sValidator('json', OtlpMetricsPayloadSchema),
  async (c) => {
    const payload = c.req.valid('json');
    const db = drizzle(c.env.claude_code_analytics_db);
    const pluginIdCache = new Map<string, number>();

    const rawMetricRows: InsertRawMetric[] = [];
    const usageGroups = new Map<string, UsageEventGroup>();
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
            const endTimeNs = point.timeUnixNano ?? '';
            const startTimeNs = point.startTimeUnixNano ?? '';
            const timestamp = nanoToIso(endTimeNs);
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

            if (!sessionId || !startTimeNs) {
              continue;
            }

            await upsertSession(db, {
              sessionId,
              userEmail,
              appVersion,
              timestamp,
            });

            if (
              metricName === METRIC.COST_USAGE ||
              metricName === METRIC.TOKEN_USAGE
            ) {
              if (!endTimeNs) {
                continue;
              }
              const pluginId = await resolvePluginIdFromAttrs(
                db,
                pluginIdCache,
                pointAttrs,
              );
              const model = extractAttrString(pointAttrs, ATTR.MODEL, '');
              const querySource = extractAttrString(
                pointAttrs,
                ATTR.QUERY_SOURCE,
              );
              const agentName = extractAttrString(pointAttrs, ATTR.AGENT_NAME);
              const skillName = extractAttrString(pointAttrs, ATTR.SKILL_NAME);
              const key = JSON.stringify([
                sessionId,
                startTimeNs,
                endTimeNs,
                querySource,
                agentName,
                skillName,
                pluginId,
              ]);
              const existingGroup = usageGroups.get(key);
              const createdGroup: UsageEventGroup = {
                row: {
                  sessionId,
                  startTimeNs,
                  endTimeNs,
                  model,
                  querySource,
                  agentName,
                  speed: extractAttrString(pointAttrs, ATTR.SPEED),
                  effort: extractAttrString(pointAttrs, ATTR.EFFORT),
                  skillName,
                  pluginId,
                },
                tokens: new Map(),
              };
              const group = existingGroup ?? createdGroup;
              if (!existingGroup) {
                usageGroups.set(key, group);
              }
              if (!group.row.model && model) {
                group.row.model = model;
              }
              if (group.row.pluginId === null && pluginId !== null) {
                group.row.pluginId = pluginId;
              }

              if (metricName === METRIC.COST_USAGE) {
                const { asDouble: costUsd = 0 } = dataPointValue(point);
                group.costUsd = costUsd;
                continue;
              }

              const tokenType = extractAttrString(pointAttrs, ATTR.TYPE, '');
              if (tokenType) {
                group.tokens.set(tokenType, dataPointInt(point) ?? 0);
              }
              continue;
            }

            if (metricName === METRIC.SESSION_COUNT) {
              const count = dataPointInt(point) ?? 0;
              sessionRows.push({
                timestamp,
                sessionId,
                count,
              });
              continue;
            }

            if (metricName === METRIC.ACTIVE_TIME) {
              const { asDouble: durationSec = 0 } = dataPointValue(point);
              activeTimeRows.push({
                timestamp,
                sessionId,
                type: extractAttrString(pointAttrs, ATTR.TYPE, ''),
                durationSec,
              });
            }
          }
        }
      }
    }

    const catalogRows = catalogMapToRows(catalogMap);
    const usageEventEntries = [...usageGroups.values()];

    await Promise.all([
      ...chunk(rawMetricRows, 10).map((rows) =>
        db.insert(rawMetrics).values(rows),
      ),
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

    const usageEventIds: number[] = [];
    for (const rows of chunk(usageEventEntries, 10)) {
      const statements = rows.map((entry) =>
        db
          .insert(usageEvents)
          .values(entry.row)
          .onConflictDoUpdate({
            target: [
              usageEvents.sessionId,
              usageEvents.startTimeNs,
              usageEvents.endTimeNs,
              usageEvents.querySource,
              usageEvents.agentName,
              usageEvents.skillName,
              usageEvents.pluginId,
            ],
            set: {
              model: sql`COALESCE(NULLIF(${usageEvents.model}, ''), excluded.model, ${usageEvents.model})`,
              querySource: sql`COALESCE(${usageEvents.querySource}, excluded.query_source)`,
              agentName: sql`COALESCE(${usageEvents.agentName}, excluded.agent_name)`,
              speed: sql`COALESCE(${usageEvents.speed}, excluded.speed)`,
              effort: sql`COALESCE(${usageEvents.effort}, excluded.effort)`,
              skillName: sql`COALESCE(${usageEvents.skillName}, excluded.skill_name)`,
              pluginId: sql`COALESCE(${usageEvents.pluginId}, excluded.plugin_id)`,
            },
          })
          .returning({ id: usageEvents.id }),
      );
      const batchResult = await db.batch(
        statements as unknown as [
          (typeof statements)[0],
          ...(typeof statements)[0][],
        ],
      );
      for (const result of batchResult as unknown[]) {
        const [returnedRow] = result as { id: number }[];
        if (!returnedRow) {
          throw new Error('usage_events の UPSERT 後に id を取得できません');
        }
        usageEventIds.push(returnedRow.id);
      }
    }

    const costRows: InsertCostAmount[] = [];
    const tokenRows: InsertTokenAmount[] = [];
    for (const [index, entry] of usageEventEntries.entries()) {
      const usageEventId = usageEventIds[index];
      if (usageEventId === undefined) {
        throw new Error('usage_events と amount 行の対応に失敗しました');
      }
      if (entry.costUsd !== undefined) {
        costRows.push({ usageEventId, costUsd: entry.costUsd });
      }
      for (const [tokenType, tokenCount] of entry.tokens) {
        tokenRows.push({ usageEventId, tokenType, tokenCount });
      }
    }

    const amountStatements = [
      ...chunk(costRows, 10).map((rows) =>
        db.insert(costAmounts).values(rows).onConflictDoNothing(),
      ),
      ...chunk(tokenRows, 10).map((rows) =>
        db.insert(tokenAmounts).values(rows).onConflictDoNothing(),
      ),
    ];
    if (amountStatements.length > 0) {
      await db.batch(
        amountStatements as unknown as [
          (typeof amountStatements)[0],
          ...(typeof amountStatements)[0][],
        ],
      );
    }

    return c.json({ partialSuccess: {} });
  },
);
