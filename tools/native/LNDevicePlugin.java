package com.fezzy.limitlessnotepad;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PluginMethod;

/**
 * Limitless Notepad device helper (plugin name "LNDevice").
 * Covers the permission screens the stock Capacitor plugins can't open:
 * battery optimiser, all files access, audio (music) and photos access, plus app settings.
 * status() -> { sdk, battery, allFiles, audio, images, mic }  audio, images and mic are state strings:
 * "granted", "limited" (images only: the user picked some photos), "denied", "prompt" or "prompt-with-rationale".
 */
@CapacitorPlugin(
    name = "LNDevice",
    permissions = {
        @Permission(alias = "mic", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "audio", strings = { Manifest.permission.READ_MEDIA_AUDIO }),
        @Permission(alias = "audioLegacy", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
        @Permission(alias = "images", strings = { "android.permission.READ_MEDIA_IMAGES" }),
        @Permission(alias = "imagesPartial", strings = { "android.permission.READ_MEDIA_VISUAL_USER_SELECTED" }),
        @Permission(alias = "imagesLegacy", strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
    }
)
public class LNDevicePlugin extends Plugin {

    private static final int API_AUDIO_PERMISSION = 33; // READ_MEDIA_AUDIO exists from Android 13
    private static final int API_ALL_FILES = 30;        // all files access exists from Android 11
    private static final int API_PARTIAL_PHOTOS = 34;   // "select photos" access exists from Android 14
    private static final String P_IMAGES = "android.permission.READ_MEDIA_IMAGES";
    private static final String P_PARTIAL = "android.permission.READ_MEDIA_VISUAL_USER_SELECTED";

    private String audioAlias() {
        return Build.VERSION.SDK_INT >= API_AUDIO_PERMISSION ? "audio" : "audioLegacy";
    }

    private String audioState() {
        PermissionState s = getPermissionState(audioAlias());
        return s == null ? "prompt" : s.toString();
    }

    private String micState() {
        if (has(Manifest.permission.RECORD_AUDIO)) return "granted";
        PermissionState s = getPermissionState("mic");
        return s == null ? "prompt" : s.toString();
    }

    private boolean has(String permission) {
        return getContext().checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private String imagesAlias() {
        return Build.VERSION.SDK_INT >= API_AUDIO_PERMISSION ? "images" : "imagesLegacy";
    }

    // granted = all photos, limited = only the photos the user picked (Android 14+)
    private String imagesState() {
        if (Build.VERSION.SDK_INT >= API_AUDIO_PERMISSION) {
            if (has(P_IMAGES)) return "granted";
            if (Build.VERSION.SDK_INT >= API_PARTIAL_PHOTOS && has(P_PARTIAL)) return "limited";
        } else if (has(Manifest.permission.READ_EXTERNAL_STORAGE)) {
            return "granted";
        }
        PermissionState s = getPermissionState(imagesAlias());
        return s == null ? "prompt" : s.toString();
    }

    private boolean batteryUnrestricted() {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    private boolean allFilesGranted() {
        return Build.VERSION.SDK_INT >= API_ALL_FILES && Environment.isExternalStorageManager();
    }

    private Uri packageUri() {
        return Uri.parse("package:" + getContext().getPackageName());
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("sdk", Build.VERSION.SDK_INT);
        r.put("battery", batteryUnrestricted());
        r.put("allFiles", allFilesGranted());
        r.put("audio", audioState());
        r.put("images", imagesState());
        r.put("mic", micState());
        call.resolve(r);
    }

    @PluginMethod
    public void requestMic(PluginCall call) {
        if (has(Manifest.permission.RECORD_AUDIO)) {
            JSObject r = new JSObject();
            r.put("mic", "granted");
            call.resolve(r);
            return;
        }
        requestPermissionForAlias("mic", call, "micCallback");
    }

    @PermissionCallback
    private void micCallback(PluginCall call) {
        JSObject r = new JSObject();
        r.put("mic", micState());
        call.resolve(r);
    }

    @PluginMethod
    public void requestBattery(PluginCall call) {
        if (batteryUnrestricted()) { call.resolve(); return; }
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, packageUri());
            getActivity().startActivity(i);
            call.resolve();
        } catch (ActivityNotFoundException | SecurityException e) {
            try {
                getActivity().startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                call.resolve();
            } catch (Exception e2) {
                call.reject("Could not open the battery screen. Open Android Settings, Battery, then this app.");
            }
        }
    }

    @PluginMethod
    public void requestAllFiles(PluginCall call) {
        if (Build.VERSION.SDK_INT < API_ALL_FILES || allFilesGranted()) { call.resolve(); return; }
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, packageUri());
            getActivity().startActivity(i);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            try {
                getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION));
                call.resolve();
            } catch (Exception e2) {
                call.reject("Could not open the All files access screen. Open Android Settings, Apps, this app, Permissions.");
            }
        }
    }

    @PluginMethod
    public void requestAudio(PluginCall call) {
        if (getPermissionState(audioAlias()) == PermissionState.GRANTED) {
            JSObject r = new JSObject();
            r.put("audio", "granted");
            call.resolve(r);
            return;
        }
        requestPermissionForAlias(audioAlias(), call, "audioCallback");
    }

    @PermissionCallback
    private void audioCallback(PluginCall call) {
        JSObject r = new JSObject();
        r.put("audio", audioState());
        call.resolve(r);
    }

    @PluginMethod
    public void requestImages(PluginCall call) {
        String now = imagesState();
        if ("granted".equals(now)) {
            JSObject r = new JSObject();
            r.put("images", now);
            call.resolve(r);
            return;
        }
        if (Build.VERSION.SDK_INT >= API_PARTIAL_PHOTOS) {
            requestPermissionForAliases(new String[] { "images", "imagesPartial" }, call, "imagesCallback");
        } else {
            requestPermissionForAlias(imagesAlias(), call, "imagesCallback");
        }
    }

    @PermissionCallback
    private void imagesCallback(PluginCall call) {
        JSObject r = new JSObject();
        r.put("images", imagesState());
        call.resolve(r);
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            getActivity().startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri()));
            call.resolve();
        } catch (Exception e) {
            call.reject("Open Android Settings, Apps, Limitless Notepad, Permissions");
        }
    }
}
