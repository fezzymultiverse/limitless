#!/usr/bin/env bash
# Adds every Android permission Limitless Notepad uses. The Capacitor plugin manifests
# declare none of them, so they must be added here. Run by CI after `npx cap add android`.
# Safe to run twice (marker comment). Usage:
#   bash tools/ci-patch-manifest.sh android/app/src/main/AndroidManifest.xml
set -euo pipefail

manifest="${1:-android/app/src/main/AndroidManifest.xml}"
[ -f "$manifest" ] || { echo "Manifest not found: $manifest" >&2; exit 1; }

MARK='LN-PERMISSIONS-V0.6.3'
if grep -q "$MARK" "$manifest"; then
  echo "Manifest already patched"
  exit 0
fi

grep -q '<application' "$manifest" || { echo "No <application> tag in $manifest" >&2; exit 1; }

block="$(mktemp)"
trap 'rm -f "$block"' EXIT
{
  echo "    <!-- $MARK -->"
  for p in POST_NOTIFICATIONS SCHEDULE_EXACT_ALARM RECEIVE_BOOT_COMPLETED WAKE_LOCK \
           ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION READ_CALENDAR WRITE_CALENDAR \
           READ_CONTACTS WRITE_CONTACTS CAMERA RECORD_AUDIO MODIFY_AUDIO_SETTINGS READ_MEDIA_AUDIO READ_MEDIA_IMAGES READ_MEDIA_VISUAL_USER_SELECTED MANAGE_EXTERNAL_STORAGE \
           REQUEST_IGNORE_BATTERY_OPTIMIZATIONS USE_BIOMETRIC; do
    echo "    <uses-permission android:name=\"android.permission.$p\" />"
  done
  echo '    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />'
  echo '    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />'
  echo '    <uses-feature android:name="android.hardware.camera" android:required="false" />'
  echo '    <uses-feature android:name="android.hardware.microphone" android:required="false" />'
} > "$block"

cp "$manifest" "$manifest.bak"
# put the block on its own lines just before the opening <application tag, and keep legacy storage on
awk -v blk="$block" '
  !done && /<application/ {
    while ((getline line < blk) > 0) print line
    close(blk)
    if ($0 !~ /requestLegacyExternalStorage/) sub(/<application/, "<application android:requestLegacyExternalStorage=\"true\"")
    done = 1
  }
  { print }
' "$manifest.bak" > "$manifest"

# V0.7.20: the activity must not be recreated for these changes (that reloaded the page and looked like a restart)
if ! grep -q 'android:configChanges' "$manifest"; then
  sed -i 's#<activity #<activity android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density|fontScale" #' "$manifest"
fi
grep -q 'android:launchMode' "$manifest" || sed -i 's#<activity #<activity android:launchMode="singleTask" #' "$manifest"

for need in "$MARK" POST_NOTIFICATIONS READ_MEDIA_IMAGES READ_MEDIA_VISUAL_USER_SELECTED READ_CONTACTS RECORD_AUDIO MANAGE_EXTERNAL_STORAGE REQUEST_IGNORE_BATTERY_OPTIMIZATIONS requestLegacyExternalStorage; do
  grep -q "$need" "$manifest" || { echo "Patch failed: $need missing" >&2; mv "$manifest.bak" "$manifest"; exit 1; }
done
rm -f "$manifest.bak"
echo "Manifest patched: notifications, alarms, location, calendar, contacts, camera, microphone, photos, audio, all-files, battery"
