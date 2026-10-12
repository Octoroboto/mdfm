#!/bin/bash
# Fixed download links for launch pages. The "hub-download" release always holds the newest .dmg files under names that never change:
#   https://github.com/Octoroboto/mdfm/releases/download/hub-download/MD-Hub-Apple-chip.dmg
#   https://github.com/Octoroboto/mdfm/releases/download/hub-download/MD-Hub-Intel.dmg
# release.sh runs this after every release. Run it by hand (npm run download-links) to point the links at the .dmg files already in dist/.
# Its tag doesn't start with hub-v, so the apps' update checks ignore it.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version"); REPO=Octoroboto/mdfm; DL_TAG=hub-download
ls dist/*"$VERSION"*.dmg >/dev/null 2>&1 || { echo "No $VERSION .dmg files in dist/. Run: bash scripts/build-mac.sh"; exit 1; }
DL=$(mktemp -d); trap 'rm -rf "$DL"' EXIT
for f in dist/*"$VERSION"*.dmg; do case "$f" in *arm64*) cp "$f" "$DL/MD-Hub-Apple-chip.dmg";; *) cp "$f" "$DL/MD-Hub-Intel.dmg";; esac; done
NOTE="Fixed links to the newest MD Hub (now $VERSION). Launch pages point here; release notes are on hub-v$VERSION."
gh release view "$DL_TAG" --repo "$REPO" >/dev/null 2>&1 || gh release create "$DL_TAG" --repo "$REPO" --latest=false --title "MD Hub: download (always the newest version)" --notes "$NOTE"
gh release upload "$DL_TAG" "$DL"/*.dmg --repo "$REPO" --clobber
gh release edit "$DL_TAG" --repo "$REPO" --latest=false --notes "$NOTE"
echo "✓ Download links now give MD Hub $VERSION: https://github.com/$REPO/releases/download/$DL_TAG/MD-Hub-Apple-chip.dmg"
