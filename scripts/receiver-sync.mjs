// Pulls the MedDev Receiver (the shared look and controls) into mdfm from the sibling repo ../meddev-receiver:
//   dist/ -> vendor/meddev-receiver/   (the bundled copy every MDFM build and app ships with)
//   client/updater.cjs -> apps/common/receiver.js   (the live updater the Mac apps use)
// Run after updating the receiver:  npm run receiver:sync && npm run build
import { copyFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
const root = new URL("../", import.meta.url), src = new URL("../meddev-receiver/", root);
if (!existsSync(new URL("dist/manifest.json", src))) { console.error("Can't find ../meddev-receiver/dist. Clone it next to mdfm:  cd .. && gh repo clone Octoroboto/meddev-receiver"); process.exit(1); }
mkdirSync(new URL("vendor/meddev-receiver/", root), { recursive: true });
for (const f of ["receiver.css", "receiver.js", "badges.html", "manifest.json", "skins.json"]) copyFileSync(new URL("dist/" + f, src), new URL("vendor/meddev-receiver/" + f, root));
copyFileSync(new URL("client/updater.cjs", src), new URL("apps/common/receiver.js", root));
console.log("MedDev Receiver " + JSON.parse(readFileSync(new URL("dist/manifest.json", src), "utf8")).version + " synced into vendor/meddev-receiver and apps/common/receiver.js");
