import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { plugins } from '../db/schema';

export async function upsertPlugin(
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
