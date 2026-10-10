/* Optional live local sports for MDFM (opt-in network, like weather). Reads ESPN's public scoreboard feeds (no key).
   createMDFM({ sports: espnSports({ city: "Chicago" }) })  or  espnSports({ teams: ["Bears", "CHI"], leagues: ["nfl","nba"] })
   If the app's renderer can't fetch it (CORS/CSP), pass your own fetch, e.g. one that asks the main process: espnSports({ city, fetch: url => window.api.fetch(url) }). */
const LEAGUES = { nfl: "football/nfl", nba: "basketball/nba", mlb: "baseball/mlb", nhl: "hockey/nhl", mls: "soccer/usa.1", wnba: "basketball/wnba",
  ncaaf: "football/college-football", ncaab: "basketball/mens-college-basketball" };
export function espnSports(o = {}) {
  const leagues = o.leagues || ["nfl", "nba", "mlb", "nhl", "mls", "wnba"], get = o.fetch || (u => fetch(u));
  const low = s => (s || "").toLowerCase();
  const isLocal = t => {
    if (o.city && low(t.location).includes(low(o.city))) return true;
    return !!(o.teams || []).some(q => [t.displayName, t.shortDisplayName, t.name, t.abbreviation, t.location].some(x => low(x) === low(q)) || low(t.displayName).includes(low(q)));
  };
  return async () => {
    const games = [];
    await Promise.all(leagues.map(async lg => {
      try {
        const r = await get(`https://site.api.espn.com/apis/site/v2/sports/${LEAGUES[lg] || lg}/scoreboard`); if (!r.ok) return;
        const d = await r.json();
        for (const e of d.events || []) {
          const c = (e.competitions || [])[0]; if (!c) continue;
          const cs = c.competitors || [], mine = cs.find(x => x.team && isLocal(x.team)); if (!mine) continue;
          const opp = cs.find(x => x !== mine), st = (c.status || e.status || {}).type || {};
          games.push({ league: lg.toUpperCase(), team: mine.team.shortDisplayName || mine.team.name, opp: (opp && opp.team && (opp.team.shortDisplayName || opp.team.name)) || "somebody",
            score: +mine.score || 0, oscore: +(opp && opp.score) || 0, state: st.state, detail: st.shortDetail || "", date: e.date, won: mine.winner === true });
        }
      } catch (e) { /* one league failing shouldn't sink the rest */ }
    }));
    const rank = { in: 0, post: 1, pre: 2 }; games.sort((a, b) => (rank[a.state] ?? 3) - (rank[b.state] ?? 3));
    return games.slice(0, o.max || 2);
  };
}
