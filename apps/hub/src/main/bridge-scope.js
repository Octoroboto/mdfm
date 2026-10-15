// Which frames in the hub view get the radio bridge (window.mdfmApp). Pure, so it's tested without a window.
//  - The frame itself must be an artifact sandbox frame on *.claudeusercontent.com (https), never the top page.
//  - Every frame between it and the top page must be claude.ai or claudeusercontent.com.
//  - The top page must be the hub: a claude.ai artifact whose id is in the allowlist (the hub artifact, the id in the
//    hubUrl setting, and any ids in the optional "bridgeArtifacts" list in settings.json).
//  - Safety valve: if the top page's address isn't recognisable as a claude.ai artifact address at all (claude.ai may change
//    its layout), the frame is allowed and main logs a warning once. A claude.ai artifact with any other id is refused.
const HUB_ARTIFACT = "V9DKVsKPguVWjCGFacb5iM";
const HUB_HOSTS = /(^|\.)(claude\.ai|claudeusercontent\.com|claude\.site|claude\.com|anthropic\.com)$/;
const BRIDGE_FRAME = /(^|\.)claudeusercontent\.com$/;
const BETWEEN = /(^|\.)(claude\.ai|claudeusercontent\.com)$/;
const ID = /^[A-Za-z0-9_-]{6,64}$/;
// claude.ai/artifact/<id>, claude.ai/artifacts/<id>, claude.ai/public/artifacts/<id>, claude.ai/code/artifact/<id> (pure)
function artifactId(url) {
  let u; try { u = new URL(String(url)); } catch { return null; }
  if (u.protocol !== "https:" || !/^(www\.)?claude\.ai$/.test(u.hostname)) return null;
  const m = /^\/(?:code\/)?(?:public\/)?artifacts?\/([^/?#]+)\/?/.exec(u.pathname);
  return m && ID.test(m[1]) ? m[1] : null;
}
function allowedIds(settings) {
  const s = settings || {}, extra = Array.isArray(s.bridgeArtifacts) ? s.bridgeArtifacts : [];
  return new Set([HUB_ARTIFACT, artifactId(s.hubUrl), ...extra.map(String)].filter(x => x && ID.test(x)));
}
const https = (url, re) => { try { const u = new URL(String(url)); return u.protocol === "https:" && re.test(u.hostname); } catch { return false; } };
// The top page: "ok" (an allowed artifact), "unknown" (a claude page whose address isn't an artifact address), or "deny".
function topVerdict(topUrl, ids) {
  if (!https(topUrl, HUB_HOSTS)) return "deny";
  const id = artifactId(topUrl);
  return id ? (ids.has(id) ? "ok" : "deny") : "unknown";
}
// frameUrl: the asking frame; between: the frames from its parent up to (not including) the top page; topUrl: the top page.
function frameVerdict({ frameUrl, between = [], topUrl, ids }) {
  if (!https(frameUrl, BRIDGE_FRAME)) return "deny";
  if (!between.every(u => https(u, BETWEEN))) return "deny";
  return topVerdict(topUrl, ids);
}
module.exports = { HUB_ARTIFACT, HUB_HOSTS, BRIDGE_FRAME, artifactId, allowedIds, topVerdict, frameVerdict };
