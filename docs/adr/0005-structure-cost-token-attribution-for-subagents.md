# ADR 0005: Subagent のコスト・トークン最適化に向けた属性構造化

## Status

提案中

## Context

cc-monitor-worker は Claude Code の OTLP logs / metrics を Cloudflare Worker で受け取り、Cloudflare D1 に保存している。既存設計では `api_requests` / `token_usage` / `cost_usage` などの高頻度データを構造化テーブルに保存しつつ、未知または低優先度のイベントは `raw_logs` / `raw_metrics` と catalog テーブルで追跡する二層構造を採っている。

ADR 0003 では `subagent_completed` を含む未収集イベントの構造化を見送った。見送り理由は、当時は具体的な活用シーンが決まっておらず、raw に 7 日分残れば十分と判断したためである。

その後、サブスクリプションプランでどの程度の利用料相当を消費しているか、また `Explore` / `Plan` / `general-purpose` などの subagent 運用でコストをどれだけ削減できるかを見たい、という具体的な分析要求が出てきた。2026-06-28 に本番 D1 を `bunx wrangler d1 execute --remote` で確認したところ、`subagent_completed` には `model`, `total_tokens`, `duration_ms`, `total_tool_uses` はあるが、`input_tokens`, `output_tokens`, `cache_creation_tokens`, `cache_read_tokens` の 4 種内訳は存在しなかった。一方で、`api_request` の raw logs と `claude_code.token.usage` / `claude_code.cost.usage` の raw metrics には `query_source`, `agent.name`, `model`, token `type`, `cost_usd` が残っており、直近 raw 保持期間内であれば subagent 種別ごとのコスト・トークン集計は可能である。

### 解決したい課題

- raw JSON に頼らず、subagent 種別ごとのトークン消費と USD を長期保存・集計できるようにする
- `input`, `output`, `cacheCreation`, `cacheRead` の 4 種トークンをモデル・agent 種別ごとに集計し、料金マスタと JOIN できるようにする
- `Explore` など低コスト subagent への振り分けが、従来運用と比べて何 % の削減になるかを継続的に判断できるようにする
- `subagent_completed` 1 件あたりの平均コストを算出できるようにする
- 個別プロンプトや raw API body など、内容を含むデータの保存は増やさない

### 検討した選択肢

1. **raw_logs / raw_metrics を JSON_EXTRACT で集計し続ける**
2. **`token_usage` / `cost_usage` に attribution カラムを追加する**
3. **`subagent_completions` テーブルのみ追加する**
4. **subagent 専用の集計済み fact テーブルを追加する**

### 各選択肢の評価

| 観点              | raw JSON 集計                       | attribution カラム追加   | `subagent_completions` のみ | 集計済み fact テーブル   |
| ----------------- | ----------------------------------- | ------------------------ | --------------------------- | ------------------------ |
| 4 種トークン内訳  | 取れるが raw 保持期間内のみ         | 長期で取れる             | 取れない                    | 長期で取れる             |
| USD 集計          | raw 期間内なら `cost_usd` で取れる  | 長期で取れる             | 取れない                    | 長期で取れる             |
| subagent 完了件数 | `subagent_completed` raw から取れる | 別途必要                 | 長期で取れる                | 長期で取れる             |
| 実装量            | なし                                | 小                       | 小〜中                      | 中〜大                   |
| クエリの単純さ    | 低                                  | 中                       | 中                          | 高                       |
| 保守コスト        | SQL が複雑                          | 低                       | 低                          | 高                       |
| データの柔軟性    | 高いが短命                          | 高い                     | 限定的                      | 低〜中                   |
| 既存設計との整合  | raw 層依存が強い                    | 既存 fact テーブルの拡張 | ADR 0003 の再評価として自然 | 新しい集計層の導入になる |

## Decision

**コスト・トークン最適化の第一段階として、`token_usage` / `cost_usage` に subagent attribution カラムを追加し、必要に応じて `subagent_completions` を追加する方針を提案する。**

### 1. `token_usage` に attribution カラムを追加する

`claude_code.token.usage` は API request ごとに 4 種トークンを `type` として送信している。現行 receiver は `model`, `token_type`, `token_count`, `skill_name`, `plugin_id` だけを構造化しており、raw には存在する `query_source` と `agent.name` を落としている。

追加候補:

| カラム         | 型            | 用途                                                |
| -------------- | ------------- | --------------------------------------------------- |
| `query_source` | text          | `main`, `subagent`, `auxiliary` の分類              |
| `agent_name`   | text nullable | `Explore`, `Plan`, `general-purpose`, `custom` など |
| `speed`        | text nullable | fast mode の影響を見る                              |
| `effort`       | text nullable | effort 対応モデルのコスト差を見る                   |

実装イメージ:

```ts
tokenRows.push({
  timestamp,
  userEmail,
  sessionId,
  model: extractAttrString(pointAttrs, ATTR.MODEL, ""),
  tokenType: extractAttrString(pointAttrs, ATTR.TYPE, ""),
  tokenCount,
  querySource: extractAttrString(pointAttrs, ATTR.QUERY_SOURCE),
  agentName: extractAttrString(pointAttrs, ATTR.AGENT_NAME),
  skillName: extractAttrString(pointAttrs, ATTR.SKILL_NAME),
  pluginId,
  appVersion,
});
```

この変更により、以下の集計を raw JSON なしで実行できる。

```sql
SELECT
  agent_name,
  model,
  SUM(CASE WHEN token_type = 'input' THEN token_count ELSE 0 END) AS input_tokens,
  SUM(CASE WHEN token_type = 'output' THEN token_count ELSE 0 END) AS output_tokens,
  SUM(CASE WHEN token_type = 'cacheCreation' THEN token_count ELSE 0 END) AS cache_creation_input_tokens,
  SUM(CASE WHEN token_type = 'cacheRead' THEN token_count ELSE 0 END) AS cache_read_input_tokens
FROM token_usage
WHERE query_source = 'subagent'
GROUP BY agent_name, model;
```

### 2. `cost_usage` に同じ attribution カラムを追加する

`claude_code.cost.usage` には Claude Code 側が算出した `cost_usd` が入っている。料金マスタを別途持つ場合でも、実測 cost と料金マスタ計算値の差分検証に使えるため、`token_usage` と同じ attribution を保存する。

追加候補:

| カラム         | 型            | 用途                       |
| -------------- | ------------- | -------------------------- |
| `query_source` | text          | `subagent` の抽出          |
| `agent_name`   | text nullable | subagent 種別別の USD 集計 |
| `speed`        | text nullable | fast mode 別の比較         |
| `effort`       | text nullable | effort 別の比較            |

集計例:

```sql
SELECT
  agent_name,
  model,
  COUNT(*) AS requests,
  SUM(cost_usd) AS cost_usd
FROM cost_usage
WHERE query_source = 'subagent'
GROUP BY agent_name, model;
```

### 3. `subagent_completions` は平均単価の分母として追加候補にする

`subagent_completed` には 4 種トークン内訳が存在しないため、コスト算出の主データにはできない。一方で、完了件数・所要時間・ツール使用数を長期で保持する価値はある。

追加候補:

| カラム            | 型      | 用途                                         |
| ----------------- | ------- | -------------------------------------------- |
| `timestamp`       | text    | 完了時刻                                     |
| `user_email`      | text    | ユーザー別集計                               |
| `session_id`      | text    | セッション別集計                             |
| `prompt_id`       | text    | 同一 prompt 内の分析                         |
| `agent_type`      | text    | `Explore`, `Plan`, `general-purpose` など    |
| `agent_source`    | text    | built-in / custom など                       |
| `model`           | text    | 完了イベント側のモデル                       |
| `total_tokens`    | integer | Claude Code 側の合計値。欠損・0 の可能性あり |
| `total_tool_uses` | integer | tool-heavy な subagent の検出                |
| `duration_ms`     | integer | 完了までの時間                               |
| `is_async`        | boolean | 非同期 subagent の利用確認                   |
| `app_version`     | text    | バージョン差分の追跡                         |

このテーブルは `cost_usage` と厳密に 1:1 JOIN するためではなく、以下のような平均指標の分母として使う。

```sql
WITH cost AS (
  SELECT agent_name, model, SUM(cost_usd) AS cost_usd
  FROM cost_usage
  WHERE query_source = 'subagent'
  GROUP BY agent_name, model
),
completed AS (
  SELECT agent_type AS agent_name, model, COUNT(*) AS completed
  FROM subagent_completions
  GROUP BY agent_type, model
)
SELECT
  cost.agent_name,
  cost.model,
  cost.cost_usd,
  completed.completed,
  cost.cost_usd / NULLIF(completed.completed, 0) AS cost_usd_per_completed
FROM cost
JOIN completed USING (agent_name, model);
```

### 4. 料金マスタは別テーブルまたはコード内 JSON として分離する

料金単価は telemetry の事実データではなく、後から変わる外部マスタである。`token_usage` に計算済み料金を直接保存すると、単価改定時に再計算が難しくなる。

短期的にはコード内 JSON で十分とし、ダッシュボードや期間別料金改定が必要になった時点で D1 テーブル化する。

```ts
const modelPrices = {
  "claude-opus-4-7": {
    input: 0,
    output: 0,
    cacheCreation: 0,
    cacheRead: 0,
  },
};
```

### 5. 保存しないデータを明確にする

コスト・トークン最適化に必要なのは、モデル名、トークン数、agent attribution、skill/plugin attribution、cost_usd である。プロンプト本文、tool content、raw API body は本判断のスコープ外とし、追加保存しない。

## Consequences

### Positive

- raw 保持期間を超えて、subagent 種別ごとのトークン消費と USD を追跡できる
- `Explore` と `general-purpose` のような agent 選択のコスト差を継続的に評価できる
- 料金マスタ計算値と Claude Code が送る `cost_usd` を比較でき、単価設定ミスを検出しやすくなる
- `skill.name`, `plugin.name`, `agent.name` の組み合わせで、どの Skill / Plugin が高コスト subagent を誘発しているか見える
- ADR 0003 の「具体的な活用シーンが出たら追加する」という方針に沿って、必要なカラムだけを増やせる

### Negative

- `token_usage` / `cost_usage` のカラム数が増える
  - → 追加するのは raw に既に存在し、分析軸として確認済みの attribution のみに限定する
- `subagent_completions` を追加しても、完了イベント 1 件と内部 API request を厳密に 1:1 対応できるわけではない
  - → 初期目的は「agent 種別ごとの平均コスト」とし、厳密な 1 件単価は trace 相関が必要になった時点で再検討する
- `cost_usage.cost_usd` は Claude Code 側の推定値であり、料金マスタ計算値と差が出る可能性がある
  - → token ベースの再計算と併用し、差分を検証する

### Risks

- Claude Code の OTLP 属性名が変わると `query_source` / `agent.name` が欠落する
  - → `metric_catalog` / `event_catalog` と raw サンプル確認を継続し、欠落時は空値として保存する
- `agent.name` が custom / third-party に丸められ、個別 agent の比較ができない場合がある
  - → 公式仕様上の redaction として受け入れ、必要なら custom agent の命名や管理方法を別途検討する
- D1 の行数が増え、集計が遅くなる可能性がある
  - → 既存の `token_usage_timestamp_idx` に加え、必要になった時点で `(query_source, agent_name, model)` 系の index を追加する

## 決めていないこと

| 項目                                         | 決めない理由                                                                              | いつ決めるか                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `subagent_completions` を同時に実装するか    | まずは `token_usage` / `cost_usage` の attribution だけでコスト最適化に足りる可能性がある | 平均単価の分母を長期保存したいと判断した時点             |
| trace 取り込みによる厳密な subagent 1 件単価 | 実装・保存量・相関設計が大きくなる                                                        | agent 種別平均ではなく、個別実行の原価が必要になった時点 |
| 料金マスタを D1 テーブルにするか             | 初期は静的 JSON の方が小さく始められる                                                    | 料金改定履歴やダッシュボード編集が必要になった時点       |
| 追加 index                                   | 実クエリ頻度と遅さがまだ不明                                                              | attribution カラム追加後、実測で遅いクエリが出た時点     |

## Notes

### 2026-06-28 の実データ確認

`bunx wrangler d1 execute claude-code-analytics-db --remote --json` で確認した結果:

- `raw_logs` の `subagent_completed`: 24 件
- `subagent_completed` に存在する属性: `agent_type`, `agent.source`, `model`, `total_tokens`, `total_tool_uses`, `duration_ms`, `is_async`, `prompt.id` など
- `subagent_completed` に存在しない属性: `input_tokens`, `output_tokens`, `cache_creation_tokens`, `cache_read_tokens`, `gen_ai.usage.*`
- `raw_logs` の `api_request`: `query_source`, `agent.name`, `model`, `input_tokens`, `output_tokens`, `cache_creation_tokens`, `cache_read_tokens`, `cost_usd` が存在
- `raw_metrics` の `claude_code.token.usage`: `query_source='subagent'`, `agent.name`, `model`, `type` が存在
- `raw_metrics` の `claude_code.cost.usage`: `query_source='subagent'`, `agent.name`, `model`, `cost_usd` が存在

### 参考資料

- ADR 0002: カタログテーブル導入の意思決定
- ADR 0003: 未収集イベント・メトリクスの構造化テーブル追加を見送る
- ADR 0004: compaction・assistant_response の構造化テーブル追加を見送る
- `docs/cc/monitoring-usage.md`: Claude Code Monitoring reference
