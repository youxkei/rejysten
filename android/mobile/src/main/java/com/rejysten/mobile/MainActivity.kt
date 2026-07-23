package com.rejysten.mobile

import android.app.Activity
import android.os.Bundle
import android.widget.TextView

/**
 * Companion phone-app placeholder. This is where Firebase Auth (Google Sign-In /
 * Credential Manager) will live, minting the Firebase ID token and delivering it
 * to the watch over the Wear Data Layer. For now it is a bare Activity so the
 * module compiles as part of the build.
 */
class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(TextView(this).apply { text = "rejysten companion (login TODO)" })
    }
}
