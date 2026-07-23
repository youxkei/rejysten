plugins {
    // AGP 9 has built-in Kotlin support; no org.jetbrains.kotlin.android needed.
    alias(libs.plugins.android.application)
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
}
