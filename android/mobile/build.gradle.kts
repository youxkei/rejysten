plugins {
    // AGP 9 has built-in Kotlin support; no org.jetbrains.kotlin.android needed.
    alias(libs.plugins.android.application)
    // Reads google-services.json and generates R.string.default_web_client_id
    // (the client_type 3 / Web OAuth client) used as the Credential Manager serverClientId.
    alias(libs.plugins.google.services)
}

android {
    namespace = "com.rejysten.mobile"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.rejysten.mobile"
        minSdk = 30
        targetSdk = 36
        versionCode = 1
        versionName = "0.1"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
        }
    }
}

dependencies {
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services.auth)
    implementation(libs.googleid)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.play.services)
    implementation(libs.play.services.wearable)
}
