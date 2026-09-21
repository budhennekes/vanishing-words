import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { _electron: electron } = require("playwright");
const executablePath = process.env.RTW_QA_EXECUTABLE;
const evidenceRoot = process.env.RTW_QA_EVIDENCE;
if (!executablePath || !evidenceRoot)
  throw new Error("Set RTW_QA_EXECUTABLE and RTW_QA_EVIDENCE.");
fs.mkdirSync(evidenceRoot, { recursive: true });
const prefix = "vanishing-words:v2:session:";
const results = [];

async function openMode(mode) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `let-it-out-${mode}-`));
  const app = await electron.launch({
    executablePath,
    env: { HOME: os.homedir(), PATH: "/usr/bin:/bin:/usr/sbin:/sbin", RTW_QA_PROFILE: profile },
  });
  assert.equal(await app.evaluate(({ app }) => app.getPath("userData")), profile);
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.locator("#welcome-skip").click();
  await page.locator(`[name="mode"][value="${mode}"]`).check();
  await page.locator("#begin-button").click();
  await page.locator("body.session-view").waitFor();
  assert.equal(await page.locator("#page-navigation").isHidden(), true);
  return { app, page, profile, errors };
}

try {
  {
    const { app, page, errors } = await openMode("journal");
    await page.locator("#editor").fill("Synthetic Journal text that stays local.");
    await page.locator("#controls-toggle").click();
    assert.equal(await page.locator("#fullscreen-button").isVisible(), true);
    await page.locator("#fullscreen-button").click();
    // Use sleep+evaluate rather than waitForFunction: CDP polling can interfere
    // with the macOS fullscreen state machine in Electron.
    await page.waitForTimeout(2000);
    const enteredFS = await page.evaluate(() => Boolean(document.fullscreenElement || document.webkitFullscreenElement));
    assert.equal(enteredFS, true, "Page must have entered fullscreen");
    await page.screenshot({ path: path.join(evidenceRoot, "journal-fullscreen.png") });
    // --- Regression: Escape must exit page fullscreen ---
    await page.keyboard.press("Escape");
    // Give macOS and Electron time to process the fullscreen exit.
    await page.waitForTimeout(2000);
    const exitedFS = await page.evaluate(() => !document.fullscreenElement && !document.webkitFullscreenElement);
    assert.equal(exitedFS, true, "Escape must exit page fullscreen (not merely close controls)");
    // Writing controls panel must remain closed (Escape served as fullscreen-exit only)
    const controlsHidden = await page.locator("#writing-controls").isHidden();
    assert.equal(controlsHidden, true, "Writing controls must stay closed after fullscreen exit via Escape");
    await page.screenshot({ path: path.join(evidenceRoot, "journal-fullscreen-exited.png") });
    assert.deepEqual(errors, []);
    results.push("journal-fullscreen-escape-exit");
    await app.close();
  }
  {
    const { app, page, errors } = await openMode("rant");
    await page.locator("#editor").fill("Synthetic disposable release.");
    await page.locator("#let-go-button").click();
    await page.locator("body.completed").waitFor();
    const records = await page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)), prefix);
    assert.deepEqual(records, []);
    await page.screenshot({ path: path.join(evidenceRoot, "let-it-go-completion.png") });
    assert.deepEqual(errors, []);
    results.push("let-it-go-disposal");
    await app.close();
  }
  {
    const { app, page, errors } = await openMode("words750");
    await page.locator("#editor").fill("Synthetic 750 Words retained fixture.");
    assert.equal(await page.locator("#session-clock").isHidden(), true);
    await page.locator("#controls-toggle").click();
    await page.locator("#finish-button").click();
    await page.locator("body.completed").waitFor();
    await page.screenshot({ path: path.join(evidenceRoot, "750-completion.png") });
    assert.deepEqual(errors, []);
    results.push("750-untimed-completion");
    await app.close();
  }
  {
    const { app, page, errors } = await openMode("brainstorm");
    await page.locator(".brainstorm-question").first().fill("What should the next step be?");
    await page.locator(".brainstorm-answer").first().fill("Keep the answer local and editable.");
    assert.equal(await page.locator("#session-clock").isHidden(), true);
    await page.screenshot({ path: path.join(evidenceRoot, "brainstorm-writing.png") });
    assert.deepEqual(errors, []);
    results.push("brainstorm-untimed");
    await app.close();
  }
  console.log(JSON.stringify({ passed: true, executablePath, results, evidenceRoot }, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
