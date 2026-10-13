// PTLK 108.0's live material, fetched in the main process (no CORS), checked and cached:
//  - business and gaming headlines from the GDELT DOC API (open, no key) for Analyze Biz and Button Mashers;
//  - a short encyclopedia summary of one animal from Wikipedia's REST API for The Long Look.
// The shows read each headline straight first, then joke about the situation; headlines about deaths, crime,
// war, illness and the like are left out, since nobody should roast those. Any failure returns null and the
// show writes its own material, so nothing here is required.
const net = require("./net"); const getJSON = (u, o) => net.getJSON(u, o);   // looked up each call, so tests can fake the network
const QUERY = {
  business: '(earnings OR merger OR acquisition OR layoffs OR retailer OR startup OR "stock market" OR "price hike" OR "new product") sourcelang:english',
  gaming: '("video game" OR "video games" OR esports OR "game studio" OR "game console" OR "new trailer" OR "game update") sourcelang:english',
};
const AVOID = /\b(kill\w*|dead|death\w*|dies?|died|dying|shoot\w*|shot|gun\w*|murder\w*|crash\w*|war|wars|attack\w*|abus\w*|assault\w*|suicid\w*|victim\w*|sex\w*|rap(e|ed|ist)|terror\w*|bomb\w*|hostage\w*|fatal\w*|injur\w*|lawsuit\w*|sue[sd]?|fraud\w*|arrest\w*|charged|guilty|prison|jail\w*|cancer|disease\w*|tragic|tragedy|mourn\w*|funeral\w*|racis\w*|nazi\w*|hate|harass\w*|overdose\w*|famine|refugee\w*|genocide|child|children|kids?)\b/i;
const TITLE_OK = /^[\x20-\x7e‘’“”–—]{20,160}$/;
const WIKI_TITLE = /^[A-Z][A-Za-z' -]{1,60}$/;
function cleanHeadlines(list) {
  const seen = new Set(), out = [];
  for (const a of Array.isArray(list) ? list : []) {
    if (!a || typeof a.title !== "string" || (a.language && !/^english$/i.test(a.language))) continue;
    const title = a.title.replace(/\s+/g, " ").trim(); if (!TITLE_OK.test(title) || AVOID.test(title)) continue;
    const key = title.toLowerCase().replace(/[^a-z]/g, "").slice(0, 40); if (seen.has(key)) continue; seen.add(key);
    out.push({ title, source: String(a.domain || "").replace(/^www\./, "").slice(0, 60) });
    if (out.length >= 25) break;
  }
  return out.length >= 3 ? out : null;
}
// Wikimedia asks every client to name itself and give a way to reach its maker.
const WIKI_UA = "MDFM-Radio/1.0 (https://github.com/Octoroboto/mdfm; PTLK 108.0 nature show)";
function createHeadlines({ prefetch = true } = {}) {
  const cache = new Map(); let lastGdelt = 0, queue = Promise.resolve();
  // GDELT allows one request every 5 seconds (per IP, so MD Hub and MDFM Radio share it) and answers in 3-10 s.
  // So headlines are fetched in the background (at launch, then every 30 min) one at a time, 6 s apart, and a show
  // always gets the cached list instantly, even an older one. A "please slow down" answer is retried once.
  function gdelt(kind) {
    const job = queue.then(async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const wait = lastGdelt + 6000 - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait));
        lastGdelt = Date.now();
        try {
          const t = await getJSON(`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(QUERY[kind])}&mode=artlist&format=json&maxrecords=75&sort=datedesc&timespan=3d`, { timeout: 25000, text: true });
          if (/limit requests/i.test(t)) continue;   // rate-limited: wait and try once more
          const v = cleanHeadlines(JSON.parse(t).articles); if (v) cache.set(kind, { at: Date.now(), v }); return;
        } catch { return; }
      }
    });
    queue = job.catch(() => {}); return job;
  }
  const refreshAll = () => Object.keys(QUERY).reduce((p, k) => p.then(() => gdelt(k)), Promise.resolve());
  if (prefetch) { const t = setTimeout(refreshAll, 3000), i = setInterval(refreshAll, 30 * 60e3); t.unref?.(); i.unref?.(); }
  async function headlines(kind) {
    if (!QUERY[kind]) return null; const c = cache.get(kind);
    if (c) { if (Date.now() - c.at > 30 * 60e3) gdelt(kind); return c.v; }   // stale is fine; refresh behind it
    await Promise.race([gdelt(kind), new Promise(r => setTimeout(r, 5000))]);   // nothing yet: give it a few seconds
    return cache.get(kind) ? cache.get(kind).v : null;
  }
  async function wiki(title) {
    title = String(title || ""); if (!WIKI_TITLE.test(title)) return null;
    const c = cache.get("wiki:" + title); if (c && Date.now() - c.at < 24 * 3600e3) return c.v;
    try {
      const j = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}?redirect=false`, { timeout: 8000, ua: WIKI_UA });
      if (!j || j.type === "disambiguation" || typeof j.extract !== "string" || j.extract.length < 60) return null;
      const v = { title: String(j.title || title).slice(0, 120), extract: j.extract.slice(0, 2000) }; cache.set("wiki:" + title, { at: Date.now(), v }); return v;
    } catch { return c ? c.v : null; }
  }
  // kind as the page asks for it: "headlines:business", "headlines:gaming" or "wiki:<Title>"
  function get(kind) {
    kind = String(kind || "");
    if (kind.startsWith("headlines:")) return headlines(kind.slice(10));
    if (kind.startsWith("wiki:")) return wiki(kind.slice(5));
    return Promise.resolve(null);
  }
  return { get, headlines, wiki };
}
module.exports = { createHeadlines, cleanHeadlines, AVOID };
