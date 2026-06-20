import { sValidator } from '@hono/standard-validator';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import {
  type InsertApiRequest,
  type InsertHookExecution,
  type InsertPluginEvent,
  type InsertRawLog,
  type InsertSkillEvent,
  type InsertToolDecision,
  type InsertToolResult,
  apiRequests,
  eventCatalog,
  hookExecutions,
  pluginEvents,
  rawLogs,
  skillEvents,
  toolDecisions,
  toolResults,
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
  EVENT,
  OtlpLogsPayloadSchema,
  extractAttrBool,
  extractAttrDouble,
  extractAttrInt,
  extractAttrString,
  nanoToIso,
} from '../lib/otlp';

export const logsRoute = new Hono<{ Bindings: CloudflareBindings }>();

logsRoute.post('/', sValidator('json', OtlpLogsPayloadSchema), async (c) => {
  const payload = c.req.valid('json');
  const db = drizzle(c.env.claude_code_analytics_db);
  const pluginIdCache = new Map<string, number>();

  const rawLogRows: InsertRawLog[] = [];
  const skillRows: InsertSkillEvent[] = [];
  const toolDecisionRows: InsertToolDecision[] = [];
  const pluginEventRows: InsertPluginEvent[] = [];
  const apiRequestRows: InsertApiRequest[] = [];
  const toolResultRows: InsertToolResult[] = [];
  const hookExecutionRows: InsertHookExecution[] = [];
  const catalogMap = new Map<string, CatalogEntry>();

  for (const resourceLog of payload.resourceLogs ?? []) {
    const appVersion = extractAttrString(
      resourceLog.resource?.attributes,
      ATTR.SERVICE_VERSION,
      '',
    );
    for (const scopeLog of resourceLog.scopeLogs ?? []) {
      for (const record of scopeLog.logRecords ?? []) {
        const attrs = record.attributes;
        const eventName = extractAttrString(attrs, ATTR.EVENT_NAME);
        const timestamp = nanoToIso(record.timeUnixNano);
        const userEmail = extractAttrString(attrs, ATTR.USER_EMAIL, '');
        const sessionId = extractAttrString(attrs, ATTR.SESSION_ID, '');

        rawLogRows.push({
          timestamp,
          eventName,
          raw: JSON.stringify(record),
        });

        recordCatalogObservation(catalogMap, {
          name: eventName,
          timestamp,
          version: appVersion,
        });

        if (eventName === EVENT.SKILL_ACTIVATED) {
          const pluginId = await resolvePluginIdFromAttrs(
            db,
            pluginIdCache,
            attrs,
          );
          skillRows.push({
            timestamp,
            userEmail,
            sessionId,
            skillName: extractAttrString(attrs, ATTR.SKILL_NAME, ''),
            invocationTrigger: extractAttrString(
              attrs,
              ATTR.INVOCATION_TRIGGER,
              '',
            ),
            skillSource: extractAttrString(attrs, ATTR.SKILL_SOURCE, ''),
            pluginId,
            appVersion,
          });
          continue;
        }

        if (
          eventName === EVENT.PLUGIN_LOADED ||
          eventName === EVENT.PLUGIN_INSTALLED
        ) {
          const pluginId = await resolvePluginIdFromAttrs(
            db,
            pluginIdCache,
            attrs,
          );
          if (pluginId === null) {
            continue;
          }
          pluginEventRows.push({
            timestamp,
            eventName,
            userEmail,
            sessionId,
            pluginId,
            appVersion,
          });
          continue;
        }

        if (eventName === EVENT.API_REQUEST) {
          apiRequestRows.push({
            timestamp,
            userEmail,
            sessionId,
            model: extractAttrString(attrs, ATTR.MODEL, ''),
            costUsd: extractAttrDouble(attrs, ATTR.COST_USD, 0),
            durationMs: extractAttrInt(attrs, ATTR.DURATION_MS, 0),
            inputTokens: extractAttrInt(attrs, ATTR.INPUT_TOKENS, 0),
            outputTokens: extractAttrInt(attrs, ATTR.OUTPUT_TOKENS, 0),
            cacheReadTokens: extractAttrInt(attrs, ATTR.CACHE_READ_TOKENS, 0),
            cacheCreationTokens: extractAttrInt(
              attrs,
              ATTR.CACHE_CREATION_TOKENS,
              0,
            ),
            appVersion,
          });
          continue;
        }

        if (eventName === EVENT.TOOL_RESULT) {
          toolResultRows.push({
            timestamp,
            userEmail,
            sessionId,
            toolName: extractAttrString(attrs, ATTR.TOOL_NAME, ''),
            success: extractAttrBool(attrs, ATTR.SUCCESS, false),
            durationMs: extractAttrInt(attrs, ATTR.DURATION_MS, 0),
            promptId: extractAttrString(attrs, ATTR.PROMPT_ID, ''),
            toolUseId: extractAttrString(attrs, ATTR.TOOL_USE_ID, ''),
            appVersion,
          });
          continue;
        }

        if (eventName === EVENT.HOOK_EXECUTION_COMPLETE) {
          hookExecutionRows.push({
            timestamp,
            userEmail,
            sessionId,
            hookEvent: extractAttrString(attrs, ATTR.HOOK_EVENT, ''),
            hookName: extractAttrString(attrs, ATTR.HOOK_NAME, ''),
            numHooks: extractAttrInt(attrs, ATTR.NUM_HOOKS, 0),
            numSuccess: extractAttrInt(attrs, ATTR.NUM_SUCCESS, 0),
            numBlocking: extractAttrInt(attrs, ATTR.NUM_BLOCKING, 0),
            numNonBlockingError: extractAttrInt(
              attrs,
              ATTR.NUM_NON_BLOCKING_ERROR,
              0,
            ),
            totalDurationMs: extractAttrInt(attrs, ATTR.TOTAL_DURATION_MS, 0),
            promptId: extractAttrString(attrs, ATTR.PROMPT_ID, ''),
            appVersion,
          });
          continue;
        }

        if (eventName === EVENT.TOOL_DECISION) {
          toolDecisionRows.push({
            timestamp,
            userEmail,
            sessionId,
            toolName: extractAttrString(attrs, ATTR.TOOL_NAME, ''),
            decision: extractAttrString(attrs, ATTR.DECISION, ''),
            source: extractAttrString(attrs, ATTR.SOURCE, ''),
            promptId: extractAttrString(attrs, ATTR.PROMPT_ID, ''),
            toolUseId: extractAttrString(attrs, ATTR.TOOL_USE_ID, ''),
            appVersion,
          });
        }
      }
    }
  }

  const catalogRows = catalogMapToRows(catalogMap);

  await Promise.all([
    rawLogRows.length > 0 ? db.insert(rawLogs).values(rawLogRows) : null,
    skillRows.length > 0 ? db.insert(skillEvents).values(skillRows) : null,
    pluginEventRows.length > 0
      ? db.insert(pluginEvents).values(pluginEventRows)
      : null,
    apiRequestRows.length > 0
      ? db.insert(apiRequests).values(apiRequestRows)
      : null,
    toolResultRows.length > 0
      ? db.insert(toolResults).values(toolResultRows)
      : null,
    hookExecutionRows.length > 0
      ? db.insert(hookExecutions).values(hookExecutionRows)
      : null,
    toolDecisionRows.length > 0
      ? db.insert(toolDecisions).values(toolDecisionRows)
      : null,
    // D1 の bound parameters 上限を考慮して 10 行ずつに分割
    ...chunk(catalogRows, 10).map((rows) =>
      db
        .insert(eventCatalog)
        .values(rows)
        .onConflictDoUpdate({
          target: eventCatalog.name,
          set: {
            lastSeenAt: sql`CASE WHEN excluded.last_seen_at > ${eventCatalog.lastSeenAt} THEN excluded.last_seen_at ELSE ${eventCatalog.lastSeenAt} END`,
            lastSeenVersion: sql`CASE WHEN excluded.last_seen_at > ${eventCatalog.lastSeenAt} THEN excluded.last_seen_version ELSE ${eventCatalog.lastSeenVersion} END`,
          },
        }),
    ),
  ]);

  return c.json({ partialSuccess: {} });
});
