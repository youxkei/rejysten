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

### 3. スマホ⇄時計のトークン受け渡し（Wear Data Layer）
- スマホが ID トークンを `MessageClient`/`DataClient`（`com.google.android.gms:play-services-wearable:20.0.1`、catalog にコメントで用意済み）で時計へ push。
- **トークン寿命は約1時間**・時計操作は散発的なので、スマホが定期/起床時に再 push、または時計が必要時に pull する仕組みが要る。
- 時計側 `LifeLogClient`:
  - `idTokenProvider` を「スマホ由来のキャッシュ済みトークンを返す」実装に接続（現在 `TODO()`）。
  - **401 → トークン再取得 → 1回リトライ**を追加（現状は `Rejected(401)` を返すだけ）。エンドポイントは期限切れ 401 を伝播する設計。

### 4. 時計 UI の作り込み（`wear`）
- `baseUrl` を本番値に。
- **switch 候補ピッカー**を追加（`GET /api/lifelog/switch-candidates` の結果から `sourceId` を選ぶ）。現状は Start/Stop のみ。

### 5. E2E テスト環境
- **スマホ AVD `phone` を作成済み**（Windows 側 / pixel_7・API 36・`google_apis_playstore`・x86_64、`emulator -avd phone` で起動）。Wear AVD は `wear6`。
  - `PlayStore.enabled=no` のまま（Play Services はイメージ同梱なのでサインインは可能）。Google アカウントは `youxkei@gmail.com` を追加済みで、Firebase の uid は Web と一致する。
  - **`hw.keyboard=yes` に変更済み**。`avdmanager` 作成の AVD は既定 `no` で、その状態ではホストの物理キーボード入力が端末に届かない（ソフトキーボードのマウス操作のみ）。変更は再起動後に有効で、`dumpsys input` に `Device 0: qwerty2 / KeyboardType: 2` が出れば効いている。
  - アカウント追加画面へは `adb shell am start -a android.settings.ADD_ACCOUNT_SETTINGS --esa account_types com.google` で直接飛べる。エミュレータには SIM が無いので電話番号照合の画面は **SKIP** で回避する（NEXT だと失敗する）。
  - もし将来 Play Store アプリが要るなら `phone.avd/config.ini` の `PlayStore.enabled=yes`（起動非互換なら戻す）。
- 完全な E2E（スマホログイン→時計操作）は、スマホ・Wear 両 AVD ＋ Studio 無しの手動ペアリング（コンパニオンアプリ＋`adb forward tcp:5601 tcp:5601`）。
- 時計アプリ単体の動作確認だけなら Wear AVD で足りる。

## 環境クイックリファレンス

初回セットアップ（Nix devShell の起動、Windows エミュレータの winget 導入〜AVD 作成）は
[`android/README.md`](../android/README.md) に手順がある。以降の日常操作:

```sh
# ビルド／インストール（WSL2, android/ 内で direnv 有効化後）
gradle :wear:assembleDebug
export ADB_SERVER_SOCKET=tcp:localhost:5037   # Windows の adb サーバへ（mirrored networking）
gradle :wear:installDebug
adb -e shell am start -n com.rejysten.wear/.MainActivity   # 時計上でアプリ起動

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
