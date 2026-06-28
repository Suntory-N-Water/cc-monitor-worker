#!/usr/bin/env bash
set -euo pipefail

SETTINGS_FILE="${HOME}/.claude/settings.json"

# エンドポイント入力
while true; do
  read -rp "OTEL_EXPORTER_OTLP_ENDPOINT (例: https://cc-monitor-worker.xxxxx.workers.dev): " ENDPOINT
  if [[ -n "$ENDPOINT" ]]; then
    break
  fi
  echo "エンドポイントURLを入力してください。"
done

# トークン入力(入力内容を非表示)
while true; do
  read -rsp "Bearer トークン (OTEL_EXPORTER_OTLP_HEADERS 用): " TOKEN
  echo ""
  if [[ -n "$TOKEN" ]]; then
    break
  fi
  echo "トークンを入力してください。"
done

HEADERS="Authorization=Bearer ${TOKEN}"

# 追記する env 設定
NEW_ENV=$(cat <<EOF
{
  "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
  "CLAUDE_CODE_OTEL_DIAG_STDERR": "1",
  "OTEL_LOG_TOOL_DETAILS": "1",
  "OTEL_LOGS_EXPORTER": "otlp",
  "OTEL_METRICS_EXPORTER": "otlp",
  "OTEL_METRICS_INCLUDE_VERSION": "true",
  "OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
  "OTEL_METRICS_INCLUDE_ENTRYPOINT": "true",
  "OTEL_EXPORTER_OTLP_ENDPOINT": "${ENDPOINT}",
  "OTEL_EXPORTER_OTLP_HEADERS": "${HEADERS}"
}
EOF
)

# settings.json がなければ空オブジェクトで作成
if [[ ! -f "$SETTINGS_FILE" ]]; then
  mkdir -p "$(dirname "$SETTINGS_FILE")"
  echo "{}" > "$SETTINGS_FILE"
fi

# jq で env をマージ(既存キーは上書き)
if ! command -v jq &>/dev/null; then
  echo "エラー: jq がインストールされていません。brew install jq などでインストールしてください。" >&2
  exit 1
fi

UPDATED=$(jq --argjson env "$NEW_ENV" '.env = (.env // {} | . + $env)' "$SETTINGS_FILE")
echo "$UPDATED" > "$SETTINGS_FILE"

echo ""
echo "設定を ${SETTINGS_FILE} に書き込みました。"
echo "Claude Code を再起動するとテレメトリが有効になります。"
