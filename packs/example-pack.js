/* Example content pack. Copy this file to make your own (e.g. packs/analyze-pics.js),
   then pass it in: createMDFM({ packs: [myPack] }). The core pack is always included unless includeCore:false. */
// What a pack can hold: the engine (src/engine.js, cat()) joins every pack's lists with the core pack's (src/content/default.js
// shows the full set of keys). name: a label. ids: station IDs. ads: whole ads. late: occasional extra IDs (about 1 spot in 8
// once a few spots have played). adParts: parts for ads assembled on the fly (owner, kind, pitch, turn, backdown).
// A line can be a string or a function h => string, where h is the engine's helper { pick, ri, freq }: h.pick(list) picks
// one item, h.freq is the station's spoken frequencies (the packs' freq lists).
export default {
  name: "Example",
  ids: [
    "M D F M. Now playing inside a whole other app. We get around.",
    h => `You're listening to M D F M, ${h.pick(h.freq)}. Analyze responsibly.`,
  ],
  ads: [
    "Analyze Pics. It looks at your pictures so you don't have to. It has opinions. Some of them are about you.",
  ],
  late: [],
  adParts: { owner: ["Collin's"], kind: ["Pixel Outlet"], pitch: [], turn: [], backdown: [] },
};
