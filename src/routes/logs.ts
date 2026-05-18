import { sValidator } from '@hono/standard-validator';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { pluginEvents, skillEvents } from '../db/schema';
import { upsertPlugin } from '../lib/plugin';
import {
  ATTR,
  OtlpLogsPayloadSchema,
  extractAttrString,
  nanoToIso,
} from '../lib/otlp';

export const logsRoute = new Hono<{ Bindings: CloudflareBindings }>();

logsRoute.post('/', sValidator('json', OtlpLogsPayloadSchema), async (c) => {
  const payload = c.req.valid('json');
  const db = drizzle(c.env.claude_code_analytics_db);

  for (const resourceLog of payload.resourceLogs ?? []) {
    for (const scopeLog of resourceLog.scopeLogs ?? []) {
      for (const record of scopeLog.logRecords ?? []) {
        const attrs = record.attributes;
        const userEmail = extractAttrString(attrs, ATTR.USER_EMAIL);
        const sessionId = extractAttrString(attrs, ATTR.SESSION_ID);
        const eventName = extractAttrString(attrs, ATTR.EVENT_NAME);
        const timestamp = nanoToIso(record.timeUnixNano);
        const raw = JSON.stringify(record);

        if (eventName === 'skill_activated') {
          const pluginName = extractAttrString(attrs, ATTR.PLUGIN_NAME);
          const marketplaceName = extractAttrString(
            attrs,
            ATTR.MARKETPLACE_NAME,
          );
          const pluginId = pluginName
            ? await upsertPlugin(db, pluginName, marketplaceName)
            : null;

          await db.insert(skillEvents).values({
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

        if (eventName === 'plugin_loaded' || eventName === 'plugin_installed') {
          const pluginName = extractAttrString(attrs, ATTR.PLUGIN_NAME);
          const marketplaceName = extractAttrString(
            attrs,
            ATTR.MARKETPLACE_NAME,
          );
          const pluginId = pluginName
            ? await upsertPlugin(db, pluginName, marketplaceName)
            : null;

          await db.insert(pluginEvents).values({
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

  return c.json({ partialSuccess: {} });
});
