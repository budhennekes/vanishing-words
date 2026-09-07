import test from "node:test";
import assert from "node:assert/strict";
import {
  createSession,
  transition,
  restoreSession,
  countWords,
} from "./engine.js";
const make = () =>
  createSession(
    { id: "goal-test", mode: "words750", minutes: 1, graceMs: 1000 },
    0,
  );
const words = (n) => Array(n).fill("thought").join(" ");
test("750 Words is untimed and never automatically deletes", () => {
  let s = transition(make(), { type: "input", text: "A thought to keep" }, 1);
  assert.equal(s.deadline, null);
  for (const t of [2000, 70000, 90000000])
    s = transition(s, { type: "tick" }, t);
  assert.equal(s.status, "active");
  assert.equal(s.text, "A thought to keep");
  assert.equal(s.pending, null);
  assert.deepEqual(s.snapshots, []);
});
test("goal allows 749, 750 and more words without interrupting composition or input", () => {
  let s = make();
  for (const n of [749, 750, 751]) {
    s = transition(s, { type: "compositionStart" }, n);
    s = transition(s, { type: "input", text: words(n) }, n);
    assert.equal(s.status, "active");
    assert.equal(s.composing, true);
    s = transition(s, { type: "compositionEnd" }, n);
    assert.equal(countWords(s.text), n);
    assert.equal(s.status, "active");
  }
  const done = transition(s, { type: "finish" }, 999999);
  assert.equal(done.reason, "goal");
  assert.equal(done.text, words(751));
});
test("early finish keeps writing without claiming the goal", () => {
  const s = transition(make(), { type: "input", text: words(749) }, 1);
  const done = transition(s, { type: "finish" }, 70000);
  assert.equal(done.reason, "early");
  assert.equal(done.text, s.text);
});
test("goal survives suspend, reload, resume and long pauses", () => {
  let s = transition(make(), { type: "input", text: words(750) }, 1);
  s = restoreSession(JSON.parse(JSON.stringify(s)), 90000000);
  assert.equal(s.status, "suspended");
  assert.equal(s.remaining, s.duration);
  s = transition(s, { type: "resume" }, 90000001);
  assert.equal(s.deadline, null);
  s = transition(s, { type: "tick" }, 999999999);
  assert.equal(s.status, "active");
  assert.equal(countWords(s.text), 750);
  s = transition(s, { type: "suspend" }, 999999999);
  assert.equal(s.remaining, s.duration);
  assert.equal(transition(s, { type: "finish" }, 999999999).reason, "goal");
});
test("word count follows whitespace, including newlines and Unicode spaces", () => {
  assert.equal(countWords("  one\ntwo\tthree\u00a0four  "), 4);
  assert.equal(countWords(" \n\t "), 0);
});
