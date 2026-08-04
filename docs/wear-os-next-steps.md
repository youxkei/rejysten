# Wear OS 実装の引き継ぎ / 次にやること

Wear OS から lifeLog を操作する機能の続き。**この doc ＋ 2つの README だけで作業できる**ようにまとめてある:
- [`android/README.md`](../android/README.md) — ビルド環境（Nix devShell）、**Windows エミュレータの初回セットアップ**、build/install コマンド。
- [`android/wear/README.md`](../android/wear/README.md) — 各エンドポイントの **HTTP 契約**（method/path/body/レスポンス）と `LifeLogClient` の使い方。

サーバ側書き込み契約の内部設計を深掘りしたいときだけ
[`external-write-path-refactoring.md`](./external-write-path-refactoring.md)（背景資料・必須ではない）。

## 現状（完了・検証済み）

- **書き込みパス（サーバ側）**: `src/writeContract/` ＋ `functions/api/lifelog/{start,stop,switch,switch-candidates}` は実装・テスト済み（上記設計ドキュメント参照）。時計はこれを叩くだけで、契約ロジックは持たない。
- **Android モノレポ（`android/`）**: Nix devShell（gradle_9 / JDK25 / androidenv SDK）＋ Gradle プロジェクト。`wear`（`LifeLogClient` ＋ Compose の Start/Stop スケルトン）と `mobile`（プレースホルダ）が `gradle :wear:assembleDebug` で green。**WSL2 でビルド → Windows の Wear OS 6 エミュレータへ `installDebug`・起動まで実証済み**。
- **Firebase Android アプリ登録（`com.rejysten.mobile` / rejysten3-dev）**: `firebase` CLI で完了済み。App ID `1:894303897507:android:1268aefb379ace292efc16`、debug SHA-1（`0D:92:27:30:E7:C4:B0:1E:F4:69:B0:C2:A9:4C:55:BD:D7:F2:38:E0`）登録済み、`google-services.json` を `android/mobile/` に配置済み。Google サインインプロバイダは Web アプリ（`src/services/firebase/index.tsx`）が既に使用しているためプロジェクト単位で有効。**Credential Manager に渡す serverClientId は json 内の client_type 3**: `894303897507-t8t90evamjpm434guhp7jl0qo9lbirjd.apps.googleusercontent.com`。

## 確定している決定（再検討不要）

- **モノレポ**。Android/Wear・mobile は本リポジトリの `android/` に置く（別リポジトリにしない）。
- **JDK は 25 で問題ない**（AGP 9.3 は JDK≥17、25 でビルド green を確認）。「21 必須」は誤りだった。
- **Gradle は nixpkgs の `gradle_9`（9.5.1）**。デフォルト `gradle` は 8.x で AGP 9.3 に不足。wrapper も 9.5.1。
- **AGP 9 は Kotlin 組み込み**。`org.jetbrains.kotlin.android` は適用しない（エラーになる）。Compose のみ `org.jetbrains.kotlin.plugin.compose` を適用。
- **SDK レベル**: compileSdk 37（`androidx.core:core-ktx:1.19.0` が要求）/ targetSdk 36（Play 新規要件）/ minSdk 30（Wear OS 3+）。
- **ログインはスマホ側**。時計は Firebase にサインインしない。ペアのスマホがトークンを発行し、Wear Data Layer で時計へ渡す。
- **エミュレータは Windows 側**（Studio 不要、winget で導入）。ビルドは WSL2、実行は Windows、adb は mirrored networking でブリッジ。

## 作業分担（エージェント / 人間）

次の作業は**人間（youxkei）にしかできない**（Cloudflare / Firebase / Google Cloud のコンソール権限や外部登録が要る）。エージェントはコードを書き、これらは youxkei に依頼すること:

- Cloudflare Pages ダッシュボードでの環境変数 `FIRESTORE_PROJECT_ID` 設定と、デプロイ（Git 連携。下記）。
- Firebase コンソールでの Android アプリ登録・`google-services.json` 取得・Google Sign-In の OAuth クライアント / SHA-1 登録。
- External Service Review の要否判断。
- スマホ実機での最終確認（任意）。

エージェントが自走できるのは: Gradle/Kotlin 実装（mobile の認証コード・Data Layer・`LifeLogClient` の 401 リトライ・時計 UI）、`android/` でのビルド／エミュレータ検証、依存の有効化。**console 作業でブロックされたら、勝手に代替せず youxkei に依頼する。**

## 次にやること（依存順）

### 1. エンドポイントを Cloudflare Pages にデプロイ ＋ env 設定 【人間】
- **リポジトリに wrangler 設定も CI も無い**（確認済み）。デプロイは Cloudflare Pages プロジェクトの **Git 連携**（接続ブランチへの push で自動デプロイ）で、repo 内からは辿れない。`functions/api/lifelog/*` は既にコミット済みなので、接続ブランチに入れば自動で乗る。
- **Cloudflare Pages ダッシュボードで環境変数 `FIRESTORE_PROJECT_ID`（dev = `rejysten3-dev`）を設定**。これが唯一の新規設定。
- 認証は **Firebase ID トークンの pass-through**: Function は受け取った `Authorization: Bearer <idToken>` をそのまま Firestore REST に転送するだけ。**サービスアカウント鍵は不要**で、`firestore.rules` の uid ゲートがそのまま効く。
- これで時計が指す**本番 baseUrl** が確定する（現在 `android/wear/src/main/java/com/rejysten/wear/MainActivity.kt` の `baseUrl` は仮値 `https://rejysten.example`）。

### 2. スマホ側ログイン（`mobile` モジュール）
Firebase Auth で Web と同一 Google アカウント（uid `XoVR64j2pfgnlX8L05kL5V96y8n1`）にサインインし、ID トークンを取得する。

**【実装済み・エミュレータで経路確認済み】**: `GoogleSignInController.kt`（Credential Manager → `GoogleAuthProvider.getCredential` → `signInWithCredential`、`freshIdToken(forceRefresh)` で ~1h トークンを再取得）＋ `MainActivity.kt`（サインイン／トークン確認／サインアウトの最小 UI）。依存とプラグインは有効化済み。`serverClientId` は `getString(R.string.default_web_client_id)`（google-services プラグイン生成、値は client_type 3 と一致確認済み）。

`phone` AVD で**サインイン成功パスまで検証済み**（Google アカウント `youxkei@gmail.com` を AVD に追加した上で実施）:
- Credential Manager のアカウント選択 → Continue → `signed in: youxkei@gmail.com uid=XoVR64j2pfgnlX8L05kL5V96y8n1` ＝ **`firestore.rules` がゲートする uid と一致**。
- 「Show ID token」で `token len=1145, head=eyJhbGciOiJS…`（JWT）を取得。
- アプリを force-stop → 再起動してもサインイン状態が保持される（FirebaseAuth の永続化が効いている）。
- アカウント未追加時は `No credentials available` を graceful に表示（クラッシュ無し）＝ 失敗パスも確認済み。

**残る未検証**: この ID トークンで Firestore が実際に許可を返すか（＝エンドポイント経由の書き込み）。step 1 のデプロイ後、step 3 でアプリ経由で確認する。トークン実体はログに残さない方針（UI も長さと先頭のみ表示）。

**判明した落とし穴（修正済み）**: targetSdk 36 では edge-to-edge が強制されるため、インセット未処理のルートビューはステータスバー／ActionBar の裏に潜り込む（実際に上2要素が隠れた）。`ViewCompat.setOnApplyWindowInsetsListener` でシステムバー分をパディングし、テーマを `Theme.DeviceDefault.NoActionBar` にして解消。
- **前提【完了】**: Firebase 側の登録は `firebase` CLI（youxkei@gmail.com は rejysten3-dev/prod にアクセス可）で完了済み。Android アプリ `com.rejysten.mobile` 登録・debug SHA-1 登録・`google-services.json` を `android/mobile/` に配置済み。OAuth クライアント（Android=client_type 1／Web=client_type 3）は SHA-1 登録時に自動生成され json に含まれる。Google プロバイダは Web アプリ使用中のため既に有効。残るコンソール作業は無し。**注意**: `android/.gitignore` は `google-services.json` を除外していないので、コミット可否は判断すること（Firebase Android の api_key は秘密情報ではなく、セキュリティは SHA-1＋firestore.rules で担保）。
- **現行の推奨 API は Credential Manager**（旧 `GoogleSignIn` は非推奨）。フロー: Credential Manager が Google ID トークンを返す → `GoogleAuthProvider.getCredential(idToken, null)` → `FirebaseAuth.signInWithCredential(...)`。
- **依存**（`gradle/libs.versions.toml` に**有効化済み**、下記バージョンは Google Maven に実在確認済み）:
  - `com.google.firebase:firebase-bom:34.16.0` → `firebase-auth`（BOM 管理、バージョン指定なし）
  - `androidx.credentials:credentials:1.6.0` ＋ `androidx.credentials:credentials-play-services-auth:1.6.0`
  - `com.google.android.libraries.identity.googleid:googleid:1.2.0`
  - Gradle プラグイン `com.google.gms.google-services:4.5.0`（`google-services.json` が無いとビルドが落ちる点に注意。現在は配置済み）
  - 補助: `androidx.activity:activity-ktx`・`kotlinx-coroutines-play-services`（Task→coroutine の `.await()`）
- **組織メモ**: Credential Manager / googleid が Mercari で未使用なら、利用前に社内 External Service Review の要否を確認（Firebase 自体は Web アプリで使用中）。

### 3. スマホ⇄時計のトークン受け渡し（Wear Data Layer）【実装済み・両エミュレータで検証済み】

- スマホ `TokenSync` が ID トークンを `DataClient` の `/id-token` に publish（`MessageClient` ではなく `DataClient` なのは保持されるため。時計が寝ていても再接続時に最新を受け取れる）。**同一 payload の put は破棄される**ので `refreshedAt` を必ず変える。
- 時計 `TokenListenerService`（`DATA_CHANGED`）が受け取り `TokenStore` が SharedPreferences に永続化。
- 時計 `TokenStore.requestFresh()` が `MessageClient` で `/request-id-token` を全ノードへ送り、スマホ `TokenRequestService` が `forceRefresh=true` で新トークンを publish。時計は変化をブロッキング待ち（`ReentrantLock`＋`Condition`、既定8秒）。
- `LifeLogClient` は `idTokenProvider: (forceRefresh: Boolean) -> String?` になり、**401 → 再取得 → 1回だけリトライ**。同じトークンが返った場合・取得できない場合は無駄打ちせず 401 を返す。トークン未配信時は `Outcome.Unauthenticated`（リクエストを投げない）。

**⚠️ 重大な制約（実験で確定）**: **Wear Data Layer は applicationId が一致するアプリ間しか繋がない**（署名も一致が必要）。`com.rejysten.mobile` と `com.rejysten.wear` では DataItem が一切届かず、`onDataChanged` が発火しない（GMS の WearableService にバインドはされるのでログにエラーも出ない＝原因が見えにくい）。**そのため `wear` の `applicationId` を `com.rejysten.mobile` に変更した**（Kotlin の namespace は `com.rejysten.wear` のまま）。両方を中立な id（例 `com.rejysten`）に改名する案は Firebase のアプリ再登録が要るため未実施。

**検証済み**（phone AVD ＋ wear6 をペアリングした状態）:
- スマホで「Push token to watch」→ 時計の「Token」で `len=1145` を確認。
- 時計の「Refresh」→ 指紋が `fp=362366216` → `fp=648714234` に変化。＝ 要求→スマホが新規発行→配信の往復が動作（DataItem 再配信では指紋は変わらない）。
- `LifeLogClient` の 401 リトライとパースは **JVM ユニットテスト13件**でカバー（`gradle :wear:testDebugUnitTest`）。

**未検証**: 実エンドポイントに対する 401 の実挙動（step 1 のデプロイ待ち。`baseUrl` が仮値のため Start/Stop はまだ通らない）。

### 4. 時計 UI の作り込み（`wear`）
- `baseUrl` を本番値に。
- **switch 候補ピッカー**を追加（`GET /api/lifelog/switch-candidates` の結果から `sourceId` を選ぶ）。現状は Start/Stop のみ。

### 5. E2E テスト環境
- **スマホ AVD `phone` を作成済み**（Windows 側 / pixel_7・API 36・`google_apis_playstore`・x86_64、`emulator -avd phone` で起動）。Wear AVD は `wear6`。
  - `PlayStore.enabled=no` のまま（Play Services はイメージ同梱なのでサインインは可能）。Google アカウントは `youxkei@gmail.com` を追加済みで、Firebase の uid は Web と一致する。
  - **`hw.keyboard=yes` に変更済み**。`avdmanager` 作成の AVD は既定 `no` で、その状態ではホストの物理キーボード入力が端末に届かない（ソフトキーボードのマウス操作のみ）。変更は再起動後に有効で、`dumpsys input` に `Device 0: qwerty2 / KeyboardType: 2` が出れば効いている。
  - アカウント追加画面へは `adb shell am start -a android.settings.ADD_ACCOUNT_SETTINGS --esa account_types com.google` で直接飛べる。エミュレータには SIM が無いので電話番号照合の画面は **SKIP** で回避する（NEXT だと失敗する）。
  - もし将来 Play Store アプリが要るなら `phone.avd/config.ini` の `PlayStore.enabled=yes`（起動非互換なら戻す）。
- **ペアリング手順（実証済み・Studio 不要）**:
  1. スマホ AVD の Play Store で「Wear OS by Google Smartwatch」を入れる（`adb shell am start -a android.intent.action.VIEW -d "market://details?id=com.google.android.wearable.app"` で直接開ける）。`PlayStore.enabled=no` でも Play Store は使える。
  2. **`adb -s <phone> forward tcp:5601 tcp:5601`** ← 向きに注意。listen しているのは**スマホ側のコンパニオンアプリ**で、時計エミュレータがホストの 5601 へ繋ぎに来る。時計側に `forward` を張るとホストの 5601 を奪って永久に "Waiting for emulator to connect…" になる。
  3. コンパニオンアプリの **⋮（More options）** からエミュレータ用ペアリングを開始。Bluetooth 検索画面（"Choose a device to be managed by…"）はキャンセルして良い。成功するとスマホに `wear6` / "Connected to emulator" が出る。
- 時計アプリ単体の動作確認だけなら Wear AVD で足りる。

## 環境クイックリファレンス

初回セットアップ（Nix devShell の起動、Windows エミュレータの winget 導入〜AVD 作成）は
[`android/README.md`](../android/README.md) に手順がある。以降の日常操作:

```sh
# ビルド／インストール（WSL2, android/ 内で direnv 有効化後）
gradle :wear:assembleDebug
export ADB_SERVER_SOCKET=tcp:localhost:5037   # Windows の adb サーバへ（mirrored networking）
gradle :wear:installDebug
# 時計アプリは applicationId がスマホ側と共通（Data Layer の要件）なので component 名は下記
adb -e shell am start -n com.rejysten.mobile/com.rejysten.wear.MainActivity

# エミュレータ起動（Windows 側。ANDROID_SDK_ROOT を設定して）: emulator -avd wear6
#   AVD: wear6 (Wear OS 6, API 36, x86_64) / phone (pixel_7, API 36, google_apis_playstore, x86_64)
#   スマホ側ログイン確認: emulator -avd phone → gradle :mobile:installDebug → アプリで Sign in with Google
```

## テスト方針（未整備・要検討）

Android 側にはまだテスト基盤が無い。プロジェクト規約は「常にテストを追加」なので、実装時に方針を立てること:
- `LifeLogClient` のレスポンスパース等は **JVM 単体テスト**（純ロジック）にしやすい。
- UI / Data Layer は instrumented テスト（emulator 経由）が要るが、CI が無いため当面は emulator 手動確認が現実的。
- pre-commit フックは **TS の lint＋全テストを無条件で回す**（Android のみのコミットでも走る）。Android 自体は検証しないので、Android のビルド確認は手動（`gradle :wear:assembleDebug`）で行う。フックは重く flaky なこともある（規約どおりリトライ）。

## 発見済みの落とし穴（対処済み・要記憶）

- **Kotlin のブロックコメントはネストする**。KDoc 内に `/*`（例: `functions/api/lifelog/*`）を書くとファイル全体がコメント化される。`LifeLogClient.kt` で修正済み。
- **エミュレータ起動には SDK 内の `platform-tools` と `ANDROID_SDK_ROOT` が必須**。winget の platform-tools は SDK ツリー外なので、`android sdk install platform-tools` で SDK 内にも入れる。起動は `.bat` 等で `ANDROID_SDK_ROOT` を明示。
- **`avdmanager` は JAVA_HOME を尊重せず古い java を拾うことがある**。JDK17+ を PATH 先頭に置くか `SKIP_JDK_VERSION_CHECK=1`。
- `cmdline-tools 17.0` は「SDK XML version 4」警告を出すが AVD 作成は成功する（無害）。
- WSL から `cmd.exe` は UNC カレントディレクトリで警告を出す。絶対パスの `.bat` を実行すれば問題ない。
