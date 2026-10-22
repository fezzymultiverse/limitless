#!/usr/bin/env bash
# Copies the native helper into the generated android/ project. Run by CI after
# `npx cap add android` and before `npx cap sync android`. Safe to run twice.
#   bash tools/ci-add-native.sh android
set -euo pipefail

root="${1:-android}"
pkg_dir="$root/app/src/main/java/com/fezzy/limitlessnotepad"
res_dir="$root/app/src/main/res/drawable"
src="$(cd "$(dirname "$0")" && pwd)/native"

[ -d "$pkg_dir" ] || { echo "Missing $pkg_dir. Did 'npx cap add android' run?" >&2; exit 1; }
[ -f "$pkg_dir/MainActivity.java" ] || { echo "Missing MainActivity.java in $pkg_dir" >&2; exit 1; }
for f in LNDevicePlugin.java LNSecurePlugin.java LNFolderPlugin.java MainActivity.java ic_stat_ln.xml; do
  [ -f "$src/$f" ] || { echo "Missing $src/$f" >&2; exit 1; }
done

mkdir -p "$res_dir"
cp "$src/LNDevicePlugin.java" "$pkg_dir/LNDevicePlugin.java"
cp "$src/LNSecurePlugin.java" "$pkg_dir/LNSecurePlugin.java"
cp "$src/LNFolderPlugin.java" "$pkg_dir/LNFolderPlugin.java"
cp "$src/MainActivity.java" "$pkg_dir/MainActivity.java"
cp "$src/ic_stat_ln.xml" "$res_dir/ic_stat_ln.xml"

grep -q 'registerPlugin(LNDevicePlugin.class)' "$pkg_dir/MainActivity.java" || { echo "MainActivity patch failed" >&2; exit 1; }
grep -q 'registerPlugin(LNSecurePlugin.class)' "$pkg_dir/MainActivity.java" || { echo "MainActivity patch failed (LNSecurePlugin)" >&2; exit 1; }
grep -q 'registerPlugin(LNFolderPlugin.class)' "$pkg_dir/MainActivity.java" || { echo "MainActivity patch failed (LNFolderPlugin)" >&2; exit 1; }
echo "Native helper added: LNDevicePlugin, LNSecurePlugin, LNFolderPlugin, MainActivity, ic_stat_ln"
