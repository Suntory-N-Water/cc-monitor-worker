import * as v from 'valibot';

const OtlpAnyValueSchema = v.object({
  stringValue: v.optional(v.pipe(v.string(), v.maxLength(4096))),
  intValue: v.optional(v.union([v.string(), v.number()])),
  doubleValue: v.optional(v.number()),
  boolValue: v.optional(v.boolean()),
});

const OtlpAttributeSchema = v.object({
  key: v.pipe(v.string(), v.maxLength(256)),
  value: OtlpAnyValueSchema,
});

const OtlpResourceSchema = v.object({
  attributes: v.optional(v.array(OtlpAttributeSchema)),
});

const OtlpLogRecordSchema = v.object({
  timeUnixNano: v.optional(v.string()),
  attributes: v.optional(v.array(OtlpAttributeSchema)),
});

const OtlpScopeLogSchema = v.object({
  logRecords: v.optional(v.array(OtlpLogRecordSchema)),
});

const OtlpResourceLogSchema = v.object({
  resource: v.optional(OtlpResourceSchema),
  scopeLogs: v.optional(v.array(OtlpScopeLogSchema)),
});

export const OtlpLogsPayloadSchema = v.object({
  resourceLogs: v.optional(v.array(OtlpResourceLogSchema)),
});

const OtlpDataPointSchema = v.object({
  attributes: v.optional(v.array(OtlpAttributeSchema)),
  asDouble: v.optional(v.number()),
  asInt: v.optional(v.union([v.string(), v.number()])),
  startTimeUnixNano: v.optional(v.string()),
  timeUnixNano: v.optional(v.string()),
});

const OtlpSumSchema = v.object({
  dataPoints: v.optional(v.array(OtlpDataPointSchema)),
});

const OtlpMetricSchema = v.object({
  name: v.optional(v.string()),
  sum: v.optional(OtlpSumSchema),
  gauge: v.optional(OtlpSumSchema),
});

const OtlpScopeMetricSchema = v.object({
  metrics: v.optional(v.array(OtlpMetricSchema)),
});

const OtlpResourceMetricSchema = v.object({
  resource: v.optional(OtlpResourceSchema),
  scopeMetrics: v.optional(v.array(OtlpScopeMetricSchema)),
});

export const OtlpMetricsPayloadSchema = v.object({
  resourceMetrics: v.optional(v.array(OtlpResourceMetricSchema)),
});

export type OtlpAttribute = v.InferOutput<typeof OtlpAttributeSchema>;
export type OtlpDataPoint = v.InferOutput<typeof OtlpDataPointSchema>;

export const ATTR = {
  USER_EMAIL: 'user.email',
  SESSION_ID: 'session.id',
  EVENT_NAME: 'event.name',
  SKILL_NAME: 'skill.name',
  INVOCATION_TRIGGER: 'invocation_trigger',
  SKILL_SOURCE: 'skill.source',
  PLUGIN_NAME: 'plugin.name',
  MARKETPLACE_NAME: 'marketplace.name',
  MODEL: 'model',
  TYPE: 'type',
  QUERY_SOURCE: 'query_source',
  AGENT_NAME: 'agent.name',
  SPEED: 'speed',
  EFFORT: 'effort',
  APP_VERSION: 'app.version',
  SERVICE_VERSION: 'service.version',
  COST_USD: 'cost_usd',
  DURATION_MS: 'duration_ms',
  INPUT_TOKENS: 'input_tokens',
  OUTPUT_TOKENS: 'output_tokens',
  CACHE_READ_TOKENS: 'cache_read_tokens',
  CACHE_CREATION_TOKENS: 'cache_creation_tokens',
  TOOL_NAME: 'tool_name',
  TOOL_USE_ID: 'tool_use_id',
  SUCCESS: 'success',
  PROMPT_ID: 'prompt.id',
  HOOK_EVENT: 'hook_event',
  HOOK_NAME: 'hook_name',
  NUM_HOOKS: 'num_hooks',
  NUM_SUCCESS: 'num_success',
  NUM_BLOCKING: 'num_blocking',
  NUM_NON_BLOCKING_ERROR: 'num_non_blocking_error',
  TOTAL_DURATION_MS: 'total_duration_ms',
  DECISION: 'decision',
  SOURCE: 'source',
  APP_ENTRYPOINT: 'app.entrypoint',
  TERMINAL_TYPE: 'terminal.type',
  EVENT_SEQUENCE: 'event.sequence',
  COST_USD_MICROS: 'cost_usd_micros',
  REQUEST_ID: 'request_id',
  TRIGGER: 'trigger',
  PRE_TOKENS: 'pre_tokens',
  POST_TOKENS: 'post_tokens',
  PRECOMPUTE_REUSE: 'precompute_reuse',
  PROMPT_LENGTH: 'prompt_length',
  COMMAND_NAME: 'command_name',
  COMMAND_SOURCE: 'command_source',
  ERROR: 'error',
  STATUS_CODE: 'status_code',
  ATTEMPT: 'attempt',
  AGENT_TYPE: 'agent_type',
  AGENT_SOURCE: 'agent.source',
  IS_BUILT_IN: 'is_built_in',
  IS_ASYNC: 'is_async',
  TOTAL_TOKENS: 'total_tokens',
  TOTAL_TOOL_USES: 'total_tool_uses',
  FINAL_MODEL: 'final_model',
  MODEL_SWAPPED: 'model_swapped',
} as const;

export const EVENT = {
  SKILL_ACTIVATED: 'skill_activated',
  PLUGIN_LOADED: 'plugin_loaded',
  PLUGIN_INSTALLED: 'plugin_installed',
  API_REQUEST: 'api_request',
  TOOL_RESULT: 'tool_result',
  HOOK_EXECUTION_COMPLETE: 'hook_execution_complete',
  TOOL_DECISION: 'tool_decision',
  COMPACTION: 'compaction',
  USER_PROMPT: 'user_prompt',
  API_ERROR: 'api_error',
  SUBAGENT_COMPLETED: 'subagent_completed',
} as const;

export const METRIC = {
  COST_USAGE: 'claude_code.cost.usage',
  TOKEN_USAGE: 'claude_code.token.usage',
  SESSION_COUNT: 'claude_code.session.count',
  ACTIVE_TIME: 'claude_code.active_time.total',
} as const;

export const KNOWN_EVENT_NAMES: ReadonlySet<string> = new Set(
  Object.values(EVENT),
);
export const KNOWN_METRIC_NAMES: ReadonlySet<string> = new Set(
  Object.values(METRIC),
);

type AttrKey = (typeof ATTR)[keyof typeof ATTR];

function findAttrValue(attrs: OtlpAttribute[] | undefined, key: AttrKey) {
  return attrs?.find((a) => a.key === key)?.value;
}

export function extractAttrString(
  attrs: OtlpAttribute[] | undefined,
  key: AttrKey,
  defaultValue: string,
): string;
export function extractAttrString(
  attrs: OtlpAttribute[] | undefined,
  key: AttrKey,
): string | undefined;
export function extractAttrString(
  attrs: OtlpAttribute[] | undefined,
  key: AttrKey,
  defaultValue?: string,
): string | undefined {
  return findAttrValue(attrs, key)?.stringValue ?? defaultValue;
}

export function extractAttrDouble(
  attrs: OtlpAttribute[] | undefined,
  key: AttrKey,
  defaultValue: number,
): number;
export function extractAttrDouble(
  attrs: OtlpAttribute[] | undefined,
  key: AttrKey,
): number | undefined;
export function extractAttrDouble(
  attrs: OtlpAttribute[] | undefined,
  key: AttrKey,
  defaultValue?: number,
): number | undefined {
  const value = findAttrValue(attrs, key);
  if (!value) {
    return defaultValue;
  }
  if (value.doubleValue !== undefined) {
    return value.doubleValue;
  }
  if (value.intValue !== undefined) {
    return Number(value.intValue);
  }
  if (value.stringValue !== undefined) {
    const n = Number(value.stringValue);
    return Number.isNaN(n) ? defaultValue : n;
  }
  return defaultValue;
}

export function extractAttrBool(
  attrs: OtlpAttribute[] | undefined,
  key: AttrKey,
  defaultValue: boolean,
): boolean;
export function extractAttrBool(
  attrs: OtlpAttribute[] | undefined,
  key: AttrKey,
): boolean | undefined;
export function extractAttrBool(
  attrs: OtlpAttribute[] | undefined,
  key: AttrKey,
  defaultValue?: boolean,
): boolean | undefined {
  const value = findAttrValue(attrs, key);
  if (!value) {
    return defaultValue;
  }
  if (value.boolValue !== undefined) {
    return value.boolValue;
  }
  if (value.stringValue !== undefined) {
    return value.stringValue === 'true';
  }
  return defaultValue;
}

export function extractAttrInt(
  attrs: OtlpAttribute[] | undefined,
  key: AttrKey,
  defaultValue: number,
): number;
export function extractAttrInt(
  attrs: OtlpAttribute[] | undefined,
  key: AttrKey,
): number | undefined;
export function extractAttrInt(
  attrs: OtlpAttribute[] | undefined,
  key: AttrKey,
  defaultValue?: number,
): number | undefined {
  const value = findAttrValue(attrs, key);
  if (!value) {
    return defaultValue;
  }
  if (value.intValue !== undefined) {
    return Number(value.intValue);
  }
  if (value.doubleValue !== undefined) {
    return Math.round(value.doubleValue);
  }
  if (value.stringValue !== undefined) {
    const n = Number(value.stringValue);
    return Number.isNaN(n) ? defaultValue : Math.round(n);
  }
  return defaultValue;
}

export function nanoToIso(timeUnixNano: string | undefined): string {
  if (!timeUnixNano) {
    return new Date().toISOString();
  }
  return new Date(Number(timeUnixNano) / 1_000_000).toISOString();
}

export function dataPointValue(point: OtlpDataPoint): {
  asDouble?: number;
  asInt?: number;
} {
  return {
    ...(point.asDouble !== undefined && { asDouble: point.asDouble }),
    // asInt は文字列で送られてくることがある
    ...(point.asInt !== undefined && { asInt: Number(point.asInt) }),
  };
}

export function dataPointInt(point: OtlpDataPoint): number | undefined {
  const { asInt, asDouble } = dataPointValue(point);
  return asInt ?? (asDouble !== undefined ? Math.round(asDouble) : undefined);
}
