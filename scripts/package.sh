#!/bin/sh
# Package the Chrome extension into a zip ready for the Chrome Web Store.
# Output: dist/gmail-resizer-<version>.zip

set -e

scripts=$(cd "$(dirname "$0")" && pwd)
root="$scripts/.."
chrome="$root/chrome"
dist="$root/dist"

version=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$chrome/manifest.json','utf8')).version)")
output="$dist/gmail-resizer-${version}.zip"

mkdir -p "$dist"
rm -f "$output"

cd "$chrome"
zip -r "$output" \
  manifest.json \
  background.js \
  content.js \
  popup.html \
  popup.js \
  options.html \
  options.js \
  icons/

echo "Packaged: $output"
