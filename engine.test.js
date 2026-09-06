import test from "node:test";
import assert from "node:assert/strict";
const engine = await import("./engine.js").catch(() => ({}));
const start = (text = "One two three", minutes = 5, mode = "sprint") =>
  engine.transition(
    engine.createSession({ id: "test", minutes, mode }, 0),
    { type: "input", text },
    0,
  );
test("idle expiry dissolves then deletes the last word and archives an exact snapshot", () => {
  const original = "One\n two   three  ";
  let s = start(original);
  s = engine.transition(s, { type: "tick" }, 3999);
  assert.equal(s.pending, null);
  s = engine.transition(s, { type: "tick" }, 4000);
  assert.equal(s.pending.text, "three  ");
  assert.equal(s.text, original);
  s = engine.transition(s, { type: "tick" }, 4700);
  assert.equal(s.text, "One\n two   ");
  assert.equal(s.snapshots.length, 1);
  assert.equal(s.snapshots[0].text, original);
});
test("deadline takes priority over pending deletion and late input", () => {
  let s = start("Keep all of this", 1);
  s = engine.transition(s, { type: "tick" }, 59600);
  s = engine.transition(s, { type: "tick" }, 60000);
  assert.equal(s.status, "completed");
  assert.equal(s.text, "Keep all of this");
  assert.equal(s.pending, null);
  assert.equal(
    engine.transition(s, { type: "input", text: "late" }, 60001).text,
    s.text,
  );
  assert.equal(
    engine.transition(start("safe", 1), { type: "input", text: "late" }, 60000)
      .text,
    "safe",
  );
});
test("hidden sessions stop safely and resume with remaining time and fresh grace", () => {
  let s = engine.transition(start(), { type: "tick" }, 4000);
  s = engine.transition(s, { type: "suspend", reason: "hidden" }, 4200);
  assert.equal(s.status, "suspended");
  assert.equal(s.pending, null);
  assert.equal(
    engine.transition(s, { type: "tick" }, 500000).text,
    "One two three",
  );
  s = engine.transition(s, { type: "resume" }, 500000);
  assert.equal(s.deadline, 795800);
  assert.equal(s.lastInputAt, 500000);
  s = engine.transition(s, { type: "finish" }, 501000);
  assert.equal(s.status, "completed");
  assert.equal(s.text, "One two three");
});
test("IME composition cancels fades and cannot be deleted until committed", () => {
  let s = engine.transition(start(), { type: "tick" }, 4000);
  s = engine.transition(s, { type: "compositionStart" }, 4200);
  assert.equal(s.pending, null);
  s = engine.transition(s, { type: "input", text: "One two 日本" }, 4300);
  s = engine.transition(s, { type: "tick" }, 20000);
  assert.equal(s.text, "One two 日本");
  assert.equal(s.pending, null);
  s = engine.transition(s, { type: "compositionEnd" }, 20001);
  assert.equal(s.lastInputAt, 20001);
  assert.equal(s.composing, false);
});
test("input immediately cancels pending deletion", () => {
  let s = engine.transition(start(), { type: "tick" }, 4000);
  s = engine.transition(s, { type: "input", text: "One two three four" }, 4600);
  assert.equal(s.pending, null);
  s = engine.transition(s, { type: "tick" }, 4800);
  assert.equal(s.text, "One two three four");
  assert.equal(s.snapshots.length, 0);
});
test("large tick gaps never cause a catch-up deletion burst", () => {
  let s = start();
  s = engine.transition(s, { type: "tick" }, 100000);
  assert.equal(s.text, "One two three");
  s = engine.transition(s, { type: "tick" }, 200000);
  assert.equal(s.text, "One two ");
});
test("recovery retains first original and bounded recent exact snapshots", () => {
  let s = start("original");
  for (let i = 0; i < 50; i++) {
    s = engine.transition(s, { type: "input", text: `edited ${i}` }, i * 5000);
    s = engine.transition(s, { type: "tick" }, i * 5000 + 4000);
    s = engine.transition(s, { type: "tick" }, i * 5000 + 4700);
  }
  assert.equal(s.snapshots.length, 20);
  assert.equal(s.snapshots[0].text, "edited 0");
  assert.equal(s.snapshots.at(-1).text, "edited 49");
  assert.equal(s.archiveTrimmed, true);
});
test("restoring an active draft is safe even past its old deadline", () => {
  const saved = start("Exact\n draft   ");
  const s = engine.restoreSession(JSON.parse(JSON.stringify(saved)), 900000);
  assert.equal(s.status, "suspended");
  assert.equal(s.text, saved.text);
  assert.equal(s.pending, null);
  assert.equal(s.remaining, 300000);
  assert.equal(engine.transition(s, { type: "tick" }, 999999).text, saved.text);
  assert.equal(engine.restoreSession({ version: 2, text: "bad" }, 0), null);
});
test("mode grace, duration validation and word count", () => {
  for (const [mode, grace] of [
    ["journal", 12000],
    ["content", 8000],
    ["sprint", 4000],
  ]) {
    assert.equal(
      engine.transition(
        start("words here", 5, mode),
        { type: "tick" },
        grace - 1,
      ).pending,
      null,
    );
    assert.ok(
      engine.transition(start("words here", 5, mode), { type: "tick" }, grace)
        .pending,
    );
  }
  for (const minutes of [0, 241, 1.2, NaN])
    assert.throws(() => engine.createSession({ id: "x", minutes }, 0));
  assert.equal(engine.countWords("  one\n two\tthree  "), 3);
  assert.equal(engine.countWords("  \n"), 0);
});
test("Begin waits for the first nonempty input to start time", () => {
  assert.equal(typeof engine.createSession, "function");
  let s = engine.createSession({ id: "test", mode: "journal", minutes: 5 }, 0);
  assert.equal(s.status, "ready");
  s = engine.transition(s, { type: "input", text: "  \n" }, 3000);
  assert.equal(s.startedAt, null);
  s = engine.transition(s, { type: "input", text: "Hello" }, 5000);
  assert.equal(s.status, "active");
  assert.equal(s.deadline, 305000);
});
