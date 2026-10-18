/* What plays between songs: the talk types people can switch off (music always plays), plus (1.22) the songs that aren't in 4/4. Shared by every MDFM receiver and the MD Hub settings. */
// Where it fits: scripts/build.mjs puts this file into dist/skin.js, inlines it in dist/radio.html (the mdfm-skin-js script)
// and lists it in dist/manifest.json so the apps can update it live; scripts/hub-snippet.mjs puts it in the hub embed.
// The MedDev Receiver's controls (vendor/meddev-receiver/receiver.js) read window.MDFM_TYPES to draw the "What plays" switches
// for MDFM 99.9; the other stations' switches come from the engine (STATION_TYPES in src/engine.js).
// One entry: [type id (the key the engine's setTypes() takes), the label shown on the switch]. Order is display order.
window.MDFM_TYPES=[["meters","Songs in 3/4, 6/8, 5/4, 7/8"],["ids","Station IDs"],["stingers","Voice drops between songs"],["ads","Ads"],["interviews","Interviews"],["callers","Call-ins"],
  ["weather","Weather with Tabitha"],["sports","Sports with Chip"],["plays","Golden Age radio plays"],["arts","Arts and Culture"],["podcast","The Apex Grind (hustle podcast)"],["cooking","Simmer Down (cooking show)"],
  ["homerepair","Fixer Downer (home repair)"],["garage","Gasket Case (car trouble)"],["funnelball","Funnelball"],["showponies","Show Ponies (a serial)"],["technews","MedDev tech news (on the half hour)"],["news","Company news from Slack"]];
