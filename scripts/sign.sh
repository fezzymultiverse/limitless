#!/usr/bin/env bash
# Signs an Android APK with apksigner.
#   bash scripts/sign.sh <input.apk> <output.apk>
#
# Reads these environment variables (set them as masked + protected GitLab CI/CD variables):
#   KEYSTORE_BASE64    the keystore file, base64 on ONE line:  base64 -w0 release.jks
#   KEYSTORE_PASSWORD  the keystore password
# Optional:
#   KEY_ALIAS          key alias (needed only if the keystore holds more than one key)
#   KEY_PASSWORD       key password (defaults to KEYSTORE_PASSWORD)
set -euo pipefail

die() { echo "sign.sh: $*" >&2; exit 1; }

[ "$#" -eq 2 ] || die "usage: bash scripts/sign.sh <input.apk> <output.apk>"
in_apk="$1"
out_apk="$2"

[ -f "$in_apk" ] || die "input APK not found: $in_apk"
[ -n "${KEYSTORE_BASE64:-}" ] || die "KEYSTORE_BASE64 is not set"
[ -n "${KEYSTORE_PASSWORD:-}" ] || die "KEYSTORE_PASSWORD is not set"

# find apksigner and zipalign: PATH first, then the newest build-tools in the SDK
find_tool() {
  local name="$1" found=""
  if command -v "$name" > /dev/null 2>&1; then command -v "$name"; return 0; fi
  for sdk in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}"; do
    [ -n "$sdk" ] && [ -d "$sdk/build-tools" ] || continue
    found="$(ls -d "$sdk"/build-tools/*/ 2> /dev/null | sort -V | tail -n 1)"
    [ -n "$found" ] && [ -x "${found}${name}" ] && { echo "${found}${name}"; return 0; }
  done
  return 1
}
apksigner="$(find_tool apksigner)" || die "apksigner not found. Install build-tools or set ANDROID_HOME."
zipalign="$(find_tool zipalign)" || die "zipalign not found. Install build-tools or set ANDROID_HOME."

work="$(mktemp -d)"
cleanup() { rm -rf "$work"; }   # also deletes the decoded keystore
trap cleanup EXIT
umask 077

# decode the keystore
ks="$work/release.keystore"
printf '%s' "$KEYSTORE_BASE64" | tr -d ' \r\n' | base64 --decode > "$ks" 2> /dev/null || die "KEYSTORE_BASE64 is not valid base64"
[ -s "$ks" ] || die "decoded keystore is empty"

# passwords go through the environment, never the command line
export KS_PASS="$KEYSTORE_PASSWORD"
export KEY_PASS="${KEY_PASSWORD:-$KEYSTORE_PASSWORD}"

# apksigner needs the APK aligned BEFORE signing
aligned="$work/aligned.apk"
"$zipalign" -f -p 4 "$in_apk" "$aligned"
"$zipalign" -c -p 4 "$aligned" || die "zipalign check failed"

sign_args=(sign --ks "$ks" --ks-pass env:KS_PASS --key-pass env:KEY_PASS)
[ -n "${KEY_ALIAS:-}" ] && sign_args+=(--ks-key-alias "$KEY_ALIAS")
mkdir -p "$(dirname "$out_apk")"
"$apksigner" "${sign_args[@]}" --out "$out_apk" "$aligned"

# prove it worked
"$apksigner" verify --verbose --print-certs "$out_apk"
echo "Signed: $out_apk"
