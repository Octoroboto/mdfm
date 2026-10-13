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
  net.getJSON = async (url, o) => { calls.push(Date.now()); return calls.length === 1 ? "Please limit requests to one every 5 seconds" : ok; };
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
