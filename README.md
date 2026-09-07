# Vanishing Words

A quiet writing app. Let a thought out before you edit it away.

## Try it

[Open Vanishing Words](https://budhennekes.github.io/vanishing-words/)

- **Journal:** Keep your writing. Recovery snapshots are available after automatic deletions.
- **Rant:** Write without keeping a record. Nothing is saved. Remaining text is erased when the session ends, you finish, or you leave.
- **750 Words:** Write toward a 750-word goal with no timer or automatic deletion. A quiet counter shows progress. Reaching the goal does not interrupt input; finish when ready, or keep writing. Early finish also keeps your page. Inspired by the freewriting spirit of _The Artist’s Way_, rather than a literal reproduction of its handwritten morning-pages practice.

Choose a mode and start. In Journal and Rant, open **Session settings** to change the two independent timers:

- **Write for:** 1–240 whole minutes; default 10.
- **Delete after:** 1 second–10 minutes without typing; default 45 seconds.

Switching modes preserves both settings. In 750 Words, these controls are hidden and their values are not used or changed. In the timed modes, the clock begins on the first non-whitespace input. After the pause, the last word dissolves and disappears. Typing cancels deletion immediately. Session completion takes priority over deletion.

## Focused writing

The writing canvas shows text and one three-dot Session options control. A **Show word count** toggle in Session options controls the quiet counter at the bottom. It defaults to off in Journal and Rant, and on in 750 Words. Each mode remembers its own choice in this browser. Hiding the counter does not stop the goal or its milestone acknowledgment; the count remains available inside Session options. 750 Words options omit the timer and pause indicator. Words are whitespace-separated groups, including pasted text. Manual edits update the count, and reaching 750 gives one acknowledgment per session without stealing focus. Open it for time remaining, Finish, word count, Paper/Sand/Sage/Mist backgrounds, or the optional pause indicator (off by default).

- **Esc:** Open/close session options. Closing returns focus to writing.
- **Cmd/Ctrl+Enter:** Begin from setup.
- **Cmd/Ctrl+Shift+Enter:** Finish. Journal and 750 Words keep words; Rant erases them.

The native textarea preserves selection, paste, cursor movement, and IME composition. Reduced-motion preferences are respected. Opening session options does not pause either clock.

## Privacy and recovery

The app does not transmit your writing. We do not receive or store copies of it. The recovery link explains local storage before writing; the recovery picker repeats this boundary. If browser data is removed, we cannot restore it for you. Journal and 750 Words drafts, plus Journal’s exact, bounded recovery snapshots, live in this browser’s localStorage. This is not encryption or a backup service. Export important writing. Clearing browser data can remove drafts. Localhost and the hosted app have separate storage; drafts do not sync between them.

Journal stops safely when you switch tabs. Reloaded drafts require explicit resume. Restored tabs use separate session IDs so they do not overwrite each other’s drafts. Older Content/Sprint drafts remain readable for compatibility; these modes are no longer offered.

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
