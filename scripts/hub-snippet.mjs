// Prints the <script> block the Media Development Hub embeds (hub pages can't load from a private repo).
import { readFileSync, writeFileSync } from "node:fs";
const js = readFileSync("dist/mdfm.iife.js", "utf8");
writeFileSync("dist/hub-embed.html", `<script id="mdfm-lib">\n${js}\n</script>\n`);
console.log("wrote dist/hub-embed.html: paste it over the <script id=\"mdfm-lib\"> block in the hub, or ask Claude to republish the hub");
