/* PTLK 108.0: 100% procedural talk radio. Every episode is written the moment it airs from plot grammars: each show
   picks its cast, places and props once, then runs a beginning, a middle that escalates and an ending, so it hangs
   together, and the slots are wide enough that no two episodes come out the same. Some shows read live headlines or
   encyclopedia summaries when the app provides them (opts.headlines); without them they write their own.
   Rules (same as MDFM 99.9): real headlines are read straight first; the jokes are about the situation and the words,
   never claims about real named people or invented facts about real companies. Nobody's accent marks a villain. */
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
  const FIRST = ["Darlene", "Ray", "Tammy", "Lyle", "Marcy", "Dwayne", "Pam", "Gus", "Rhonda", "Earl", "Bev", "Chuck", "Wendy", "Nate", "Trish", "Hal", "Joelle", "Vince", "Shirley", "Todd",
    "Gloria", "Mitch", "Opal", "Rusty", "Nadine", "Burt", "Lorraine", "Kip", "Deb", "Walt", "Priya", "Marco", "Yvonne", "Desmond", "Ingrid", "Abe", "Rosalind", "Felix", "Connie", "Omar"];
  const LAST = ["Pickering", "Lumm", "Hargrove", "Bixby", "Duquette", "Fenstermacher", "Kowalczyk", "Plover", "Truax", "Quimby", "Stroud", "Ogletree", "Wendt", "Szabo", "Pruitt", "Vandermeer",
    "Hollis", "Crabtree", "Yancey", "Lindahl", "Okonkwo", "Barrowman", "Delacorte", "Finchley", "Gorski", "Huxtaple", "Ibarra", "Jaskowiak"];
  const TOWNS = ["Lower Fenwick", "East Ploverton", "Gravel Springs", "North Muddle", "Pinecrest Junction", "Old Sudbury Flats", "Lake Wendle", "Cobbleton", "Port Hargrove", "Saint Mildred",
    "Upper Dimsdale", "Brisket Falls", "New Cardigan", "Willow Bend", "Fort Noodle"];
  const STREET = ["Maple", "Larkspur", "Old Mill", "Gristle", "Plover", "Badger Hollow", "Sunnyvale", "Quarry", "Juniper", "Lantern", "Cobbler", "Thistle", "Wobble Creek", "Pheasant Run"];
  const STREET_T = ["Lane", "Court", "Drive", "Way", "Circle", "Terrace", "Place"];
  const fullName = () => `${pick(FIRST)} ${pick(LAST)}`;
  const CALLER_ACCENTS = ["american", "american", "american", "british", "australian", "irish", "scottish", "indian", "southafrican"];
  const callerVoice = (name) => ({ name, accent: pick(CALLER_ACCENTS), pitch: rr(.85, 1.25), rate: rr(.92, 1.1) });
  const clock = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const n2w = n => ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"][n] || String(n);

  /* ---------- Station imaging ---------- */
  const IDS = ["P T L K, one oh eight point oh. All talk. No music. No exceptions.",
    "You're listening to P T L K. Talk radio, made fresh, every single time.",
    "P T L K, one oh eight. Nobody here has read the script, because there isn't one.",
    "One oh eight point oh, P T L K. The top of the dial, and everything that fell off it.",
    "This is P T L K. Every show you hear has never been heard before. Including this sentence.",
    "P T L K one oh eight. Opinions, callers, committees and one wizard. Stay tuned.",
    () => `It's ${clock()} at P T L K, one oh eight point oh. Somebody here is about to say something.`];
  const id = () => { const x = pick(IDS); return typeof x === "function" ? x() : x; };
  const next = (show) => X(`[Coming up|Up next|Stay with us. Next|Right now] on P T L K: ${show.name}. ${show.tag}`);

  /* ---------- Shared bits for headline shows ---------- */
  const clean = t => String(t || "").replace(/\s+/g, " ").replace(/\s*[-|–—]\s*[^-|–—]{2,40}$/, "").trim();   // drop " - Site Name" tails
  const keyword = (title, words) => { const low = " " + String(title).toLowerCase().replace(/[^a-z0-9 ]/g, " ") + " "; for (const w of Object.keys(words)) if (low.includes(" " + w + " ") || low.includes(" " + w + "s ")) return w; return null; };

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
    "I want a yard, but I don't want to look at it", "my husband needs a man cave, and I need it far away from me", "I'm a first-time buyer, second-time crier", "I need something near a good school, for me, I'm going back"];
  const DOUG_OBJ = ["Is that the house with {flawshort}?", "What about {flawshort}?", "My cousin says {town} is haunted.", "Is {price} firm? Or is it, like, a suggestion?", "Can I see it first?"];
  const DOUG_REBUT = ["Objection noted. Objection clapped.", "You don't see a house, you see a future. With a smell. A future smell.", "Everything's negotiable except my commission and my mother.",
    "Firm? It's a house. It's very firm. It's made of house.", "You can see it after you buy it. That's called commitment."];
  const TRENT_DID = ["staged the Hendricks house with his own laundry", "put his face on a bus bench, upside down, so now he looks like he's falling", "told a buyer the radon was just ambiance",
    "lost the lockbox, then the lockbox key, then the car the lockbox was in", "listed our office as a three-bedroom and got four offers", "sent a closing gift basket that was mostly ketchup packets",
    "showed a house to a family of five while the family of four that lives there was eating dinner", "got the sign out front to say SOLB"];
  const TRENT_SAY = ["In my defense, it was a soft launch.", "I was told it was a team-building exercise.", "The client said go big, Doug.", "Aunt Barb, you said I could use my judgment.",
    "It's called disruption, Doug. Look it up. Don't look it up."];
  const SHEILA = ["Sheila Vance put a bus bench directly in front of my bus bench.", "Sheila Vance hired a skywriter. It wrote SHEILA. Then SOLD. Then it ran out of sky.",
    "Sheila Vance bought the billboard behind my billboard, so mine looks like it's wearing a hat.", "Sheila Vance is mailing people cookies. Homemade. By her mother. That's a family business. That's my move.",
    "Sheila Vance got a jingle. A jingle, Ma!", "Sheila Vance's flyer has a coupon. You can't coupon a house, Sheila.", "Sheila Vance is doing open houses with a string quartet. Four guys. Strings. In my market.",
    "Sheila Vance renamed her company Crestmark Homes and Also Doug Is Bad. That's defamation, and also very long."];
  function doug(st) {
    st.sheila = (st.sheila || 0) + 1;
    const house = { num: ri(12, 9890), street: pick(STREET), st: pick(STREET_T), town: pick(TOWNS), beds: ri(2, 6) };
    const f = deck(DOUG_FEATURE), fl = pick(DOUG_FLAW), price = `${pick(["two", "three", "four", "five", "six", "seven", "eight"])} hundred ${pick(["forty", "ninety", "twenty five", "seventy five", "sixty"])} thousand`;
    const c1 = fullName(), c2 = fullName(), v = { ...house, feature: f(), feature2: f(), flawshort: fl[0], flaw: fl[1], price, c1: c1.split(" ")[0], c2: c2.split(" ")[0] };
    const twist = pick(["sheila", "owner", "callback"]);
    const L = [
      ["doug", X("[This is|You're listening to|Welcome to] Clap Attack. I'm Doug. Real estate is a family business, and I didn't come here to make friends.", v)],
      ["sfx", "claps"],
      ["doug", X("Listing of the hour. {num} {street} {st}, in {town}. {beds} bedrooms, {feature}, and {feature2}. Asking {price}.", v)],
      ["barb", X("Tell them about {flawshort}, Douglas.", v)],
      ["doug", X("Ma, I'm getting to it. [Small thing|Tiny detail|Minor footnote]: {flaw}. [Some people call that a flaw. I call it a conversation.|That's not a problem. That's character.|Disclose, disclose, disclose. Done. Moving on.]", v)],
      ["doug", "Phones are open. Caller, you're under contract with Clap Attack."],
      ["c1", X(`Hi Doug, it's {c1} from {town}. [${DOUG_WANT.join("|")}].`, v)],
      ["doug", X("{c1}. {c1}. You know what has room for that? {num} {street} {st}.", v)],
      ["c1", X(pick(DOUG_OBJ), v)],
      ["doug", pick(DOUG_REBUT)], ["sfx", "claps"],
      ["c1", X("[Okay. I think I'm in?|Wait, did I just buy a house?|I'll have to ask my ferrets.|Fine. But I'm naming the smell.]", v)],
      ["doug", "That's a verbal yes on the radio, which in this state is basically ink."],
      ["barb", X(`Douglas, while we're live: your cousin Trent [${TRENT_DID.join("|")}].`, v)],
      ["doug", "Ma! On air!"],
      ["trent", pick(TRENT_SAY)],
      ["doug", X("[That's family.|This is what I'm saying.|You see what I deal with?] You can't fire family. I've tried. There's a form, and Ma hid the form.", v)],
      ["doug", SHEILA[(st.sheila - 1) % SHEILA.length]],
      ["barb", "She's very organized, Douglas."],
      ["doug", "Organized, Ma? She's a menace with a label maker."],
      ["doug", "Next caller. You're on Clap Attack."],
    ];
    if (twist === "sheila") L.push(["c2", "Hello, yes. I am a normal buyer. My name is, uh, Shmeila. I'd like to know your commission. For no reason."],
      ["doug", "Sheila?"], ["c2", "Who? I'm Shmeila. Bye."], ["doug", "She hung up. She's scared. Good."]);
    else if (twist === "owner") L.push(["c2", X("Doug, it's {c2}. I own {num} {street}. I forgot to mention [the house is also a church on Sundays|there's a second smell, and it's Glen's brother|the koi is the one who really owns it].", v)],
      ["doug", "Disclosed on air. Legally that's a gift."]);
    else L.push(["c1", X("Doug, it's {c1} again. I moved in during the break. I love {flawshort}.", v)], ["doug", "Fastest close in the history of this program."], ["barb", "That's not legal, Douglas."], ["doug", "It's family legal, Ma."]);
    L.push(["doug", X("[Another deal closed, another friendship declined.|That's the show. I didn't make a single friend, and I sold a house.|Real estate is a family business. Family is a lot.] This has been Clap Attack.", v)], ["sfx", "claps"]);
    return { title: X("[{num} {street} {st}|The {flawshort} situation|Sheila Strikes Again|Trent's Big Week]", v), lines: L, hosts: "Doug, Barb and Trent",
      cast: { doug: { name: "Doug", accent: "american", pitch: .92, rate: 1.12 }, barb: { name: "Barb", accent: "american", pitch: 1.2, rate: .95 }, trent: { name: "Trent", accent: "american", pitch: 1.12, rate: 1.04 },
        c1: callerVoice(c1), c2: callerVoice(c2) } };
  }

  /* ===================== 2. Analyze Biz ===================== */
  const BIZ_WORDS = {
    merger: ["A merger. That's when two companies hold hands in the parking lot, and then one of them gets the car.", "Mergers are like weddings, but the cake is lawyers."],
    acquisition: ["An acquisition. That's a merger where one side didn't get a vote.", "Acquisition. Sounds like a craft store. A very expensive craft store."],
    earnings: ["Earnings. Like earrings, but for a company's ears. Companies have ears now, Squirky. They're listening.", "Earnings season. Like flu season, but with more charts."],
    profit: ["Profit. That's the money left after you stop counting the snacks.", "Profit's up. Somewhere, a guy in a vest is doing a little dance."],
    revenue: ["Revenue. That's French for money that might be leaving.", "Revenue's like profit's cousin who visits but never helps with the dishes."],
    layoff: ["Layoffs are no joke, so instead I'm going to make fun of the word synergy, which has never once helped anyone.", "Rough day for the folks there. We're sending good thoughts and zero buzzwords."],
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
  };
  const BIZ_GENERIC = ["I read that three times and I still think it's about soup.", "That's a lot of words for: a company did a thing.", "Bold. Brave. I don't know what any of it means.",
    "Somewhere a press release is very proud of itself.", "I'm going to need a chart. And a nap. Chart first."];
  const BIZ_METRIC = ["vibes-to-earnings ratio", "snack budget", "number of times the press release says excited", "font size of the apology", "conference call hold music", "ratio of lanyards to people"];
  const FAKECO = ["Blandwell Industries", "Quorvex Holdings", "NimbleCart", "Pantry Dynamics", "Gusto Freight", "Cloudish Incorporated", "Tendril Bancorp", "Moxie Mattress Company", "Brightfold Logistics",
    "Sprocket and Sons", "Lumen Lettuce", "Hollyhock Insurance", "Fizzwick Beverages", "Glimmer Optics", "Ploddington Rail"];
  const PRODUCT = ["smart toasters", "frozen waffles", "office chairs", "self-folding umbrellas", "artisanal ice", "cloud storage", "sleep apps", "decorative geese", "electric scooters", "spreadsheet software"];
  function fakeBizHeadline() {
    return X(`[{co} reports record quarter on strong {product} sales|{co} announces plan to merge with {co2}|{co} pivots to artificial intelligence for {product}|{co} delays launch of {product} line|{co} raises prices on {product}, citing [demand|costs|vibes]|{co} opens flagship store in {town}|{co} shares [rise|fall|wobble] after {product} recall|Startup {co} raises funding to reinvent {product}]`,
      { co: pick(FAKECO), co2: pick(FAKECO), product: pick(PRODUCT), town: pick(TOWNS) });
  }
  function biz(st, data) {
    const live = (data && data.length ? data : []).map(h => ({ title: clean(h.title), source: h.source || "the wires" })).filter(h => h.title.length > 12 && h.title.length < 160);
    const n = ri(3, 5), H = [];
    for (const h of live) { if (H.length >= n) break; if (!H.some(x => x.title === h.title)) H.push(h); }
    while (H.length < n) H.push({ title: fakeBizHeadline(), source: pick(["the Business Ledger", "The Morning Wrapper", "Market Mumble", "the newswire"]), fake: true });
    const L = [
      ["sq", X("[Welcome to|It's time for|You found] Analyze Biz. I'm Squirky Tallume.")],
      ["gregg", X("And I'm Gregg Ploptz. [Two g's at the end, because I'm a business.|I have an M B A. Mostly Being Around.|I wore a tie today. It's a clip-on, but it believes in itself.]")],
      ["sq", X(`We've got ${n2w(n)} headlines. We read the business news so you can misunderstand it faster.`)],
    ];
    H.forEach((h, i) => {
      L.push(["sq", `Headline ${n2w(i + 1)}${h.fake ? "" : `, from ${h.source}`}: ${h.title}.`]);
      const k = keyword(h.title, BIZ_WORDS), mode = pick(["roast", "misread", "analysis"]);
      if (k && mode !== "analysis") L.push([mode === "misread" ? "gregg" : "sq", pick(BIZ_WORDS[k])], [mode === "misread" ? "sq" : "gregg", X("[That's not what it means.|Gregg, no.|I'm writing that down. As a warning.|Honestly, that's how I'll remember it now.|Sure.]")]);
      else if (mode === "analysis") L.push(["sq", X(`Looking at the fundamentals, the ${pick(BIZ_METRIC)} is [up|down|sideways|emotionally unavailable].`)], ["gregg", X("[So, buy?|So, panic?|So we're fine?|So it's a hold. Like a hug.]")], ["sq", X("[No.|Nobody knows. That's the beauty of markets.|We don't give advice. We give vibes.]")]);
      else L.push(["gregg", pick(BIZ_GENERIC)], ["sq", X("[Fair.|Same, Gregg.|I've been in business twenty years and same.]")]);
      if (i === 1) L.push(["gregg", X(`Gregg's Gut Check: I give this one ${n2w(ri(2, 11))} out of ten ${pick(["cantaloupes", "pears", "limes", "kumquats", "rotisserie chickens"])}.`)], ["sq", "The scale goes to ten, Gregg."], ["gregg", "Not in this economy."]);
    });
    L.push(["sq", "That's Analyze Biz. Nothing on this show is financial advice."], ["gregg", X("[It's barely financial. It's not even advice. It's two people near a microphone.|If you made money listening to this, please tell us how.|Remember: buy low, sell high, and never let me near your money.]")]);
    return { title: X(`[${n2w(n)} headlines, zero understanding|Market Moves, Badly|The Fundamentals, Loosely|Quarterly Confusion]`), lines: L, hosts: "Squirky Tallume and Gregg Ploptz", usedLive: H.some(h => !h.fake),
      cast: { sq: { name: "Squirky Tallume", accent: "american", pitch: 1.25, rate: 1.08 }, gregg: { name: "Gregg Ploptz", accent: "american", pitch: .85, rate: .96 } } };
  }

  /* ===================== 3. The Real USB Drives of Cleverly Spillz ===================== */
  const USB_CAST = [["Tiffani Glass-Wexler", "american", 1.25], ["Monique LaFortune", "american", 1.1], ["Brenda Kastle", "australian", 1.15], ["Dawn-Marie Pruitt", "american", 1.3],
    ["Sloane Avery-Huff", "british", 1.05], ["Kiki Delmonte", "american", 1.2], ["Priya Castellanos", "indian", 1.1], ["Gwen O'Hare", "irish", 1.15]];
  const USB_EVENT = ["{a}'s vow renewal at the aquarium", "a charity pickleball gala for retired horses", "{a}'s candle launch, Scent Number Four, which smells like a lawsuit",
    "a book club that has never discussed a book", "the grand opening of a smoothie bar called Juice Laundry", "{a}'s surprise party, which she planned herself", "a yacht brunch on a pontoon boat"];
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
    const pool = USB_CAST.slice().sort(() => R() - .5).slice(0, 4), [A, B, C, D] = pool, sn = x => x[0].split(" ")[0];
    const v = { a: sn(A), b: sn(B), c: sn(C), d: sn(D) };
    v.event = X(pick(USB_EVENT), v); v.found = pick(USB_FOUND); v.file = pick(USB_FILE); v.claim = X(pick(USB_CLAIM), v); v.forged = pick(USB_FORGED);
    const L = [
      ["nar", X(`[Previously on|Tonight, on|This week on] The Real U S B Drives of Cleverly Spillz. ${st.ep > 1 ? "Season " + n2w(Math.min(12, 1 + Math.floor(st.ep / 6))) + ". " : ""}`)],
      ["nar", X("At {event}, {b} finds a U S B drive {found}.", v)],
      ["b", X("Who leaves a U S B drive at {event}? A villain. Or a gift. Either way, I'm plugging it in.", v)],
      ["nar", X("The drive holds one file. {file}.", v)],
      ["b", X("Ladies. It says, and I quote, that {claim}.", v)],
      ["c", X("[That is a lie.|I would never.|Where did you even get a U S B drive? It's twenty twenty-something.|That's not my handwriting. It's typed. Still not my handwriting.]")],
      ["a", X("[Is it true?|So it's true.|I KNEW it.|I have been eating that pasta salad for years, {c}.]", v)],
      ["nar", "Confessional."],
      [pick(["a", "b", "c", "d"]), pick(USB_CONF)],
      ["d", X("[Can I say something?|I wasn't going to say anything, but|Okay, if we're doing this,] {c} also [borrowed my good serving spoon in two thousand nineteen and returned a worse spoon|said my dog looks like a sad landlord|signed my birthday card with just a thumbs up].", v)],
      ["c", X("[That spoon was an upgrade.|Your dog does look like a landlord.|A thumbs up is a full sentence, Dawn.]")],
      ["b", "We need to get to the bottom of this. I called someone."],
      ["nar", "She called Rodney, from the help kiosk at the mall."],
      ["rodney", X("Hi. I looked at the drive. A few things. First, {forged}. Second, [the drive is from a promotional giveaway for a dentist|the label on it says Property of Nobody|it was formatted with a potato, I think].", v)],
      ["rodney", "The drama is real. The data has been forged."],
      ["a", X("[So who forged it?|So nobody said anything about my pasta salad?|Then why do I feel accused?]", v)],
      ["rodney", X("[Could be anyone. Could be a printer. Printers are bitter.|The metadata says the author is, quote, You Know Who. That's all I have.|Honestly? The drive might have done it itself. Some of them get ideas.]")],
      ["nar", "Confessional."],
      ["c", X("[I'm still upset, and I don't even know about what.|I'm choosing peace. I'm also choosing to never pass {b} the bread again.]", v)],
      ["nar", X("[Everyone agrees to forget it. Nobody forgets it.|They toast to friendship. Two of the glasses are empty, on purpose.|{b} keeps the drive. For safekeeping. And for leverage.]", v)],
      ["nar", X("Next time, on The Real U S B Drives of Cleverly Spillz: {d} finds a second drive. [It's shaped like a lipstick. It is also a lipstick.|It has a password. The password is her own name.|It's in her soup.]", v)],
    ];
    const cast = { nar: { name: "Narrator", accent: "american", pitch: .82, rate: .93 }, rodney: { name: "Rodney from the help kiosk", accent: "american", pitch: 1, rate: 1.02 } };
    for (const [k, p] of [["a", A], ["b", B], ["c", C], ["d", D]]) cast[k] = { name: p[0], accent: p[1], pitch: p[2], rate: rr(1, 1.12) };
    return { title: X("[The Drive at {event}|The {file} Incident|Spoon Gate|Forged in Friendship]", { ...v, event: v.event.split(",")[0], file: v.file.split(",")[0] }), lines: L, hosts: "the Real U S B Drives cast", cast };
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
  };
  const GAME_TAN = [["Jersey has jughandles. You want to turn left, you turn right first. It's philosophy.", "Boston has rotaries. You go in, you never come out. Also philosophy."],
    ["Down the shore, the pizza's thin, it's foldable, it's perfect.", "And here the pizza's fine, but the argument about it is better."],
    ["Winter in Jersey, it's a little cold, little gray, very dramatic.", "Winter in Boston, the snow has a mortgage. It lives with you."],
    ["Water. Wood-er. That's how you say it.", "Wahtah. Two syllables. Both of them important."]];
  const GSTUDIO = ["Pixelforge", "Gamma Raccoon", "Lucky Spoon Studios", "Nine Volt Games", "Bramble and Byte", "Overcast Interactive", "Tin Can Telescope"];
  const gameTitle = () => X("[Crimson|Hollow|Neon|Galactic|Feral|Infinite|Turbo|Paper|Iron Lunch] [Quest|Protocol|Kingdom|Racer|Siege|Legacy|Odyssey|Garden|Parade]: [Reckoning|Origins|The Lost Sock|Remastered Remix|Tax Season|Snack Edition|Second Breakfast]");
  const fakeGameHeadline = () => X(`[{g} gets surprise patch that fixes the horses|{g} delayed to [spring|next year|the heat death of the universe]|{s} announces sequel to {g}|Speedrunner beats {g} in ${ri(4, 59)} minutes|{g} update adds [fishing|a dog you can pet|a second dog]|Open world map for {g} revealed to be very big|{s} launches new controller with ${ri(19, 41)} buttons|{g} beta servers buckle under demand]`, { g: gameTitle(), s: pick(GSTUDIO) });
  function buttons(st, data) {
    const live = (data && data.length ? data : []).map(h => ({ title: clean(h.title), source: h.source })).filter(h => h.title.length > 12 && h.title.length < 160);
    const n = ri(3, 4), H = [];
    for (const h of live) { if (H.length >= n) break; if (!H.some(x => x.title === h.title)) H.push(h); }
    while (H.length < n) H.push({ title: fakeGameHeadline(), fake: true });
    const L = [
      ["sal", X("Ayy, it's Button Mashers. I'm Sal, from Jersey. Exit [nine|eleven|fourteen|one forty], don't ask which way.")],
      ["kev", "And I'm Kev, from Boston. We love video games."],
      ["sal", "Love 'em. Never played one."],
      ["kev", X("Not once. [We watch the videos.|We read the headlines.|We've held a controller. It was in a box. At a store.] We have opinions.")],
    ];
    H.forEach((h, i) => {
      L.push([i % 2 ? "kev" : "sal", `${i === 0 ? "First" : i === n - 1 ? "Last" : "Next"} headline${h.fake ? "" : ", from " + (h.source || "the internet")}: ${h.title}.`]);
      const k = keyword(h.title, Object.fromEntries(Object.keys(GAME_WORDS).map(x => [x, 1])));
      if (k) L.push(...GAME_WORDS[k].map(x => [x[0], x[1]]));
      else L.push(["kev", X("[Wicked exciting.|I watched a video about that. Or a different thing. Same energy.|That sounds like a lot of buttons.]")], ["sal", X("[Do they eat in it? I need to know if there's food.|Is there a dog? I don't play games without a dog. I don't play games.|I'd play that. I won't. But I would.]")]);
      L.push([i % 2 ? "sal" : "kev", X(`Rating: [${n2w(ri(2, 10))} quarters out of a roll|${n2w(ri(2, 5))} slices out of a pie|wicked good|fuhgeddaboudit, and I mean that nicely].`)]);
      if (i === 1) { const t = pick(GAME_TAN); L.push(["sal", t[0]], ["kev", t[1]], ["sal", "Anyway. Video games."]); }
    });
    L.push(["kev", "That's Button Mashers. Go play a video game for us."], ["sal", X("And call in and tell us how it ends. [We'll never know otherwise.|We're too scared to find out.|My nephew won't tell me.]")]);
    return { title: X(`[Never Played It: ${n2w(n)} headlines|Press Start, Probably|The Boss Fight Was a Parking Spot|Watching Is Basically Playing]`), lines: L, hosts: "Sal and Kev", usedLive: H.some(h => !h.fake),
      cast: { sal: { name: "Sal", accent: "american", pitch: .95, rate: 1.12 }, kev: { name: "Kev", accent: "american", pitch: 1.06, rate: 1.16 } } };
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
    const a = data && data.animal ? ANIMALS.find(x => x[0] === data.animal) || pick(ANIMALS) : pick(ANIMALS);
    const name = a[1], from = pick(ANIMAL_NAMES), to = pick(ANIMAL_NAMES.filter(x => x !== from));
    let facts = a[2].slice(), live = false;
    if (data && data.wiki && data.wiki.extract) {
      const s = String(data.wiki.extract).replace(/\s*\([^)]*\)/g, "").split(/(?<=\.)\s+/).map(x => x.trim()).filter(x => x.length > 25 && x.length < 220).slice(0, 3);
      if (s.length >= 2) { facts = s; live = true; }
    }
    const v = { name, Name: name[0].toUpperCase() + name.slice(1), from, to };
    const letter = (w = v) => { const b = deck(LETTER_BODY); return [X(pick(LETTER_OPEN), w), X(b(), w), X(b(), w), X(pick(LETTER_CLOSE), w)].join(" "); };
    const reply = chance(.5), v2 = reply ? { ...v, from: to, to: from } : v;
    const L = [
      ["organ", "romance"],
      ["amb", X("[The {name}.|Consider the {name}.|There was, and there still is, the {name}.]", v)],
      ["amb", X("[(the camera moves, very slowly, across a photograph of a {name} who did not wish to be photographed)|(a slow pan across a field. Somewhere in it, a {name}.)|(an old photograph. A {name}. Unbothered.)]", v)],
      ["amb", live ? `The encyclopedia tells us: ${facts[0]}` : facts[0]],
      ["amb", X("[In the archives, there is a letter.|We found a letter. We do not know how.|One letter survives.]", v)],
      ["sfx", "page"],
      ["reader", letter()],
      ["amb", X("[And so the {name} went on, as {name}s do.|The {name} did not answer the letter. It did not need to.|History does not record whether {to} wrote back. But it is likely.]", v)],
      ["amb", facts[1]],
      ...(facts[2] ? [["amb", facts[2]]] : []),
      ["amb", reply ? X("[Then, years later, a reply. From {from}.|{from} did write back. Of course {from} wrote back.]", v2) : "A second letter, written in the same hand, which is to say, no hand at all."],
      ["sfx", "page"],
      [reply ? "reader2" : "reader", letter(v2)],
      ["amb", X("[The {name}. It did not need us to notice. But we did.|We look at the {name}. The {name}, mostly, does not look back.|That was the {name}. Take your time with it. It is taking its time with you.]", v)],
      ...(live ? [["amb", "Facts from Wikipedia, the free encyclopedia."]] : []),
    ];
    return { title: v.Name, lines: L, hosts: "Ambrose Hale", usedLive: live,
      cast: { amb: { name: "Ambrose Hale", accent: "british", pitch: .9, rate: .82 }, reader: { name: `${from} the ${name}, as read`, accent: pick(["american", "irish", "scottish"]), pitch: .95, rate: .86 },
        reader2: { name: `${to} the ${name}, as read`, accent: pick(["australian", "southafrican", "british"]), pitch: 1.1, rate: .88 } } };
  }

  /* ===================== 6. Lost & Found Live ===================== */
  const LF_ITEM = ["a left mitten shaped like a lobster", "a ring of keys with no keys on it, just the ring", "a retainer in a sandwich bag labeled NOT A SANDWICH", "a parrot named Professor",
    "a framed photo of somebody else's grandma", "one rollerblade", "a bowling trophy for Most Improved", "a garden gnome with a mustache drawn on", "a laptop full of recipes for one specific soup",
    "a cat that isn't technically mine", "an entire wedding cake, top tier only", "a tuba, small", "a library book from nineteen ninety-one", "my sense of direction, apparently"];
  const LF_PLACE = ["at the bus station", "on the number fourteen bus", "outside the bowling alley", "at a funeral, but a fun one", "at the D M V", "in a dream, but it felt real", "at the county fair, near the goats",
    "at the laundromat, dryer six", "in the self-checkout line", "at my cousin's wedding, during the chicken dance"];
  const LF_DETAIL = ["It answers to the name Bartholomew.", "It has my initials on it, but they're wrong.", "It smells like oranges. It shouldn't.", "There's a sticker on it that says ASK ME ABOUT IT.", "It's slightly damp. It was always slightly damp."];
  const LF_BOX = ["the box at the front desk is still ticking", "the box at the front desk has started ticking faster", "the box at the front desk now hums when you walk past", "the box at the front desk moved six inches to the left overnight"];
  function lost(st) {
    st.box = (st.box || 0) + 1;
    const callers = [fullName(), fullName(), fullName()], it = deck(LF_ITEM), items = [it(), it(), it()], places = deck(LF_PLACE);
    const nm = i => callers[i].split(" ")[0];
    const L = [["marlo", X("[Welcome to|You've reached|Good evening and welcome to] Lost and Found Live. I'm Marlo Finch. You lose it, we talk about it, sometimes we find it.")],
      ["marlo", `Quick update before we start: ${LF_BOX[(st.box - 1) % LF_BOX.length]}. If it's yours, call us. Gently.`]];
    callers.forEach((c, i) => {
      L.push(["marlo", `${pick(["Line one", "Line two", "Line three", "Next caller", "Go ahead"])}, you're on Lost and Found Live.`]);
      L.push([`c${i}`, `Hi Marlo, it's ${nm(i)}. I lost ${items[i]} ${places()}.`]);
      L.push(["marlo", X("[Describe it for me.|Any distinguishing features?|When did you last see it?|And how are you holding up?]")]);
      L.push([`c${i}`, pick(LF_DETAIL)]);
      if (i > 0) L.push(["marlo", X(`Well, ${nm(i)}, good news. Somebody turned in ${items[i - 1]}. Is that yours?`)], [`c${i}`, X("[No.|It is not.|...Can I have it anyway?|I'll take it. I'll make it work.]")],
        ["marlo", X(`[Great. Reunited. Sort of.|Close enough. ${nm(i - 1)}, if you're listening, ${nm(i)} has your stuff now.|That's a match in spirit.]`)]);
    });
    L.push(["marlo", "One more caller. You're on the air."], ["owner", X("Hi. Marlo. That box at the front desk? That's mine. [It's a clock. For my bird. It's a bird clock.|It's a gift for my sister. It's a smaller box with a clock in it. She hates surprises.|It's my lunch. It ticks because it's a very old lunch.]")],
      ["marlo", X("[Mystery solved. Please come get it before it does something.|That's the most relieved I've been on this show.|We'll leave it at the desk. Bring a towel. Just in case.]")],
      ["marlo", "That's Lost and Found Live. If you can't find it, it's probably in your other coat.", ]);
    const cast = { marlo: { name: "Marlo Finch", accent: "american", pitch: 1.1, rate: 1 }, owner: callerVoice("The box owner") };
    callers.forEach((c, i) => cast[`c${i}`] = callerVoice(c));
    return { title: X(`[The Ticking Box|Please Check Your Pockets|The Ticking Box|Reunited, Sort Of|Have You Checked Your Other Coat]`), lines: L, hosts: "Marlo Finch", cast };
  }

  /* ===================== 7. The Committee ===================== */
  const HOA_ITEM = ["the color of the community bench", "whether geese count as residents", "a request to rename Pine Court to Pine Court, Respectfully", "the pool's new rule about splashing with intent",
    "the leaf blower curfew", "someone's inflatable dragon, which is still up, and it's March", "the speed bump that residents describe as a wall", "the community garden's zucchini surplus",
    "a proposal to replace the welcome sign with a slightly more welcoming sign", "the dog that keeps attending meetings"];
  const RON = ["Ron's mailbox is now eleven inches taller than code allows.", "Ron's mailbox has a small porch.", "Ron's mailbox now has its own mailbox.", "Ron's mailbox has been painted a color the complaint calls aggressively teal.",
    "Ron installed a doorbell on his mailbox. It plays the first four notes of a song. Nobody can name it.", "Ron's mailbox has a flag. Not the mail flag. A flag. With a crest.", "Ron's mailbox is running for the board."];
  const RON_DEF = ["It's a mailbox, Patricia. It's for mail. It's thriving.", "The code doesn't say anything about porches.", "I'm expressing myself through infrastructure.", "Every mailbox deserves a mailbox.", "I have a permit. It's laminated."];
  function hoa(st) {
    st.ron = (st.ron || 0) + 1;
    const agenda = deck(HOA_ITEM), i1 = agenda(), i2 = agenda(), res = fullName();
    const v = { i1, i2, res: res.split(" ")[0], time: `${pick(["seven", "eight", "nine"])} ${pick(["oh five", "twelve", "forty", "fifty-one"])} P M` };
    const L = [["sfx", "knock"],
      ["pat", X("This meeting of the [Willowmere|Larkspur Glen|Pheasant Run|Badger Hollow] Homeowners Association will come to order. I'm the chair, Patricia Vole.")],
      ["denise", "Roll call. Gerald."], ["gerald", "Present."], ["denise", "Ron."], ["ron", "Present, and so is my mailbox."], ["pat", "Noted. Unfortunately."],
      ["pat", X("First item: {i1}.", v)],
      ["gerald", X("[I move that we form a subcommittee.|I move that we table it.|I move that we vote on whether to vote.]")], ["denise", "Second."],
      ["ron", "Point of order."], ["pat", "Ron, it's never a point of order."], ["ron", "It's a point of order in my heart."],
      ["pat", X("All in favor? [Motion carries.|Motion fails. Narrowly. Shamefully.|It's a tie, and the dog abstained.]")],
      ["pat", X("New business. We have a new resident, {res}, who asked to speak.", v)],
      ["res", X("Hi. I just moved in. I wanted to ask about [trash day|the pool hours|the geese] and I've been here two hours.")],
      ["pat", "Welcome. You'll get used to it. Nobody does."],
      ["pat", X("Second item: {i2}.", v)],
      ["denise", X("[For the minutes, I'd like to note that I hate this.|The minutes will reflect a long sigh.|I'm writing down that Gerald brought a slideshow.]")],
      ["gerald", X("[I brought a slideshow.|I've prepared nine slides and a handout.|I have a laser pointer and I'm not afraid to use it.]")],
      ["pat", "We don't have a projector, Gerald."], ["gerald", "I'll describe them."],
      ["pat", "Final item. Complaint number " + (40 + st.ron * 3) + ". " + RON[(st.ron - 1) % RON.length]],
      ["ron", pick(RON_DEF)],
      ["denise", X("[Ron, it has a weather vane.|Ron, I got mail from your mailbox. It was a thank-you note.|Ron, the mailbox waved at my son.]")],
      ["ron", X("[He's friendly.|That's a feature.|I'll allow it.]")],
      ["pat", X("[We'll revisit this next month.|Motion to fine Ron one dollar. Seconded. Ron pays in quarters. From the mailbox.|The board will form a mailbox task force, which Ron will also be on, somehow.]")],
      ["pat", X("This meeting is adjourned at {time}.", v)], ["sfx", "knock"]];
    return { title: X("[Points of Order|The Mailbox Question, Part " + n2w(Math.min(12, st.ron)) + "|Minutes, Unfortunately|Old Business, New Grudges]"), lines: L, hosts: "Patricia Vole and the board",
      cast: { pat: { name: "Patricia Vole, chair", accent: "british", pitch: 1, rate: .96 }, gerald: { name: "Gerald, treasurer", accent: "american", pitch: .82, rate: .92 },
        denise: { name: "Denise, secretary", accent: "american", pitch: 1.2, rate: 1.04 }, ron: { name: "Ron", accent: "american", pitch: .92, rate: 1.1 }, res: callerVoice(res) } };
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
    L.push(["organ", "mystery"], ["vic", `Overnight Shipping. Case ${n2w(st.case)}, chapter ${n2w(ch + 1)}.`]);
    if (ch > 0) L.push(["vic", `Previously: package ${v.code}, label reading ${v.label}. ${ch > 1 ? "A missing tray. " : ""}${ch > 2 ? "A clue I didn't like. " : ""}${ch > 3 ? "A forklift who said more than he meant to." : ""}`]);
    L.push(...STAGES[ch](v));
    if (ch > 0 && ch < STAGES.length - 1) {   // a suspect every middle chapter: a different night-shift worker, alibi and tell each time
      const who = susName = fullName(), job = pick(SUSPECT_JOB), first = who.split(" ")[0];
      L.push(["vic", `Before I followed it, I had a talk with ${who}, ${job}. ${pick(["Nervous type.", "Calm type. Too calm.", "Wore sunglasses indoors. At night.", "Had a sandwich in each hand and no explanation."])}`],
        ["suspect", X(`[Where was I? Where was I. I was at ${pick(SUSPECT_ALIBI)}.|I was at ${pick(SUSPECT_ALIBI)}. Ask anybody. Don't ask anybody.|You can't pin this on me, Tally. I was at ${pick(SUSPECT_ALIBI)}.]`)],
        ["vic", X(`[Funny. ${pick(SUSPECT_TELL)}|Sure, ${first}. Sure. Except ${pick(SUSPECT_TELL).toLowerCase()}]`)],
        ["suspect", X("[Okay, I took a stapler. One stapler. That's all I did.|I want a lawyer. Or a union rep. Or a pretzel.|That's circumstantial. Look it up. I looked it up.]")],
        ["vic", X("[They didn't do it. People who take staplers never do. But they knew something.|I let them go. You can't book someone for being weird on the night shift. Believe me, I've tried.]")]);
    }
    if (ch < STAGES.length - 1) L.push(["vic", X("[To be continued. Probably at night. Everything is.|Next time: the truth, or something wearing its jacket.|Stay tuned. The belt keeps moving.]")], ["organ", "sting"]);
    else L.push(["organ", "outro"]);
    st.stage++;
    return { title: `Case ${n2w(st.case)}, Chapter ${n2w(ch + 1)}`, lines: L, hosts: "Vic Tally",
      cast: { vic: { name: "Vic Tally", accent: "american", pitch: .78, rate: .92 }, dolores: { name: "Dolores, night supervisor", accent: "american", pitch: 1.05, rate: 1 },
        lou: { name: "Big Lou, a forklift", accent: "robot", pitch: 1, rate: 1 }, mole: { name: "The mole in Returns", accent: "robot", names: ["Trinoids", "Zarvox"], pitch: 1.2, rate: 1 }, suspect: callerVoice(susName || "A suspect") } };
  }

  /* ===================== 9. Ask a Retired Wizard ===================== */
  const WIZ_PROB = [["my wifi", "my wifi drops every time the microwave runs"], ["my roommate", "my roommate labels his food with threats"], ["the group chat", "the group chat went quiet and I think it's my fault"],
    ["my printer", "my printer only prints the word no"], ["my neighbor's dog", "my neighbor's dog stares at me through the fence, every day, with judgment"], ["my car", "I keep losing my car in parking lots"],
    ["my sourdough", "my sourdough starter has stopped believing in me"], ["my calendar", "every meeting I schedule turns into two meetings"]];
  const SYL = ["Gor", "ble", "flax", "um", "zan", "thra", "mox", "pell", "quin", "dor", "vex", "ia", "noo", "brack"];
  const spell = () => { const w = () => pick(SYL) + pick(SYL) + (chance(.5) ? pick(SYL).toLowerCase() : ""); return `${w()} ${w()}, ${w()}!`; };
  const INGR = ["a thimble of lukewarm tea", "the receipt from something you regret", "one bay leaf, dried with intention", "a whisper of cinnamon", "a single shoelace, untied", "a spoon you trust", "a sticky note that says sorry"];
  const WIZ_RETIRE = ["Retirement is lovely. I play shuffleboard. I cheat, a little. Telekinetically.", "My old staff is a curtain rod now. It still glows when I'm sad.", "The condo board fined me for my tower. I told them it's a balcony. It's a tower.",
    "I used to fight dragons. Now I fight the thermostat in the clubhouse. The dragons were more reasonable."];
  function wizard(st) {
    const P = WIZ_PROB.slice().sort(() => R() - .5), c = [fullName(), fullName(), fullName()], nm = i => c[i].split(" ")[0];
    const s1 = spell(), ing = deck(INGR);
    const L = [["ald", X("[Hello, hello. This is Ask a Retired Wizard. I am Aldric Fennimore, formerly of the High Tower, currently of Seaside Pines condos, unit four B.|Ask a Retired Wizard. I'm Aldric. I have seen the end of ages and the start of daylight saving time. Ask me anything.]")],
      ["ald", "First caller, you are on the air. Speak your woe."],
      ["c0", `Hi Aldric. It's ${nm(0)}. ${P[0][1][0].toUpperCase() + P[0][1].slice(1)}.`],
      ["ald", X(`Ah. A classic affliction. Take ${ing()} and ${ing()}. Walk three times around ${P[0][0]}, counterclockwise, and say: ${s1}`)],
      ["c0", X("[Out loud?|At work?|Does it have to be counterclockwise?]")], ["ald", X("[Loudly. Magic is a confidence game.|Especially at work.|Clockwise summons a mild ghost. Don't.]")],
      ["ald", "Next caller."],
      ["c1", `Hey, it's ${nm(1)}. ${P[1][1][0].toUpperCase() + P[1][1].slice(1)}.`],
      ["ald", X(`[Simple. Write its true name on ${ing()} and leave it under your pillow.|Have you tried turning it off and on again? That's an old spell. Very old. Older than me.|Burn nothing. Just look at it with tremendous disappointment. Wizards' glare. Works on most things.]`)],
      ["c1", "That's it?"], ["ald", "Magic is mostly follow-through."],
      ["ald", pick(WIZ_RETIRE)],
      ["ald", "One more. You're on the air."],
      ["c2", `Hi, I'm ${nm(2)}. I live next to ${nm(0)}, the one with ${P[0][0]}. They did your spell. Now ${P[0][0]} is ${pick(["humming", "politely asking for things", "slightly taller", "glowing a soft green", "following them to the mailbox"])}.`],
      ["ald", X("[Ah. Side effects. They wear off. Usually.|That means it worked. Mostly. Partially. It worked adjacent.|Tell them to say the spell backwards. Quietly. Then go get a sandwich.]")],
      ["ald", X("[Magic is real, results may vary. This has been Ask a Retired Wizard.|Remember: every problem has a spell, and every spell has a problem. Goodnight.|That's our hour. I'm off to shuffleboard. Don't call the clubhouse. They know my voice.]")]];
    const cast = { ald: { name: "Aldric Fennimore, retired wizard", accent: "british", pitch: .75, rate: .86 } };
    c.forEach((x, i) => cast[`c${i}`] = callerVoice(x));
    return { title: X(`[The Trouble with ${P[0][0].replace(/^my /, "Your ")}|Spells for Modern Living|Side Effects May Vary|Counterclockwise]`), lines: L, hosts: "Aldric Fennimore", cast };
  }

  const SHOWS = [
    { id: "doug", name: "Clap Attack with Doug", label: "Clap Attack with Doug", tag: "Real estate is a family business, and Doug didn't come to make friends.", make: doug },
    { id: "biz", name: "Analyze Biz", label: "Analyze Biz", tag: "Squirky Tallume and Gregg Ploptz read the business news.", make: biz, needs: "business" },
    { id: "usb", name: "The Real U S B Drives of Cleverly Spillz", label: "Real USB Drives of Cleverly Spillz", tag: "The drama is real. The data has been forged.", make: usb },
    { id: "buttons", name: "Button Mashers", label: "Button Mashers", tag: "Sal and Kev love video games. They've never played one.", make: buttons, needs: "gaming" },
    { id: "nature", name: "The Long Look", label: "The Long Look (nature)", tag: "Ambrose Hale, and an animal, taking their time.", make: nature, needs: "animal" },
    { id: "lost", name: "Lost and Found Live", label: "Lost & Found Live", tag: "You lose it, we talk about it.", make: lost },
    { id: "hoa", name: "The Committee", label: "The Committee (an HOA meeting)", tag: "Live from the clubhouse. Bring a folding chair.", make: hoa },
    { id: "ship", name: "Overnight Shipping", label: "Overnight Shipping (a serial)", tag: "A detective, a package and a forklift named Big Lou.", make: ship },
    { id: "wizard", name: "Ask a Retired Wizard", label: "Ask a Retired Wizard", tag: "Aldric Fennimore answers your problems, magically.", make: wizard },
  ];
  return {
    shows: SHOWS.map(s => ({ id: s.id, name: s.name, label: s.label, tag: s.tag, needs: s.needs || null })),
    animals: () => ANIMALS.map(a => a[0]),
    episode(id, data, state) { const s = SHOWS.find(x => x.id === id); const ep = s.make(state, data); return { ...ep, show: s.name, showId: s.id, tag: s.tag }; },
    id, next: id => next(SHOWS.find(x => x.id === id)),
  };
}
