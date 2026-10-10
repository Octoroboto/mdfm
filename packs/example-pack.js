/* Example content pack. Copy this file to make your own (e.g. packs/analyze-pics.js),
   then pass it in: createMDFM({ packs: [myPack] }). The core pack is always included unless includeCore:false. */
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
