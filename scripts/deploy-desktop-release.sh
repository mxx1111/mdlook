#!/usr/bin/env bash
#
# Atomically publish a prepared desktop release to a remote static host.
#
# Required environment variables:
#   MDLOOK_DESKTOP_RELEASE_HOST       SSH host or alias
#   MDLOOK_DESKTOP_RELEASE_DIR        Remote immutable artifact directory
#   MDLOOK_DESKTOP_WEB_DIST_DIR       Remote active web dist directory
#   MDLOOK_DESKTOP_BASE_URL           Public origin, for example https://md.example.com
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST_PATH="$ROOT_DIR/dist-release/latest.json"

: "${MDLOOK_DESKTOP_RELEASE_HOST:?Set MDLOOK_DESKTOP_RELEASE_HOST}"
: "${MDLOOK_DESKTOP_RELEASE_DIR:?Set MDLOOK_DESKTOP_RELEASE_DIR}"
: "${MDLOOK_DESKTOP_WEB_DIST_DIR:?Set MDLOOK_DESKTOP_WEB_DIST_DIR}"
: "${MDLOOK_DESKTOP_BASE_URL:?Set MDLOOK_DESKTOP_BASE_URL}"

if [[ "$MDLOOK_DESKTOP_RELEASE_DIR" != /* || "$MDLOOK_DESKTOP_RELEASE_DIR" == "/" ]]; then
  echo "Invalid MDLOOK_DESKTOP_RELEASE_DIR: $MDLOOK_DESKTOP_RELEASE_DIR" >&2
  exit 1
fi
if [[ "$MDLOOK_DESKTOP_WEB_DIST_DIR" != /* || "$MDLOOK_DESKTOP_WEB_DIST_DIR" == "/" ]]; then
  echo "Invalid MDLOOK_DESKTOP_WEB_DIST_DIR: $MDLOOK_DESKTOP_WEB_DIST_DIR" >&2
  exit 1
fi
if [[ ! -s "$MANIFEST_PATH" ]]; then
  echo "Missing release manifest: $MANIFEST_PATH" >&2
  echo "Run 'pnpm desktop:release' first." >&2
  exit 1
fi

read_manifest() {
  node -e 'const m=require(process.argv[1]); const f=m.files[0]; console.log([m.version,f.url.split("/").pop(),f.sha256,f.sizeBytes].join("\t"))' "$MANIFEST_PATH"
}

IFS=$'\t' read -r VERSION DMG_NAME EXPECTED_SHA EXPECTED_BYTES < <(read_manifest)
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ || ! "$DMG_NAME" =~ ^mdlook_[0-9]+\.[0-9]+\.[0-9]+_[A-Za-z0-9_-]+\.dmg$ ]]; then
  echo "Invalid release manifest contents" >&2
  exit 1
fi

DMG_PATH="$ROOT_DIR/dist-release/$DMG_NAME"
if [[ ! -s "$DMG_PATH" ]]; then
  echo "Missing DMG: $DMG_PATH" >&2
  exit 1
fi

LOCAL_SHA="$(shasum -a 256 "$DMG_PATH" | awk '{print $1}')"
LOCAL_BYTES="$(stat -f '%z' "$DMG_PATH")"
if [[ "$LOCAL_SHA" != "$EXPECTED_SHA" || "$LOCAL_BYTES" != "$EXPECTED_BYTES" ]]; then
  echo "Local artifact does not match latest.json" >&2
  exit 1
fi

RELEASE_ID="${VERSION}-$(date +%Y%m%d-%H%M%S)"
REMOTE_INCOMING="$MDLOOK_DESKTOP_RELEASE_DIR/.incoming-$RELEASE_ID"

echo "Preparing remote release directory..."
ssh "$MDLOOK_DESKTOP_RELEASE_HOST" mkdir -p \
  "$MDLOOK_DESKTOP_RELEASE_DIR" \
  "$MDLOOK_DESKTOP_WEB_DIST_DIR/download" \
  "$REMOTE_INCOMING"

echo "Uploading $DMG_NAME and latest.json..."
scp "$DMG_PATH" "$MANIFEST_PATH" \
  "$MDLOOK_DESKTOP_RELEASE_HOST:$REMOTE_INCOMING/"

ssh "$MDLOOK_DESKTOP_RELEASE_HOST" bash -s -- \
  "$MDLOOK_DESKTOP_RELEASE_DIR" \
  "$MDLOOK_DESKTOP_WEB_DIST_DIR" \
  "$REMOTE_INCOMING" \
  "$DMG_NAME" \
  "$EXPECTED_SHA" \
  "$RELEASE_ID" <<'REMOTE_SCRIPT'
set -euo pipefail

release_dir="$1"
web_dist_dir="$2"
incoming="$3"
dmg_name="$4"
expected_sha="$5"
release_id="$6"

uploaded_sha="$(sha256sum "$incoming/$dmg_name" | awk '{print $1}')"
if [[ "$uploaded_sha" != "$expected_sha" ]]; then
  echo "Remote SHA-256 mismatch" >&2
  exit 1
fi

if [[ -e "$release_dir/$dmg_name" ]]; then
  existing_sha="$(sha256sum "$release_dir/$dmg_name" | awk '{print $1}')"
  if [[ "$existing_sha" != "$expected_sha" ]]; then
    echo "Refusing to overwrite immutable artifact with different content: $dmg_name" >&2
    exit 1
  fi
  unlink "$incoming/$dmg_name"
else
  mv "$incoming/$dmg_name" "$release_dir/$dmg_name"
fi

if [[ -f "$release_dir/latest.json" ]]; then
  cp "$release_dir/latest.json" "$release_dir/latest.backup-$release_id.json"
fi

install -m 0644 "$incoming/latest.json" "$release_dir/latest.next-$release_id.json"
mv "$release_dir/latest.next-$release_id.json" "$release_dir/latest.json"

install -m 0644 "$incoming/latest.json" "$web_dist_dir/download/latest.next-$release_id.json"
mv "$web_dist_dir/download/latest.next-$release_id.json" "$web_dist_dir/download/latest.json"

unlink "$incoming/latest.json"
rmdir "$incoming"
REMOTE_SCRIPT

VERIFY_DIR="$(mktemp -d /tmp/mdlook-desktop-deploy.XXXXXX)"
VERIFY_DMG="$VERIFY_DIR/$DMG_NAME"
VERIFY_RELEASE_JSON="$VERIFY_DIR/releases-latest.json"
VERIFY_PAGE_JSON="$VERIFY_DIR/page-latest.json"
cleanup_verify() {
  [[ -f "$VERIFY_DMG" ]] && unlink "$VERIFY_DMG"
  [[ -f "$VERIFY_RELEASE_JSON" ]] && unlink "$VERIFY_RELEASE_JSON"
  [[ -f "$VERIFY_PAGE_JSON" ]] && unlink "$VERIFY_PAGE_JSON"
  rmdir "$VERIFY_DIR" 2>/dev/null || true
}
trap cleanup_verify EXIT

BASE_URL="${MDLOOK_DESKTOP_BASE_URL%/}"
echo "Verifying public manifests..."
curl -fsSL --max-time 30 "$BASE_URL/downloads/latest.json" -o "$VERIFY_RELEASE_JSON"
curl -fsSL --max-time 30 "$BASE_URL/download/latest.json" -o "$VERIFY_PAGE_JSON"

node -e '
  const fs = require("fs")
  const expectedVersion = process.argv[1]
  const expectedSha = process.argv[2]
  for (const file of process.argv.slice(3)) {
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"))
    if (manifest.version !== expectedVersion || manifest.files?.[0]?.sha256 !== expectedSha)
      throw new Error(`Public manifest mismatch: ${file}`)
  }
' "$VERSION" "$EXPECTED_SHA" "$VERIFY_RELEASE_JSON" "$VERIFY_PAGE_JSON"

echo "Downloading the public DMG for end-to-end verification..."
curl -fsSL --max-time 90 "$BASE_URL/downloads/$DMG_NAME" -o "$VERIFY_DMG"
PUBLIC_SHA="$(shasum -a 256 "$VERIFY_DMG" | awk '{print $1}')"
PUBLIC_BYTES="$(stat -f '%z' "$VERIFY_DMG")"
if [[ "$PUBLIC_SHA" != "$EXPECTED_SHA" || "$PUBLIC_BYTES" != "$EXPECTED_BYTES" ]]; then
  echo "Public DMG verification failed" >&2
  exit 1
fi

echo "Desktop release $VERSION is live and verified."
echo "  $BASE_URL/download/"
echo "  $BASE_URL/downloads/$DMG_NAME"
