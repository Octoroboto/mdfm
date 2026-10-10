const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), os = require("os"), path = require("path");
const P = require("../src/common/slack-parse");
const { createSlack } = require("../src/common/slack");
const users = { U1: { first: "Siobhan", initial: "K", pron: null }, U2: { first: "Jorge", initial: "M", pron: "HOR-hay" }, UB: { first: "Bot", initial: "", bot: true } };
const msg = (o) => ({ type: "message", ts: "1760000000.0001", text: "", ...o });

test("markup becomes speech", () => {
  assert.equal(P.cleanText("<!here> welcome <@U2> :tada: see <https://x.co/a|the doc> &amp; *more*", users), "everyone welcome Jorge M. see the doc & more");
  assert.equal(P.cleanText("<@U9> in <#C1|general> https://a.b/c"), "a coworker in general a link");
});
test("summaries drop greetings and stay short", () => {
  assert.equal(P.summarize("Hi everyone! Office closed Monday. Thanks!", 40), "Office closed Monday.");
  const long = P.summarize("One two three four five six seven eight nine ten. " + "word ".repeat(60), 30);
  assert.ok(long.startsWith("One two") && long.endsWith("More in Slack."));
});
test("sad, private and bot posts are never read; photos are kept", () => {
  const h = { messages: [
    msg({ user: "U1", ts: "5", text: "RIP Buddy, best dog ever" }),
    msg({ user: "U1", ts: "4", text: "Our surgery went fine" }),
    msg({ user: "UB", ts: "3", text: "Automated reminder about something long enough" }),
    msg({ user: "U1", ts: "2", text: "", files: [{ mimetype: "image/jpeg" }] }),
    msg({ user: "U2", ts: "1", text: "Biscuit learned to open the fridge", files: [{ filetype: "mov" }] }),
    msg({ user: "U2", ts: "0.5", text: "thread reply here that is long", thread_ts: "0.1" }),
  ] };
  const items = P.toItems(h, { channel: "animal-pics", kind: "animals", users, since: 0 });
  assert.deepEqual(items.map(x => x.ts), [2, 1]);
  assert.equal(items[0].text, ""); assert.equal(items[0].image, 1);
  assert.equal(items[1].video, 1); assert.equal(items[1].who.pron, "HOR-hay");
});
test("local pronunciation fixes win", () => {
  const items = P.toItems({ messages: [msg({ user: "U1", text: "Hello from the media team today" })] }, { channel: "general", kind: "official", users, since: 0, fixes: P.parseFixes("siobhan = Shiv-awn\nbad line") });
  assert.equal(items[0].who.pron, "Shiv-awn"); assert.equal(items[0].who.first, "Siobhan");
});
test("budget: newest first, alternating channels, about two minutes", () => {
  const mk = (ch, ts, w) => ({ id: ch + ts, channel: ch, kind: ch === "general" ? "official" : "animals", ts, text: "word ".repeat(w).trim() });
  const pool = []; for (let i = 0; i < 10; i++) { pool.push(mk("general", 100 - i, 40)); pool.push(mk("animal-pics", 90 - i, 25)); pool.push(mk("littlevisionaries", 95 - i, 25)); }
  const r = P.budgetPick(pool);
  assert.deepEqual(r.slice(0, 3).map(x => x.channel), ["general", "littlevisionaries", "animal-pics"]);
  assert.equal(r[0].ts, 100); assert.ok(r.reduce((s, x) => s + P.newsSeconds(x), 10) <= 115);
});
test("token is kept encrypted and removed on disconnect", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mdfm-")), fake = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from("enc:" + s), decryptString: b => String(b).slice(4) };
  fs.writeFileSync(path.join(dir, "slack.token"), fake.encryptString("xoxp-1"));
  const s = createSlack({ dataDir: dir, safeStorage: fake, openExternal() {}, relayUrl: "", getSettings: () => ({ slackNews: true }) });
  assert.equal(s.connected, true); assert.ok(!fs.readFileSync(path.join(dir, "slack.token"), "utf8").startsWith("xoxp"));
  await s.disconnect(true); assert.equal(s.connected, false); assert.equal(fs.existsSync(path.join(dir, "slack.token")), false);
  await assert.rejects(s.connect(), /isn't set up/);
});
