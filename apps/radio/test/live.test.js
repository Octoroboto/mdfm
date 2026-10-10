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
