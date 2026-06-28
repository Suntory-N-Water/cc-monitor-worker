# ADR 0003: 未収集イベント・メトリクスの構造化テーブル追加を見送る

## Status

Accepted

## Context

Claude Code が送信するテレメトリのうち、`event_catalog` / `metric_catalog` に記録されているが構造化テーブルを持たないイベント・メトリクスが存在する（ADR 0002 のカタログテーブルにより検出）。

本番 D1 の実データを確認し、各イベント・メトリクスの固有属性と活用可能性を評価した。

### 解決したい課題

- 未収集のイベント・メトリクスを構造化テーブルに追加すべきか判断する
- 個人のプロンプト内容は保存しない方針の下で、追加に値するデータかを見極める

### 評価対象

#### イベント（8件）

| イベント | 固有属性 | 評価 |
|---|---|---|
| `user_prompt` | `prompt_length`（prompt 本文はクライアント側で `<REDACTED>` 済み） | 中 — 長さ傾向のみ |
| `subagent_completed` | `agent_type`, `total_tokens`, `total_tool_uses`, `duration_ms`, `model` | 高 — 最もリッチ |
| `mcp_server_connection` | `status`, `transport_type`, `server_name`, `duration_ms` | 中 |
| `permission_mode_changed` | `from_mode`, `to_mode`, `trigger` | 低 — パターンが限定的 |
| `at_mention` | `mention_type`, `success` | 低 — データ量少 |
| `feedback_survey` | `event_type`, `response`, `survey_type` | 低 — dismissed/responded のみ |
| `hook_registered` | `hook_event`, `hook_type`, `hook_source`, `hook_matcher` | 低 — ほぼ静的 |
| `hook_execution_start` | `hook_event`, `hook_name`, `num_hooks` | 低 — `hook_execution_complete` と重複 |

#### メトリクス（4件）

| メトリクス | 固有属性 + 値 | 評価 |
|---|---|---|
| `claude_code.code_edit_tool.decision` | `decision`(accept/reject), `tool_name`, `language` → 回数 | 高 — 言語別 accept/reject 率 |
| `claude_code.lines_of_code.count` | `type`(added/removed), `model` → 行数 | 高 — モデル別生産性指標 |
| `claude_code.commit.count` | 共通属性のみ → カウント | 低 — git log で代替可能 |
| `claude_code.pull_request.count` | 共通属性のみ → カウント | 低 — 同上 |

### 検討した選択肢

1. **全件追加**: 12 テーブルを一括追加
2. **高評価のみ追加**: `subagent_completed`, `lines_of_code.count`, `code_edit_tool.decision` 等を追加
3. **追加しない**: raw_logs / raw_metrics にデータは残っているので、必要になった時点で追加

## Decision

**現時点では構造化テーブルの追加を見送る。**

### 判断理由

- 「高」と評価したものも、現時点で具体的な活用シーン（ダッシュボード、アラート、定期レポート等）が決まっていない
- raw_logs / raw_metrics に 7 日分の生データが残っており、後から構造化テーブルを追加しても過去 7 日分は復元可能
- テーブル追加はスキーマ・ルーティング・マイグレーションの変更を伴い、使わないテーブルの保守コストが発生する
- 「入れるに値する」の基準を「今後の活用の参考になる / 自分の癖が見抜ける」と設定した上で評価したが、現時点では投資対効果が不十分

## Consequences

### Positive

- 不要なスキーマ・コードの肥大化を防げる
- 将来の活用シーンが明確になった時点で、本当に必要なものだけを追加できる

### Negative

- raw_logs / raw_metrics の保持期間（7日）を超えると生データが消える
  - → catalog テーブル（ADR 0002）に name と last_seen_at は残り続けるため、「何が来ているか」の情報は失われない。詳細データが必要になった場合は、テーブル追加後 7 日で再蓄積される

## 決めていないこと

| 項目 | 決めない理由 | いつ決めるか |
|---|---|---|
| どのイベント・メトリクスを将来追加するか | 具体的な活用シーンが未定 | ダッシュボードや分析要件が具体化した時点 |
| raw_logs / raw_metrics の保持期間延長 | 現行 7 日で運用上問題が出ていない | ストレージコストと分析ニーズのバランスを見て判断 |

## Notes

### 評価時点のデータ

- 調査日: 2026-06-22
- Claude Code バージョン: 2.1.185
- 利用ユーザー: 1 名（個人利用）

### 参考資料

- ADR 0002: カタログテーブル導入の意思決定
