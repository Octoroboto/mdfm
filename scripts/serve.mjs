// Tiny static server for the demo: npm run demo, then open http://localhost:5179/demo/
import { createServer } from "node:http"; import { readFile } from "node:fs/promises"; import { extname, join, normalize } from "node:path";
const root = new URL("../", import.meta.url).pathname, types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };
createServer(async (q, r) => { try { const p = normalize(join(root, decodeURIComponent(q.url.split("?")[0]).replace(/\/$/, "/index.html"))); if (!p.startsWith(root)) throw 0;
  r.writeHead(200, { "content-type": types[extname(p)] || "application/octet-stream" }); r.end(await readFile(p)); } catch { r.writeHead(404); r.end("not found"); } })
  .listen(5179, () => console.log("MDFM demo: http://localhost:5179/demo/"));
