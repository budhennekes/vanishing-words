import test from "node:test";
import assert from "node:assert/strict";
import { createSession, transition, restoreSession } from "./engine.js";
const start = (settings, text = "One two three") =>
  transition(
    createSession(
      { id: "settings-qa", mode: "journal", minutes: 30, ...settings },
      0,
    ),
    { type: "input", text },
    0,
  );
test("session length and deletion delay are independent, across modes", () => {
  for (const mode of ["journal", "content", "sprint", "rant"]) {
    let s = start({ mode, minutes: 60, graceMs: 45000 });
    assert.equal(s.deadline, 3600000);
    assert.equal(s.grace, 45000);
    assert.equal(transition(s, { type: "tick" }, 44999).pending, null);
    assert.ok(transition(s, { type: "tick" }, 45000).pending);
  }
});
test("deletion delay supports seconds through ten minutes; sessions through four hours", () => {
  for (const graceMs of [1000, 45000, 120000, 600000])
    assert.equal(start({ graceMs, minutes: 240 }).grace, graceMs);
  for (const graceMs of [0, 999, 600001, NaN, Infinity])
    assert.throws(() => start({ graceMs }), RangeError);
  assert.throws(() => start({ minutes: 241 }), RangeError);
});
test("Rant never creates recovery snapshots during inactivity deletion", () => {
  let s = start({ mode: "rant", graceMs: 1000 });
  s = transition(s, { type: "tick" }, 1000);
  s = transition(s, { type: "tick" }, 1700);
  assert.equal(s.text, "One two ");
  assert.deepEqual(s.snapshots, []);
});
test("Rant erases its entire text on timeout, early finish or leaving", () => {
  for (const [type, time] of [
    ["tick", 60000],
    ["finish", 2000],
    ["leave", 2000],
  ]) {
    const s = transition(
      start({ mode: "rant", minutes: 1, graceMs: 45000 }),
      { type },
      time,
    );
    assert.equal(s.status, "completed");
    assert.equal(s.text, "");
    assert.equal(s.pending, null);
    assert.deepEqual(s.snapshots, []);
  }
});
test("Rant hidden time does not extend its disposal deadline", () => {
  let s = start({ mode: "rant", minutes: 1, graceMs: 45000 });
  s = transition(s, { type: "suspend", reason: "hidden" }, 2000);
  assert.equal(s.status, "active");
  assert.equal(s.deadline, 60000);
  s = transition(s, { type: "tick" }, 60000);
  assert.equal(s.text, "");
  assert.equal(s.status, "completed");
});
test("Rant cannot be restored; normal drafts retain custom delay and old drafts migrate", () => {
  assert.equal(
    restoreSession(start({ mode: "rant", graceMs: 45000 }), 1000),
    null,
  );
  const original = start({ graceMs: 120000 });
  const restored = restoreSession(original, 1000);
  assert.equal(restored.grace, 120000);
  assert.equal(restored.text, original.text);
  const legacy = start({ mode: "journal" });
  delete legacy.grace;
  assert.equal(restoreSession(legacy, 1000).grace, 12000);
});
