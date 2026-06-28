# ADR 0004: compaction・assistant_response の構造化テーブル追加を見送る

## Status

Accepted

## Context

ADR 0002 で導入した `event_catalog` により、`compaction` と `assistant_response` という 2 つの新イベントが受信されていることを検知した。

ADR 0003 では未収集イベント全般の評価を行い「具体的な活用シーンが決まるまで追加しない」と決定した。本 ADR はその判断を新たに検出された 2 イベントに対して適用したものである。

### 解決したい課題

- `compaction` / `assistant_response` が構造化テーブルへの追加に値するか判断する

### 検討した選択肢

1. **構造化テーブルを追加する** — 専用テーブルに保存してクエリ・集計を可能にする
2. **追加しない** — raw_logs に生データは残るため、必要になった時点で追加する

### 各イベントの固有属性と評価

#### `assistant_response`

| 属性 | 型 | 内容 |
|---|---|---|
| `response_length` | int | レスポンスの文字数 |
| `response` | string | `<REDACTED>`（クライアント側でマスク済み） |
| `request_id` | string | API リクエスト ID |
| `model` | string | 使用モデル名 |
| `query_source` | string | 呼び出し元（例: `repl_main_thread`） |

**評価: 低**

- `response` 本文はマスクされており、`response_length` 単体では「長い = 良い/悪い」の判断ができない
- `model` と `query_source` の組み合わせは独自の価値があるが、現状 `query_source` が `repl_main_thread` の一種類のみで分析の意味をなさない
- `model` / `request_id` は既存の `api_requests` テーブルでもカバーできる

#### `compaction`

| 属性 | 型 | 内容 |
|---|---|---|
| `trigger` | string | `manual` または自動 |
| `success` | string | 成否 |
| `duration_ms` | string | 処理時間 |
| `pre_tokens` | string | コンパクション前のトークン数 |
| `error` | string | エラーメッセージ（失敗時） |
| `precompute_reuse` | string | キャッシュ利用状況 |

**評価: 低**

- 調査時点のレコード数が 1 件（失敗ケースのみ）で、成功時の属性セットが未確認
- 発生頻度が低く、統計として意味を持つまでに相当の時間がかかる
- 活用シーン（長い会話の傾向把握など）は仮説にとどまり、具体的なアクションに結びつかない

## Decision

**`compaction` / `assistant_response` の構造化テーブル追加を見送る。**

### 判断理由

- 両イベントとも、単体で意思決定に使えるデータに乏しい
- `assistant_response` は既存の `api_requests` と重複する情報が多い
- `compaction` はデータが 1 件しかなく評価できる状態にない
- raw_logs に 7 日分の生データが残るため、後から追加しても直近データは復元できる（ADR 0003 と同じ判断基準を適用）

## Consequences

### Positive

- 不要なスキーマ・コードの追加を避けられる
- 活用シーンが具体化した時点で必要なものだけ追加できる

### Negative

- raw_logs の保持期間（7 日）を超えると詳細データが失われる
  - → `event_catalog` に `last_seen_at` は残り続けるため、イベント自体の存在は追跡できる

## 決めていないこと

| 項目 | 決めない理由 | いつ決めるか |
|---|---|---|
| `compaction` 成功時の属性セット | データが不足しており全体像が不明 | 成功レコードが十分に蓄積された時点 |
| `query_source` の値の種類 | 現状 1 種類のみで分析不能 | IDE 拡張などからのデータが増えた時点 |

## Notes

### 評価時点のデータ

- 調査日: 2026-06-26
- Claude Code バージョン: 2.1.193
- 利用ユーザー: 1 名（個人利用）
- `compaction` レコード数: 1 件（失敗のみ）
- `assistant_response` レコード数: 複数件（全件マスク済み）

### 参考資料

- ADR 0002: カタログテーブル導入の意思決定
- ADR 0003: 未収集イベント・メトリクスの構造化テーブル追加を見送る
