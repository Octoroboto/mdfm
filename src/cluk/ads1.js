// CLUK 92.3 radio ads, batch one. Played between songs.
const CLUK_ADS_1 = [

  // ---------- Ned's Lazer Emporium and Repair (4) ----------
  { title: "Ned's Lazer Emporium: Hello Friends",
    cast: { ned: { name: "Ned Plumley", accent: "american", pitch: 1.08, rate: 1.03 } },
    lines: [
      ["ned", "Hi. It's Ned, from Ned's Lazer Emporium and Repair in Lower Wing. Lazer with a Z. The Z is for zing."],
      ["ned", "We've got red lazers, green lazers, and one blue lazer that I'm honestly a little scared of, so that one stays in the case."],
      ["sfx", "laser"],
      ["ned", "That was a demonstration. I pointed it at the floor. We always point at the floor, or the wall, or a nice piece of cardboard. Never at eyes."],
      ["ned", "Not your eyes, not your friend's eyes, not a cat's eyes. Eyes are for seeing lazers, not for receiving them."],
      ["ned", "Come on in. I'll show you the little dot. Everybody loves the little dot. I've been doing this nineteen years and I still love the little dot."],
      ["ned", "Ned's Lazer Emporium and Repair. Under the big sign shaped like a beam. I'll be here."],
    ] },

  { title: "Ned's Lazer Emporium: The Repair Desk",
    cast: {
      ned: { name: "Ned Plumley", accent: "american", pitch: 1.08, rate: 1.03 },
      marjorie: { name: "Marjorie Tull", accent: "irish", pitch: 0.95, rate: 0.95 },
    },
    lines: [
      ["ned", "Ned here. Today I want you to meet a customer. Marjorie, tell them what you brought in."],
      ["marjorie", "My late husband's lazer pointer. He used it to point at things he liked. Grain prices, birds on the Ribs mural, me."],
      ["ned", "And it stopped working. And I opened it up, and it was the battery. It was just the battery, Marjorie."],
      ["marjorie", "He'd have been so embarrassed."],
      ["ned", "I put a new one in. Ten grain. And then we both stood in my shop and pointed at the nicest thing we could find."],
      ["marjorie", "It was a calendar of the Wattle in springtime."],
      ["ned", "It was a really good calendar. Ned's Lazer Emporium and Repair. We fix the little things that mean the big things."],
    ] },

  { title: "Ned's Lazer Emporium: About Beamz",
    cast: { ned: { name: "Ned Plumley", accent: "american", pitch: 1.08, rate: 1.03 } },
    lines: [
      ["ned", "Hi, Ned again. Some of you have asked me about Beamz, the new lazer chain that opened up across the street. Beamz with a Z. Also a Z."],
      ["ned", "And I want to say, honestly, welcome. I think it's great. The more lazers in Lower Wing, the brighter Lower Wing gets. That's just science."],
      ["ned", "Their manager is a young man named Corey and he waved at me through the window on Tuesday. I waved back. With my hand, not a lazer."],
      ["ned", "If Beamz has the lazer you want and I don't, go to Beamz. Tell Corey Ned says hi. He's doing a great job with the window display."],
      ["pause", 800],
      ["ned", "If you want somebody to explain every button for forty minutes, though, I'm right here. I have a chair for you. It's a good chair."],
      ["ned", "Ned's Lazer Emporium and Repair. Never at eyes. Always with love."],
    ] },

  { title: "Ned's Lazer Emporium: Egg Day Show",
    cast: {
      ned: { name: "Ned Plumley", accent: "american", pitch: 1.08, rate: 1.03 },
      corey: { name: "Corey Vance", accent: "australian", pitch: 1.0, rate: 1.05 },
    },
    lines: [
      ["ned", "Ned here, with a big announcement. This Egg Day, Ned's Lazer Emporium is putting on a free lazer show in the parking lot. Everybody's invited."],
      ["ned", "And I'm not doing it alone. Say hi, Corey."],
      ["corey", "Hi. Corey from Beamz. Ned asked if we had a fog machine. We had two."],
      ["ned", "We are going to point every lazer we own at the Ribs and make the biggest little dot anybody has ever seen."],
      ["corey", "We tested it last night. You could see it from the Keel. People pulled over."],
      ["ned", "A man in a van cried. He said he didn't know why. I said, buddy, that's lazers."],
      ["sfx", "laser"],
      ["ned", "Bring a blanket. Bring a friend. Leave your eyes pointed up and your lazers pointed away. Ned's Lazer Emporium and Repair. And Beamz."],
      ["corey", "And Beamz."],
    ] },

  // ---------- Big Dougie's Keel Auto Mall (4) ----------
  { title: "Big Dougie's: Gridlock Sale",
    cast: { dougie: { name: "Big Dougie Marsh", accent: "american", pitch: 0.88, rate: 1.1 } },
    lines: [
      ["dougie", "Big Dougie here, at Big Dougie's Keel Auto Mall, and it's the Gridlock Sale!"],
      ["dougie", "You're sitting on the Keel right now. You haven't moved in forty minutes. Why not sit there in a brand new car?"],
      ["dougie", "Every car on my lot comes with a cup holder, a horn, and a seat that leans back so far you can see the Ribs."],
      ["sfx", "crash"],
      ["dougie", "That's fine. That's a demo model. Zero down, zero interest, zero reason to keep driving that old thing."],
      ["dougie", "Big Dougie's Keel Auto Mall. Exit Nine. You'll get there eventually."],
    ] },

  { title: "Big Dougie's: The Boat",
    cast: { dougie: { name: "Big Dougie Marsh", accent: "american", pitch: 0.88, rate: 1.1 } },
    lines: [
      ["dougie", "Big Dougie here. Folks, I've got too many cars. I've got cars on the lot, cars in the service bay, I've got a car in my office. I eat lunch in it."],
      ["dougie", "So here's the deal. Buy any car this week and I will throw in my boat."],
      ["dougie", "Now, there is no water inside the Chicken. I know that. I knew that when I bought the boat."],
      ["dougie", "It's a beautiful boat. It sits on a trailer in my driveway and my neighbor asks about it every day. You could have that. You could have the asking."],
      ["dougie", "Big Dougie's Keel Auto Mall. Exit Nine. Car plus boat. Please."],
    ] },

  { title: "Big Dougie's: Living on the Lot",
    cast: {
      dougie: { name: "Big Dougie Marsh", accent: "american", pitch: 0.88, rate: 1.1 },
      linda: { name: "Linda Marsh", accent: "american", pitch: 1.12, rate: 0.97 },
    },
    lines: [
      ["dougie", "Big Dougie here, and I want to talk to you live from the lot, where I am currently sleeping."],
      ["linda", "He's not sleeping there. He's choosing to sleep there."],
      ["dougie", "That's my wife Linda. She says I'm not allowed to say I'm desperate on the radio anymore."],
      ["linda", "Because it scares people, Doug."],
      ["dougie", "So I'm not desperate. I'm motivated. I'm so motivated I'll sell you a minivan for whatever's in your pocket right now. Check your pocket."],
      ["dougie", "Is it a button? I'll take a button. I'll take a nice rock from the Gizzard."],
      ["linda", "Come home, Doug."],
      ["dougie", "Big Dougie's Keel Auto Mall. Exit Nine. I'm in the blue sedan with the dome light on."],
    ] },

  { title: "Big Dougie's: Just Come By",
    cast: { dougie: { name: "Big Dougie Marsh", accent: "american", pitch: 0.88, rate: 0.96 } },
    lines: [
      ["dougie", "Hey. It's Dougie. No sale this week. No boat. Linda took the boat, which, fair."],
      ["dougie", "I just wanted to say the lot gets real quiet after Feed Time. The flags flap a little. The Heart goes thump. It's nice, actually."],
      ["dougie", "You don't have to buy a car. Come sit in one. Honk the horn. I'll bring out the good folding chairs and we'll watch the Keel crawl by."],
      ["pause", 900],
      ["dougie", "And if you happen to fall in love with a mid-size crossover while you're here, I won't stop you. I'll be so happy. I'll be so incredibly happy."],
      ["dougie", "Big Dougie's Keel Auto Mall. Exit Nine. Bring a friend. I could use one too."],
    ] },

  // ---------- Comb Mountain Spa (3) ----------
  { title: "Comb Mountain Spa: Summit Grit Facial",
    cast: {
      host: { name: "Celestine Aubade", accent: "british", pitch: 1.05, rate: 0.9 },
    },
    lines: [
      ["host", "At Comb Mountain Spa, high atop the Comb, we believe your face deserves altitude."],
      ["host", "Introducing the Summit Grit Facial. Grit harvested by hand from the very tip of the highest peak of the Comb, where the grit is lonely and therefore pure."],
      ["host", "Each grain is warmed between the palms of a trained attendant, then whispered to, then placed upon your cheek. One grain per visit."],
      ["host", "Your face will not look different. But it will know."],
      ["host", "Comb Mountain Spa. Four sacks. Appointments by letter only."],
    ] },

  { title: "Comb Mountain Spa: Heart Immersion",
    cast: {
      host: { name: "Celestine Aubade", accent: "british", pitch: 1.05, rate: 0.9 },
      guest: { name: "Mrs. Penhallow-Vane", accent: "scottish", pitch: 0.92, rate: 0.95 },
    },
    lines: [
      ["host", "At Comb Mountain Spa, we asked a simple question. What if you could hear the Heart slightly better than other people?"],
      ["host", "Our new Heart Immersion suite has been carved forty feet closer to the Heart than any private residence in the Comb."],
      ["guest", "I went in a woman who heard the Heart. I came out a woman who heard it a little bit more."],
      ["sfx", "clock"],
      ["host", "Every beat is followed by a warm towel. Every other beat, by a smaller warmer towel."],
      ["guest", "My husband asked how it was. I didn't answer him for nine days."],
      ["host", "Comb Mountain Spa. Forty sacks. If you are calling about price, you have already been placed on a list."],
    ] },

  { title: "Comb Mountain Spa: The Bawk Vault",
    cast: {
      host: { name: "Celestine Aubade", accent: "british", pitch: 1.05, rate: 0.9 },
      attendant: { name: "Rupert", accent: "southafrican", pitch: 0.9, rate: 0.95 },
    },
    lines: [
      ["host", "Why hold onto a railing during the Bawk, when the Bawk could hold onto you?"],
      ["host", "Introducing the Bawk Vault at Comb Mountain Spa. A silk-lined chamber where, when the Bawk comes, you are held by a dedicated attendant."],
      ["attendant", "Hello. I'm Rupert. I will be holding you."],
      ["sfx", "thunder"],
      ["attendant", "There. You were held."],
      ["host", "Rupert has held a former Coop Council chair, two Oyster heiresses and a gentleman who cannot be named but whose name rhymes with Shmarlan."],
      ["attendant", "I have also held myself, on my day off. It is not the same."],
      ["host", "Comb Mountain Spa. Price available upon inheritance."],
    ] },

  // ---------- Yolkist Fellowship of Lower Wing (2) ----------
  { title: "Yolkist Fellowship: Egg Day Potluck",
    cast: {
      pastor: { name: "Pastor Lorna Bellweather", accent: "irish", pitch: 1.0, rate: 0.94 },
      deacon: { name: "Deacon Felix Oduya", accent: "american", pitch: 0.92, rate: 0.95 },
    },
    lines: [
      ["pastor", "Hello, neighbors. This is Pastor Lorna from the Yolkist Fellowship of Lower Wing."],
      ["pastor", "Every Egg Day, we gather in the basement, which is the closest any of us can get to where the Egg goes, and we have a potluck."],
      ["deacon", "Felix here. I bring the grain salad. It's the same grain salad every time. People have started to look forward to the disappointment."],
      ["pastor", "We don't know where the Egg goes. That's sort of our whole thing. But we know where the folding tables go, and you're welcome at all of them."],
      ["deacon", "No sign-up sheet. Just come."],
      ["pastor", "The Yolkist Fellowship of Lower Wing. Down the stairs, past the coat hooks, into the warm."],
    ] },

  { title: "Yolkist Fellowship: Felix Doesn't Know",
    cast: {
      deacon: { name: "Deacon Felix Oduya", accent: "american", pitch: 0.92, rate: 0.95 },
      pastor: { name: "Pastor Lorna Bellweather", accent: "irish", pitch: 1.0, rate: 0.94 },
    },
    lines: [
      ["deacon", "Hi. It's Felix, from the Yolkist Fellowship. Pastor Lorna said I could do this one by myself."],
      ["deacon", "I've been a Yolkist for thirty years, and last week a kid asked me where the Egg goes, and I said, I don't know, buddy. And I felt so good."],
      ["deacon", "Thirty years. I don't know. Nobody here knows. We sit together not knowing on Thursdays at seven."],
      ["pastor", "Felix, you're doing great."],
      ["deacon", "She's in the room. She said I could do it alone but she's in the room."],
      ["pastor", "Thursdays at seven. Bring your questions. We'll keep them warm."],
    ] },

  // ---------- Brandt Grain and Grit (1) ----------
  { title: "Brandt Grain and Grit: Since Always",
    cast: {
      narrator: { name: "Narrator", accent: "british", pitch: 0.86, rate: 0.9 },
      brandt: { name: "Augustus Brandt", accent: "scottish", pitch: 0.85, rate: 0.9 },
    },
    lines: [
      ["narrator", "Before the Crop had a skyline. Before the Keel had a lane. There was grain. And there was grit. And there was a family."],
      ["sfx", "wind"],
      ["brandt", "My grandfather moved grain with his hands. My father moved it with mills. I move it with intention."],
      ["narrator", "Brandt Grain and Grit. Seventy percent of what falls at Feed Time passes, at some point, near a Brandt."],
      ["brandt", "We do not advertise. This is not an advertisement. This is a reminder."],
      ["pause", 1100],
      ["narrator", "Brandt Grain and Grit. A family company. Ask nothing."],
    ] },

  // ---------- Wishbone law firm ----------
  { title: "Splitter and Pull: Wishbone Law",
    cast: {
      splitter: { name: "Gail Splitter", accent: "american", pitch: 1.05, rate: 1.05 },
      pull: { name: "Ronald Pull", accent: "australian", pitch: 0.9, rate: 1.0 },
    },
    lines: [
      ["splitter", "Have you been wronged by the other Wishbone? I'm Gail Splitter, of Left Wishbone."],
      ["pull", "And I'm Ronald Pull, of Right Wishbone. Together we are Splitter and Pull, the only law firm that handles nothing but Wishbone disputes."],
      ["splitter", "Property lines. Parade routes. Whose turn it is to have the good fountain."],
      ["pull", "It's Right Wishbone's turn."],
      ["splitter", "It is not, Ronald, and you know it is not."],
      ["pull", "This is exactly why you need two lawyers. We represent both sides, separately, from opposite ends of one very long desk."],
      ["splitter", "The desk is also in dispute."],
      ["pull", "Splitter and Pull. Somebody's going to get the bigger half."],
    ] },

  // ---------- Mattress store ----------
  { title: "Roost Mattress Barn: Holding On",
    cast: {
      gus: { name: "Gus Pellingham", accent: "american", pitch: 0.95, rate: 1.02 },
      wife: { name: "Darla Pellingham", accent: "american", pitch: 1.15, rate: 1.0 },
    },
    lines: [
      ["gus", "Gus Pellingham here, from Roost Mattress Barn in Drumstick Heights. Tired of being thrown out of bed by the Bawk?"],
      ["gus", "Our new Grip Series mattress has handles. Twelve handles. Sewn right in. You sleep holding on like a champion."],
      ["wife", "He's been sleeping on it for a month."],
      ["gus", "I haven't let go in a month. Darla, tell them about my hands."],
      ["wife", "His hands are very strong now. He opened a jar from across the room."],
      ["sfx", "thunder"],
      ["gus", "Didn't move. Not an inch. Roost Mattress Barn. Sleep tight. Sleep really, really tight."],
    ] },

  // ---------- Upper Wing gym ----------
  { title: "Updraft Fitness: Flight Guaranteed",
    cast: { coach: { name: "Coach Brick Hallorann", accent: "american", pitch: 0.9, rate: 1.08 } },
    lines: [
      ["coach", "Coach Brick here at Updraft Fitness in Upper Wing, where we guarantee flight. You will fly, or your money back."],
      ["coach", "Our program is simple. Leg day. Arm day. Flap day. Then more flap day."],
      ["coach", "Last year we issued forty-one thousand refunds. You know what that is? That's forty-one thousand people who believed."],
      ["coach", "Some say nobody in the Chicken has ever flown. I say nobody in the Chicken has ever flapped hard enough at the right gym."],
      ["coach", "I myself have not flown. I've been close. I've been about a half inch. For maybe a second."],
      ["coach", "Updraft Fitness. Join today. Get your refund in the spring."],
    ] },

  // ---------- Gristleball season tickets ----------
  { title: "Wattle Wobblers: Season Tickets",
    cast: {
      announcer: { name: "Tad Brightman", accent: "american", pitch: 1.0, rate: 1.08 },
      fan: { name: "Wendell", accent: "irish", pitch: 0.95, rate: 0.98 },
    },
    lines: [
      ["announcer", "Wattle Wobblers season tickets are on sale now! Witness the most improved team in Gristleball!"],
      ["announcer", "Last season the Wobblers scored their first point in eleven years. It was against themselves, but the ball went in."],
      ["fan", "I was there. I've had season tickets since I was six. I stood up so fast I knocked over my grain cone."],
      ["announcer", "This year: new coach, new uniforms, and a grit ball that is finally, officially round."],
      ["sfx", "cheer"],
      ["fan", "We're going to lose so much less. I can feel it."],
      ["announcer", "Wattle Wobblers. Wobble with us."],
    ] },

  // ---------- Bawk insurance ----------
  { title: "Steadfast Mutual: Bawk Coverage",
    cast: {
      agent: { name: "Howard Fench", accent: "british", pitch: 0.95, rate: 1.0 },
      caller: { name: "Pam", accent: "american", pitch: 1.12, rate: 1.05 },
    },
    lines: [
      ["agent", "At Steadfast Mutual, we cover Bawk damage. As long as you were holding on."],
      ["caller", "I was holding on. I was holding onto my husband."],
      ["agent", "Was your husband holding onto something?"],
      ["caller", "He was holding onto me."],
      ["pause", 800],
      ["agent", "I'm afraid that's a loop, ma'am. A loop isn't anchored. A loop is just two people falling politely."],
      ["agent", "Steadfast Mutual. Hold onto something sturdy. Then hold onto us."],
    ] },

  // ---------- Outside novelty goods ----------
  { title: "Gary's Outside Shoppe",
    cast: { gary: { name: "Gary Lumm", accent: "american", pitch: 1.0, rate: 1.05 } },
    lines: [
      ["gary", "Gary here, from Gary's Outside Shoppe in the Wattle. Gifts and novelties themed around the Outside, which, let me be clear, is not real."],
      ["gary", "We've got snow globes of the Outside. What is snow? Nobody knows. I made it up. It's little white grit. It's adorable."],
      ["gary", "We've got a mug that says I went to the Outside and all I got was this mug. Which is a joke, because you didn't, because it isn't there."],
      ["gary", "Customers ask me, Gary, what if it is out there? And I say, then I'd be the most successful man in history. And I'm not. So."],
      ["gary", "Gary's Outside Shoppe. Pretend there's more. We do."],
    ] },

  // ---------- One-offs ----------
  { title: "Hold On Counseling",
    cast: {
      therapist: { name: "Dr. Imogen Reyes", accent: "southafrican", pitch: 1.02, rate: 0.93 },
      client: { name: "Phil", accent: "american", pitch: 0.95, rate: 1.06 },
    },
    lines: [
      ["therapist", "Do you hold onto things even when there is no Bawk? You might have Bawk anticipation. You are not alone."],
      ["client", "I'm holding onto the microphone right now."],
      ["therapist", "That's okay, Phil. What else are you holding?"],
      ["client", "The desk. My chair. A little bit of the carpet with my foot."],
      ["therapist", "At Hold On Counseling, we help you let go of one thing at a time. Phil started with eleven things. He's down to four."],
      ["client", "I think I can let go of the carpet."],
      ["therapist", "Hold On Counseling. Feel steadier. Grip less."],
    ] },

  { title: "Lower Districts Egg Day Tours",
    cast: { guide: { name: "Captain Lew Brannock", accent: "australian", pitch: 0.92, rate: 1.04 } },
    lines: [
      ["guide", "Ever wondered where the Egg goes? So have we! Lower Districts Egg Day Tours takes you closer than you've ever been."],
      ["guide", "Ride our comfortable shuttle down past the last bus stop, past the last streetlight, to a viewing platform with a really good railing."],
      ["guide", "When the Egg happens, you'll feel it in your shoes. Then it's gone. Then you'll have questions. We'll have a gift shop."],
      ["guide", "Do we know where it goes? No. Have we asked? Every day. We're not allowed further than the railing. Nobody is. That's the fun."],
      ["guide", "Lower Districts Egg Day Tours. Eleven grain. Children half price. Railing included."],
    ] },

  { title: "Tock and Daughter Clock Repair",
    cast: {
      tock: { name: "Abner Tock", accent: "scottish", pitch: 0.88, rate: 0.92 },
      daughter: { name: "Wren Tock", accent: "scottish", pitch: 1.15, rate: 1.05 },
    },
    lines: [
      ["tock", "Is your clock running ahead of the Heart? At Tock and Daughter Clock Repair, we set every clock by ear."],
      ["sfx", "clock"],
      ["daughter", "That's a clock. That's not the Heart. Dad, they know that's not the Heart."],
      ["tock", "They might not know, Wren. Some folks have been living ahead of the Heart for years and never noticed."],
      ["daughter", "We'll fix your clock in a day. Dad will also listen to your chest for a moment, which he insists is part of the service."],
      ["tock", "It is part of the service. Tock and Daughter. On the beat."],
    ] },

  { title: "Two Drumsticks Matchmaking",
    cast: {
      host: { name: "Bonnie Lakewood", accent: "american", pitch: 1.12, rate: 1.06 },
      single: { name: "Terrence", accent: "british", pitch: 0.97, rate: 0.96 },
    },
    lines: [
      ["host", "Lonely in Drumstick Heights? Two Drumsticks Matchmaking pairs you with someone on your exact cul-de-sac."],
      ["single", "I was matched with Diane. She lives across the circle. I've waved at her for nine years."],
      ["host", "And now?"],
      ["single", "Now I wave at her with intention."],
      ["host", "We call it the Cul-de-sac Guarantee. Your soulmate is within four houses, or we'll help you move four houses."],
      ["single", "We're having a picnic on the little center island on Saturday. Mostly to see if it's allowed."],
      ["host", "Two Drumsticks Matchmaking. Love is just around the bend. The bend is very small."],
    ] },

  { title: "Oyster Estates: Exclusive Living",
    cast: { agent: { name: "Fenwick Dorsay", accent: "british", pitch: 0.94, rate: 0.95 } },
    lines: [
      ["agent", "Oyster Estates is proud to offer a rare residence in the Left Oyster, the most exclusive address in the Chicken."],
      ["agent", "The home features one bedroom, which is also the kitchen, which is also the parlor. Ceilings of nearly five feet."],
      ["agent", "You will be neighbors with only three other families, all of whom you can touch from your front door without leaving it."],
      ["agent", "Previous owners include a duchess of the Comb and her extremely flexible butler."],
      ["agent", "Oyster Estates. It's not small. It's precious. Viewings by crawl only."],
    ] },

  { title: "Coop Council: Feed Time Safety",
    cast: {
      official: { name: "Councilwoman Edie Sorensen", accent: "american", pitch: 1.05, rate: 0.97 },
      kid: { name: "Junior Sorensen", accent: "american", pitch: 1.2, rate: 1.08 },
    },
    lines: [
      ["official", "A message from the Coop Council. Feed Time is a beautiful daily gift. Please do not stand under it with your mouth open."],
      ["kid", "But it's fun."],
      ["official", "We know it's fun, Junior. We have done studies, and the studies say it is very fun. It is still not recommended."],
      ["sfx", "rain"],
      ["official", "Use a bucket. Use a sack. Use a nice bowl. Use anything that isn't your face."],
      ["kid", "Can I use a hat?"],
      ["official", "The Council is currently divided on hats. Paid for by the Coop Council, on behalf of President Harlan Doyle and everyone's teeth."],
    ] },

  { title: "Grindworks Mill: Now Hiring",
    cast: {
      foreman: { name: "Marv Kettering", accent: "irish", pitch: 0.86, rate: 1.0 },
      worker: { name: "Tina Okafor", accent: "american", pitch: 1.05, rate: 1.05 },
    },
    lines: [
      ["foreman", "Grindworks Mill in the Gizzard is hiring. Good pay, good people, and a grinding season you'll tell your grandkids about."],
      ["worker", "I've worked here twelve years. I've been in nine grit storms. I've lost three hats and found two of them."],
      ["sfx", "drill"],
      ["foreman", "We offer full dental, because, frankly, you're going to need it. It's the grit."],
      ["worker", "It's the grit. You get used to it. Then you miss it on weekends."],
      ["foreman", "Grindworks Mill. Hard work for the hard-working heart of the Chicken."],
    ] },

  { title: "Wattle Playhouse: Bawk, A Monologue",
    cast: {
      actor: { name: "Lucian Thorne-Fizzwilliam", accent: "british", pitch: 0.95, rate: 0.9 },
      announcer: { name: "Clark Featherstone", accent: "american", pitch: 0.88, rate: 1.0 },
    },
    lines: [
      ["announcer", "This month at the Wattle Playhouse, a one-man show, four hours long, written and performed by Lucian Thorne-Fizzwilliam."],
      ["actor", "It's called Bawk. It is about the moment just before the Bawk, stretched to the length of a life."],
      ["actor", "I stand on stage, gripping a railing, and I wait. The audience waits. We wait together."],
      ["announcer", "Does the Bawk happen?"],
      ["actor", "On a good night. On opening night it didn't. It was the most honest thing I've ever done."],
      ["announcer", "The Wattle Playhouse. Bring a cushion. Hold onto your seat."],
    ] },

  { title: "Keel Buddies Carpool",
    cast: {
      host: { name: "Sunita Rao", accent: "indian", pitch: 1.05, rate: 1.06 },
      dale: { name: "Dale", accent: "american", pitch: 0.9, rate: 0.97 },
    },
    lines: [
      ["host", "Stuck on the Keel? Keel Buddies matches you with a carpool partner going your exact way, at your exact pace, which is not moving."],
      ["dale", "I signed up to save grain. I met Marcus. We've been stuck together every morning for two years."],
      ["host", "And how is that?"],
      ["dale", "He's the best man at my wedding. We've never left the Keel together. We had the wedding on the Keel."],
      ["host", "Keel Buddies. You won't get there faster. You'll get there with somebody."],
    ] },

  { title: "Grit Storm Goggles from Squint",
    cast: { randy: { name: "Randy Squint", accent: "american", pitch: 1.0, rate: 1.1 } },
    lines: [
      ["randy", "Grinding season is coming, and the Gizzard is sending grit storms straight down Main. Are your eyes ready?"],
      ["sfx", "wind"],
      ["randy", "Squint Goggles. Fully sealed. Lightly fogged. Now in nine colors, all of which look brown after one storm."],
      ["randy", "I wear them to bed. I wear them in the shower. My family says they don't know what my eyes look like anymore. That's commitment."],
      ["randy", "Squint Goggles. See less grit. See less in general."],
    ] },

  { title: "First Sack Bank of the Crop",
    cast: {
      banker: { name: "Mortimer Gale", accent: "british", pitch: 0.9, rate: 0.92 },
      customer: { name: "Rosa", accent: "american", pitch: 1.1, rate: 1.02 },
    },
    lines: [
      ["banker", "At First Sack Bank of the Crop, your grain is kept safe in a sack, in a room, with your name on it."],
      ["customer", "Can I see my sack?"],
      ["banker", "Absolutely. Many of our members visit their sacks weekly. Some bring a chair. One gentleman reads to his."],
      ["customer", "Has my sack grown?"],
      ["banker", "It has gained interest, which is to say we've become interested in it. We think about it often."],
      ["banker", "First Sack Bank. Your grain, a sack, a room, and us, looking in on it."],
    ] },

  { title: "Hennigan Name Change Services",
    cast: {
      clerk: { name: "Bev Hennigan", accent: "irish", pitch: 1.05, rate: 1.0 },
      client: { name: "Gerald", accent: "american", pitch: 0.94, rate: 0.95 },
    },
    lines: [
      ["clerk", "Do people wince when you say your last name? Hennigan Name Change Services can help."],
      ["client", "My name was Gerald Nugget. Every introduction, people would gasp and change the subject to the weather."],
      ["clerk", "We changed it to Gerald Weatherby. Now they skip a step."],
      ["client", "I got the job. I got the apartment. A woman at the grain market touched my arm."],
      ["clerk", "We've also helped the Rotisseries of Drumstick Heights. They're the Rosemonts now. Lovely family. Much more invited."],
      ["clerk", "Hennigan Name Change Services. Be someone people can say out loud."],
    ] },

];
