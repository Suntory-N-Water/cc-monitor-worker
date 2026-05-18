import { sValidator } from '@hono/standard-validator';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import {
  type InsertPluginEvent,
  type InsertSkillEvent,
  pluginEvents,
  skillEvents,
} from '../db/schema';
import { resolvePluginId } from '../lib/plugin';
import {
  ATTR,
  EVENT,
  OtlpLogsPayloadSchema,
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

  for (const resourceLog of payload.resourceLogs ?? []) {
    for (const scopeLog of resourceLog.scopeLogs ?? []) {
      for (const record of scopeLog.logRecords ?? []) {
        const attrs = record.attributes;
        const eventName = extractAttrString(attrs, ATTR.EVENT_NAME);
        const timestamp = nanoToIso(record.timeUnixNano);
        const userEmail = extractAttrString(attrs, ATTR.USER_EMAIL);
        const sessionId = extractAttrString(attrs, ATTR.SESSION_ID);
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

  return c.json({ partialSuccess: {} });
});
