// Location fallbacks: Mac location, then ipwho.is, then geojs; a city in Settings wins. Network is faked.
const test = require("node:test"), assert = require("node:assert");
const net = require("../src/common/net");
let answers = {};
net.getJSON = async url => { const k = Object.keys(answers).find(k => url.includes(k)); if (!k) throw new Error("offline"); const v = answers[k]; if (v instanceof Error) throw v; return v; };
const { createLive } = require("../src/common/live");
const forecast = { current: { temperature_2m: 58, weather_code: 3, wind_speed_10m: 9 } };
test("network fallback: ipwho.is down, geojs answers", async () => {
  answers = { "ipwho.is": new Error("403"), "geojs.io": { latitude: "41.88", longitude: "-87.63", city: "Chicago" }, "open-meteo.com/v1/forecast": forecast };
  const live = createLive(() => ({ units: "f" })); live.setGeoError("not allowed");
  const w = await live.weather(); assert.strictEqual(Math.round(w.temp), 58);
  assert.match(live.status.location, /Chicago \(approximate.*not allowed.*Settings/);
});
test("the Mac's location wins over the network", async () => {
  answers = { "bigdatacloud": { city: "Evanston" }, "open-meteo.com/v1/forecast": forecast };
  const live = createLive(() => ({ units: "f" })); live.setCoords({ lat: 42.05, lon: -87.68 });
  await live.weather(); assert.match(live.status.location, /Evanston \(this Mac's location\)/);
});
test("a city in Settings wins", async () => {
  answers = { "geocoding-api": { results: [{ latitude: 39.74, longitude: -104.99, name: "Denver" }] }, "open-meteo.com/v1/forecast": forecast };
  const live = createLive(() => ({ units: "f", city: "Denver" })); live.setCoords({ lat: 42, lon: -87 });
  await live.weather(); assert.match(live.status.location, /Denver \(from Settings\)/);
});
test("nothing reachable: says so and points to Settings", async () => {
  answers = {};
  const live = createLive(() => ({ units: "f" }));
  assert.strictEqual(await live.weather(), null); assert.match(live.status.location, /unknown.*Settings/); assert.match(live.status.weather, /failed/);
});
test("sports: one local or big game plus one obscure one, from ESPN scoreboards", async () => {
  const ev = (home, away, hs, as, state = "post", loc = home) => ({ date: "2026-10-10T18:00Z", competitions: [{ status: { type: { state, shortDetail: state === "post" ? "Final" : "Q3" } },
    competitors: [{ team: { location: loc, displayName: home + " Team", shortDisplayName: home }, score: String(hs), winner: hs > as }, { team: { location: away, displayName: away + " Team", shortDisplayName: away }, score: String(as), winner: as > hs }] }] });
  answers = { "geocoding-api": { results: [{ latitude: 41.26, longitude: -95.94, name: "Omaha", admin1: "Nebraska" }] }, "open-meteo.com/v1/forecast": forecast,
    "college-football": { events: [ev("Nebraska", "Iowa", 31, 24)] }, "/scoreboard": { events: [ev("Melbourne", "Geelong", 88, 91)] } };
  const live = createLive(() => ({ units: "f", city: "Omaha" }));
  const g = await live.sports();
  assert.ok(g && g.length === 2, JSON.stringify(g));
  assert.strictEqual(g[0].team, "Nebraska"); assert.strictEqual(g[0].obscure, undefined);
  assert.strictEqual(g[1].obscure, true); assert.strictEqual(g[1].team, "Geelong Team"); assert.strictEqual(g[1].score, 91);   // told from the winner's side
  assert.match(live.status.sports, /Nebraska \(local\)/);
});
test("the 15-minute refresh really fetches new weather (the cache is shorter than the refresh)", async () => {
  let calls = 0, t = 1e12; const realNow = Date.now; Date.now = () => t;
  answers = { "geocoding-api": { results: [{ latitude: 39.74, longitude: -104.99, name: "Denver" }] },
    get "open-meteo.com/v1/forecast"() { calls++; t += 800; return forecast; } };   // each fetch takes a moment
  try {
    const live = createLive(() => ({ units: "f", city: "Denver" }));
    const start = t; await live.weather(); assert.strictEqual(calls, 1);
    t = start + 15 * 60e3; await live.weather(); assert.strictEqual(calls, 2, "the next 15-minute tick fetches again");
  } finally { Date.now = realNow; }
});
test("network location: a null or missing coordinate is no location (never 0, never NaN)", async () => {
  answers = { "ipwho.is": { success: true, latitude: null, longitude: null, city: "Nowhere" }, "geojs.io": { latitude: "41.88", city: "Chicago" }, "open-meteo.com/v1/forecast": forecast };
  const live = createLive(() => ({ units: "f" }));
  assert.strictEqual(await live.weather(), null, "geojs without a longitude isn't used either");
  answers["geojs.io"] = { latitude: "41.88", longitude: "-87.63", city: "Chicago" }; live.reset();
  await live.weather(); assert.match(live.status.location, /Chicago/);
});
test("Mac location: nulls and (0, 0) are ignored; the same spot again changes nothing", () => {
  const live = createLive(() => ({ units: "f" }));
  assert.strictEqual(live.setCoords({ lat: null, lon: -87.6 }), false);
  assert.strictEqual(live.setCoords({ lat: 0, lon: 0 }), false);
  assert.strictEqual(live.setCoords({ lat: "", lon: "" }), false);
  assert.strictEqual(live.setCoords({ lat: 95, lon: 10 }), false);
  assert.strictEqual(live.setCoords({ lat: 41.88, lon: -87.63 }), true);
  assert.strictEqual(live.setCoords({ lat: 41.881, lon: -87.631 }), false, "within about 2 km: keep the cache");
  assert.strictEqual(live.setCoords({ lat: 42.05, lon: -87.68 }), true);
});
