# MDFM: working notes for Claude

## Comments are part of every change
- Read `docs/COMMENTING.md` before editing code here, and follow it.
- New code arrives commented:
  - a header on new files;
  - a comment on every new function (what it does, arguments with units, return, side effects, `R()` draws);
  - field meanings for new tables;
  - the "why" on non-obvious lines.
- When you change code, update the comments around it in the same change. A stale comment is a bug.
- Add a version note in the house style for behaviour changes, e.g. `// 1.32: ...`.
- Never put a comment inside a string or template literal (`MIX_CSS`, HTML strings). Never add a line break inside a statement just to fit a comment.
- `scripts/build.mjs` does text replacements on the sources. So comments must not contain:
  - the quoted version placeholder;
  - a line starting with `import ` or `export ` in `src/engine.js`;
  - `export default` in `src/content/default.js`;
  - `</script`;
  - the `<!--MDFM:BADGES-->` marker.
- For a comment-only pass, prove it changed nothing with `node scripts/comment-check.mjs <before> <after>`. Then rebuild and confirm that the built bundles also pass `--pair`.

## Not ours to comment here
- `vendor/` (third-party and the MedDev Receiver).
- `dist/` (generated).
- `apps/*/kit/` (synced from rentvision-app-kit: comment it in that repo).
- The Bouncer `.cedar` policies: they are hash-locked, so a comment breaks the lock. Change them only as a reviewed policy change, then run `npm run bouncer:lock`.
