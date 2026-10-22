package com.fezzy.limitlessnotepad;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // local plugins must be registered before super.onCreate
        registerPlugin(LNDevicePlugin.class);
        registerPlugin(LNSecurePlugin.class);
        registerPlugin(LNFolderPlugin.class);
        super.onCreate(savedInstanceState);
        installBack();
    }

    /** V0.7.21: the phone's Back button. The page decides first (window.LNBack closes a sheet, a settings page, the AI chat,
     *  a full-screen PDF or the left panel and answers 1). If nothing was open it answers 0 and the app goes to the background
     *  instead of finishing, so the page is never destroyed and nothing reloads when you come back. Added after super.onCreate
     *  so it is asked before Capacitor's own handler. */
    private void installBack() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                try {
                    if (getBridge() == null || getBridge().getWebView() == null) { moveTaskToBack(true); return; }
                    getBridge().getWebView().evaluateJavascript(
                        "(function(){try{return window.LNBack?window.LNBack():0}catch(e){return 0}})()",
                        value -> {
                            if (value != null && value.contains("1")) return;
                            moveTaskToBack(true);
                        });
                } catch (Exception e) {
                    moveTaskToBack(true);
                }
            }
        });
    }

    /** V0.7.20: leaving the app must not stop the page. Sync timers, reminders and autosave keep running in the background. */
    @Override
    public void onPause() {
        super.onPause();
        keepPageAlive();
    }

    @Override
    public void onStop() {
        super.onStop();
        keepPageAlive();
    }

    private void keepPageAlive() {
        try {
            if (getBridge() == null) return;
            WebView w = getBridge().getWebView();
            if (w != null) w.resumeTimers();
        } catch (Exception ignored) {
            // best effort: the page still restores its state if Android ends it anyway
        }
    }
}
