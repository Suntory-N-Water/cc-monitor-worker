import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const plugins = sqliteTable('plugins', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pluginName: text('plugin_name').notNull().unique(),
  marketplaceName: text('marketplace_name'),
});

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userEmail: text('user_email').notNull(),
    appVersion: text('app_version').notNull(),
    firstSeenAt: text('first_seen_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
    entrypoint: text('entrypoint'),
    terminalType: text('terminal_type'),
  },
  (t) => [
    index('sessions_user_email_idx').on(t.userEmail),
    index('sessions_last_seen_at_idx').on(t.lastSeenAt),
  ],
);

export const rawLogs = sqliteTable(
  'raw_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: text('timestamp').notNull(),
    eventName: text('event_name'),
    raw: text('raw').notNull(),
  },
  (t) => [
    index('raw_logs_timestamp_idx').on(t.timestamp),
    index('raw_logs_event_name_idx').on(t.eventName),
  ],
);

export const rawMetrics = sqliteTable(
  'raw_metrics',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: text('timestamp').notNull(),
    metricName: text('metric_name'),
    raw: text('raw').notNull(),
  },
  (t) => [
    index('raw_metrics_timestamp_idx').on(t.timestamp),
    index('raw_metrics_metric_name_idx').on(t.metricName),
  ],
);

export const skillEvents = sqliteTable(
  'skill_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: text('timestamp').notNull(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),
    skillName: text('skill_name').notNull(),
    invocationTrigger: text('invocation_trigger').notNull(),
    skillSource: text('skill_source').notNull(),
    pluginId: integer('plugin_id').references(() => plugins.id),
  },
  (t) => [
    index('skill_events_timestamp_idx').on(t.timestamp),
    index('skill_events_session_time_idx').on(t.sessionId, t.timestamp),
    index('skill_events_skill_name_idx').on(t.skillName),
  ],
);

export const pluginEvents = sqliteTable(
  'plugin_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: text('timestamp').notNull(),
    eventName: text('event_name').notNull(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),
    pluginId: integer('plugin_id')
      .references(() => plugins.id)
      .notNull(),
  },
  (t) => [
    index('plugin_events_timestamp_idx').on(t.timestamp),
    index('plugin_events_session_time_idx').on(t.sessionId, t.timestamp),
  ],
);

export const usageEvents = sqliteTable(
  'usage_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),
    startTimeNs: text('start_time_ns').notNull(),
    endTimeNs: text('end_time_ns').notNull(),
    model: text('model').notNull(),
    querySource: text('query_source'),
    agentName: text('agent_name'),
    speed: text('speed'),
    effort: text('effort'),
    skillName: text('skill_name'),
    pluginId: integer('plugin_id').references(() => plugins.id),
  },
  (t) => [
    uniqueIndex('usage_events_dedup_idx').on(
      t.sessionId,
      t.startTimeNs,
      t.endTimeNs,
      t.querySource,
      t.agentName,
      t.skillName,
      t.pluginId,
    ),
    index('usage_events_end_time_idx').on(t.endTimeNs),
    index('usage_events_query_source_agent_idx').on(t.querySource, t.agentName),
  ],
);

export const costAmounts = sqliteTable('cost_amounts', {
  usageEventId: integer('usage_event_id')
    .primaryKey()
    .references(() => usageEvents.id),
  costUsd: real('cost_usd').notNull(),
});

export const tokenAmounts = sqliteTable(
  'token_amounts',
  {
    usageEventId: integer('usage_event_id')
      .notNull()
      .references(() => usageEvents.id),
    tokenType: text('token_type').notNull(),
    tokenCount: integer('token_count').notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.usageEventId, t.tokenType],
      name: 'token_amounts_pk',
    }),
  ],
);

export const sessionCounts = sqliteTable(
  'session_counts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: text('timestamp').notNull(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),
    count: integer('count').notNull(),
  },
  (t) => [
    index('session_counts_timestamp_idx').on(t.timestamp),
    index('session_counts_session_time_idx').on(t.sessionId, t.timestamp),
  ],
);

export const apiRequests = sqliteTable(
  'api_requests',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: text('timestamp').notNull(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),
    model: text('model').notNull(),
    costUsd: real('cost_usd').notNull(),
    durationMs: integer('duration_ms').notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    cacheReadTokens: integer('cache_read_tokens').notNull(),
    cacheCreationTokens: integer('cache_creation_tokens').notNull(),
    querySource: text('query_source'),
    promptId: text('prompt_id'),
    speed: text('speed'),
    effort: text('effort'),
    eventSequence: integer('event_sequence'),
    costUsdMicros: integer('cost_usd_micros'),
    requestId: text('request_id'),
  },
  (t) => [
    index('api_requests_timestamp_idx').on(t.timestamp),
    index('api_requests_session_time_idx').on(t.sessionId, t.timestamp),
    index('api_requests_query_source_idx').on(t.querySource),
    index('api_requests_prompt_id_idx').on(t.promptId),
  ],
);

export const compaction = sqliteTable(
  'compaction',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: text('timestamp').notNull(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),
    trigger: text('trigger').notNull(),
    success: integer('success', { mode: 'boolean' }).notNull(),
    preTokens: integer('pre_tokens').notNull(),
    postTokens: integer('post_tokens').notNull(),
    durationMs: integer('duration_ms').notNull(),
    precomputeReuse: text('precompute_reuse'),
    promptId: text('prompt_id'),
  },
  (t) => [
    index('compaction_timestamp_idx').on(t.timestamp),
    index('compaction_session_time_idx').on(t.sessionId, t.timestamp),
  ],
);

export const userPrompt = sqliteTable(
  'user_prompt',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: text('timestamp').notNull(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),
    promptId: text('prompt_id'),
    promptLength: integer('prompt_length'),
    commandName: text('command_name'),
    commandSource: text('command_source'),
  },
  (t) => [
    index('user_prompt_timestamp_idx').on(t.timestamp),
    index('user_prompt_session_time_idx').on(t.sessionId, t.timestamp),
    index('user_prompt_command_name_idx').on(t.commandName),
  ],
);

export const apiErrors = sqliteTable(
  'api_errors',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: text('timestamp').notNull(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),
    model: text('model').notNull(),
    error: text('error'),
    statusCode: integer('status_code'),
    durationMs: integer('duration_ms'),
    attempt: integer('attempt'),
    requestId: text('request_id'),
    promptId: text('prompt_id'),
  },
  (t) => [
    index('api_errors_timestamp_idx').on(t.timestamp),
    index('api_errors_session_time_idx').on(t.sessionId, t.timestamp),
    index('api_errors_status_code_idx').on(t.statusCode),
  ],
);

export const subagentCompletions = sqliteTable(
  'subagent_completions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: text('timestamp').notNull(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),
    agentType: text('agent_type').notNull(),
    agentSource: text('agent_source'),
    isBuiltIn: integer('is_built_in', { mode: 'boolean' }),
    isAsync: integer('is_async', { mode: 'boolean' }),
    totalTokens: integer('total_tokens'),
    totalToolUses: integer('total_tool_uses'),
    durationMs: integer('duration_ms'),
    model: text('model'),
    finalModel: text('final_model'),
    modelSwapped: integer('model_swapped', { mode: 'boolean' }),
    promptId: text('prompt_id'),
  },
  (t) => [
    index('subagent_completions_timestamp_idx').on(t.timestamp),
    index('subagent_completions_session_time_idx').on(t.sessionId, t.timestamp),
    index('subagent_completions_agent_type_idx').on(t.agentType),
  ],
);

export const toolResults = sqliteTable(
  'tool_results',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: text('timestamp').notNull(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),
    toolName: text('tool_name').notNull(),
    success: integer('success', { mode: 'boolean' }).notNull(),
    durationMs: integer('duration_ms').notNull(),
    promptId: text('prompt_id').notNull(),
    toolUseId: text('tool_use_id').notNull(),
  },
  (t) => [
    index('tool_results_timestamp_idx').on(t.timestamp),
    index('tool_results_session_time_idx').on(t.sessionId, t.timestamp),
    index('tool_results_tool_name_idx').on(t.toolName),
  ],
);

export const hookExecutions = sqliteTable(
  'hook_executions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: text('timestamp').notNull(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),
    hookEvent: text('hook_event').notNull(),
    hookName: text('hook_name').notNull(),
    numHooks: integer('num_hooks').notNull(),
    numSuccess: integer('num_success').notNull(),
    numBlocking: integer('num_blocking').notNull(),
    numNonBlockingError: integer('num_non_blocking_error').notNull(),
    totalDurationMs: integer('total_duration_ms').notNull(),
    promptId: text('prompt_id').notNull(),
  },
  (t) => [
    index('hook_executions_timestamp_idx').on(t.timestamp),
    index('hook_executions_session_time_idx').on(t.sessionId, t.timestamp),
  ],
);

export const activeTime = sqliteTable(
  'active_time',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: text('timestamp').notNull(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),
    type: text('type').notNull(),
    durationSec: real('duration_sec').notNull(),
  },
  (t) => [
    index('active_time_timestamp_idx').on(t.timestamp),
    index('active_time_session_time_idx').on(t.sessionId, t.timestamp),
  ],
);

export const eventCatalog = sqliteTable('event_catalog', {
  name: text('name').primaryKey(),
  firstSeenAt: text('first_seen_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
  firstSeenVersion: text('first_seen_version').notNull().default(''),
  lastSeenVersion: text('last_seen_version').notNull().default(''),
});

export const metricCatalog = sqliteTable('metric_catalog', {
  name: text('name').primaryKey(),
  firstSeenAt: text('first_seen_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
  firstSeenVersion: text('first_seen_version').notNull().default(''),
  lastSeenVersion: text('last_seen_version').notNull().default(''),
});

export const toolDecisions = sqliteTable(
  'tool_decisions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: text('timestamp').notNull(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),
    toolName: text('tool_name').notNull(),
    decision: text('decision').notNull(),
    source: text('source').notNull(),
    promptId: text('prompt_id').notNull(),
    toolUseId: text('tool_use_id').notNull(),
  },
  (t) => [
    index('tool_decisions_timestamp_idx').on(t.timestamp),
    index('tool_decisions_session_time_idx').on(t.sessionId, t.timestamp),
    index('tool_decisions_tool_name_idx').on(t.toolName),
    index('tool_decisions_decision_idx').on(t.decision),
  ],
);

export type InsertRawLog = typeof rawLogs.$inferInsert;
export type InsertRawMetric = typeof rawMetrics.$inferInsert;
export type InsertSession = typeof sessions.$inferInsert;
export type InsertSkillEvent = typeof skillEvents.$inferInsert;
export type InsertPluginEvent = typeof pluginEvents.$inferInsert;
export type InsertUsageEvent = typeof usageEvents.$inferInsert;
export type InsertCostAmount = typeof costAmounts.$inferInsert;
export type InsertTokenAmount = typeof tokenAmounts.$inferInsert;
export type InsertSessionCount = typeof sessionCounts.$inferInsert;
export type InsertApiRequest = typeof apiRequests.$inferInsert;
export type InsertCompaction = typeof compaction.$inferInsert;
export type InsertUserPrompt = typeof userPrompt.$inferInsert;
export type InsertApiError = typeof apiErrors.$inferInsert;
export type InsertSubagentCompletion = typeof subagentCompletions.$inferInsert;
export type InsertToolDecision = typeof toolDecisions.$inferInsert;
export type InsertToolResult = typeof toolResults.$inferInsert;
export type InsertHookExecution = typeof hookExecutions.$inferInsert;
export type InsertActiveTime = typeof activeTime.$inferInsert;
export type InsertEventCatalog = typeof eventCatalog.$inferInsert;
export type InsertMetricCatalog = typeof metricCatalog.$inferInsert;
