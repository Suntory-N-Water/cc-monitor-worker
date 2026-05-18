import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

export const plugins = sqliteTable('plugins', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pluginName: text('plugin_name').notNull().unique(),
  marketplaceName: text('marketplace_name'),
});

export const skillEvents = sqliteTable(
  'skill_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: text('timestamp').notNull(),
    userEmail: text('user_email'),
    sessionId: text('session_id'),
    skillName: text('skill_name'),
    invocationTrigger: text('invocation_trigger'),
    skillSource: text('skill_source'),
    pluginId: integer('plugin_id').references(() => plugins.id),
    raw: text('raw'),
  },
  (t) => [
    index('skill_events_timestamp_idx').on(t.timestamp),
    index('skill_events_user_email_idx').on(t.userEmail),
    index('skill_events_skill_name_idx').on(t.skillName),
    index('skill_events_session_id_idx').on(t.sessionId),
  ],
);

export const pluginEvents = sqliteTable(
  'plugin_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: text('timestamp').notNull(),
    eventName: text('event_name').notNull(),
    userEmail: text('user_email'),
    sessionId: text('session_id'),
    pluginId: integer('plugin_id').references(() => plugins.id),
    raw: text('raw'),
  },
  (t) => [
    index('plugin_events_timestamp_idx').on(t.timestamp),
    index('plugin_events_user_email_idx').on(t.userEmail),
  ],
);

export const costUsage = sqliteTable(
  'cost_usage',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: text('timestamp').notNull(),
    userEmail: text('user_email'),
    sessionId: text('session_id'),
    model: text('model'),
    costUsd: real('cost_usd').notNull(),
    skillName: text('skill_name'),
    pluginId: integer('plugin_id').references(() => plugins.id),
    raw: text('raw'),
  },
  (t) => [
    index('cost_usage_timestamp_idx').on(t.timestamp),
    index('cost_usage_user_email_idx').on(t.userEmail),
  ],
);

export const tokenUsage = sqliteTable(
  'token_usage',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: text('timestamp').notNull(),
    userEmail: text('user_email'),
    sessionId: text('session_id'),
    model: text('model'),
    tokenType: text('token_type'),
    tokenCount: integer('token_count').notNull(),
    skillName: text('skill_name'),
    pluginId: integer('plugin_id').references(() => plugins.id),
    raw: text('raw'),
  },
  (t) => [
    index('token_usage_timestamp_idx').on(t.timestamp),
    index('token_usage_user_email_idx').on(t.userEmail),
  ],
);

export const sessionCounts = sqliteTable(
  'session_counts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: text('timestamp').notNull(),
    userEmail: text('user_email'),
    sessionId: text('session_id'),
    count: integer('count').notNull(),
    raw: text('raw'),
  },
  (t) => [
    index('session_counts_timestamp_idx').on(t.timestamp),
    index('session_counts_user_email_idx').on(t.userEmail),
  ],
);

export type InsertSkillEvent = typeof skillEvents.$inferInsert;
export type InsertPluginEvent = typeof pluginEvents.$inferInsert;
export type InsertCostUsage = typeof costUsage.$inferInsert;
export type InsertTokenUsage = typeof tokenUsage.$inferInsert;
export type InsertSessionCount = typeof sessionCounts.$inferInsert;
