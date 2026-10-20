// Writes the blocks the Media Development Hub embeds (hub pages can't load from the repo at runtime):
// dist/hub-skin.html (<style id="mdfm-skin">) and dist/hub-embed.html (engine + skin behaviour).
// Run by `npm run hub` (after a build). The hub (the Media Development Hub page) inlines these two blocks in place of its old
// copies: hub-skin.html carries the receiver CSS (dist/skin.css), and hub-embed.html carries the library
// (dist/mdfm.iife.js), the receiver skins as JSON, the receiver script and skin/types.js, with the same element ids as
// dist/radio.html so the hub's own wiring finds them.
import { readFileSync, writeFileSync } from "node:fs";
const d = p => readFileSync(new URL("../dist/" + p, import.meta.url), "utf8");   // d(p): a file in dist/
const v = p => readFileSync(new URL("../vendor/meddev-receiver/" + p, import.meta.url), "utf8");   // v(p): a file in the bundled MedDev Receiver
const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");   // read(p): a file anywhere in the repo
writeFileSync(new URL("../dist/hub-skin.html", import.meta.url), `<style id="mdfm-skin">${d("skin.css")}</style>\n`);
// 1.33: the baked PTRN tags ride along when src/content/tags-baked.js exists (their own block, id mdfm-tags)
let tags = ""; try { tags = read("src/content/tags-baked.js"); } catch {}
const tagsTag = tags ? `<script id="mdfm-tags">${tags.replace(/<\/script/gi, "<\\/script")}</script>\n` : "";
writeFileSync(new URL("../dist/hub-embed.html", import.meta.url), `${tagsTag}<script id="mdfm-lib">\n${d("mdfm.iife.js")}\n</script>\n<script id="meddev-skins" type="application/json">${v("skins.json").trim().replace(/</g, "\\u003c")}</script>\n<script id="meddev-receiver-js">\n${v("receiver.js")}\n</script>\n<script id="mdfm-skin-js">\n${read("skin/types.js")}\n</script>\n`);   // "<" in the skins JSON is escaped so it can't close the script tag
console.log("wrote dist/hub-skin.html and dist/hub-embed.html: Claude swaps them into the hub and republishes");
