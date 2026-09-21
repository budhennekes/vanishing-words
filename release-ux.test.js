import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";
import { createSession, transition } from "./engine.js";

// Only synthetic fixtures and fresh browser contexts. Never use native userData.
const PREFIX = "vanishing-words:v2:session:";
const SEEN = "vanishing-words:v2:welcome-seen";
const APPEARANCE = "vanishing-words:v2:appearance";
const browserName = process.env.UX_BROWSER || "chromium";
const evidence = fileURLToPath(new URL(`../qa-v2/mac-ux-${browserName}/`, import.meta.url));
let server, browser, base;
before(async () => {
  await mkdir(evidence, { recursive: true });
  server = createServer(async (req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;
    if (!/^\/(?:index\.html|app\.js|engine\.js|styles\.css|assets\/[\w.-]+)?$/.test(path)) {
      res.writeHead(404).end(); return;
    }
    try {
      const target = new URL(`.${path === "/" ? "/index.html" : path}`, import.meta.url);
      const mime = path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : path.endsWith(".jpg") ? "image/jpeg" : "text/html";
      res.writeHead(200, { "Content-Type": mime }); res.end(await readFile(target));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await ({ chromium, webkit }[browserName]).launch();
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
async function fresh(t, seed = {}, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ viewport, colorScheme: "light" });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto(base);
  if (Object.keys(seed).length) {
    seed = { [SEEN]: "2", ...seed };
    await page.evaluate(seed => { for (const [k,v] of Object.entries(seed)) localStorage.setItem(k,v); }, seed);
    await page.reload();
  }
  await page.waitForFunction(() => document.querySelector("#begin-button").textContent.includes("Begin writing"));
  return page;
}
const visible = (p, selector) => p.locator(selector).isVisible();
const records = p => p.evaluate(prefix => Object.keys(localStorage).filter(k => k.startsWith(prefix)).map(k => JSON.parse(localStorage[k])), PREFIX);
// Simulate deliberate top-edge pointer to reveal the writing nav during focus-view.
const revealNav = async (p) => {
  const vp = p.viewportSize();
  const x = vp ? Math.min(200, vp.width - 10) : 200;
  await p.mouse.move(x, 20);
  await p.locator("#page-navigation").waitFor({ state: "visible" }).catch(() => {});
};
function fixture(mode = "journal", completed = false) {
  let s = createSession({ id: `synthetic-${mode}`, mode, minutes: 10, graceMs: 45000 }, 1000);
  s = transition(s, { type: "input", text: "Synthetic note for release checks." }, 2000);
  return transition(s, { type: completed ? "finish" : "suspend" }, 182000);
}

test('setup exposes independent labeled settings and 750 only offers optional pause erasing', async t => {
  const p = await fresh(t, { [SEEN]: '2' }, {width:390,height:844});
  const duration = p.getByRole('spinbutton', {name:'Write for', exact:true});
  const delay = p.getByRole('spinbutton', {name:'Words start disappearing after', exact:true});
  assert.equal(await duration.isVisible(), true);
  assert.equal(await delay.isVisible(), true);
  assert.equal(await duration.getAttribute('aria-describedby'), 'duration-help');
  assert.equal(await delay.getAttribute('aria-describedby'), 'delay-help');
  await duration.fill('18'); await delay.fill('45');
  await p.locator('[name="mode"][value="rant"]').check();
  assert.equal(await duration.inputValue(), '18');
  assert.equal(await delay.inputValue(), '45');
  await p.locator('[name="mode"][value="words750"]').check();
  assert.equal(await duration.isVisible(), false);
  assert.equal(await delay.isVisible(), false);
  assert.ok((await p.locator('#grace-note').innerText()).includes('No session timer'));
  await p.locator('#goal-erase').check();
  assert.equal(await duration.isVisible(), false);
  assert.equal(await delay.isVisible(), true);
  assert.equal(await delay.inputValue(), '45');
  await p.locator('#goal-erase').uncheck();
  await p.locator('#begin-button').click();
  await p.locator('#editor').fill('Synthetic untimed settings preservation');
  await p.waitForTimeout(800);
  await revealNav(p);
  await p.locator('#nav-home').click();
  await p.locator('[name="mode"][value="journal"]').check();
  assert.equal(await duration.inputValue(), '18');
  assert.equal(await delay.inputValue(), '45');
  await p.locator('#begin-button').click();
  await p.locator('#editor').fill('Synthetic independent settings');
  await p.waitForTimeout(800);
  const timed = (await records(p)).find(n=>n.mode==='journal');
  assert.equal(timed.duration,1080000);
  assert.equal(timed.grace,45000);
});

for (const mode of ["journal", "rant", "words750"]) {
  test(`${mode} is selectable after onboarding and returning Home`, async t => {
    const p = await fresh(t);
    await p.locator('#welcome-next').click();
    await p.locator('#welcome-start').click();
    for (const choice of ['journal', 'rant', 'words750']) {
      assert.equal(await visible(p, `[name="mode"][value="${choice}"]`), true);
    }
    assert.deepEqual(await records(p), []);
    await p.locator(`[name="mode"][value="${mode}"]`).check();
    await p.locator('#begin-button').click();
    await revealNav(p);
    assert.equal(await visible(p, '#nav-mode'), true);
    assert.equal(await p.locator('#nav-mode').innerText(), {journal:'Journal',rant:'Let it go',words750:'750 Words'}[mode]);
    await p.locator('#editor').fill('Synthetic selected mode writing');
    await p.locator('#nav-home').click();
    if (mode === 'rant') {
      await p.locator('#cancel-rant-leave').click();
      assert.equal(await p.locator('#editor').inputValue(), 'Synthetic selected mode writing');
      await revealNav(p);
      await p.locator('#nav-home').click();
      await p.locator('#confirm-rant-leave').click();
      assert.deepEqual(await records(p), []);
    } else {
      assert.equal((await records(p))[0].text, 'Synthetic selected mode writing');
      assert.equal((await records(p))[0].mode, mode);
      assert.equal((await records(p))[0].status, 'suspended');
    }
    assert.equal(await visible(p, '#home-copy'), true);
    assert.equal(await p.locator(`[name="mode"][value="${mode}"]`).isChecked(), true);
    assert.equal(await p.locator('[name="mode"]').count(), 4);
  });
}

test("Brainstorm saves editable questions and answers without a timer", async t => {
  const p = await fresh(t, { [SEEN]: "2" });
  await p.locator('[name="mode"][value="brainstorm"]').check();
  await p.locator('#begin-button').click();
  assert.equal(await p.locator('#page-timer').isVisible(), false);
  await p.getByRole('textbox', { name: 'Question 1' }).fill('What matters first?');
  await p.getByRole('textbox', { name: 'Answer 1' }).fill('A calm first step.');
  await p.getByRole('button', { name: 'Add question' }).click();
  await p.getByRole('textbox', { name: 'Question 2' }).fill('What could I try?');
  await p.getByRole('textbox', { name: 'Answer 2' }).fill('Write it down.');
  await p.waitForTimeout(800);
  await revealNav(p);
  await p.locator('#nav-home').click();
  await p.locator('#landing-notes-button').click();
  await p.locator('.saved-note').filter({ hasText: 'What matters first?' }).click();
  await p.locator('#edit-note-button').click();
  assert.equal(await p.getByRole('textbox', { name: 'Question 1' }).inputValue(), 'What matters first?');
  assert.equal(await p.getByRole('textbox', { name: 'Answer 2' }).inputValue(), 'Write it down.');
});

test('every new-entry route exposes the shared chooser and preserves retained writing', async t => {
  for (const route of ['nav-new', 'menu-new-button', 'paused-new-button', 'new-button']) {
    const p = await fresh(t, { [SEEN]: '2' });
    await p.locator('#session-settings').evaluate(el => el.open = true);
    await p.locator('#custom-minutes').fill('12');
    await p.locator('#grace-value').fill('45');
    await p.locator('#begin-button').click();
    await p.locator('#editor').fill('Synthetic entry preserved for ' + route);
    if (route === 'menu-new-button' || route === 'new-button') {
      await p.locator('#controls-toggle').click();
      if (route === 'new-button') await p.locator('#finish-button').click();
    }
    if (route === 'paused-new-button') await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))).then(async () => {
      await revealNav(p);
      await p.locator('#nav-home').click();
      await p.reload();
      // Continue restores directly; simulate a genuine browser interruption via clock gap.
      await p.clock.install(); await p.reload();
      await p.locator('#continue-note-button').click();
      await p.clock.fastForward(5000);
    });
    if (['nav-new', 'nav-home'].includes(route)) await revealNav(p);
    await p.locator('#' + route).click();
    assert.equal(await visible(p, '#home-copy'), true);
    assert.equal(await p.locator('#custom-minutes').inputValue(), '12');
    assert.equal(await p.locator('#grace-value').inputValue(), '45');
    assert.equal((await records(p)).length, 1);
    assert.equal((await records(p))[0].text, 'Synthetic entry preserved for ' + route);
    await p.locator('[name="mode"][value="words750"]').check();
    await p.locator('#begin-button').click();
    await revealNav(p);
    assert.equal(await p.locator('#nav-mode').innerText(), '750 Words');
    assert.equal(await visible(p, '#page-timer'), false);
  }
});

test('new-entry from Rant confirms disposal; 750 stays untimed with explicit erasing opt-in', async t => {
  const p = await fresh(t, { [SEEN]: '2' });
  await p.clock.install(); await p.reload();
  await p.locator('[name="mode"][value="rant"]').check();
  await p.locator('#begin-button').click();
  await p.locator('#editor').fill('Synthetic disposable entry');
  await revealNav(p);
  await p.locator('#nav-new').click();
  assert.equal(await visible(p, '#rant-leave-dialog'), true);
  await p.locator('#cancel-rant-leave').click();
  assert.equal(await p.locator('#editor').inputValue(), 'Synthetic disposable entry');
  await revealNav(p);
  await p.locator('#nav-new').click();
  await p.locator('#confirm-rant-leave').click();
  assert.deepEqual(await records(p), []);
  await p.locator('[name="mode"][value="words750"]').check();
  assert.equal(await p.locator('#goal-erase').isChecked(), false);
  await p.locator('#begin-button').click();
  await p.locator('#editor').fill('Synthetic untimed last');
  await p.clock.runFor(20000);
  assert.equal(await p.locator('#editor').inputValue(), 'Synthetic untimed last');
  assert.equal((await records(p))[0].deadline, null);
  await p.locator('#controls-toggle').click();
  await p.locator('#session-goal-erase').check();
  await p.locator('#page-wash').selectOption('dusk');
  await p.locator('#controls-toggle').click();
  await revealNav(p);
  await p.locator('#nav-new').click();
  assert.equal(await p.locator('#goal-erase').isChecked(), true);
  await p.locator('#begin-button').click();
  await p.locator('#editor').fill('Synthetic opt in last');
  await p.clock.runFor(16100);
  assert.equal(await p.locator('#editor').inputValue(), 'Synthetic opt in ');
  assert.equal(await visible(p, '#page-timer'), false);
  assert.equal(await p.locator('html').getAttribute('data-page-wash'), 'dusk');
  assert.equal((await records(p)).length, 2);
  assert.ok((await records(p)).some(n => n.snapshots[0]?.text === 'Synthetic opt in last'));
});

test("deleting a saved note confirms its name, cancels safely, removes recovery and survives reload", async t => {
  const note = fixture();
  note.snapshots = [{ at: 2000, text: "Synthetic recovery copy" }];
  const p = await fresh(t, { [SEEN]: "2", [PREFIX + note.id]: JSON.stringify(note) });
  await p.locator("#landing-notes-button").click();
  await p.getByRole("button", { name: /^Delete / }).click();
  assert.equal(await visible(p, "#delete-note-dialog"), true);
  assert.ok((await p.locator("#delete-note-dialog").innerText()).includes(note.text));
  await p.locator("#cancel-delete-note").click();
  assert.equal((await records(p))[0].snapshots[0].text, "Synthetic recovery copy");
  await p.getByRole("button", { name: /^Delete / }).click();
  await p.locator("#confirm-delete-note").click();
  assert.deepEqual(await records(p), []);
  await p.reload();
  assert.equal(await visible(p, "#continue-note-button"), false);
  assert.deepEqual(await records(p), []);
});

test("deletion clears an active draft, queued saves and recovery selection without touching other notes", async t => {
  const other = fixture("words750", true);
  const p = await fresh(t, { [PREFIX + other.id]: JSON.stringify(other) });
  await p.locator("#begin-button").click();
  await p.locator("#editor").fill("Synthetic active draft queued for saving");
  await revealNav(p);
  await p.locator("#nav-notes").click();
  await p.getByRole("button", { name: "Delete Synthetic active draft queued for saving", exact: true }).click();
  assert.equal(await p.evaluate(() => document.activeElement.id), "cancel-delete-note");
  await p.keyboard.press("Shift+Tab");
  assert.equal(await p.evaluate(() => document.activeElement.id), "confirm-delete-note");
  await p.keyboard.press("Tab");
  assert.equal(await p.evaluate(() => document.activeElement.id), "cancel-delete-note");
  await p.locator("#confirm-delete-note").click();
  await p.waitForTimeout(1000);
  assert.equal(await p.locator("#editor").inputValue(), "");
  assert.deepEqual((await records(p)).map(n => n.id), [other.id]);
  await p.reload();
  assert.deepEqual((await records(p)).map(n => n.id), [other.id]);
});

test("failed deletion reports failure, preserves data before commit, and retries cleanup after reload", async t => {
  const note = fixture();
  const p = await fresh(t, { [PREFIX + note.id]: JSON.stringify(note) });
  await p.locator("#landing-notes-button").click();
  await p.locator(".delete-note").click();
  await p.evaluate(() => {
    window.savedSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k,v) { if (k.includes(":deleted:")) throw new DOMException("Synthetic failure", "QuotaExceededError"); return window.savedSet.call(this,k,v); };
  });
  await p.locator("#confirm-delete-note").click();
  assert.ok((await p.locator("#delete-note-error").innerText()).includes("Nothing was removed"));
  assert.deepEqual(await records(p), [note]);
  await p.evaluate(() => {
    Storage.prototype.setItem = window.savedSet;
    window.savedRemove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function(k) { if (k.includes(":session:")) throw new Error("Synthetic cleanup failure"); return window.savedRemove.call(this,k); };
  });
  await p.locator("#confirm-delete-note").click();
  assert.ok((await p.locator("#delete-note-error").innerText()).includes("stored text could not be removed"));
  await p.reload();
  assert.equal(await visible(p, "#continue-note-button"), false);
  await p.locator("#landing-notes-button").click();
  assert.equal(await p.locator(".saved-note").isDisabled(), true);
  await p.getByRole("button", { name: /^Retry deletion of/ }).click();
  await p.locator("#confirm-delete-note").click();
  assert.deepEqual(await records(p), []);
});

test("another tab cannot resurrect deleted active writing through autosave, reload or stale storage", async t => {
  const p = await fresh(t, { [SEEN]: "2" });
  await p.locator("#begin-button").click();
  await p.locator("#editor").fill("Synthetic shared active note");
  await p.waitForTimeout(800);
  const original = (await records(p))[0];
  const other = await p.context().newPage();
  await other.goto(base);
  await other.locator("#landing-notes-button").click();
  await other.locator(".delete-note").click();
  await other.locator("#confirm-delete-note").click();
  await p.waitForFunction(() => document.querySelector("#editor").value === "");
  await p.waitForTimeout(850);
  assert.deepEqual(await records(p), []);
  // A synthetic stale writer racing the barrier still cannot expose the note.
  await other.evaluate(({key, raw}) => localStorage.setItem(key, raw), { key: PREFIX + original.id, raw: JSON.stringify(original) });
  await p.waitForTimeout(250);
  assert.deepEqual(await records(p), []);
  await p.reload(); await other.reload();
  assert.equal(await visible(p, "#continue-note-button"), false);
  assert.equal(await visible(other, "#continue-note-button"), false);
});

test("reduced-motion preview cancels pending disappearance on typing and discards sample on skip", async t => {
  const note = fixture();
  const p = await fresh(t, { [PREFIX + note.id]: JSON.stringify(note), [SEEN]: "1" });
  await p.emulateMedia({ reducedMotion: "reduce" });
  await p.clock.install(); await p.reload();
  await p.locator("#demo-start").click();
  await p.clock.runFor(3100);
  await p.locator("#demo-editor").fill("Synthetic typing interrupts a fading word");
  await p.clock.runFor(1000);
  assert.equal(await p.locator("#demo-editor").inputValue(), "Synthetic typing interrupts a fading word");
  assert.equal(await p.locator("#demo-mirror").innerText(), "");
  await p.locator("#welcome-skip").click();
  await p.clock.runFor(10000);
  assert.equal(await p.locator("#demo-editor").inputValue(), "");
  assert.deepEqual(await records(p), [note]);
});

test("practice text is dark enough to read on its light paper", async t => {
  const p = await fresh(t);
  await p.locator("#demo-start").click();
  const colors = await p.locator("#demo-editor").evaluate(el => ({ ink: getComputedStyle(el).color, paper: getComputedStyle(el.parentElement).backgroundColor }));
  function luminance(color) {
    const rgb = color.match(/[\d.]+/g).slice(0,3).map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  }
  const a = luminance(colors.ink), b = luminance(colors.paper);
  assert.ok((Math.max(a,b) + .05) / (Math.min(a,b) + .05) >= 4.5, JSON.stringify(colors));
});

test("six static washes preserve writing and clocks, stay readable, and restore the saved plain tone", async t => {
  const p = await fresh(t, { [SEEN]: "2" });
  await p.clock.install(); await p.reload();
  await p.locator("#begin-button").click();
  await p.locator("#editor").fill("Synthetic unchanged words across six static washes");
  await p.clock.runFor(800);
  const before = (await records(p))[0];
  await p.locator("#controls-toggle").click();
  await p.locator('[name="paper-tone"][value="sage"]').check();
  const washes = ["linen", "sea-glass", "blue-hour", "apricot-haze", "dusk", "after-hours"];
  const expected = [
    ["#F5F0E7", "#E9E1D5", "#302F2B"], ["#EBF1ED", "#DCE7E3", "#293631"],
    ["#E8EDF3", "#DCE2EC", "#2B3442"], ["#F5ECE5", "#EDDCD3", "#3A302E"],
    ["#EEEAF1", "#E1DCE9", "#342F3D"], ["#1D242C", "#28313B", "#E6E5E1"]
  ];
  const luminance = hex => { const rgb = hex.replace('#','').match(/../g).map(s => parseInt(s,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4); return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722; };
  for (const wash of washes) {
    await p.locator("#page-wash").selectOption(wash);
    assert.equal(await p.locator("html").getAttribute("data-theme"), wash === "after-hours" ? "dark" : "light");
    assert.ok((await p.locator("body").evaluate(el => getComputedStyle(el).backgroundImage)).includes("linear-gradient"));
    assert.equal(await p.locator("#editor").inputValue(), before.text);
    assert.equal((await records(p))[0].deadline, before.deadline);
    assert.equal((await records(p))[0].grace, 15000);
    const styles = await p.locator("#editor").evaluate(el => ({ color: getComputedStyle(el).color, caret: getComputedStyle(el).caretColor, animation: getComputedStyle(document.body).animationName }));
    assert.equal(styles.caret, styles.color);
    assert.equal(styles.animation, "none");
    const palette = await p.locator('html').evaluate(el => ['--wash-start','--wash-end','--wash-ink'].map(k => getComputedStyle(el).getPropertyValue(k).trim().toUpperCase()));
    assert.deepEqual(palette, expected[washes.indexOf(wash)]);
    for (const background of palette.slice(0,2)) {
      const a=luminance(palette[2]), b=luminance(background);
      assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05) > 9.6);
    }
    const control = await p.locator('#page-wash').evaluate(el => ({ color:getComputedStyle(el).color, background:getComputedStyle(el).backgroundColor }));
    assert.equal(control.color, styles.color);
    await p.locator('#page-wash').focus();
    const outline = await p.locator('#page-wash').evaluate(el => getComputedStyle(el).outlineStyle);
    assert.notEqual(outline, 'none');
    await p.locator('#editor').fill(before.text);
    await p.clock.runFor(15100);
    assert.equal(await p.locator('#dissolve-mirror .dissolve-word').count(), 1);
    assert.ok((await p.locator('#dissolve-mirror .dissolve-cover').evaluate(el => getComputedStyle(el).backgroundImage)).includes('linear-gradient'));
    await p.locator('#editor').fill(before.text);
    await p.locator('#controls-toggle').click();
  }
  await p.locator('[name="color-mode"][value="light"]').check();
  assert.equal(await p.locator("html").getAttribute("data-theme"), "dark");
  await p.reload();
  await p.locator("#continue-note-button").click();
  await p.locator("#controls-toggle").click();
  assert.equal(await p.locator("#page-wash").inputValue(), "after-hours");
  await p.locator("#page-wash").selectOption("plain");
  assert.equal(await p.locator("html").getAttribute("data-theme"), "light");
  assert.equal(await p.locator("html").getAttribute("data-paper-tone"), "sage");
  assert.equal(await p.locator("body").evaluate(el => getComputedStyle(el).backgroundImage), "none");
  await p.locator('[name="color-mode"][value="system"]').check();
  await p.emulateMedia({ colorScheme: "dark" });
  await p.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  assert.equal(await p.locator("html").getAttribute("data-theme"), "dark");
  await p.locator("#page-wash").selectOption("linen");
  await p.locator('[name="paper-tone"][value="paper"]').check();
  assert.equal(await p.locator("#page-wash").inputValue(), "plain");
  await p.locator('#finish-button').click();
  await p.locator('#edit-note-button').click();
  await p.locator('#controls-toggle').click();
  await p.locator('#page-wash').selectOption('after-hours');
  await p.locator('#editor').fill('Synthetic untimed edit on After Hours');
  await p.clock.runFor(20000);
  assert.equal(await p.locator('#editor').inputValue(), 'Synthetic untimed edit on After Hours');
  assert.equal((await records(p))[0].editing, true);
  assert.equal((await records(p))[0].deadline, null);
});

test("Matrix is true black, starts green, preserves safe ink choices and restores Plain", async t => {
  const p = await fresh(t, { [SEEN]: "2" });
  await p.clock.install(); await p.reload();
  await p.locator("#begin-button").click();
  await p.locator("#editor").fill("Synthetic Matrix writing remains recoverable.");
  await p.clock.runFor(800);
  const before = (await records(p))[0];
  await p.locator("#controls-toggle").click();
  await p.locator("#page-wash").selectOption("matrix");
  assert.equal(await p.locator("html").getAttribute("data-page-wash"), "matrix");
  assert.equal(await p.locator("html").getAttribute("data-writing-ink"), "green");
  const matrix = await p.locator("#editor").evaluate(el => ({
    color: getComputedStyle(el).color,
    caret: getComputedStyle(el).caretColor,
    background: getComputedStyle(document.body).backgroundColor,
    image: getComputedStyle(document.body).backgroundImage,
    animation: getComputedStyle(document.body).animationName,
  }));
  assert.equal(matrix.background, "rgb(0, 0, 0)");
  assert.equal(matrix.image, "none");
  assert.equal(matrix.animation, "none");
  assert.equal(matrix.color, matrix.caret);
  assert.equal(await p.locator("#editor").inputValue(), before.text);
  assert.equal((await records(p))[0].deadline, before.deadline);
  for (const ink of ["green", "amber", "default"]) {
    await p.locator(`[name="writing-ink"][value="${ink}"]`).check();
    assert.equal(await p.locator("html").getAttribute("data-writing-ink"), ink === "default" ? "green" : ink);
  }
  await p.locator('[name="writing-ink"][value="amber"]').check();
  await p.screenshot({ path: evidence + "matrix-amber.png" });
  await p.reload();
  assert.equal(await p.locator("html").getAttribute("data-page-wash"), "matrix");
  await p.locator("#continue-note-button").click();
  await p.locator("#controls-toggle").click();
  assert.equal(await p.locator('[name="writing-ink"][value="amber"]').isChecked(), true);
  await p.locator("#page-wash").selectOption("plain");
  assert.equal(await p.locator("html").getAttribute("data-page-wash"), "plain");
  assert.equal(await p.locator("body").evaluate(el => getComputedStyle(el).backgroundImage), "none");
  assert.equal(await p.locator("#editor").inputValue(), before.text);
});

test("Matrix session options remain legible and every allowed ink stays high contrast", async t => {
  const p = await fresh(t, { [SEEN]: "2" });
  await p.locator("#begin-button").click();
  await p.locator("#controls-toggle").click();
  const contrast = (foreground, background) => {
    const luminance = color => {
      const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
        value /= 255;
        return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
      });
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    const a = luminance(foreground), b = luminance(background);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  };
  for (const wash of ["plain", "linen", "sea-glass", "blue-hour", "apricot-haze", "dusk", "after-hours", "matrix"]) {
    await p.locator("#page-wash").selectOption(wash);
    for (const ink of ["default", "green", "amber"]) {
      await p.locator(`[name="writing-ink"][value="${ink}"]`).check();
      const editor = await p.locator("#editor").evaluate(el => ({
        foreground: getComputedStyle(el).color,
        background: getComputedStyle(document.documentElement).backgroundColor,
      }));
      assert.ok(contrast(editor.foreground, editor.background) >= 4.5, `${wash}/${ink}: ${JSON.stringify(editor)}`);
    }
  }
  await p.locator("#page-wash").selectOption("matrix");
  await p.locator('[name="writing-ink"][value="green"]').check();
  const controls = await p.locator("#writing-controls").evaluate(el => {
    const css = getComputedStyle(el);
    const chosen = el.querySelector('[name="writing-ink"][value="green"] + span');
    const select = el.querySelector("#page-wash");
    const focusProbe = document.createElement("span");
    focusProbe.style.color = "var(--sage)";
    el.append(focusProbe);
    const focus = getComputedStyle(focusProbe).color;
    focusProbe.remove();
    return {
      canvas: getComputedStyle(document.body).backgroundColor,
      panel: css.backgroundColor,
      panelAnimation: css.animationName,
      panelText: css.color,
      border: css.borderTopColor,
      selectedText: getComputedStyle(chosen).color,
      selectedBackground: getComputedStyle(chosen).backgroundColor,
      selectText: getComputedStyle(select).color,
      selectBackground: getComputedStyle(select).backgroundColor,
      focus,
    };
  });
  assert.ok(contrast(controls.panel, controls.canvas) >= 1.4, JSON.stringify(controls));
  assert.equal(controls.panelAnimation, "none", JSON.stringify(controls));
  assert.ok(contrast(controls.panelText, controls.panel) >= 4.5, JSON.stringify(controls));
  assert.ok(contrast(controls.border, controls.panel) >= 3, JSON.stringify(controls));
  assert.ok(contrast(controls.selectedText, controls.selectedBackground) >= 4.5, JSON.stringify(controls));
  assert.ok(contrast(controls.selectText, controls.selectBackground) >= 4.5, JSON.stringify(controls));
  assert.ok(contrast(controls.focus, controls.panel) >= 3, JSON.stringify(controls));
});

test("onboarding teaches disappearing words with an isolated accelerated sample", async t => {
  const p = await fresh(t);
  await p.clock.install(); await p.reload();
  await p.locator("#demo-start").click();
  const sample = await p.locator("#demo-editor").inputValue();
  await p.clock.runFor(2900);
  assert.equal(await p.locator("#demo-editor").inputValue(), sample);
  await p.clock.runFor(900);
  assert.notEqual(await p.locator("#demo-editor").inputValue(), sample);
  await p.locator("#demo-editor").fill("Practice words stay while typing");
  await p.clock.runFor(2900);
  assert.equal(await p.locator("#demo-editor").inputValue(), "Practice words stay while typing");
  assert.deepEqual(await records(p), []);
  assert.equal(await p.locator("#grace-value").inputValue(), "15");
  await p.locator("#welcome-next").click();
  await p.clock.runFor(10000);
  const explanation = await p.locator("#welcome-retention").innerText();
  for (const text of ["Session duration is separate", "15 seconds", "No recovery", "750 Words", "no timer", "not a backup", "not encrypted"]) assert.ok(explanation.includes(text));
  assert.equal(await p.locator("#demo-editor").inputValue(), "");
  await p.locator("#welcome-start").click();
  assert.equal(await visible(p, "#home-copy"), true);
  assert.deepEqual(await records(p), []);
  await p.locator("#begin-button").click();
  assert.equal(await p.locator("#editor").inputValue(), "");
  await p.clock.runFor(1000);
  assert.equal((await records(p))[0].grace, 15000);
});

test("welcome is scenic, skippable, remembered, replayable and leads through the chooser", async t => {
  const p = await fresh(t);
  assert.equal(await visible(p, "#welcome"), true);
  assert.equal(await visible(p, "#home-copy"), false);
  const copy = await p.locator("#welcome").innerText();
  for (const text of ["Keep writing", "disappearing", "3-second", "15-second", "never saved"]) assert.ok(copy.includes(text));
  assert.equal(await p.locator(".landscape img").evaluate(el => el.complete && el.naturalWidth > 0), true);
  await p.waitForTimeout(550);
  await p.screenshot({ path: evidence + "welcome-wide.png", fullPage: true });
  await p.locator("#welcome-skip").click();
  assert.equal(await visible(p, "#home-copy"), true);
  assert.equal(await p.evaluate(key => localStorage.getItem(key), SEEN), "2");
  await p.reload();
  assert.equal(await visible(p, "#welcome"), false);
  await p.locator("#about-button").click();
  await p.locator("#replay-welcome").click();
  assert.equal(await visible(p, "#welcome"), true);
  await p.locator("#welcome-next").click();
  await p.locator("#welcome-start").click();
  assert.equal(await visible(p, "#home-copy"), true);
  assert.deepEqual(await records(p), []);
  await p.locator("#begin-button").click();
  assert.equal(await p.locator("#editor").inputValue(), "");
  assert.equal(await p.locator("#editor").evaluate(el => el === document.activeElement && !el.readOnly && !el.spellcheck), true);
  await p.waitForTimeout(100);
  assert.equal((await records(p))[0].grace, 15000);
  assert.equal((await records(p))[0].status, "ready");
  assert.equal(await p.locator("#page-timer").innerText(), "10:00 left");
  await p.screenshot({ path: evidence + "blank-editor.png" });
});

test("keyboard start dismisses welcome permanently and hidden setup never takes focus", async t => {
  const p = await fresh(t);
  await p.locator("#welcome-title").focus();
  await p.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  assert.equal(await p.evaluate(() => document.activeElement.id), "demo-start");
  await p.keyboard.press("Enter");
  assert.equal(await p.evaluate(() => document.activeElement.id), "demo-editor");
  await p.locator("#welcome-next").focus();
  await p.keyboard.press("Enter");
  await p.locator("#welcome-start").focus();
  await p.keyboard.press("Enter");
  assert.equal(await visible(p, "#home-copy"), true);
  await p.keyboard.press("Control+Enter");
  assert.equal(await p.locator("#editor").evaluate(el => el === document.activeElement), true);
  await revealNav(p);
  await p.locator("#nav-home").click();
  assert.equal(await visible(p, "#welcome"), false);
  await p.reload();
  assert.equal(await visible(p, "#welcome"), false);
  const shortcut = await fresh(t);
  await shortcut.keyboard.press("Control+Enter");
  assert.equal(await visible(shortcut, "#home-copy"), true);
  assert.deepEqual(await records(shortcut), []);
  await shortcut.keyboard.press("Control+Enter");
  assert.equal(await visible(shortcut, "#editor"), true);
  await revealNav(shortcut);
  await shortcut.locator("#nav-home").click();
  assert.equal(await visible(shortcut, "#welcome"), false);
});

test("upgrade shows new onboarding once without changing existing or unreadable notes", async t => {
  for (const raw of [JSON.stringify(fixture()), "unreadable synthetic fixture"]) {
    const key = PREFIX + "upgrade";
    const p = await fresh(t, { [key]: raw, [SEEN]: "1" });
    assert.equal(await visible(p, "#welcome"), true);
    await p.locator("#welcome-skip").click();
    await p.reload();
    assert.equal(await visible(p, "#welcome"), false);
    assert.equal(await p.evaluate(key => localStorage.getItem(key), key), raw);
    assert.equal(await visible(p, "#begin-button"), true);
  }
});

test("spelling opt-in survives reload, does not replace textarea or change clocks, and respects IME", async t => {
  const p = await fresh(t, { [SEEN]: "2" });
  await p.locator("#begin-button").click();
  await p.locator("#editor").fill("Synthetic spelling check");
  await p.waitForTimeout(750);
  const before = (await records(p))[0];
  await p.evaluate(() => window.originalEditor = document.querySelector("#editor"));
  await p.locator("#controls-toggle").click();
  await p.locator("#check-spelling").check();
  assert.equal(await p.locator("#editor").evaluate(el => el.spellcheck && el === window.originalEditor), true);
  assert.equal((await records(p))[0].deadline, before.deadline);
  await p.locator("#editor").dispatchEvent("compositionstart");
  await p.locator("#editor").evaluate(el => { el.value = "Synthetic 日本語"; el.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true })); });
  await p.locator("#editor").dispatchEvent("compositionend");
  assert.equal(await p.locator("#editor").inputValue(), "Synthetic 日本語");
  await p.locator("#controls-toggle").click();
  await p.locator("#check-spelling").scrollIntoViewIfNeeded();
  await p.screenshot({ path: evidence + "spelling-option.png" });
  await p.reload();
  assert.equal(await p.locator("#editor").evaluate(el => el.spellcheck), true);
  assert.equal(await p.evaluate(key => JSON.parse(localStorage[key]).spellcheck, APPEARANCE), true);
  await p.locator("#continue-note-button").click();
  await p.locator("#controls-toggle").click();
  await p.locator("#check-spelling").uncheck();
  await p.reload();
  assert.equal(await p.locator("#editor").evaluate(el => el.spellcheck), false);
});

test("Notes stays read-first; Continue preserves remaining time; Edit is visibly untimed", async t => {
  const note = fixture();
  const p = await fresh(t, { [PREFIX + note.id]: JSON.stringify(note) });
  await p.locator("#landing-notes-button").click();
  assert.ok((await p.locator(".saved-note").innerText()).includes("Unfinished · 7:00 left"));
  await p.locator(".saved-note").click();
  assert.equal(await p.locator("#editor").evaluate(el => el.readOnly), true);
  assert.equal(await visible(p, "#page-timer"), false);
  assert.equal((await records(p))[0].remaining, 420000);
  await p.waitForTimeout(650);
  await p.screenshot({ path: evidence + "read-first-continue.png", fullPage: true });
  await p.locator("#continue-saved-note").click();
  assert.equal(await visible(p, "#page-timer"), true);
  assert.equal(await visible(p, "#editing-status"), false);
  assert.equal(await p.locator("#page-timer").innerText(), "7:00 left");
  await p.waitForTimeout(1100);
  await revealNav(p);
  await p.locator("#nav-notes").click();
  const saved = (await records(p))[0];
  assert.ok(saved.remaining < 420000 && saved.remaining > 417000);
  await p.locator(".saved-note").click();
  await p.locator("#edit-note-button").click();
  assert.equal(await p.locator("#editing-status").innerText(), "Editing · No timer");
  assert.equal(await visible(p, "#editing-status"), true);
  assert.equal(await visible(p, "#page-timer"), false);
  assert.equal(await visible(p, "#session-clock"), false);
  await p.locator("#editor").fill("Synthetic edited note");
  await p.waitForTimeout(750);
  const edited = (await records(p))[0];
  assert.equal(edited.deadline, null);
  assert.equal(edited.editing, true);
  assert.equal(edited.grace, 45000);
  await p.screenshot({ path: evidence + "editing-wide.png" });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.screenshot({ path: evidence + "editing-narrow.png" });
  assert.equal(await visible(p, "#editing-status"), true);
  await p.reload();
  await p.locator("#continue-note-button").click();
  assert.equal(await visible(p, "#editing-status"), true);
  assert.equal(await visible(p, "#page-timer"), false);
});

test("completed notes have no Continue; 750 Words continues without a timer", async t => {
  for (const completed of [false, true]) {
    const note = fixture("words750", completed);
    const p = await fresh(t, { [PREFIX + note.id]: JSON.stringify(note) });
    await p.locator("#landing-notes-button").click();
    await p.locator(".saved-note").click();
    assert.equal(await visible(p, "#continue-saved-note"), !completed);
    await p.locator(completed ? "#edit-note-button" : "#continue-saved-note").click();
    assert.equal(await visible(p, "#page-timer"), false);
    assert.equal(await visible(p, "#session-clock"), false);
    if (!completed) {
      await p.locator("#controls-toggle").click();
      await p.locator("#session-goal-erase").check();
      assert.equal(await visible(p, "#page-timer"), false);
      assert.equal((await records(p))[0].eraseOnPause, true);
    }
  }
});

test("Journal still erases after the default pause, with recovery; editing stays intact", async t => {
  const p = await fresh(t, { [SEEN]: "2" });
  await p.clock.install();
  // Install before the app registers its interval; existing real timers are not virtual.
  await p.reload();
  await p.waitForFunction(() => document.querySelector("#begin-button").textContent.includes("Begin writing"));
  await p.locator("#begin-button").click();
  await p.locator("#editor").fill("Synthetic first last");
  await p.clock.runFor(14900);
  assert.equal(await p.locator("#editor").inputValue(), "Synthetic first last");
  await p.clock.runFor(1200);
  assert.equal(await p.locator("#editor").inputValue(), "Synthetic first ");
  assert.equal((await records(p))[0].snapshots[0].text, "Synthetic first last");
  await p.locator("#controls-toggle").click();
  assert.equal(await p.locator("#editor").inputValue(), "Synthetic first ");
  await p.locator("#finish-button").click();
  assert.equal(await p.locator("#editor").inputValue(), "Synthetic first ");
  await p.locator("#edit-note-button").click();
  const editingRecord = (await records(p))[0];
  assert.equal(editingRecord.editing, true);
  assert.equal(editingRecord.deadline, null);
  assert.equal(editingRecord.pending, null);
  assert.equal(await p.locator("#editor").inputValue(), "Synthetic first ");
  await p.clock.runFor(60000);
  assert.equal(await p.locator("#editor").inputValue(), "Synthetic first ");
  const afterGap = (await records(p))[0];
  assert.equal(afterGap.editing, true);
  assert.equal(afterGap.deadline, null);
  assert.equal(afterGap.pending, null);
  assert.equal(afterGap.snapshots.length, 1);
  assert.equal(await visible(p, "#editing-status"), true);
});

test("Rant Let go still animates and leaves neither saved writing nor recovery", async t => {
  const p = await fresh(t, { [SEEN]: "2" });
  await p.locator('[name="mode"][value="rant"]').check();
  await p.locator("#begin-button").click();
  await p.locator("#editor").fill("Synthetic disposable words");
  await p.locator("#let-go-button").click();
  assert.equal(await p.locator(".released-words").count(), 1);
  await p.waitForTimeout(1150);
  assert.equal(await p.locator(".released-words").count(), 0);
  assert.equal(await p.locator("#editor").inputValue(), "");
  assert.deepEqual(await records(p), []);
  assert.equal(await visible(p, "#continue-saved-note"), false);
});

test("welcome and primary action remain reachable at narrow and intermediate widths", async t => {
  for (const [name, viewport] of [["narrow", { width: 390, height: 844 }], ["medium", { width: 900, height: 640 }]]) {
    const p = await fresh(t, {}, viewport);
    await p.waitForTimeout(550);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await p.screenshot({ path: evidence + `welcome-${name}.png`, fullPage: true });
    await p.locator("#welcome-next").click();
    await p.locator("#welcome-start").click();
  assert.equal(await visible(p, "#home-copy"), true);
  assert.deepEqual(await records(p), []);
  await p.locator("#begin-button").click();
    assert.equal(await p.locator("#editor").evaluate(el => el === document.activeElement), true);
  }
});

test("writing nav is hidden during focus-view and revealed by keyboard focus", async t => {
  const p = await fresh(t, { [SEEN]: "2" });
  await p.locator("#begin-button").click();
  // Immediately after begin: focus-view is active, nav must be hidden.
  await p.locator("body.focus-view").waitFor();
  assert.equal(await p.locator("#page-navigation").isHidden(), true, "nav visible during writing");
  // Top-edge pointer reveals the nav.
  await revealNav(p);
  // Wait for the CSS transition to complete (up to 500ms).
  await p.locator("#page-navigation").waitFor({ state: "visible" });
  assert.equal(await p.locator("#page-navigation").isVisible(), true, "nav not revealed by top-edge pointer");
  // Blur removes focus-within; nav hides again (visibility transition, give it 300ms).
  // Move pointer away from top edge; nav hides after 800ms timer.
  await p.mouse.move(400, 400);
  await p.locator("#page-navigation").waitFor({ state: "hidden" });
  assert.equal(await p.locator("#page-navigation").isHidden(), true, "nav still visible after pointer leaves");
  // Keyboard accessible when revealed: reveal via pointer then Tab to nav-home.
  await revealNav(p);
  await p.locator("#page-navigation").waitFor({ state: "visible" });
  await p.locator("#nav-home").focus();
  assert.equal(await p.evaluate(() => document.activeElement.id), "nav-home");
  // Nav returns to writing: nav-home click brings us home (no focus trap).
  await revealNav(p);
  await p.locator("#page-navigation").waitFor({ state: "visible" });
  await p.locator("#nav-home").click();
  assert.equal(await visible(p, "#home-copy"), true);
});

test("writing nav is hidden for all writing modes immediately after begin", async t => {
  for (const mode of ["journal", "rant", "words750", "brainstorm"]) {
    const p = await fresh(t, { [SEEN]: "2" });
    await p.locator(`[name="mode"][value="${mode}"]`).check();
    await p.locator("#begin-button").click();
    await p.locator("body.focus-view").waitFor();
    assert.equal(await p.locator("#page-navigation").isHidden(), true, `nav visible in ${mode} focus-view`);
    if (mode === "rant") {
      // Nav is revealed by top-edge pointer; verify it is accessible without a focus trap.
      await revealNav(p);
      await p.locator("#page-navigation").waitFor({ state: "visible" });
      assert.equal(await p.locator("#page-navigation").isVisible(), true, "rant nav not revealed");
      await p.locator("#nav-home").focus();
      assert.equal(await p.evaluate(() => document.activeElement.id), "nav-home");
    }
  }
});

// Regression: focus-writing status and timer must not overlap nav-mode when nav is revealed.
// Tests Journal (timed) and words750 (untimed/editing-status) to cover both status elements.
test("focus-mode status and timer do not overlap nav-mode when nav is revealed", async t => {
  async function assertNoOverlap(p, statusId, label) {
    await revealNav(p);
    await p.locator("#page-navigation").waitFor({ state: "visible" });
    const navModeBox = await p.locator("#nav-mode").boundingBox();
    const statusBox  = await p.locator(`#${statusId}`).boundingBox();
    assert.ok(navModeBox, `#nav-mode has no bounding box (${label})`);
    assert.ok(statusBox,  `#${statusId} has no bounding box (${label})`);
    // Boxes overlap when their x-ranges AND y-ranges both intersect.
    const xOverlap =
      statusBox.x < navModeBox.x + navModeBox.width &&
      statusBox.x + statusBox.width > navModeBox.x;
    const yOverlap =
      statusBox.y < navModeBox.y + navModeBox.height &&
      statusBox.y + statusBox.height > navModeBox.y;
    assert.ok(
      !(xOverlap && yOverlap),
      `${label}: #${statusId} overlaps #nav-mode — ` +
      `timer${JSON.stringify(statusBox)} nav-mode${JSON.stringify(navModeBox)}`
    );
    await p.screenshot({ path: evidence + `focus-status-no-overlap-${label}.png` });
  }

  // Journal (timed) — page-timer should be separated from nav-mode.
  const journal = await fresh(t, { [SEEN]: "2" });
  await journal.locator("#begin-button").click();
  await journal.locator("body.focus-view").waitFor();
  await assertNoOverlap(journal, "page-timer", "journal");

  // words750 editing mode — editing-status should be separated from nav-mode.
  const note = fixture("words750", true);
  const editing = await fresh(t, { [PREFIX + note.id]: JSON.stringify(note) });
  await editing.locator("#landing-notes-button").click();
  await editing.locator(".saved-note").click();
  await editing.locator("#edit-note-button").click();
  await editing.locator("body.focus-view").waitFor();
  await assertNoOverlap(editing, "editing-status", "words750-editing");
});
