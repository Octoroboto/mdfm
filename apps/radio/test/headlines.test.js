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
  const h = createHeadlines();
  assert.equal(await h.get("headlines:politics"), null);
  assert.equal(await h.get("wiki:../../etc/passwd"), null);
  assert.equal(await h.get("wiki:lowercase"), null);
  assert.equal(await h.get("weather"), null);
});
