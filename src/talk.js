/* PTLK 108.0: 100% procedural talk radio. Every episode is written the moment it airs from plot grammars: each show
   picks a format (several per show, never the same one twice in a row), its cast, places and props, then runs a
   beginning, a middle that escalates and an ending, so it hangs together, and the slots are wide enough that no two
   episodes come out the same. Some shows read live headlines or encyclopedia summaries when the app provides them
   (opts.headlines); without them they write their own.
   Lines: [who, text] spoken; ["sfx", cue] a sound effect; ["music", "theme"|"sting"|"outro"] the show's own music
   (src/engine.js plays it in the show's style); ["seg"] a segment break, where the engine plays a stinger.
   Rules (same as MDFM 99.9): real headlines are read straight first; the jokes are about the situation and the words,
   never claims about real named people or invented facts about real companies. Nobody's accent marks a villain.
   Voices: clear, everyday voices for everyone; novelty voices (the forklift's beeps) only where the joke is the voice. */
function createTalk(R) {
  const pick = a => a[Math.floor(R() * a.length)], rr = (a, b) => a + R() * (b - a), ri = (a, b) => Math.floor(rr(a, b + 1));
  const chance = p => R() < p;
  // [a|b|c] picks one (nested ok), {name} fills from vars (a function is called each time)
  function X(s, v) {
    let out = String(s), g = 0;
    while (/\[[^\[\]]*\]/.test(out) && g++ < 400) out = out.replace(/\[([^\[\]]*)\]/g, (m, a) => pick(a.split("|")));
    return out.replace(/\{(\w+)\}/g, (m, k) => v && v[k] != null ? String(typeof v[k] === "function" ? v[k]() : v[k]) : m);
  }
  const deck = a => { let bag = []; return () => { if (!bag.length) bag = a.slice().sort(() => R() - .5); return bag.pop(); }; };   // no repeats until the list runs out
  // a show's format: never the same one twice in a row
  const format = (st, names) => { const c = names.filter(n => n !== st.fmt); const f = pick(c.length ? c : names); st.fmt = f; return f; };
  const SEG = ["seg"];
  const FIRST = ["Darlene", "Ray", "Tammy", "Lyle", "Marcy", "Dwayne", "Pam", "Gus", "Rhonda", "Earl", "Bev", "Chuck", "Wendy", "Nate", "Trish", "Hal", "Joelle", "Vince", "Shirley", "Todd",
    "Gloria", "Mitch", "Opal", "Rusty", "Nadine", "Burt", "Lorraine", "Kip", "Deb", "Walt", "Priya", "Marco", "Yvonne", "Desmond", "Ingrid", "Abe", "Rosalind", "Felix", "Connie", "Omar"];
  const LAST = ["Pickering", "Lumm", "Hargrove", "Bixby", "Duquette", "Fenstermacher", "Kowalczyk", "Plover", "Truax", "Quimby", "Stroud", "Ogletree", "Wendt", "Szabo", "Pruitt", "Vandermeer",
    "Hollis", "Crabtree", "Yancey", "Lindahl", "Okonkwo", "Barrowman", "Delacorte", "Finchley", "Gorski", "Huxtaple", "Ibarra", "Jaskowiak"];
  const TOWNS = ["Lower Fenwick", "East Ploverton", "Gravel Springs", "North Muddle", "Pinecrest Junction", "Old Sudbury Flats", "Lake Wendle", "Cobbleton", "Port Hargrove", "Saint Mildred",
    "Upper Dimsdale", "Brisket Falls", "New Cardigan", "Willow Bend", "Fort Noodle"];
  const STREET = ["Maple", "Larkspur", "Old Mill", "Gristle", "Plover", "Badger Hollow", "Sunnyvale", "Quarry", "Juniper", "Lantern", "Cobbler", "Thistle", "Wobble Creek", "Pheasant Run"];
  const STREET_T = ["Lane", "Court", "Drive", "Way", "Circle", "Terrace", "Place"];
  const fullName = () => `${pick(FIRST)} ${pick(LAST)}`;
  const first = n => n.split(" ")[0];
  // Clear, everyday voices only. Pitch and speed stay close to natural so every caller is easy to follow.
  const CALLER_ACCENTS = ["american", "american", "american", "american", "british", "australian", "irish", "indian", "southafrican"];
  const callerVoice = (name) => ({ name, accent: pick(CALLER_ACCENTS), pitch: rr(.94, 1.08), rate: rr(.96, 1.05) });
  const clock = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const n2w = n => ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"][n] || String(n);
  const cap = s => s[0].toUpperCase() + s.slice(1);

  /* ---------- Station imaging ---------- */
  const IDS = ["P T L K, one oh eight point oh. All talk. No exceptions.",
    "You're listening to P T L K. Talk radio, made fresh, every single time.",
    "P T L K, one oh eight. Nobody here has read the script, because there isn't one.",
    "One oh eight point oh, P T L K. The top of the dial, and everything that fell off it.",
    "This is P T L K. Every show you hear has never been heard before. Including this sentence.",
    "P T L K one oh eight. Opinions, callers, committees and one wizard.",
    "P T L K. Live, local, and frankly a little loud.",
    "One oh eight, P T L K. If it can be talked about, we're already talking.",
    () => `It's ${clock()} at P T L K, one oh eight point oh. Somebody here is about to say something.`,
    () => `${clock()}. You're on P T L K. Stay right there.`];
  const idDeck = deck(IDS);
  const id = () => { const x = idDeck(); return typeof x === "function" ? x() : x; };
  const INTRO = ["Now on P T L K:", "Right now on P T L K:", "This is P T L K, and this is", "On the air at one oh eight:", "P T L K presents", "Up now:", "You're tuned to P T L K. Here's"];
  const introDeck = deck(INTRO), tagDecks = {};
  // The announcer names the show, and only sometimes adds a line about it: never the same line twice running.
  const next = (show) => { const t = tagDecks[show.id] || (tagDecks[show.id] = deck(show.tags));
    return `${introDeck()} ${show.name}.${chance(.55) ? " " + t() : ""}`; };

  /* ---------- Shared bits for headline shows ---------- */
  const clean = t => String(t || "").replace(/\s+/g, " ").replace(/\s*[-|–—]\s*[^-|–—]{2,40}$/, "").trim();   // drop " - Site Name" tails
  const keyword = (title, words) => { const low = " " + String(title).toLowerCase().replace(/[^a-z0-9 ]/g, " ") + " "; for (const w of Object.keys(words)) if (low.includes(" " + w + " ") || low.includes(" " + w + "s ")) return w; return null; };
  const ordinal = (i, n) => i === 0 ? "First" : i === n - 1 ? "Last" : pick(["Next", "Next up", "Moving on"]);

  /* ===================== 1. Clap Attack with Doug ===================== */
  const DOUG_FEATURE = ["a koi pond with one koi named Gary", "a sunroom that is mostly a moonroom", "a three-car garage for a two-car family", "a basement that's technically a cave",
    "an original nineteen seventy-four conversation pit", "a walk-in closet you can also drive into", "a kitchen island with its own zip code", "heated floors in exactly one hallway",
    "a laundry chute that goes to the neighbors'", "a wine cellar currently holding one box of wine", "a bonus room that's mostly bonus, very little room", "a porch swing with a past",
    "a home gym, which is a treadmill wearing a coat", "two staircases that never meet", "a mudroom with actual mud, included", "a backyard with a view of a nicer backyard"];
  const DOUG_FLAW = [["the stairs", "the stairs go nowhere, which I'm calling a feature"], ["the attic", "the previous owner still lives in the attic, month to month"],
    ["the door", "the front door opens onto the back yard"], ["the smell", "there's a smell, and the smell has a name, and the name is Glen"],
    ["the goose", "the HOA requires you to own exactly one decorative goose"], ["the garage", "the garage door only opens for compliments"],
    ["the property line", "the property line runs through the middle of the bathroom"], ["the switches", "every light switch runs the garbage disposal"],
    ["the planes", "it's under a very confident flight path"], ["the fireplace", "the fireplace is painted on, beautifully"], ["the pool", "the pool is above ground and also above the garage"]];
  const DOUG_WANT = ["I'm looking to buy my first home", "I'm selling my mother's condo, she's moving in with me, please hurry", "I want to downsize from a houseboat", "I need room for my eleven ferrets",
    "I want a yard, but I don't want to look at it", "my husband needs a man cave, and I need it far away from me", "I'm a first-time buyer, second-time crier", "I need something near a good school, for me, I'm going back",
    "I need a house with a door that locks from the outside, for my teenagers", "I want a fixer-upper, but I don't want to fix it or up it"];
  const DOUG_OBJ = ["Is that the house with {flawshort}?", "What about {flawshort}?", "My cousin says {town} is haunted.", "Is {price} firm? Or is it, like, a suggestion?", "Can I see it first?"];
  const DOUG_REBUT = ["Objection noted. Objection clapped.", "You don't see a house, you see a future. With a smell. A future smell.", "Everything's negotiable except my commission and my mother.",
    "Firm? It's a house. It's very firm. It's made of house.", "You can see it after you buy it. That's called commitment.", "Every house is haunted if you believe in yourself."];
  const TRENT_DID = ["staged the Hendricks house with his own laundry", "put his face on a bus bench, upside down, so now he looks like he's falling", "told a buyer the radon was just ambiance",
    "lost the lockbox, then the lockbox key, then the car the lockbox was in", "listed our office as a three-bedroom and got four offers", "sent a closing gift basket that was mostly ketchup packets",
    "showed a house to a family of five while the family of four that lives there was eating dinner", "got the sign out front to say SOLB"];
  const TRENT_SAY = ["In my defense, it was a soft launch.", "I was told it was a team-building exercise.", "The client said go big, Doug.", "Aunt Barb, you said I could use my judgment.",
    "It's called disruption, Doug. Look it up. Don't look it up.", "I'm learning, Doug. Out loud. On purpose."];
  const SHEILA = ["Sheila Vance put a bus bench directly in front of my bus bench.", "Sheila Vance hired a skywriter. It wrote SHEILA. Then SOLD. Then it ran out of sky.",
    "Sheila Vance bought the billboard behind my billboard, so mine looks like it's wearing a hat.", "Sheila Vance is mailing people cookies. Homemade. By her mother. That's a family business. That's my move.",
    "Sheila Vance got a jingle. A jingle, Ma!", "Sheila Vance's flyer has a coupon. You can't coupon a house, Sheila.", "Sheila Vance is doing open houses with a string quartet. Four guys. Strings. In my market.",
    "Sheila Vance renamed her company Crestmark Homes and Also Doug Is Bad. That's defamation, and also very long."];
  const DOUG_OPEN = ["[This is|You're listening to|Welcome back to|Live and under contract, it's] Clap Attack. I'm Doug. [I don't do small talk. I do square footage.|My mother's here, my cousin's here, and my patience is not.|Let's sell some dirt.|If you're calling to be friends, hang up.|Phones are hot and so is the market.]"];
  const DOUG_CLOSE = ["[Another deal closed, another friendship declined.|That's the show. I didn't make a single friend, and I sold a house.|Ma, wave goodbye. She's waving. Nobody can see it.|Buy a house. Not from Sheila.] This has been Clap Attack."];
  const mkHouse = () => ({ num: ri(12, 9890), street: pick(STREET), st: pick(STREET_T), town: pick(TOWNS), beds: ri(2, 6),
    price: `${pick(["two", "three", "four", "five", "six", "seven", "eight"])} hundred ${pick(["forty", "ninety", "twenty five", "seventy five", "sixty"])} thousand` });
  function doug(st) {
    st.sheila = (st.sheila || 0) + 1;
    const fmt = format(st, ["listing", "openhouse", "family", "lightning"]);
    const house = mkHouse(), f = deck(DOUG_FEATURE), fl = pick(DOUG_FLAW), c1 = fullName(), c2 = fullName(), c3 = fullName();
    const v = { ...house, feature: f(), feature2: f(), feature3: f(), flawshort: fl[0], flaw: fl[1], c1: first(c1), c2: first(c2), c3: first(c3) };
    const sheila = SHEILA[(st.sheila - 1) % SHEILA.length];
    const L = [["doug", X(pick(DOUG_OPEN), v)], ["sfx", "claps"]];
    let title;
    if (fmt === "listing") {
      title = X("[{num} {street} {st}|The {flawshort} situation|Listing of the Hour]", v);
      L.push(["doug", X("Listing of the hour. {num} {street} {st}, in {town}. {beds} bedrooms, {feature}, and {feature2}. Asking {price}.", v)],
        ["barb", X("Tell them about {flawshort}, Douglas.", v)],
        ["doug", X("Ma, I'm getting to it. [Small thing|Tiny detail|Minor footnote]: {flaw}. [Some people call that a flaw. I call it a conversation.|That's not a problem. That's character.|Disclose, disclose, disclose. Done. Moving on.]", v)],
        SEG, ["doug", "Phones are open. Caller, you're under contract with Clap Attack."],
        ["c1", X(`Hi Doug, it's {c1} from {town}. [${DOUG_WANT.join("|")}].`, v)],
        ["doug", X("{c1}. {c1}. You know what has room for that? {num} {street} {st}.", v)],
        ["c1", X(pick(DOUG_OBJ), v)], ["doug", pick(DOUG_REBUT)], ["sfx", "claps"],
        ["c1", X("[Okay. I think I'm in?|Wait, did I just buy a house?|I'll have to ask my ferrets.|Fine. But I'm naming the smell.]", v)],
        ["doug", "That's a verbal yes on the radio, which in this state is basically ink."], SEG,
        ["barb", X(`Douglas, while we're live: your cousin Trent [${TRENT_DID.join("|")}].`, v)], ["doug", "Ma! On air!"], ["trent", pick(TRENT_SAY)],
        ["doug", "You can't fire family. I've tried. There's a form, and Ma hid the form."]);
      const twist = pick(["sheila", "owner", "callback"]);
      if (twist === "sheila") L.push(["doug", sheila], ["doug", "Next caller."], ["c2", "Hello, yes. I am a normal buyer. My name is, uh, Shmeila. I'd like to know your commission. For no reason."], ["doug", "Sheila?"], ["c2", "Who? I'm Shmeila. Bye."], ["doug", "She hung up. She's scared. Good."]);
      else if (twist === "owner") L.push(["doug", "Next caller."], ["c2", X("Doug, it's {c2}. I own {num} {street}. I forgot to mention [the house is also a church on Sundays|there's a second smell, and it's Glen's brother|the koi is the one who really owns it].", v)], ["doug", "Disclosed on air. Legally that's a gift."]);
      else L.push(["c1", X("Doug, it's {c1} again. I moved in during the break. I love {flawshort}.", v)], ["doug", "Fastest close in the history of this program."], ["barb", "That's not legal, Douglas."], ["doug", "It's family legal, Ma."]);
    } else if (fmt === "openhouse") {
      title = X("[Live from the Open House|Open House, Open Season|Cookies Are Store-Bought]", v);
      L.push(["doug", X("Clap Attack is live from an open house at {num} {street} {st}, in {town}. [The sign is up. The cookies are store-bought. Don't tell anyone.|I've been here since six. I've already sold the mailbox.|Trent made a playlist. It's one song.]", v)], ["sfx", "door"],
        ["doug", X("Room one. The kitchen. Look at that: {feature}.", v)],
        ["v1", X("[Is that a smell?|Why is the fridge warm?|What's that noise in the wall?]")], ["doug", X("[That's the smell of equity.|That's the house saying hello.|Character. You're hearing character.]")],
        SEG, ["doug", X("Room two. Here we have {feature2}.", v)], ["trent", "I staged this one myself."],
        ["doug", X("He staged it with [a beanbag and a poster of a boat|one chair, facing the wall|his own furniture, which he's still sitting on].", v)],
        ["ph_barb", "Douglas, it's your mother. I'm across the street. Sheila Vance is having an open house too."], ["doug", "Of course she is. What's she got?"],
        ["ph_barb", X("[A balloon arch.|A petting zoo. It's two goats and a confused llama.|A string quartet, and a man handing out lemonade.]")], ["doug", "In this economy. Ma, take the tray of cookies over there and stare at her."],
        SEG, ["v2", X("I heard {flaw}. Is that true?", v)], ["doug", X("[Is it true? It's disclosed. That's even better than true.|It's true. It's beautiful. It's yours for {price}.]", v)],
        ["v2", X("[I'll offer two hundred dollars and this sandwich.|Do you take trades? I have a boat. It's a canoe.|My wife loves it. I'm scared. Let's do it.]")], ["doug", "SOLD."], ["sfx", "claps"]);
    } else if (fmt === "family") {
      title = X("[The Family Meeting|Trent's Performance Review|Agenda Item: Sheila]", v);
      L.push(["barb", "This is the Clap Attack family meeting. I'm chairing. Douglas, sit down."], ["doug", "I am sitting, Ma. I'm sitting aggressively."],
        ["barb", X(`Item one. Trent's performance review. This quarter, Trent [${TRENT_DID.join("|")}].`, v)], ["trent", pick(TRENT_SAY)],
        ["doug", "Score: one out of five houses. And the one is the house he lives in."], ["trent", "I sold myself on it, Doug."],
        SEG, ["barb", "Item two. A listener has a question."],
        ["c1", X(`Hi, it's {c1}. [${DOUG_WANT.join("|")}], and I can pay about forty dollars.`, v)],
        ["doug", X("{c1}, I respect a lowball. I have a garage in {town} with {feature}. It's not a house. It's a vibe.", v)], ["c1", "I'll take the vibe."], ["sfx", "claps"],
        SEG, ["barb", "Item three. Sheila."], ["doug", sheila], ["barb", "She sent me a fruit basket, Douglas."], ["doug", "Ma. Ma. Did you eat it?"], ["barb", "The pears were lovely."],
        ["barb", X("Motion to [keep Trent|give Trent a smaller desk|let Trent run the website, which is a mistake]. All in favor?", v)], ["doug", "You can't fire family. The motion carries itself."]);
    } else {
      title = X("[The Lightning Round|Three Callers, Three Houses|Clap Clap Clap]", v);
      L.push(["doug", "It's the lightning round. You tell me what you want, I tell you what you're buying. No thinking. Thinking costs extra."]);
      [[c1, "c1"], [c2, "c2"], [c3, "c3"]].forEach(([c, k], i) => {
        const h = mkHouse(), want = pick(DOUG_WANT), feat = f();
        L.push(["doug", i ? "Next." : "Go."], [k, `It's ${first(c)}. ${cap(want)}.`],
          ["doug", X(`{num} {street} {st}, ${h.town}. It has ${feat}. [Sold.|Done.|It's yours. Congratulations, I think.]`, h)], ["sfx", "claps"]);
        if (i === 1) L.push(SEG, ["barb", "Douglas, slow down, you sold one to your dentist."], ["doug", "He needed it, Ma. He just didn't know."]);
      });
      L.push(SEG, ["doug", sheila], ["trent", "Should I get us a jingle, Doug?"], ["doug", "No jingles. We have the clap. The clap is our jingle."], ["sfx", "claps"]);
    }
    L.push(["doug", X(pick(DOUG_CLOSE), v)], ["sfx", "claps"]);
    return { title, lines: L, hosts: "Doug, Barb and Trent",
      cast: { doug: { name: "Doug", accent: "american", pitch: .95, rate: 1.06 }, barb: { name: "Barb", accent: "american", pitch: 1.08, rate: .97 }, trent: { name: "Trent", accent: "american", pitch: 1.04, rate: 1.03 },
        ph_barb: { name: "Barb, on the phone", accent: "american", pitch: 1.08, rate: .97 },
        c1: callerVoice(c1), c2: callerVoice(c2), c3: callerVoice(c3), v1: callerVoice("A visitor"), v2: callerVoice("Another visitor") } };
  }

  /* ===================== 2. Analyze Biz ===================== */
  const BIZ_WORDS = {
    merger: ["A merger. That's when two companies hold hands in the parking lot, and then one of them gets the car.", "Mergers are like weddings, but the cake is lawyers."],
    acquisition: ["An acquisition. That's a merger where one side didn't get a vote.", "Acquisition. Sounds like a craft store. A very expensive craft store."],
    earnings: ["Earnings. Like earrings, but for a company's ears. Companies have ears now, Squirky. They're listening.", "Earnings season. Like flu season, but with more charts."],
    profit: ["Profit. That's the money left after you stop counting the snacks.", "Profit's up. Somewhere, a guy in a vest is doing a little dance."],
    revenue: ["Revenue. That's French for money that might be leaving.", "Revenue's like profit's cousin who visits but never helps with the dishes."],
    layoff: ["Layoffs are no joke, so instead I'm going to make fun of the word synergy, which has never once helped anyone.", "Rough day for the folks there. We're sending good thoughts and zero buzzwords."],
    job: ["Jobs. Everybody wants one, nobody wants a meeting about it.", "Jobs news. Good luck out there, everybody. Update the resume. Remove the part about juggling."],
    rate: ["Rates are up. Rates of what? Nobody ever says. Just rates. Vibes, probably.", "Rates. I had a rate once. It was a pigeon. It flew off."],
    inflation: ["Inflation. When the price goes up and the bag gets more air.", "Inflation. My sandwich is the same size, it just costs more and looks at me differently."],
    tariff: ["Tariffs. I always thought that was a kind of pastry.", "Tariff. Sounds like a sneeze in a board meeting."],
    stock: ["Stocks. You buy a tiny piece of a company and then you worry about it forever, like a houseplant.", "The stock moved. Where to? It doesn't say. It just moved."],
    share: ["Shares. Which is weird, because I've never seen a company share anything.", "Shares fell. Somebody catch them."],
    market: ["The market. Every time they say the market, I picture a guy yelling about tomatoes.", "The market reacted. Markets are emotional. They need a hug and a quarterly report."],
    startup: ["A startup. That's a company that's mostly a hoodie and a dream.", "Startup. Four people, one beanbag, nine slide decks."],
    bank: ["A bank. A building where your money goes to be somewhere else.", "Banks. I still don't trust the little pens on chains. What are they afraid of?"],
    oil: ["Oil. Is that the cooking kind? It's probably not the cooking kind.", "Oil prices. I'm going to assume this is about salad and nobody can stop me."],
    chip: ["Chips. Computer chips. I know. I KNOW. I'm still hungry.", "A chip shortage. Gregg, put the bag down."],
    deal: ["A deal. Everybody shook hands, and then nobody ever explained it to the public.", "Deal. That word is doing a lot of work in that headline."],
    price: ["Prices are changing. They're always changing. Prices never sit still. They're like toddlers.", "New prices. Same stuff. Fancier font."],
    union: ["Workers organizing. Look, if I had a union, I'd demand a better chair. This chair squeaks.", "A union. Good for them. Gregg, you're not allowed to start one in here."],
    loan: ["A loan. That's money that comes with a boomerang.", "Loans. Like borrowing a lawnmower, but the lawnmower charges interest."],
    sale: ["Sales. When I hear sales, I think of a big yellow sticker. They never mean the sticker.", "Sales are up. Somebody's buying a lot of something. Not me. I'm saving for chairs."],
    quarter: ["The quarter. Twenty five cents of business.", "Q three. Sounds like a droid. I'd watch that."],
    economy: ["The economy. It's like the weather, but you can't put on a sweater.", "Economists say a lot of things. Usually twice. Once up, once down."],
    housing: ["Housing. I know a guy named Doug who'd like a word.", "The housing market. A market where the tomatoes are houses."],
  };
  const BIZ_GENERIC = ["I read that three times and I still think it's about soup.", "That's a lot of words for: a company did a thing.", "Bold. Brave. I don't know what any of it means.",
    "Somewhere a press release is very proud of itself.", "I'm going to need a chart. And a nap. Chart first.", "That headline has the energy of a man in a lanyard."];
  const BIZ_ONEWORD = ["Yikes.", "Neat.", "Huh.", "Bold.", "Soup?", "Big if true. It is true. It's the news.", "Spicy.", "Ugh, numbers.", "Love that for them.", "Pass."];
  const BIZ_METRIC = ["vibes-to-earnings ratio", "snack budget", "number of times the press release says excited", "font size of the apology", "conference call hold music", "ratio of lanyards to people"];
  const BIZ_DEF = [["synergy", "when two people in a meeting both say yes at the same time"], ["liquidity", "how many drinks a company has on hand"], ["pivot", "when a company spins around in its chair and pretends that was the plan"],
    ["runway", "the amount of time before the startup has to get a real job"], ["headwinds", "when the economy is blowing in your face, like a big fan, but sad"], ["bandwidth", "how much nonsense you can hold before you need a nap"],
    ["deliverables", "things that were promised, and are now, technically, somewhere"], ["stakeholders", "people holding steaks, waiting for a decision"]];
  const PORTFOLIO = ["a jar of buttons I've been saving since nineteen ninety-eight", "a timeshare in a dream I keep having", "fourteen gift cards with about three dollars on each", "a very good stapler",
    "my cousin's food truck, which is currently a regular truck", "a garage full of exercise bikes I plan to sell, eventually, to exercisers", "one share of a company I picked because the logo is a duck"];
  const FAKECO = ["Blandwell Industries", "Quorvex Holdings", "NimbleCart", "Pantry Dynamics", "Gusto Freight", "Cloudish Incorporated", "Tendril Bancorp", "Moxie Mattress Company", "Brightfold Logistics",
    "Sprocket and Sons", "Lumen Lettuce", "Hollyhock Insurance", "Fizzwick Beverages", "Glimmer Optics", "Ploddington Rail"];
  const PRODUCT = ["smart toasters", "frozen waffles", "office chairs", "self-folding umbrellas", "artisanal ice", "cloud storage", "sleep apps", "decorative geese", "electric scooters", "spreadsheet software"];
  function fakeBizHeadline() {
    return X(`[{co} reports record quarter on strong {product} sales|{co} announces plan to merge with {co2}|{co} pivots to artificial intelligence for {product}|{co} delays launch of {product} line|{co} raises prices on {product}, citing [demand|costs|vibes]|{co} opens flagship store in {town}|{co} shares [rise|fall|wobble] after {product} recall|Startup {co} raises funding to reinvent {product}]`,
      { co: pick(FAKECO), co2: pick(FAKECO), product: pick(PRODUCT), town: pick(TOWNS) });
  }
  const headlineSet = (data, n, fake, fakeSrc) => {
    const live = (data && data.length ? data : []).map(h => ({ title: clean(h.title), source: h.source || "the wires" })).filter(h => h.title.length > 12 && h.title.length < 160), H = [];
    for (const h of live) { if (H.length >= n) break; if (!H.some(x => x.title === h.title)) H.push(h); }
    while (H.length < n) H.push({ title: fake(), source: fakeSrc ? pick(fakeSrc) : null, fake: true });
    return H;
  };
  const readHL = (h, lead) => `${lead}${h.fake ? "" : `, from ${h.source}`}: ${h.title}.`;
  const bizReact = (h, L) => {
    const k = keyword(h.title, BIZ_WORDS), mode = pick(["roast", "misread", "analysis"]);
    if (k && mode !== "analysis") L.push([mode === "misread" ? "gregg" : "sq", pick(BIZ_WORDS[k])], [mode === "misread" ? "sq" : "gregg", X("[That's not what it means.|Gregg, no.|I'm writing that down. As a warning.|Honestly, that's how I'll remember it now.|Sure.]")]);
    else if (mode === "analysis") L.push(["sq", X(`Looking at the fundamentals, the ${pick(BIZ_METRIC)} is [up|down|sideways|emotionally unavailable].`)], ["gregg", X("[So, buy?|So, panic?|So we're fine?|So it's a hold. Like a hug.]")], ["sq", X("[No.|Nobody knows. That's the beauty of markets.|We don't give advice. We give vibes.]")]);
    else L.push(["gregg", pick(BIZ_GENERIC)], ["sq", X("[Fair.|Same, Gregg.|I've been in business twenty years and same.]")]);
  };
  const gutCheck = () => [["gregg", X(`Gregg's Gut Check: I give this one ${n2w(ri(2, 11))} out of ten ${pick(["cantaloupes", "pears", "limes", "kumquats", "rotisserie chickens"])}.`)], ["sq", "The scale goes to ten, Gregg."], ["gregg", X("[Not in this economy.|The gut wants what it wants.|I've been told I have a very honest gut.]")]];
  function biz(st, data) {
    const fmt = format(st, ["rundown", "lightning", "callin", "debate"]), SRC = ["the Business Ledger", "The Morning Wrapper", "Market Mumble", "the newswire"];
    const L = [["sq", X("[Welcome to|It's time for|You found|Good morning, good afternoon, good whatever, it's] Analyze Biz. I'm Squirky Tallume.")],
      ["gregg", X("And I'm Gregg Ploptz. [Two g's at the end, because I'm a business.|I have an M B A. Mostly Being Around.|I wore a tie today. It's a clip-on, but it believes in itself.|My accountant says hi. My accountant is also me.]")]];
    let H, title;
    if (fmt === "rundown") {
      H = headlineSet(data, ri(3, 5), fakeBizHeadline, SRC); title = X(`[${n2w(H.length)} headlines, zero understanding|Market Moves, Badly|The Fundamentals, Loosely]`);
      L.push(["sq", X(`We've got ${n2w(H.length)} headlines. [We read the business news so you can misunderstand it faster.|Let's analyze them, loosely.|Gregg has prepared nothing.]`)]);
      H.forEach((h, i) => { L.push(["sq", readHL(h, `Headline ${n2w(i + 1)}`)]); bizReact(h, L); if (i === 1) L.push(SEG, ...gutCheck()); });
    } else if (fmt === "lightning") {
      H = headlineSet(data, ri(4, 6), fakeBizHeadline, SRC); title = X("[The Lightning Round|Fast Money, Slow Thinking|One Headline, One Word]");
      L.push(["sq", "It's the lightning round. I read a headline, Gregg gets one reaction. No thinking."], ["gregg", "I haven't thought since Tuesday. I'm ready."]);
      H.forEach((h, i) => { L.push(["sq", readHL(h, ordinal(i, H.length))]); L.push(["gregg", pick(BIZ_ONEWORD)]); });
      const d = pick(BIZ_DEF);
      L.push(SEG, ["sq", "And now, Gregg's Word of the Day."], ["gregg", `Today's word is ${d[0]}. ${cap(d[0])} is ${d[1]}.`], ["sq", X("[It is not.|That's not even close.|Somebody fact-check him. Not me. I'm tired.]")], ["gregg", "Use it in a sentence at work. Watch what happens."]);
    } else if (fmt === "callin") {
      H = headlineSet(data, 3, fakeBizHeadline, SRC); title = X("[Your Portfolio, Analyzed|Listener Investments|Please Don't Call Your Broker]");
      L.push(["sq", "Two headlines, then your calls. First up."]);
      H.slice(0, 2).forEach((h, i) => { L.push(["sq", readHL(h, i ? "And" : "Headline one")]); bizReact(h, L); });
      const c = fullName(), pf = pick(PORTFOLIO);
      L.push(SEG, ["sq", "Phones are open. Tell us about your portfolio."], ["c1", `Hi, it's ${first(c)}. My whole portfolio is ${pf}. Should I diversify?`],
        ["gregg", X("[Diversify? Get a second jar.|You're sitting on a gold mine. A gold mine of whatever that is.|I'd hold. Hold it tight. Hold it like a sandwich.]")],
        ["sq", X(`Looking at the fundamentals, your ${pick(BIZ_METRIC)} is [strong|confusing|frankly inspiring].`)], ...gutCheck(), ["c1", "This is the best advice I've ever gotten."], ["sq", "That's very sad. Thanks for calling."],
        SEG, ["sq", readHL(H[2], "One more headline")]);
      bizReact(H[2], L);
      L.push(["sq", "Reminder: we are not financial advisors. We are barely advisors."]);
    } else {
      H = headlineSet(data, 3, fakeBizHeadline, SRC); title = X("[Bull Versus Bear|The Great Debate|Squirky Says Up, Gregg Says Down]");
      L.push(["sq", "Today it's bull versus bear. I'm the bull. Gregg's the bear."], ["gregg", "I'm always the bear. I'm built like a bear. It's not a choice."]);
      H.forEach((h, i) => {
        L.push(["sq", readHL(h, ordinal(i, H.length))]);
        L.push(["sq", X("[Bullish. Very bullish. I can feel it in my shoes.|That's an opportunity wearing a disguise.|Up. Everything about that says up.]")],
          ["gregg", X("[Bearish. I feel it in my knees, and my knees are never wrong.|That's a trap. A trap with a press release.|Down. I'm saying down. I'm saying it with my whole chest.]")]);
        if (i === 1) L.push(SEG, ["sq", "Let's go to the judges."], ["gregg", "We don't have judges."], ["sq", "Then I win."]);
      });
      L.push(["gregg", X(`Which brings us to the Ploptz Index, which closes today at ${n2w(ri(2, 12))} ${pick(["cantaloupes", "lanyards", "rotisserie chickens", "very small boats"])}.`)], ["sq", "That's not a real index."], ["gregg", "It is now. I said it on the radio."]);
    }
    L.push(["sq", X("[That's Analyze Biz. Nothing on this show is financial advice.|That's our show. Please do not invest based on anything Gregg has ever said.|Analyze Biz is a production of two people near a microphone.]")],
      ["gregg", X("[If you made money listening to this, please tell us how.|Remember: buy low, sell high, and never let me near your money.|Ploptz out.]")]);
    return { title, lines: L, hosts: "Squirky Tallume and Gregg Ploptz", usedLive: H.some(h => !h.fake),
      cast: { sq: { name: "Squirky Tallume", accent: "american", pitch: 1.08, rate: 1.04 }, gregg: { name: "Gregg Ploptz", accent: "american", pitch: .92, rate: .98 }, c1: callerVoice("A caller") } };
  }

  /* ===================== 3. The Real USB Drives of Cleverly Spillz ===================== */
  const USB_CAST = [["Tiffani Glass-Wexler", "american", 1.08], ["Monique LaFortune", "american", 1.04], ["Brenda Kastle", "australian", 1.05], ["Dawn-Marie Pruitt", "american", 1.1],
    ["Sloane Avery-Huff", "british", 1.02], ["Kiki Delmonte", "american", 1.08], ["Priya Castellanos", "indian", 1.04], ["Gwen O'Hare", "irish", 1.06]];
  const USB_EVENT = ["{a}'s vow renewal at the aquarium", "a charity pickleball gala for retired horses", "{a}'s candle launch, Scent Number Four, which smells like a lawsuit",
    "a book club that has never discussed a book", "the grand opening of a smoothie bar called Juice Laundry", "{a}'s surprise party, which she planned herself", "a yacht brunch on a pontoon boat"];
  const USB_TRIP = ["a girls' trip to a wine country that is mostly one barn", "a wellness retreat where the wellness is a hot tub", "a ski weekend, though nobody skis", "a beach house rental with a strict no-sand policy"];
  const USB_FOUND = ["in her gift bag", "taped under a tray of tiny quiches", "inside a decorative pumpkin", "in the valet ticket envelope", "in the ice sculpture, somehow", "in her own purse, which is the scariest part"];
  const USB_FILE = ["FINAL final REAL final dot X L S X", "receipts, do not open, dot C S V", "friendship audit, Q three, dot P P T X", "who said what, dot doc", "lies, open paren two close paren, dot X L S X", "evidence, but cute, dot P D F"];
  const USB_CLAIM = ["{c} said {a}'s pasta salad was mostly mayo", "{c} billed the group trip as personal growth on her taxes", "{c} has been in a second, secret book club", "{c} told a waiter she was basically a doctor",
    "{c} ranked everyone's houses in a spreadsheet and gave {a}'s a six", "{c} re-gifted {b}'s birthday candle back to {b}", "{c} has been liking {d}'s ex's vacation photos, but only the boring ones"];
  const USB_FORGED = ["the file was created in nineteen seventy, by a user named Admin, on a computer called Kevin's Game Console", "every formula in the spreadsheet just says equals true",
    "the receipts are typed in a cartoon font, and one of them is a coupon for soup", "the spreadsheet was last edited in a paint program, which, for a spreadsheet, is a choice",
    "the drive holds four terabytes and the only thing on it is nine kilobytes of drama", "the photo of the evidence is a photo of a different USB drive", "the timestamps say every change happened at the same second, on a Tuesday that doesn't exist"];
  const USB_CONF = ["I'm not here to make enemies. I'm here to make content.", "I have never been more calm in my life. Look at my eyebrows. Calm.", "Do I trust her? I trust her like I trust a buffet. Cautiously, and with a plate ready.",
    "Some people bring a dish to a party. I bring receipts.", "I don't do drama. Drama does me.", "I read the file. I read it twice. I don't read things twice."];
  function usb(st) {
    st.ep = (st.ep || 0) + 1;
    const fmt = format(st, ["party", "reunion", "trip"]);
    const pool = USB_CAST.slice().sort(() => R() - .5).slice(0, 4), [A, B, C, D] = pool, sn = x => first(x[0]);
    const v = { a: sn(A), b: sn(B), c: sn(C), d: sn(D) };
    v.event = X(pick(USB_EVENT), v); v.trip = pick(USB_TRIP); v.found = pick(USB_FOUND); v.file = pick(USB_FILE); v.claim = X(pick(USB_CLAIM), v); v.forged = pick(USB_FORGED);
    const conf = deck(USB_CONF), season = st.ep > 1 ? "Season " + n2w(Math.min(12, 1 + Math.floor(st.ep / 6))) + ". " : "";
    const L = []; let title;
    const rodney = (onPhone) => [[onPhone ? "ph_rodney" : "rodney", X("Hi. I looked at the drive. A few things. First, {forged}. Second, [the drive is from a promotional giveaway for a dentist|the label on it says Property of Nobody|it was formatted with a potato, I think].", v)],
      [onPhone ? "ph_rodney" : "rodney", X("[The drama is real. The data has been forged.|Your feelings are valid. Your files are fake.|I'd trust the drama. I would not trust the drive.]")]];
    if (fmt === "party") {
      title = X("[The Drive at {e}|The {f} Incident|Spoon Gate|Forged in Friendship]", { e: v.event.split(",")[0], f: v.file.split(",")[0] });
      L.push(["nar", X(`[Tonight, on|This week on|Previously, and also now, on] The Real U S B Drives of Cleverly Spillz. ${season}`)],
        ["nar", X("At {event}, {b} finds a U S B drive {found}.", v)],
        ["b", X("Who leaves a U S B drive at {event}? A villain. Or a gift. Either way, I'm plugging it in.", v)],
        ["nar", X("The drive holds one file. {file}.", v)], ["b", X("Ladies. It says, and I quote, that {claim}.", v)],
        ["c", X("[That is a lie.|I would never.|Where did you even get a U S B drive?|That's not my handwriting. It's typed. Still not my handwriting.]")],
        ["a", X("[Is it true?|So it's true.|I KNEW it.|I have been eating that pasta salad for years, {c}.]", v)],
        SEG, ["nar", "Confessional."], [pick(["a", "b", "c", "d"]), conf()],
        ["d", X("[Can I say something?|I wasn't going to say anything, but|Okay, if we're doing this,] {c} also [borrowed my good serving spoon and returned a worse spoon|said my dog looks like a sad landlord|signed my birthday card with just a thumbs up].", v)],
        ["c", X("[That spoon was an upgrade.|Your dog does look like a landlord.|A thumbs up is a full sentence.]")],
        SEG, ["b", "We need to get to the bottom of this. I called someone."], ["nar", "She called Rodney, from the help kiosk at the mall."], ...rodney(false),
        ["a", X("[So who forged it?|So nobody said anything about my pasta salad?|Then why do I feel accused?]", v)],
        ["rodney", X("[Could be anyone. Could be a printer. Printers are bitter.|The metadata says the author is, quote, You Know Who.|Honestly? The drive might have done it itself. Some of them get ideas.]")],
        ["nar", "Confessional."], ["c", X("[I'm still upset, and I don't even know about what.|I'm choosing peace. I'm also choosing to never pass {b} the bread again.]", v)],
        ["nar", X("[Everyone agrees to forget it. Nobody forgets it.|They toast to friendship. Two of the glasses are empty, on purpose.|{b} keeps the drive. For safekeeping. And for leverage.]", v)]);
    } else if (fmt === "reunion") {
      title = X("[The Reunion, Part {n}|Reunion: Nobody Brought Snacks|The Couch Gets Tense]", { n: n2w(ri(1, 3)) });
      L.push(["host", X("Welcome to The Real U S B Drives of Cleverly Spillz reunion. [Four women, one couch, zero forgiveness.|I'm Clement, your host, and I'm already sweating.|Tonight, we finally talk about the drive.]")],
        ["host", X("{b}. Let's start with you. You plugged in a stranger's U S B drive at {event}. Do you regret it?", v)],
        ["b", X("[I regret nothing. I regret the pasta salad.|I'd do it again. I'd do it with two hands.|Clement, I have a lot of regrets. That's not one.]")],
        ["host", X("The file said {claim}. {c}, you've had a year to think about it.", v)], ["c", X("[And I've thought about it every day, Clement.|I've been to therapy. My therapist also thinks it's fake.|I brought a statement. It's on a different U S B drive.]")],
        SEG, ["host", "Let's look at the footage."], ["nar", X("Footage. {d} reaching for the good spoon. {a} saying the word lawsuit to a candle.", v)],
        ["d", "That footage is out of context."], ["host", "What's the context?"], ["d", "I wanted the spoon."],
        SEG, ["host", "We have someone on the line. Rodney, from the help kiosk, joining us by phone."], ...rodney(true),
        ["a", X("So we all fought for a year over a fake file?", v)], ["ph_rodney", "Yes. Respectfully. That's what friendship is."],
        ["host", "Final question. Ladies, are you still friends?"], [pick(["a", "b", "c", "d"]), conf()], ["nar", "They are. Mostly. The couch has never recovered."]);
    } else {
      title = X("[{t}|The Trip That Changed Nothing|Rental Drive]", { t: cap(v.trip.split(",")[0]) });
      L.push(["nar", X(`[This week|Tonight] on The Real U S B Drives of Cleverly Spillz: {trip}. ${season}`, v)],
        ["a", X("[I planned everything. Down to the minute. We are four minutes behind.|I made matching tracksuits. Nobody is wearing them.|This trip is about healing. And brunch.]")],
        ["nar", X("In the rental's welcome basket, {d} finds a U S B drive.", v)], ["d", "Should I plug it in?"], ["b", "We should absolutely plug it in. That's the whole show."],
        ["nar", X("One file. {file}. It says {claim}.", v)], ["c", X("[That's not even possible. I wasn't even there.|I'm going to go sit in the car.|Who wrote this? A ghost? A mean ghost?]")],
        SEG, ["nar", "Confessional."], [pick(["a", "b", "d"]), conf()], ["a", X("[Nobody ruins my itinerary.|We had a schedule.|There was a spa appointment. I will not be gaslit before a spa appointment.]")],
        SEG, ["b", "I called Rodney."], ["d", "From the mall? We're three hundred miles from the mall."], ["b", "He answers. He always answers."], ...rodney(true),
        ["ph_rodney", "Also, the drive belongs to the rental company. It's their guest survey. You failed it."],
        ["nar", X("[They leave a five-star review anyway. For the hot tub.|They drive home in silence, except for {b}, who hums the whole way.|They promise never to plug in a stranger's drive again. They will.]", v)]);
    }
    L.push(["nar", X("Next time, on The Real U S B Drives of Cleverly Spillz: {d} finds a second drive. [It's shaped like a lipstick. It is also a lipstick.|It has a password. The password is her own name.|It's in her soup.|It's labeled, simply, Season Finale.]", v)]);
    const cast = { nar: { name: "Narrator", accent: "american", pitch: .92, rate: .95 }, rodney: { name: "Rodney from the help kiosk", accent: "american", pitch: 1, rate: 1.02 },
      ph_rodney: { name: "Rodney, on the phone", accent: "american", pitch: 1, rate: 1.02 }, host: { name: "Clement, reunion host", accent: "british", pitch: 1, rate: 1 } };
    for (const [k, p] of [["a", A], ["b", B], ["c", C], ["d", D]]) cast[k] = { name: p[0], accent: p[1], pitch: p[2], rate: rr(1, 1.06) };
    return { title, lines: L, hosts: "the Real U S B Drives cast", cast };
  }

  /* ===================== 4. Button Mashers ===================== */
  const GAME_WORDS = {
    patch: [["sal", "A patch. Like for a jacket?"], ["kev", "Like for a pirate, Sal. One eye. Very cool."]],
    dlc: [["kev", "D L C. That's the deli lunch counter, right?"], ["sal", "Downloadable lunch counter. Finally, technology I can respect."]],
    console: [["sal", "Console. You console somebody when they lose. So the console's for losers. I'm just saying what it says."], ["kev", "That's wicked harsh, Sal."]],
    boss: [["kev", "A boss fight. I had a boss fight once. In a parking lot. Over a parking spot."], ["sal", "Who won?"], ["kev", "The parking spot, Sal. It's always the spot."]],
    speedrun: [["sal", "Speedrun. So, jogging. They're jogging in the game."], ["kev", "Faster than jogging, Sal. It's like the Pike at two A M."]],
    sequel: [["kev", "A sequel. That means the first one was good, or the first one made money. One of those."], ["sal", "Like a second lasagna."]],
    remaster: [["sal", "Remastered. They took the old game and put a new coat of paint on it. Like my uncle's Buick."], ["kev", "Your uncle's Buick is three colors, Sal."], ["sal", "And he loves every one of them."]],
    update: [["kev", "An update. I get those on my phone. I press later. Every time. For three years."], ["sal", "That's a lifestyle."]],
    delay: [["sal", "Delayed. Respect. Take your time. I'm not playing it anyway."], ["kev", "We're not playing any of them."]],
    trailer: [["kev", "A new trailer. I love trailers. Ninety seconds, lots of explosions, a guy whispers a word."], ["sal", "The trailer's the whole game for us, Kev."]],
    multiplayer: [["sal", "Multiplayer. So a lot of people are playing it together. Like a wedding."], ["kev", "With yelling. So exactly like a wedding."]],
    controller: [["kev", "A new controller. How many buttons?"], ["sal", "Too many, Kev. More buttons than my nonna's coat."]],
    server: [["sal", "The servers went down. Somebody tip the servers. They work hard."], ["kev", "Not those servers, Sal."], ["sal", "Every server deserves a tip, Kev."]],
    map: [["kev", "They revealed the map. It's very big."], ["sal", "Big map. I don't even know where I parked."]],
    mod: [["sal", "Mods. Fans changing the game. In Jersey we call that redoing the kitchen without a permit."], ["kev", "In Boston we call that a Tuesday."]],
    beta: [["kev", "A beta. That's a game that's almost done, like a sandwich with no bread."], ["sal", "That's a salad, Kev."], ["kev", "Then the beta is a salad."]],
    launch: [["sal", "It's launching. Like a rocket?"], ["kev", "Like a rocket you can't play, Sal, because we don't play."]],
    studio: [["kev", "The studio. That's where the games live, before they come out and we watch videos of them."], ["sal", "Like a zoo, but for nerds."]],
    movie: [["sal", "A movie about a video game. Finally, something we can watch without pretending."], ["kev", "We've been training our whole lives for this, Sal."]],
    horror: [["kev", "A horror game. I don't need a horror game. I've seen my electric bill."], ["sal", "In Jersey, the horror game is the turnpike at five."]],
    nintendo: [["sal", "Nintendo. That's the plumber guys. I respect a plumber."], ["kev", "Every plumber's a hero to me, Sal. Especially the one in my basement right now."]],
  };
  const GAME_TAN = [["Jersey has jughandles. You want to turn left, you turn right first. It's philosophy.", "Boston has rotaries. You go in, you never come out. Also philosophy."],
    ["Down the shore, the pizza's thin, it's foldable, it's perfect.", "And here the pizza's fine, but the argument about it is better."],
    ["Winter in Jersey, it's a little cold, little gray, very dramatic.", "Winter in Boston, the snow has a mortgage. It lives with you."],
    ["Water. Wood-er. That's how you say it.", "Wahtah. Two syllables. Both of them important."],
    ["In Jersey we pump your gas for you. It's a service. It's a lifestyle.", "In Boston we'd fight the guy pumping the gas. Out of respect."]];
  const GSTUDIO = ["Pixelforge", "Gamma Raccoon", "Lucky Spoon Studios", "Nine Volt Games", "Bramble and Byte", "Overcast Interactive", "Tin Can Telescope"];
  const gameTitle = () => X("[Crimson|Hollow|Neon|Galactic|Feral|Infinite|Turbo|Paper|Iron Lunch] [Quest|Protocol|Kingdom|Racer|Siege|Legacy|Odyssey|Garden|Parade]: [Reckoning|Origins|The Lost Sock|Remastered Remix|Tax Season|Snack Edition|Second Breakfast]");
  const fakeGameHeadline = () => X(`[{g} gets surprise patch that fixes the horses|{g} delayed to [spring|next year|the heat death of the universe]|{s} announces sequel to {g}|Speedrunner beats {g} in ${ri(4, 59)} minutes|{g} update adds [fishing|a dog you can pet|a second dog]|Open world map for {g} revealed to be very big|{s} launches new controller with ${ri(19, 41)} buttons|{g} beta servers buckle under demand]`, { g: gameTitle(), s: pick(GSTUDIO) });
  const RATING = () => X(`Rating: [${n2w(ri(2, 10))} quarters out of a roll|${n2w(ri(2, 5))} slices out of a pie|wicked good|fuhgeddaboudit, and I mean that nicely|two cannolis and a parking ticket].`);
  const gameReact = (h, L, i) => {
    const k = keyword(h.title, Object.fromEntries(Object.keys(GAME_WORDS).map(x => [x, 1])));
    if (k) L.push(...GAME_WORDS[k].map(x => [x[0], x[1]]));
    else L.push(["kev", X("[Wicked exciting.|I watched a video about that. Or a different thing. Same energy.|That sounds like a lot of buttons.]")], ["sal", X("[Do they eat in it? I need to know if there's food.|Is there a dog? I don't play games without a dog. I don't play games.|I'd play that. I won't. But I would.]")]);
    L.push([i % 2 ? "sal" : "kev", RATING()]);
  };
  function buttons(st, data) {
    const fmt = format(st, ["headlines", "boxart", "callin", "tournament"]);
    const L = [["sal", X("Ayy, it's Button Mashers. I'm Sal, from Jersey. [Exit [nine|eleven|fourteen|one forty], don't ask which way.|I've got a garage full of controllers, all still in the plastic.|My nephew set up this microphone. I don't trust it.]")],
      ["kev", X("And I'm Kev, from Boston. [We love video games.|We love games. From a respectful distance.|We know everything about games except how to play them.]")]];
    let H, title;
    if (fmt === "headlines") {
      H = headlineSet(data, ri(3, 4), fakeGameHeadline); title = X(`[Never Played It: ${n2w(H.length)} headlines|Press Start, Probably|Watching Is Basically Playing]`);
      L.push(["sal", "Love 'em. Never played one."], ["kev", X("Not once. [We watch the videos.|We read the headlines.|We've held a controller. It was in a box. At a store.] We have opinions.")]);
      H.forEach((h, i) => { L.push([i % 2 ? "kev" : "sal", readHL(h, `${ordinal(i, H.length)} headline`)]); gameReact(h, L, i); if (i === 1) { const t = pick(GAME_TAN); L.push(SEG, ["sal", t[0]], ["kev", t[1]], ["sal", "Anyway. Video games."]); } });
    } else if (fmt === "boxart") {
      H = headlineSet(data, 1, fakeGameHeadline); const g = gameTitle(); title = X(`[Box Art Review: ${g}|Judging a Game by Its Cover|We Read the Back of the Box]`);
      L.push(["sal", "Quick headline, then the main event."], ["kev", readHL(H[0], "Headline")]); gameReact(H[0], L, 0);
      L.push(SEG, ["sal", `Box Art Review. Today: ${g}. We have not played it. We have looked at the box. For a long time.`],
        ...pick([[["kev", "On the front, there's a guy with a sword, looking off to the side, like he heard his name."], ["sal", "That guy's got problems. I like him."]],
          [["kev", "The front is mostly a big explosion and one very calm horse."], ["sal", "That horse has seen things."]],
          [["kev", "There's a lady on the cover holding a giant wrench and a sandwich."], ["sal", "That's my kind of lunch."]],
          [["kev", "On the cover, a spaceship, flying away from us. Very rude."], ["sal", "Typical spaceship. Never says goodbye."]]]),
        ["kev", X("On the back it says, quote, [hundreds of hours of content|a living, breathing world|now with weather].")], ["sal", "Hundreds of hours. Kev, I don't have hundreds of hours. I have a lawn."],
        ["kev", "Rated T for Teen. I'm forty-six."], ["sal", "So we're over-qualified."], ["sal", RATING()], ["kev", "Agreed. Ten out of ten, based on the font."]);
    } else if (fmt === "callin") {
      H = headlineSet(data, 2, fakeGameHeadline); title = X("[Tech Support, Jersey Style|We Can't Help You, But We'll Try|You're Stuck? Same.]");
      L.push(["sal", "Today we take your calls. You're stuck in a game, we help. We've never played one. That's our edge."]);
      [0, 1].forEach(i => { const c = fullName(), g = gameTitle();
        L.push(["kev", i ? "Next caller." : "Caller, you're on Button Mashers."], [`c${i}`, `Hey guys, it's ${first(c)}. I'm stuck on the ${pick(["third", "final", "water", "ice", "tutorial"])} level of ${g}. ${pick(["There's a door and I can't open it.", "The boss keeps sitting on me.", "My guy won't stop jumping.", "I lost my horse."])}`],
          ["sal", X("[Have you tried knocking? In Jersey we knock, then we walk in.|Take a break. Get a sandwich. Come back. The level will respect you.|Turn it off. Turn it on. Then call your nephew.]")],
          ["kev", X("[Or go around. There's always an around.|In Boston, we'd just yell at it till it opens.|Wicked good advice, Sal. I'd do the opposite.]")], [`c${i}`, X("[That actually worked?|I'm going to pretend that helped.|Thanks? I guess?]")]);
        if (i === 0) L.push(SEG, ["sal", readHL(H[0], "Quick headline")]), gameReact(H[0], L, 1), L.push(SEG);
      });
    } else {
      H = headlineSet(data, 2, fakeGameHeadline); title = X("[Jersey Versus Boston|The Tournament Nobody Played|Final Score: Tie]");
      L.push(["kev", "Today, the Button Mashers tournament. Jersey versus Boston. Three rounds."], ["sal", "We're not going to play any games."], ["kev", "We're going to argue about them. It's better."]);
      GAME_TAN.slice().sort(() => R() - .5).slice(0, 2).forEach((t, i) => { L.push(["kev", `Round ${n2w(i + 1)}.`], ["sal", t[0]], ["kev", t[1]], ["sal", i ? "Fine. Point Boston. This time." : X("[Point Jersey.|That's a point for me.]")]); if (i === 0) L.push(SEG); });
      L.push(SEG, ["kev", "Round three. The headlines."]); H.forEach((h, i) => { L.push([i % 2 ? "kev" : "sal", readHL(h, `${ordinal(i, H.length)} headline`)]); gameReact(h, L, i); });
      L.push(["sal", "Final score?"], ["kev", "Tie. It's always a tie. The real winner is the parking."]);
    }
    L.push(["kev", X("[That's Button Mashers. Go play a video game for us.|That's our show. Press start for us, would you?|Button Mashers. Thanks for listening. Thanks for playing. One of you.]")],
      ["sal", X("And call in and tell us how it ends. [We'll never know otherwise.|We're too scared to find out.|My nephew won't tell me.]")]);
    return { title, lines: L, hosts: "Sal and Kev", usedLive: H.some(h => !h.fake),
      cast: { sal: { name: "Sal", accent: "american", pitch: .96, rate: 1.05 }, kev: { name: "Kev", accent: "american", pitch: 1.04, rate: 1.06 }, c0: callerVoice("A caller"), c1: callerVoice("Another caller") } };
  }

  /* ===================== 5. The Long Look (nature documentary) ===================== */
  // Built-in facts are short and true; with the app online the narrator reads the encyclopedia summary instead.
  const ANIMALS = [
    ["Barn owl", "barn owl", ["Barn owls can find prey in complete darkness, by sound alone.", "They swallow small prey whole."]],
    ["Sea otter", "sea otter", ["The sea otter has the densest fur of any animal.", "It often floats on its back and uses stones as tools."]],
    ["Axolotl", "axolotl", ["The axolotl can regrow lost limbs.", "It keeps its young, gilled form all its adult life."]],
    ["Western honey bee", "honey bee", ["A single colony can hold tens of thousands of workers.", "Bees tell each other where flowers are with a waggle dance."]],
    ["Moose", "moose", ["The moose is the largest member of the deer family.", "Moose are strong swimmers."]],
    ["Octopus", "octopus", ["An octopus has three hearts.", "It can change its color in a fraction of a second."]],
    ["Hummingbird", "hummingbird", ["Hummingbirds can hover, and even fly backwards.", "A hummingbird's heart can beat more than a thousand times a minute."]],
    ["Capybara", "capybara", ["The capybara is the largest living rodent.", "It spends much of its life in and around water."]],
    ["Pangolin", "pangolin", ["Pangolins are covered in scales made of keratin.", "When threatened, a pangolin rolls into a ball."]],
    ["Emperor penguin", "emperor penguin", ["Emperor penguin fathers keep the egg warm on their feet through the winter.", "They huddle together against the cold."]],
    ["Tardigrade", "tardigrade", ["Tardigrades can survive being dried out completely.", "They are barely half a millimetre long."]],
    ["Giraffe", "giraffe", ["A giraffe's neck has seven vertebrae, the same number as ours.", "Giraffes are the tallest living land animals."]],
    ["Raccoon", "raccoon", ["Raccoons have very sensitive front paws.", "They are known for remembering how to solve problems."]],
    ["Common wombat", "wombat", ["Wombats leave cube-shaped droppings.", "They dig long burrows."]],
    ["Platypus", "platypus", ["The platypus is a mammal that lays eggs.", "It finds food underwater by sensing electric fields."]],
    ["Monarch butterfly", "monarch butterfly", ["Monarch butterflies migrate thousands of kilometres.", "Their caterpillars feed on milkweed."]],
    ["Sloth", "sloth", ["A sloth can take weeks to digest a single meal.", "Algae can grow in a sloth's fur."]],
    ["North American beaver", "beaver", ["Beavers build dams that turn streams into ponds.", "Their front teeth never stop growing."]],
    ["American crow", "crow", ["Crows can recognize individual human faces.", "They often gather in large groups at night."]],
    ["Hedgehog", "hedgehog", ["A hedgehog's back is covered in thousands of spines.", "Many hedgehogs hibernate through the winter."]],
  ];
  const LETTER_OPEN = ["My dearest {to},", "Dear {to},", "To {to}, if this finds you,", "{to}, my friend,"];
  const LETTER_BODY = ["The weather here has been [mild|unkind|the same as yesterday]. I have eaten. I intend to eat again.", "I think of you often, and of the [pond|tree|warm rock|place by the fence].",
    "A human stood near me today for a long time. I did not explain myself.", "The young ones are well. They have learned nothing from me, which is how I learned everything.",
    "I have been [busy|patient|very still], which, I am told, is the same thing.", "Tell the others I am fine, and that I was right about the [river|wind|bucket]."];
  const LETTER_CLOSE = ["Yours, in no particular hurry, {from}.", "Ever yours, {from}.", "With what passes for love among us, {from}.", "Until the season turns, {from}."];
  const ANIMAL_NAMES = ["Margaret", "Thomas", "Eliza", "Samuel", "Clara", "Josiah", "Hattie", "Amos", "Prudence", "Silas"];
  function nature(st, data) {
    const fmt = format(st, ["letters", "day", "hide"]);
    const a = data && data.animal ? ANIMALS.find(x => x[0] === data.animal) || pick(ANIMALS) : pick(ANIMALS);
    const name = a[1], from = pick(ANIMAL_NAMES), to = pick(ANIMAL_NAMES.filter(x => x !== from));
    let facts = a[2].slice(), live = false;
    if (data && data.wiki && data.wiki.extract) {
      const s = String(data.wiki.extract).replace(/\s*\([^)]*\)/g, "").split(/(?<=\.)\s+/).map(x => x.trim()).filter(x => x.length > 25 && x.length < 220).slice(0, 3);
      if (s.length >= 2) { facts = s; live = true; }
    }
    const v = { name, Name: cap(name), from, to };
    const letter = (w = v) => { const b = deck(LETTER_BODY); return [X(pick(LETTER_OPEN), w), X(b(), w), X(b(), w), X(pick(LETTER_CLOSE), w)].join(" "); };
    const fact0 = live ? X("[The encyclopedia tells us: |The record says: |Scholars note: ]") + facts[0] : facts[0];
    const L = [];
    let title = v.Name;
    if (fmt === "letters") {
      const reply = chance(.5), v2 = reply ? { ...v, from: to, to: from } : v;
      L.push(["amb", X("[The {name}.|Consider the {name}.|There was, and there still is, the {name}.]", v)],
        ["amb", X("[The camera moves, very slowly, across a photograph of a {name} who did not wish to be photographed.|A slow pan across a field. Somewhere in it, a {name}.|An old photograph. A {name}. Unbothered.]", v)],
        ["amb", fact0], SEG, ["amb", X("[In the archives, there is a letter.|We found a letter. We do not know how.|One letter survives.]", v)], ["sfx", "page"], ["reader", letter()],
        ["amb", X("[And so the {name} went on, as {name}s do.|The {name} did not answer the letter. It did not need to.|History does not record whether {to} wrote back. But it is likely.]", v)],
        ["amb", facts[1]], ...(facts[2] ? [["amb", facts[2]]] : []), SEG,
        ["amb", reply ? X("[Then, years later, a reply. From {from}.|{from} did write back. Of course {from} wrote back.]", v2) : "A second letter, written in the same hand, which is to say, no hand at all."],
        ["sfx", "page"], [reply ? "reader2" : "reader", letter(v2)]);
      title = X("[{Name}|Letters from a {name}|The {name}, in Their Own Words]", v);
    } else if (fmt === "day") {
      L.push(["amb", X("[A day in the life of the {name}.|Dawn. The {name} is awake. Or is about to be. It is deciding.|Morning comes for everyone. Even the {name}.]", v)], ["sfx", "wind"],
        ["amb", X("[It begins, as all things begin, with breakfast.|The first hour is spent in quiet consideration.|First: a stretch. Then: a longer stretch.]")], ["amb", fact0],
        SEG, ["amb", X("[Noon. The {name} is busy, in the way that only a {name} can be busy.|Midday. Nothing has happened. Something is about to.|By noon, the {name} has made three decisions, all of them correct.]", v)], ["amb", facts[1]],
        ["amb", X("[A visitor arrives. It is a beetle. They do not speak.|A cloud passes. The {name} allows it.|There is a sound in the distance. The {name} does not care, and is right not to.]", v)],
        ...(facts[2] ? [["amb", facts[2]]] : []),
        SEG, ["amb", X("[Dusk. The {name} has had a full day, by its own standards, which are the only ones that matter.|Evening. The {name} settles. The world, briefly, settles with it.]", v)], ["sfx", "rain"]);
      title = X("[A Day in the Life: the {name}|Dawn to Dusk with the {name}|The {name}'s Tuesday]", v);
    } else {
      L.push(["amb", X("[I am in a hide. A small wooden box in a field. I have been here since four this morning.|I am crouched in the reeds. My knees have filed a complaint.|We have built a blind. It is a tent painted to look like a bush. The bush is not fooling anyone.]")],
        ["amb", X("[We are waiting for the {name}.|Somewhere nearby, we are told, is a {name}.|Our quarry today: the {name}.]", v)], ["amb", fact0],
        SEG, ["pip", X("[Tea, Mister Hale?|Biscuit, Mister Hale? I brought the good ones.|Should I keep filming the empty field, Mister Hale?]")], ["amb", X("[Thank you, Pip. Quietly, please.|Yes, Pip. Softly.|Yes. The field is the story until it isn't.]")],
        ["amb", facts[1]], ["pip", X("[Mister Hale. Something moved.|I think I see it. No, that's a bag.|Is it that? No. That's a smaller bush.]")], ["amb", "Steady."],
        SEG, ["sfx", "steps"], ["amb", X("[And there it is. The {name}. It looks at us. We look at it. Neither of us says anything. That is the whole point.|There. The {name}. It has been watching us the entire time. It is, frankly, unimpressed.]", v)],
        ...(facts[2] ? [["amb", facts[2]]] : []), ["pip", X("[I'm going to cry, Mister Hale.|Did we get it on film?|It's beautiful. I dropped my biscuit.]")]);
      title = X("[Waiting for the {name}|From the Hide: the {name}|Pip and the {name}]", v);
    }
    L.push(["amb", X("[The {name}. It did not need us to notice. But we did.|We look at the {name}. The {name}, mostly, does not look back.|That was the {name}. Take your time with it. It is taking its time with you.|Until next time, from the long grass.]", v)]);
    if (live) L.push(["amb", "Facts from Wikipedia, the free encyclopedia."]);
    return { title, lines: L, hosts: "Ambrose Hale", usedLive: live,
      cast: { amb: { name: "Ambrose Hale", accent: "british", pitch: .94, rate: .88 }, pip: { name: "Pip, field assistant", accent: "british", pitch: 1.06, rate: 1.02 },
        reader: { name: `${from} the ${name}, as read`, accent: pick(["american", "irish"]), pitch: .98, rate: .9 },
        reader2: { name: `${to} the ${name}, as read`, accent: pick(["australian", "southafrican", "british"]), pitch: 1.04, rate: .92 } } };
  }

  /* ===================== 6. Lost & Found Live ===================== */
  const LF_ITEM = ["a left mitten shaped like a lobster", "a ring of keys with no keys on it, just the ring", "a retainer in a sandwich bag labeled NOT A SANDWICH", "a parrot named Professor",
    "a framed photo of somebody else's grandma", "one rollerblade", "a bowling trophy for Most Improved", "a garden gnome with a mustache drawn on", "a laptop full of recipes for one specific soup",
    "a cat that isn't technically mine", "an entire wedding cake, top tier only", "a tuba, small", "a library book from nineteen ninety-one", "my sense of direction, apparently",
    "a single umbrella, very loyal", "a lucky sock, unlucky now", "a casserole dish, with the casserole", "a remote control for a TV I no longer own"];
  const LF_PLACE = ["at the bus station", "on the number fourteen bus", "outside the bowling alley", "at a funeral, but a fun one", "at the D M V", "in a dream, but it felt real", "at the county fair, near the goats",
    "at the laundromat, dryer six", "in the self-checkout line", "at my cousin's wedding, during the chicken dance"];
  const LF_DETAIL = ["It answers to the name Bartholomew.", "It has my initials on it, but they're wrong.", "It smells like oranges. It shouldn't.", "There's a sticker on it that says ASK ME ABOUT IT.", "It's slightly damp. It was always slightly damp."];
  const LF_BOX = ["the box at the front desk is still ticking", "the box at the front desk has started ticking faster", "the box at the front desk now hums when you walk past", "the box at the front desk moved six inches to the left overnight"];
  const LF_ITEMVOICE = [["the umbrella", "I've been in the bus station for three days. I've seen every kind of weather but the kind I'm for."], ["the left mitten", "I miss the right one. We were a pair. Now I'm just a hand thing."],
    ["the bowling trophy", "Most Improved. I don't know what I improved. Nobody tells you."], ["the casserole dish", "I came with a casserole. The casserole is gone. I don't want to talk about it."]];
  function lost(st) {
    st.box = (st.box || 0) + 1;
    const fmt = format(st, ["callers", "desk", "items"]);
    const callers = [fullName(), fullName(), fullName()], it = deck(LF_ITEM), items = [it(), it(), it()], places = deck(LF_PLACE), nm = i => first(callers[i]);
    const L = [["marlo", X("[Welcome to|You've reached|Good evening and welcome to] Lost and Found Live. I'm Marlo Finch. [Somewhere out there is your stuff. Let's find it.|Our lines are open and our desk is full.|Check your pockets, then call me.]")],
      ["marlo", `Quick update before we start: ${LF_BOX[(st.box - 1) % LF_BOX.length]}. If it's yours, call us. Gently.`], SEG];
    let title;
    if (fmt === "callers") {
      title = X("[Reunited, Sort Of|Please Check Your Pockets|Have You Checked Your Other Coat]");
      callers.forEach((c, i) => {
        L.push(["marlo", `${pick(["Line one", "Line two", "Line three", "Next caller", "Go ahead"])}, you're on Lost and Found Live.`], [`c${i}`, `Hi Marlo, it's ${nm(i)}. I lost ${items[i]} ${places()}.`],
          ["marlo", X("[Describe it for me.|Any distinguishing features?|When did you last see it?|And how are you holding up?]")], [`c${i}`, pick(LF_DETAIL)]);
        if (i > 0) L.push(["marlo", `Well, ${nm(i)}, good news. Somebody turned in ${items[i - 1]}. Is that yours?`], [`c${i}`, X("[No.|It is not.|...Can I have it anyway?|I'll take it. I'll make it work.]")],
          ["marlo", X(`[Great. Reunited. Sort of.|Close enough. ${nm(i - 1)}, if you're listening, ${nm(i)} has your stuff now.|That's a match in spirit.]`)]);
        if (i === 1) L.push(SEG);
      });
    } else if (fmt === "desk") {
      title = X("[The Front Desk Inventory|What's In the Bin|Unclaimed]");
      L.push(["marlo", "Let's go through the bin. If any of this is yours, call in. Item one."], ["marlo", `${cap(items[0])}, found ${places()}.`], ["sfx", "page"],
        ["marlo", `Item two. ${cap(items[1])}. ${pick(LF_DETAIL)}`], ["marlo", `Item three. ${cap(items[2])}. No note. Just vibes.`],
        SEG, ["marlo", "Lines are lit. Go ahead."], ["c0", `Marlo! It's ${nm(0)}. Item two is mine. I'd know it anywhere.`], ["marlo", "Describe it."],
        ["c0", X("[It's... a thing. A good thing.|It's got my energy on it.|I'd rather not say, in case it's not mine.]")], ["marlo", "That's a no. Next."],
        ["c1", `Hi, ${nm(1)}. I'm not calling about the bin. I'm calling because I found ${it()} in my car and I don't own a car.`], ["marlo", "We'll... add that to the bin."],
        SEG, ["c2", `This is ${nm(2)}. Item one is my grandmother's. She lost it in nineteen eighty-two. She'll be thrilled. She's out of town.`], ["marlo", "Reunited, eventually. That's the best kind."]);
    } else {
      title = X("[The Items Call In|Lost Items Speak|Who's Missing Who]");
      const items2 = LF_ITEMVOICE.slice().sort(() => R() - .5).slice(0, 2);
      L.push(["marlo", "Today, something different. We're taking calls from the lost items themselves. Let's see who's out there."]);
      items2.forEach(([what, line], i) => { L.push(["marlo", i ? "Next caller." : "Caller, you're on the air."], [`c${i}`, `Hi Marlo. I'm ${what}. ${line}`],
        ["marlo", X("[Where are you now?|Do you know who you belong to?|Do you have a message for your owner?]")], [`c${i}`, X(`[I'm ${places()}. It's fine. It's cold.|I'd know them by their hands. Big, sorry hands.|Tell them I'm not mad. I'm a little mad.]`)]); if (i === 0) L.push(SEG); });
      L.push(SEG, ["c2", `Marlo, it's ${nm(2)}. I think I just heard my ${items2[0][0].replace(/^the /, "")} on the radio.`], ["marlo", "You did. It misses you. Go get it."], ["c2", "On my way. Tell it I'm sorry."]);
    }
    L.push(SEG, ["marlo", "One more caller. You're on the air."], ["owner", X("Hi. Marlo. That box at the front desk? That's mine. [It's a clock. For my bird. It's a bird clock.|It's a gift for my sister. It's a smaller box with a clock in it. She hates surprises.|It's my lunch. It ticks because it's a very old lunch.|It's an egg timer. I forgot what I was timing.]")],
      ["marlo", X("[Mystery solved. Please come get it before it does something.|That's the most relieved I've been on this show.|We'll leave it at the desk. Bring a towel. Just in case.]")],
      ["marlo", X("[That's Lost and Found Live. If you can't find it, it's probably in your other coat.|That's our show. Retrace your steps. All of them.|Lost and Found Live. We'll keep the light on, and the bin open.]")]);
    const cast = { marlo: { name: "Marlo Finch", accent: "american", pitch: 1.04, rate: 1 }, owner: callerVoice("The box owner") };
    callers.forEach((c, i) => cast[`c${i}`] = callerVoice(fmt === "items" && i < 2 ? `A lost item` : c));
    return { title, lines: L, hosts: "Marlo Finch", cast };
  }

  /* ===================== 7. The Committee ===================== */
  const HOA_ITEM = ["the color of the community bench", "whether geese count as residents", "a request to rename Pine Court to Pine Court, Respectfully", "the pool's new rule about splashing with intent",
    "the leaf blower curfew", "someone's inflatable dragon, which is still up, and it's March", "the speed bump that residents describe as a wall", "the community garden's zucchini surplus",
    "a proposal to replace the welcome sign with a slightly more welcoming sign", "the dog that keeps attending meetings"];
  const RON = ["Ron's mailbox is now eleven inches taller than code allows.", "Ron's mailbox has a small porch.", "Ron's mailbox now has its own mailbox.", "Ron's mailbox has been painted a color the complaint calls aggressively teal.",
    "Ron installed a doorbell on his mailbox. It plays the first four notes of a song. Nobody can name it.", "Ron's mailbox has a flag. Not the mail flag. A flag. With a crest.", "Ron's mailbox is running for the board."];
  const RON_DEF = ["It's a mailbox, Patricia. It's for mail. It's thriving.", "The code doesn't say anything about porches.", "I'm expressing myself through infrastructure.", "Every mailbox deserves a mailbox.", "I have a permit. It's laminated."];
  const HOA_CRISIS = ["the geese have unionized", "the pool has been drained, and nobody knows by whom", "someone replaced every street sign with a slightly different street sign", "Ron's mailbox has started receiving Ron's neighbors' mail. On purpose. It's redirecting it.", "the inflatable dragon came down, and the neighborhood misses it"];
  function hoa(st) {
    st.ron = (st.ron || 0) + 1;
    const fmt = format(st, ["meeting", "emergency", "election"]);
    const agenda = deck(HOA_ITEM), i1 = agenda(), i2 = agenda(), res = fullName(), res2 = fullName();
    const v = { i1, i2, res: first(res), res2: first(res2), hood: pick(["Willowmere", "Larkspur Glen", "Pheasant Run", "Badger Hollow"]), time: `${pick(["seven", "eight", "nine"])} ${pick(["oh five", "twelve", "forty", "fifty-one"])} P M` };
    const L = [["sfx", "knock"]]; let title;
    if (fmt === "meeting") {
      title = X("[Points of Order|Minutes, Unfortunately|Old Business, New Grudges]");
      L.push(["pat", X("This meeting of the {hood} Homeowners Association will come to order. I'm the chair, Patricia Vole.", v)],
        ["denise", "Roll call. Gerald."], ["gerald", "Present."], ["denise", "Ron."], ["ron", X("[Present, and so is my mailbox.|Here. Under protest.|Present. Emotionally, partially.]")], ["pat", "Noted. Unfortunately."],
        SEG, ["pat", X("First item: {i1}.", v)], ["gerald", X("[I move that we form a subcommittee.|I move that we table it.|I move that we vote on whether to vote.]")], ["denise", "Second."],
        ["ron", "Point of order."], ["pat", "Ron, it's never a point of order."], ["ron", "It's a point of order in my heart."],
        ["pat", X("All in favor? [Motion carries.|Motion fails. Narrowly. Shamefully.|It's a tie, and the dog abstained.]")],
        ["pat", X("New business. We have a new resident, {res}, who asked to speak.", v)], ["res", X("Hi. I just moved in. I wanted to ask about [trash day|the pool hours|the geese] and I've been here two hours.")], ["pat", "Welcome. You'll get used to it. Nobody does."],
        SEG, ["pat", X("Second item: {i2}.", v)], ["denise", X("[For the minutes, I'd like to note that I hate this.|The minutes will reflect a long sigh.|I'm writing down that Gerald brought a slideshow.]")],
        ["gerald", X("[I brought a slideshow.|I've prepared nine slides and a handout.|I have a laser pointer and I'm not afraid to use it.]")], ["pat", "We don't have a projector, Gerald."], ["gerald", "I'll describe them."],
        SEG, ["pat", "Final item. Complaint number " + (40 + st.ron * 3) + ". " + RON[(st.ron - 1) % RON.length]], ["ron", pick(RON_DEF)],
        ["denise", X("[Ron, it has a weather vane.|Ron, I got mail from your mailbox. It was a thank-you note.|Ron, the mailbox waved at my son.]")], ["ron", X("[He's friendly.|That's a feature.|I'll allow it.]")],
        ["pat", X("[We'll revisit this next month.|Motion to fine Ron one dollar. Seconded. Ron pays in quarters. From the mailbox.|The board will form a mailbox task force, which Ron will also be on, somehow.]")]);
    } else if (fmt === "emergency") {
      const crisis = pick(HOA_CRISIS); title = X("[Emergency Session|This Is Not a Drill|Special Meeting, Very Special]");
      L.push(["pat", X("This is an emergency session of the {hood} Homeowners Association. Nobody sit in the good chair.", v)], ["pat", `We are here because ${crisis}.`],
        ["gerald", X("[I've prepared a statement. It's mostly a timeline.|For the record, I was at the dentist.|I'd like to note that I warned everyone, in two thousand nine.]")],
        ["ron", X("[I didn't do it. My mailbox can confirm.|Before anyone looks at me: I'm also shocked.|Is this about the mailbox? It feels like it's about the mailbox.]")],
        SEG, ["pat", "We'll open the floor to public comment. Two minutes each. Denise is timing."], ["denise", "I've already started the timer."],
        ["res", X("Hi, I'm {res}. I just want to say [I moved here for the peace and quiet|I've been here forty years and this is the worst week|I support the geese].", v)],
        ["res2", X("{res2} here. [I'd like to propose a fence.|I have a theory, and it's Ron.|Can we all just agree to blame the dog?]", v)], ["ron", "I object to the theory."], ["denise", "Time."],
        SEG, ["pat", X("[Motion to form an emergency task force.|Motion to do absolutely nothing until it gets worse.|Motion to send a strongly worded newsletter.] All in favor?")],
        ["gerald", "Aye."], ["denise", "Aye."], ["ron", X("[Aye. Reluctantly.|Nay. On principle. I don't know which principle.|I abstain. My mailbox votes aye.]")], ["pat", "The motion carries. Crisis managed, technically."]);
    } else {
      title = X("[Election Night at the Clubhouse|The Board Election|Vote Ron's Mailbox]");
      L.push(["pat", X("Welcome to election night for the {hood} Homeowners Association board. Three candidates. One seat. Several feelings.", v)],
        SEG, ["pat", "Candidate one. Gerald."], ["gerald", X("[If elected, I will bring a projector.|My platform is spreadsheets. Colorful ones.|I promise fewer meetings and longer slideshows.]")],
        ["pat", "Candidate two. Denise."], ["denise", X("[I've taken the minutes for nine years. I know where the bodies are buried. Figuratively. Under the bench.|I promise shorter meetings. I promise them with my whole heart.]")],
        ["pat", "Candidate three. Ron's mailbox. Ron will speak on its behalf."], ["ron", X("[My mailbox is a listener. It receives. It does not judge.|My mailbox has a porch, a flag and a vision.|A vote for the mailbox is a vote for mail.]")],
        SEG, ["pat", "The votes are in. Denise, read the count."], ["denise", X(`Gerald, [three|four|five]. Denise, [four|six]. Ron's mailbox, [seven|eleven|nine]. One write-in for the dog.`)],
        ["pat", "Ron's mailbox wins. God help us."], ["ron", "It's not about me. It's about the mailbox."], ["gerald", "I'd like a recount. And a projector."]);
      st.ron++;
    }
    L.push(["pat", X("This meeting is adjourned at {time}.", v)], ["sfx", "knock"]);
    return { title, lines: L, hosts: "Patricia Vole and the board",
      cast: { pat: { name: "Patricia Vole, chair", accent: "british", pitch: 1, rate: .97 }, gerald: { name: "Gerald, treasurer", accent: "american", pitch: .92, rate: .95 },
        denise: { name: "Denise, secretary", accent: "american", pitch: 1.06, rate: 1.02 }, ron: { name: "Ron", accent: "american", pitch: .96, rate: 1.04 }, res: callerVoice(res), res2: callerVoice(res2) } };
  }

  /* ===================== 8. Overnight Shipping (a serial) ===================== */
  const PKG_LABEL = ["FRAGILE, EMOTIONALLY", "THIS SIDE UP. OTHER SIDE ALSO UP.", "DO NOT X-RAY. PLEASE.", "PERISHABLE, MAYBE", "HANDLE WITH CARE AND A LITTLE RESPECT", "OPEN ONLY IN CASE OF TUESDAY"];
  const PKG_END = ["a smaller package, and inside that, a note that says thank you for being careful", "a single sock, the left one, finally home", "a snow globe of the sorting facility itself, with a tiny forklift in it",
    "a cassette tape labeled Vic, from the future", "forty pounds of packing peanuts and one very nice pen", "a mug that says World's Okayest Courier"];
  const NOIR_OPEN = ["The night was long, and shrink-wrapped.", "Rain on the loading dock. Rain on my hat. Rain on my heart, if I still had one, and the union says I do.",
    "Three A M at the sorting hub. Too late for coffee. Too early for a better job.", "The conveyor belt hummed like it knew something. Conveyors always know something."];
  const STAGES = [
    v => [["vic", `${pick(NOIR_OPEN)} Package ${v.code} came in at ${v.time}. The label said ${v.label}. I didn't like it. I didn't like it at all.`], ["dolores", "It's your problem now, Tally. Get it to Dock C by sunrise."], ["vic", "Sunrise. Always sunrise. Never a nice brunch."]],
    v => [["vic", `Conveyor nine. That's where I last saw ${v.code}. Now? Nothing. An empty tray. A tray that's seen too much.`], ["sfx", "steps"], ["dolores", "Did you lose it, Tally?"], ["vic", "Packages don't get lost, Dolores. They get taken."]],
    v => [["vic", `A clue. ${pick(["Footprints, made of packing peanuts.", "A shipping label with a typo. Somebody spelled fragile with two Gs.", "Bubble wrap, and every bubble already popped. Somebody was nervous.", "A barcode drawn in ballpoint. Good work, too. Too good."])}`], ["vic", "Whoever did this knew the building. Knew the belts. Knew which forklift squeaks."]],
    v => [["vic", "I found Big Lou in the back by the battery charger. Big Lou's a forklift. Big Lou doesn't talk. Big Lou beeps."], ["lou", "Beep. Beep. Beep."], ["vic", "He said three beeps. Three beeps means Returns. Everybody knows that."], ["sfx", "beeps"]],
    v => [["vic", "Returns. Where things go when they disappoint somebody. I know the feeling."], ["mole", "You came to the right place, detective. I'm the mole. Technically I'm an air fryer. Somebody sent me back. I've seen things."], ["vic", `Where's ${v.code}, appliance?`], ["mole", "Check the lost-label bin. And detective? Nobody ever reads the warranty."]],
    v => [["vic", `There it was. ${v.code}. Under a pallet of returned exercise bikes nobody will ever ride.`], ["dolores", "Open it, Tally. You've earned that much."], ["vic", `Inside was ${v.end}.`], ["vic", "Case closed. I delivered it to Dock C at sunrise, like they asked. Nobody said thank you. The package did, sort of."]],
  ];
  const SUSPECT_JOB = ["the night janitor", "a temp from the label printer department", "the vending machine guy", "a driver on route nine", "the security guard who mostly guards a TV", "an intern nobody remembers hiring"];
  const SUSPECT_ALIBI = ["the vending machine, all night, choosing", "my car, listening to a podcast about other crimes", "the break room, defrosting a lasagna that will not defrost", "the roof. Looking at the moon. Normal stuff"];
  const SUSPECT_TELL = ["You've got packing peanuts in your cuffs.", "Your badge photo is a drawing of you.", "The vending machine's been broken since June.", "You keep saying the package's name and I never told you the package's name."];
  function ship(st) {
    if (!st.case || st.stage >= STAGES.length) { st.case = (st.case || 0) + 1; st.stage = 0; st.v = { code: `${pick(["K", "R", "Z", "M", "Q"])} ${ri(10, 99)} dash ${pick(["Alpha", "Delta", "Juniper", "Walrus", "Seven"])}`, label: pick(PKG_LABEL), time: `${ri(1, 4)} ${pick(["twelve", "thirty", "forty-four", "oh nine"])} A M`, end: pick(PKG_END) }; }
    const v = st.v, ch = st.stage, L = []; let susName = null;
    const recap = ch > 0 ? [["vic", X(`[Previously|Last time|Where were we. Right]: package ${v.code}, label reading ${v.label}. ${ch > 1 ? "A missing tray. " : ""}${ch > 2 ? "A clue I didn't like. " : ""}${ch > 3 ? "A forklift who said more than he meant to." : ""}`)]] : [];
    const head = ["vic", X(`[Overnight Shipping. Case ${n2w(st.case)}, chapter ${n2w(ch + 1)}.|Chapter ${n2w(ch + 1)}. Case ${n2w(st.case)}. Overnight Shipping.|This is Overnight Shipping. Case ${n2w(st.case)}. Chapter ${n2w(ch + 1)}.]`)];
    const cold = ch > 0 && chance(.4);   // sometimes start in the middle of the scene, then recap
    const scene = STAGES[ch](v);
    if (cold) L.push(scene[0], head, ...recap, SEG, ...scene.slice(1)); else L.push(head, ...recap, SEG, ...scene);
    if (ch > 0 && ch < STAGES.length - 1) {   // a suspect every middle chapter: a different night-shift worker, alibi and tell each time
      const who = susName = fullName(), job = pick(SUSPECT_JOB), fn = first(who);
      L.push(SEG, ["vic", `Before I followed it, I had a talk with ${who}, ${job}. ${pick(["Nervous type.", "Calm type. Too calm.", "Wore sunglasses indoors. At night.", "Had a sandwich in each hand and no explanation."])}`],
        ["suspect", X(`[Where was I? Where was I. I was at ${pick(SUSPECT_ALIBI)}.|I was at ${pick(SUSPECT_ALIBI)}. Ask anybody. Don't ask anybody.|You can't pin this on me, Tally. I was at ${pick(SUSPECT_ALIBI)}.]`)],
        ["vic", X(`[Funny. ${pick(SUSPECT_TELL)}|Sure, ${fn}. Sure. Except ${pick(SUSPECT_TELL).toLowerCase()}]`)],
        ["suspect", X("[Okay, I took a stapler. One stapler. That's all I did.|I want a lawyer. Or a union rep. Or a pretzel.|That's circumstantial. Look it up. I looked it up.]")],
        ["vic", X("[They didn't do it. People who take staplers never do. But they knew something.|I let them go. You can't book someone for being weird on the night shift. Believe me, I've tried.]")]);
      if (chance(.5)) L.push(["ph_dolores", X("[Tally, it's Dolores. Dock C says the truck leaves at six. Six, Tally.|Tally. Dolores. Somebody left a donut on your desk. It's ticking. Kidding. It's a donut.|Tally, Dolores. Big Lou's been beeping since midnight. Find out what he wants.]")], ["vic", X("[Copy that.|Ten four, Dolores.|Understood. I'm on it. I'm always on it.]")]);
    }
    if (ch < STAGES.length - 1) L.push(["vic", X("[To be continued. Probably at night. Everything is.|Next time: the truth, or something wearing its jacket.|Stay tuned. The belt keeps moving.]")]);
    st.stage++;
    return { title: `Case ${n2w(st.case)}, Chapter ${n2w(ch + 1)}`, lines: L, hosts: "Vic Tally",
      cast: { vic: { name: "Vic Tally", accent: "american", pitch: .9, rate: .94 }, dolores: { name: "Dolores, night supervisor", accent: "american", pitch: 1.04, rate: 1 },
        ph_dolores: { name: "Dolores, on the radio", accent: "american", pitch: 1.04, rate: 1 },
        lou: { name: "Big Lou, a forklift", accent: "robot", novelty: true, pitch: 1, rate: 1 }, mole: { name: "The mole in Returns", accent: "british", pitch: 1.04, rate: .98 }, suspect: callerVoice(susName || "A suspect") } };
  }

  /* ===================== 9. Ask a Retired Wizard ===================== */
  const WIZ_PROB = [["my wifi", "my wifi drops every time the microwave runs"], ["my roommate", "my roommate labels his food with threats"], ["the group chat", "the group chat went quiet and I think it's my fault"],
    ["my printer", "my printer only prints the word no"], ["my neighbor's dog", "my neighbor's dog stares at me through the fence, every day, with judgment"], ["my car", "I keep losing my car in parking lots"],
    ["my sourdough", "my sourdough starter has stopped believing in me"], ["my calendar", "every meeting I schedule turns into two meetings"], ["my houseplant", "my houseplant is thriving, and it's making me look bad"]];
  const SYL = ["Gor", "ble", "flax", "um", "zan", "thra", "mox", "pell", "quin", "dor", "vex", "ia", "noo", "brack"];
  const spell = () => { const w = () => pick(SYL) + pick(SYL) + (chance(.5) ? pick(SYL).toLowerCase() : ""); return `${w()} ${w()}, ${w()}!`; };
  const INGR = ["a thimble of lukewarm tea", "the receipt from something you regret", "one bay leaf, dried with intention", "a whisper of cinnamon", "a single shoelace, untied", "a spoon you trust", "a sticky note that says sorry"];
  const WIZ_RETIRE = ["Retirement is lovely. I play shuffleboard. I cheat, a little. Telekinetically.", "My old staff is a curtain rod now. It still glows when I'm sad.", "The condo board fined me for my tower. I told them it's a balcony. It's a tower.",
    "I used to fight dragons. Now I fight the thermostat in the clubhouse. The dragons were more reasonable.", "I've taken up watercolors. Everything I paint comes slightly alive. It's a problem at the art fair."];
  const WIZ_THING = [["the microwave", "a box that heats soup with invisible bees"], ["the escalator", "a staircase that has given up on you, and carries you anyway"], ["the self-checkout", "a machine that suspects you of crimes, loudly, in a calm voice"],
    ["the smart speaker", "a small oracle that hears everything and only ever plays the wrong song"], ["the group chat", "a scrying pool where everyone is screaming in tiny letters"]];
  function wizard(st) {
    const fmt = format(st, ["callers", "spell", "apprentice", "review"]);
    const P = WIZ_PROB.slice().sort(() => R() - .5), c = [fullName(), fullName(), fullName()], nm = i => first(c[i]), s1 = spell(), ing = deck(INGR);
    const L = [["ald", X("[Hello, hello. This is Ask a Retired Wizard. I am Aldric Fennimore, formerly of the High Tower, currently of Seaside Pines condos, unit four B.|Ask a Retired Wizard. I'm Aldric. I have seen the end of ages and the start of daylight saving time.|Greetings, mortals and night-shift workers. Aldric Fennimore here, retired, reluctantly.]")]];
    let title;
    const caller = (i, prob) => [[`c${i}`, `Hi Aldric. It's ${nm(i)}. ${cap(prob[1])}.`]];
    if (fmt === "callers") {
      title = X(`[The Trouble with ${P[0][0].replace(/^my /, "Your ")}|Spells for Modern Living|Side Effects May Vary]`);
      L.push(["ald", "First caller, you are on the air. Speak your woe."], ...caller(0, P[0]),
        ["ald", X(`Ah. A classic affliction. Take ${ing()} and ${ing()}. Walk three times around ${P[0][0]}, counterclockwise, and say: ${s1}`)],
        ["c0", X("[Out loud?|At work?|Does it have to be counterclockwise?]")], ["ald", X("[Loudly. Magic is a confidence game.|Especially at work.|Clockwise summons a mild ghost. Don't.]")],
        SEG, ["ald", "Next caller."], ...caller(1, P[1]),
        ["ald", X(`[Simple. Write its true name on ${ing()} and leave it under your pillow.|Have you tried turning it off and on again? That's an old spell. Very old. Older than me.|Burn nothing. Just look at it with tremendous disappointment. Wizards' glare. Works on most things.]`)],
        ["c1", "That's it?"], ["ald", "Magic is mostly follow-through."], ["ald", pick(WIZ_RETIRE)],
        SEG, ["ald", "One more. You're on the air."],
        ["c2", `Hi, I'm ${nm(2)}. I live next to ${nm(0)}, the one with ${P[0][0]}. They did your spell. Now ${P[0][0]} is ${pick(["humming", "politely asking for things", "slightly taller", "glowing a soft green", "following them to the mailbox"])}.`],
        ["ald", X("[Ah. Side effects. They wear off. Usually.|That means it worked. Mostly. Partially. It worked adjacent.|Tell them to say the spell backwards. Quietly. Then go get a sandwich.]")]);
    } else if (fmt === "spell") {
      title = X(`[Spell of the Week|Household Magic, Lesson ${n2w(ri(2, 12))}|Kitchen Sorcery]`);
      const target = P[0];
      L.push(["ald", `It's time for the Spell of the Week. This week: a cure for ${target[0]}.`], ["ald", X(`Step one. Gather ${ing()}, ${ing()}, and a calm heart. If you can't find a calm heart, a decaf will do.`)],
        ["ald", X(`Step two. Face north. Or whichever way the fridge is. Hold ${target[0]} gently. Or, if it's ${target[0]}, near it.`)], ["sfx", "teacup"],
        ["ald", `Step three. Say the words, clearly: ${s1}`], ["ald", "Step four. Wait. Most magic is waiting. The rest is snacks."],
        SEG, ["ald", "Now, a caller who tried last week's spell. You're on the air."], ["c0", `Aldric, it's ${nm(0)}. I tried the spell for ${P[1][0]}. Now ${P[1][0]} ${pick(["sings when I'm sad", "only works on Thursdays", "has opinions about my outfits", "follows me around the house"])}.`],
        ["ald", X("[Excellent. That's the advanced result. Most people only get the regular result.|You may have said it with an accent. Magic hears accents.|Keep it. It likes you. That's rarer than you'd think.]")],
        SEG, ["ald", pick(WIZ_RETIRE)]);
    } else if (fmt === "apprentice") {
      title = X("[The Apprentice Calls|Wren Has Notes|Master and Former Student]");
      L.push(["ald", "Before your calls, a familiar voice on line one. My former apprentice."], ["ph_wren", X("[Hi, Master Aldric. It's Wren. I'm a wizard now. Also a dental hygienist.|Master. It's Wren. I'm calling because you still have my wand. It's been nine years.|Hi, it's Wren. I listen every week. You're getting the spells wrong.]")],
        ["ald", X("[Wren! My finest student. My only student.|Wren. You were always so... punctual.|Ah. Wren. The one who set fire to the moon. A little.]")],
        ["ph_wren", "Stay on the line. I'll correct you live."], SEG, ["ald", "Caller, you're on the air."], ...caller(0, P[0]),
        ["ald", X(`Take ${ing()} and say: ${s1}`)], ["ph_wren", X(`[That's wrong. It's ${spell()} And you need two spoons.|Master, that spell turns things into geese.|You're thinking of the spell for gravy.]`)],
        ["ald", X("[Wren is technically correct, which is the worst kind of correct.|We'll do it Wren's way. Wren went to school for this. I went to a cave.]")], ["c0", "I'll try both."],
        SEG, ["ald", "Next caller."], ...caller(1, P[1]), ["ph_wren", "Let me take this one, Master."], ["ph_wren", X("[Have you tried an ordinary solution? Like asking nicely?|Unplug it. Count to ten. Plug it back in. That's not magic. That's just good advice.]")],
        ["ald", "Show-off."], ["ph_wren", "I learned from the best. And then I learned from a book."]);
    } else {
      const th = pick(WIZ_THING); title = X(`[Aldric Reviews ${cap(th[0].replace(/^the /, ""))}|Ancient Eyes, Modern Things|A Wizard Reviews Your World]`);
      L.push(["ald", `Today I review a modern artifact. ${cap(th[0])}.`], ["ald", `It is ${th[1]}.`], ["ald", X("[I approached it with respect. It did not return the favor.|I tried to bargain with it. It wanted a password.|It is more powerful than anything I owned in the tower, and less polite.]")],
        ["ald", X(`Rating: [${n2w(ri(2, 5))} wands out of five|three crystal balls and a sigh|one dragon, out of one dragon].`)],
        SEG, ["ald", "Callers, tell me your experiences."], ["c0", `Hi Aldric, it's ${nm(0)}. I love ${th[0]}. Is that wrong?`], ["ald", X("[Love is never wrong. Trust, however, must be earned.|No. But keep a candle handy.|Love it from a distance. Like a volcano.]")],
        SEG, ...caller(1, P[1]), ["ald", X(`Say it with me: ${s1} Then go outside and look at a tree.`)], ["c1", "Does the tree help?"], ["ald", "The tree always helps."]);
    }
    L.push(["ald", X("[Magic is real, results may vary. This has been Ask a Retired Wizard.|Remember: every problem has a spell, and every spell has a problem. Goodnight.|That's our hour. I'm off to shuffleboard. Don't call the clubhouse. They know my voice.]")]);
    const cast = { ald: { name: "Aldric Fennimore, retired wizard", accent: "british", pitch: .9, rate: .9 }, ph_wren: { name: "Wren, the former apprentice", accent: "irish", pitch: 1.06, rate: 1.02 } };
    c.forEach((x, i) => cast[`c${i}`] = callerVoice(x));
    return { title, lines: L, hosts: "Aldric Fennimore", cast };
  }

  // tags: what the announcer may say about a show (sometimes nothing). Never the same line twice in a row, and the shows
  // themselves never repeat them.
  const SHOWS = [
    { id: "doug", name: "Clap Attack with Doug", label: "Clap Attack with Doug", style: "doug", make: doug,
      tags: ["Real estate is a family business, and Doug didn't come to make friends.", "Houses, family, and absolutely no friends.", "Doug sells homes. Doug does not do hugs.", "Loud, live, and under contract.", "Bring your offers. Leave your feelings."] },
    { id: "biz", name: "Analyze Biz", label: "Analyze Biz", style: "biz", make: biz, needs: "business",
      tags: ["Squirky Tallume and Gregg Ploptz read the business news.", "The markets, explained badly.", "Two hosts, one headline at a time, zero advice.", "Business news, lightly roasted."] },
    { id: "usb", name: "The Real U S B Drives of Cleverly Spillz", label: "Real USB Drives of Cleverly Spillz", style: "usb", make: usb,
      tags: ["The drama is real. The data has been forged.", "Four friends, one drive, endless receipts.", "Somebody plugged it in. Everybody regrets it.", "Glamour, grudges and corrupted files."] },
    { id: "buttons", name: "Button Mashers", label: "Button Mashers", style: "buttons", make: buttons, needs: "gaming",
      tags: ["Sal and Kev love video games. They've never played one.", "Jersey and Boston, talking games they've never touched.", "Gaming news from two guys who read the box.", "Press start. They won't."] },
    { id: "nature", name: "The Long Look", label: "The Long Look (nature)", style: "nature", make: nature, needs: "animal",
      tags: ["Ambrose Hale, and an animal, taking their time.", "Nature, slowly.", "One animal. One hour. No hurry.", "The wild world, at a gentle pace."] },
    { id: "lost", name: "Lost and Found Live", label: "Lost & Found Live", style: "lost", make: lost,
      tags: ["You lose it, we talk about it.", "Marlo Finch and the front desk bin.", "Missing something? Call Marlo.", "Reuniting people with their things, more or less."] },
    { id: "hoa", name: "The Committee", label: "The Committee (an HOA meeting)", style: "hoa", make: hoa,
      tags: ["Live from the clubhouse. Bring a folding chair.", "Democracy, one mailbox at a time.", "The board is in session.", "Points of order, and points of disorder."] },
    { id: "ship", name: "Overnight Shipping", label: "Overnight Shipping (a serial)", style: "ship", make: ship,
      tags: ["A detective, a package and a forklift named Big Lou.", "Crime never sleeps. Neither does the sorting hub.", "Every package has a story.", "A noir serial from the loading dock."] },
    { id: "wizard", name: "Ask a Retired Wizard", label: "Ask a Retired Wizard", style: "wizard", make: wizard,
      tags: ["Aldric Fennimore answers your problems, magically.", "Ancient wisdom for modern problems.", "Spells, advice, and shuffleboard.", "He's retired. He's still very powerful."] },
  ];
  return {
    shows: SHOWS.map(s => ({ id: s.id, name: s.name, label: s.label, style: s.style, needs: s.needs || null })),
    animals: () => ANIMALS.map(a => a[0]),
    episode(id, data, state) { const s = SHOWS.find(x => x.id === id); const ep = s.make(state, data); return { ...ep, show: s.name, showId: s.id, style: s.style }; },
    id, next: id => next(SHOWS.find(x => x.id === id)),
  };
}
