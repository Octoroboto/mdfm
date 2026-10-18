// Tiny static server for the demo: npm run demo, then open http://localhost:5179/demo/
import { createServer } from "node:http"; import { readFile } from "node:fs/promises"; import { extname, join, normalize } from "node:path";
// root: the repo folder; types: content types for the files the demo loads (everything else is served as bytes).
const root = new URL("../", import.meta.url).pathname, types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };
// One handler: map the URL path into the repo (a trailing "/" means index.html), refuse anything outside the repo
// (the `throw 0` lands in the catch, a 404), and send the file. Port 5179.
createServer(async (q, r) => { try { const p = normalize(join(root, decodeURIComponent(q.url.split("?")[0]).replace(/\/$/, "/index.html"))); if (!p.startsWith(root)) throw 0;
  r.writeHead(200, { "content-type": types[extname(p)] || "application/octet-stream" }); r.end(await readFile(p)); } catch { r.writeHead(404); r.end("not found"); } })
  .listen(5179, () => console.log("MDFM demo: http://localhost:5179/demo/"));
