# ADR 0008: usage_events の dedup key を attribute 込みに拡張し、サブタイプは単一テーブル継承で保持する

## Status

承認済み

## Context

cc-monitor-worker は ADR 0006 で `usage_events` / `cost_amounts` / `token_amounts` を導入し、`(session_id, start_time_ns, end_time_ns)` を dedup キーとして cost / token metrics を正規化した。本番運用後、`達人に学ぶDB設計徹底指南書 第2版` の観点で 2026-06-28 にレビューを実施したところ、以下の不整合が判明した。

### 解決したい課題

- `usage_events` の `query_source / agent_name / speed / effort / skill_name / plugin_id` が大半 NULL になっており、subagent 別コスト分析が機能していない。
- 原因は OTLP 仕様と dedup key の不一致。`claude_code.cost.usage` / `claude_code.token.usage` の dataPoint は、同一 60 秒ウィンドウ (`startTimeUnixNano` ～ `timeUnixNano`) でも `query_source` / `agent.name` / `skill.name` / `plugin.name` などの attribute 単位で別 dataPoint として送られる。現行の UNIQUE INDEX `(session_id, start_time_ns, end_time_ns)` ではこれらが衝突し、UPSERT が `set: { sessionId: excluded.session_id }` だけを更新する設計のため、初回 INSERT 時点の attribute が永久固定される。
- dedup key を拡張すると今度はサブタイプ的な NULL 多発が顕在化する。`query_source='main'` の行では `agent_name` が常に NULL、`query_source='subagent'` の行では `agent_name` が常に存在する、といった共起関係をどう扱うかを書籍 6 章のサブタイプ設計に照らして決める必要がある。

### 2026-06-28 の本番実測

| 項目 | 値 |
|---|---|
| `usage_events` 総行数 | 2,909 |
| `query_source IS NOT NULL` の行数 | 40 (= 1.4%) |
| 直近 121 行 (id > 2800) のうち `query_source IS NOT NULL` | 24 (= 20%) |
| `raw_metrics` の `claude_code.cost.usage` 直近 500 件のうち `query_source` attribute あり | 500 / 500 (= 100%) |
| `raw_metrics` の `claude_code.token.usage` 直近サンプル | 全件に `query_source`, `effort`, `skill.name` 等あり |

raw 層には属性が来ているのに、構造化層では落ちている。これは「Claude Code が送らない」のではなく構造化層側の dedup 設計の欠陥。

### attribute の共起パターン (直近 2,000 件 `claude_code.cost.usage`)

| query_source | agent.name | skill.name | plugin.name | effort | 件数 |
|---|---|---|---|---|---|
| main | NULL | NULL | NULL | high | 471 |
| auxiliary | NULL | NULL | NULL | high | 102 |
| main | NULL | SET | NULL | high | 101 |
| auxiliary | NULL | NULL | NULL | NULL | 62 |
| main | NULL | SET | SET | high | 39 |
| subagent | Explore | NULL | NULL | NULL | 13 |
| subagent | Plan | NULL | NULL | high | 10 |
| subagent | custom | NULL | NULL | high | 8 |
| subagent | general-purpose | NULL | NULL | high | 6 |
| subagent | general-purpose | SET | NULL | high | 5 |
| subagent | Explore | SET | NULL | NULL | 4 |
| subagent | claude | NULL | NULL | high | 2 |

- `query_source='subagent'` ⇔ `agent_name IS NOT NULL` が一貫している (discriminator)。
- `plugin_name` は `query_source='main'` でのみ出現。
- `skill_name` は main / subagent 両方で出現。
- `speed` はこの 2,000 件サンプルでは全件 NULL (claude.ai 側で speed 機能を使っていない期間)。

## Decision

**`usage_events` の UNIQUE INDEX を attribute 込みに拡張し、サブタイプ別属性は単一テーブル継承 (single-table inheritance) のまま保持する。**

### 1. dedup key を拡張する

UNIQUE INDEX を以下に変更する。

```ts
uniqueIndex('usage_events_dedup_idx').on(
  t.sessionId,
  t.startTimeNs,
  t.endTimeNs,
  t.querySource,
  t.agentName,
  t.skillName,
  t.pluginId,
),
```

`model` は `(start_time_ns, query_source)` から実質的に決まると想定して dedup key から外す。`effort` / `speed` は値が出る場合 attribute セット内で一意に決まるため除外する。これらの仮定が崩れた場合は本 ADR を更新する。

SQLite では NULL を含む UNIQUE INDEX は「NULL は他の NULL と等しくない」扱いとなり、attribute が NULL の行が複数挿入できる。これは本ケースでは許容する。理由は次の 2 つ。

- raw 層に同じ dataPoint が再送されても、`usageGroups` Map で 1 リクエスト内は集約されているため、`NULL = NULL` の dedup ができない弊害は単発の重複行に限定される。
- 集計クエリでは `SUM(cost_usd)` などを使うため、重複行が混入しても粒度が細かくなるだけで合計値は変わらない (token の `INSERT ON CONFLICT DO NOTHING` で防止)。

完全な dedup が必要になった場合は、`COALESCE(query_source, '')` 等で空文字に正規化した generated column を作って UNIQUE INDEX を張り直す案を検討する (本 ADR では先送り)。

### 2. UPSERT で attribute 列も補完する

`set: { sessionId: excluded.session_id }` を以下に置き換える。

```ts
set: {
  model: sql`COALESCE(NULLIF(${usageEvents.model}, ''), excluded.model, ${usageEvents.model})`,
  querySource: sql`COALESCE(${usageEvents.querySource}, excluded.query_source)`,
  agentName: sql`COALESCE(${usageEvents.agentName}, excluded.agent_name)`,
  speed: sql`COALESCE(${usageEvents.speed}, excluded.speed)`,
  effort: sql`COALESCE(${usageEvents.effort}, excluded.effort)`,
  skillName: sql`COALESCE(${usageEvents.skillName}, excluded.skill_name)`,
  pluginId: sql`COALESCE(${usageEvents.pluginId}, excluded.plugin_id)`,
},
```

「既存値があれば残し、NULL の場合のみ新値で補完する」方針。dedup key を拡張すれば本来は attribute が同じ行に集約されるが、初回 INSERT 時に欠落していた値を後続 dataPoint で埋め直すための保険として残す。

### 3. サブタイプは単一テーブル継承で保持する

`query_source` を discriminator とする以下のサブタイプ構造は、テーブル分割せず `usage_events` 1 本で保持する。

- main: `agent_name IS NULL`, `plugin_name` あり/なし, `skill_name` あり/なし
- subagent: `agent_name IS NOT NULL`, `plugin_name IS NULL`
- auxiliary: `agent_name IS NULL`, attribute がほぼ NULL

テーブル分割 (排他継承) を採らない理由:

- `cost_amounts` / `token_amounts` の参照が二重化し、クエリが UNION 多発になる。
- 単一テナント運用で row 数も少なく、NULL 多発による物理コストが小さい。
- 集計クエリは `WHERE query_source = 'subagent'` 等で discriminator フィルタを掛けるだけで足り、NULL の意味が「該当 attribute なし」と明確 (= 意味のある NULL)。

書籍 5-1 が指摘する「正規化の度合いは性能とトレードオフ」の判断として、本ケースでは単一テーブルを採る。

### 4. discriminator (`query_source`) は今回は NOT NULL 化しない

`query_source` が常時届く前提が完全に確認できるまで、NOT NULL 制約は付けない。dedup key 拡張後の本番データで欠落が見られなくなったタイミングで、別 ADR として NOT NULL 化を検討する。

### 5. マイグレーションは破壊的に行う (ADR 0007 の例外運用)

`usage_events` / `cost_amounts` / `token_amounts` の構造化データは「raw 層からいつでも再構築可能」かつ、現状 attribute 欠落により分析価値が低い。ADR 0007 の段階移行を省略し、`DROP TABLE` + `CREATE TABLE` でリセットする。Time Travel bookmark を取得した上で適用する。

raw 層 (`raw_metrics`) は別途、過去 7 日分から再構造化可能なため、再構築用 SQL は本 ADR には含めない (必要になった時点で別 issue とする)。

## Consequences

### Positive

- subagent 種別ごとの cost / token 集計が正しく機能する (ADR 0005 / 0006 の本来の目的を達成)。
- attribute セット違いの dataPoint が個別に永続化され、Claude Code 仕様変更の影響を受けにくくなる。
- サブタイプ構造を単一テーブルで保つため、`cost_amounts` / `token_amounts` の FK 参照が単純なまま維持される。

### Negative

- UNIQUE INDEX のカラム数が増え、書込みオーバーヘッドが微増する。
  - → 単一テナント運用で行数が小さく、許容範囲。
- NULL を含む UNIQUE INDEX で完全な dedup が効かない。
  - → 集計上の影響は軽微 (上記 1.)。完全 dedup が必要になったら generated column 案を再検討する。
- 既存 `usage_events` / `cost_amounts` / `token_amounts` のデータが消える。
  - → raw 層から再構築可能。再構築 SQL は必要時に別途用意する。

### Risks

- 想定した attribute 共起パターン (e.g. `query_source='subagent'` の時 `agent_name` が必ず存在) が将来崩れると、サブタイプ前提のクエリが空集合になる。
  - → `event_catalog` / `metric_catalog` の last_seen_version を監視し、Claude Code バージョン上がりで挙動が変わる兆候を捕捉する。
- `speed` / `effort` を dedup key から外す判断は、現サンプルに speed が出ていないことに依存する。将来 `speed` が attribute セット内で複数値を取るようになると衝突する。
  - → 衝突が観測されたら dedup key に追加する別 ADR を起こす。

## 決めていないこと

| 項目 | 決めない理由 | いつ決めるか |
|---|---|---|
| 区分値カラム (`decision`, `source`, `type`, `invocation_trigger`, `skill_source`, `query_source` 等) への CHECK 制約 | Claude Code 仕様変更で新値が出た瞬間 INSERT が落ちると raw 含めデータが入らないリスク。valibot enum + warn の中間案も含めて別途検討 | 区分値の新値追加で運用事故が出るか、データ品質要求が上がった時点 |
| `plugin_id` / その他外部キー側の単独 index 追加 | 主要クエリで `(session_id, timestamp)` 複合 index が先頭一致しており、現状の遅さが顕在化していない | README の代表クエリで EXPLAIN QUERY PLAN を取り、フルスキャンが見えた時点 |
| `subagent_completed` / `api_error` などの未構造化イベントの構造化 | スキーマ設計ではなく収集対象選定の判断。ADR 0003 / 0004 の延長線上で別 ADR | サブエージェント平均コスト分析やエラー率監視の具体的要件が立った時点 |
| `attribute_value_catalog` (区分値レベルの新出検知) | name レベルの catalog で当面の検知ニーズは満たされている | Claude Code 仕様変更の attribute 追加で運用事故が出た時点 |
| `query_source` の NOT NULL 化 | dedup key 拡張後に attribute 欠落が解消することを本番で確認してから | 1 週間程度の本番運用で `query_source IS NULL` の比率が十分下がったことを確認した時点 |
| `api_requests` (transaction grain) と `usage_events` (60 秒集約 grain) の役割の明文化 | 両者は粒度違いの fact で「ダブルマスタ」ではないと判明したが、合算クエリで二重計上する事故リスクは残る | 合算クエリで実害が出るか、ダッシュボード化する時点 |

## Notes

### レビュー実施記録

- 実施日: 2026-06-28
- レビュー基準: 『達人に学ぶDB設計徹底指南書 第2版』 (NotebookLM 上の `cf8407f8-e3ed-4c91-8221-b76e10d6c47b` をソースとして引用)
- 引用章: 3-6 第3正規形, 5-1 正規化の功罪, 6章 サブタイプ, 7-6 不適切なキー, 7-7 ダブルマスタ, 8-2 代理キー, 8-3 列持ち vs 行持ち
- 主な発見:
  - `api_requests` (transaction grain) と `usage_events` (60 秒集約 grain) は「ダブルマスタ」ではなく粒度違いの fact (件数: api 9,940 / usage 2,909、1 セッションで api 23 / usage 7 / 完全一致 2 を観測)
  - dedup key 設計欠陥による attribute 大量欠落を発見 (本 ADR の主題)
  - サブタイプ構造は単一テーブル継承で十分 (上記表)

### 参考資料

- ADR 0001: 2 層ストレージ
- ADR 0005: Subagent のコスト・トークン最適化に向けた属性構造化
- ADR 0006: セッションと使用イベントを正規化する
- ADR 0007: 本番 D1 マイグレーションの安全手順
- `src/routes/metrics.ts` 現状実装
