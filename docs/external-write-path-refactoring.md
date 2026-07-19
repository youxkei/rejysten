# 書き込み契約の SDK 非依存化リファクタリング

## 目的

Wear OS から lifeLog を操作できるようにする。時計側で必要なのは「開始 / 終了 / 切り替え（終了しつつ過去の例から選んで新規開始）」。

時計は Cloudflare Function（REST）経由の薄い HTTPS クライアントとし、Function 側で書き込みを組み立てる。Web の書き込みを Function 経由にはしない（overlay / offline / 書き込みレイテンシを失うため）。

**この作業で正直に見積もるべきこと**: 時計/Worker が再現しなければならないロジックは 2 層あり、drift リスクの所在が違う。

1. **書き込み契約の配管（`batch.ts`）**: 1 コミットで組み立てる複合書き込み（本体 doc / ngram / editHistory / editHistoryHead / batchVersion）。ここは機械的で、後述のとおり一部は純粋ヘルパとして共有できる。ただし共有で消せる drift はわずか（§「実効の正直な見積り」）。
2. **lifeLog のドメイン意味論（`src/panes/lifeLogs/actions.ts`）**: 「開始 = 新 doc の `startAt` を直前エントリの `endAt`（未設定なら now）に、`endAt` を sentinel にする」「終了 = 開いているエントリの `endAt` を更新」「切り替え = 終了＋過去テキストで新規開始」という**連鎖規則・sentinel 既定・editHistory の description/selection**。これは firebase 非依存でも純粋でもなく、SolidJS store/signal と密結合。**抽出対象外で、Worker は丸ごと再実装する。時計/Worker の byte 一致の主戦場はここ**（§「時計が再現する層」）。

つまり「時計は契約ロジックを一切持たない」と言えるのは 1 の配管に限った話で、2 のドメイン意味論は時計/Worker が全部持つ。設計はこの前提で読むこと。

## 現状の書き込み契約（full commit contract）

1 コミットは以下を 1 つの atomic な書き込みにまとめる。中心は `src/services/firebase/firestore/batch.ts`。

| 要素 | 内容 | 参照 |
|---|---|---|
| 本体 doc | `batch.ts` が付与するのは `createdAt`/`updatedAt` = `serverTimestamp()` **のみ**。`startAt`/`endAt` などの業務フィールドは呼び出し側が組み立てて渡す | `batch.ts:113-216`（`set`/`update`） |
| 未設定時刻の sentinel | 未設定時刻 = sentinel `3000-12-31T23:59:59Z`（null ではない）。**この既定を選ぶのは `batch.ts` ではなく呼び出し側**（`actions.ts:427-428,522-523,854-855` / `timeTextToTimestamp`）。契約の配管ではなくドメイン意味論 | `src/timestamp.ts:5`, `actions.ts` |
| 時刻精度 | 格納 `startAt`/`endAt` は秒粒度（秒未満切り捨て, `TimestampNowSec()`）。ドメイン意味論。詳細と修正済みバグは §「確定した契約: 格納 timestamp は秒粒度」 | `src/timestamp.ts` |
| ngram doc | `text` が変わった時、対の `ngrams/<id><collection>` を再生成（クライアント計算、サーバトリガ無し）。空テキストは削除。**collection が `collectionNgramConfig` に登録済みのときだけ**（lifeLogs/lifeLogTreeNodes は登録済み: `panes/lifeLogs/schema.ts:31-32`） | `batch.ts:134-136,204-206`, `ngram.ts:42,80` |
| editHistory | `editHistory/<uuid>`（forward/inverse 両方向の操作＋selection）＋ `editHistoryHead/singleton` を head に更新（undo/redo 用リンクリスト）。`description`/`prevSelection`/`nextSelection` は `BatchOptions` で呼び出し側から渡る | `batch.ts:225-251` |
| 逆操作 | update/delete の undo 用に更新前の doc を読み、差分の逆を生成 | `batch.ts:253-319` |
| batchVersion | `batchVersion/singleton` を `{prevVersion: 現在値, version: 新UUID}` に更新（全クライアント共通の楽観的並行制御） | `batch.ts:321-350` |

時計もこの契約を**丸ごと**再現する（editHistory / batchVersion も含む。省略しない）。batchVersion は並行制御そのものなので必須、editHistory は時計操作も Web の undo に乗せるために含める。

ngram 生成ロジック: `src/ngram.ts`（NFKC → lowercase → カタカナ→ひらがな(`moji`) → grapheme 分割(`Intl.Segmenter`) → bigram）＋ Firestore フィールド名エンコード（`src/services/firebase/firestore/ngram.ts:22-32`）。HistoryOperation / editHistory スキーマ: `src/services/firebase/firestore/editHistory/schema.ts`。

## 時計が再現する層: lifeLog のドメイン意味論（抽出されない・共有されない）

**ここがこのプロジェクトで最も drift しやすい部分**なので、契約の配管より先に明示する。時計の「開始 / 終了 / 切り替え」は `batch.ts` の外、`src/panes/lifeLogs/actions.ts` にある。

時計が書き込む `lifeLogs` doc のフィールド（`panes/lifeLogs/schema.ts:7-16`）: `text: string` / `hasTreeNodes: boolean` / `startAt: Timestamp` / `endAt: Timestamp`（＋ `createdAt`/`updatedAt` は `serverTimestamp()`）。時計エントリは常に `hasTreeNodes: false`・`text: ""`（開始時）。

### lifeLog レベルの書き込みアクション一覧（tree node 系は時計スコープ外）

`now` は下記「確定した契約」の通りすべて秒粒度（`TimestampNowSec()`）。

| アクション | ガード | 書き込み | description | nextSelection | ngram |
|---|---|---|---|---|---|
| `createFirstLifeLog`(842) | タイムライン空 | set `{text:"", hasTreeNodes:false, startAt:now, endAt:sentinel}` | "LifeLog作成" | `{lifeLogs:newId}` | 無（空文字→delete, 新 id は no-op） |
| `newLifeLog`(410) /<br>`addSiblingNode`(below,504) | lifeLog focus（node 未選択）、addSibling は下方向のみ | set `{text:"", hasTreeNodes:false, startAt: 基準.endAt==sentinel ? now : 基準.endAt, endAt:sentinel}` | "LifeLog作成" | `{lifeLogs:newId}` | 無 |
| `setEndAtNow`(586)<br>→`setTimeFieldNow`(552) | node 未選択、選択有、**endAt が現在 sentinel** のみ | update `{id, endAt:now}` | "時刻設定" | 無 | 無 |
| `setStartAtNow`(582) | 同上だが **startAt が sentinel** のみ | update `{id, startAt:now}` | "時刻設定" | 無 | 無 |
| `saveEndAt`/`saveStartAt`(708/712)<br>→`saveTimeField`(669) | node 未選択、選択有、pending 値有 | update `{id, startAt\|endAt: 入力時刻}` | "時刻編集" | 無 | 無 |
| `saveText`(621) | lifeLog focus、選択有、pendingText 有、**text 変化時のみ** | update `{id, text:newText}` | "テキスト編集" | **再計算** | 無 |
| `deleteEmptyLifeLog`(717) /<br>`deleteEmptyLifeLogToward`(766) | text=="" ∧ startAt sentinel ∧ endAt sentinel ∧ !hasTreeNodes | delete `{id}` | "LifeLog削除" | `{lifeLogs:targetId}` | delete |

tree node 系（`enterTree`・`splitTreeNode`・`removeOrMergeNodeWithAbove`・`mergeTreeNodeWithBelow`・`saveAndIndent/Dedent`・`saveTreeNode`・`addSiblingNode` の tree 分岐）は `lifeLogTreeNodes` 操作で時計スコープ外。ただし `enterTree`(377) は `lifeLogs.hasTreeNodes=true` を立てる — 時計エントリは false のまま。

### 確定した契約: 格納 timestamp は秒粒度

**格納する `startAt`/`endAt` はすべて秒粒度**（秒未満は切り捨て）が正しい挙動。`endAt` は `setEndAtNow`（秒切り捨て）／手入力（秒粒度）で入り、chain 分岐の `startAt` は秒粒度の `endAt` を継ぐので元から秒粒度。唯一 `newLifeLog`/`addSiblingNode`/`createFirstLifeLog` の startAt fallback が `TimestampNow()`（フル ms）で秒未満を漏らしていた**バグ**を、`TimestampNowSec()`（`src/timestamp.ts`, `Timestamp.fromMillis(Math.floor(DateNow()/1000)*1000)`）へ集約して修正済み（commit `1b14eed`）。`setTimeFieldNow` のインライン floor も同ヘルパへ dedup。→ **Worker も op 別の精度差を再現する必要はなく、格納 timestamp は一律に秒切り捨て 1 本でよい**。（`createdAt`/`updatedAt` は `serverTimestamp()` = サーバ精度で別管理。）

### 時計の 3 操作へのマッピング（すべて確定。厳密手順は §「エンドポイント仕様」）

Web は「選択中エントリ」を文脈にするが時計に選択は無い。**基準/対象エントリは runQuery `orderBy(endAt desc, startAt desc) limit 1` の 1 件（= latest）に一意化する**（sentinel は未来最大なので open エントリは常に latest）。open 複数時もこのクエリが決定的に 1 件を選ぶ（＝ startAt 最大の open）。

- **開始** = `createFirstLifeLog`/`newLifeLog` 相当。`新.startAt = (latest かつ latest.endAt≠sentinel) ? latest.endAt : now(秒)`、`endAt=sentinel`、`text=""`。
- **終了** = `setEndAtNow` 相当。open（latest かつ endAt==sentinel）の `endAt` を `now(秒)` に update。open 無しなら `409`。
- **切り替え** = 終了＋過去テキストで新規開始。Web に単一アクションは無い（`setEndAtNow`+`newLifeLog`+`saveText` 相当）が、**時計は 1 コミット / 1 editHistory エントリ（2 forward ops）に確定**（undo/redo は `operations` 配列を replay 可能, `editHistory/index.ts:19-39`）。`update 現 {endAt:now}` ＋ `set 新 {startAt:同 now, endAt:sentinel, text:chosenText, hasTreeNodes:false}`、ngram は `ngrams/<元id>lifeLogs`→`<新id>lifeLogs` コピー（§リスク #5）。

**確定した決定（元は未解決だった 3 論点。詳細は §「実装仕様」）**:

1. 連鎖規則・description 文言・selection は `actions.ts` 由来で `writeContract/` には入らず、Worker が §「エンドポイント仕様」の通り書き直す（契約ヘルパ共有ではこの層の Web との byte 一致は守られない → §「作業計画 #3」の差分テストで担保）。
2. **selection: `prevSelection={}`／`nextSelection={lifeLogs:<作成/対象 id>}`**。Web の undo/redo は `if (selection.lifeLogs || selection.lifeLogTreeNodes)` の時だけ適用（`editHistory/actions.ts`）＝**空 selection は Web の選択を触らず安全**。replay の doc 変更は selection 非参照（§リスク #7）。
3. **切り替え = 1 コミット / 1 エントリ / 2 forward ops**。description は start=`"LifeLog作成"`／stop=`"時刻設定"`／switch=`"切り替え"`（新設）。inverse は `deriveInverseOps` が生成（反転 `[delete 新, (update 現 {endAt:sentinel})]`）。

## 契約ロジックが切り出せる根拠（現状コードの下地）

1. **契約の配管はほぼ純粋**:
   - ngram 計算（`src/ngram.ts`）は import が `moji` のみ（firebase 非依存）。エンコード（`src/services/firebase/firestore/ngram.ts:22-32`）も純粋。
   - 逆操作生成（`buildInverseOps` の switch 部分, `batch.ts:279-315`）は `oldValues` マップを渡せば純粋。
   - editHistory エントリ形（`batch.ts:236-244`）・batchVersion 計算（`batch.ts:333-346`）も入力さえあれば純粋。

2. **`OperationRecordingBatch` は既に書き込み機構に固定されていない**。`Writer` インターフェース（`writer.ts`）越しに書き、`runBatch` は optimistic batch、`runTransaction` は Firestore `Transaction` を writer として渡している（`batch.ts:486`）。契約ロジックと具体的な書き込み経路は元々分離気味。

## firebase 結合の所在

| 依存 | 内容 | この段階での扱い |
|---|---|---|
| 書き込み先の型 | `Writer` が `DocumentReference` を取り、`doc(col,id)` / `serverTimestamp()` をインライン呼び出し | **クラスに残す**（テストが固定, 後述）。Worker は共有せず REST で別実装 |
| 読み取り | 逆操作旧値 = `getDoc`(cache/overlay)、head = `editHistoryHead$()` signal、version = `batchVersion$()` signal | **クラスに残す**。Worker は REST トランザクション read で別実装 |
| サーバ時刻 | `serverTimestamp()`（Web SDK FieldValue） | **クラスに残す**。Worker は `setToServerValue REQUEST_TIME` で別実装 |

## 実効の正直な見積り（何の drift が減り、何が減らないか）

純粋化して共有するのは上表の firebase 結合部分**ではなく**、その内側の導出ロジック（ngram / 逆操作 / 履歴・version の形）。ただし **drift 低減の実効は一様ではなく、全体としては小さい**:

- **ngram compute（`src/ngram.ts`）は既に firebase-free** → 移動・抽出不要。共有は「置き場所」の話で drift 低減ゼロ。
- **履歴エントリ・batchVersion はほぼ自明なオブジェクトリテラル** → 抽出しても drift 低減はわずか。
- **抽出価値が実在するのは `deriveInverseOps`（フィールド絞り込み＋逆順）だけ**。しかしその出力の正しさは、Worker が REST 読み取りから**独立に再現する入力**（旧 doc の正規形、特に `Timestamp` 表現）に完全依存する（§リスク #3）。`deriveInverseOps` が保証するのは inverse ops の**構造・順序・フィールド部分集合だけ**で、data の中身は共有されない二重実装。
- 本当に壊れやすい部分（serverTimestamp/sentinel・CAS read・overlay・旧値 read・§「ドメイン意味論」）は設計上クラス／`actions.ts`／Worker に残り、共有されない。

**したがって #1（純粋ヘルパ抽出）の正味の価値は「時計の drift 削減」ではなく、次の 2 点**:

1. `deriveInverseOps` を firebase 非依存の純粋関数として単体テスト可能な形で切り出す（現状 `batch.test.ts` の white-box 経由でしか検証されていない逆操作生成を、低いレイヤで固定できる）。
2. 既に純粋なコード（ngram compute / encode）を将来 Worker と同居できる firebase-free な場所に配置する。

時計の drift を実際に捕まえるのは #1 の抽出ではなく、§リスク #6（＝作業計画 #3）の emulator 差分テストである。この事実を作業計画の順序に反映する（後述）。

## ランタイム制約（Cloudflare Workers）

- **Workers で Firestore 公式 SDK は動かない**（firebase v8/v9・firebase-admin・@google-cloud/firestore は全て Node 依存）。→ Worker は **Firestore REST API（fetch）一択**。共有する純粋ヘルパは `firebase/firestore` を一切 import しないこと。
- **認証**: 時計で Firebase Auth（Google Sign-In）→ **ID トークンを Function に渡し、Function が REST の Bearer に使う**。これで `firestore.rules` の UID ゲートがそのまま効き、サービスアカウント鍵の管理が不要。（service-account JWT 方式は rules バイパスになるため非推奨。）
- **`Intl.Segmenter` の Workers 可否は未確定**（1 行 Worker のデプロイで `new Intl.Segmenter()` を叩けば即判定）。ただし**今回スコープではブロッカーにならない**:
  - 開始 = 空テキスト → ngram 不要（Web は空文字で `deleteNgram` を呼ぶが、存在しない doc の delete で状態は等価）。終了 = テキスト不変 → ngram 不要。
  - 切り替え = 選ぶテキストは既存エントリに必ず存在 → Worker は同一トランザクション内でその `ngrams/<旧id>lifeLogs` を読んで新 id にコピーすれば済む（セグメント計算不要）。ただし copy と recompute の等価性には条件がある（§リスク #5）。
  - Worker 側 ngram 計算（`Intl.Segmenter` / `moji`）が要るのは「任意の新規テキストを Worker 経由で書く」将来スコープのみ（スコープ外参照）。

## 詳細設計: 純粋ヘルパ抽出（作業計画 #1・実装前）

### 実装可能性の確認で判明した制約: テストが white-box oracle

`src/services/firebase/firestore/batch.test.ts`（挙動保証の本体）は `OperationRecordingBatch` の**内部に直接依存**している:

- `new OperationRecordingBatch(service, writer, batchId?)` を直接構築（`batch.test.ts` 多数＋`treeNode.test.ts`）。
- `batch.overlayMutations` / `batch.forwardOps` の getter をアサート。
- `batch.buildInverseOps()` を直接呼んで戻り値をアサート。

したがって **クラスのコンストラクタ・公開メソッド・getter・`buildInverseOps()` の形を変えると oracle 自体を書き換える**ことになり、「テスト不変＝挙動保存の証明」という安全網が崩れる。`(WriteSink, StateReader)` 注入・overlay の sink 移設・`buildInverseOps` 純粋化はこの制約に抵触するため**採らない**。

また、seam 注入は Worker 実現に**不要**。Worker が必要とするのは壊れやすいロジックそのものであって、オーケストレーション用のクラスではない（Worker は自前の REST オーケストレーションを書く）。

### 採用する方針: 純粋ヘルパ抽出のみ（クラスの外形は不変）

スコープを「**配管ロジックを firebase 非依存の純粋関数として切り出し、既存クラスがそれに委譲する**」に絞る。クラスのコンストラクタ・公開メソッド・getter・`buildInverseOps()` シグネチャは**一切変えない** → テスト無改変 → 挙動 oracle が本物のまま残る。§「実効の正直な見積り」のとおり、これで時計の drift が大きく減るわけではない点は承知の上で、単体で価値が出る範囲（テスト可能な `deriveInverseOps` と firebase-free 配置）に限る。

### `src/writeContract/`（firebase 非依存, 新設）: 正確なファイル・シグネチャ

各ファイルは **firebase / Node / `@/`（`src` 内モジュール） / `keyof Schema` のいずれにも依存しない**（唯一 `ngramDoc.ts` だけ `@/ngram` に依存する Web 専用ファイル。理由は後述）。op は `keyof Schema` マップ型ではなく**構造的型**で受ける（§「型共有の問題（解決）」）。

**`src/writeContract/types.ts`**（依存ゼロ）:
```ts
export type WriteOp =
  | { type: "set"; collection: string; id: string; data: Record<string, unknown> }
  | { type: "update"; collection: string; id: string; data: Record<string, unknown> }
  | { type: "delete"; collection: string; id: string };
export type Selection = Record<string, string>;
```

**`src/writeContract/inverseOps.ts`**（依存ゼロ, Web+Worker 共有の中核）:
```ts
export function deriveInverseOps(
  forwardOps: WriteOp[],
  oldValues: Map<string, Record<string, unknown>>,  // key = `${collection}/${id}`
): WriteOp[]
```
`batch.ts:276-318` の for/switch＋末尾 `.reverse()` をそのまま移設。set→`{type:"delete"}`、update→旧値のうち **forward.data に含まれるフィールドだけ**を `{type:"update"}`、delete→旧値全体を `{type:"set"}`（旧値が無ければ push しない）。`oldValues` のキー規約 `` `${collection}/${id}` `` はヘルパ契約の一部。

**`src/writeContract/batchVersion.ts`**（依存ゼロ, Web+Worker 共有）:
```ts
export function nextBatchVersionWrite(
  currentVersion: string | undefined,
  newUuid: string,
): { op: "set" | "update"; data: { prevVersion: string; version: string } }
```
`currentVersion` があれば `{op:"update", data:{prevVersion:currentVersion, version:newUuid}}`、無ければ `{op:"set", data:{prevVersion:"", version:newUuid}}`。`batch.ts:336-346`（commit）と `batch.ts:493-503`（runTransaction）の重複を統合。`uuidv7()` はクラス／Worker 側で生成して渡す。

**`src/writeContract/historyEntry.ts`**（依存ゼロ, Web+Worker 共有）:
```ts
export function buildHistoryEntry(args: {
  parentId: string; description: string;
  operations: WriteOp[]; inverseOperations: WriteOp[];
  prevSelection: Selection; nextSelection: Selection;
}): { parentId; description; operations; inverseOperations; prevSelection; nextSelection }
```
`batch.ts:236-244` の editHistory doc-data リテラルを返すだけ（`id`/`createdAt`/`updatedAt` は呼び出し側で付与）。

**`src/writeContract/ngramDoc.ts`**（**`@/ngram` に依存 = Web 専用**。Worker は switch で ngram を copy するため使わない, §「ランタイム制約」）:
```ts
export function buildNgramDoc(colId: string, id: string, text: string):
  | { action: "delete"; ngramId: string }
  | { action: "set"; ngramId: string; data: { collection: string; text: string; normalizedText: string; ngramMap: Record<string, true> } }
```
`ngramId = ` `${id}${colId}` `（区切り無し）`。`text==""` → `delete`。それ以外は `analyzeTextForNgrams`(`@/ngram`) + `encodeNgramMapForFirestore` で組む。`collectionNgramConfig` ゲート・`col.id==="ngrams"` ガード・`writer.set/delete`・overlay 記録は**クラス側に残す**（呼び出し前に判定）。`encodeNgramKeyForFirestore`/`encodeNgramMapForFirestore` を現 `services/firebase/firestore/ngram.ts` からここへ移動し、旧位置は re-export shim（importer 無改変）。

補足: `isHistoryOperationCollection` / `excludedCollections`（`batch.ts:77-81`）は `keyof Schema` に依存し Web 固有の判定なので**移動しない**（クラスに残す）。

**`src/writeContract/rest/`・`src/writeContract/ops/`（Worker 書き込みパス, 作業計画 #2・#3。firebase 非依存・`Intl` 非依存・`fetch` 注入、エンドポイント＋差分ゲートのみが import）**: 上記 top-level 純粋ヘルパ＋ REST トランスポートの上に start/stop/switch/switch-candidates のドメイン操作を実装する共有モジュール。詳細は §「実装仕様: 共有 Worker 書き込みパスとエンドポイント」。**Web アプリのバンドルには載らない**（`OperationRecordingBatch` はこれらを import せず、top-level 純粋ヘルパだけを委譲先にする）。switch の ngram は source doc を REST コピーするため `@/ngram`（`Intl.Segmenter`）に非依存＝ `ngramDoc.ts` は使わない。

### 型共有の問題（解決）

当初の懸念は「`HistoryOperation` が `keyof Schema` マップ型で、`Schema` を ambient 拡張するモジュール（`batch.ts` 等）が firebase 結合ランタイム副作用を持つため、firebase-free な `writeContract/` に型を持ち込めない」だった。**解決策: ヘルパの境界を `keyof Schema` から切り離し、上記の構造的 `WriteOp`（`collection: string`）で受ける**。`deriveInverseOps` の switch は `op.type`/`op.collection`/`op.id`/`op.data` しか使わず collection 名を値としてしか触らないので、構造的型で十分。

- Web 側クラスは自前の `HistoryOperation[]` を `WriteOp[]` として渡す（`HistoryOperation` は `WriteOp` に構造的に代入可能。摩擦があれば `as WriteOp[]` キャスト——既存 `buildInverseOps` も `as HistoryOperation` キャストを使っており前例通り）。戻り値も同様にクラス側で `HistoryOperation[]` に扱う。
- これで `writeContract/` は `keyof Schema` にも firebase にも依存せず、Web/Worker 双方が**同一ソースを bundle**できる。(a) Schema 型複製も (b) スキーマ分離リファクタも**不要**になった。

### エンドポイントと差分ゲートが共有モジュールを import する具体機構

`functions/`（Cloudflare Pages Functions）は `@/` エイリアスを持たず（`functions/tsconfig.json` は `moduleResolution:"bundler"` ＋ `include:["./**/*.ts"]`、root `tsconfig` は `functions` を exclude）、`src` から import する前例も無い。共有を成立させる手段:

- エンドポイント（`functions/api/lifelog/*.ts`）は共有モジュールを**相対 import**する: `import { startLifeLog } from "../../../src/writeContract/ops/start";`（`ops/`・`rest/`・top-level 純粋ヘルパすべて）。TS は `include` 外でも import 先を辿って型解決し、Pages の esbuild bundle も相対 import を辿って純粋 TS を同梱する。これが成立するのは共有モジュールが `firebase/firestore` を一切 import せず（Workers で SDK は動かない）、`Intl.Segmenter`/`moji` も引かない（switch は ngram を REST コピー）ため。op の引数/戻り値型もこの import で共有され、手動複製は不要。
- 差分ゲート（`src/` browser-mode テスト）は同じモジュールを `@/writeContract/ops/...` で import する。**エンドポイントとゲートが物理的に同一関数を通る**ので、「同一 REST commit」はレビューではなく構造で保証される。
- eslint の `no-relative-import-paths/no-relative-import-paths` は関数ソースで発火するため、当該 import 行または関数ファイル冒頭に既存テスト同様の `/* eslint-disable no-relative-import-paths/no-relative-import-paths */` を付す。
- `ngramDoc.ts` は `@/ngram`→`moji`/`Intl.Segmenter` を引き込むので **Worker は import しない**（switch は copy）。将来 Worker で任意テキストを ngram 化する場合のみ、`Intl.Segmenter` の Workers 実測（§スコープ外）が前提。
- **検証**: 共有が本当に効いているかは §「作業計画 #3」の emulator 差分テストが担保する（Web 経路と REST 経路が同一 `ops`/`deriveInverseOps` を通り、doc 集合・inverse ops が突合）。

### 既存クラスの変更（外形不変・内部委譲のみ）

- `buildInverseOps()`: 旧値収集（`getDoc` で impure）はそのまま、逆操作生成だけ `deriveInverseOps(...)` へ委譲。戻り値・シグネチャ不変（テスト無改変）。
- `recordHistory()`: エントリ組立を `buildHistoryEntry(...)` へ委譲。head 取得（`getOptimisticHistoryHeadState`）・emit 経路は現状維持。
- `set`/`update`（`text` 変化時）: ngram doc ビルダを呼び、`collectionNgramConfig` ゲート・`writer.set/delete` + overlay 記録は現状のまま。`createdAt`/`updatedAt` の `serverTimestamp()` もクラスに残す。
- `commit()`: batchVersion 形の計算だけ `nextBatchVersionWrite(...)` へ委譲。楽観コミット駆動・`getOptimisticBatchVersion` は現状維持。
- `runTransaction()`: batchVersion 書き込みが `commit()` と重複しているため（`batch.ts:493-503`）、これも同じ `nextBatchVersionWrite(...)` へ委譲。契約プロデューサは楽観 commit と transaction の**2 経路**あるので、両方が単一ヘルパを使って初めて「Worker と一致させる単一情報源」が成立する。

### firebase 結合として**あえてクラスに残す**もの

`doc()` / `serverTimestamp()` / `Writer`(=`DocumentReference` ベース) / overlay 記録 / signal 読み取り / `getCollection` / `collectionNgramConfig` ゲート / コンストラクタ `(service, writer, batchId?)` / `.overlayMutations`・`.forwardOps` getter。これらは white-box テストが固定しているため、この段階では触らない。Worker はこれらを共有せず、純粋ヘルパの上に REST 実装を別途書く。

### クロスファイル影響（テスト以外の実コード）

- `encode*`（`encodeNgramKeyForFirestore`/`encodeNgramMapForFirestore`, 現 `src/services/firebase/firestore/ngram.ts`）を `writeContract/` へ移動 → 旧 `ngram.ts` から **re-export**（`export { ... } from "@/writeContract/..."`）して全 importer を無改変に保つ。importer は `panes/search/search.tsx`・`panes/lifeLogs/lifeLog.tsx`・`components/share/share.tsx`（実コード3ファイル, 確認済み）＋ `ngram.test.ts`・`components/share/share.test.tsx`（テスト2ファイル, 確認済み）。re-export shim を使えば import パス修正はゼロ（テスト無改変が本当に成立）。
- クラス利用側（`treeNode.ts` / `editHistory/index.ts` の `import type`、全 actions）は**変更なし**。

### 挙動保存の不変条件（テストが証明し続ける＝壊してはいけない点）

1. 1 操作あたりに書かれる doc 集合（主 + ngram + editHistory + editHistoryHead + batchVersion）・id・data が同一。
2. `createdAt`/`updatedAt` にサーバ時刻が入る。
3. inverse ops の内容（undo の正しさ）。`buildInverseOps()` の戻り値がビット等価。
4. overlay の内容とタイミング（楽観適用、commit 失敗時 rollback）。
5. `runTransaction` の version 不一致 abort。

`batch.test.ts`(services/firestore) / `optimisticOverlay.test.ts` / `onSnapshot.test.ts` / `editHistory.test.ts` / `treeNode.test.ts` を**無改変**で維持。純粋ヘルパには単体テストを新規追加してよい（既存挙動の複製を固定）。

## 実装仕様: 共有 Worker 書き込みパスとエンドポイント（作業計画 #2・#3・#4）

Worker 側の書き込みパス（REST エンコード・トランザクション・契約組み立て・start/stop/switch のドメイン操作）は **firebase 非依存・`Intl` 非依存・`fetch` 注入の共有モジュールとして `src/` に置く**（`src/writeContract/rest/` = REST トランスポート #2、`src/writeContract/ops/` = ドメイン操作 #3）。**エンドポイント（#4, `functions/api/lifelog/*`）と差分ゲート（#3, `src/` テスト）の双方がこの同一コードを import する**（functions は相対 import、テストは `@/`）。これで「テストが叩く REST commit」と「本番が叩く REST commit」が同一 byte になることを構造的に保証する（re-implementation を作らない）。Cloudflare Pages Functions のハンドラ自体は認証・body・status のマッピングだけを行う薄いラッパ。**実装者が判断を迫られる箇所は本節ですべて確定済み**。未確定を残さない。

### 定数・環境

| 名前 | 値 | 出所 |
|---|---|---|
| REST base（本番） | `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents` | 確認済み |
| REST base（emulator） | `http://${FIRESTORE_EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents` | `firebase.local.json`（port 8080）, `lifeLogs.test.tsx:202` |
| `PROJECT_ID` | env var `FIRESTORE_PROJECT_ID`（dev=`rejysten3-dev`）。※repo にコミットされておらず runtime config 由来なので**必ず env var 化**。ID トークンの `aud` クレームからも取得可（代替） | `.firebaserc`, agent 調査 |
| database id | `(default)`（固定） | 確認済み |
| doc name | `projects/${PROJECT_ID}/databases/(default)/documents/${col}/${id}` | 確認済み |
| singleton doc id | `"singleton"`（`/batchVersion/singleton`, `/editHistoryHead/singleton`） | `index.tsx` |
| collections（全 top-level） | `lifeLogs` / `ngrams` / `editHistory` / `editHistoryHead` / `batchVersion` | 確認済み |
| sentinel（未設定時刻） | `"3000-12-31T23:59:59.000Z"`（`timestampValue`。seconds=32535215999, nanos=0） | `timestamp.ts:5` |
| ngram doc id | `` `${lifeLogId}lifeLogs` ``（区切り無し） | `ngram.ts:53` |
| 本番 uid | `XoVR64j2pfgnlX8L05kL5V96y8n1`（rules ゲート。Worker は検証不要——Firestore が ID トークンから評価） | `firestore.rules` |
| emulator | project=`demo`, host:port=`0.0.0.0:8080`, 認証=`Authorization: Bearer owner`（admin bypass）, rules=`firestore.local.rules` | `firebase.local.json`, `package.json` |

Env 型（`functions/api/lifelog/*.ts` 各ファイル）: `interface Env { FIRESTORE_PROJECT_ID: string; FIRESTORE_EMULATOR_HOST?: string }`。`FIRESTORE_EMULATOR_HOST` があれば emulator base ＋ `Bearer owner` を使う（テスト用）。本番は Cloudflare Pages ダッシュボードで `FIRESTORE_PROJECT_ID` を設定。

### 認証（ID トークン pass-through, サービスアカウント不要）

**確定事実**: Firestore REST は `Authorization: Bearer <Firebase ID トークン>` を受け付け、**Security Rules を適用する**（`request.auth.uid` はこの ID トークンから populate される）。サービスアカウントの OAuth2 access token を使うと rules は**バイパス**され IAM 判定になる（＝uid ゲート・CAS が効かない）。出典: [Firebase: Use the REST API](https://firebase.google.com/docs/firestore/use-rest-api), [Rules and Auth](https://firebase.google.com/docs/rules/rules-and-auth)。

したがって:
- 時計が Firebase Auth（同一 Google アカウント = uid `XoVR…`）でサインインし、`getAuth().currentUser.getIdToken()` で ID トークンを取得。
- 時計 → Function: `Authorization: Bearer <idToken>` ＋ JSON body（コマンド引数）。
- Function は受け取った Authorization ヘッダを**そのまま** Firestore REST の全リクエストに転送する。Function 自身は資格情報を持たない。トークン検証も不要（Firestore が行う）。
- rules の uid ゲート・batchVersion CAS がそのまま効く。サービスアカウント鍵の管理・External Service Review 対象の新資格情報は不要。
- Authorization ヘッダ欠如 → Function は即 `401`。Firestore が `401` を返したら（トークン失効）そのまま時計へ伝播（時計はトークン再取得）。

### REST 値エンコード（`toValue`）

| JS | Firestore REST |
|---|---|
| `string` | `{ "stringValue": s }` |
| `boolean` | `{ "booleanValue": b }` |
| Timestamp | `{ "timestampValue": "<RFC3339 UTC, ms 精度, 例 2026-07-20T04:05:06.000Z>" }` |
| map | `{ "mapValue": { "fields": { … } } }` |
| array | `{ "arrayValue": { "values": [ … ] } }` |

- 秒粒度の now は `new Date(Math.floor(Date.now()/1000)*1000).toISOString()` → `"...:SS.000Z"`。§「確定した契約: 格納 timestamp は秒粒度」に一致。
- `ngramMap` は `{mapValue:{fields:{ "<encoded key>": {booleanValue:true}, … }}}`（値は `true`）。ngram doc に `createdAt`/`updatedAt` は**無い**。

### Firestore REST トランザクション手順（読み取り→書き込み厳守）

1. `POST {base}:beginTransaction` body `{"options":{"readWrite":{}}}` → `{ "transaction": "<token>" }`。
2. **読み取り（すべて書き込みより前）**、`transaction` トークン付き:
   - `POST {base}:batchGet` body `{"documents":[<name(batchVersion,singleton)>, <name(editHistoryHead,singleton)>, …], "transaction":"<token>"}`。各要素は `{found:{name,fields}}` か `{missing:name}`。
   - `POST {base}:runQuery` body `{"structuredQuery":{"from":[{"collectionId":"lifeLogs"}],"orderBy":[{"field":{"fieldPath":"endAt"},"direction":"DESCENDING"},{"field":{"fieldPath":"startAt"},"direction":"DESCENDING"}],"limit":1},"transaction":"<token>"}` → 最新エントリ 1 件（`goToLatest`(`actions.ts:237`) と同一クエリ）。
3. `POST {base}:commit` body `{"transaction":"<token>","writes":[ … ]}`。
4. commit が `ABORTED`/`409`（競合）→ 1 から最大 5 回リトライ（version を読み直す）。`PERMISSION_DENIED`（CAS 不一致も同様に version 変化なのでリトライ）。恒久失敗 → `503`。`401`（トークン不正）→ 伝播。

トランザクションは serializable。読んだ doc が commit 前に変わっていれば ABORTED になる＝batchVersion の CAS はトランザクション分離＋rules の二重で保証される。

### エントリ特定規則

- **latest** = 上記 runQuery の 1 件（0 件なら「タイムライン空」）。sentinel は未来最大なので **open エントリ（`endAt==sentinel`）は常に latest**。
- **open エントリ** = `latest` かつ `latest.endAt == sentinel`。無ければ「open 無し」。

### 書き込み組み立て（全経路共通、Web の `OperationRecordingBatch` を REST で再現）

1 コミットに以下の writes を積む（doc は全部別 doc なので writes 配列の順序は結果に無関係）:

- **lifeLogs set**（新規作成）: `{"update":{"name":<name(lifeLogs,id)>,"fields":{text,hasTreeNodes,startAt,endAt}},"updateTransforms":[{"fieldPath":"createdAt","setToServerValue":"REQUEST_TIME"},{"fieldPath":"updatedAt","setToServerValue":"REQUEST_TIME"}]}`。`updateMask` 無し＝全 doc 上書き（SDK `set` 相当）。
- **lifeLogs update**（endAt のみ）: `{"update":{"name":…,"fields":{endAt}},"updateMask":{"fieldPaths":["endAt"]},"updateTransforms":[{"fieldPath":"updatedAt","setToServerValue":"REQUEST_TIME"}],"currentDocument":{"exists":true}}`。**`updateMask` 必須**（無いと他フィールドが消える。SDK `update` のマージ相当）。
- **ngrams set**（switch のみ、コピー）: `{"update":{"name":<name(ngrams,`${newId}lifeLogs`)>,"fields":{collection:sv("lifeLogs"), text, normalizedText, ngramMap}}}`。timestamp transform 無し。source ngram doc を読んで fields をそのまま再出力（byte 等価を保証）。source ngram が無い（元テキスト空）ときは**書かない**。
- **editHistory set**: name=`editHistory/${uuidv7()}`、fields=`buildHistoryEntry(...)` を encode（後述）＋ `updateTransforms:[createdAt, updatedAt REQUEST_TIME]`。
- **editHistoryHead**: head が既存 → update `{fields:{entryId}, updateMask:["entryId"], updateTransforms:[updatedAt], currentDocument:{exists:true}}`; 無ければ set（create）＋ createdAt/updatedAt transform。
- **batchVersion**: `nextBatchVersionWrite(currentVersion, uuidv7())`。`op:"update"` → `{fields:{prevVersion,version}, updateMask:["prevVersion","version"], updateTransforms:[updatedAt], currentDocument:{exists:true}}`; `op:"set"` → create＋createdAt/updatedAt transform。

`Write` の `update` と `updateTransforms` は同一 write に共存し、update 適用後に transform が原子適用される（＝業務フィールドとサーバ時刻を 1 write で原子書き込みできる。SDK の `set/update({... createdAt: serverTimestamp()})` 相当）。出典: [Firestore REST `Write`](https://cloud.google.com/firestore/docs/reference/rest/v1/Write)。`updateTransforms` は `updateMask` の対象外（マスクに含めなくてもサーバ時刻は入る）。

`editHistory.operations`/`inverseOperations` の encode: 各 op を `{mapValue:{fields:{type:sv, collection:sv, id:sv, data:{mapValue:{fields:<data を encode>}}}}}`（delete は `data` 無し）。**data 内の `startAt`/`endAt` は必ず `timestampValue`**（`stringValue` にすると Web と drift。§リスク #3）。配列は `{arrayValue:{values:[…]}}`。

契約の組み立て（editHistory / inverse / batchVersion）は `src/writeContract/ops/` が top-level 純粋ヘルパ（`buildHistoryEntry` / `deriveInverseOps` / `nextBatchVersionWrite`）を使って行う。functions からの相対 import 経路は §「エンドポイントと差分ゲートが共有モジュールを import する具体機構」。

### エンドポイント仕様

以下の手順は共有 `ops` 関数（作業計画 #3）の振る舞い；ハンドラ（#4）は認証・body・status のマッピングのみを担う。全て `Authorization: Bearer <idToken>` 必須。レスポンスは `Response.json(...)`（HTTP 200 に成否を載せる既存慣習に倣うが、認証・not-found・競合は下記の通り非 200 も使う）。

**`POST /api/lifelog/start`**（`functions/api/lifelog/start.ts`, `onRequestPost`）
- req body: `{}`（引数なし）。
- 手順: tx 開始 → read(batchVersion, editHistoryHead, latest) → `newId=uuidv7()`, `now=秒粒度 now`, `startAt = (latest && latest.endAt!==sentinel) ? latest.endAt : now`, `endAt=sentinel`。
- forwardOps = `[{type:"set",collection:"lifeLogs",id:newId,data:{text:"",hasTreeNodes:false,startAt,endAt:sentinel}}]`；oldValues=空 → inverse=`[{type:"delete",collection:"lifeLogs",id:newId}]`。
- editHistory: description `"LifeLog作成"`, prevSelection `{}`, nextSelection `{lifeLogs:newId}`, parentId=head.entryId ?? ""。
- writes = [lifeLogs set, editHistory set, editHistoryHead set/update, batchVersion set/update]（ngram 無し=空テキスト）。
- res: `{ok:true, id:newId}`。

**`POST /api/lifelog/stop`**（`onRequestPost`）
- req body: `{}`。
- 手順: tx 開始 → read(batchVersion, editHistoryHead, latest)。open 無し（latest 無し or `latest.endAt!==sentinel`）→ rollback, `409 {ok:false, reason:"no open entry"}`。
- open=latest。`now=秒粒度 now`。oldValues[`lifeLogs/${open.id}`] = `{text:open.text, hasTreeNodes:open.hasTreeNodes, startAt:open.startAt, endAt:sentinel}`（id/createdAt/updatedAt を剥がす）。
- forwardOps=`[{type:"update",collection:"lifeLogs",id:open.id,data:{endAt:now}}]` → inverse=`[{type:"update",collection:"lifeLogs",id:open.id,data:{endAt:sentinel}}]`（deriveInverseOps が oldValues の endAt を採用）。
- editHistory: description `"時刻設定"`（Web の `setEndAtNow` と同一）, prevSelection `{}`, nextSelection `{lifeLogs:open.id}`。
- writes = [lifeLogs update(endAt), editHistory set, editHistoryHead update, batchVersion update]。
- res: `{ok:true, id:open.id}`。

**`POST /api/lifelog/switch`**（`onRequestPost`）— **1 コミット / 1 editHistory エントリ（2 forward ops）で確定**（undo/redo は `operations: HistoryOperation[]` 配列を replay できる。`editHistory/index.ts:applyOperations`）。
- req body: `{sourceId: string}`（テキストを引き継ぐ過去エントリ id。GET 候補から選ぶ）。
- 手順: tx 開始 → read(batchVersion, editHistoryHead, latest, `lifeLogs/${sourceId}`, `ngrams/${sourceId}lifeLogs`)。source 無し → `404 {ok:false, reason:"source not found"}`。
- `now=秒粒度 now`, `newId=uuidv7()`, `chosenText=source.text`。
- forwardOps/oldValues:
  - open あり（latest.endAt==sentinel）: forward に `{type:"update",id:open.id,data:{endAt:now}}` を積み、oldValues[`lifeLogs/${open.id}`]=normalized(open)、`startAtForNew=now`。
  - open 無し: `startAtForNew = (latest && latest.endAt!==sentinel) ? latest.endAt : now`。
  - forward に `{type:"set",id:newId,data:{text:chosenText,hasTreeNodes:false,startAt:startAtForNew,endAt:sentinel}}` を積む。
- inverse = deriveInverseOps(forwardOps, oldValues)（= 反転 `[delete new, (update open {endAt:sentinel})]`）。
- editHistory: description `"切り替え"`（**新設。Web に前例なし**）, prevSelection `{}`, nextSelection `{lifeLogs:newId}`。
- ngram: source ngram doc があれば `ngrams/${newId}lifeLogs` へコピー（fields そのまま）。無ければ書かない。
- writes = [ (open あれば) lifeLogs update(endAt), lifeLogs set new, (ngram あれば) ngrams set, editHistory set, editHistoryHead set/update, batchVersion set/update ]。
- res: `{ok:true, id:newId, stoppedId: open?.id ?? null}`。

**`GET /api/lifelog/switch-candidates`**（`functions/api/lifelog/switch-candidates.ts`, `onRequestGet`）
- 目的: 時計が「過去の例」を選ぶための候補一覧。read-only（トランザクション不要、単発 runQuery、Bearer 転送）。
- 手順: `runQuery` で lifeLogs を `orderBy(endAt desc, startAt desc) limit 100` 取得 → `text!==""` で絞り、**exact text で重複排除（新しい方の id を保持）** → 先頭 20 件。open エントリ（endAt==sentinel）は除外。
- res: `{ok:true, candidates:[{id, text}]}`。件数・スキャン上限（20/100）は定数化して調整可。

### エラー・abort・リトライ（確定）

- Authorization 欠如 → `401`。Firestore `401` → 伝播（`{ok:false, reason:"unauthorized"}`）。
- body 不正（JSON parse 失敗 / `sourceId` 欠如）→ `400 {ok:false, reason:"bad request"}`。
- commit `ABORTED`/`409`/CAS `PERMISSION_DENIED` → read からリトライ（最大 5 回, 小 backoff）。恒久失敗 → `503 {ok:false, reason:"contention"}`。
- switch の source not found → `404`。stop の open 無し → `409`。

### functions/ 実装規約（既存慣習に厳密に倣う）

- ファイルパス=ルート（filesystem routing, `wrangler` 設定不要）。`functions/api/lifelog/start.ts` → `POST /api/lifelog/start`。
- ハンドラ: `export const onRequestPost: PagesFunction<Env> = async (context) => {…}`（GET は `onRequestGet`）。`context.request` / `context.env`。
- **ハンドラは薄いラッパ**: `Authorization` ヘッダ＋ body を取り出し、`src/writeContract/ops` の対応関数へ `{fetch: globalThis.fetch, baseUrl, projectId, authHeader}` を渡して呼び、戻り値（`{ok, …}` か理由）を `Response.json`＋status にマップするだけ。REST 組み立て・トランザクション・契約は ops 側（#3）にあり、ハンドラには持たせない。
- body: `await context.request.json()` を try/catch し、`unknown` を手動 narrow。ヘッダ: `context.request.headers.get("Authorization")`。
- レスポンス: `Response.json({...}, {status})`。CORS 不要（same-origin。時計は別 origin だが、Cloudflare Pages の同一ゾーンから叩く／もしくは CORS が要るなら `onRequestOptions` を新設——time-tracking 時計の実配置に依存するので、**別 origin から叩くなら CORS プリフライト対応を追加**）。
- npm 依存は `uuidv7`（pure JS, Workers 対応, `crypto.getRandomValues` 使用）を import 可。firebase SDK は不可。
- 共有モジュール（`ops/`・`rest/`・純粋ヘルパ）は相対 import ＋ `/* eslint-disable no-relative-import-paths/no-relative-import-paths */`。op の引数/戻り値型もこの import で共有（手動複製不要）。
- テスト: 各エンドポイントに co-located `*.test.ts`（`@cloudflare/vitest-pool-workers`, `pnpm test:functions`）。`createContext(...) as unknown as Parameters<typeof onRequestPost>[0]` ＋ `globalThis.fetch = vi.fn()` で Firestore REST をスタブ。ここで検証するのは HTTP 面（`401`/`400`/`404`/`409`/`503`・body 形）だけで、契約 byte は #3 の emulator 差分ゲートが担保する。HTTP の req/res JSON 形だけハンドラ局所。

### emulator 差分テスト（作業計画 #3 の drift ゲート）具体

エンドポイントのハンドラテストは Workers プール（`fetch` スタブ）で走り emulator に届かない。ゆえに**実 emulator に対する REST 書き込みを試せるのは `src/` の browser-mode テストだけ**（既存テストが `Bearer owner` で `http://localhost:8080` を raw fetch 済み: `lifeLogs.test.tsx:209`）。差分ゲートはここに置き、**REST 経路はエンドポイントと同一の共有 `ops` モジュール（`src/writeContract/ops`）を `@/` 経由で import して駆動する**（テスト内で REST commit を再実装しない＝ゲートとエンドポイントが同一 byte を通ることを構造的に保証）。

`src/` 側 vitest で:
1. **Web 経路**: 実 action もしくは直接 `runBatch` で start/stop/switch を実行（app と同じ emulator project=`demo`, `Bearer owner`）し、結果 doc 群（lifeLogs/ngrams/editHistory/editHistoryHead/batchVersion）を読み戻す。
2. **REST 経路（＝本番エンドポイントと同一コード）**: `src/writeContract/ops` の start/stop/switch を `{fetch, baseUrl=emulator REST, projectId=別 project, authHeader:"Bearer owner"}` 注入で呼び、別 project の DB に書いて読み戻す。
3. **突合**: createdAt/updatedAt（サーバ時刻）と uuidv7 id を正規化して除外し、それ以外の doc 集合・inverse ops・batchVersion 形・ngram を field 単位で比較。特に **stop の inverse `endAt`（`timestampValue`）が両経路で一致**することを固定。
   - **start / stop は Web に 1:1 対応がある**（`newLifeLog`/`createFirstLifeLog`、`setEndAtNow`）。Worker 出力の lifeLogs doc・editHistory エントリ（operations/inverseOperations/description）・batchVersion が Web と byte 一致することを突合。**ただし selection provenance は意図的に Web と異なる**: 実 action は `prevSelection=currentSelection()`（UI 選択）で、`setEndAtNow` は nextSelection 無し。Worker は §確定した決定 #2 のとおり `prevSelection={}`／`nextSelection={lifeLogs:id}` に固定する（§リスク #7 のとおり空 selection は Web の undo/redo に安全）。よってゲートは selection を等値比較の対象から外し、Web 側 `runBatch` を Worker と同じ selection 規約で駆動して**契約の配管**（ops/inverse/timestamp/batchVersion）の一致を隔離検証する。selection 規約そのものは §「エンドポイント仕様」＋ REST-ops テスト（Layer A）で固定。
   - **switch は Web に単一対応が無い**（Web は stop+new+text の 3 コミット/3 エントリ）。ゆえに switch は 2 段で検証する: (a) **結果 doc**（stop された旧エントリ endAt・新 lifeLog・新 ngram）が「Web の stop→new→saveText 連続」の結果と一致、(b) switch の editHistory エントリ（Worker 固有の 2-op エントリ）の **inverseOperations を Web の undo エンジン（`editHistory/index.ts`）で適用すると switch 前の状態へ厳密に復元**すること（forward→inverse の往復で不変）。

これが「時計 drift の実質的な唯一のゲート」（§リスク #6）。

## 作業計画

依存関係で並べる。drift を実際に捕まえるのは差分ゲート（#3）だが、ゲートの REST 経路は #1 の共有ヘルパと #2 の REST パスの上にしか成立しない。よって #1・#2 が先で #3 が続く。#1 は既存テスト oracle で守られた安全な前提整備なので先頭。**ゲートの「REST 経路」と本番エンドポイント（#4）は同一の共有モジュール（`src/writeContract/rest` + `ops`）を通す**——テスト側で REST commit を再実装しない（再実装するとゲートとエンドポイントが二重実装になり、それ自体が drift 源になる）。

1. **純粋ヘルパ抽出**（`src/writeContract/{types,inverseOps,batchVersion,historyEntry,ngramDoc}.ts`, firebase 非依存）: §「正確なファイル・シグネチャ」の 5 ファイルを実装し、既存クラス（`OperationRecordingBatch`）を委譲に置換。クラスの外形・既存テストは**無改変**。型共有は構造的 `WriteOp` で**解決済み**（§「型共有の問題（解決）」——追加の Schema リファクタ不要）。純粋ヘルパの単体テストを追加。**依存なし**。→ 既存テスト（`batch.test.ts` 他）＋ `pnpm tsc` / `pnpm lint` / `pnpm test` 全 green が挙動保存の客観ゲート。
2. **共有 REST トランスポート**（`src/writeContract/rest/`, firebase 非依存・`Intl` 非依存・`fetch` 注入）: `toValue` エンコード（§「REST 値エンコード」）、`WriteOp[]` → Firestore REST `writes` への組み立て（§「書き込み組み立て」）、トランザクションランナー（beginTransaction→batchGet/runQuery→commit＋リトライ, §「Firestore REST トランザクション手順」）、Bearer pass-through。設定（base URL / projectId / auth header / fetch）は引数注入。**依存: #1**（組み立てが `deriveInverseOps`/`nextBatchVersionWrite`/`buildHistoryEntry` を使う）。→ emulator への単発 round-trip テスト（REST で 1 doc 書いて読み戻す）。
3. **ドメイン操作 ＋ 差分ゲート**（`src/writeContract/ops/`）: §「時計が再現する層」の意味論と §「エンドポイント仕様」の手順どおり start/stop/switch/switch-candidates を #1・#2 の上に実装。**このモジュールが唯一の契約実装で、#4 のエンドポイントと差分ゲートの両方がこれを import する**。ゲート（§「emulator 差分テスト具体」）で REST 経路 vs Web 経路（`runBatch`）を doc 集合単位で突合（サーバ時刻・uuidv7 を正規化除外）。特に stop/switch の inverse `endAt`（`timestampValue`）と `oldValues` 正規化（`batch.ts:265-267`）を双方向で固定。switch は Web に 1:1 対応が無いので inverse を Web の undo エンジン（`editHistory/index.ts`）で replay して往復不変を検証。**依存: #1, #2**。selection provenance（prevSelection `{}`／nextSelection `{lifeLogs:…}`）・切り替えのコミット粒度（1 コミット/1 エントリ/2 ops）・基準/open エントリ特定（latest = endAt desc, startAt desc, limit1）・秒粒度はいずれも §「時計が再現する層」で確定済み——ここではコード＋ゲートのケースに書き下すだけ（旧「ドメイン意味論」ステップはこの #3 に吸収）。
4. **HTTP エンドポイント**（`functions/api/lifelog/{start,stop,switch}.ts` ＋ `switch-candidates.ts`）: #3 の共有 ops を相対 import する**薄いラッパ**。`Authorization` ヘッダ／body の取り出し → op 呼び出し（emulator/本番の `{fetch, baseUrl, projectId, authHeader}` を注入）→ `Response`/status へマップ（§「エンドポイント仕様」「エラー・abort・リトライ」「functions/ 実装規約」）。テストは Workers プール（`@cloudflare/vitest-pool-workers`, `fetch` スタブ）で HTTP 面（`401`/`400`/`404`/`409`/`503`・body 形）を検証。契約 byte は #3 のゲートが担保するのでここでは繰り返さない。**依存: #3**。
5. **Wear OS クライアント**（別 Kotlin プロジェクト、同一 repo 内）: 薄い HTTPS クライアント。Firebase Auth で ID トークン取得 → `Authorization: Bearer` ＋ コマンド JSON を Function に POST。契約の配管ロジックはゼロ（ドメイン意味論も #3 側で確定済み）。別 origin から叩くなら Function 側に CORS プリフライト対応を追加（§functions/ 実装規約）。**依存: #4**。

#1 の狙いは「fragile ロジックの一括抽出」ではなく、**`deriveInverseOps` の共有化＋既に純粋なコード（ngram compute / encode）の firebase-free 配置**（→ §「実効の正直な見積り」）。委譲できるのはこの範囲のみ。#2・#3 が Worker 側書き込みパスの本体で、#4 はその HTTP 面だけを担う。

## リスクと検証

1. 触るのは最もホットで最もテストされた書き込み経路 → 裏を返せば回帰網が厚い。純粋ヘルパ抽出＋委譲は挙動保存で守れる。テストは無改変が原則。
2. 純粋ヘルパの出力が既存と**ビット等価**であること（ngram の normalizedText/ngramMap、逆操作の内容、履歴エントリ形）。抽出後に既存テストが green であることで担保し、加えてヘルパ単体テストで固定。
3. （将来 Worker 段階）**逆操作の drift 境界は `deriveInverseOps` の出力ではなく入力側にある**。`deriveInverseOps` が保証するのは inverse ops の構造・順序・フィールド部分集合だけで、`data` の中身は `oldValues`（旧 doc を読んで id/`createdAt`/`updatedAt` を剥がした正規形, `batch.ts:265-267`）由来。Worker は REST 読み取りから**この JS 値形（特に Timestamp 表現）を独立に再現**して `deriveInverseOps` に渡す必要がある——ここは共有されない二重実装境界。stop/switch は endAt の update なので inverse update に旧 endAt Timestamp が埋まり、drift の焦点になる。→ #6 の emulator 突合で裏取り。
4. **既知の flaky テスト**（addSibling 系が ~20% flake, `.flaky-tests/` 参照）で合否シグナルにノイズ。infra エラー / flaky はリトライで切り分け、実回帰と区別する。
5. （将来 Worker 段階）**切り替えの ngram は「copy」か「recompute」かで経路が違う**。Web の切り替えは新テキストで `setNgram` → `Intl.Segmenter` 再計算する。Worker は切り替え元エントリの `ngrams/<旧id>lifeLogs` を新 id にコピーする。両者が byte 一致するのは、元エントリの ngram が現行アルゴリズムと同じ版で計算済みのとき（コーパスの版ずれがあると不一致）。加えて、切り替え元が空テキスト（ngram doc 無し）の場合は新 id に ngram を書かないこと。→ #6 で突合。
6. （差分ゲート = 作業計画 #3）「full contract（batchVersion / editHistory 込み）で外部コミットしたとき Web が再突合するか」を emulator ベーステストで裏取り。リスク #3 の oldValues 正規化（特に stop/switch の inverse endAt）も同テストで Web/REST 双方向に突合する。**これが時計 drift の実質的な唯一のゲート**なので、エンドポイント（#4）より前の作業計画 #3 に置いた。
7. **【解決済み】時計発 editHistory の provenance**: `prevSelection={}`／`nextSelection={lifeLogs:<作成/対象 id>}` で確定。Web の undo/redo は返り値 selection を `if (selection.lifeLogs || selection.lifeLogTreeNodes)` の時だけ適用する（`editHistory/actions.ts:59,78,140,170,189`）ので、**空 selection は Web の選択を一切触らず安全**。異質 id を載せても replay の doc 変更は selection を使わない（`applyOperations` は selection 非参照, `editHistory/index.ts:19-39`）。description は start=`"LifeLog作成"`/stop=`"時刻設定"`/switch=`"切り替え"`（新設）。
8. （Worker 段階、実装仕様で確定）batchVersion 書き込み規則: 通常更新は CAS 節 `prevVersion == resource.data.version`（`firestore.rules:12`）。**初回は update の `__INITIAL__` 節ではなく無条件 `create`（`firestore.rules:6`）で通る**——コードは `"__INITIAL__"` を書かず `prevVersion:""`＋uuidv7（`batch.ts:342-344`）。Worker は §「書き込み組み立て」の通り、doc 有無で `nextBatchVersionWrite` の `set`(create)/`update`(CAS) を出し分ける。tx 分離＋rules で二重に CAS 保証。
9. **【解決済み】認証**: Firebase ID トークンを Bearer 転送で rules が効く（サービスアカウント不要）＝§「認証」で確定・出典付き。運用上の唯一の前提は「時計が uid `XoVR…` と同一 Google アカウントでサインインし ID トークンを取れる」こと（Web と同一アカウント）。**project id はコミットされていない**（runtime config 由来）ので Function に env var `FIRESTORE_PROJECT_ID` を必ず用意する（dev=`rejysten3-dev`）。この設計では新規の外部資格情報・サービスアカウント鍵は増えない。

## スコープ外 / 将来

- **任意の新規テキストの Worker 側書き込み**（自由入力・音声）: `Intl.Segmenter` / `moji` の Workers 実測が前提。今回は切り替えの ngram コピーで回避。
- **クラスの firebase-free 化 / seam 注入**: white-box テストの依存を意図的に解くコストが必要。Worker 実現には不要なため見送り。将来やるなら独立したリファクタとしてテスト更新込みで計画する。
- Web アプリの書き込みを Function 経由にすること: overlay / offline / レイテンシを失うため対象外。

## 組織メモ

Cloudflare Pages Functions は既にこの repo で稼働中（`functions/api/`、`traces` は外部への egress も実装済み）のため、新規の外部サービス導入には当たらない見込み。Firestore REST の呼び先（`firestore.googleapis.com`）はアプリが既に使っている同一 Google Firestore バックエンド（SDK の代わりに REST を叩くだけ）で、**ID トークン pass-through 方式では新しい資格情報・ベンダー・サービスアカウントを一切増やさない**。仮に将来サービスアカウント/OAuth 方式へ切り替える場合は新資格情報の導入になるため、その時は Mercari の External Service Review を要確認（本設計は非該当の見込み）。

## 実装状況

作業計画 #1–#4 を実装・テスト済み。#5 は骨組みのみ（下記）。

- **#1 純粋ヘルパ**: `src/writeContract/{types,inverseOps,batchVersion,historyEntry,ngramDoc}.ts`。`OperationRecordingBatch`（`batch.ts`）と `ngram.ts` がこれらに委譲。既存テスト無改変で green。単体テストは各 `*.test.ts`。`buildHistoryEntry` はドキュメント記載の非ジェネリック署名ではなく `<Op = WriteOp, Sel = Selection>` のジェネリックにした（Web 側 `HistoryOperation`/`HistorySelection` を無キャストで通すため。実行時の出力は同一）。
- **#2 REST トランスポート**: `src/writeContract/rest/{types,errors,value,write,transaction}.ts`。emulator round-trip テスト `rest/roundtrip.test.ts`。
- **#3 ドメイン操作 ＋ 差分ゲート**: `src/writeContract/ops/{shared,start,stop,switch,switchCandidates,http}.ts`。テストは 2 層: `ops/ops.test.ts`（REST 経路の契約 byte を spec どおり固定）＋ `ops/diffGate.test.ts`（Web `runBatch` と REST を突合、stop の inverse `endAt`＝§リスク #3 を含む）。
- **#4 HTTP エンドポイント**: `functions/api/lifelog/{start,stop,switch,switch-candidates}.ts`（薄いラッパ）。`functions/api/lifelog/lifelog.test.ts`（Workers プール、`fetch` スタブ、401/400/404/409/503/200 の HTTP 面）。
- **#5 Wear OS クライアント**: `wear/LifeLogClient.kt` ＋ `wear/README.md`。**このリポジトリに Android/Gradle プロジェクト・ツールチェインが無いためビルド/テスト未実施の骨組み**。実運用には別途 Wear OS アプリ（Gradle + Compose for Wear）と Firebase 設定が要る。

### 共有モジュールの import 規約（実装で確定）

`functions/` の bundle は `@/` エイリアスを解決できない（実測: 相対 import で src を辿るのは成立、`@/` の value import は "Cannot find package" で失敗）。したがって **`src/writeContract/` 配下のファイル同士は相対 import**（`./types` 等）にし、eslint は `src/writeContract/**` に対し `no-relative-import-paths` を off にする override を追加（`eslint.config.js`）。`writeContract/` の外からは従来どおり `@/writeContract/...` で import する。`ops`→ の依存グラフは firebase / `@/` / `Intl` を一切引かない（`uuidv7` のみ外部）ので functions から相対 import で同梱できる。`ngramDoc.ts` は `@/ngram` を引くため Web 専用（switch の ngram は REST コピーで回避）。
