# Vanishing Words

A quiet writing app. Let a thought out before you edit it away.

## Try it

[Open Vanishing Words](https://budhennekes.github.io/vanishing-words/)

- **Journal:** Keep your writing. Recovery snapshots are available after automatic deletions.
- **Rant:** Write without keeping a record. Nothing is saved. Remaining text is erased when the session ends, you finish, or you leave.
- **750 Words:** Write toward a 750-word goal with no timer. Automatic deletion is off by default; optionally enable erasing after a pause to keep writing. A quiet counter shows progress. Reaching the goal does not interrupt input; finish when ready, or keep writing. Early finish also keeps your page. Inspired by the freewriting spirit of _The Artist’s Way_, rather than a literal reproduction of its handwritten morning-pages practice.

Choose a mode and start. In Journal and Rant, open **Session settings** to change the two independent timers:

- **Write for:** 1–240 whole minutes; default 10.
- **Delete after:** 1 second–10 minutes without typing; default 45 seconds.

Switching modes preserves both settings. In 750 Words, the duration control is disabled. Enabling erasing reveals the independent deletion delay; the goal still has no timer. In the timed modes, the clock begins on the first non-whitespace input. After the pause, the last word dissolves and disappears. Typing cancels deletion immediately. Session completion takes priority over deletion.

## Focused writing

The writing canvas shows text and one three-dot Session options control. A **Show word count** toggle in Session options controls the quiet counter at the bottom. It defaults to off in Journal and Rant, and on in 750 Words. Each mode remembers its own choice in this browser. Hiding the counter does not stop the goal or its milestone acknowledgment; the count remains available inside Session options. 750 Words options omit the timer and pause indicator. Words are whitespace-separated groups, including pasted text. Manual edits update the count, and reaching 750 gives one acknowledgment per session without stealing focus. Open it for time remaining, Finish, word count, Paper/Sand/Sage/Mist backgrounds, or the optional pause indicator (off by default).

- **Esc:** Open/close session options. Closing returns focus to writing.
- **Cmd/Ctrl+Enter:** Begin from setup.
- **Cmd/Ctrl+Shift+Enter:** Finish. Journal and 750 Words keep words; Rant erases them.

The native textarea preserves selection, paste, cursor movement, and IME composition. Reduced-motion preferences are respected. Opening session options does not pause either clock.

## Notes and navigation

Open **Notes** in Session options or from a finished or paused page. Notes use the first line as their title. **New note** saves the current page and opens a blank one in the current mode without visiting setup. The menu also lets you choose another mode for the new page. **Back to start screen** explicitly returns to setup.

Opening Notes pauses retained sessions. Selecting a page resumes its saved remaining time; completed pages open for reading. **Edit note** lets you revise a completed page without restarting its timer or deletion. Failed saves block navigation away from the current draft. Leaving a nonempty Rant for another note asks before erasing it. Rant never appears in Notes.

750 Words has an **Erase after a pause** toggle in Session options. Turning it off cancels pending deletion. When enabled, words disappear after the configured delay, but exact pre-deletion snapshots remain recoverable. This is a writing aid, not disposable Rant behavior.

## Fullscreen

Choose **Enter fullscreen** in the three-dot menu to use the browser’s actual Fullscreen API. The same control becomes **Exit fullscreen**. Browser Escape exits fullscreen without toggling the app menu. The full document expands, so Notes and recovery dialogs remain available. Text keeps a readable line length. Fullscreen stays active when starting another note; it is not forced on reload.

Fullscreen requires a click and browser support. Unsupported browsers show an explanation rather than pretending an enlarged page is fullscreen. iPhone support varies; a Home Screen standalone view is an alternative, not the Fullscreen API.

## Appearance

Open the three-dot Session options menu and choose **Light**, **Dark**, or **System**. System is the default and follows live operating-system theme changes. An explicit Light or Dark choice overrides the system. The browser remembers this preference separately from writing, along with your selected Paper, Sand, Sage, or Mist tone. Each tone has a matching dark palette.

The writing surface, menus, completion view, dialogs, recovery fields, selections, caret, and status messages follow the theme. The scenic arrival photograph remains the same. Appearance is applied before the stylesheet paints, then kept in sync while the app runs. If preference saving fails, the choice still applies for this visit and a message explains the limitation. Appearance changes do not change timers, word goals, or saved text.

## Privacy and recovery

The app does not transmit your writing. We do not receive or store copies of it. The recovery link explains local storage before writing; the recovery picker repeats this boundary. If browser data is removed, we cannot restore it for you. Journal and 750 Words drafts, plus exact, bounded recovery snapshots, live in this browser’s localStorage. This is not encryption or a backup service. Export important writing. Clearing browser data can remove drafts. Localhost and the hosted app have separate storage; drafts do not sync between them.

Journal stops safely when you switch tabs. Reloaded drafts require explicit resume. Reload keeps the same note ID. Browser locks give a second tab its own copy when the original note is still open, so the tabs cannot overwrite one another. Browsers without lock support restore separate copies for safety. Older Content/Sprint drafts remain readable for compatibility; these modes are no longer offered.

Recovery retains the exact page before the first automatic deletion plus up to 19 recent snapshots. It is not a full typing history. Copies and TXT/Markdown exports preserve the selected text exactly.

Rant has no persistence, snapshots, or export. Its deadline continues while hidden; JavaScript checks an expired deadline when the browser next runs it. Leaving clears the textarea and visual mirror. This is disposable app behavior, not secure memory erasure or protection from screenshots, extensions, or developer tools.

Appearance preferences are saved separately from writing. A storage error shows a visible warning and keeps text in memory. GitHub may process normal website access logs; the app adds no analytics or third-party runtime requests.

## Run locally

Requires Python 3 and a modern browser. No install or build is needed.

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Open `http://127.0.0.1:8080`. Use HTTP, not a double-clicked HTML file, because the app uses ES modules.

## Tests

Requires Node 20+:

```sh
npm test
```

The engine tests cover first-input start, independent timers, deletion cancellation, exact recovery, deadline priority, IME protection, safe restoration, disposable Rant, and the untimed 750-word goal (749/750/751 words, long pauses, IME, early finish, and restoration). Browser QA also covers responsive layouts, focus controls, copy/download, long Unicode drafts, storage failure, and automated accessibility checks. Responsive viewport testing is not physical iPhone/Safari testing.

## Assets

Fonts and imagery are self-hosted; licenses are preserved in `assets/`.

- InterVariable by Rasmus Andersson: https://github.com/rsms/inter — SIL Open Font License.
- Instrument Serif by Instrument: https://github.com/google/fonts/tree/main/ofl/instrumentserif — SIL Open Font License.
- Landscape photograph: https://images.unsplash.com/photo-1473448912268-2022ce9509d8 — [Unsplash license](https://unsplash.com/license). No claim is made about its location.
