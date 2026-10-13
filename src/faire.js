/* HEARYE 95.5: Renn Faire Radio, the Home of High Drama. The station's writer (no audio here; the engine plays it).
   The scripted shows live in src/faire/*.js (written ahead of time, at least 15 episodes each, played without repeats until
   every episode has aired). This file writes everything procedural: the jousting and royal show-pony broadcasts, the
   realm news (the company's Slack news read by the herald in the old tongue, or made-up proclamations without it),
   ads assembled from parts, call-ins to the bard, station IDs and the bard's intros. Plain functions, no imports. */
function createFaire(R) {
  const pick = a => a[Math.floor(R() * a.length)], ri = (a, b) => Math.floor(a + R() * (b - a + 1));
  const shuf = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = ri(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => v[k] != null ? v[k] : m).replace(/([?!])\./g, "$1");
  // a deck: every item once, shuffled, before any repeats (and never the same one twice in a row across reshuffles)
  const decks = {};
  const deal = (key, src) => { let d = decks[key]; if (!d || !d.left.length) { let left = shuf(src.map((_, i) => i)); if (d && d.last != null && left.length > 1 && left[left.length - 1] === d.last) left = [left.pop(), ...left]; d = decks[key] = { left, last: d ? d.last : null }; }
    const i = d.left.pop(); d.last = i; return src[i]; };
  const SHOWS = [SHOW_DOUG, SHOW_CAULDRON, SHOW_GROG, SHOW_PEST, SHOW_DQI, SHOW_ONESTAR, SHOW_HOARD];

  /* ---------- the station's own voices ---------- */
  const HOSTS = {
    crier: { name: "Bartholomew Bellweather, Royal Crier", accent: "british", names: ["Daniel", "Arthur", "Oliver", "Google UK English Male", "Microsoft George", "Microsoft Ryan"], pitch: .96, rate: 1.02 },
    bard: { name: "Merriweather the Bard", accent: "irish", names: ["Moira", "Microsoft Emily", "Microsoft Connor"], pitch: 1.02, rate: .96 },
    herald: { name: "Osgood Trumpington, Herald of the Realm", accent: "american", names: ["Evan", "Tom", "Aaron", "Microsoft Guy", "Google US English"], pitch: .92, rate: 1 },
  };
  const ids = () => deal("crier", FAIRE_IDS.crier);
  const bardIntro = (np) => fill(deal("bi", FAIRE_IDS.bardIntro), np);
  const bardBack = (np) => fill(deal("bb", FAIRE_IDS.bardBack), np);
  const BRIDGE = ["And now, without a word more, more music.", "No more talking. The bard has spoken. Mostly to himself.", "Let us have another, shall we? We shall.",
    "Back to the music, before the crier finds the trumpet again.", "On we go. The candles are still lit, so the night is young.", "Here is another. Hold someone's hand. Ask first."];
  const bridge = () => deal("bridge", BRIDGE);

  /* ---------- the scripted shows ---------- */
  const SHOW_OPEN = ["Hear ye, hear ye! It is time for {show}.", "And now, by royal permission that we did not ask for, {show}.", "Gather round, gather round. It is {show}.",
    "Good people of the realm, put down thy turnips. {show} begins.", "The crier announces, with all the breath he has left, {show}.", "Next upon Hear Ye: {show}. Viewer discretion is advised. Listener discretion, also."];
  const EP_OPEN = ["This day's tale: {title}.", "In this episode: {title}.", "Today's chapter is called {title}.", "Hear now the tale of {title}.", "This one is called {title}. The crier has not read it."];
  const SHOW_CLOSE = ["That was {show}. It will return, whether thou wilt or no.", "Thou hast been listening to {show}. Hear Ye takes no responsibility.", "{show}, everybody. Give it a hand. Not like Doug. Normally.",
    "And so ends {show}, for this day. The realm is no better for it, and no worse.", "That was {show}, on Hear Ye, ninety five point five. The Home of High Drama.", "{show} will return. The crier will be here too. He lives here now."];
  function show(id) {
    const s = SHOWS.find(x => x.id === id); if (!s) return null;
    const ep = deal("ep_" + id, s.episodes), tag = deal("tag_" + id, s.tags || [""]);
    const hosts = Object.values(s.cast).filter((c, i) => i < 2 && !/^ph_/.test(Object.keys(s.cast)[i])).map(c => c.name).join(" and ");
    return { id, show: s.name, style: s.style, title: ep.title, hosts, cast: { ...s.cast, ...(ep.cast || {}) }, lines: ep.lines.map(l => [...l]),
      open: [fill(deal("so", SHOW_OPEN), { show: s.name }) + (tag ? " " + tag : ""), fill(deal("eo", EP_OPEN), { title: ep.title })],
      close: fill(deal("sc", SHOW_CLOSE), { show: s.name }) };
  }

  /* ---------- jousting: every match written live ---------- */
  const J = {
    pbp: { name: "Rodric Hollowell", accent: "british", names: ["Daniel", "Arthur", "Oliver", "Google UK English Male", "Microsoft Ryan"], pitch: .95, rate: 1.06 },
    color: { name: "Big Tamsin Graves", accent: "australian", names: ["Karen", "Catherine", "Microsoft Natasha"], pitch: 1.04, rate: 1.02 },
    first: ["Humphrey", "Gareth", "Osric", "Baldwin", "Edmund", "Rupert", "Godfrey", "Lionel", "Ambrose", "Fulke", "Hector", "Percival", "Roland", "Tancred", "Wystan", "Cuthbert", "Aldous", "Barnabas", "Conrad", "Dunstan", "Ellery", "Lambert", "Ignatius"],
    house: ["Dunmoor", "Wrenfield", "Ashcombe", "Blackwater", "Thornbury", "Pelling", "Coldharbour", "Fennimore", "Greystoke", "Hallowell", "Mudford", "Quillon", "Ravensgate", "Stagwick", "Underhill", "Vexley", "Whitlock", "Yarrowby"],
    epithet: ["the Moderately Brave", "the Unhorsed", "Who Is Also a Baker", "the Twice Divorced", "of the Soggy Marsh", "the Lactose Intolerant", "the Loud", "the Only Slightly Cursed", "the Returning Champion, Allegedly",
      "the Left-Handed", "Who Owns a Boat", "the Polite", "the Very Tall", "the Freshly Knighted", "the Damp", "of No Fixed Abode", "the Anxious", "Who Will Not Stop Talking About His Boat"],
    colors: ["blue and gold", "green and a slightly different green", "red and white", "purple, with a goose", "black and silver", "orange, for some reason", "yellow and brown, like a bruise", "white, freshly cleaned, and he wants you to know"],
    horse: ["Thunderhoof", "Gerald", "Mister Biscuits", "Doom Pony", "Kevin", "Lady Hayseed", "Bonecrusher", "Pumpernickel", "Sir Neighs-a-Lot", "Marigold", "Stormwind", "Big Toast", "Clopsworth", "Daisy the Destroyer", "Old Clarence", "Velvet Hammer"],
    venue: ["the Royal Lists at Highgarden Fair", "the Muddy Field behind the Abbey", "the Grand Tiltyard of Castle Vexmoor", "the Duke's Summer Tourney", "the Festival of the Slightly Larger Turnip", "the Harvest Joust at Pellingham Green", "the Midwinter Melee, held in summer this year due to a clerical error"],
    intro: ["Good afternoon and welcome to {venue}, where two knights are about to ride very fast at one another for reasons nobody has explained to me.", "Hello and welcome to {venue}. The sun is out, the pennants are flying, and somebody has already lost a boot.",
      "Welcome, joust fans, to {venue}. I'm {pbp}, and beside me as always is {color}, who has brought her own lance, which is not allowed.", "It's a beautiful day for violence, and we are live at {venue}."],
    colorOpen: ["Thanks, Rodric. I've been here since dawn. I watched them set up the fence. Great fence.", "Rodric, I'm not going to lie to you. I had a dream about this match, and in the dream I won.", "Big day. Big, big day. I've already had four turkey legs and I'm thinking about a fifth.",
      "Rodric, I want to talk about the fence. Nobody ever talks about the fence.", "I'm just happy to be here. I was told I wasn't allowed back after last year, but here I am."],
    introA: ["In the blue corner. Wait, there are no corners. On the left, {a}, riding {ah}, in the colors of House {ahouse}, {acol}.", "Riding out first, {a}, aboard the great {ah}. House {ahouse}. Colors: {acol}.", "Approaching the lists, it's {a}, on {ah}. A proud knight of House {ahouse}."],
    introB: ["And at the far end, {b}, mounted on {bh}, for House {bhouse}, {bcol}.", "His opponent, {b}, astride {bh}. House {bhouse}, {bcol}.", "And facing {aname}, it's {b}, on a horse called {bh}, which is the horse's real name."],
    quirk: ["I've met {k}. Lovely knight. Asked me to hold his sandwich and never came back for it. I still have it.", "{k} has trained all season by charging at his brother. His brother is fine. Mostly.", "You'll notice {k} is wearing two helmets. That's a choice.",
      "{k} told me this morning he's never been more ready. Then he asked which end of the lance goes forward.", "Big fan of {k}. Big fan. I named a goat after him. The goat is also very good at jousting.", "{k} doesn't believe in horses. He rides one, but he doesn't believe in it.",
      "I'm looking at {k}'s shins, Rodric. Those are not jousting shins. Those are dancing shins.", "{k} has a lucky ribbon tied to his lance. It's from his mother. It says Please Come Home.", "Word in the stables is that {k} has been eating nothing but eggs for a month. You can smell it from here.",
      "{k} owns a boat. He'll tell you about it. You will not be able to stop him.", "That's a brand new saddle on {h}. {k} paid a lot for it, and he wants us to say so on the air. So, there it is. A lot."],
    seg: [["sfx", "horse"]],
    ready: ["The knights lower their visors.", "Lances down. The squires step back.", "Here we go. The marshal raises the flag.", "They're set. The crowd falls silent. Somebody coughs.", "Visors down. Somewhere a trumpet plays the wrong note."],
    charge: ["And they're off!", "They charge!", "Here they come, thundering down the list!", "And they spur their horses!", "Off they go, at a full gallop!"],
    outcome: {
      miss: ["And they miss! Both of them! Clean past each other!", "Nothing! Neither lance touches anything!", "And a miss. A complete miss. They're waving at each other now."],
      glance: ["{k} catches the edge of the shield! A glancing blow! One point!", "A glance off the shield from {k}! That's a point!", "{k} clips the shield! One point, and a lot of noise!"],
      shatter: ["Crack! {k} shatters his lance on the shield! Two points!", "The lance breaks clean! Two points to {k}!", "Splinters everywhere! A broken lance for {k}, that's two!"],
      helm: ["Right on the helm! {k} strikes the helm! Three points!", "Oh! To the helmet! Three points for {k}!", "A helm strike from {k}! The crowd is on its feet! Three!"],
      unhorse: ["Down he goes! {k} has unhorsed his man! It's over!", "Unhorsed! {o} is on the ground! {k} wins it!", "He's off! {o} is off the horse! Victory for {k}!"],
      incident: ["Oh no. {h} has stopped to eat some grass. In the middle of the list. No points.", "And {k} has dropped his lance. Just dropped it. Before anything happened.", "A squire has wandered onto the field to retrieve a hat. Everyone has stopped. No points on that pass.",
        "{h} has turned around and gone back to the stables. That's a no contest.", "Wait, {k} is waving to someone in the gallery. Is that his mother? No points."],
    },
    react: { miss: ["You hate to see it. You love to see it. I can't decide.", "That's what we call a friendly pass, Rodric.", "They both looked so confident."], glance: ["A point's a point.", "He'll take that. He'll write a poem about that.", "Tidy. Very tidy."],
      shatter: ["Lovely sound. Like a tree giving up.", "I felt that one in my teeth.", "That lance cost more than my house."], helm: ["That's going to ring for a week.", "He's seeing two of everything. Maybe three.", "I'd lie down. He won't, but I would."],
      unhorse: ["And that's why you don't eat eggs for a month.", "I called it. I called it in my dream.", "Get that man a cushion."], incident: ["This happens more than you'd think.", "Classic.", "I respect it, honestly."] },
    winner: ["{k} wins it, {sa} to {sb}!", "And it's {k}! Final score, {sa} to {sb}.", "Victory to {k}, {sa} points to {sb}!"],
    tie: ["Level after three passes! We go to a fourth!", "Tied up! One more pass decides it!"],
    interviewIntro: ["Let's get a word with the winner. {k}, how does it feel?", "We're joined by {k}. Congratulations. Any words?", "{k}, you've just won. What's going through your mind?"],
    interview: ["I would like to thank my horse, my mother, and the man who sold me this helmet, who said it was the best one and he was right.", "Honestly I closed my eyes the whole time. I always do. It's the only way I can do it.", "I'd like to say to my opponent, good match, and also, I want my cloak back. You know the one.",
      "I'm going to celebrate the way I always do. I'm going to sit in a field and eat an onion.", "This is for everyone back home in the marsh. All eleven of you.", "I want to dedicate this to my boat. She couldn't be here. She's a boat.",
      "Is this the radio? Hello, mother. I did it. Please stop telling people I'm a baker.", "No comment. Sorry. I've always wanted to say that. Yes, it feels incredible."],
    loser: ["Meanwhile, {k} is insisting to the marshal that he actually won.", "{k} has asked for a recount. There's nothing to count.", "{k} is already blaming the horse. The horse looks hurt."],
    close: ["That's it from {venue}. For Big Tamsin Graves, I'm Rodric Hollowell. Mind the splinters.", "From {venue}, that's the joust. Tamsin, any final thoughts? None? Good.", "We'll be back next time with more jousting. Until then, keep your lances up and your visors down."],
    colorClose: ["I'm going to go find that sandwich.", "Can I go down and touch the fence now?", "Rodric, I've had a wonderful time. Truly. Nobody's ever let me say this much.", "Turkey leg number five, here I come."],
  };
  function joust() {
    const mk = () => { const f = pick(J.first); return { k: `Sir ${f} ${pick(J.house)}`, short: `Sir ${f}`, house: pick(J.house), col: pick(J.colors), h: pick(J.horse), ep: pick(J.epithet) }; };
    const A = mk(); let B = mk(); while (B.short === A.short || B.h === A.h) B = mk();
    const venue = pick(J.venue), v = { venue, pbp: J.pbp.name, color: J.color.name };
    const L = [["sfx", "gallery"], ["pbp", fill(pick(J.intro), v)], ["color", pick(J.colorOpen)],
      ["pbp", fill(pick(J.introA), { a: `${A.k}, ${A.ep}`, ah: A.h, ahouse: A.house, acol: A.col })], ["color", fill(pick(J.quirk), { k: A.short, h: A.h })],
      ["pbp", fill(pick(J.introB), { b: `${B.k}, ${B.ep}`, bh: B.h, bhouse: B.house, bcol: B.col, aname: A.short })], ["color", fill(pick(J.quirk), { k: B.short, h: B.h })], ["seg"]];
    let sa = 0, sb = 0, pass = 0, done = null;
    const score = { glance: 1, shatter: 2, helm: 3 };
    while (!done && pass < 5) {
      pass++; if (pass > 3 && sa !== sb) break;
      if (pass === 4) L.push(["pbp", pick(J.tie)]);
      L.push(["pbp", pick(J.ready)], ["sfx", "horse"], ["pbp", pick(J.charge)]);
      const r = R(), who = R() < .5 ? A : B, o = who === A ? B : A;
      const kind = r < .14 ? "miss" : r < .4 ? "glance" : r < .64 ? "shatter" : r < .8 ? "helm" : r < .9 ? "unhorse" : "incident";
      L.push(["pbp", fill(pick(J.outcome[kind]), { k: who.short, o: o.short, h: who.h })]);
      if (kind === "shatter" || kind === "unhorse") L.push(["sfx", "crash"]);
      if (score[kind]) { if (who === A) sa += score[kind]; else sb += score[kind]; if (R() < .3) { const r2 = R(); const k2 = r2 < .5 ? "glance" : "shatter"; const t2 = fill(pick(J.outcome[k2]), { k: o.short }); L.push(["pbp", pick(["And at the same moment, ", "But wait, ", "And in return, "]) + (/^Sir /.test(t2) ? t2 : t2[0].toLowerCase() + t2.slice(1))]); if (o === A) sa += score[k2]; else sb += score[k2]; } }
      L.push(["color", pick(J.react[kind])]);
      if (kind === "unhorse") done = who;
      if (pass === 2 && !done) L.push(["seg"]);
    }
    if (!done) { done = sa > sb ? A : sb > sa ? B : (R() < .5 ? A : B); if (sa === sb) { if (done === A) sa++; else sb++; L.push(["pbp", "Decided on style points, which is a rule they added this morning."]); } }
    const loser = done === A ? B : A, hi = Math.max(sa, sb), lo = Math.min(sa, sb);
    L.push(["sfx", "applause"], ["pbp", fill(pick(J.winner), { k: done.short, sa: hi, sb: lo })], ["seg"], ["pbp", fill(pick(J.interviewIntro), { k: done.short })], ["knight", pick(J.interview)],
      ["pbp", fill(pick(J.loser), { k: loser.short })], ["color", pick(J.colorClose)], ["pbp", fill(pick(J.close), v)]);
    return { kind: "joust", show: "The Royal Joust", title: `${A.short} versus ${B.short}, ${venue.replace(/^the /, "")}`, hosts: `${J.pbp.name} and ${J.color.name}`, style: "battle",
      cast: { pbp: J.pbp, color: J.color, knight: { name: done.k, accent: pick(["american", "scottish", "irish", "indian", "southafrican"]), pitch: .94, rate: 1.04 } }, lines: L };
  }

  /* ---------- the royal show ponies ---------- */
  const P = {
    ann: { name: "Lady Philippa Dawes", accent: "british", names: ["Serena", "Kate", "Martha", "Google UK English Female", "Microsoft Hazel", "Microsoft Sonia"], pitch: 1.04, rate: .98 },
    color: { name: "Sir Bertram Oaks", accent: "american", names: ["Aaron", "Tom", "Alex", "Microsoft Guy", "Google US English"], pitch: .92, rate: 1.02 },
    pony: ["Princess Buttercrumb", "Lord Dapple of the Lower Meadow", "Sugarfoot the Third", "Little Duchess", "Captain Muffin", "Moonbeam Majesty", "Sir Trotsalot", "Hazelnut Regina", "Pickles", "Gentle Thunder", "Baroness Fluffington", "Tiny Lord Henry", "Marzipan", "Velvet Earl", "Queen Bramble", "Doug", "Crumpet Royale", "Lady Whinnymere"],
    owner: ["the Duchess of Fenmoor", "Lord Ashby, who is eleven", "the Royal Baker", "a wizard who will not give his name", "Countess Grimbly", "the Abbot of Saint Hilda's", "Sir Rupert's mother", "a goatherd who won a raffle", "the Earl of Upper Mudford", "the Queen's second cousin, Margery"],
    event: ["the Royal Prance", "the Ribbon Hop", "the Trial of Stillness", "the Crown Balance", "the Courtly Curtsy", "the Moat Approach", "the Dignified Trot"],
    judges: [["the King's cousin Edmund", "Mother Grizelda, the hedge witch", "a small boy named Tobias"], ["Lord Chamberlain Fusk", "the Royal Farrier", "a goose, who is new this year"], ["Baroness Plumm", "Brother Anselm", "the ghost of the previous judge"]],
    open: ["Welcome to the Royal Pony Pageant, live from the castle green, where the ponies are small and the stakes are enormous.", "Good afternoon from the Royal Pony Pageant. I'm {ann}, beside me is {color}, and before us, the finest small horses in the realm.",
      "It's pageant day! The ribbons are pressed, the ponies are brushed, and the King has promised to stay awake for at least some of it."],
    colorOpen: ["Philippa, I've been doing this for thirty years, and I've never been more nervous. I didn't sleep. I brushed my own hair forty times.", "Big crowd today. Lot of hats. Some of the hats are bigger than the ponies, which I think is a rule violation.",
      "I'm told the King's favorite pony is competing today, so nobody is allowed to win except that one. Kidding. Mostly."],
    event_intro: ["Our event today is {event}. Each pony will be judged on grace, poise, and whether it bites anyone.", "First up, and only up, {event}. Three judges. Scores out of ten.", "Today's competition: {event}. Judges are {j1}, {j2}, and {j3}."],
    entry: ["Entering the ring now, {p}, owned by {o}.", "Next, {p}. Owner, {o}.", "Here comes {p}, presented by {o}."],
    perf: ["Lovely high knees from {p}. Very proud. Very upright.", "{p} is walking in a perfect circle. Now another. Now he's just going in circles. That might be all he does.", "Oh, a little bow from {p}. The crowd adores it.", "{p} is standing very still. Very, very still. Is he asleep? Judges are leaning in.",
      "{p} has stopped to look at a cloud. A long look.", "Beautiful canter from {p}. Head high, tail flowing. Just like his portrait.", "{p} has eaten one of the ribbons. That's a deduction, but it's also impressive.", "A sideways trot from {p}. I've never seen that. I don't know if it's good."],
    colorPerf: ["Gorgeous. If that pony were a person, I'd invite it to dinner and let it sit at the head of the table.", "I've got to be honest. I don't love it. I love the pony. I don't love it.", "That's a pony who knows exactly what he's doing, and what he's doing is nothing. And it's working.",
      "Philippa, I'm getting emotional. I had a pony like that. He ran away. He's probably in this pageant, actually.", "You can't teach that. You can try. I tried. It bit me.", "That's going to be controversial. I can already hear the letters being written."],
    judge: ["{j} gives {an} {n}.", "{j}, {n}.", "And {j} says {n}."],
    judgeNote: ["{J} gives {an} {n}, and then hisses at the scoreboard.", "{J} gives {an} {n}, and places a small curse on the pony. Standard.", "{J} gives {an} {n}. We think it's {an} {n}. It's hard to see.", "{J} gives {an} {n}, and asks if anyone has seen their spectacles.", "{J} holds up {an} {n}, upside down. We'll allow it."],
    total: ["That's {t} for {p}.", "A total of {t} for {p}.", "{p} finishes on {t}."],
    win: ["And the winner of {event}, with {t} points, is {p}!", "Crowned Most Royal Pony, with {t}, it's {p}!", "{p} takes the crown! {t} points!"],
    ownerIntro: ["Let's hear from the owner. {o}, congratulations.", "{o}, you must be overjoyed.", "A word from {o}, the proud owner."],
    ownerSay: ["I'd like to thank the pony. He did all of it. I just stood there, holding a carrot, crying.", "This is the happiest day of my life, and I was married this morning.", "He's been practicing in the kitchen. We don't have a kitchen anymore.",
      "I always knew. From the day he was born, I looked at him and I said, that's a pony. And I was right.", "We're going to celebrate with a big bucket of oats. He's having some too."],
    close: ["That's all from the Royal Pony Pageant. Brush your ponies, everyone.", "From the castle green, I'm Lady Philippa Dawes. Goodnight, and keep your ribbons where ponies can't reach them.", "The Royal Pony Pageant will return. The ponies will be the same height."],
    colorClose: ["What a day. I need to lie down in some hay.", "I'm going to go pat every one of them. That's not allowed. I'm doing it anyway.", "Long live the ponies. And the King, I suppose."],
  };
  function ponies() {
    const event = pick(P.event), J3 = pick(P.judges), names = shuf(P.pony).slice(0, 3), owners = shuf(P.owner).slice(0, 3);
    const L = [["sfx", "applause"], ["ann", fill(pick(P.open), { ann: P.ann.name, color: P.color.name })], ["color", pick(P.colorOpen)], ["ann", fill(pick(P.event_intro), { event, j1: J3[0], j2: J3[1], j3: J3[2] })], ["seg"]];
    const totals = [];
    names.forEach((p, i) => {
      L.push(["sfx", "horse"], ["ann", fill(pick(P.entry), { p, o: owners[i] })], ["ann", fill(deal("pperf", P.perf), { p })], ["color", deal("pcol", P.colorPerf)]);
      const sc = J3.map(() => ri(5, 10)), quip = R() < .45; let t = 0;
      const an = n => n === 8 || n === 11 ? "an" : "a", up = j => j[0].toUpperCase() + j.slice(1);
      J3.forEach((j, k) => { t += sc[k]; if (!(quip && k === 2)) L.push(["ann", fill(pick(P.judge), { j: up(j), n: sc[k], an: an(sc[k]) })]); });
      if (quip) L.push(["ann", fill(pick(P.judgeNote), { J: up(J3[2]), n: sc[2], an: an(sc[2]) })]);
      L.push(["ann", fill(pick(P.total), { t, p })]); totals.push(t + i * .01 * R());
      if (i === 1) L.push(["seg"]);
    });
    const w = totals.indexOf(Math.max(...totals)), t = Math.round(Math.max(...totals));
    L.push(["sfx", "applause"], ["ann", fill(pick(P.win), { event, t, p: names[w] })], ["seg"], ["ann", fill(pick(P.ownerIntro), { o: owners[w] })], ["pony_owner", pick(P.ownerSay)], ["color", pick(P.colorClose)], ["ann", pick(P.close)]);
    return { kind: "ponies", show: "The Royal Pony Pageant", title: `${event[0].toUpperCase() + event.slice(1)}`, hosts: `${P.ann.name} and ${P.color.name}`, style: "procession",
      cast: { ann: P.ann, color: P.color, pony_owner: { name: owners[w], accent: pick(["irish", "scottish", "southafrican", "american", "australian"]), pitch: 1.04, rate: 1 } }, lines: L };
  }

  /* ---------- the realm news: Slack news in the old tongue, or proclamations ---------- */
  const ARCH = [[/\byou are\b/gi, "thou art"], [/\byou're\b/gi, "thou art"], [/\byou have\b/gi, "thou hast"], [/\byou've\b/gi, "thou hast"], [/\bare you\b/gi, "art thou"], [/\bdo you\b/gi, "dost thou"], [/\bhave you\b/gi, "hast thou"],
    [/\byou will\b/gi, "thou wilt"], [/\byou'll\b/gi, "thou wilt"], [/\bcan you\b/gi, "canst thou"], [/\byou can\b/gi, "thou canst"], [/\byour\b/gi, "thy"], [/\byours\b/gi, "thine"], [/\byou\b/gi, "thee"], [/\bdoes\b/gi, "doth"], [/\bhas\b/gi, "hath"],
    [/\b(hello|hi|hey)\b/gi, "hail"], [/\bthank you\b/gi, "many thanks"], [/\bthanks\b/gi, "many thanks"], [/\b(congrats|congratulations)\b/gi, "huzzah"], [/\byes\b/gi, "aye"], [/\beveryone\b|\beverybody\b/gi, "all ye good folk"], [/\bteam\b/gi, "fellowship"],
    [/\bmeetings\b/gi, "councils"], [/\bmeeting\b/gi, "council"], [/\bemails\b/gi, "ravens"], [/\bemail\b/gi, "raven"], [/\bmessages\b/gi, "missives"], [/\bmessage\b/gi, "missive"], [/\bslack\b/gi, "the great scroll"], [/\bchannel\b/gi, "hall"],
    [/\b(boss|manager)\b/gi, "liege"], [/\b(computer|laptop)\b/gi, "scrying glass"], [/\blunch\b/gi, "midday feast"], [/\bcoffee\b/gi, "bean broth"], [/\btomorrow\b/gi, "on the morrow"], [/\btonight\b/gi, "this eve"], [/\btoday\b/gi, "this day"],
    [/\b(okay|ok)\b/gi, "so be it"], [/\bdeadline\b/gi, "reckoning"], [/\bclients\b/gi, "patrons"], [/\bclient\b/gi, "patron"], [/\boffice\b/gi, "keep"], [/\bweekend\b/gi, "days of rest"], [/\bbirthday\b/gi, "name day"], [/\bphotos\b/gi, "portraits"],
    [/\bphoto\b/gi, "portrait"], [/\bvideos\b/gi, "moving portraits"], [/\bvideo\b/gi, "moving portrait"], [/\bawesome\b/gi, "most wondrous"], [/\bcool\b/gi, "most fine"], [/\bguys\b/gi, "good gentles"], [/\bfriends\b/gi, "companions"], [/\bmonday\b/gi, "Moonday"],
    [/\bfriday\b/gi, "Freyasday"], [/\bdog\b/gi, "hound"], [/\bdogs\b/gi, "hounds"], [/\bcar\b/gi, "carriage"], [/\bcars\b/gi, "carriages"], [/\bphone\b/gi, "speaking shell"], [/\bwebsite\b/gi, "public scroll"], [/\bpizza\b/gi, "flatbread of the south"]];
  const keepCase = (src, rep) => src[0] === src[0].toUpperCase() && src[0] !== src[0].toLowerCase() ? rep[0].toUpperCase() + rep.slice(1) : rep;
  function archaic(text) { let s = String(text || "").replace(/https?:\/\/\S+/g, "a link").replace(/:[a-z0-9_+-]+:/gi, ""); for (const [re, rep] of ARCH) s = s.replace(re, m => keepCase(m, rep)); return s.replace(/\s+/g, " ").trim(); }
  const NEWS_LEAD = ["From the hall of {channel}, {name} doth proclaim:", "In {channel}, {name} hath written upon the scroll:", "Word from the hall of {channel}. {name} saith:", "Hark! In {channel}, {name} hath declared:",
    "A missive from {channel}, penned by {name}:", "{name}, of the hall of {channel}, wishes it known:", "The ravens bring word from {channel}. {name} writes:"];
  const NEWS_REACT = ["Huzzah.", "So it is written.", "The herald hath no further comment.", "Make of that what thou wilt.", "Noted, and nailed to the church door.", "A bold proclamation.", "Verily.", "The herald nods, gravely."];
  const NEWS_IMAGE = ["And with it, {athing}. The herald hath looked upon it, and it is good.", "Attached: {athing}. The herald cannot describe it, for he is but a voice.", "There is also {athing}. The realm is invited to gaze upon it."];
  function news(items, sayName) {
    const out = [], said = n => (sayName ? sayName(n) : n && n.first) || "a stranger"; let words = 0;
    for (const x of items || []) {
      if (!x || !x.who || typeof x.channel !== "string" || (!x.text && !x.image && !x.video)) continue;
      const ch = x.channel.replace(/[-_.]/g, " "), ini = x.who.initial ? ` ${x.who.initial}.` : "", lead = pick(NEWS_LEAD);
      let say = x.text ? archaic(x.text) : "", show = say;
      for (const n of x.names || []) { if (!n || typeof n.first !== "string") continue; const sp = said(n); if (sp !== n.first) say = say.replace(new RegExp(`(?<![\\p{L}])${n.first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "gu"), sp); }
      if (say) out.push(["herald", { say: `${fill(lead, { channel: ch, name: said(x.who) + ini })} ${say}`, show: `${fill(lead, { channel: "#" + x.channel, name: x.who.first + ini })} ${show}` }]);
      const n = (x.image || 0) + (x.video || 0); if (n) { const vid = !x.image && x.video, things = vid ? (n > 1 ? "moving portraits" : "moving portrait") : (n > 1 ? "portraits" : "portrait"), num = ["", "a", "two", "three", "four", "five"][n] || String(n);
        out.push(["herald", fill(pick(NEWS_IMAGE), { athing: `${num} ${things}` })]); }
      if (R() < .35) out.push(["herald", pick(NEWS_REACT)]);
      words += (say.split(/\s+/).length) + 8; if (words > 220) break;
    }
    return out.length ? out : null;
  }
  // without Slack (a plain browser page), or when it's quiet: proclamations from around the realm
  const PROC = {
    who: ["the King", "the Queen", "the Duke of Vexmoor", "the Guild of Candlemakers", "the Abbot of Saint Hilda's", "the Wizards' Council", "the Lord Mayor of Pellingham", "the Ministry of Moats", "the Royal Beekeeper", "the Orc Chieftain Gorbash", "the Goblin Workers' Union", "the Elven Embassy"],
    verb: ["hath decreed", "hath announced", "doth wish it known", "hath declared, at length,", "hath proclaimed, from a balcony,", "hath let slip at supper"],
    what: ["that Tuesday shall henceforth be called Second Monday", "that all dragons must now wear a small bell", "that the moat is closed for cleaning, and that the eels have been told", "that turnips are once again legal tender",
      "that the royal portrait painter hath been dismissed for painting the King with a beard he does not have", "that the bridge troll may now accept coin in lieu of riddles", "that a festival shall be held, the purpose of which is yet to be determined",
      "that the plague of frogs was, in fact, a frog convention, and all is forgiven", "that knights must now signal before charging", "that the tower in the north is not haunted, it simply makes noises", "that the price of grog shall rise by one copper, due to the war",
      "that the war is over, and that nobody remembers who won", "that the castle cat hath been made a baron", "that all wizards must register their beards", "that the forest is open again, except for the parts that bite", "that goblins may now vote, but only for other goblins"],
    weather: ["The weather this day: cloudy, with a chance of omens.", "Weather: fair in the valley, ominous in the mountains, and raining fish over Mudford again.", "The almanac predicts sun, then dragons, then sun.", "The royal soothsayer predicts weather. He would not say which."],
  };
  function proclamations() { const L = []; const whos = shuf(PROC.who); for (let i = 0; i < ri(3, 4); i++) { L.push(["herald", `${whos[i][0].toUpperCase() + whos[i].slice(1)} ${pick(PROC.verb)} ${deal("procwhat", PROC.what)}.`]); if (R() < .4) L.push(["herald", pick(NEWS_REACT)]); } L.push(["herald", pick(PROC.weather)]); return L; }
  const heraldOpen = () => deal("ho", FAIRE_IDS.herald), heraldClose = () => deal("hc", FAIRE_IDS.heraldClose);

  /* ---------- ads ---------- */
  const AD_INTRO = ["And now, a word from our patrons.", "Hear Ye is brought to thee by the following merchants, who paid in coin and in cheese.", "A message from our sponsors. The crier is contractually obligated.", "We pause for commerce."];
  const AD_FORM = [
    p => [["v1", `Tired of the same old ${p.product.toLowerCase()}? Try the ${p.product}, from ${p.maker}.`], ["v1", p.claim], ["v2", `Side effects may include ${p.side}.`], ["v1", `Only ${p.price}. ${p.slogan}`]],
    p => [["v1", `${p.maker} presents: the ${p.product}.`], ["v2", "Does it work?"], ["v1", p.claim], ["v2", `And the side effects?`], ["v1", `Some ${p.side}. Nothing serious. ${p.price}.`], ["v1", `${p.maker}. ${p.slogan}`]],
    p => [["v2", `I used to have a problem. Then I bought the ${p.product}.`], ["v2", `Now I have ${p.side}. But I don't have the problem.`], ["v1", `${p.claim} The ${p.product}. ${p.price}, at ${p.maker}.`], ["v1", p.slogan]],
    p => [["v1", `Attention, peasants and nobles alike.`], ["v1", `The ${p.product} is here, and ${p.maker} would like a word.`], ["v1", p.claim], ["v1", `Ask thy apothecary if the ${p.product} is right for thee. Do not ask him about ${p.side}. He does not like to talk about it.`], ["v1", `${p.price}. ${p.slogan}`]],
  ];
  const ADV = [{ accent: "american", pitch: .96, rate: 1.06 }, { accent: "british", pitch: 1.04, rate: 1.02 }, { accent: "irish", pitch: 1.05, rate: 1 }, { accent: "australian", pitch: .95, rate: 1.04 }, { accent: "scottish", pitch: 1.02, rate: 1 }, { accent: "southafrican", pitch: 1.04, rate: 1 }];
  function ad() {
    if (R() < .3) { const P2 = FAIRE_AD_PARTS, p = { product: deal("adprod", P2.product), maker: pick(P2.maker), claim: deal("adclaim", P2.claim), side: deal("adside", P2.side), price: pick(P2.price), slogan: deal("adslog", P2.slogan) };
      const vs = shuf(ADV); return { title: `${p.maker}: ${p.product}`, cast: { v1: { name: "Announcer", ...vs[0] }, v2: { name: "Customer", ...vs[1] } }, lines: pick(AD_FORM)(p) }; }
    const a = deal("ads", FAIRE_ADS); return { title: a.title, cast: a.cast, lines: a.lines.map(l => [...l]) };
  }
  const adIntro = () => pick(AD_INTRO);

  /* ---------- call-ins to the bard ---------- */
  const CALL_OPEN = ["The speaking shells are open. Caller, thou art on Hear Ye.", "We have a caller. Go ahead, friend. The whole realm is listening.", "Another soul on the line. Speak, good caller.", "The bard is taking calls. Mostly because the lute needs tuning. Thou art on the air."];
  const CALL_REPLY2 = ["Then I have no more advice. Only a song. Thou shalt hear it next.", "Hmm. Then perhaps the answer was within thee all along. Or in thy neighbor's tower.", "Fair. Very fair. I withdraw everything I said.", "That is beyond the bard's skills. Try a wizard. Not a cheap one."];
  const CALL_END = ["Fare thee well, caller.", "And they are gone. Like a leaf on the wind.", "Click. The bard is alone again.", "Bless that caller. And bless their cart."];
  function caller() {
    const C = FAIRE_CALLERS, acc = pick(["american", "british", "australian", "irish", "scottish", "indian", "southafrican"]);
    const L = [["bard", pick(CALL_OPEN)], ["ph_caller", deal("copen", C.open)], ["ph_caller", deal("cgripe", C.gripe)], ["bard", deal("creply", C.reply)]];
    if (R() < .7) L.push(["ph_caller", deal("cfollow", C.followup)], ["bard", pick(CALL_REPLY2)]);
    L.push(["ph_caller", deal("cbye", C.bye)], ["bard", pick(CALL_END)]);
    return { kind: "caller", show: "Call-in", title: "A caller", cast: { ph_caller: { name: "Caller", accent: acc, pitch: .9 + R() * .22, rate: .95 + R() * .1 } }, lines: L };
  }

  /* ---------- the music: made-up players and pieces ---------- */
  function artist() { const A = FAIRE_ARTISTS, r = R(); if (r < .5) return `${pick(A.first)} ${pick(A.last)}`; if (r < .7) return `${pick(A.first)} of ${pick(["Thornbury", "the Hollow", "Greywater", "the Marsh", "Highgarden", "the North Tower", "Pellingham", "the Old Mill"])}`; return pick(A.ensemble); }
  function piece() { for (let i = 0; i < 8; i++) { const r = R(), a = pick(FAIRE_PIECE.a), b = pick(FAIRE_PIECE.b), t = r < .55 ? `The ${a} ${b}` : r < .8 ? `${b} of the ${a} ${pick(["Hart", "Tower", "Moon", "Queen", "Road", "Glade", "Shield", "Bell"])}` : `${a} ${b}`;
      const w = t.toLowerCase().split(/\s+/).filter(x => x !== "the" && x !== "of"); if (new Set(w).size === w.length) return t; } return `The ${pick(FAIRE_PIECE.a)} Galliard`; }

  return { shows: SHOWS.map(s => ({ id: s.id, name: s.name, label: s.label || s.name, style: s.style, episodes: s.episodes.length })), HOSTS,
    show, joust, ponies, news, proclamations, heraldOpen, heraldClose, ad, adIntro, caller, ids, bardIntro, bardBack, bridge, artist, piece, archaic };
}
