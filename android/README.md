# Android / Wear OS (Nix devShell + Gradle build)

Build-only Android toolchain and app modules for the Wear OS watch app (`wear/`)
and its companion phone module (`mobile/`). The **emulator runs on Windows**
(native HW acceleration); this shell only builds APKs in WSL2 and pushes them
over adb to the Windows emulator.

Verified 2026-07-23: `:wear:assembleDebug` + `:mobile:assembleDebug` build green.

## Bring it up

```sh
cd android
direnv allow      # or, without direnv: nix develop
```

The first entry builds the Android SDK via Nix (build-tools 36.0.0, platforms 36
and 37) — a large one-time fetch. `nix-direnv` is recommended so the shell is
cached between `cd`s.

Then, inside the shell:

```sh
gradle :wear:assembleDebug      # nix `gradle` (gradle_9, 9.5.1) — no download
gradle :mobile:assembleDebug
# or ./gradlew <task> — the committed wrapper (also 9.5.1) for Android Studio / CI
```

## Pinned versions (verified 2026-07-23)

| Component | Version | Note |
|---|---|---|
| AGP | 9.3.0 | AGP 9 has **built-in Kotlin** — do NOT apply `org.jetbrains.kotlin.android` |
| Gradle | 9.5.1 | nix `gradle_9`; the wrapper pins the same version |
| JDK | 25 (`pkgs.jdk25`) | AGP needs only ≥17; 25 matches the ambient toolchain and gradle_9's default JVM (verified) |
| Kotlin | 2.3.20 | via the Compose compiler plugin; AGP supplies the base Kotlin |
| compileSdk | 37 | `androidx.core:core-ktx:1.19.0` requires compiling against API 37 |
| targetSdk | 36 | Google Play's new-app requirement |
| minSdk | 30 | Wear OS 3+ |
| build-tools | 36.0.0 | AGP 9.3 minimum |
| wear-compose (material3) | 1.6.2 | |

## Notes / gotchas

- **aapt2 is fine here.** The classic NixOS aapt2 failure does not apply — this
  host is Ubuntu (FHS) under WSL2 and the Nix build-tools `aapt2` runs directly
  (verified). No `android.aapt2FromMavenOverride` needed.
- `ANDROID_USER_HOME=$HOME/.android` (set by the shell) keeps mutable SDK/Gradle
  metadata off the read-only `/nix/store`.
- `JAVA_HOME` is set to the devShell JDK so `gradle` and `./gradlew` agree on it.

## Emulator (Windows side, no Android Studio)

The emulator runs natively on Windows (WHPX acceleration is already available via
WSL2's Hyper-V). `.wslconfig` sets `networkingMode=mirrored`, so Windows and WSL2
share `localhost` and adb bridges cleanly. Set it up with winget + Google's
`android` CLI — no full IDE:

```powershell
# On Windows (PowerShell), one-time. android CLI installs into %LOCALAPPDATA%\Android\Sdk
winget install Google.AndroidCLI Google.PlatformTools
android sdk install platform-tools emulator system-images/android-36/android-wear-signed/x86_64
# put these on PATH (or use full paths): %LOCALAPPDATA%\Android\Sdk\platform-tools,
#   %LOCALAPPDATA%\Android\Sdk\emulator, %LOCALAPPDATA%\Android\Sdk\cmdline-tools\<ver>\bin
# create the Wear AVD (avdmanager needs a JDK 17+ on PATH):
avdmanager create avd -n wear6 -k "system-images;android-36;android-wear-signed;x86_64"
# and a phone AVD for the companion app's Google sign-in (needs a Play Services image):
android sdk install system-images/android-36/google_apis_playstore/x86_64
avdmanager create avd -n phone -k "system-images;android-36;google_apis_playstore;x86_64" -d pixel_7
```

Launch it (`ANDROID_SDK_ROOT` **must** be set or the emulator can't find the AVD):

```powershell
set ANDROID_SDK_ROOT=%LOCALAPPDATA%\Android\Sdk
emulator -avd wear6
```

Then from the WSL2 devShell, build and install:

```sh
export ADB_SERVER_SOCKET=tcp:localhost:5037   # WSL2 adb -> Windows adb server
adb devices                                   # emulator-5554 shows up
gradle :wear:installDebug
adb -e shell am start -n com.rejysten.wear/.MainActivity   # launch the app
```

Notes:
- The `android` CLI has no Wear device profile, so create the AVD with `avdmanager`.
- `avdmanager` writes `hw.keyboard=no`, which drops the host keyboard: typing only
  works through the on-screen keyboard until you set `hw.keyboard=yes` in
  `%USERPROFILE%\.android\avd\<name>.avd\config.ini` and restart the emulator. It
  also leaves `avd.id`/`avd.name` as `<build>` and a cramped 800M data partition.
- The phone AVD needs a Google account added (Settings > Passwords and accounts, or
  `adb shell am start -a android.settings.ADD_ACCOUNT_SETTINGS --esa account_types
  com.google`) before the companion app can sign in. Skip the phone-number lookup —
  the emulator has no SIM, so that path fails.
- The emulator needs `platform-tools` **inside** the SDK (the winget PlatformTools
  package is separate); `android sdk install platform-tools` covers it.
- If adb reports a client/server version mismatch, align the platform-tools versions
  on both sides (or fall back to `adb connect localhost:5555`).

## What is and isn't done

- **Done:** Nix toolchain; buildable `wear` (Compose for Wear skeleton: Start/Stop
  buttons driving `LifeLogClient`); `mobile` signs into Firebase with Google through
  Credential Manager. Both verified end to end — built in WSL2 and installed on
  Windows emulators via the adb bridge; the phone app reached a signed-in state whose
  uid matches the one `firestore.rules` gates on, and returned an ID token.
- **Not done yet:** delivering that ID token to the watch over the Wear Data Layer
  (and the watch's 401-refresh-retry); a real switch-candidate picker UI; deploying
  the endpoints to Cloudflare Pages, which is what fixes the watch's `baseUrl`. See
  `wear/README.md`.
