# ADR 0007: 本番 D1 マイグレーションの安全手順

## Status

承認済み

## Context

cc-monitor-worker は Cloudflare D1 を永続ストレージとして使い、Claude Code の OTLP logs / metrics を raw テーブルと構造化テーブルの 2 層で保存している。ADR 0001 では raw を短期保持、構造化テーブルを長期分析用と位置付けている。

2026-06-28 の DB スキーマ正規化リファクタでは、`sessions` / `usage_events` / `cost_amounts` / `token_amounts` を追加し、旧 `cost_usage` / `token_usage` を廃止する方針を採った。この作業中、Drizzle が生成した SQLite migration は `__new_*` テーブルへ既存行をコピーする差分を含んでいた。新 `sessions` が空のまま既存 child テーブルを FK 付きテーブルへコピーしようとしたため、本番 migration は一度 FK 制約違反で失敗した。

その後、既存データ破棄を前提に migration を `DROP TABLE IF EXISTS` + `CREATE TABLE` へ修正して本番適用した結果、raw テーブルは残ったが、長期分析用の構造化テーブルの過去データが削除された。D1 Time Travel により `2026-06-28T08:42:00Z` の bookmark へ復元し、旧 `cost_usage` / `token_usage` と構造化テーブルの行数が戻ったことを確認した。

### 解決したい課題

- 本番の長期保存データを、意図しない破壊的 migration で失わない
- 「後方互換性を維持しない」と「本番データを削除してよい」を混同しない
- D1 migration の生成 SQL に含まれる temp-copy / DROP / FK 影響を事前に検出する
- 復旧手段(Time Travel bookmark など)を migration 前に確保する

### 検討した選択肢

1. **従来通り、生成 SQL とローカル検証のみで本番適用する**
2. **本番前に D1 Time Travel bookmark と行数スナップショットを必須にする**
3. **破壊的変更は新テーブル併存 + backfill + 切替 + 後日 DROP の段階移行にする**

### 各選択肢の評価

| 観点                 | 1. 従来通り | 2. bookmark 必須 | 3. 段階移行 |
| -------------------- | ----------- | ---------------- | ----------- |
| 誤削除の復旧性       | 低          | 中               | 高          |
| 本番適用前の判断材料 | 低          | 中               | 高          |
| 実装量               | 小          | 小               | 中          |
| migration の単純さ   | 高          | 高               | 中          |
| 長期データ保護       | 低          | 中               | 高          |

## Decision

**本番 D1 の破壊的 migration は原則禁止し、必要な場合も Time Travel bookmark・行数スナップショット・明示承認を必須にする。**

### 1. 「後方互換性なし」と「本番データ削除」は分けて扱う

後方互換性を維持しない方針は、旧 API・旧クエリ・旧スキーマへの互換レイヤーを作らないという意味で扱う。本番 D1 に保存済みの長期分析データを削除してよい、という意味にはしない。

本番データを削除する migration は、作業指示に「本番の既存構造化データを削除する」と明示されている場合だけ実行する。

### 2. 本番 migration 前チェックを必須にする

本番適用前に、少なくとも以下を記録する。

```bash
bunx wrangler d1 time-travel info claude-code-analytics-db --timestamp <適用直前時刻> --json
bunx wrangler d1 execute claude-code-analytics-db --remote --command "<主要テーブルの COUNT>"
bunx wrangler d1 migrations list claude-code-analytics-db --remote
```

主要テーブルには raw だけでなく、長期保存の構造化テーブルを含める。

### 3. 生成 SQL の危険パターンを確認する

本番 migration 前に、生成 SQL を確認し、次のパターンがある場合は migration 方式を再検討する。

```sql
DROP TABLE ...
CREATE TABLE __new_...
INSERT INTO __new_... SELECT ... FROM ...
ALTER TABLE __new_... RENAME TO ...
PRAGMA foreign_keys=OFF
```

`__new_*` 経由の temp-copy は、FK 追加や NOT NULL 化で本番データに依存して失敗する可能性がある。`DROP TABLE` は長期保存データを失う可能性がある。どちらも「SQL が生成されたから安全」とはみなさない。

### 4. 正規化のような大きな変更は段階移行を優先する

大きなスキーマ変更では、次の順序を標準にする。

```text
1. 新テーブルを追加する
2. 新旧両方へ書き込む、または backfill する
3. 行数・集計値・代表クエリで新旧を比較する
4. 読み取りを新テーブルへ切り替える
5. 十分な確認期間後に旧テーブルを DROP する
```

1 人運用であっても、長期分析データを持つテーブルはこの手順を省略しない。

## Consequences

### Positive

- 本番 D1 の長期保存データを不用意に削除しにくくなる
- migration 失敗時に Time Travel で戻す判断が速くなる
- Drizzle 生成 SQL の temp-copy や DROP を、レビュー対象として明確に扱える
- 大きな正規化変更でも、新旧比較により移行品質を確認できる

### Negative

- migration 作業の手順が増える
  - → 本番データの復旧不能リスクに比べれば許容する
- 段階移行では一時的に新旧スキーマが併存する
  - → 互換レイヤーを永続化せず、確認期間を決めて撤去する
- backfill や新旧比較クエリの実装コストが増える
  - → 長期保存テーブルに限って適用し、raw の短期保持テーブルには過剰適用しない

### Risks

- Time Travel の bookmark を取っていても、復元操作自体が DB 全体を巻き戻す
  - → migration 直後に新データが入る可能性がある場合は、復元前に現時点の bookmark も記録する
- migration 直前の COUNT だけではデータ内容の正しさを保証できない
  - → 主要集計クエリも合わせて記録する
- 段階移行中に新旧書き込みの差分が出る
  - → 比較クエリを用意し、差分がある間は旧テーブルを DROP しない

## 決めていないこと

| 項目                                         | 決めない理由                                     | いつ決めるか                                   |
| -------------------------------------------- | ------------------------------------------------ | ---------------------------------------------- |
| D1 export を毎回必須にするか                 | Time Travel で復元可能な範囲では作業負荷が大きい | Time Travel だけでは不十分な復旧要件が出た時点 |
| 自動 backfill フレームワーク                 | 現時点では migration 頻度が低い                  | 複数回の大規模移行が続く時点                   |
| CI で migration SQL 危険パターンを検出するか | まずは手順化で十分                               | 同種の見落としが再発した時点                   |

## Notes

### 2026-06-28 0010 リライト適用 (Decision 4 への例外承認)

Decision 4 は大きなスキーマ変更で段階移行を標準とするが、`0010_dapper_mastermind.sql` のリライトは
以下を全て満たすため、1 migration で「新スキーマ作成 → 旧データ詰め直し → 旧テーブル DROP」まで
完結する形を例外的に許容する。

- 1 人運用で OTLP 送信元が自分の Claude Code のみのため、適用中の書込競合がゼロにできる
- 適用直前に Claude Code を全部閉じて ingestion を自然停止させる (`wrangler tail` での沈黙目視は省略可)
- Time Travel bookmark を適用直前に取得し、部分失敗時は fix-forward せず即復元する
- 本番形状をロードしたローカル DB で適用前に SUM 完全一致と FK 違反 0 件を確認済のため、
  リモート適用後の SUM 突合は省略可。代わりに ingestion (`logs.ts` / `metrics.ts`) が
  新スキーマで 200 を返すことを `wrangler tail` で目視する
- 監査テーブルは作らず、ローカル検証で差分を取り切る
  (schema.ts と drizzle-kit generate の diff を空に保つため)

#### 適用手順 (本番)

```bash
# 1. Claude Code を全部閉じる

# 2. bookmark 取得 (出力の "bookmark" 値を控える)
bunx wrangler d1 time-travel info claude-code-analytics-db \
  --timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --json

# 3. リモート適用
bun run db:migrate:remote

# 4. ingestion 動作確認 (新スキーマで 200 が返ることを目視)
bunx wrangler tail --format=pretty

# 5. 失敗時 (SQL エラー / FK 違反 / 200 が返らない) は即復元
# bunx wrangler d1 time-travel restore claude-code-analytics-db --bookmark <step 2 の bookmark>
```

#### 適用結果 (適用後に追記)

- 適用日時:
- 適用直前 bookmark:
- ingestion 200 復帰確認:

### 2026-06-28 の復旧確認

- 復元 bookmark: `00000244-00000002-00005098-cdf100b0e757bd1c405c4809df42d5bc`
- 復元後、`0010_dapper_mastermind.sql` は pending に戻った
- 復元後、旧テーブルが存在することを確認した
- 復元後の代表行数:
  - `cost_usage`: 4068
  - `token_usage`: 15864
  - `skill_events`: 243
  - `api_requests`: 9823
  - `raw_logs`: 12748
  - `raw_metrics`: 5455

### 参考資料

- ADR 0001: 2 層ストレージ
- ADR 0006: セッションと使用イベントを正規化する
- Cloudflare D1 Time Travel
- `drizzle/migrations/0010_dapper_mastermind.sql`
