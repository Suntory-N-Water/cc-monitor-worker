import { sValidator } from '@hono/standard-validator';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import {
  type InsertApiRequest,
  type InsertHookExecution,
  type InsertPluginEvent,
  type InsertRawLog,
  type InsertSkillEvent,
  type InsertToolResult,
  apiRequests,
  hookExecutions,
  pluginEvents,
  rawLogs,
  skillEvents,
  toolResults,
} from '../db/schema';
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
  const pluginEventRows: InsertPluginEvent[] = [];
  const apiRequestRows: InsertApiRequest[] = [];
  const toolResultRows: InsertToolResult[] = [];
  const hookExecutionRows: InsertHookExecution[] = [];

  for (const resourceLog of payload.resourceLogs ?? []) {
    const appVersion = extractAttrString(
      resourceLog.resource?.attributes,
      ATTR.SERVICE_VERSION,
    );
    for (const scopeLog of resourceLog.scopeLogs ?? []) {
      for (const record of scopeLog.logRecords ?? []) {
        const attrs = record.attributes;
        const eventName = extractAttrString(attrs, ATTR.EVENT_NAME);
        const timestamp = nanoToIso(record.timeUnixNano);
        const userEmail = extractAttrString(attrs, ATTR.USER_EMAIL);
        const sessionId = extractAttrString(attrs, ATTR.SESSION_ID);

        rawLogRows.push({
          timestamp,
          eventName,
          raw: JSON.stringify(record),
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
            skillName: extractAttrString(attrs, ATTR.SKILL_NAME),
            invocationTrigger: extractAttrString(
              attrs,
              ATTR.INVOCATION_TRIGGER,
            ),
            skillSource: extractAttrString(attrs, ATTR.SKILL_SOURCE),
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
            model: extractAttrString(attrs, ATTR.MODEL),
            costUsd: extractAttrDouble(attrs, ATTR.COST_USD),
            durationMs: extractAttrInt(attrs, ATTR.DURATION_MS),
            inputTokens: extractAttrInt(attrs, ATTR.INPUT_TOKENS),
            outputTokens: extractAttrInt(attrs, ATTR.OUTPUT_TOKENS),
            cacheReadTokens: extractAttrInt(attrs, ATTR.CACHE_READ_TOKENS),
            cacheCreationTokens: extractAttrInt(
              attrs,
              ATTR.CACHE_CREATION_TOKENS,
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
            toolName: extractAttrString(attrs, ATTR.TOOL_NAME),
            success: extractAttrBool(attrs, ATTR.SUCCESS),
            durationMs: extractAttrInt(attrs, ATTR.DURATION_MS),
            promptId: extractAttrString(attrs, ATTR.PROMPT_ID),
            toolUseId: extractAttrString(attrs, ATTR.TOOL_USE_ID),
            appVersion,
          });
          continue;
        }

        if (eventName === EVENT.HOOK_EXECUTION_COMPLETE) {
          hookExecutionRows.push({
            timestamp,
            userEmail,
            sessionId,
            hookEvent: extractAttrString(attrs, ATTR.HOOK_EVENT),
            hookName: extractAttrString(attrs, ATTR.HOOK_NAME),
            numHooks: extractAttrInt(attrs, ATTR.NUM_HOOKS),
            numSuccess: extractAttrInt(attrs, ATTR.NUM_SUCCESS),
            numBlocking: extractAttrInt(attrs, ATTR.NUM_BLOCKING),
            numNonBlockingError: extractAttrInt(
              attrs,
              ATTR.NUM_NON_BLOCKING_ERROR,
            ),
            totalDurationMs: extractAttrInt(attrs, ATTR.TOTAL_DURATION_MS),
            promptId: extractAttrString(attrs, ATTR.PROMPT_ID),
            appVersion,
          });
        }
      }
    }
  }

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
  ]);

  return c.json({ partialSuccess: {} });
});
