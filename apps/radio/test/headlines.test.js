// PTLK 108.0's live material: headlines are checked and filtered; bad input and odd titles get nothing.
const test = require("node:test"), assert = require("node:assert");
const { cleanHeadlines, createHeadlines } = require("../src/common/headlines");
test("headlines: keeps clean English titles, drops tragedies, duplicates and junk", () => {
  const a = t => ({ title: t, domain: "www.example.com", language: "English" });
  const v = cleanHeadlines([a("Retailer opens its biggest store yet in Ohio this week"), a("Retailer opens its biggest store yet in Ohio this week!"), a("Two dead after factory fire at plant"),
    a("Chipmaker raises prices on its newest graphics cards"), { title: "Le marché boursier monte encore aujourd'hui", language: "French" }, a("short"), a("Coffee chain tests a subscription for unlimited refills"), null, { title: 5 }]);
  assert.deepEqual(v.map(x => x.title), ["Retailer opens its biggest store yet in Ohio this week", "Chipmaker raises prices on its newest graphics cards", "Coffee chain tests a subscription for unlimited refills"]);
  assert.equal(v[0].source, "example.com");
  assert.equal(cleanHeadlines([a("Only one headline here, which is not enough")]), null);
});
test("headlines: only known kinds and plain animal titles are fetched", async () => {
  const h = createHeadlines({ prefetch: false });
  assert.equal(await h.get("headlines:politics"), null);
  assert.equal(await h.get("wiki:../../etc/passwd"), null);
  assert.equal(await h.get("wiki:lowercase"), null);
  assert.equal(await h.get("weather"), null);
});
test("headlines: fetched one at a time 6 s apart, a rate-limit answer is retried, shows get the cache instantly", async () => {
  const net = require("../src/common/net"), real = net.getJSON, calls = [];
  const ok = JSON.stringify({ articles: ["Retailer opens its biggest store yet in Ohio this week", "Chipmaker raises prices on its newest graphics cards", "Coffee chain tests a subscription for unlimited refills"].map(title => ({ title, domain: "example.com", language: "English" })) });
  net.getJSON = async (url, o) => { if (!/gdeltproject/.test(url)) return "<rss></rss>"; calls.push(Date.now()); return calls.length === 1 ? "Please limit requests to one every 5 seconds" : ok; };   // feeds empty: GDELT backup
  delete require.cache[require.resolve("../src/common/headlines")];
  const { createHeadlines: mk } = require("../src/common/headlines");
  try {
    const h = mk({ prefetch: false }), t0 = Date.now();
    const v = await h.get("headlines:business");   // nothing cached: waits up to 5 s, the retry comes 6 s after the first try
    assert.equal(v, null); await new Promise(r => setTimeout(r, 1500));
    const v2 = await h.get("headlines:business"); assert.equal(v2.length, 3); assert.ok(calls[1] - calls[0] >= 5900);
    const t1 = Date.now(); await h.get("headlines:business"); assert.ok(Date.now() - t1 < 50, "cached answer is instant");
  } finally { net.getJSON = real; delete require.cache[require.resolve("../src/common/headlines")]; }
});

test("headlines: RSS feeds come first, CDATA and entities decoded, sources named", async () => {
  const { rssTitles } = require("../src/common/headlines");
  const t = rssTitles('<rss><channel><title>Feed</title><item><title><![CDATA[Heating oil customers face a tough winter, £35bn plan]]></title></item><item><title>It&apos;s taking longer to find a new job &amp; more</title></item></channel></rss>', "BBC News");
  assert.deepEqual(t.map(x => x.title), ["Heating oil customers face a tough winter, £35bn plan", "It's taking longer to find a new job & more"]); assert.equal(t[0].domain, "BBC News");
  const net = require("../src/common/net"), real = net.getJSON, urls = [];
  const item = s => `<item><title>${s}</title></item>`;
  net.getJSON = async url => { urls.push(url); return /npr/.test(url) ? `<rss>${item("Coffee chain tests a subscription for unlimited refills")}${item("Retailer opens its biggest store yet in Ohio this week")}</rss>` : /bbci/.test(url) ? `<rss>${item("Chipmaker raises prices on its newest graphics cards")}</rss>` : "nope"; };
  delete require.cache[require.resolve("../src/common/headlines")];
  try { const h = require("../src/common/headlines").createHeadlines({ prefetch: false }); const v = await h.get("headlines:business");
    assert.equal(v.length, 3); assert.ok(v.every(x => x.source === "NPR" || x.source === "BBC News")); assert.ok(!urls.some(u => /gdelt/.test(u)), "GDELT not needed");
  } finally { net.getJSON = real; delete require.cache[require.resolve("../src/common/headlines")]; }
});

test("headlines: a bad number reference doesn't throw the whole feed away", () => {
  const { rssTitles } = require("../src/common/headlines");
  const t = rssTitles("<rss><item><title>Retailer &#x110000; opens a store &#9999999; in Ohio &#x2014; today</title></item></rss>", "NPR");
  assert.equal(t[0].title, "Retailer   opens a store   in Ohio — today");
});
test("headlines: asking again while a refresh runs joins it (no pile-up of feed fetches)", async () => {
  const net = require("../src/common/net"), real = net.getJSON; let feedCalls = 0;
  const item = s => `<item><title>${s}</title></item>`;
  net.getJSON = async url => { if (/gdelt/.test(url)) return "{}"; feedCalls++; await new Promise(r => setTimeout(r, 100));
    return `<rss>${item("Coffee chain tests a subscription for unlimited refills")}${item("Retailer opens its biggest store yet in Ohio this week")}${item("Chipmaker raises prices on its newest graphics cards")}</rss>`; };
  delete require.cache[require.resolve("../src/common/headlines")];
  try { const h = require("../src/common/headlines").createHeadlines({ prefetch: false });
    const [a, b, c] = await Promise.all([h.get("headlines:business"), h.get("headlines:business"), h.get("headlines:business")]);
    assert.equal(feedCalls, 2, "the two business feeds, fetched once"); assert.ok(a && b && c);
  } finally { net.getJSON = real; delete require.cache[require.resolve("../src/common/headlines")]; }
});
test("encyclopedia: at most 300 fetches a day, and the cache keeps the newest 200 pages", async () => {
  const net = require("../src/common/net"), real = net.getJSON; let calls = 0;
  net.getJSON = async url => { calls++; return { title: decodeURIComponent(url.split("/summary/")[1].split("?")[0]), extract: "A long enough summary of an animal that lives somewhere and does things all day long." }; };
  delete require.cache[require.resolve("../src/common/headlines")];
  try { const h = require("../src/common/headlines").createHeadlines({ prefetch: false });
    const name = i => "Animal " + String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + Math.floor(i / 26) % 26) + String.fromCharCode(65 + Math.floor(i / 676));
    for (let i = 0; i < 320; i++) await h.get("wiki:" + name(i));
    assert.equal(calls, 300, "the daily budget");
    assert.ok(await h.get("wiki:" + name(299)), "a recent page is still cached"); assert.equal(calls, 300);
    assert.equal(await h.get("wiki:" + name(0)), null, "the oldest pages were let go (and the budget is spent)");
  } finally { net.getJSON = real; delete require.cache[require.resolve("../src/common/headlines")]; }
});
