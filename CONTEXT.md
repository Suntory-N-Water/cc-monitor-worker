# cc-monitor-worker

Claude Code の OTLP テレメトリを受信し、Cloudflare D1 に蓄積する Worker。

## Language

### テレメトリ層

**イベント（Event）**:
Claude Code が `/v1/logs` エンドポイントに送信する OTLP ログレコード一件。`event.name` アトリビュートで種別を識別する。
_Avoid_: ログ、ログレコード

**メトリクス（Metric）**:
Claude Code が `/v1/metrics` エンドポイントに送信する OTLP メトリクスの dataPoint 一件。`metric.name`（例：`claude_code.cost.usage`）で種別を識別する。
_Avoid_: 集計値

**既知イベント / 既知メトリクス**:
`EVENT` / `METRIC` 定数に定義されており、構造化テーブルへの抽出ロジックが実装済みの種別。

**未知イベント / 未知メトリクス**:
`EVENT` / `METRIC` 定数に存在しない種別。Claude Code のバージョンアップで新たに追加される可能性がある。

### ストレージ層

**構造化テーブル（Structured Tables）**:
イベント・メトリクス種別ごとに定義されたテーブル（`skill_events`、`api_requests` など）。クエリ・分析用のビューとして機能し、長期保持する。
_Avoid_: メインテーブル、分析テーブル

**キャッチオールテーブル（Catch-all Tables）**:
既知・未知を問わず全レコードを受け取る生ストレージ（`raw_logs`、`raw_metrics`）。`timestamp`（TTL削除用）・`event_name` or `metric_name`（絞り込み用）・`raw`（フル JSON）の3カラムのみ持ち、保存期間は7日間。未知イベントの発見や既知イベントへの新属性追加の検知が目的。
_Avoid_: rawテーブル、一時テーブル

**保存期間（Retention）**:
キャッチオールテーブルの行を保持する期間。現在は7日間。Cron Trigger による日次 DELETE で管理する。

## Example dialogue

> 「新しいイベントが来てるっぽいんだけど」
> 「`raw_logs` を `event_name` で絞って JSON を見てみよう。1週間以内なら残ってるはず」

> 「`api_request` に新しい属性が増えた気がする」
> 「`raw_logs` で `event_name = 'api_request'` に絞ってJSONを確認して、構造化テーブルのスキーマを拡張しよう」

> 「構造化テーブルに raw カラムがないのはなぜ？」
> 「キャッチオールテーブルがその役割を担っているから。構造化テーブルはビューとして使う」
