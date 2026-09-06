import { sValidator } from '@hono/standard-validator';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import {
  type InsertApiError,
  type InsertApiRequest,
  type InsertCompaction,
  type InsertHookExecution,
  type InsertPluginEvent,
  type InsertRawLog,
  type InsertSkillEvent,
  type InsertSubagentCompletion,
  type InsertToolDecision,
  type InsertToolResult,
  type InsertUserPrompt,
  apiErrors,
  apiRequests,
  compaction,
  eventCatalog,
  hookExecutions,
  pluginEvents,
  rawLogs,
  skillEvents,
  subagentCompletions,
  toolDecisions,
  toolResults,
  userPrompt,
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
  const compactionRows: InsertCompaction[] = [];
  const userPromptRows: InsertUserPrompt[] = [];
  const apiErrorRows: InsertApiError[] = [];
  const subagentCompletionRows: InsertSubagentCompletion[] = [];
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

        if (!sessionId) {
          continue;
        }

        await upsertSession(db, {
          sessionId,
          userEmail,
          appVersion,
          timestamp,
          entrypoint: extractAttrString(attrs, ATTR.APP_ENTRYPOINT),
          terminalType: extractAttrString(attrs, ATTR.TERMINAL_TYPE),
        });

        if (eventName === EVENT.SKILL_ACTIVATED) {
          const pluginId = await resolvePluginIdFromAttrs(
            db,
            pluginIdCache,
            attrs,
          );
          skillRows.push({
            timestamp,
            sessionId,
            skillName: extractAttrString(attrs, ATTR.SKILL_NAME, ''),
            invocationTrigger: extractAttrString(
              attrs,
              ATTR.INVOCATION_TRIGGER,
              '',
            ),
            skillSource: extractAttrString(attrs, ATTR.SKILL_SOURCE, ''),
            pluginId,
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
            sessionId,
            pluginId,
          });
          continue;
        }

        if (eventName === EVENT.API_REQUEST) {
          apiRequestRows.push({
            timestamp,
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
            querySource: extractAttrString(attrs, ATTR.QUERY_SOURCE),
            promptId: extractAttrString(attrs, ATTR.PROMPT_ID),
            speed: extractAttrString(attrs, ATTR.SPEED),
            effort: extractAttrString(attrs, ATTR.EFFORT),
            eventSequence: extractAttrInt(attrs, ATTR.EVENT_SEQUENCE),
            costUsdMicros: extractAttrInt(attrs, ATTR.COST_USD_MICROS),
            requestId: extractAttrString(attrs, ATTR.REQUEST_ID),
          });
          continue;
        }

        if (eventName === EVENT.TOOL_RESULT) {
          toolResultRows.push({
            timestamp,
            sessionId,
            toolName: extractAttrString(attrs, ATTR.TOOL_NAME, ''),
            success: extractAttrBool(attrs, ATTR.SUCCESS, false),
            durationMs: extractAttrInt(attrs, ATTR.DURATION_MS, 0),
            promptId: extractAttrString(attrs, ATTR.PROMPT_ID, ''),
            toolUseId: extractAttrString(attrs, ATTR.TOOL_USE_ID, ''),
          });
          continue;
        }

        if (eventName === EVENT.HOOK_EXECUTION_COMPLETE) {
          hookExecutionRows.push({
            timestamp,
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
          });
          continue;
        }

        if (eventName === EVENT.TOOL_DECISION) {
          toolDecisionRows.push({
            timestamp,
            sessionId,
            toolName: extractAttrString(attrs, ATTR.TOOL_NAME, ''),
            decision: extractAttrString(attrs, ATTR.DECISION, ''),
            source: extractAttrString(attrs, ATTR.SOURCE, ''),
            promptId: extractAttrString(attrs, ATTR.PROMPT_ID, ''),
            toolUseId: extractAttrString(attrs, ATTR.TOOL_USE_ID, ''),
          });
          continue;
        }

        if (eventName === EVENT.COMPACTION) {
          // duration_ms / pre_tokens / post_tokens / success は stringValue で届く
          compactionRows.push({
            timestamp,
            sessionId,
            trigger: extractAttrString(attrs, ATTR.TRIGGER, ''),
            success: extractAttrBool(attrs, ATTR.SUCCESS, false),
            preTokens: extractAttrInt(attrs, ATTR.PRE_TOKENS, 0),
            postTokens: extractAttrInt(attrs, ATTR.POST_TOKENS, 0),
            durationMs: extractAttrInt(attrs, ATTR.DURATION_MS, 0),
            precomputeReuse: extractAttrString(attrs, ATTR.PRECOMPUTE_REUSE),
            promptId: extractAttrString(attrs, ATTR.PROMPT_ID),
          });
          continue;
        }

        if (eventName === EVENT.USER_PROMPT) {
          // prompt 本文は <REDACTED> で届くため保存しない
          userPromptRows.push({
            timestamp,
            sessionId,
            promptId: extractAttrString(attrs, ATTR.PROMPT_ID),
            promptLength: extractAttrInt(attrs, ATTR.PROMPT_LENGTH),
            commandName: extractAttrString(attrs, ATTR.COMMAND_NAME),
            commandSource: extractAttrString(attrs, ATTR.COMMAND_SOURCE),
          });
          continue;
        }

        if (eventName === EVENT.API_ERROR) {
          apiErrorRows.push({
            timestamp,
            sessionId,
            model: extractAttrString(attrs, ATTR.MODEL, ''),
            error: extractAttrString(attrs, ATTR.ERROR),
            statusCode: extractAttrInt(attrs, ATTR.STATUS_CODE),
            durationMs: extractAttrInt(attrs, ATTR.DURATION_MS),
            attempt: extractAttrInt(attrs, ATTR.ATTEMPT),
            requestId: extractAttrString(attrs, ATTR.REQUEST_ID),
            promptId: extractAttrString(attrs, ATTR.PROMPT_ID),
          });
          continue;
        }

        if (eventName === EVENT.SUBAGENT_COMPLETED) {
          subagentCompletionRows.push({
            timestamp,
            sessionId,
            agentType: extractAttrString(attrs, ATTR.AGENT_TYPE, ''),
            agentSource: extractAttrString(attrs, ATTR.AGENT_SOURCE),
            isBuiltIn: extractAttrBool(attrs, ATTR.IS_BUILT_IN),
            isAsync: extractAttrBool(attrs, ATTR.IS_ASYNC),
            totalTokens: extractAttrInt(attrs, ATTR.TOTAL_TOKENS),
            totalToolUses: extractAttrInt(attrs, ATTR.TOTAL_TOOL_USES),
            durationMs: extractAttrInt(attrs, ATTR.DURATION_MS),
            model: extractAttrString(attrs, ATTR.MODEL),
            finalModel: extractAttrString(attrs, ATTR.FINAL_MODEL),
            modelSwapped: extractAttrBool(attrs, ATTR.MODEL_SWAPPED),
            promptId: extractAttrString(attrs, ATTR.PROMPT_ID),
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
    compactionRows.length > 0
      ? db.insert(compaction).values(compactionRows)
      : null,
    userPromptRows.length > 0
      ? db.insert(userPrompt).values(userPromptRows)
      : null,
    apiErrorRows.length > 0 ? db.insert(apiErrors).values(apiErrorRows) : null,
    subagentCompletionRows.length > 0
      ? db.insert(subagentCompletions).values(subagentCompletionRows)
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
