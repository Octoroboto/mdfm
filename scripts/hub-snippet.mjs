// Writes the blocks the Media Development Hub embeds (hub pages can't load from the repo at runtime):
// dist/hub-skin.html (<style id="mdfm-skin">) and dist/hub-embed.html (engine + skin behaviour).
import { readFileSync, writeFileSync } from "node:fs";
const d = p => readFileSync(new URL("../dist/" + p, import.meta.url), "utf8");
writeFileSync(new URL("../dist/hub-skin.html", import.meta.url), `<style id="mdfm-skin">${d("skin.css")}</style>\n`);
writeFileSync(new URL("../dist/hub-embed.html", import.meta.url), `<script id="mdfm-lib">\n${d("mdfm.iife.js")}\n</script>\n<script id="mdfm-skin-js">\n${d("skin.js")}\n</script>\n`);
console.log("wrote dist/hub-skin.html and dist/hub-embed.html: Claude swaps them into the hub and republishes");
