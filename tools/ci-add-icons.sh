#!/usr/bin/env bash
# Installs the orange note-and-pen launcher icon into the generated android/ project and
# points the manifest at it. Run by CI after `npx cap add android`. Safe to run twice.
#   bash tools/ci-add-icons.sh android
set -euo pipefail

root="${1:-android}"
res="$root/app/src/main/res"
manifest="$root/app/src/main/AndroidManifest.xml"
src="$(cd "$(dirname "$0")" && pwd)/icons/res"

[ -d "$res" ] || { echo "Missing $res. Did 'npx cap add android' run?" >&2; exit 1; }
[ -f "$manifest" ] || { echo "Missing $manifest" >&2; exit 1; }
[ -d "$src" ] || { echo "Missing icon resources: $src" >&2; exit 1; }

# every file the manifest will reference must exist before we touch the manifest
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  for f in ln_icon.png ln_icon_round.png ln_icon_fg.png ln_icon_mono.png; do
    [ -f "$src/mipmap-$d/$f" ] || { echo "Missing $src/mipmap-$d/$f" >&2; exit 1; }
  done
done
for f in mipmap-anydpi-v26/ln_icon.xml mipmap-anydpi-v26/ln_icon_round.xml drawable/ln_icon_bg.xml; do
  [ -f "$src/$f" ] || { echo "Missing $src/$f" >&2; exit 1; }
done

cp -R "$src/." "$res/"

# point the manifest at the new icons (works whether or not it already ran)
sed -i -e 's#android:icon="@mipmap/[A-Za-z0-9_]*"#android:icon="@mipmap/ln_icon"#' \
       -e 's#android:roundIcon="@mipmap/[A-Za-z0-9_]*"#android:roundIcon="@mipmap/ln_icon_round"#' "$manifest"

grep -q 'android:icon="@mipmap/ln_icon"' "$manifest" || { echo "Manifest has no android:icon to patch" >&2; exit 1; }
if ! grep -q 'android:roundIcon' "$manifest"; then
  sed -i 's#android:icon="@mipmap/ln_icon"#android:icon="@mipmap/ln_icon" android:roundIcon="@mipmap/ln_icon_round"#' "$manifest"
fi
echo "Launcher icon installed: neon orange leaf and pen tip (adaptive, round, legacy, themed)"
