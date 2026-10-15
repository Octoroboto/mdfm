/* CLUK 92.3: Everything in the Chicken. The station's writer (no audio here; the engine plays it).
   The whole universe is inside one enormous chicken, and this is its radio station. The scripted shows live in
   src/cluk/*.js (written ahead of time by a writers' room: Lazer Hour with Ned and ten more, played without repeats
   until every episode has aired). This file deals them, and writes everything procedural: ads (scripted, plus quick
   ones assembled from parts), call-ins to Rhonda's request line, station IDs and the DJ's intros. Plain functions. */
function createCluk(R) {
  const pick = a => a[Math.floor(R() * a.length)], ri = (a, b) => Math.floor(a + R() * (b - a + 1));
  const shuf = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = ri(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => v[k] != null ? v[k] : m).replace(/([?!])\./g, "$1");
  // a deck: every item once, shuffled, before any repeats (and never the same one twice in a row across reshuffles)
  const decks = {};
  const deal = (key, src) => { let d = decks[key]; if (!d || !d.left.length) { let left = shuf(src.map((_, i) => i)); if (d && d.last != null && left.length > 1 && left[left.length - 1] === d.last) left = [left.pop(), ...left]; d = decks[key] = { left, last: d ? d.last : null }; }
    const i = d.left.pop(); d.last = i; return src[i]; };
  const SHOWS = [SHOW_NED, SHOW_GIZZARD, SHOW_WISHBONE, SHOW_EGGQ, SHOW_OUTSIDE, SHOW_MOLT, SHOW_PECKING, SHOW_DRUMSTICK, SHOW_NESTEGG, SHOW_PLUCK];

  /* ---------- the station's own voices ---------- */
  const HOSTS = {
    voice: { name: "Clark Featherstone", accent: "american", names: ["Evan", "Tom", "Aaron", "Microsoft Guy", "Google US English"], pitch: .9, rate: .98 },
    dj: { name: "Rhonda Pecks", accent: "australian", names: ["Karen", "Catherine", "Microsoft Natasha"], pitch: 1.04, rate: 1.06 },
  };
  const ids = () => deal("ids", CLUK_IDS.voice);
  const djIntro = np => fill(deal("di", CLUK_IDS.djIntro), np);
  const djBack = np => fill(deal("db", CLUK_IDS.djBack), np);
  const bridge = () => deal("br", CLUK_IDS.bridge);
  const raveOpen = () => deal("ro", CLUK_IDS.raveOpen);

  /* ---------- the scripted shows ---------- */
  const SHOW_OPEN = ["CLUK ninety two point three. It's time for {show}.", "And now, on CLUK, {show}.", "Everything in the Chicken, and right now, that means {show}.",
    "Stay right where you are. Hold onto something if you need to. This is {show}.", "From the CLUK studios, high in the Crop: {show}.", "You're listening to CLUK ninety two point three. Here comes {show}."];
  const EP_OPEN = ["Today's episode: {title}.", "This one's called {title}.", "In this episode, {title}.", "Episode title: {title}."];
  const SHOW_CLOSE = ["That was {show}, on CLUK ninety two point three.", "{show} will be back. So will the Bawk. Hold onto something.", "You've been listening to {show}. Everything in the Chicken.",
    "That's {show}. Rhonda's got more music coming right up.", "{show}, here on CLUK. Back to the jams."];
  function show(id) {
    const s = SHOWS.find(x => x.id === id); if (!s) return null;
    const ep = deal("ep_" + id, s.episodes), tag = deal("tag_" + id, s.tags || [""]);
    const keys = Object.keys(s.cast).filter(k => !/^ph_/.test(k)).slice(0, 2), hosts = keys.map(k => s.cast[k].name).join(" and ");
    return { id, show: s.name, style: s.style, title: ep.title, hosts, cast: { ...s.cast, ...(ep.cast || {}) }, lines: ep.lines.map(l => [...l]),
      open: [fill(deal("so", SHOW_OPEN), { show: s.name }) + (tag ? " " + tag : ""), fill(deal("eo", EP_OPEN), { title: ep.title })],
      close: fill(deal("sc", SHOW_CLOSE), { show: s.name }) };
  }

  /* ---------- ads ---------- */
  const ADS = [...CLUK_ADS_1, ...CLUK_ADS_2];
  const AD_FORM = [
    p => [["v1", `Tired of the same old ${p.product.toLowerCase()}? Try the ${p.product}, from ${p.maker}.`], ["v1", p.claim], ["v2", `Side effects may include ${p.side}.`], ["v1", `${p.price}. ${p.slogan}`]],
    p => [["v1", `${p.maker} presents the ${p.product}.`], ["v2", "Does it work?"], ["v1", p.claim], ["v2", "And the catch?"], ["v1", `Some ${p.side}. Nothing serious. ${p.price}.`], ["v1", `${p.maker}. ${p.slogan}`]],
    p => [["v2", `I used to have a problem. Then I got the ${p.product}.`], ["v2", `Now I have ${p.side}. But I don't have the problem.`], ["v1", `${p.claim} The ${p.product}. ${p.price}, from ${p.maker}.`], ["v1", p.slogan]],
    p => [["v1", "Attention, everyone in the Chicken."], ["v1", `The ${p.product} is here, and ${p.maker} would like a word.`], ["v1", p.claim], ["v1", `Some customers report ${p.side}. ${p.maker} considers that a feature.`], ["v1", `${p.price}. ${p.slogan}`]],
  ];
  const ADV = [{ accent: "american", pitch: .96, rate: 1.06 }, { accent: "british", pitch: 1.04, rate: 1.02 }, { accent: "irish", pitch: 1.05, rate: 1 }, { accent: "australian", pitch: .95, rate: 1.04 }, { accent: "scottish", pitch: 1.02, rate: 1 }, { accent: "southafrican", pitch: 1.04, rate: 1 }, { accent: "indian", pitch: 1, rate: 1.02 }];
  function ad() {
    if (R() < .3) { const P2 = CLUK_AD_PARTS, p = { product: deal("adprod", P2.product), maker: pick(P2.maker), claim: deal("adclaim", P2.claim), side: deal("adside", P2.side), price: pick(P2.price), slogan: deal("adslog", P2.slogan) };
      const vs = shuf(ADV); return { title: `${p.maker}: ${p.product}`, cast: { v1: { name: "Announcer", ...vs[0] }, v2: { name: "Customer", ...vs[1] } }, lines: pick(AD_FORM)(p) }; }
    const a = deal("ads", ADS); return { title: a.title, cast: a.cast, lines: a.lines.map(l => [...l]) };
  }
  const adIntro = () => deal("ai", CLUK_AD_INTRO);

  /* ---------- Rhonda's request line ---------- */
  const CALL_OPEN = ["Request line's open. You're on CLUK, go ahead.", "We've got a caller! You're on the air, love.", "Hello, hello, you're on CLUK ninety two point three.", "Line one, you're live. Talk to me."];
  const CALL_PLAY = ["Say no more. I've got exactly the one.", "Right. This next one's for you, and it goes hard.", "I hear you. Let's make the Chicken shake.", "Okay. Okay. I know what you need."];
  function caller() {
    const C = CLUK_CALLERS, acc = pick(["american", "british", "australian", "irish", "scottish", "indian", "southafrican"]);
    const L = [["dj", pick(CALL_OPEN)], ["ph_caller", deal("copen", C.open)], ["ph_caller", deal("cstory", C.story)], ["dj", deal("creply", C.reply)]];
    if (R() < .6) L.push(["ph_caller", deal("cfollow", C.followup)]);
    L.push(["ph_caller", deal("creq", C.request)], ["dj", pick(CALL_PLAY)], ["ph_caller", deal("cbye", C.bye)]);
    return { kind: "caller", show: "Rhonda's Request Line", title: "A caller", cast: { ph_caller: { name: "Caller", accent: acc, pitch: .9 + R() * .22, rate: .95 + R() * .1 } }, lines: L };
  }

  /* ---------- the music: made-up acts and titles ---------- */
  function artist() { const A = CLUK_ARTISTS, r = R(); if (r < .35) return pick(A.handle); if (r < .6) return `${pick(A.first)} ${pick(A.last)}`; if (r < .8) return pick(A.ensemble); return `${pick(A.handle)} and ${pick(A.first)} ${pick(A.last)}`; }
  function title() { for (let i = 0; i < 8; i++) { const T = CLUK_TITLE, r = R(), a = pick(T.a), b = pick(T.b); let t = r < .3 ? `The ${a} ${b}` : `${a} ${b}`; if (R() < .18) t += ` (${pick(T.mix)})`;
      const w = t.toLowerCase().replace(/[()]/g, "").split(/\s+/).filter(x => x !== "the"); if (new Set(w).size === w.length) return t; } return `${pick(CLUK_TITLE.a)} ${pick(CLUK_TITLE.b)}`; }

  return { shows: SHOWS.map(s => ({ id: s.id, name: s.name, label: s.label || s.name, style: s.style, episodes: s.episodes.length })), HOSTS,
    show, ad, adIntro, caller, ids, djIntro, djBack, bridge, raveOpen, artist, title };
}
