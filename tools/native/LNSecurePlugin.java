package com.fezzy.limitlessnotepad;

import android.app.Activity;
import android.content.Context;
import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.os.Build;
import android.os.CancellationSignal;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.security.KeyStore;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Limitless Notepad fingerprint helper (plugin name "LNSecure").
 * The notes key is sealed with an Android Keystore AES key that needs a fingerprint for
 * every use (BiometricPrompt + CryptoObject), so the key can't be released without one.
 * Uses the platform BiometricPrompt (Android 10+), so no extra Gradle dependency.
 *   status()          -> { available, enrolled, sdk }
 *   enroll({data})    -> seals base64 data after a fingerprint check
 *   unlock()          -> { data } after a fingerprint check; rejects code "invalidated" if fingerprints changed
 *   clear()           -> removes the Keystore key and the sealed blob
 *   setSecure({on})   -> blocks screenshots and the recents preview (FLAG_SECURE)
 */
@CapacitorPlugin(name = "LNSecure")
public class LNSecurePlugin extends Plugin {

    private static final String ALIAS = "ln_bio_key_v1";
    private static final String PREFS = "ln_secure";
    private static final String K_BLOB = "blob";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private boolean available() {
        if (Build.VERSION.SDK_INT < 29) return false;
        try {
            BiometricManager bm = (BiometricManager) getContext().getSystemService(Context.BIOMETRIC_SERVICE);
            return bm != null && bm.canAuthenticate() == BiometricManager.BIOMETRIC_SUCCESS;
        } catch (Exception e) {
            return false;
        }
    }

    private KeyStore keyStore() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        return ks;
    }

    private void dropKey() {
        try {
            KeyStore ks = keyStore();
            if (ks.containsAlias(ALIAS)) ks.deleteEntry(ALIAS);
        } catch (Exception ignored) {
        }
    }

    private SecretKey makeKey() throws Exception {
        dropKey();
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
                ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(true)
                .setInvalidatedByBiometricEnrollment(true)
                .build();
        kg.init(spec);
        return kg.generateKey();
    }

    private void prompt(final PluginCall call, final Cipher cipher, final String title, final BiometricPrompt.AuthenticationCallback cb) {
        final Activity act = getActivity();
        act.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    BiometricPrompt.Builder b = new BiometricPrompt.Builder(act)
                            .setTitle(title)
                            .setSubtitle("Limitless Notepad")
                            .setNegativeButton("Use PIN", act.getMainExecutor(), new DialogInterface.OnClickListener() {
                                @Override
                                public void onClick(DialogInterface dialog, int which) {
                                    call.reject("Cancelled", "cancelled");
                                }
                            });
                    BiometricPrompt bp = b.build();
                    bp.authenticate(new BiometricPrompt.CryptoObject(cipher), new CancellationSignal(), act.getMainExecutor(), cb);
                } catch (Exception e) {
                    call.reject("Fingerprint prompt failed: " + e.getMessage(), "error");
                }
            }
        });
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject o = new JSObject();
        o.put("available", available());
        o.put("enrolled", prefs().contains(K_BLOB));
        o.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(o);
    }

    @PluginMethod
    public void enroll(final PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.length() == 0) { call.reject("No data", "error"); return; }
        if (!available()) { call.reject("Fingerprint is not available on this device", "unavailable"); return; }
        try {
            final byte[] plain = Base64.decode(data, Base64.NO_WRAP);
            SecretKey key = makeKey();
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key);
            final AtomicBoolean done = new AtomicBoolean(false);
            prompt(call, c, "Turn on fingerprint unlock", new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    if (!done.compareAndSet(false, true)) return;
                    try {
                        Cipher cc = result.getCryptoObject().getCipher();
                        byte[] iv = cc.getIV();
                        byte[] ct = cc.doFinal(plain);
                        byte[] blob = new byte[iv.length + ct.length];
                        System.arraycopy(iv, 0, blob, 0, iv.length);
                        System.arraycopy(ct, 0, blob, iv.length, ct.length);
                        prefs().edit().putString(K_BLOB, Base64.encodeToString(blob, Base64.NO_WRAP)).apply();
                        call.resolve();
                    } catch (Exception e) {
                        dropKey();
                        call.reject("Could not seal the key: " + e.getMessage(), "error");
                    }
                }

                @Override
                public void onAuthenticationError(int errorCode, CharSequence errString) {
                    if (!done.compareAndSet(false, true)) return;
                    dropKey();
                    call.reject(String.valueOf(errString), "cancelled");
                }
            });
        } catch (Exception e) {
            dropKey();
            call.reject("Fingerprint setup failed: " + e.getMessage(), "error");
        }
    }

    @PluginMethod
    public void unlock(final PluginCall call) {
        String stored = prefs().getString(K_BLOB, null);
        if (stored == null) { call.reject("Fingerprint is not set up", "notset"); return; }
        try {
            final byte[] blob = Base64.decode(stored, Base64.NO_WRAP);
            if (blob.length <= 12) { call.reject("Stored key is damaged", "invalidated"); return; }
            byte[] iv = new byte[12];
            final byte[] ct = new byte[blob.length - 12];
            System.arraycopy(blob, 0, iv, 0, 12);
            System.arraycopy(blob, 12, ct, 0, ct.length);
            KeyStore ks = keyStore();
            SecretKey key = (SecretKey) ks.getKey(ALIAS, null);
            if (key == null) { clearAll(); call.reject("Key is gone", "invalidated"); return; }
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv));
            final AtomicBoolean done = new AtomicBoolean(false);
            prompt(call, c, "Unlock Limitless Notepad", new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    if (!done.compareAndSet(false, true)) return;
                    try {
                        byte[] plain = result.getCryptoObject().getCipher().doFinal(ct);
                        JSObject o = new JSObject();
                        o.put("data", Base64.encodeToString(plain, Base64.NO_WRAP));
                        call.resolve(o);
                    } catch (Exception e) {
                        call.reject("Could not open the key: " + e.getMessage(), "error");
                    }
                }

                @Override
                public void onAuthenticationError(int errorCode, CharSequence errString) {
                    if (!done.compareAndSet(false, true)) return;
                    call.reject(String.valueOf(errString), "cancelled");
                }
            });
        } catch (KeyPermanentlyInvalidatedException e) {
            clearAll();
            call.reject("Fingerprints changed", "invalidated");
        } catch (Exception e) {
            call.reject("Fingerprint unlock failed: " + e.getMessage(), "error");
        }
    }

    private void clearAll() {
        dropKey();
        prefs().edit().remove(K_BLOB).apply();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        clearAll();
        call.resolve();
    }

    @PluginMethod
    public void setSecure(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        final Activity act = getActivity();
        act.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (on) act.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                else act.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            }
        });
        call.resolve();
    }
}
