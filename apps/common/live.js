// Live weather and local sports, fetched in the main process (no CORS), cached.
const { getJSON } = require("./net");
const { parseWeather, parseScoreboard, rankGames, parseAnyGame, OBSCURE, COLLEGE } = require("./live-parse");
const { nearestMetro } = require("./metros");
const LEAGUES = { nfl: "football/nfl", nba: "basketball/nba", mlb: "baseball/mlb", nhl: "hockey/nhl", mls: "soccer/usa.1", wnba: "basketball/wnba" };
function createLive(getSettings) {
  let coords = null, where = null, wx = null, wxAt = 0, sp = null, spAt = 0, geoError = null;
  const status = { location: "finding…", weather: "not yet", sports: "not yet" };
  async function locate() {
    const s = getSettings();
    if (s.city) {
      const g = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(s.city)}`);
      const r = g.results && g.results[0]; if (!r) throw new Error("city not found");
      where = { lat: r.latitude, lon: r.longitude, place: r.name, state: r.admin1 || null, source: "settings" }; return where;
    }
    if (coords) {
      let place = null, state = null;
      try { const r = await getJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.lat}&longitude=${coords.lon}&localityLanguage=en`); place = r.city || r.locality || null; state = r.principalSubdivision || null; } catch {}
      where = { ...coords, place: place || "your area", state, source: "mac location" }; return where;
    }
    // No Mac location: a rough one from the network (two services, in case one is down).
    const errs = [];
    try { const ip = await getJSON("https://ipwho.is/"); if (ip && ip.success !== false && isFinite(ip.latitude)) { where = { lat: +ip.latitude, lon: +ip.longitude, place: ip.city || "your area", state: ip.region || null, source: "network" }; return where; } errs.push("ipwho.is: no answer"); }
    catch (e) { errs.push("ipwho.is: " + e.message); }
    try { const g = await getJSON("https://get.geojs.io/v1/ip/geo.json"); if (g && isFinite(+g.latitude)) { where = { lat: +g.latitude, lon: +g.longitude, place: g.city || "your area", state: g.region || null, source: "network" }; return where; } errs.push("geojs: no answer"); }
    catch (e) { errs.push("geojs: " + e.message); }
    throw new Error("couldn't find a location (" + errs.join("; ") + ")");
  }
  function describe(w) {
    if (w.source === "settings") return `${w.place} (from Settings)`;
    if (w.source === "mac location") return `${w.place} (this Mac's location)`;
    return `${w.place} (approximate, from the network${geoError ? `; Mac location: ${geoError}` : ""}. Type your city in Settings for exact weather and teams)`;
  }
  async function weather() {
    if (wx && Date.now() - wxAt < 14 * 60e3) return wx;   // under the 15-minute refresh, so each refresh really fetches
    try {
      const w = where || await locate(), u = getSettings().units === "c";
      const j = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${w.lat}&longitude=${w.lon}&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=${u ? "celsius" : "fahrenheit"}&wind_speed_unit=${u ? "kmh" : "mph"}`);
      wx = parseWeather(j, w.place); wxAt = Date.now(); status.weather = wx ? `ok · ${Math.round(wx.temp)}° ${wx.cond}` : "no data"; status.location = describe(w);
      return wx;
    } catch (e) { status.weather = "failed: " + e.message; if (!where) status.location = "unknown: " + e.message + ". Type your city in Settings."; return null; }
  }
  // Sports: half mainstream (local pro and college teams, or the day's big game), half deliberately obscure
  // (Aussie rules, lacrosse, field hockey, second-division soccer abroad...). All from ESPN's public scoreboards.
  const espn = path => { const [p, q] = path.split("?"); return getJSON(`https://site.api.espn.com/apis/site/v2/sports/${p}/scoreboard${q ? "?" + q : ""}`); };
  let ob = null, obAt = 0;
  async function obscure() {
    if (ob && Date.now() - obAt < 30 * 60e3) return ob;
    const found = [], tries = OBSCURE.slice().sort(() => Math.random() - .5).slice(0, 5);
    for (const [label, path] of tries) { try { const g = parseAnyGame(await espn(path), label); if (g) found.push(g); } catch {} if (found.length >= 2) break; }
    ob = found; obAt = Date.now(); return ob;
  }
  async function sports() {
    if (sp && Date.now() - spAt < 10 * 60e3) return sp;
    try {
      const w = where || await locate(), metro = nearestMetro(w.lat, w.lon), local = [];
      const names = [...(metro ? metro.locations : []), ...(w.state ? [w.state] : [])];
      const feeds = [...(metro ? Object.entries(LEAGUES) : []), ...(w.state ? Object.entries(COLLEGE) : [])];
      await Promise.all(feeds.map(async ([lg, path]) => { try { local.push(...parseScoreboard(await espn(path), lg, names)); } catch {} }));
      let main = rankGames(local, 1);
      if (!main.length) {   // nothing local today: the biggest game going in the major leagues
        for (const [lg, path] of Object.entries(LEAGUES).sort(() => Math.random() - .5)) { try { const g = parseAnyGame(await espn(path), lg.toUpperCase()); if (g) { main = [{ ...g, national: true, obscure: false }]; break; } } catch {} }
      }
      const odd = await obscure();
      sp = [...main, ...odd.slice(0, 1)]; spAt = Date.now();
      status.sports = sp.length ? `ok · ${sp.map(g => `${g.team} (${g.obscure ? g.league : g.national ? "big game" : "local"})`).join(", ")}` : "ok · no games on the boards";
      return sp.length ? sp : null;
    } catch (e) { status.sports = "failed: " + e.message; return null; }
  }
  return {
    setGeoError(msg) { geoError = String(msg || "unavailable").slice(0, 120); if (where && where.source === "network") status.location = describe(where); },
    setCoords(c) { if (c && isFinite(c.lat) && isFinite(c.lon)) { coords = { lat: +c.lat, lon: +c.lon }; where = null; wx = sp = null; } },
    reset() { where = null; wx = sp = null; },
    weather, sports, status,
  };
}
module.exports = { createLive };
