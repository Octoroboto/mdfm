#!/bin/bash
# Fixed download links for launch pages. The "radio-download" release always holds the newest .dmg files under names that never change:
#   https://github.com/Octoroboto/mdfm/releases/download/radio-download/MDFM-Radio-Apple-chip.dmg
#   https://github.com/Octoroboto/mdfm/releases/download/radio-download/MDFM-Radio-Intel.dmg
# release.sh runs this after every release. Run it by hand (npm run download-links) to point the links at the .dmg files already in dist/.
# Its tag doesn't start with radio-v, so the apps' update checks ignore it.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version"); REPO=Octoroboto/mdfm; DL_TAG=radio-download
ls dist/*"$VERSION"*.dmg >/dev/null 2>&1 || { echo "No $VERSION .dmg files in dist/. Run: bash scripts/build-mac.sh"; exit 1; }
DL=$(mktemp -d); trap 'rm -rf "$DL"' EXIT
for f in dist/*"$VERSION"*.dmg; do case "$f" in *arm64*) cp "$f" "$DL/MDFM-Radio-Apple-chip.dmg";; *) cp "$f" "$DL/MDFM-Radio-Intel.dmg";; esac; done
NOTE="Fixed links to the newest MDFM Radio (now $VERSION). Launch pages point here; release notes are on radio-v$VERSION."
gh release view "$DL_TAG" --repo "$REPO" >/dev/null 2>&1 || gh release create "$DL_TAG" --repo "$REPO" --latest=false --title "MDFM Radio: download (always the newest version)" --notes "$NOTE"
gh release upload "$DL_TAG" "$DL"/*.dmg --repo "$REPO" --clobber
gh release edit "$DL_TAG" --repo "$REPO" --latest=false --notes "$NOTE"
echo "✓ Download links now give MDFM Radio $VERSION: https://github.com/$REPO/releases/download/$DL_TAG/MDFM-Radio-Apple-chip.dmg"
