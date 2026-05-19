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
} as const;

export const EVENT = {
  SKILL_ACTIVATED: 'skill_activated',
  PLUGIN_LOADED: 'plugin_loaded',
  PLUGIN_INSTALLED: 'plugin_installed',
  API_REQUEST: 'api_request',
  TOOL_RESULT: 'tool_result',
  HOOK_EXECUTION_COMPLETE: 'hook_execution_complete',
} as const;

export const METRIC = {
  COST_USAGE: 'claude_code.cost.usage',
  TOKEN_USAGE: 'claude_code.token.usage',
  SESSION_COUNT: 'claude_code.session.count',
  ACTIVE_TIME: 'claude_code.active_time.total',
} as const;

type AttrKey = (typeof ATTR)[keyof typeof ATTR];

export function extractAttrString(
  attrs: OtlpAttribute[] | undefined,
  key: AttrKey,
): string | undefined {
  const found = attrs?.find((a) => a.key === key);
  if (!found) {
    return;
  }
  return found.value.stringValue;
}

export function extractAttrDouble(
  attrs: OtlpAttribute[] | undefined,
  key: AttrKey,
): number | undefined {
  const found = attrs?.find((a) => a.key === key);
  if (!found) {
    return;
  }
  if (found.value.doubleValue !== undefined) {
    return found.value.doubleValue;
  }
  if (found.value.intValue !== undefined) {
    return Number(found.value.intValue);
  }
  if (found.value.stringValue !== undefined) {
    const n = Number(found.value.stringValue);
    return Number.isNaN(n) ? undefined : n;
  }
  return;
}

export function extractAttrBool(
  attrs: OtlpAttribute[] | undefined,
  key: AttrKey,
): boolean | undefined {
  const found = attrs?.find((a) => a.key === key);
  if (!found) {
    return;
  }
  if (found.value.boolValue !== undefined) {
    return found.value.boolValue;
  }
  if (found.value.stringValue !== undefined) {
    return found.value.stringValue === 'true';
  }
  return;
}

export function extractAttrInt(
  attrs: OtlpAttribute[] | undefined,
  key: AttrKey,
): number | undefined {
  const found = attrs?.find((a) => a.key === key);
  if (!found) {
    return;
  }
  if (found.value.intValue !== undefined) {
    return Number(found.value.intValue);
  }
  if (found.value.doubleValue !== undefined) {
    return Math.round(found.value.doubleValue);
  }
  if (found.value.stringValue !== undefined) {
    const n = Number(found.value.stringValue);
    return Number.isNaN(n) ? undefined : Math.round(n);
  }
  return;
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
  const result: { asDouble?: number; asInt?: number } = {};
  if (point.asDouble !== undefined) {
    result.asDouble = point.asDouble;
  }
  // asInt は文字列で送られてくることがある
  if (point.asInt !== undefined) {
    result.asInt = Number(point.asInt);
  }
  return result;
}
