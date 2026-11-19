#!/usr/bin/env bash
# Downloads the Tectonic LaTeX engine into tools/tectonic/.
#
# Tectonic is a self-contained XeTeX/LaTeX distribution (~50 MB). It is not
# committed to this repository because it is a binary, and it is not required
# to run the app: without it the backend falls back to a PyMuPDF preview
# renderer. Install it to produce real, publication-grade PDFs.
#
#   bash scripts/setup-tectonic.sh

set -euo pipefail

VERSION="0.17.0"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/tools/tectonic"
EXE="$DEST/tectonic"

if [ -x "$EXE" ]; then
  echo "Tectonic already installed at $EXE"
  "$EXE" --version
  exit 0
fi

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS-$ARCH" in
  Darwin-arm64)   TARGET="aarch64-apple-darwin" ;;
  Darwin-x86_64)  TARGET="x86_64-apple-darwin" ;;
  Linux-x86_64)   TARGET="x86_64-unknown-linux-musl" ;;
  Linux-aarch64)  TARGET="aarch64-unknown-linux-musl" ;;
  *)
    echo "Unsupported platform: $OS $ARCH" >&2
    echo "Download a release manually: https://github.com/tectonic-typesetting/tectonic/releases" >&2
    exit 1
    ;;
esac

URL="https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${VERSION}/tectonic-${VERSION}-${TARGET}.tar.gz"

echo "Downloading Tectonic $VERSION ($TARGET)..."
echo "  $URL"

mkdir -p "$DEST"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

curl -fL "$URL" -o "$TMP/tectonic.tar.gz"
tar -xzf "$TMP/tectonic.tar.gz" -C "$DEST"
chmod +x "$EXE"

"$EXE" --version
echo ""
echo "The first compile downloads TeX packages into tools/tectonic-cache/"
echo "(about 45 MB, cached afterwards)."
