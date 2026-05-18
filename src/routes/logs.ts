import { sValidator } from '@hono/standard-validator';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import {
  type InsertApiRequest,
  type InsertPluginEvent,
  type InsertSkillEvent,
  apiRequests,
  pluginEvents,
  skillEvents,
} from '../db/schema';
import { resolvePluginId } from '../lib/plugin';
import {
  ATTR,
  EVENT,
  OtlpLogsPayloadSchema,
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

  const skillRows: InsertSkillEvent[] = [];
  const pluginEventRows: InsertPluginEvent[] = [];
  const apiRequestRows: InsertApiRequest[] = [];

  for (const resourceLog of payload.resourceLogs ?? []) {
    for (const scopeLog of resourceLog.scopeLogs ?? []) {
      for (const record of scopeLog.logRecords ?? []) {
        const attrs = record.attributes;
        const eventName = extractAttrString(attrs, ATTR.EVENT_NAME);
        const timestamp = nanoToIso(record.timeUnixNano);
        const userEmail = extractAttrString(attrs, ATTR.USER_EMAIL);
        const sessionId = extractAttrString(attrs, ATTR.SESSION_ID);
        const appVersion = extractAttrString(attrs, ATTR.APP_VERSION);
        const raw = JSON.stringify(record);

        if (eventName === EVENT.SKILL_ACTIVATED) {
          const pluginName = extractAttrString(attrs, ATTR.PLUGIN_NAME);
          const pluginId = pluginName
            ? await resolvePluginId(db, pluginIdCache, {
                name: pluginName,
                marketplaceName: extractAttrString(
                  attrs,
                  ATTR.MARKETPLACE_NAME,
                ),
              })
            : null;
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
            raw,
          });
          continue;
        }

        if (
          eventName === EVENT.PLUGIN_LOADED ||
          eventName === EVENT.PLUGIN_INSTALLED
        ) {
          const pluginName = extractAttrString(attrs, ATTR.PLUGIN_NAME);
          const pluginId = pluginName
            ? await resolvePluginId(db, pluginIdCache, {
                name: pluginName,
                marketplaceName: extractAttrString(
                  attrs,
                  ATTR.MARKETPLACE_NAME,
                ),
              })
            : null;
          pluginEventRows.push({
            timestamp,
            eventName,
            userEmail,
            sessionId,
            pluginId,
            appVersion,
            raw,
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
            raw,
          });
        }
      }
    }
  }

  if (skillRows.length > 0) {
    await db.insert(skillEvents).values(skillRows);
  }
  if (pluginEventRows.length > 0) {
    await db.insert(pluginEvents).values(pluginEventRows);
  }
  if (apiRequestRows.length > 0) {
    await db.insert(apiRequests).values(apiRequestRows);
  }

  return c.json({ partialSuccess: {} });
});
