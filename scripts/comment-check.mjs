// Comment-only check (docs/COMMENTING.md): every changed file must be identical to the original except for comments (and whitespace between tokens).
// node scripts/comment-check.mjs <origDir> <workDir>        checks every file
// node scripts/comment-check.mjs --pair <origFile> <newFile> checks one pair (any extension rules below)
import fs from "node:fs"; import path from "node:path";
let acorn; try { acorn = await import("acorn"); } catch (e) { try { acorn = await import("/opt/node-tools/node_modules/acorn/dist/acorn.mjs"); } catch (e2) { console.error("comment-check needs acorn: run  npm i --no-save acorn  first"); process.exit(2); } }
const toks = (src, f) => { const out = []; const opts = { ecmaVersion: "latest", sourceType: "module", allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, allowImportExportEverywhere: true };
  let pe = 0; for (const t of acorn.tokenizer(src, opts)) { const nl = pe > 0 && /[\n\r\u2028\u2029]/.test(src.slice(pe, t.start)) ? "\n" : "";   /* a header above the first token is fine */ pe = t.end; out.push(nl + t.type.label + "\u0000" + (t.value === undefined ? "" : typeof t.value === "object" ? String(t.value && t.value.value !== undefined ? t.value.value : JSON.stringify(t.value)) : String(t.value)) + "\u0000" + src.slice(t.start, t.end).replace(/\s+/g, t.type.label === "template" ? "\u0001$&" : " ")); }
  return out; };
const norm = { css: s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim(), html: s => s.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ").replace(/> </g, "><").trim(),
 };   /* .cedar files are hash-locked by Bouncer, so they fall through to "must be identical" below */
function check(a, b, f) { const ext = path.extname(f).slice(1);
  if (["js", "mjs", "cjs"].includes(ext)) { let A, B; try { A = toks(a, f); } catch (e) { return a === b ? null : "orig does not tokenize and file changed: " + e.message; }
    try { B = toks(b, f); } catch (e) { return "new file does not tokenize: " + e.message; }
    if (A.length !== B.length) { for (let i = 0; i < Math.min(A.length, B.length); i++) if (A[i] !== B[i]) return `token ${i} differs: ${JSON.stringify(A[i].split("\u0000")[2])} -> ${JSON.stringify(B[i].split("\u0000")[2])}`; return `token count ${A.length} -> ${B.length}`; }
    for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return `token ${i} differs: ${JSON.stringify(A[i].split("\u0000")[2]).slice(0, 120)} -> ${JSON.stringify(B[i].split("\u0000")[2]).slice(0, 120)}`; return null; }
  if (norm[ext]) return norm[ext](a) === norm[ext](b) ? null : ext + " differs beyond comments";
  if (ext === "md") return null;   // docs may change
  return a === b ? null : "non-code file changed"; }
const args = process.argv.slice(2);
if (args[0] === "--pair") { const r = check(fs.readFileSync(args[1], "utf8"), fs.readFileSync(args[2], "utf8"), args[2]); console.log(r ? "FAIL " + r : "OK"); process.exit(r ? 1 : 0); }
const [O, W] = args; let bad = 0, changed = 0, n = 0;
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === "node_modules" || e.name === ".git" ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
for (const f of walk(W)) { const rel = path.relative(W, f), of = path.join(O, rel); n++;
  if (!fs.existsSync(of)) { console.log("NEW  " + rel); continue; }
  const a = fs.readFileSync(of, "utf8"), b = fs.readFileSync(f, "utf8"); if (a === b) continue; changed++;
  const r = check(a, b, rel); if (r) { bad++; console.log("FAIL " + rel + ": " + r); } }
console.log(`${n} files, ${changed} changed, ${bad} failing`); process.exit(bad ? 1 : 0);
