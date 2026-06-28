# ADR 0006: セッションと使用イベントを正規化する

## Status

承認済み

## Context

cc-monitor-worker は Claude Code の OTLP logs / metrics を Cloudflare Worker で受け取り、Cloudflare D1 に保存している。ADR 0001 で raw と構造化テーブルの 2 層保存を採用し、ADR 0002 で catalog による未知 name 検知を追加した。

既存スキーマでは `session_id` から `user_email` と `app_version` が決まるにもかかわらず、複数の fact テーブルに同じ値を重複保存していた。また、`cost_usage` と `token_usage` は同じ API リクエスト由来の属性を別テーブルに重複して持っていた。

### 解決したい課題

- `session_id -> user_email / app_version` の推移的関数従属を解消する
- cost と token の共通属性を 1 箇所へ集約する
- 同一 OTLP ペイロード再送時に cost / token が二重保存されないようにする
- raw 層と catalog 層は ADR 0001 / 0002 の役割のまま維持する

### 検討した選択肢

1. **現行テーブルに index だけ追加する**
2. **`sessions` のみ追加する**
3. **`sessions` と `usage_events` / amount テーブルへ分割する**

### 各選択肢の評価

| 観点 | index のみ | `sessions` のみ | `sessions` + `usage_events` |
|---|---|---|---|
| 3NF 違反の解消 | 低 | 中 | 高 |
| cost/token 共通属性の重複解消 | 不可 | 不可 | 可能 |
| デデュプキーの表現 | 不可 | 不可 | 可能 |
| 実装量 | 小 | 中 | 中 |
| 既存クエリへの影響 | 小 | 中 | 大 |

後方互換性を維持しないプロジェクト方針のため、既存データを残すための移行や旧テーブル互換ビューは作らない。

## Decision

**`sessions` を親テーブルにし、cost/token metrics を `usage_events` / `cost_amounts` / `token_amounts` に正規化する。**

### 1. `sessions` を追加する

`sessions.id` は OTLP の `session.id` をそのまま使う。`user_email`、`app_version`、`first_seen_at`、`last_seen_at` はセッションに従属する属性として保持する。

各 fact テーブルは `session_id` のみ持ち、ユーザーやバージョンが必要なクエリでは `sessions` を JOIN する。

### 2. 使用イベントと amount を分割する

`claude_code.cost.usage` と `claude_code.token.usage` は、同一 API リクエストで `(session_id, start_time_ns, end_time_ns)` が一致する。この 3 カラムを `usage_events` のデデュプキーにする。

```
sessions
  -> usage_events
       -> cost_amounts
       -> token_amounts
```

`usage_events` は model / query_source / agent_name / speed / effort / skill_name / plugin_id を持つ。`cost_amounts` は USD、`token_amounts` は token type ごとの count のみを持つ。

### 3. INSERT 順序で論理整合を担保する

D1 では FK が enforce されないため、アプリケーション側で必ず次の順に書き込む。

1. `sessions` を UPSERT
2. 子テーブルを INSERT
3. metrics は `usage_events` を UPSERT して id を回収
4. `cost_amounts` / `token_amounts` を `ON CONFLICT DO NOTHING` で INSERT

`usage_events` は衝突時も id を返す必要があるため、`DO NOTHING` ではなく no-op の `DO UPDATE SET session_id = excluded.session_id RETURNING id` を使う。

### 4. ADR 0005 を統合する

ADR 0005 で提案した cost/token attribution カラムは、本 ADR の `usage_events` に統合する。旧 `cost_usage` / `token_usage` へカラムを増やす案は採用しない。

## Consequences

### Positive

- セッション属性の重複保存がなくなり、3NF に近い構造になる
- cost と token の共通属性を `usage_events` で 1 回だけ保存できる
- 再送ペイロードに対して `usage_events` / amount テーブルでデデュプできる
- subagent 種別別の cost / token 集計を raw JSON なしで長期実行できる

### Negative

- 既存の `cost_usage` / `token_usage` 参照クエリは壊れる
  - → 後方互換性を維持しない方針に従い、README の JOIN ベースのクエリへ置き換える
- クエリに JOIN が増える
  - → `usage_events` と `sessions` に必要な index を追加する
- INSERT が 2 フェーズになる
  - → `db.batch` と `chunk(10)` で D1 の bound parameters 上限を避ける

### Risks

- Claude Code が `startTimeUnixNano` を送らない dataPoint は構造化保存されない
  - → raw は保存するため、必要なら raw から再調査できる
- `session_id` が空の dataPoint を保存すると空 session に集約される
  - → 構造化テーブル INSERT を skip する
- D1 の FK 非 enforce により孤児行が作れる
  - → アプリケーションの INSERT 順序で担保する

## 決めていないこと

| 項目 | 決めない理由 | いつ決めるか |
|---|---|---|
| `subagent_completions` | 本リファクタは cost/token 正規化に限定するため | 完了件数や平均単価の分母を長期保存したくなった時点で別 ADR として扱う |
| 月次集計テーブル | 現時点では D1 サイズ肥大化が顕在化していないため | `usage_events` / amount テーブルのサイズや集計時間が問題になった時点 |
| `users` マスタ | 1 人運用では過剰なため | 複数ユーザー運用でユーザー属性を管理したくなった時点 |

## Notes

### 参考資料

- ADR 0001: 2 層ストレージ
- ADR 0002: 未知イベント・メトリクス検知のためのカタログテーブル導入
- ADR 0005: Subagent のコスト・トークン最適化に向けた属性構造化
- `.claude/plans/clever-honking-prism.md`
- 『達人に学ぶ DB 設計』第 2 版: 正規化と推移的関数従属の考え方
