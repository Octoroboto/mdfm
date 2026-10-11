const test = require("node:test"), assert = require("node:assert");
const { clampPoint } = require("../src/common/onscreen");
const wa = { x: 0, y: 25, width: 1440, height: 875 };
test("the window's top never goes above the menu bar", () => { assert.equal(clampPoint({ x: 100, y: -300, width: 1060, height: 820 }, wa).y, 25); });
test("enough of the window stays on screen to grab", () => {
  const l = clampPoint({ x: -2000, y: 100, width: 1060, height: 820 }, wa), r = clampPoint({ x: 5000, y: 100, width: 1060, height: 820 }, wa), d = clampPoint({ x: 100, y: 5000, width: 1060, height: 820 }, wa);
  assert.ok(l.x + 1060 >= 160); assert.ok(r.x <= 1440 - 160); assert.ok(d.y <= 25 + 875 - 90); });
test("a window already on screen doesn't move", () => { assert.deepEqual(clampPoint({ x: 200, y: 100, width: 1060, height: 820 }, wa), { x: 200, y: 100 }); });
