// Pure parsing for live data (tested in test/). No network here.
// Used by live.js (Electron main, radio and hub). Exports the parsers below plus the league tables OBSCURE and COLLEGE.
// WMO: Open-Meteo's WMO weather code -> words the DJ can say ("partly cloudy").
const WMO = { 0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast", 45: "foggy", 48: "foggy", 51: "drizzling", 53: "drizzling", 55: "drizzling",
  61: "raining", 63: "raining", 65: "pouring", 66: "freezing rain", 67: "freezing rain", 71: "snowing", 73: "snowing", 75: "snowing hard", 77: "snowing",
  80: "showery", 81: "showery", 82: "pouring", 85: "snowing", 86: "snowing hard", 95: "thunderstorming", 96: "thunderstorming with hail", 99: "thunderstorming with hail" };
// Open-Meteo "current" answer -> { temp, cond, wind, place }, or null when there's no temperature.
function parseWeather(json, place) {
  const c = (json && json.current) || {};
  if (typeof c.temperature_2m !== "number") return null;
  return { temp: c.temperature_2m, cond: WMO[c.weather_code] || "doing something", wind: c.wind_speed_10m, place: place || "your area" };
}
const low = s => (s || "").toLowerCase();
// ESPN scoreboard -> games involving a local team. locations: the team "location" names for the metro (and the state for
// college). Returns [{ league, team, opp, score, oscore, state: "pre"|"in"|"post", detail, date, won }].
function parseScoreboard(json, league, locations) {
  const out = [];
  for (const e of (json && json.events) || []) {
    const c = (e.competitions || [])[0]; if (!c) continue;
    const cs = c.competitors || [];
    const mine = cs.find(x => x.team && locations.some(l => low(x.team.location) === low(l) || low(x.team.displayName).startsWith(low(l) + " ")));
    if (!mine) continue;
    const opp = cs.find(x => x !== mine), st = (c.status || e.status || {}).type || {};
    out.push({ league: league.toUpperCase(), team: mine.team.shortDisplayName || mine.team.name, opp: (opp && opp.team && (opp.team.name || opp.team.shortDisplayName)) || "somebody",
      score: +mine.score || 0, oscore: +(opp && opp.score) || 0, state: st.state, detail: st.shortDetail || "", date: e.date, won: mine.winner === true });
  }
  return out;
}
// Any two-team game from a scoreboard, told from the winner's side when it's over. For the leagues nobody follows.
function parseAnyGame(json, league) {
  const games = [];
  for (const e of (json && json.events) || []) {
    const c = (e.competitions || [])[0], cs = (c && c.competitors) || []; if (cs.length !== 2) continue;
    const st = ((c.status || e.status || {}).type) || {}, name = x => (x.team && (x.team.displayName || x.team.shortDisplayName || x.team.name)) || null;
    let [a, b] = cs; if (st.state === "post" && (b.winner === true || +b.score > +a.score)) [a, b] = [b, a];
    if (!name(a) || !name(b)) continue;
    games.push({ league, obscure: true, team: name(a), opp: name(b), score: +a.score || 0, oscore: +b.score || 0, state: st.state, detail: st.shortDetail || "", date: e.date, won: st.state === "post" && +a.score !== +b.score });
  }
  const pickFrom = s => games.filter(g => g.state === s);
  const pool = pickFrom("in").length ? pickFrom("in") : pickFrom("post").length ? pickFrom("post") : pickFrom("pre");
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}
// Spoken league names and ESPN scoreboard paths. Best effort: a league that's off-season or missing is just skipped.
const OBSCURE = [
  ["Australian rules football", "australian-football/afl"], ["pro lacrosse", "lacrosse/pll"], ["men's college lacrosse", "lacrosse/mens-college-lacrosse"],
  ["women's college lacrosse", "lacrosse/womens-college-lacrosse"], ["women's college volleyball", "volleyball/womens-college-volleyball"],
  ["women's college field hockey", "field-hockey/womens-college-field-hockey"], ["men's college hockey", "hockey/mens-college-hockey"],
  ["women's college hockey", "hockey/womens-college-hockey"], ["the Scottish Championship", "soccer/sco.2"], ["the Indian Super League", "soccer/ind.1"],
  ["Australia's A-League", "soccer/aus.1"], ["the USL Championship", "soccer/usa.usl.1"], ["the English National League", "soccer/eng.5"],
  ["Norway's Eliteserien", "soccer/nor.1"], ["college baseball", "baseball/college-baseball"], ["the Canadian Football League", "football/cfl"],
  ["Japan's J1 League", "soccer/jpn.1"], ["the Swiss Super League", "soccer/sui.1"],
];
// College feeds for local teams (matched by state name: Nebraska, Ohio State, Iowa State...).
const COLLEGE = { "college football": "football/college-football?groups=80", "college basketball": "basketball/mens-college-basketball?groups=50", "women's college basketball": "basketball/womens-college-basketball?groups=50" };
// Orders games live first, then finished, then upcoming; ties go to the game closest to now. Returns the first max.
function rankGames(games, max = 2) {
  const rank = { in: 0, post: 1, pre: 2 };
  return games.slice().sort((a, b) => (rank[a.state] ?? 3) - (rank[b.state] ?? 3) || Math.abs(new Date(a.date) - Date.now()) - Math.abs(new Date(b.date) - Date.now())).slice(0, max);
}
// Compares two "x.y.z" version strings (any prefix like "v" ignored): 1, -1 or 0.
function cmpVersion(a, b) { const p = v => String(v || "0").replace(/^[^\d]*/, "").split(".").map(n => parseInt(n, 10) || 0); const x = p(a), y = p(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1; } return 0; }
module.exports = { WMO, parseWeather, parseScoreboard, rankGames, cmpVersion, parseAnyGame, OBSCURE, COLLEGE };
