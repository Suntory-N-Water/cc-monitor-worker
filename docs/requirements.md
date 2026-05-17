## やりたいこと
- マーケットプレースで追加した Skills が活用されているか調査
- メンバーが意識せずにデータ収集できる仕組み
- Cloudflare Worker + D1 にデータを蓄積する

---

## 全体アーキテクチャ

```
各エンジニアのPC
┌────────────────┐
│  Claude Code   │ ← managed settings で OTEL 設定を配布
└───────┬────────┘   （メンバーは何もしなくていい）
		│ OTLP http/json で自動送信（Hooks 設定不要）
		▼
┌──────────────────────┐
│  Cloudflare Worker   │ ← OTLP レシーバー兼 D1 書き込み役
│  /v1/logs            │
└───────┬──────────────┘
		│
		▼
┌────────────────┐
│  Cloudflare D1 │ ← ここにデータが溜まる（SQLite）
└────────────────┘
```

※ gRPC は Cloudflare Workers 非対応のため http/json を使用する

---

## D1 に溜まる主なデータ

| イベント | 内容 |
|---|---|
| claude_code.skill_activated | 誰が・いつ・どの Skill を使ったか |
| claude_code.plugin_loaded | セッション開始時に有効なプラグイン一覧 |
| claude_code.plugin_installed | プラグインのインストール履歴 |
| claude_code.cost.usage | Skill・Plugin 別のコスト |
| claude_code.token.usage | Skill・Plugin 別のトークン消費 |
| claude_code.session.count | ユーザー別セッション数 |

---

## skill_activated イベントの主な属性

| 属性 | 内容 | 備考 |
|---|---|---|
| skill.name | Skill 名 | OTEL_LOG_TOOL_DETAILS=1 がないと "custom_skill" に匿名化 |
| invocation_trigger | 起動方法 | "user-slash" / "claude-proactive" / "nested-skill" |
| skill.source | Skill の所在 | "bundled" / "userSettings" / "projectSettings" / "plugin" |
| plugin.name | 所属プラグイン名 | 公式マーケットプレース由来は実名、それ以外は "third-party" |
| marketplace.name | マーケットプレース名 | 公式のみ実名 |
| user.email | 実行ユーザー | OAuth ログイン時 |
| <session.id> | セッション識別子 | |

---

## Claude Code 側の環境変数

```bash
CLAUDE_CODE_ENABLE_TELEMETRY=1           # OTEL 有効化（必須）
OTEL_LOG_TOOL_DETAILS=1                  # Skill 実名取得に必須
OTEL_LOGS_EXPORTER=otlp                  # イベント収集
OTEL_METRICS_EXPORTER=otlp              # メトリクス収集（任意）
OTEL_EXPORTER_OTLP_PROTOCOL=http/json   # Cloudflare Workers は gRPC 非対応
OTEL_EXPORTER_OTLP_ENDPOINT=<https://your-worker.workers.dev>
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer your-token
OTEL_RESOURCE_ATTRIBUTES=department=engineering,<team.id>=platform  # チーム識別（任意）
```

---

## メンバーへの配布方法

### 方法A: Server-managed settings（Claude for Teams / Enterprise）
- <claude.ai> の Admin Settings > Claude Code > Managed settings に JSON を投入
- メンバーのクライアントが起動時・1時間ごとに自動受信
- MDM 不要

```json
{
  "env": {
	"CLAUDE_CODE_ENABLE_TELEMETRY": "1",
	"OTEL_LOG_TOOL_DETAILS": "1",
	"OTEL_LOGS_EXPORTER": "otlp",
	"OTEL_METRICS_EXPORTER": "otlp",
	"OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
	"OTEL_EXPORTER_OTLP_ENDPOINT": "<https://your-worker.workers.dev>",
	"OTEL_EXPORTER_OTLP_HEADERS": "Authorization=Bearer your-token"
  }
}
```

### 方法B: Endpoint-managed settings（MDM 利用組織）
- MDM（Jamf, Intune 等）で managed-settings.json を各端末に配布
- OS レベルで設定が保護されるためセキュリティが強い

---

## Cloudflare 側の構築

### 1. D1 データベース作成

```bash
wrangler d1 create claude-code-telemetry
```

### 2. D1 スキーマ

```sql
CREATE TABLE skill_events (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp          TEXT NOT NULL,
  user_email         TEXT,
  session_id         TEXT,
  skill_name         TEXT,
  invocation_trigger TEXT,
  skill_source       TEXT,
  plugin_name        TEXT,
  marketplace_name   TEXT,
  raw                TEXT    -- 念のため生 JSON も保持
);
```

### 3. Worker 実装のポイント

fiberplane/otel-worker（<https://github.com/fiberplane/otel-worker>）が
Cloudflare Workers + D1 に OTLP データを保存する先行実装として参考になる。
ただし /v1/traces（トレース）向け実装のため、/v1/logs（ログ）エンドポイントの追加が必要。

OTLP http/json のログペイロード構造（OpenTelemetry 公式仕様）:
<https://github.com/open-telemetry/opentelemetry-proto/blob/main/examples/logs.json>

```
POST /v1/logs
Content-Type: application/json

{
  "resourceLogs": [{
	"resource": {
	  "attributes": [
		{"key": "user.email",  "value": {"stringValue": "bob@example.com"}},
		{"key": "<session.id>",  "value": {"stringValue": "abc-123"}}
	  ]
	},
	"scopeLogs": [{
	  "logRecords": [{
		"timeUnixNano": "1234567890000000000",
		"attributes": [
		  {"key": "event.name",         "value": {"stringValue": "skill_activated"}},
		  {"key": "skill.name",         "value": {"stringValue": "security-review"}},
		  {"key": "invocation_trigger", "value": {"stringValue": "user-slash"}},
		  {"key": "skill.source",       "value": {"stringValue": "plugin"}}
		]
	  }]
	}]
  }]
}
```

### 4. wrangler.toml

```toml
name = "claude-code-otel-receiver"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "claude-code-telemetry"
database_id = "your-database-id"
```

---

## D1 クエリ例

```sql
-- Skill 別の使用回数
SELECT skill_name, COUNT(*) AS cnt
FROM skill_events
GROUP BY skill_name
ORDER BY cnt DESC;

-- ユーザー別・Skill 別
SELECT user_email, skill_name, COUNT(*) AS cnt
FROM skill_events
GROUP BY user_email, skill_name
ORDER BY cnt DESC;

-- 起動方法（ユーザー操作 vs Claude 自動）別
SELECT invocation_trigger, COUNT(*) AS cnt
FROM skill_events
GROUP BY invocation_trigger;
```

---

## 必要な作業サマリ

| 作業 | 担当 | 難度 |
|---|---|---|
| Cloudflare Worker（/v1/logs 受信 + D1 書き込み）実装 | 開発者 | 中 |
| D1 データベース・スキーマ作成 | 開発者 | 低 |
| managed settings に OTEL 設定を追加 | Claude Code 管理者 | 低 |
| メンバーの作業 | なし | — |

---

## 参考リンク

- fiberplane/otel-worker: <https://github.com/fiberplane/otel-worker>
- OTLP logs.json サンプル: <https://github.com/open-telemetry/opentelemetry-proto/blob/main/examples/logs.json>
- Cloudflare Workers OTEL: <https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/>
