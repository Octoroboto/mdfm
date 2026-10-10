// Live weather and local sports, fetched in the main process (no CORS), cached.
const { getJSON } = require("./net");
const { parseWeather, parseScoreboard, rankGames } = require("./live-parse");
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
      where = { lat: r.latitude, lon: r.longitude, place: r.name, source: "settings" }; return where;
    }
    if (coords) {
      let place = null;
      try { const r = await getJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.lat}&longitude=${coords.lon}&localityLanguage=en`); place = r.city || r.locality || null; } catch {}
      where = { ...coords, place: place || "your area", source: "mac location" }; return where;
    }
    // No Mac location: a rough one from the network (two services, in case one is down).
    const errs = [];
    try { const ip = await getJSON("https://ipwho.is/"); if (ip && ip.success !== false && isFinite(ip.latitude)) { where = { lat: +ip.latitude, lon: +ip.longitude, place: ip.city || "your area", source: "network" }; return where; } errs.push("ipwho.is: no answer"); }
    catch (e) { errs.push("ipwho.is: " + e.message); }
    try { const g = await getJSON("https://get.geojs.io/v1/ip/geo.json"); if (g && isFinite(+g.latitude)) { where = { lat: +g.latitude, lon: +g.longitude, place: g.city || "your area", source: "network" }; return where; } errs.push("geojs: no answer"); }
    catch (e) { errs.push("geojs: " + e.message); }
    throw new Error("couldn't find a location (" + errs.join("; ") + ")");
  }
  function describe(w) {
    if (w.source === "settings") return `${w.place} (from Settings)`;
    if (w.source === "mac location") return `${w.place} (this Mac's location)`;
    return `${w.place} (approximate, from the network${geoError ? `; Mac location: ${geoError}` : ""}. Type your city in Settings for exact weather and teams)`;
  }
  async function weather() {
    if (wx && Date.now() - wxAt < 15 * 60e3) return wx;
    try {
      const w = where || await locate(), u = getSettings().units === "c";
      const j = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${w.lat}&longitude=${w.lon}&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=${u ? "celsius" : "fahrenheit"}&wind_speed_unit=${u ? "kmh" : "mph"}`);
      wx = parseWeather(j, w.place); wxAt = Date.now(); status.weather = wx ? `ok · ${Math.round(wx.temp)}° ${wx.cond}` : "no data"; status.location = describe(w);
      return wx;
    } catch (e) { status.weather = "failed: " + e.message; if (!where) status.location = "unknown: " + e.message + ". Type your city in Settings."; return null; }
  }
  async function sports() {
    if (sp && Date.now() - spAt < 10 * 60e3) return sp;
    try {
      const w = where || await locate(), metro = nearestMetro(w.lat, w.lon);
      if (!metro) { status.sports = `no big-league teams near ${w.place}`; return null; }
      const all = [];
      await Promise.all(Object.entries(LEAGUES).map(async ([lg, path]) => {
        try { all.push(...parseScoreboard(await getJSON(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard`), lg, metro.locations)); } catch {}
      }));
      sp = rankGames(all, 2); spAt = Date.now();
      status.sports = sp.length ? `ok · ${metro.name}: ${sp.map(g => g.team).join(", ")}` : `ok · no ${metro.name} games on the board`;
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
