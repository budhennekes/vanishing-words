import test from "node:test";
import assert from "node:assert/strict";
import { createSession, transition, restoreSession } from "./engine.js";
test("editing a finished note does not restart its timer or deletion", () => {
  let s = createSession(
    { id: "note", mode: "journal", minutes: 1, graceMs: 1000 },
    0,
  );
  s = transition(s, { type: "input", text: "Original page" }, 1);
  s = transition(s, { type: "finish" }, 500);
  s = transition(s, { type: "edit" }, 1000);
  assert.equal(s.status, "active");
  assert.equal(s.editing, true);
  assert.equal(s.deadline, null);
  s = transition(s, { type: "input", text: "Updated page" }, 1500);
  s = transition(s, { type: "tick" }, 900000);
  assert.equal(s.text, "Updated page");
  assert.equal(s.status, "active");
  s = transition(s, { type: "suspend" }, 900001);
  s = restoreSession(JSON.parse(JSON.stringify(s)), 900002);
  s = transition(s, { type: "resume" }, 900003);
  assert.equal(s.deadline, null);
  assert.equal(s.editing, true);
  s = transition(s, { type: "finish" }, 900004);
  assert.equal(s.text, "Updated page");
});
test("750 Words erasing is optional, untimed, recoverable and stoppable", () => {
  let s = createSession(
    { id: "goal", mode: "words750", graceMs: 1000, eraseOnPause: true },
    0,
  );
  s = transition(s, { type: "input", text: "Keep writing now" }, 1);
  s = transition(s, { type: "tick" }, 1001);
  assert.ok(s.pending);
  s = transition(s, { type: "tick" }, 1701);
  assert.equal(s.text, "Keep writing ");
  assert.equal(s.snapshots[0].text, "Keep writing now");
  assert.equal(s.deadline, null);
  s = { ...s, eraseOnPause: false };
  s = transition(s, { type: "tick" }, 900000);
  assert.equal(s.text, "Keep writing ");
});
test("new public modes default to fifteen seconds while stored delays survive", () => {
  for (const mode of ["journal", "rant", "words750"]) {
    const s = createSession({ id: mode, mode }, 0);
    assert.equal(s.grace, 15000);
  }
  const s = createSession({ id: "old", mode: "journal", graceMs: 45000 }, 0);
  assert.equal(restoreSession(s, 2000).grace, 45000);
});
test("Rant cannot become a saved editable note", () => {
  let s = createSession({ id: "rant", mode: "rant" }, 0);
  s = transition(s, { type: "finish" }, 1);
  assert.equal(transition(s, { type: "edit" }, 2).status, "completed");
});
