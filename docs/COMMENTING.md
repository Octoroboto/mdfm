# How MDFM code is commented

Every file in this repo (except `vendor/`, `dist/` and the app-kit copies under `apps/*/kit/`) is commented so that someone who knows JavaScript and a little Web Audio, but has never seen MDFM, can find their way around and change things safely. **Every change from now on keeps it that way:** new code arrives with its comments, and changed code has its comments updated in the same commit.

## Who the comments are for
- A developer (Rob, Collin, or a Claude session) opening the file cold.
- They know JS. They don't know our names (`st`, `K`, `sp`, `GRV`, `MX`...), our units, or why a number is what it is.

## What to comment
1. **File header** (top of every file): what the file is for, where it fits (who calls it, what it calls), the main exports or entry points, and anything surprising (generated file? synced from elsewhere? must stay identical to another copy?).
2. **Section banners** for each block of related code: `// ===== Name =====` and one to three lines on what the section does.
3. **Every function**: a line or two above it. What it does, its arguments (with units: seconds, steps, MIDI note numbers, 0..1 amounts, dB), what it returns, and side effects (schedules audio at time `t`, emits an event, writes localStorage, draws from the song's random stream `R()`).
4. **Data tables** (`STY`, `POOL`, `KITS`, `GROOVE_META`...): what one entry means and what each field is, once, above the table.
5. **Non-obvious lines**: magic numbers (why 41 Hz, why .62), ordering that matters, workarounds for a browser or iOS quirk, and anything that keeps the default sound identical ("no `R()` here so a seeded render matches").
6. **State**: what a module-level variable holds, who writes it and who reads it.
7. **Version notes** like `// 1.25 (E3): ...` stay. They're the history. Add new ones the same way.

## What not to do
- **Never change code to comment it.** Comments only: no reformatting, no renaming, no reordering, no added or removed semicolons.
- **Don't add a line break inside a statement.** A comment on its own line goes where there is already a line break. Use an end-of-line `// ...` or an inline `/* ... */` inside a long line. JavaScript's automatic semicolons depend on line breaks, so a new one can change what the code does.
- **Never put a comment inside a string or template literal** (for example the CSS inside `MIX_CSS`). That changes the string. Comment above it instead.
- Don't narrate the obvious (`// loop over the steps`). Say why, or what it means.
- Don't delete or rewrite existing comments unless they are wrong. If one is wrong, fix it and say so in the commit.
- **Mind the build's text replacements.** `scripts/build.mjs` edits the sources as text, so comments must not contain:
  - the quoted version placeholder from the `VERSION` line in `src/engine.js`;
  - a line that starts with `import ` or `export ` in `src/engine.js`;
  - `export default` in `src/content/default.js`;
  - `</script`;
  - the `<!--MDFM:BADGES-->` marker.
- **Never edit the Bouncer `.cedar` policy files to add comments.** Bouncer fingerprints them (`bouncer.lock.json`), and any change, even a comment, fails the lock check and the app's security tests. A real policy change gets reviewed and re-locked with `npm run bouncer:lock`.
- Keep the house style: `//` comments, plain English, present tense, short. Dense one-line code stays dense; put the explanation on the line above.

## Show and content files
Episode scripts, ad pools and caller pools are data. Give them a file header (what station and show, how the engine picks from it, what each field means) and section banners. Don't annotate individual jokes or lines.

## Checking a comment-only change
`scripts/comment-check.mjs <original dir> <new dir>` (or `--pair <old file> <new file>`) tokenizes both versions and fails if anything other than comments and spacing changed, including a line break added between two tokens. Run it before committing a commenting pass. A change that mixes code and comments goes through the normal tests instead (build, unit tests, smoke, seeded identity).
