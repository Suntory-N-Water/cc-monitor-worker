import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { plugins } from '../db/schema';
import { ATTR, type OtlpAttribute, extractAttrString } from './otlp';

async function upsertPlugin(
  db: DrizzleD1Database,
  pluginName: string,
  marketplaceName?: string,
): Promise<number> {
  await db
    .insert(plugins)
    .values({ pluginName, marketplaceName })
    .onConflictDoNothing();

  const rows = await db
    .select({ id: plugins.id })
    .from(plugins)
    .where(eq(plugins.pluginName, pluginName));

  const row = rows[0];
  if (!row) {
    throw new Error(`plugin not found after upsert: ${pluginName}`);
  }
  return row.id;
}

export async function resolvePluginIdFromAttrs(
  db: DrizzleD1Database,
  cache: Map<string, number>,
  attrs: OtlpAttribute[] | undefined,
): Promise<number | null> {
  const pluginName = extractAttrString(attrs, ATTR.PLUGIN_NAME);
  if (!pluginName) {
    return null;
  }
  return resolvePluginId(db, cache, {
    name: pluginName,
    marketplaceName: extractAttrString(attrs, ATTR.MARKETPLACE_NAME),
  });
}

async function resolvePluginId(
  db: DrizzleD1Database,
  cache: Map<string, number>,
  plugin: { name: string; marketplaceName: string | undefined },
): Promise<number> {
  const cached = cache.get(plugin.name);
  if (cached !== undefined) {
    return cached;
  }
  const id = await upsertPlugin(db, plugin.name, plugin.marketplaceName);
  cache.set(plugin.name, id);
  return id;
}
