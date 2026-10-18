// AXMOD settings as the apps store them ("axmod" in settings.json). The page sends whatever the person changed; only
// small, plain values get through: { schema: 1, values: { <option id>: true/false, a number or a short word }, channels: { <id>: 0..1 } }.
// The option list itself lives in MedDev Receiver (dist/axmod.schema.json), so new options need no app release.
// Process: Electron main (radio and hub), when the renderer saves settings over IPC. Untrusted input: the page can send anything.
// ID: an option id (letters/digits, up to 24). CH: a channel id (lowercase, digits, dashes).
const ID = /^[a-zA-Z][a-zA-Z0-9]{0,23}$/, CH = /^[a-z0-9][a-z0-9-]{0,23}$/;
// Returns a clean copy of an "axmod" settings object: at most 60 values (boolean, a number within +-1000, or a string up
// to 200 chars) and 16 channel levels clamped to 0..1. Anything else is dropped silently; never throws.
function cleanAxmod(v) {
  const out = { schema: 1, values: {}, channels: {} };
  if (!v || typeof v !== "object") return out;
  const vals = v.values && typeof v.values === "object" ? v.values : {};
  for (const [k, x] of Object.entries(vals).slice(0, 60)) {
    if (!ID.test(k)) continue;
    if (typeof x === "boolean") out.values[k] = x;
    else if (typeof x === "number" && isFinite(x) && Math.abs(x) <= 1000) out.values[k] = x;
    else if (typeof x === "string" && x.length <= 200) out.values[k] = x;
  }
  const chs = v.channels && typeof v.channels === "object" ? v.channels : {};
  for (const [k, x] of Object.entries(chs).slice(0, 16)) if (CH.test(k) && typeof x === "number" && isFinite(x)) out.channels[k] = Math.max(0, Math.min(1, x));
  return out;
}
module.exports = { cleanAxmod };
