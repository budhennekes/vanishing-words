/** Pure session state machine. Every clock value is supplied by the caller. */
export const MODES = Object.freeze({
  journal: { label: "Journal", grace: 12000 },
  words750: { label: "750 Words", grace: 45000 },
  content: { label: "Content", grace: 8000 },
  sprint: { label: "Sprint", grace: 4000 },
  rant: { label: "Rant", grace: 45000 },
});
export const WORD_GOAL = 750;
export const FADE_MS = 700;
export const MAX_SNAPSHOTS = 20;
export const countWords = (text) => (text.match(/\S+/gu) || []).length;
export function createSession(
  { id, mode = "journal", minutes = 10, graceMs, eraseOnPause = false },
  now,
) {
  const grace = graceMs === undefined ? MODES[mode]?.grace : graceMs;
  if (
    !Object.hasOwn(MODES, mode) ||
    !Number.isInteger(minutes) ||
    minutes < 1 ||
    minutes > 240 ||
    !Number.isInteger(grace) ||
    grace < 1000 ||
    grace > 600000
  )
    throw new RangeError(
      "Choose a 1–240 minute session and a deletion delay from 1 second to 10 minutes.",
    );
  return {
    version: 2,
    id,
    mode,
    grace,
    eraseOnPause: mode === "words750" && eraseOnPause === true,
    duration: minutes * 60000,
    createdAt: now,
    updatedAt: now,
    status: "ready",
    text: "",
    startedAt: null,
    deadline: null,
    lastInputAt: null,
    pending: null,
    snapshots: [],
    archiveTrimmed: false,
    composing: false,
    remaining: minutes * 60000,
    reason: null,
  };
}
export function transition(state, event, now) {
  const goal = state.mode === "words750" || state.editing === true;
  if (
    event.type === "edit" &&
    state.status === "completed" &&
    state.mode !== "rant"
  )
    return {
      ...state,
      editing: true,
      status: "active",
      deadline: null,
      pending: null,
      composing: false,
      reason: null,
      updatedAt: now,
    };
  const due = !goal && state.status === "active" && now >= state.deadline;
  if (state.mode === "rant") {
    if (due || event.type === "finish" || event.type === "leave") {
      return {
        ...state,
        status: "completed",
        text: "",
        snapshots: [],
        pending: null,
        composing: false,
        remaining: 0,
        reason: due ? "timer" : event.type === "leave" ? "left" : "early",
        updatedAt: now,
      };
    }
    // A disposable session has an absolute deadline, including while hidden.
    if (event.type === "suspend") return state;
  }
  // Completion always wins, including during IME and pending visual dissolution.
  if (due)
    return {
      ...state,
      status: "completed",
      pending: null,
      composing: false,
      remaining: 0,
      reason: "timer",
      updatedAt: now,
    };
  if (event.type === "finish" && state.status !== "completed")
    return {
      ...state,
      status: "completed",
      pending: null,
      composing: false,
      remaining:
        state.status === "active" && !goal
          ? Math.max(0, state.deadline - now)
          : state.remaining,
      reason:
        state.mode === "words750" && countWords(state.text) >= WORD_GOAL
          ? "goal"
          : "early",
      updatedAt: now,
    };
  if (event.type === "suspend" && ["active", "ready"].includes(state.status))
    return {
      ...state,
      status: "suspended",
      pending: null,
      composing: false,
      remaining:
        state.status === "active" && !goal
          ? Math.max(0, state.deadline - now)
          : state.duration,
      reason: event.reason || "hidden",
      updatedAt: now,
    };
  if (event.type === "resume" && state.status === "suspended")
    return {
      ...state,
      status: state.startedAt === null ? "ready" : "active",
      deadline: goal || state.startedAt === null ? null : now + state.remaining,
      lastInputAt: now,
      pending: null,
      reason: null,
      updatedAt: now,
    };
  if (["ready", "active"].includes(state.status)) {
    if (event.type === "compositionStart")
      return { ...state, composing: true, pending: null, lastInputAt: now };
    if (event.type === "compositionEnd")
      return { ...state, composing: false, pending: null, lastInputAt: now };
    if (event.type === "input") {
      const start = state.status === "ready" && event.text.trim();
      return {
        ...state,
        text: event.text,
        updatedAt: now,
        lastInputAt: now,
        pending: null,
        status: start ? "active" : state.status,
        startedAt: start ? now : state.startedAt,
        deadline: goal ? null : start ? now + state.duration : state.deadline,
      };
    }
  }
  if (
    (!goal ||
      (state.mode === "words750" && state.eraseOnPause && !state.editing)) &&
    event.type === "tick" &&
    state.status === "active" &&
    !state.composing
  ) {
    if (state.pending && now >= state.pending.at + FADE_MS) {
      let snapshots =
        state.mode === "rant"
          ? []
          : state.snapshots.some((s) => s.text === state.text)
            ? state.snapshots
            : [...state.snapshots, { at: now, text: state.text }];
      const trimmed = snapshots.length > MAX_SNAPSHOTS;
      if (trimmed)
        snapshots = [snapshots[0], ...snapshots.slice(-(MAX_SNAPSHOTS - 1))];
      return {
        ...state,
        text: state.text.slice(0, state.pending.index),
        pending: null,
        snapshots,
        archiveTrimmed: state.archiveTrimmed || trimmed,
        updatedAt: now,
      };
    }
    if (!state.pending && now - state.lastInputAt >= state.grace) {
      const word = /\S+\s*$/u.exec(state.text);
      if (word)
        return {
          ...state,
          pending: { at: now, index: word.index, text: word[0] },
        };
    }
  }
  return state;
}
/** Reload never restarts a timer or consumes time while the document was closed. */
export function restoreSession(raw, now) {
  if (
    !raw ||
    raw.version !== 2 ||
    raw.mode === "rant" ||
    (raw.grace !== undefined &&
      (!Number.isInteger(raw.grace) ||
        raw.grace < 1000 ||
        raw.grace > 600000)) ||
    typeof raw.id !== "string" ||
    !Object.hasOwn(MODES, raw.mode) ||
    typeof raw.text !== "string" ||
    !Number.isFinite(raw.duration) ||
    raw.duration < 60000 ||
    raw.duration > 14400000 ||
    !Number.isFinite(raw.updatedAt) ||
    !["ready", "active", "suspended", "completed"].includes(raw.status) ||
    !Array.isArray(raw.snapshots) ||
    !raw.snapshots.every(
      (s) => s && typeof s.text === "string" && Number.isFinite(s.at),
    )
  )
    return null;
  const remaining =
    raw.status === "active" && raw.mode !== "words750" && !raw.editing
      ? Math.max(0, Math.min(raw.duration, raw.deadline - raw.updatedAt))
      : Math.max(0, Math.min(raw.duration, raw.remaining));
  if (!Number.isFinite(remaining)) return null;
  return {
    ...raw,
    grace: raw.grace ?? MODES[raw.mode].grace,
    snapshots:
      raw.snapshots.length > MAX_SNAPSHOTS
        ? [raw.snapshots[0], ...raw.snapshots.slice(-(MAX_SNAPSHOTS - 1))]
        : raw.snapshots,
    status: raw.status === "completed" ? "completed" : "suspended",
    remaining,
    pending: null,
    composing: false,
    reason: raw.status === "completed" ? raw.reason : "restored",
    updatedAt: now,
  };
}
