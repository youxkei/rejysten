{
  description = "rejysten Android / Wear OS build toolchain (build-only; emulator runs on Windows)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-darwin" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems f;
    in
    {
      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs {
            inherit system;
            config = {
              allowUnfree = true;
              android_sdk.accept_license = true;
            };
          };

          # AGP 9.3 only requires JDK >= 17 and builds fine on JDK 25 (verified).
          # Use 25 to match the ambient toolchain and gradle_9's default JVM; pinned
          # via JAVA_HOME below so `gradle` and `./gradlew` agree on it.
          jdk = pkgs.jdk25;

          # BUILD-only SDK: emulator / system-images / NDK are left opt-out (the
          # androidenv defaults), because the emulator runs on the Windows side.
          # Every requested component is pre-provisioned so Gradle never tries to
          # download into the read-only /nix/store.
          androidComposition = pkgs.androidenv.composeAndroidPackages {
            cmdLineToolsVersion = "latest";
            platformToolsVersion = "latest";
            buildToolsVersions = [ "36.0.0" ];
            # compileSdk 37: androidx.core 1.19.0 requires compiling against API 37.
            # (targetSdk stays 36 — Google Play's new-app requirement.)
            platformVersions = [ "36" "37" ];
            includeEmulator = false;
            includeSystemImages = false;
            includeNDK = false;
            includeCmake = false;
          };

          androidSdk = "${androidComposition.androidsdk}/libexec/android-sdk";
        in
        {
          default = pkgs.mkShell {
            # gradle_9 (9.5.1) satisfies AGP 9.3's Gradle >= 9.5 requirement; the
            # default `gradle` attr is still 8.x. The wrapper pins the same version.
            packages = [ jdk pkgs.gradle_9 androidComposition.androidsdk ];

            ANDROID_HOME = androidSdk;
            ANDROID_SDK_ROOT = androidSdk;
            # Gradle honours JAVA_HOME; this keeps the build on JDK 21, not JDK 25.
            JAVA_HOME = jdk.home;

            shellHook = ''
              # Mutable SDK/Gradle metadata must live outside the read-only store.
              export ANDROID_USER_HOME="$HOME/.android"
            '';
          };
        });
    };
}
