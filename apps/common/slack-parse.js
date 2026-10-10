// Pure Slack helpers for the company-news break (tested in test/). No network here.
// Turns Slack posts into short, speakable news items, and skips anything that shouldn't be read between beats.

// Posts about loss, illness, layoffs and similar are never read on the radio (official or puff).
const SENSITIVE = /\b(rip|r\.i\.p|rest in peace|passed away|passed on|has passed|died|death|dying|funeral|memorial|obituary|condolences?|sorry for (your|the) loss|grieving|grief|rainbow bridge|put (him|her|them) down|euthan|hospice|hospital|surgery|cancer|diagnos|sick|illness|injur|accident|emergency|layoffs?|laid off|terminat|severance|resign|lawsuit|harass|investigation|confidential|do not share|don'?t share|password|ssn|medical|pregnan|miscarri|divorce)\b/i;
const DECODE = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };

// Slack markup -> plain speech. users: { U123: {first, initial, pron} }
function cleanText(raw, users = {}) {
  let t = String(raw || "");
  t = t.replace(/```[\s\S]*?```/g, " ");                                    // code blocks are not radio
  t = t.replace(/<@([UW][A-Z0-9]+)(\|[^>]*)?>/g, (m, id) => users[id] ? `${users[id].first} ${users[id].initial}.` : "a coworker");
  t = t.replace(/<#C[A-Z0-9]+\|([^>]*)>/g, (m, n) => n || "a channel").replace(/<#C[A-Z0-9]+>/g, "a channel");
  t = t.replace(/<!(here|channel|everyone)[^>]*>/g, "everyone").replace(/<!subteam\^[A-Z0-9]+\|?@?([^>]*)>/g, (m, n) => n || "the team").replace(/<![^>]*>/g, "");
  t = t.replace(/<(https?:[^|>]+)\|([^>]+)>/g, "$2").replace(/<(https?:|mailto:)[^>]+>/g, "a link").replace(/https?:\/\/\S+/g, "a link");
  t = t.replace(/:[a-z0-9_+'-]+:/gi, " ");                                   // emoji codes
  t = t.replace(/&(amp|lt|gt|quot|#39);/g, m => DECODE[m]);
  t = t.replace(/[*_~`>]+/g, " ").replace(/\s*\n+\s*/g, ". ").replace(/\s+/g, " ").replace(/(\.\s*){2,}/g, ". ").trim();
  return t;
}
// Extractive summary (no AI, zero credits): drop greetings and sign-offs, keep the opening sentences up to a word budget.
const GREETING = /^(hi|hey|hello|howdy|good (morning|afternoon|evening)|morning|yo)\b(\s+(there|again))?(\s+(everyone|everybody|all|team|folks|friends|y'?all|crew|gang|rentvision|rv))?[\s,!.:-]+/i;
const SIGNOFF = /\s*(thanks|thank you|thx|cheers|best|let me know if you have (any )?questions)[^.!?]{0,40}[.!]?\s*$/i;
function summarize(t, maxWords = 40) {
  let x = String(t || "").replace(GREETING, "").replace(SIGNOFF, "").trim(); if (!x) x = String(t || "");
  x = x[0] ? x[0].toUpperCase() + x.slice(1) : x;
  const sents = x.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [x], out = []; let n = 0;
  for (const s of sents) { const w = s.trim().split(/\s+/).length; if (out.length && n + w > maxWords) break; out.push(s.trim()); n += w; if (n >= maxWords) break; }
  let r = out.join(" "); const words = r.split(/\s+/);
  if (words.length > maxWords + 8) r = words.slice(0, maxWords).join(" ").replace(/[,;:]$/, "") + "...";
  return r + (r.length < x.length - 3 ? " More in Slack." : "");
}
// Keep it short: up to ~2 sentences / 260 characters, cut on a sentence or word boundary.
function shorten(t, max = 260) {
  if (t.length <= max) return t;
  const cut = t.slice(0, max), end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (end > 80 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(" ")) + "...") + " There's more in Slack.";
}
function personFromProfile(u) {
  const p = (u && u.profile) || {};
  const real = (p.real_name || u.real_name || "").trim(), parts = real.split(/\s+/);
  const first = (p.first_name || parts[0] || p.display_name || "Someone").trim().split(/\s+/)[0];
  const last = (p.last_name || (parts.length > 1 ? parts[parts.length - 1] : "")).trim();
  return { first, initial: last ? last[0].toUpperCase() : "", pron: (p.pronunciation || "").trim() || null, bot: !!(u && (u.is_bot || u.deleted)) };
}
// Local fixes typed in Settings: one per line, "Name = how to say it".
function parseFixes(text) {
  const out = {};
  for (const line of String(text || "").split(/\n+/)) { const m = line.match(/^\s*([^=]{1,40}?)\s*=\s*(.{1,60}?)\s*$/); if (m) out[m[1].toLowerCase()] = m[2]; }
  return out;
}
const isTopLevel = m => m && m.type === "message" && (!m.subtype || m.subtype === "file_share") && !m.bot_id && (!m.thread_ts || m.thread_ts === m.ts) && typeof m.text === "string";
// Photos and videos the radio can't see (no AI at runtime). The newsreader jokes about it instead.
function media(m) {
  let image = 0, video = 0;
  for (const f of m.files || []) { const t = `${f.mimetype || ""} ${f.filetype || ""}`.toLowerCase(); if (/image\/|\b(png|jpe?g|gif|heic|webp)\b/.test(t)) image++; else if (/video\/|\b(mp4|mov|m4v|webm)\b/.test(t)) video++; }
  return { image, video };
}
// Turn one channel's history into news items (newest first). kind: "official" | "kids" | "animals" | "other".
function toItems(history, { channel, kind, users = {}, since = 0, fixes = {} }) {
  const out = [];
  for (const m of (history && history.messages) || []) {
    if (!isTopLevel(m) || +m.ts < since) continue;
    const who = users[m.user]; if (!who || who.bot) continue;
    if (SENSITIVE.test(m.text) || (m.files || []).some(f => SENSITIVE.test(`${f.title || ""} ${f.name || ""}`))) continue;
    const md = media(m), text0 = cleanText(m.text, users), hasMedia = md.image + md.video > 0;
    if (!hasMedia && text0.replace(/[^a-z]/gi, "").length < 8) continue;   // "lol", "+1" and the like
    const text = text0.replace(/[^a-z]/gi, "").length < 3 ? "" : text0;
    if (SENSITIVE.test(text)) continue;
    const names = [], add = u => { if (u && !names.some(n => n.first === u.first)) names.push({ first: u.first, pron: fixes[u.first.toLowerCase()] || u.pron || null }); };
    add(who); for (const id of (m.text.match(/<@([UW][A-Z0-9]+)/g) || []).map(x => x.slice(2))) add(users[id]);
    out.push({ id: `${channel}:${m.ts}`, ts: +m.ts, channel, kind, who: { first: who.first, initial: who.initial, pron: fixes[who.first.toLowerCase()] || who.pron || null }, text: text ? summarize(text, kind === "official" ? 45 : 30) : "", image: md.image, video: md.video, names });
  }
  return out.sort((a, b) => b.ts - a.ts);
}
const KIND_BY_NAME = { general: "official", littlevisionaries: "kids", "animal-pics": "animals" };
function parseChannelList(text) { return String(text || "").split(/[\s,]+/).map(s => s.replace(/^#/, "").toLowerCase()).filter(s => /^[a-z0-9._-]{1,80}$/.test(s)); }
// Rough spoken length in seconds (robot voices run ~2.4 words a second), plus the lead-in and any reaction.
const secs = x => 2.5 + (x.kind === "official" ? 0 : 2.5) + (x.image || x.video ? 4.5 : 0) + (x.text ? String(x.text).split(/\s+/).length / 2.4 : 0);
// Newest first, alternating channels (general first), until the break would pass ~2 minutes including the open and close.
function budgetPick(fresh, limit = 115, overhead = 10) {
  const by = new Map();
  for (const x of [...fresh].sort((a, b) => b.ts - a.ts)) { if (!by.has(x.channel)) by.set(x.channel, []); by.get(x.channel).push(x); }
  const order = [...by.keys()].sort((a, b) => (a === "general" ? -1 : b === "general" ? 1 : by.get(b)[0].ts - by.get(a)[0].ts));
  const out = []; let used = overhead, added = true;
  while (added) { added = false;
    for (const ch of order) { const q = by.get(ch); while (q.length) { const x = q.shift(), t = secs(x); if (used + t <= limit) { out.push(x); used += t; added = true; break; } } } }
  return out;
}
module.exports = { media, summarize, budgetPick, newsSeconds: secs, cleanText, shorten, personFromProfile, parseFixes, toItems, isTopLevel, SENSITIVE, KIND_BY_NAME, parseChannelList };
