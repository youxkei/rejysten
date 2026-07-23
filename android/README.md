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

## Emulator (Windows side)

`.wslconfig` already sets `networkingMode=mirrored`, so Windows and WSL2 share
`localhost`. Install Android Studio on Windows, create a Wear OS AVD (and a phone
AVD if you want to exercise the phone-side login end to end — pair them with
Studio's Wear OS pairing assistant), then from this shell:

```sh
export ADB_SERVER_SOCKET=tcp:localhost:5037   # talk to Windows' adb server
adb devices                                   # the emulator shows up
gradle :wear:installDebug
```

If adb reports a client/server version mismatch, align the platform-tools version
on both sides (or fall back to `adb connect localhost:5555`).

## What is and isn't done

- **Done:** Nix toolchain; buildable `wear` (Compose for Wear skeleton: Start/Stop
  buttons driving `LifeLogClient`) and `mobile` (placeholder Activity) modules;
  verified end to end — built in WSL2 and installed/launched on a Wear OS 6 emulator
  on Windows via the adb bridge.
- **Not done yet:** the phone-side Firebase Auth + delivering the ID token to the
  watch over the Wear Data Layer; a real switch-candidate picker UI; deploying the
  endpoints to Cloudflare Pages. See `wear/README.md`.
