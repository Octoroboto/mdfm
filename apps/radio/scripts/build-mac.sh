#!/bin/bash
# Builds MDFM Radio as Mac apps (.dmg for Apple Silicon and Intel) into dist/.
#   npm run build:mac      build the .dmg files (to share)
#   npm run install:mac    build, then install/replace MDFM Radio in /Applications on this Mac
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v npm >/dev/null; then echo "Node.js isn't installed. Run: brew install node"; exit 1; fi
if [ "$(node -p "process.versions.node.split('.')[0]")" -lt 20 ]; then
  echo "Node $(node -v) from $(command -v node) is too old (20+ needed). If your prompt shows (base), run: conda deactivate"; exit 1; fi
if pgrep -f "MDFM Radio.app/Contents/MacOS" >/dev/null; then echo "Quit MDFM Radio first (it's running)."; exit 1; fi
echo "== 1/4 Installing build tools (slow the first time) =="
npm install --no-audit --no-fund
echo "== 2/4 Building the MDFM content and running the tests =="
npm test
echo "== 3/4 Dependency report =="
npm run report
echo "== 4/4 Building the app =="
rm -rf dist
npx electron-builder --mac
VERSION=$(node -p "require('./package.json').version")
echo; echo "Built MDFM Radio $VERSION:"; ls -1 dist/*.dmg
if [[ "${1:-}" == "--install" ]]; then
  APP="dist/mac-arm64/MDFM Radio.app"; [[ "$(uname -m)" == "x86_64" ]] && APP="dist/mac/MDFM Radio.app"
  rm -rf "/Applications/MDFM Radio.app"; ditto "$APP" "/Applications/MDFM Radio.app"
  echo "Installed. Opening MDFM Radio..."; open -a "/Applications/MDFM Radio.app"
else open dist; fi
