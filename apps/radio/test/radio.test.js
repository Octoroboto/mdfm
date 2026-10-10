const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path");
const { nearestMetro } = require("../src/common/metros");
const { parseWeather, parseScoreboard, rankGames, cmpVersion } = require("../src/common/live-parse");
const { validateEngine } = require("../src/main/updater");
const { getJSON } = require("../src/common/net");
const espn = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/espn-nfl.json"), "utf8"));

test("nearest metro: suburbs map to the big city, the middle of nowhere maps to nothing", () => {
  assert.equal(nearestMetro(42.05, -87.68).name, "Chicago");        // Evanston
  assert.equal(nearestMetro(42.08, -71.42).name, "Boston");         // Foxborough
  assert.deepEqual(nearestMetro(42.08, -71.42).locations, ["Boston", "New England"]);
  assert.equal(nearestMetro(46.9, -110.0), null);                   // central Montana
});
test("weather parse", () => {
  assert.deepEqual(parseWeather({ current: { temperature_2m: 58.4, weather_code: 3, wind_speed_10m: 11 } }, "Chicago"), { temp: 58.4, cond: "overcast", wind: 11, place: "Chicago" });
  assert.equal(parseWeather({}), null);
});
test("scoreboard: only local teams, from the right side", () => {
  const g = parseScoreboard(espn, "nfl", ["Chicago"]);
  assert.equal(g.length, 1); assert.equal(g[0].team, "Bears"); assert.equal(g[0].opp, "Packers"); assert.equal(g[0].score, 27); assert.equal(g[0].won, true);
  const ne = parseScoreboard(espn, "nfl", ["Boston", "New England"]); assert.equal(ne[0].team, "Patriots"); assert.equal(ne[0].state, "pre");
  assert.equal(parseScoreboard(espn, "nfl", ["Denver"]).length, 0);
});
test("rank: live before final before upcoming", () => {
  const r = rankGames([{ state: "pre", date: "2026-10-12" }, { state: "in", date: "2026-10-10" }, { state: "post", date: "2026-10-09" }], 3);
  assert.deepEqual(r.map(x => x.state), ["in", "post", "pre"]);
});
test("version compare", () => {
  assert.equal(cmpVersion("1.10.0", "1.9.9"), 1); assert.equal(cmpVersion("radio-v0.2.0", "0.1.9"), 1); assert.equal(cmpVersion("1.5.0", "1.5.0"), 0);
});
test("content validation: real build passes, damaged ones are refused", () => {
  const html = fs.readFileSync(path.join(__dirname, "../vendor/radio.html"), "utf8");
  const v = JSON.parse(fs.readFileSync(path.join(__dirname, "../vendor/version.json"), "utf8")).version;
  assert.equal(validateEngine(html, v), null);
  assert.match(validateEngine(html, "9.9.9"), /mismatch/);
  assert.match(validateEngine(html.replace('<script id="mdfm-radio-wire">', '<script id="mdfm-radio-wire">)('), v), /does not parse/);
  assert.match(validateEngine(html.replace("</body>", '<script src="https://evil.example/x.js"></script></body>'), v), /external script/);
  assert.match(validateEngine("<html></html>", v), /size/);
});
test("network: hosts outside the allow-list are blocked before any request", async () => {
  await assert.rejects(getJSON("https://example.com/x"), /blocked host/);
  await assert.rejects(getJSON("http://api.open-meteo.com/x"), /blocked host/);
});

test("a newer receiver look is swapped into the radio page, and nothing else changes", () => {
  const fs = require("fs"), path = require("path"), crypto = require("crypto");
  const { applyToPage, versionOf, validate } = require("../src/common/receiver");
  const html = fs.readFileSync(path.join(__dirname, "../vendor/radio.html"), "utf8");
  const cur = versionOf(/<style id="mdfm-skin">([\s\S]{0,400})/.exec(html)[1]); assert.ok(cur, "the page says which look it has");
  const [a, b, c] = cur.split(".").map(Number), next = `${a}.${b}.${c + 1}`;
  const css = "/* MedDev Receiver " + next + " */\n.deck{color:red}", js = "/* MedDev Receiver " + next + " */\nwindow.MedDevReceiver={};";
  const out = applyToPage(html, { version: next, css, js });
  assert.ok(out.includes(css) && out.includes(`<script id="meddev-receiver-js">${js}</script>`));
  for (const id of ["mdfm-lib", "mdfm-skin-js", "mdfm-radio-wire"]) assert.strictEqual(/<script id="X">([\s\S]*?)<\/script>/.source && out.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`))[1], html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`))[1]);
  assert.strictEqual(applyToPage(html, { version: cur, css, js }), html, "same or older look: page untouched");
});
