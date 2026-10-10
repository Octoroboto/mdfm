// Pure parsing for live data (tested in test/). No network here.
const WMO = { 0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast", 45: "foggy", 48: "foggy", 51: "drizzling", 53: "drizzling", 55: "drizzling",
  61: "raining", 63: "raining", 65: "pouring", 66: "freezing rain", 67: "freezing rain", 71: "snowing", 73: "snowing", 75: "snowing hard", 77: "snowing",
  80: "showery", 81: "showery", 82: "pouring", 85: "snowing", 86: "snowing hard", 95: "thunderstorming", 96: "thunderstorming with hail", 99: "thunderstorming with hail" };
function parseWeather(json, place) {
  const c = (json && json.current) || {};
  if (typeof c.temperature_2m !== "number") return null;
  return { temp: c.temperature_2m, cond: WMO[c.weather_code] || "doing something", wind: c.wind_speed_10m, place: place || "your area" };
}
const low = s => (s || "").toLowerCase();
function parseScoreboard(json, league, locations) {
  const out = [];
  for (const e of (json && json.events) || []) {
    const c = (e.competitions || [])[0]; if (!c) continue;
    const cs = c.competitors || [];
    const mine = cs.find(x => x.team && locations.some(l => low(x.team.location) === low(l) || low(x.team.displayName).startsWith(low(l) + " ")));
    if (!mine) continue;
    const opp = cs.find(x => x !== mine), st = (c.status || e.status || {}).type || {};
    out.push({ league: league.toUpperCase(), team: mine.team.shortDisplayName || mine.team.name, opp: (opp && opp.team && (opp.team.shortDisplayName || opp.team.name)) || "somebody",
      score: +mine.score || 0, oscore: +(opp && opp.score) || 0, state: st.state, detail: st.shortDetail || "", date: e.date, won: mine.winner === true });
  }
  return out;
}
function rankGames(games, max = 2) {
  const rank = { in: 0, post: 1, pre: 2 };
  return games.slice().sort((a, b) => (rank[a.state] ?? 3) - (rank[b.state] ?? 3) || Math.abs(new Date(a.date) - Date.now()) - Math.abs(new Date(b.date) - Date.now())).slice(0, max);
}
function cmpVersion(a, b) { const p = v => String(v || "0").replace(/^[^\d]*/, "").split(".").map(n => parseInt(n, 10) || 0); const x = p(a), y = p(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1; } return 0; }
module.exports = { WMO, parseWeather, parseScoreboard, rankGames, cmpVersion };
