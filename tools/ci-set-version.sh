#!/usr/bin/env bash
# Sets versionCode and versionName in the generated Capacitor project (android/app/build.gradle).
#
# Why this exists: `npx cap add android` writes versionCode 1 and versionName "1.0". Nothing in this
# repo changed them, so EVERY APK this pipeline ever built was "version 1". Android refuses to replace
# an installed app with one that has the same or a lower versionCode, so the phone kept the first
# build and none of the later features (V0.7.8 to V0.7.17) ever appeared.
#
#   bash tools/ci-set-version.sh android/app/build.gradle
#
# versionCode = (major*10000 + minor*100 + patch) * 1000 + (CI_PIPELINE_IID mod 1000)
#   0.7.17, pipeline 42  ->  717042       0.7.18 always beats any 0.7.17 build.
# Re-running the same version in a newer pipeline still counts up, so it installs over the old one.
# Outside GitLab (no CI_PIPELINE_IID) the last three digits are 000.
set -euo pipefail

die() { echo "ci-set-version: $*" >&2; exit 1; }

gradle_in="${1:-android/app/build.gradle}"
case "$gradle_in" in /*) gradle="$gradle_in" ;; *) gradle="$PWD/$gradle_in" ;; esac
[ -f "$gradle" ] || die "not found: $gradle_in (did 'npx cap add android' run?)"

root="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$root/package.json" ] || die "package.json not found in $root"
ver="$(node -p "require('$root/package.json').version")"
[[ "$ver" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+) ]] || die "package.json version is not major.minor.patch: $ver"
ma="${BASH_REMATCH[1]}"; mi="${BASH_REMATCH[2]}"; pa="${BASH_REMATCH[3]}"

iid="${CI_PIPELINE_IID:-0}"
[[ "$iid" =~ ^[0-9]+$ ]] || iid=0
code=$(( (ma * 10000 + mi * 100 + pa) * 1000 + (iid % 1000) ))
[ "$code" -lt 2100000000 ] || die "versionCode too large: $code"

cp "$gradle" "$gradle.bak"
sed -i -E "s/^([[:space:]]*)versionCode[[:space:]]*=?[[:space:]]*[0-9]+/\1versionCode $code/" "$gradle"
sed -i -E "s/^([[:space:]]*)versionName[[:space:]]*=?[[:space:]]*\"[^\"]*\"/\1versionName \"$ver\"/" "$gradle"

grep -Eq "^[[:space:]]*versionCode $code\$" "$gradle" || die "could not set versionCode in $gradle_in (no versionCode line matched)"
grep -Eq "^[[:space:]]*versionName \"$ver\"\$" "$gradle" || die "could not set versionName in $gradle_in (no versionName line matched)"
rm -f "$gradle.bak"
echo "Version set: versionName $ver, versionCode $code"
