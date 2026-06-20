# ADR 0002: 未知イベント・メトリクス検知のためのカタログテーブル導入

## Status

Accepted

## Context

cc-monitor-worker は Claude Code から送信される OTLP のうち、既知の `event_name` / `metric_name` を構造化テーブル (`skill_events` / `cost_usage` 等) に取り込み、未知分を含む全レコードを `raw_logs` / `raw_metrics` に 7 日間保持する 2 層ストレージ構成を採る (ADR 0001)。

この構成では、Claude Code 側で新しいイベントやメトリクスが追加されても気付く手段がない。`raw_logs` を grep すれば過去 7 日以内に来たものは見つかるが、保持期間を過ぎると履歴ごと消えるため、ある日突然新しい name が現れたときに「いつから出始めたのか」「どの `app.version` からか」をデータから判別できない。`docs/cc/monitoring-usage.md` は 2026-05-18 スナップショットで止まっており、公式 changelog の差分追跡もしていない。

### 解決したい課題

- 既知リスト外の `event_name` / `metric_name` が来ても気付けない
- 7 日カットオフのため、初出時期と初出 `app.version` の履歴が失われる
- 既知リストの単一情報源 (`src/lib/otlp.ts` の `EVENT` / `METRIC`) と検知側の突き合わせ手段がない

### 検討した選択肢

1. **カタログテーブル 2 本** (`event_catalog` / `metric_catalog`)
2. **カタログテーブル 1 本** (`telemetry_catalog` + `kind` 列で多態化)
3. **静的な changelog 追跡のみ** (Claude Code 公式リリースノートを定期取得して diff)

属性キー差分の追跡、初出バージョンを属性単位で持つ詳細案、`known` フラグを持つ案、通知機構の追加なども前段で検討したが、本 ADR ではスコープ外とした (後述「決めていないこと」参照)。

### 各選択肢の評価

| 観点 | 1. カタログ 2 本 | 2. カタログ 1 本 | 3. changelog 追跡 |
|------|---|---|---|
| 既存スキーマとの整合 | 高 (`skill_events` 等と対象別分離の方針が揃う) | 低 (本プロジェクトで唯一の多態テーブルになる) | — (DB 変更なし) |
| 観測ベースか宣言ベースか | 観測 (送信実績から構築) | 観測 | 宣言 (公式情報依存) |
| 公式が未公開の内部イベントへの追従 | 可能 | 可能 | 不可能 |
| ER 図・クエリの読みやすさ | 高 (`name` PK の意味が一意) | 中 (`WHERE kind = ...` が常時必要) | — |
| 将来 `trace` 等を加える拡張性 | テーブル追加で水平拡張 | `kind` 値追加で吸収 | — |
| 実装コスト | 小 | 小 | 中 (取得・パース) |

選択肢 3 は、公式が公開していないイベント名 (`subagent_completed` 等) の追従ができない点で本課題に対する解として不十分。1 と 2 は機能等価で、本プロジェクトが採る「対象別にテーブルを切る」既存方針に整合する 1 を選ぶ。

## Decision

**`event_catalog` / `metric_catalog` の 2 テーブルを追加し、観測した `event_name` / `metric_name` の初出・最終観測の時刻とバージョンを恒久的に記録する。**

### 1. スキーマ

両テーブルとも 5 列のみで、`name` を TEXT PK とする。

```ts
export const eventCatalog = sqliteTable('event_catalog', {
  name: text('name').primaryKey(),
  firstSeenAt: text('first_seen_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
  firstSeenVersion: text('first_seen_version').notNull().default(''),
  lastSeenVersion: text('last_seen_version').notNull().default(''),
});
// metric_catalog も同形
```

`name` を TEXT PK とする判断は、`event_name` / `metric_name` が OTLP 仕様で実質不変な識別子であり、参照側も常に名前で引くため。サロゲートキーを立てると 2 段ジョインが増えるだけで利得がない。書籍『達人に学ぶ DB 設計』8-2 が指摘する TEXT PK のリスク (値の変動・比較不整合) は、不変な命名規約の下では成立しない。

`first_seen` 系と `last_seen` 系を同一行に持つ構成は、`name` に対する関数従属が成立するため 3NF を満たす。中間履歴 (出現の途絶・再開) を取る要件はないので、別テーブル分割しない。

### 2. 書き込み経路

`src/routes/logs.ts` / `src/routes/metrics.ts` の挿入ハンドラ内で、リクエスト全体を 1 周走査して `name` をキーにユニーク化したカタログ行集合を作る。raw 挿入と同じ `Promise.all` バッチに UPSERT を追加する。`db.batch()` への全面移行はスコープ外とした (現行は raw 挿入と他テーブル間も原子性を保証していない既存設計を踏襲)。

```ts
...chunk(catalogRows, 10).map((rows) =>
  db.insert(eventCatalog).values(rows).onConflictDoUpdate({
    target: eventCatalog.name,
    set: {
      lastSeenAt: sql`CASE WHEN excluded.last_seen_at > ${eventCatalog.lastSeenAt} THEN excluded.last_seen_at ELSE ${eventCatalog.lastSeenAt} END`,
      lastSeenVersion: sql`CASE WHEN excluded.last_seen_at > ${eventCatalog.lastSeenAt} THEN excluded.last_seen_version ELSE ${eventCatalog.lastSeenVersion} END`,
    },
  })
)
```

`CASE` ガードは、リクエスト内で時系列が逆順のレコードが混ざっても `last_seen_at` が巻き戻らないようにするため。`first_seen_*` は `set` に含めないので保存後は変化しない。

D1 の bound parameters 100 制約 (5 列 × 20 行で 100) に対し、`chunk(catalogRows, 10)` で安全側に倒す。`name` が空文字 / undefined の行はカタログ集約前に除外する (空文字 PK 行に無名イベントが集約され `first_seen_at` が固定される事故を防ぐ)。

### 3. 既知判定と未知一覧の参照

`src/lib/otlp.ts` の `EVENT` / `METRIC` 定数から `KNOWN_EVENT_NAMES` / `KNOWN_METRIC_NAMES` の Set を export し、未知判定は TypeScript 側で行う運用とする。SQL 側に既知名を埋め込むヘルパは作らない (重複の出所が増えるため)。

```sql
SELECT name, first_seen_at, last_seen_version
FROM event_catalog
WHERE name NOT IN (/* KNOWN_EVENT_NAMES */)
ORDER BY first_seen_at DESC;
```

ad-hoc クエリでの利用を想定し、専用 API ルートは作らない。

### 4. マイグレーションでの初期化

`drizzle/migrations/0008_*.sql` で CREATE TABLE と同時に、現存する `raw_logs` / `raw_metrics` (過去 7 日分) から初期値を埋める。

```sql
INSERT OR IGNORE INTO event_catalog (name, first_seen_at, last_seen_at, first_seen_version, last_seen_version)
SELECT event_name, MIN(timestamp), MAX(timestamp), '', ''
FROM raw_logs
WHERE event_name IS NOT NULL AND event_name <> ''
GROUP BY event_name;
```

`INSERT OR IGNORE` で冪等性を確保。`first_seen_version` / `last_seen_version` は空文字スタートで以後の UPSERT に任せる (raw JSON から `json_extract` で抜く方式は SQL が肥大化し、初期値という性格上得るものが小さいため採らない)。

## Consequences

### Positive

- 新しい `event_name` / `metric_name` の初出が、`raw_logs` の 7 日保持を超えて永続的に記録される
- 初出 `app.version` が分かるため、Claude Code のどのリリースで導入されたかを後追いできる
- 既知判定の単一情報源が `src/lib/otlp.ts` に集約される
- 通知機構を持たないため、メンテナンスコストが極小

### Negative

- 書き込みパスに UPSERT が 1 文増える
  - → リクエスト内でユニーク化することで実行件数を DISTINCT な name 数 (実測 1 桁台) に抑える。`chunk(10)` で D1 のパラメタ制約も回避
- raw 挿入とカタログ更新が同一トランザクションではない
  - → カタログ更新が失敗しても、同じ name は次回観測時に再 UPSERT されるため整合性に実害はない (本プロジェクトの既存設計と同じ性質)
- 未知検出が「pull 型」(自分でクエリしない限り気付かない)
  - → そもそも本 ADR は通知をスコープ外としており、ユーザーが必要なときに ad-hoc クエリすれば追える状態を作ることが目標

### Risks

- Claude Code が同じ `event_name` で属性キー集合だけ変更した場合は検知できない
  - → 属性追跡を今後追加するなら、本テーブルに `attribute_keys` JSON 列を追加する形で拡張可能。スキーマ互換性は保たれる
- `first_seen_at` の初期値はマイグレーション実行時点の raw 保持範囲に依存する
  - → デプロイ時点で `raw_logs` に残っている最古のタイムスタンプが下限となる。それ以前の真の初出は表現できないが、運用上の支障はないと判断

## 決めていないこと

| 項目 | 決めない理由 | いつ決めるか |
|------|------------|------------|
| 通知機構 (Slack / GitHub Issue / メール) | 現時点でユーザー (運用者) が必要時に ad-hoc クエリすれば足りる方針 | 検出機会を逃す運用課題が顕在化したら |
| 属性キー集合の追跡 | スコープを「新 name の検知」に絞ったため | 既知 name に新属性が追加される事例が現実に問題化したら |
| 属性キーごとの初出バージョン | 属性追跡を入れる場合の二段目の論点 | 上記が決まった後 |
| `db.batch()` への全面移行 | 既存 `Promise.all` バッチに乗せれば最小変更で済むため | 整合性要件が強くなったら |
| 7 日カットオフ仕様の変更 | カタログ導入で「初出は永続化される」ため raw のカットオフを延ばす動機が薄い | raw 自体の長期分析が必要になったら |

## Notes

### 参考資料

- ADR 0001: 2 層ストレージ (構造化テーブル + キャッチオール)
- `.claude/plans/lucky-petting-dongarra.md` — 論点整理と前世代プラン
- `.claude/plans/steady-churning-quiche.md` — 採用案の実装プラン (シニアレビュー反映済み)
- 『達人に学ぶ DB 設計』(第 7 章 7-6, 第 8 章 8-2, 第 10 章 10.4.5) — TEXT PK・正規化・ロック範囲に関する根拠
