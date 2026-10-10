#!/bin/bash
# Publishes a new MD Hub for everyone: builds both .dmg files and puts them on the mdfm repo's releases
# page as tag radio-v<version>. Every installed copy's Futureproofer sees it and offers it (never forced).
#   1. Bump "version" in apps/hub/package.json   2. npm run release -- "What changed, in a sentence or two"
set -euo pipefail
cd "$(dirname "$0")/.."
NOTES="${1:-}"; VERSION=$(node -p "require('./package.json').version"); REPO=Octoroboto/mdfm; TAG="hub-v$VERSION"
if [ -z "$NOTES" ]; then echo 'Add a note:  npm run release -- "What changed"'; exit 1; fi
if ! command -v gh >/dev/null; then echo "GitHub's gh tool isn't installed. Run: brew install gh  then  gh auth login"; exit 1; fi
if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then echo "$TAG is already released. Bump the version in package.json first."; exit 1; fi
bash scripts/build-mac.sh
gh release create "$TAG" dist/*.dmg --repo "$REPO" --title "MD Hub $VERSION" --notes "$NOTES

**Install:** download the .dmg for your Mac (arm64 = Apple chip, the other one = Intel), open it, drag MD Hub to Applications.
The first time, macOS may say it can't check the app: open **System Settings → Privacy & Security** and click **Open Anyway** (once)."
echo "✓ Released $TAG: https://github.com/$REPO/releases/tag/$TAG"
