plugins {
    // AGP 9 has built-in Kotlin support; org.jetbrains.kotlin.android must NOT be
    // applied. The Compose compiler is still a separate plugin.
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.rejysten.wear"
    compileSdk = 37

    defaultConfig {
        // The Wear Data Layer only connects apps that share an applicationId (and
        // signing key), so the watch APK must carry the phone's id even though its
        // Kotlin package / namespace stays com.rejysten.wear.
        applicationId = "com.rejysten.mobile"
        minSdk = 30
        targetSdk = 36
        versionCode = 1
        versionName = "0.1"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        // Endpoint host per build type, so a debug watch can never write to the live
        // data: release points at the production Pages project, debug at the separate
        // dev one (whose FIRESTORE_PROJECT_ID is rejysten3-dev). Override ad hoc with
        // -PrejystenBaseUrl=https://… (e.g. a preview deployment or a local wrangler).
        getByName("debug") {
            val devBaseUrl = providers.gradleProperty("rejystenBaseUrl")
                .getOrElse("https://rejysten-dev.pages.dev")
            buildConfigField("String", "BASE_URL", "\"$devBaseUrl\"")
            // Named rather than derived from the host, which does not fit across a round
            // screen and gets its ends clipped when it is drawn full width.
            buildConfigField("String", "ENVIRONMENT", "\"dev\"")
        }
        getByName("release") {
            isMinifyEnabled = false
            buildConfigField("String", "BASE_URL", "\"https://rejysten.youxkei.dev\"")
            buildConfigField("String", "ENVIRONMENT", "\"prod\"")
        }
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.wear.compose.material3)
    implementation(libs.androidx.wear.compose.foundation)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.core.ktx)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.play.services.wearable)
    implementation(libs.androidx.wear.tiles)
    implementation(libs.androidx.wear.protolayout)
    implementation(libs.androidx.wear.protolayout.material3)
    implementation(libs.androidx.wear.protolayout.expression)
    implementation(libs.androidx.concurrent.futures)
    debugImplementation(libs.androidx.compose.ui.tooling)
    testImplementation(libs.junit)
    testImplementation(libs.org.json)
}
