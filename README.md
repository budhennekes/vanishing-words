# Let It Out

A quiet writing app. Let a thought out before you edit it away.

## Try it

[Open Let It Out](https://budhennekes.github.io/vanishing-words/)

- **Journal:** Keep your writing. Recovery snapshots are available after automatic deletions.
- **Let it go:** Write without keeping a record. Nothing is saved. Remaining text is erased when the session ends, you finish, or you leave.
- **750 Words:** Write toward a 750-word goal with no timer. Automatic deletion is off by default; optionally enable erasing after a pause to keep writing. A quiet counter shows progress. Reaching the goal does not interrupt input; finish when ready, or keep writing. Early finish also keeps your page. Inspired by the freewriting spirit of _The Artist’s Way_, rather than a literal reproduction of its handwritten morning-pages practice.
- **Brainstorm:** Keep one or more simple question-and-answer sections in a local, untimed note. Questions and answers do not erase automatically.

The introduction starts on the existing forest scene with **Try disappearing words**. An isolated sample uses the real writing engine with an explicitly labeled, faster 3-second preview. Pausing removes words; typing cancels disappearance. The sample is never saved and is discarded on exit. The actual default remains 15 seconds. **Next: what stays** explains independent session duration, Journal recovery, disposable Let it go, untimed 750 Words, and local Brainstorm notes. **Choose a writing mode** and **Skip introduction** both open the shared Home chooser; neither creates a Journal silently. All four modes have equal, described radio choices and a selected-mode Start button. This introduction appears once on upgrade too, changing only its separate dismissal marker, never existing notes. Replay through **How it works → Replay introduction** on Home. If local storage is unavailable, writing remains accessible, but preferences cannot survive a restart.

Choose a mode and start. In Journal and Let it go, two independent settings are visible directly in setup, without opening a disclosure:

- **Write for:** 1–240 whole minutes; default 10.
- **Words start disappearing after:** 1 second–10 minutes without typing; default 15 seconds. Typing again stops deletion. **Write for** independently controls how long the session lasts.

Switching modes preserves both settings. In 750 Words, the duration control is disabled. Enabling erasing reveals the independent deletion delay; the goal still has no timer. In the timed modes, the clock begins on the first non-whitespace input. After the pause, the last word dissolves and disappears. Typing cancels deletion immediately. Session completion takes priority over deletion.

## Focused writing

The writing canvas shows text and one three-dot Session options control. A **Show word count** toggle in Session options controls the quiet counter at the bottom. It defaults to off in Journal and Let it go, and on in 750 Words. Each mode remembers its own choice in this browser. Hiding the counter does not stop the goal or its milestone acknowledgment; the count remains available inside Session options. 750 Words options omit the timer and pause indicator. Words are whitespace-separated groups, including pasted text. Manual edits update the count, and reaching 750 gives one acknowledgment per session without stealing focus. Open it for time remaining, Finish, word count, Paper/Sand/Sage/Mist backgrounds, or the optional pause indicator (off by default).

- **Esc:** Open/close session options. Closing returns focus to writing.
- **Cmd/Ctrl+Enter:** Begin from setup.
- **Cmd/Ctrl+Shift+Enter:** Finish. Journal and 750 Words keep words; Let it go erases them.

The native textarea preserves selection, paste, cursor movement, and IME composition. Reduced-motion preferences are respected. Opening session options does not pause either clock.

Spellcheck is off by default. **Check spelling** in Session options opts into native spelling checks and remembers the display preference separately from note text. It does not change session clocks or replace the textarea.

## Mac test app

This repository includes an Electron wrapper for local Apple Silicon testing. Run `npm ci`, then `npm run desktop` to launch from source, or `npm run desktop:package` to create a self-contained `.app` under `~/Documents/RoomToWriteBuilds/`.

The Mac app bundles its fonts and photographs and works without the hosted website. It uses an isolated, sandboxed renderer with no Node access. Only bundled runtime files are served; remote HTTP requests, new windows, and permissions other than fullscreen are blocked.

Notes stay in the app’s local Chromium storage under its macOS application-support directory. They persist across quits, but are not encrypted files or an automatic backup. Export important writing. Web and Mac notes are separate and do not sync. Removing app data can remove notes. Let it go never saves a record.

This is a local test build, not a signed/notarized customer release. The repository URL and legacy storage keys remain unchanged to preserve existing web drafts. The product’s displayed name is Let It Out; commercial name clearance is still pending. The Mac app retains its original Room to Write data directory, bundle ID, and rtwrite origin so the name change does not create an empty library.

## Visible navigation and release

The writing page exposes **Home**, **Notes**, and **New entry** without opening settings, plus a quiet current-mode label. Timed sessions show time remaining by default; hide it with **Show time remaining** in Session options. Untimed 750 Words and editing finished notes never show a session countdown. The inactivity delay remains separate.

Notes supports full-text search. Library entries open read-only without starting timers or changing the saved record. Unfinished entries show remaining time (or No timer) in the list. After selecting one, **Continue session** resumes its saved remaining time; **Edit note** instead begins untimed editing with a visible **Editing · No timer** indicator and no automatic deletion. Finished entries do not offer Continue. Home shows up to three recent entries, plus the explicit Continue/Open last note action.

Each Notes entry has a visible **Delete** action. Confirmation names the note and explains permanent removal of its writing and recovery snapshots. Cancel/Escape does not delete. Successful deletion removes the stored record, clears any current copy and recovery display, and updates Home/Notes. Content-free per-note deletion markers prevent stale tabs, queued saves and later reloads from reviving that ID. Already separate notes and downloaded exports are unaffected. If the marker cannot be saved, nothing is removed. If record cleanup fails after the marker is durable, reopening is blocked and Notes offers **Retry deletion**, including after reload. This is application-level removal, not forensic disk erasure. Keep old app versions closed when using the updated app; an old version does not understand these new deletion markers.

Let it go has a visible **Let go** button. It stops the session and clears its state immediately; an ephemeral display copy drifts away for less than a second, then is removed. Reduce Motion uses a short fade. Nothing is uploaded or stored. The release screen offers **New entry**, returning to the shared mode chooser.

## Notes and navigation

After the first-run introduction, the app opens on the scenic home screen, even when saved writing exists. Choose Journal, Let it go, 750 Words, or Brainstorm and start, **Continue last note** (or **Open last note** for finished writing), or **Notes**. Nothing resumes or deletes words until you explicitly reopen a note.

Open **Notes** in Session options or from a finished or paused page. Notes use the first line as their title. Every new-entry action, including the paused and finished page actions, returns to the same mode chooser as Home. Retained writing is paused and saved before leaving; a nonempty Let it go session requires disposal confirmation. Current session settings are reflected in the chooser without changing saved note clocks. There is no separate mode dropdown in Session options. The chooser creates a new page only when its selected-mode Start action is used.

Opening Notes pauses retained sessions. Selecting a library page opens it for reading without resuming its clock; Continue last note from Home explicitly resumes unfinished writing. **Edit note** lets you revise a completed page without restarting its timer or deletion. Failed saves block navigation away from the current draft. Leaving a nonempty Let it go session for another note asks before erasing it. Let it go never appears in Notes.

750 Words has an **Erase after a pause** toggle in Session options. Turning it off cancels pending deletion. When enabled, words disappear after the configured delay, but exact pre-deletion snapshots remain recoverable. This is a writing aid, not disposable Let it go behavior.

## Fullscreen

Choose **Enter fullscreen** in the three-dot menu to use the browser’s actual Fullscreen API. The same control becomes **Exit fullscreen**. Browser Escape exits fullscreen without toggling the app menu. The full document expands, so Notes and recovery dialogs remain available. Text keeps a readable line length. Fullscreen stays active when starting another note; it is not forced on reload.

Fullscreen requires a click and browser support. Unsupported browsers show an explanation rather than pretending an enlarged page is fullscreen. iPhone support varies; a Home Screen standalone view is an alternative, not the Fullscreen API.

## Appearance

Open the three-dot Session options menu and choose **Light**, **Dark**, or **System**. System is the default and follows live operating-system theme changes. An explicit Light or Dark choice overrides the system. The browser remembers this preference separately from writing, along with your selected Paper, Sand, Sage, or Mist tone. Each tone has a matching dark palette.

The writing surface, menus, completion view, dialogs, recovery fields, selections, caret, and status messages follow the theme. The scenic arrival photograph remains the same. Appearance is applied before the stylesheet paints, then kept in sync while the app runs. If preference saving fails, the choice still applies for this visit and a message explains the limitation. Appearance changes do not change timers, word goals, or saved text.

**Writing background** in Session options offers six static washes: Linen, Sea Glass, Blue Hour, Apricot Haze, Dusk, and After Hours, plus **Matrix (black)**: a true #000000 background with restrained, readable green writing by default. **Writing text** offers a small persisted Default, Green, or Amber choice for the native editor and Brainstorm answers; safe shades adjust for dark backgrounds. Matrix contains no glow, rain, flicker, motion, or sound. Each background uses its own light/dark palette. **Plain (page color)** restores the existing solid tone and saved Light/Dark/System preference; selecting a solid tone also returns to Plain. Background and writing-ink preferences stay in the separate appearance record, never in notes. The default remains Plain.

## Privacy and recovery

The app does not transmit your writing. We do not receive or store copies of it. The recovery link explains local storage before writing; the recovery picker repeats this boundary. If browser data is removed, we cannot restore it for you. Journal and 750 Words drafts, plus exact, bounded recovery snapshots, live in this browser’s localStorage. This is not encryption or a backup service. Export important writing. Clearing browser data can remove drafts. Localhost and the hosted app have separate storage; drafts do not sync between them.

Journal stops safely when you switch tabs. Reload returns home; use Continue last note to resume a saved draft. Reload keeps the same note ID. Browser locks give a second tab its own copy when the original note is still open, so the tabs cannot overwrite one another. Browsers without lock support restore separate copies for safety. Older Content/Sprint drafts remain readable for compatibility; these modes are no longer offered.

Recovery retains the exact page before the first automatic deletion plus up to 19 recent snapshots. It is not a full typing history. Copies and TXT/Markdown exports preserve the selected text exactly.

Let it go has no persistence, snapshots, or export. Its deadline continues while hidden; JavaScript checks an expired deadline when the browser next runs it. Leaving clears the textarea and visual mirror. This is disposable app behavior, not secure memory erasure or protection from screenshots, extensions, or developer tools.

Appearance preferences are saved separately from writing. A storage error shows a visible warning and keeps text in memory. GitHub may process normal website access logs; the app adds no analytics or third-party runtime requests.

## Run locally

Requires Python 3 and a modern browser. No install or build is needed.

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Open `http://127.0.0.1:8080`. Use HTTP, not a double-clicked HTML file, because the app uses ES modules.

## Tests

Requires Node 20+, the existing development dependencies, and a Playwright browser:

```sh
npm ci
PLAYWRIGHT_SKIP_BROWSER_GC=1 npx playwright install chromium
npm test
# Optional second engine:
PLAYWRIGHT_SKIP_BROWSER_GC=1 npx playwright install webkit
UX_BROWSER=webkit node --test release-ux.test.js
```

The `release-ux.test.js` suite starts its own ephemeral loopback server and uses fresh isolated browser contexts with synthetic writing. It covers interactive onboarding, upgrade visibility without record changes, keyboard entry, reduced motion, sample isolation and contrast, individual deletion/cancel, active drafts, failed deletion/cleanup retry, multi-tab resurrection, spellcheck persistence/IME, read-first continuation, untimed editing, default deletion/recovery, Let it go disposal, and responsive screenshots. Screenshots go outside the repository to `../qa-v2/mac-ux-chromium/` or `../qa-v2/mac-ux-webkit/`. Existing engine tests are unchanged. The browser suite requires an installed Chromium binary when running `npm test`.

For a timestamped local build in a chosen delivery directory, set `RTW_BUILD_ROOT` when running `npm run desktop:package`. The default remains `~/Documents/RoomToWriteBuilds/`; prior artifacts are never overwritten. Native QA uses only temporary `RTW_QA_PROFILE` directories, not real user notes.

The engine tests cover first-input start, independent timers, deletion cancellation, exact recovery, deadline priority, IME protection, safe restoration, disposable Let it go sessions, and the untimed 750-word goal (749/750/751 words, long pauses, IME, early finish, and restoration). Browser QA also covers responsive layouts, focus controls, copy/download, long Unicode drafts, storage failure, and automated accessibility checks. Responsive viewport testing is not physical iPhone/Safari testing.

## Assets

Fonts and imagery are self-hosted; licenses are preserved in `assets/`.

- InterVariable by Rasmus Andersson: https://github.com/rsms/inter — SIL Open Font License.
- Instrument Serif by Instrument: https://github.com/google/fonts/tree/main/ofl/instrumentserif — SIL Open Font License.
- Landscape photograph: https://images.unsplash.com/photo-1473448912268-2022ce9509d8 — [Unsplash license](https://unsplash.com/license). No claim is made about its location.
