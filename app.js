import {
  createSession,
  transition,
  restoreSession,
  MODES,
  countWords,
  WORD_GOAL,
} from "./engine.js?v=completion-1";

const $ = (id) => document.getElementById(id);
const editor = $("editor");
const mirror = $("dissolve-mirror");
const PREFIX = "vanishing-words:v2:session:";
const now = () => Date.now();
const makeId = () => crypto.randomUUID();
let diskVersion = null;
let afterRantLeave = null;
let resumeAfterNotes = false;
let releaseNoteLock = null;
let lockedNoteId = null;
function claimNote() {
  releaseNoteLock?.();
  releaseNoteLock = null;
  lockedNoteId = null;
  if (!state || state.mode === "rant") return;
  const id = state.id;
  if (!navigator.locks) {
    // Older engines keep a separate copy rather than risk overwriting another tab.
    if (diskVersion !== null) {
      state = { ...state, id: makeId() };
      diskVersion = null;
    }
    lockedNoteId = state.id;
    flushSave();
    return;
  }
  navigator.locks
    .request(`writing-note:${id}`, { ifAvailable: true }, async (lock) => {
      if (state?.id !== id) return;
      if (!lock) {
        state = { ...state, id: makeId() };
        diskVersion = null;
        lastSaved = "";
        notify(
          "This note is open in another tab. You’re working in a separate copy.",
        );
        claimNote();
        return;
      }
      lockedNoteId = id;
      await new Promise((resolve) => {
        releaseNoteLock = resolve;
        flushSave();
      });
    })
    .catch(() => {
      storageWarning(
        "This note could not be locked for safe saving. Copy or download before closing.",
      );
    });
}
let state = null;
let selectedSnapshot = null;
let saveTimer = null;
let toastTimer = null;
let lastSaved = "";
let lastTickAt = now();
let storageFailed = false;
let lastView = "landing";
let goalAnnounced = false;
const APPEARANCE_KEY = "vanishing-words:v2:appearance";
const TONES = ["paper", "sand", "sage", "mist"];
const COLOR_MODES = ["light", "dark", "system"];
const systemColorScheme = matchMedia("(prefers-color-scheme: dark)");
let appearance = {
  tone: "paper",
  colorMode: "system",
  progress: false,
  wordCount: { journal: false, rant: false, words750: true },
};
try {
  const saved = JSON.parse(localStorage.getItem(APPEARANCE_KEY));
  if (saved && TONES.includes(saved.tone)) appearance.tone = saved.tone;
  if (COLOR_MODES.includes(saved?.colorMode))
    appearance.colorMode = saved.colorMode;
  if (typeof saved?.progress === "boolean")
    appearance.progress = saved.progress;
  for (const mode of Object.keys(appearance.wordCount)) {
    if (typeof saved?.wordCount?.[mode] === "boolean")
      appearance.wordCount[mode] = saved.wordCount[mode];
  }
} catch {
  /* Invalid/unavailable preferences must not block writing. */
}
function applyAppearance(save = false) {
  document.documentElement.dataset.theme =
    appearance.colorMode === "system"
      ? systemColorScheme.matches
        ? "dark"
        : "light"
      : appearance.colorMode;
  document.querySelector(
    `[name="color-mode"][value="${appearance.colorMode}"]`,
  ).checked = true;
  document.documentElement.dataset.paperTone = appearance.tone;
  document.querySelector(
    `[name="paper-tone"][value="${appearance.tone}"]`,
  ).checked = true;
  $("show-progress").checked = appearance.progress;
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(
    document.documentElement,
  )
    .getPropertyValue("--paper")
    .trim();
  if (save) {
    try {
      localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
    } catch {
      notify(
        "Display changed for this visit. This browser could not save the preference.",
      );
    }
  }
}
function setControls(open, returnToEditor = false) {
  const allowed = state && ["ready", "active"].includes(state.status);
  open = Boolean(open && allowed);
  $("writing-controls").hidden = !open;
  $("controls-toggle").setAttribute("aria-expanded", String(open));
  if (open) $("finish-button").focus({ preventScroll: true });
  else if (returnToEditor && allowed) editor.focus({ preventScroll: true });
}

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement;
}
function syncFullscreen() {
  const active = Boolean(fullscreenElement());
  $("fullscreen-button").textContent = active
    ? "Exit fullscreen"
    : "Enter fullscreen";
  $("fullscreen-button").setAttribute("aria-pressed", String(active));
  $("menu-keyboard-help").textContent = active
    ? "Esc exits fullscreen."
    : "Esc to return to your words.";
  setControls(false);
  if (state && ["ready", "active"].includes(state.status))
    editor.focus({ preventScroll: true });
}
$("fullscreen-button").addEventListener("click", async () => {
  try {
    if (fullscreenElement()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      await exit.call(document);
    } else {
      const root = document.documentElement;
      const enter = root.requestFullscreen || root.webkitRequestFullscreen;
      if (!enter) {
        notify(
          "This browser does not support page fullscreen. Try a supported desktop browser. Your writing stays on this page.",
        );
        return;
      }
      // Call directly from this click: browsers require a user gesture.
      await enter.call(root, { navigationUI: "hide" });
    }
  } catch {
    notify(
      "Fullscreen was blocked by this browser. Open the app in its own browser tab and try again. Your writing is unchanged.",
    );
  }
});
document.addEventListener("fullscreenchange", syncFullscreen);
document.addEventListener("webkitfullscreenchange", syncFullscreen);
function notify(message) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").hidden = false;
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
  }, 4500);
}
function storageWarning(message) {
  storageFailed = true;
  $("storage-warning").textContent = message;
  $("storage-warning").hidden = false;
}
function flushSave() {
  clearTimeout(saveTimer);
  if (!state || state.mode === "rant") return true;
  if (lockedNoteId !== state.id) return false;
  // No visual pending state is persisted. Save clocks at this instant, not the last keystroke.
  try {
    const existing = localStorage.getItem(PREFIX + state.id);
    if (diskVersion !== null && existing !== diskVersion) {
      state = { ...state, id: makeId() };
      diskVersion = null;
      claimNote();
      notify(
        "This note changed in another tab. Your edits are saved as a separate note.",
      );
      return false;
    }
  } catch {
    /* The write below reports unavailable storage. */
  }
  const record = {
    ...state,
    pending: null,
    composing: false,
    updatedAt: now(),
  };
  const serialized = JSON.stringify(record);
  if (serialized === lastSaved) return true;
  try {
    localStorage.setItem(PREFIX + state.id, serialized);
    lastSaved = serialized;
    diskVersion = serialized;
    if (storageFailed) {
      storageFailed = false;
      $("storage-warning").hidden = true;
      notify(
        "Saving is working again. Your draft is saved only in this browser.",
      );
    }
    return true;
  } catch {
    storageWarning(
      "This browser could not save your writing. Keep this tab open and finish to copy or download it. Recovery is only in memory until saving works again.",
    );
    return false;
  }
}
function scheduleSave() {
  clearTimeout(saveTimer);
  if (state?.mode === "rant") return;
  saveTimer = setTimeout(flushSave, 650);
}
function displayText() {
  return selectedSnapshot === null
    ? state.text
    : state.snapshots[selectedSnapshot].text;
}
function formatTime(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
function stopDissolve() {
  mirror.replaceChildren();
  mirror.style.transform = "";
}
function showDissolve() {
  stopDissolve();
  if (!state.pending) return;
  // Only build the visual mirror when a word fades, never on typing.
  const prefix = document.createTextNode(
    state.text.slice(0, state.pending.index),
  );
  const cover = document.createElement("span");
  cover.className = "dissolve-cover";
  const word = document.createElement("span");
  word.className = "dissolve-word";
  word.textContent = state.pending.text;
  cover.append(word);
  mirror.append(prefix, cover);
  mirror.style.width = `${editor.clientWidth}px`;
  mirror.style.transform = `translateY(${-editor.scrollTop}px)`;
}
function syncEditor(text) {
  if (editor.value === text) return;
  if (state?.mode === "rant" && !text) {
    editor.value = "";
    editor.defaultValue = "";
    return;
  }
  const selectionStart = editor.selectionStart;
  const selectionEnd = editor.selectionEnd;
  const scrollTop = editor.scrollTop;
  // Deletion never intercepts input or rebuilds a contenteditable tree.
  if (editor.value.startsWith(text))
    editor.setRangeText("", text.length, editor.value.length, "preserve");
  else editor.value = text;
  editor.setSelectionRange(
    Math.min(selectionStart, text.length),
    Math.min(selectionEnd, text.length),
  );
  editor.scrollTop = scrollTop;
}
function renderClock() {
  if (!state) return;
  if (state.editing) {
    $("idle-status").textContent =
      "Editing a saved note. No timer or automatic deletion.";
    return;
  }
  if (state.mode === "words750") {
    $("idle-status").textContent =
      state.eraseOnPause && !state.editing
        ? `No timer. Words erase after ${state.grace / 1000} seconds without typing.`
        : "No timer. No disappearing words.";
    return;
  }
  const time = now();
  const remaining =
    state.status === "active" ? state.deadline - time : state.remaining;
  $("session-clock").textContent = formatTime(remaining);
  let message = "The clock begins with your first word.";
  let ratio = 1;
  if (state.status === "active") {
    const grace = state.grace;
    const idleLeft = Math.max(0, grace - (time - state.lastInputAt));
    ratio = state.composing ? 1 : idleLeft / grace;
    message = state.composing
      ? "Take your time with this word."
      : idleLeft > 0
        ? `${(idleLeft / 1000).toFixed(1)}s of stillness left`
        : state.text.trim()
          ? "Letting go, one word at a time."
          : "A blank page. Keep going.";
  }
  $("idle-status").textContent = message;
  $("idle-status").classList.toggle("vanishing", ratio === 0);
  $("idle-fill").style.setProperty("--idle", ratio);
}
function render() {
  const view = !state ? "landing" : state.status;
  const completed = view === "completed";
  const suspended = view === "suspended";
  $("landing").hidden = Boolean(state);
  $("writing").hidden = !state;
  $("about-button").hidden = Boolean(state);
  $("session-top").hidden = !state || completed;
  $("completion-heading").hidden = !completed;
  $("completion-actions").hidden = !completed;
  $("suspended").hidden = !suspended;
  const focused = Boolean(state) && !completed && !suspended;
  const goal = state?.mode === "words750";
  const showCount = Boolean(state && appearance.wordCount[state.mode]);
  $("show-word-count").checked = showCount;
  $("goal-progress").hidden = !focused || !showCount;
  $("session-clock").hidden = goal || Boolean(state?.editing);
  document.querySelector(".progress-choice").hidden =
    goal || Boolean(state?.editing);
  $("writing-bottom").hidden =
    !focused || !appearance.progress || goal || Boolean(state?.editing);
  $("controls-toggle").hidden = !focused;
  if (!focused) setControls(false);
  document.body.classList.toggle("focus-view", focused);
  document.body.classList.toggle("session-view", Boolean(state));
  document.body.classList.toggle("completed", completed);
  document.body.classList.toggle("is-suspended", suspended);
  if (!state) {
    $("editor-wrap").hidden = false;
    document.querySelector(".page-label").hidden = false;
    setupChanged();
    lastView = view;
    return;
  }
  const rant = state.mode === "rant";
  $("edit-note-button").hidden = rant;
  $("new-note-mode").value = state.mode;
  $("goal-erase-choice").hidden = !goal || Boolean(state.editing);
  $("goal-erase-help").hidden = !goal || Boolean(state.editing);
  $("session-goal-erase").checked = Boolean(state.eraseOnPause);
  $("goal-erase-help").textContent =
    `Off by default. When on, words erase after ${state.grace / 1000} seconds without typing. Recovery snapshots stay in this browser.`;
  $("privacy-label").textContent = rant
    ? "Not saved. Erased when this session ends."
    : "Saved only in this browser.";
  $("finish-button").innerHTML = rant
    ? 'End & erase <span aria-hidden="true">↗</span>'
    : 'Finish <span aria-hidden="true">↗</span>';
  $("finish-button").title = rant
    ? "End this rant and erase its text"
    : "Finish and keep your writing";
  $("editor-help").textContent = rant
    ? "Disposable rant. Nothing is saved. Inactivity removes words after your chosen delay. Ending the session or leaving erases everything. Command or Control Shift Enter ends and erases."
    : "The session starts with your first word. Inactivity removes words after your chosen delay. Command or Control Shift Enter finishes and keeps your words.";
  if (goal)
    $("editor-help").textContent =
      `Write toward 750 words. No timer. ${state.eraseOnPause && !state.editing ? "Words erase after a pause; recovery snapshots are saved locally." : "No automatic deletion."} Your draft is saved in this browser. Keep writing past the goal or finish at any time.`;
  editor.placeholder = {
    words750: "Start with whatever is on your mind…",
    journal: "What’s on your mind?",
    content: "What do you want to say?",
    sprint: "Start anywhere…",
    rant: "Say the part you usually hold back…",
  }[state.mode];
  $("editor-wrap").hidden = rant && completed;
  document.querySelector(".page-label").hidden = rant && completed;
  document.querySelector(".export-source").hidden = rant;
  for (const id of [
    "copy-button",
    "txt-button",
    "md-button",
    "recovery-button",
    "current-button",
  ])
    $(id).hidden = rant;
  $("completion-title").innerHTML = rant
    ? "Rant <em>erased.</em>"
    : "Session <em>finished.</em>";
  $("mode-label").textContent = MODES[state.mode].label;
  editor.readOnly = completed || suspended;
  const text = completed ? displayText() : state.text;
  syncEditor(text);
  const words = countWords(text);
  $("word-count").textContent = `${words} ${words === 1 ? "word" : "words"}`;
  const goalText = `${words} / ${WORD_GOAL} words${words >= WORD_GOAL ? " · Goal reached" : ""}`;
  $("goal-progress").textContent = goal
    ? goalText
    : $("word-count").textContent;
  $("session-word-count").textContent = goal
    ? goalText
    : $("word-count").textContent;
  $("page-label").textContent = completed
    ? "A few words worth keeping."
    : suspended
      ? "Your page, right where you left it."
      : "Follow the thought.";
  if (suspended) {
    $("suspend-reason").textContent =
      state.reason === "restored"
        ? "Your browser restored your last page. Nothing was retrieved from a server. The clock is stopped. Resume when you’re ready."
        : state.reason === "interrupted"
          ? "The browser interrupted the session. The timer and automatic deletion are paused. Resume to continue writing."
          : "The timer and automatic deletion are paused while you’re away. Resume to continue writing.";
  }
  if (suspended && goal)
    $("suspend-reason").textContent =
      "Your draft is here. Resume writing toward 750 words, or finish and keep what you have.";
  if (completed) {
    $("completion-eyebrow").textContent =
      state.reason === "timer" ? "Writing complete." : "Session finished.";
    $("completion-copy").textContent =
      state.reason === "timer"
        ? "Your time is up. Your words are yours to keep."
        : "You ended the session. Your words are yours to keep.";
    if (goal) {
      const reached = words >= WORD_GOAL;
      $("completion-title").innerHTML = reached
        ? "750 words. <em>Done.</em>"
        : "Session <em>finished.</em>";
      $("completion-eyebrow").textContent = reached
        ? "Word goal reached."
        : "Session finished.";
      $("completion-copy").textContent = reached
        ? "You reached your goal. Your words are yours to keep."
        : `${words} of ${WORD_GOAL} words. Your page is yours to keep, even when you finish early.`;
    }
    if (rant) {
      $("completion-eyebrow").textContent = "Out of your head. Off the page.";
      $("completion-copy").textContent =
        "Your rant has been erased. Nothing was saved. There is no recovery.";
    }
    $("export-source").textContent =
      selectedSnapshot === null
        ? "Current text"
        : selectedSnapshot === 0
          ? "Original · before the first deletion"
          : "Recovery snapshot · exact saved version";
    $("current-button").hidden = rant || selectedSnapshot === null;
    $("recovery-button").disabled = state.snapshots.length === 0;
    $("recovery-button").title = state.snapshots.length
      ? "View exact copies stored in this browser before automatic deletion"
      : "No words vanished, so no recovery snapshots were needed";
    for (const id of ["copy-button", "txt-button", "md-button"])
      $(id).disabled = text.length === 0;
  }
  renderClock();
  if (view !== lastView) {
    if (completed) $("completion-title").focus({ preventScroll: true });
    if (suspended && !document.hidden)
      $("resume-button").focus({ preventScroll: true });
  }
  lastView = view;
}
function dispatch(event, time = now()) {
  if (!state) return;
  const before = state;
  const next = transition(state, event, time);
  if (next === before) {
    renderClock();
    return;
  }
  state = next;
  if (before.pending !== state.pending) {
    if (state.pending) showDissolve();
    else stopDissolve();
  }
  render();
  if (
    state.mode === "words750" &&
    !state.composing &&
    !goalAnnounced &&
    countWords(state.text) >= WORD_GOAL &&
    ["input", "compositionEnd"].includes(event.type)
  ) {
    goalAnnounced = true;
    notify(
      "750 words. You reached your goal. Keep writing, or finish when you’re ready.",
    );
  }
  if (
    before.status !== state.status ||
    before.snapshots !== state.snapshots ||
    event.type === "suspend"
  )
    flushSave();
  else if (before.text !== state.text) scheduleSave();
}
function setupChanged() {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  const minutes = Number($("custom-minutes").value);
  const unit = $("grace-unit").value;
  const value = Number($("grace-value").value);
  $("grace-value").min = unit === "seconds" ? "1" : String(1 / 60);
  $("grace-value").max = unit === "seconds" ? "600" : "10";
  const note = $("grace-note");
  const goal = mode === "words750";
  const erasing = goal && $("goal-erase").checked;
  $("goal-erase-setup").hidden = !goal;
  $("session-settings").hidden = goal && !erasing;
  $("custom-row").hidden = goal;
  $("custom-minutes").disabled = goal;
  for (const id of ["grace-value", "grace-unit"])
    $(id).disabled = goal && !erasing;
  note.textContent = goal
    ? erasing
      ? `No timer. After ${value} ${unit} without typing, words begin to erase. Recovery stays in this browser.`
      : "No timer. No disappearing words. Saved in this browser."
    : `Pause for ${value} ${unit} and your last words begin to fade.`;
  $("settings-summary").textContent =
    `${goal ? "No timer" : `${minutes} min`} · ${value} ${unit === "seconds" ? "sec" : "min"} pause`;
  $("mode-description").textContent = goal
    ? "750 words for yourself. Inspired by The Artist’s Way."
    : mode === "rant"
      ? "Write it out. Leave no saved copy."
      : "Write it out. Keep your page.";
  const rant = mode === "rant";
  $("rant-note").hidden = !rant;
  $("recovery-note").hidden = rant || goal;
  $("begin-button").innerHTML = rant
    ? 'Start rant <span aria-hidden="true">↗</span>'
    : 'Start writing <span aria-hidden="true">↗</span>';
  $("privacy-label").textContent = rant
    ? "Rant is never saved."
    : "Saved only in this browser.";
}
function begin(event) {
  event?.preventDefault();
  if (state || !$("setup-form").reportValidity()) return;
  const mode = document.querySelector('input[name="mode"]:checked').value;
  const minutes = mode === "words750" ? 10 : Number($("custom-minutes").value);
  try {
    const graceMs =
      mode === "words750" && !$("goal-erase").checked
        ? MODES.words750.grace
        : Math.round(
            Number($("grace-value").value) *
              ($("grace-unit").value === "minutes" ? 60000 : 1000),
          );
    state = createSession(
      {
        id: makeId(),
        mode,
        minutes,
        graceMs,
        eraseOnPause: $("goal-erase").checked,
      },
      now(),
    );
    diskVersion = null;
    claimNote();
  } catch (error) {
    notify(error.message);
    return;
  }
  selectedSnapshot = null;
  goalAnnounced = false;
  lastSaved = "";
  render();
  flushSave();
  window.scrollTo({ top: 0, behavior: "instant" });
  editor.focus({ preventScroll: true });
}
function finish() {
  if (!state || state.status === "completed") return;
  dispatch({ type: "finish" });
  window.scrollTo({ top: 0, behavior: "instant" });
}
function suspend(reason) {
  if (state && ["ready", "active"].includes(state.status))
    dispatch({ type: "suspend", reason });
  else flushSave();
}
function download(extension) {
  if (!state || state.mode === "rant") return;
  const content = displayText();
  const url = URL.createObjectURL(
    new Blob([content], {
      type:
        extension === "md"
          ? "text/markdown;charset=utf-8"
          : "text/plain;charset=utf-8",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  const source =
    selectedSnapshot === null
      ? "current"
      : selectedSnapshot === 0
        ? "original"
        : "recovery";
  a.download = `vanishing-words-${source}-${new Date().toISOString().slice(0, 10)}.${extension}`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  notify(`Download requested for ${source} text. Check your downloads.`);
}
function openRecovery() {
  if (!state?.snapshots.length || state.mode === "rant") return;
  const select = $("snapshot-choice");
  select.replaceChildren();
  state.snapshots.forEach((snapshot, index) => {
    const option = document.createElement("option");
    option.value = index;
    option.textContent =
      index === 0
        ? `Original — before the first deletion (${countWords(snapshot.text)} words)`
        : `${new Date(snapshot.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} — ${countWords(snapshot.text)} words`;
    select.append(option);
  });
  select.value = String(selectedSnapshot ?? 0);
  $("snapshot-preview").value = state.snapshots[Number(select.value)].text;
  $("archive-note").textContent = state.archiveTrimmed
    ? "Showing the first original and 19 most recent snapshots. Older intermediate versions have been removed. Manual edits are not reconstructed."
    : `${state.snapshots.length} exact ${state.snapshots.length === 1 ? "snapshot" : "snapshots"}. The original is the page before its first automatic deletion, not a full transcript of everything typed.`;
  $("recovery-dialog").showModal();
}
function loadDraft() {
  try {
    let latest = null;
    let invalid = false;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      try {
        const raw = JSON.parse(localStorage.getItem(key));
        const restored = restoreSession(raw, now());
        if (!restored) {
          invalid = true;
          continue;
        }
        if (!latest || raw.updatedAt > latest.savedAt)
          latest = { restored, savedAt: raw.updatedAt };
      } catch {
        invalid = true;
      }
    }
    if (latest) {
      state = latest.restored;
      diskVersion = localStorage.getItem(PREFIX + state.id);
      claimNote();
      goalAnnounced =
        state.mode === "words750" && countWords(state.text) >= WORD_GOAL;
      render();
      notify(
        state.status === "completed"
          ? "Your last page is here, just as you left it."
          : "Draft restored safely. Resume only when you’re ready.",
      );
    }
    if (invalid)
      storageWarning(
        "A saved page could not be read. It has not been removed. Any readable draft is shown; export important writing.",
      );
  } catch {
    storageWarning(
      "Local saving is unavailable in this browser. You can still write, then copy or download before closing the tab.",
    );
  }
}

$("setup-form").addEventListener("submit", begin);
$("setup-form").addEventListener(
  "invalid",
  () => {
    $("session-settings").open = true;
  },
  true,
);
let previousGraceUnit = "seconds";
$("grace-unit").addEventListener("change", () => {
  const next = $("grace-unit").value;
  const value = Number($("grace-value").value);
  if (next !== previousGraceUnit && Number.isFinite(value))
    $("grace-value").value = String(
      next === "minutes" ? value / 60 : Math.round(value * 60),
    );
  previousGraceUnit = next;
});
$("setup-form").addEventListener("change", setupChanged);
$("grace-value").addEventListener("input", setupChanged);
$("about-button").addEventListener("click", () =>
  $("about-dialog").showModal(),
);
$("recovery-info").addEventListener("click", () =>
  $("local-recovery-dialog").showModal(),
);
for (const button of document.querySelectorAll("[data-close]"))
  button.addEventListener("click", () => button.closest("dialog").close());
$("home-link").addEventListener("click", (event) => {
  if (!state) return;
  event.preventDefault();
  goHome();
});
editor.addEventListener("input", () => {
  setControls(false);
  dispatch({ type: "input", text: editor.value });
});
editor.addEventListener("focus", () => setControls(false));
$("controls-toggle").addEventListener("click", () =>
  setControls($("writing-controls").hidden, true),
);
document.addEventListener("pointerdown", (event) => {
  if (
    !$("writing-controls").hidden &&
    !event.target.closest("#writing-controls, #controls-toggle")
  )
    setControls(false);
});
document.addEventListener("keydown", (event) => {
  if (
    event.key !== "Escape" ||
    fullscreenElement() ||
    event.isComposing ||
    document.querySelector("dialog[open]") ||
    !state ||
    !["ready", "active"].includes(state.status)
  )
    return;
  event.preventDefault();
  setControls($("writing-controls").hidden, true);
});
systemColorScheme.addEventListener("change", () => {
  if (appearance.colorMode === "system") applyAppearance();
});
for (const radio of document.querySelectorAll('[name="color-mode"]')) {
  radio.addEventListener("change", () => {
    appearance.colorMode = radio.value;
    applyAppearance(true);
  });
}
for (const radio of document.querySelectorAll('[name="paper-tone"]')) {
  radio.addEventListener("change", () => {
    appearance.tone = radio.value;
    applyAppearance(true);
  });
}
$("show-word-count").addEventListener("change", () => {
  if (!state) return;
  appearance.wordCount[state.mode] = $("show-word-count").checked;
  applyAppearance(true);
  render();
});
$("show-progress").addEventListener("change", () => {
  appearance.progress = $("show-progress").checked;
  applyAppearance(true);
  render();
});
for (const eventName of ["copy", "cut"])
  editor.addEventListener(eventName, (event) => {
    if (state?.mode === "rant") {
      event.preventDefault();
      notify(
        "Rant is disposable. Choose Journal or 750 Words when you want to keep your words.",
      );
    }
  });
editor.addEventListener("compositionstart", () =>
  dispatch({ type: "compositionStart" }),
);
editor.addEventListener("compositionend", () => {
  dispatch({ type: "input", text: editor.value });
  dispatch({ type: "compositionEnd" });
});
editor.addEventListener("scroll", () => {
  if (state?.pending)
    mirror.style.transform = `translateY(${-editor.scrollTop}px)`;
});
window.addEventListener("resize", () => {
  if (state?.pending) showDissolve();
});
$("finish-button").addEventListener("click", finish);
$("keep-button").addEventListener("click", finish);
$("resume-button").addEventListener("click", () => {
  dispatch({ type: "resume" });
  lastTickAt = now();
  editor.focus({ preventScroll: true });
});
$("copy-button").addEventListener("click", async () => {
  if (!state || state.mode === "rant") return;
  try {
    await navigator.clipboard.writeText(displayText());
    notify("Copied. Take your words somewhere good.");
  } catch {
    notify(
      "Copy was blocked. Select the text and copy manually, or download it.",
    );
    editor.focus();
    editor.select();
  }
});
$("txt-button").addEventListener("click", () => download("txt"));
$("md-button").addEventListener("click", () => download("md"));
$("recovery-button").addEventListener("click", openRecovery);
$("snapshot-choice").addEventListener("change", () => {
  $("snapshot-preview").value =
    state.snapshots[Number($("snapshot-choice").value)].text;
});
$("use-snapshot").addEventListener("click", () => {
  selectedSnapshot = Number($("snapshot-choice").value);
  $("recovery-dialog").close();
  render();
  notify("Recovery version selected. Your current text is unchanged.");
});
$("current-button").addEventListener("click", () => {
  selectedSnapshot = null;
  render();
});
function leaveSafely(action) {
  if (state?.mode === "rant" && state.text) {
    afterRantLeave = action;
    $("rant-leave-dialog").showModal();
    return;
  }
  if (state?.mode !== "rant") suspend("switching");
  if (!flushSave()) {
    notify(
      "Save is blocked. Finish and copy or download before switching notes.",
    );
    return;
  }
  action();
}
function newNote(mode = state?.mode || "journal") {
  const previous = state;
  leaveSafely(() => {
    state = createSession(
      {
        id: makeId(),
        mode,
        minutes: previous ? previous.duration / 60000 : 10,
        graceMs: previous?.grace || 45000,
        eraseOnPause: mode === "words750" && Boolean(previous?.eraseOnPause),
      },
      now(),
    );
    diskVersion = null;
    lastSaved = "";
    selectedSnapshot = null;
    goalAnnounced = false;
    claimNote();
    stopDissolve();
    setControls(false);
    render();
    flushSave();
    window.scrollTo({ top: 0, behavior: "instant" });
    editor.focus({ preventScroll: true });
  });
}
function goHome() {
  leaveSafely(() => {
    state = null;
    selectedSnapshot = null;
    diskVersion = null;
    lastSaved = "";
    claimNote();
    stopDissolve();
    render();
    $("landing-notes-button").hidden = false;
    $("begin-button").focus({ preventScroll: true });
  });
}
function openNotes() {
  resumeAfterNotes = Boolean(
    state &&
    ["ready", "active"].includes(state.status) &&
    state.mode !== "rant",
  );
  // Browsing notes never ends a rant; only selecting a different note does.
  if (state?.mode !== "rant") suspend("notes");
  if (!flushSave()) {
    notify("Save is blocked. Copy or download before switching notes.");
    return;
  }
  const list = $("notes-list");
  list.replaceChildren();
  const records = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      try {
        const raw = JSON.parse(localStorage.getItem(key));
        if (
          restoreSession(raw, now()) &&
          (raw.text.trim() || raw.snapshots.length)
        )
          records.push(raw);
      } catch {
        /* Keep unreadable data untouched. */
      }
    }
  } catch {
    storageWarning(
      "Saved notes are unavailable. Your current page is still open.",
    );
  }
  records.sort((a, b) => b.updatedAt - a.updatedAt);
  for (const note of records) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "saved-note";
    const title = document.createElement("strong");
    title.textContent = (
      note.text.trim().split("\n")[0] || "Recovered writing"
    ).slice(0, 100);
    const meta = document.createElement("span");
    meta.textContent = `${MODES[note.mode].label} · ${countWords(note.text)} words · ${new Date(note.updatedAt).toLocaleDateString()}${state?.id === note.id ? " · Current" : ""}`;
    button.append(title, meta);
    button.addEventListener("click", () => {
      $("notes-dialog").close();
      resumeAfterNotes = false;
      leaveSafely(() => {
        let stored, restored;
        try {
          stored = localStorage.getItem(PREFIX + note.id);
          restored = restoreSession(JSON.parse(stored), now());
        } catch {
          notify(
            "This note could not be read. Your current page is unchanged.",
          );
          return;
        }
        if (!restored) {
          notify("This note could not be opened. It has not been removed.");
          return;
        }
        state = restored;
        diskVersion = stored;
        lastSaved = "";
        selectedSnapshot = null;
        claimNote();
        goalAnnounced = countWords(state.text) >= WORD_GOAL;
        stopDissolve();
        render();
        if (state.status === "suspended") dispatch({ type: "resume" });
        editor.focus({ preventScroll: true });
      });
    });
    list.append(button);
  }
  $("notes-empty").hidden = records.length > 0;
  $("notes-dialog").showModal();
}
$("notes-dialog").addEventListener("close", () => {
  if (resumeAfterNotes && state?.status === "suspended")
    dispatch({ type: "resume" });
  resumeAfterNotes = false;
});
for (const id of [
  "notes-button",
  "completed-notes-button",
  "landing-notes-button",
  "paused-notes-button",
])
  $(id).addEventListener("click", openNotes);
$("home-button").addEventListener("click", goHome);
$("new-button").addEventListener("click", () => newNote());
$("menu-new-button").addEventListener("click", () =>
  newNote($("new-note-mode").value),
);
$("edit-note-button").addEventListener("click", () => {
  selectedSnapshot = null;
  dispatch({ type: "edit" });
  editor.focus({ preventScroll: true });
});
$("session-goal-erase").addEventListener("change", () => {
  if (state?.mode !== "words750") return;
  state = {
    ...state,
    eraseOnPause: $("session-goal-erase").checked,
    pending: null,
    lastInputAt: now(),
  };
  stopDissolve();
  render();
  flushSave();
});
$("cancel-rant-leave").addEventListener("click", () => {
  afterRantLeave = null;
  $("rant-leave-dialog").close();
});
$("rant-leave-dialog").addEventListener("cancel", () => {
  afterRantLeave = null;
});
$("confirm-rant-leave").addEventListener("click", () => {
  const action = afterRantLeave;
  afterRantLeave = null;
  dispatch({ type: "leave" });
  $("rant-leave-dialog").close();
  action?.();
});
document.addEventListener("keydown", (event) => {
  if (
    event.isComposing ||
    document.querySelector("dialog[open]") ||
    !(event.metaKey || event.ctrlKey) ||
    event.key !== "Enter"
  )
    return;
  if (event.shiftKey && state && state.status !== "completed") {
    event.preventDefault();
    finish();
  } else if (!event.shiftKey && !state) {
    event.preventDefault();
    begin();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) suspend("hidden");
  else if (state?.mode === "rant") dispatch({ type: "tick" });
  lastTickAt = now();
});
function leavePage() {
  if (state?.mode === "rant") {
    dispatch({ type: "leave" });
    editor.value = "";
    editor.defaultValue = "";
    stopDissolve();
  } else suspend("hidden");
}
window.addEventListener("pagehide", leavePage);
window.addEventListener("beforeunload", leavePage);
window.addEventListener("pageshow", () => {
  if (state?.mode === "rant") {
    dispatch({ type: "tick" });
    render();
  }
});
setInterval(() => {
  const time = now();
  if (document.hidden) {
    if (
      state?.mode === "rant" &&
      state.status === "active" &&
      time >= state.deadline
    )
      dispatch({ type: "tick" }, time);
    lastTickAt = time;
    return;
  }
  if (state?.status === "active" && time - lastTickAt > 2000)
    suspend("interrupted");
  else dispatch({ type: "tick" }, time);
  lastTickAt = time;
}, 100);
applyAppearance();
setupChanged();
render();
loadDraft();
