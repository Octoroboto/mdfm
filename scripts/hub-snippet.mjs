// Writes the blocks the Media Development Hub embeds (hub pages can't load from the repo at runtime):
// dist/hub-skin.html (<style id="mdfm-skin">) and dist/hub-embed.html (engine + skin behaviour).
import { readFileSync, writeFileSync } from "node:fs";
const d = p => readFileSync(new URL("../dist/" + p, import.meta.url), "utf8");
const v = p => readFileSync(new URL("../vendor/meddev-receiver/" + p, import.meta.url), "utf8");
const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
writeFileSync(new URL("../dist/hub-skin.html", import.meta.url), `<style id="mdfm-skin">${d("skin.css")}</style>\n`);
writeFileSync(new URL("../dist/hub-embed.html", import.meta.url), `<script id="mdfm-lib">\n${d("mdfm.iife.js")}\n</script>\n<script id="meddev-skins" type="application/json">${v("skins.json").trim().replace(/</g, "\\u003c")}</script>\n<script id="meddev-receiver-js">\n${v("receiver.js")}\n</script>\n<script id="mdfm-skin-js">\n${read("skin/types.js")}\n</script>\n`);
console.log("wrote dist/hub-skin.html and dist/hub-embed.html: Claude swaps them into the hub and republishes");
