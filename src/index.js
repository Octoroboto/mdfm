/* mdfm: the package's front door (notes below) */ export { createMDFM, VERSION, STYLES } from "./engine.js";
// Package entry point for `import ... from "mdfm"` when src/ is used directly (bundler setups). It re-exports the public API:
// createMDFM / VERSION / STYLES from the engine (src/engine.js), mountEQ (src/ui.js), the built-in content pack, and the
// optional live data providers openMeteo (src/weather.js) and espnSports (src/sports.js).
// The built files (dist/mdfm.mjs, dist/mdfm.iife.js, dist/radio.html) don't use this file: scripts/build.mjs concatenates
// src/ itself and also exports mountTune, mountMix and the save helpers from src/export.js and src/tune.js.
// (The first line can't have a comment line above it: the comment checker counts the first token's line break.)
export { mountEQ } from "./ui.js";
export { default as corePack } from "./content/default.js";
export { openMeteo } from "./weather.js";
export { espnSports } from "./sports.js";
