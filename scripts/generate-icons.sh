#!/usr/bin/env bash
# Regenerate raster app icons from the SVG masters in assets/.
# Requires rsvg-convert (brew install librsvg).
set -euo pipefail

cd "$(dirname "$0")/.."

render() { rsvg-convert -w "$2" -h "$2" -b "#2f1b12" "$1" -o "$3"; }

render assets/icon.svg 180 public/apple-touch-icon.png
render assets/icon.svg 192 public/pwa-192x192.png
render assets/icon.svg 512 public/pwa-512x512.png
render assets/icon-maskable.svg 512 public/maskable-512x512.png

# Multi-resolution favicon.ico (16/32/48), PNG-compressed entries.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
for size in 16 32 48; do render assets/icon.svg "$size" "$tmp/$size.png"; done
node scripts/png-to-ico.mjs public/favicon.ico "$tmp/16.png" "$tmp/32.png" "$tmp/48.png"

echo "icons written to public/"
