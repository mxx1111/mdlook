#!/usr/bin/env bash
#
# Build the mdlook macOS desktop app and package it as a zip.
#
# Usage:
#   ./scripts/package-desktop-app.sh
#   ./scripts/package-desktop-app.sh --no-bump
#
# Output:
#   dist-release/mdlook_<version>_<arch>.zip
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
TAURI_DIR="$WEB_DIR/src-tauri"
APP_PATH="$TAURI_DIR/target/release/bundle/macos/mdlook.app"
RELEASE_DIR="$ROOT_DIR/dist-release"

BUMP_VERSION=1

for arg in "$@"; do
  case "$arg" in
    --no-bump)
      BUMP_VERSION=0
      ;;
    -h|--help)
      sed -n '2,/^set -euo pipefail/p' "$0" | sed '$d'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg"
      echo "Usage: ./scripts/package-desktop-app.sh [--no-bump]"
      exit 1
      ;;
  esac
done

cd "$ROOT_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required. Enable it with: corepack enable pnpm"
  exit 1
fi

if [ "$BUMP_VERSION" -eq 1 ]; then
  echo "-> Bumping desktop patch version..."
  pnpm --filter @md/web desktop:version patch
else
  echo "-> Keeping current desktop version..."
fi

VERSION="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$TAURI_DIR/tauri.conf.json', 'utf8')).version)")"
ARCH="$(uname -m)"
ZIP_PATH="$RELEASE_DIR/mdlook_${VERSION}_${ARCH}.zip"

echo "-> Building mdlook.app..."
pnpm --filter @md/web tauri build --bundles app

if [ ! -d "$APP_PATH" ]; then
  echo "Expected app bundle not found: $APP_PATH"
  exit 1
fi

mkdir -p "$RELEASE_DIR"
rm -f "$ZIP_PATH"

echo "-> Creating $ZIP_PATH..."
(
  cd "$(dirname "$APP_PATH")"
  ditto -c -k --sequesterRsrc --keepParent "mdlook.app" "$ZIP_PATH"
)

echo ""
echo "Desktop app package is ready:"
echo "  $ZIP_PATH"
echo ""
echo "Install manually:"
echo "  unzip -q \"$ZIP_PATH\" -d /tmp/mdlook-install"
echo "  open /tmp/mdlook-install/mdlook.app"
echo "  # or drag mdlook.app to /Applications"
