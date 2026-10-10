/* MDFM content pack: the core station IDs and ads.
   A pack is plain data. Add your own pack file (see README) instead of editing this one,
   so two people never edit the same file at the same time.
   ids/late entries can be strings or functions h=>string, where h = {pick, ri, freq}. */
export default {
  name: "MDFM core",
  freq: ["ninety nine point nine","ninety nine point nine H D one","ninety nine point nine H D two"],
  ids: [

  h=>`You're locked in to M D F M, ${h.pick(h.freq)}. Hip hop for people who triage.`,
  h=>`M D F M. Zero credits at idle. Unlimited beats while you work.`,
  h=>`This is M D F M, the Media Development Hub's official radio station. Rob approved this message. Probably.`,
  h=>`${h.pick(["Ninety nine point nine","One oh four point three"])}, M D F M. If a fly lands on your screen, that's a listener. Say hi.`,
  h=>`M D F M. Every beat submitted for review.`,
  h=>`You're listening to M D F M, the Automation Overlord's favorite frequency.`,
  h=>`M D F M. Now with ${h.ri(3,9)} percent more bass than the leading uploader.`,
  h=>`Coming up after this, more ${h.pick(["boom bap","g funk","lo fi","break beats","trap"])}. Stay locked to M D F M.`,
  h=>`M D F M. We play the hits. We also play the misses. We don't know which is which.`,
  h=>`Hey. You. Get back to work. ... Just kidding. M D F M.`,
  h=>`M D F M, broadcasting live from the ${h.pick(["New Post panel","Posts window","spray can","fruit fly zone","bottom of the steel"])}.`,
  h=>`This is M D F M. Confirm before execute. Always.`,
  h=>`M D F M. The station that never marks anything done.`,
  h=>`${h.pick(["Good morning","Good afternoon","Good evening","Good whatever time it is"])}, you're on M D F M. Keep it locked.`,

  h=>`M D F M H D. Crystal clear. Unlike your post titles.`,
  h=>`You're listening to M D F M in glorious high definition. The flies can hear it too.`,
  h=>`M D F M H D two. The other station. It's also us.`,
  h=>`Lossless audio. Lossy decisions. M D F M.`,
  h=>`M D F M. Brought to you by the knobs. Turn them. Go on.`,
  h=>`${h.pick(["Drill","Trap","Rage","Plugg","Boom bap","West coast"])} all day, every day. Until Rob says stop. M D F M.`

  ],
  late: ["Sorry. Sorry I'm late. I was primping my show pony. ... Okay. M D F M.","Oh. Is it on? Sorry I'm late, I was primping my show pony. He has a thing tonight. M D F M.","Sorry I'm late. I was primping my show pony. You don't get to judge me. M D F M, ninety nine point nine."],
  ads: [
  `Are you tired of fruit flies? Then don't come to Kevin's Bug Barn. We don't sell spray. We sell a guy. His name is Doug. He stands in your kitchen and claps. It's not working, but he won't leave. Kevin's Bug Barn. Doug is already in your car.`,
  `Hi, I'm the guy from the sugar mist commercial. Everybody keeps asking if it attracts flies. Yes. It attracts flies. That's the whole thing. There's a fly on the can. I'm not doing this again.`,
  `Triage King Mattress Outlet. Our mattresses are so comfortable you'll forget to submit for review. And that's not allowed. Rob reviews everything. Rob is outside right now. Triage King.`,
  `Introducing the Spudmuffin. It is not a muffin. Please stop putting butter on it. A man in Ohio put butter on it and now we legally have to say this on the radio.`,
  `Do you like hot dogs? Too bad. This is an ad for a floorplan video uploader. I just said hot dogs because people perk up. Anyway it uploads floorplans. Hot dogs.`,
  `Hey you. Yeah you, with the coffee. You think you can just post a suggestion with no done when? ... You can. It's really easy. Media Development Hub. Sorry we yelled.`,
  `Dad's Car Wash. We don't wash cars. We never said we did. It's just the name of the place. Please stop driving in. Dad's Car Wash.`,
  `Lil Tatey's Removal Emporium. We remove anything from your photos. Trash cans. Hoses. That one guy. We've been asked to stop saying that one guy. Lil Tatey.`,
  `New from Swattex. It's a spray can, but bigger. It's too big. Nobody can lift it. We made one and it's in a field. Come see it. Swattex.`,
  `Are you a fruit fly? Do you love sugar? Do you also listen to the radio? Then I need to talk to you. Please call me. I have so many questions.`,
  `Gary's Knob Emporium. We have red knobs, green knobs, blue knobs. You turn them and stuff changes color. Is that what you wanted? Too late, you're in the store now.`,
  `Honk-O-Cide. The bug spray for clowns. Clowns, you've been suffering in silence. Not anymore. Also it's just regular bug spray. We put a clown on it. Honk-O-Cide.`,
  `This message is brought to you by the Activity bell. It has a number on it. You want to click it. You're thinking about it right now. Don't. ... Okay you can.`,
  `Smokehouse Swat. It smells like barbecue, so the flies show up hungry, and then, well. You know. We don't have to say it. Smokehouse Swat. We're not monsters.`,
  `Is your equalizer too green? Sad. Turn the knobs. That's the whole ad. We're not selling anything. We just wanted to tell you about the knobs.`,
  `Varmint Rustler. Partner, there's a fly in this town, and this town ain't big enough for the both of you. It's a browser tab. It's very small. Varmint Rustler.`,
  `Big Steve's Mega Clarify. When Claude asks you a question, Big Steve answers it for you. Big Steve doesn't know anything about your project. Big Steve is very confident. Big Steve.`,
  `Fly-B-Gone. Our scientists asked the flies what they hate most. The flies said nothing. Because they're flies. We wasted a lot of money. Fly-B-Gone.`,
  `Do you have a lot of posts in review? Have you tried crying? Crying is free. Then submit it again. That's not free, it takes a minute. Media Development Hub.`,
  `Disco Nectar. The sugar mist that makes flies dance. They're not dancing. They're confused. But it looks like dancing if you squint. Disco Nectar.`,
],
  adParts: {
    owner: ["Kevin's","Big Steve's","Dale's","Uncle Ron's","Cheryl's","Doug's","Tammy's","Grandpa Lou's","Rick's","Barb's"],
    kind: ["Bug Barn","Knob Depot","Spray Can Warehouse","Floorplan Emporium","Fly Hotel","Discount Equalizers","Sugar Shack","Steel Polish Outlet","Scratch Repair Hut","Mattress and Fly Storage","Review Queue Rentals"],
    pitch: ["We've got the lowest prices in the tri-county area","Everything must go","We're open twenty four hours a day","Our staff is fully trained","We have a guarantee","Bring the whole family"],
    turn: ["but please don't come in on Tuesdays. Something happened on a Tuesday","but our staff is one guy and he's on the roof again","but we can't legally use the word guarantee anymore","but the family has to wait in the car","but everything also has to come back. It's complicated","but the door sticks. You have to really commit"],
    backdown: ["We're not mad about it","Okay that's all we're allowed to say","Please stop calling the station","He's fine. He likes the roof","We said what we said","Tell your friends. Or don't. It's whatever"],
  },
};
