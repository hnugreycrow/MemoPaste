/* eslint-disable @typescript-eslint/no-require-imports -- Electron sandbox preload and test runner use CommonJS. */
// Run after `npx vite build`: electron tests/ui-smoke.cjs
const { app, BrowserWindow } = require("electron");
const { mkdtempSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const output = mkdtempSync(path.join(os.tmpdir(), "memopaste-ui-"));
app.setPath("userData", path.join(output, "profile"));
app.disableHardwareAcceleration();
app.on("window-all-closed", () => {});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
app
  .whenReady()
  .then(async () => {
    const errors = [];
    for (const theme of ["light", "dark"]) {
      const win = new BrowserWindow({
        width: 1000,
        height: 700,
        show: false,
        frame: false,
        webPreferences: {
          backgroundThrottling: false,
          offscreen: true,
          preload: path.join(__dirname, "fixtures/ui-preload.cjs"),
          additionalArguments: [`--test-theme=${theme}`],
        },
      });
      win.webContents.on("console-message", (_event, level, message) => {
        if (level >= 3) errors.push(message);
      });
      const run = (code) => win.webContents.executeJavaScript(code);
      await win.loadFile(path.join(__dirname, "../dist/index.html"));
      for (let i = 0; i < 50 && !(await run('!!document.querySelector(".content-item")')); i++)
        await sleep(100);
      assert.equal(
        await run("document.documentElement.classList.contains(" + JSON.stringify(theme) + ")"),
        true,
      );
      for (const [width, height, zoom] of [
        [800, 600, 1],
        [1000, 700, 1],
        [1500, 1050, 1.5],
        [1920, 1080, 1],
      ]) {
        win.setSize(width, height);
        win.webContents.setZoomFactor(zoom);
        await sleep(150);
        const layout = await run(`(() => {
        const button = document.querySelector('.action-copy').getBoundingClientRect();
        const list = document.querySelector('.content-container').getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth > innerWidth, buttonFits: button.right <= innerWidth && button.bottom <= innerHeight, listWidth: list.width };
      })()`);
        assert.equal(layout.overflow, false);
        assert.equal(layout.buttonFits, true);
        assert.ok(layout.listWidth >= 320);
        writeFileSync(
          path.join(output, `${theme}-${width}-${zoom}.png`),
          (await win.webContents.capturePage()).toPNG(),
        );
      }
      win.setSize(1000, 700);
      win.webContents.setZoomFactor(1);
      await run(
        `document.querySelector('.column-resizer').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
      );
      await sleep(100);
      assert.ok(
        await run(
          `(() => { const width = document.querySelector('.content-container').getBoundingClientRect().width; return width >= 340 && width <= 420; })()`,
        ),
      );
      await run(`document.querySelector('.nav-item').focus()`);
      assert.equal(
        await run(`getComputedStyle(document.querySelector('.nav-item')).outlineStyle`),
        "none",
      );
      await run(
        `(() => { const el = document.querySelector('.search-input input'); el.focus(); el.value = 'Needle'; el.dispatchEvent(new Event('input', { bubbles: true })); })()`,
      );
      await sleep(600);
      assert.equal(
        await run(`document.querySelector('.list-count').textContent.trim()`),
        "找到 2 条",
      );
      assert.ok(await run(`document.querySelector('.detail-reading').scrollTop > 0`));
      assert.equal(await run(`!!document.querySelector('.keyboard-hint')`), false);
      assert.equal(
        await run(`document.querySelector('.detail-reading mark').textContent`),
        "Needle",
      );
      assert.equal(await run(`document.querySelector('.detail-reading script')`), null);
      assert.ok(
        await run(
          `(() => { const mark = document.querySelector('.item-title mark').getBoundingClientRect(); const title = document.querySelector('.item-title').getBoundingClientRect(); return mark.bottom <= title.bottom + 1; })()`,
        ),
      );
      await run(`document.querySelectorAll('.clipboard-item-select')[1].click()`);
      await sleep(200);
      assert.equal(
        await run(`document.querySelector('.detail-reading mark').textContent`),
        "Needle",
      );
      assert.ok(await run(`document.querySelector('.detail-reading').scrollTop > 0`));
      await run(`document.querySelector('.action-copy').click()`);
      await sleep(50);
      assert.ok((await run(`window.__test.snapshot().written`)).length > 3000);
      writeFileSync(
        path.join(output, `${theme}-search.png`),
        (await win.webContents.capturePage()).toPNG(),
      );
      await run(`location.hash = '#/settings'`);
      await sleep(300);
      const otherTheme = theme === "light" ? 1 : 0;
      await run(
        `window.__test.failSave(true); document.querySelectorAll('.theme-option')[${otherTheme}].click()`,
      );
      await sleep(100);
      assert.equal(await run(`window.__test.snapshot().broadcastCount`), 0);
      assert.equal(await run(`window.__test.snapshot().config.theme`), theme);
      await run(`window.__test.failSave(true); document.querySelectorAll('.segment')[2].click()`);
      await sleep(100);
      assert.equal(
        await run(`document.querySelector('.segment.active').textContent.trim()`),
        "1 天",
      );
      await run(
        `window.__test.failSave(false, true); document.querySelectorAll('.segment')[2].click()`,
      );
      await sleep(100);
      assert.equal(
        await run(`document.querySelector('.segment.active').textContent.trim()`),
        "1 天",
      );
      await run(`window.__test.failSave(false); document.querySelectorAll('.segment')[2].click()`);
      await sleep(100);
      assert.equal(await run(`window.__test.snapshot().config.dataRetentionDays`), 3);
      await run(`document.querySelectorAll('.theme-option')[${otherTheme}].click()`);
      await sleep(100);
      assert.equal(await run(`window.__test.snapshot().broadcastCount`), 1);
      assert.equal(
        await run(`window.__test.snapshot().config.theme`),
        theme === "light" ? "dark" : "light",
      );
      await run(`document.querySelectorAll('.theme-option')[${1 - otherTheme}].click()`);
      await sleep(150);
      writeFileSync(
        path.join(output, `${theme}-settings.png`),
        (await win.webContents.capturePage()).toPNG(),
      );
      win.destroy();
    }
    const panel = new BrowserWindow({
      width: 350,
      height: 480,
      show: false,
      frame: false,
      webPreferences: {
        backgroundThrottling: false,
        offscreen: true,
        preload: path.join(__dirname, "fixtures/ui-preload.cjs"),
      },
    });
    await panel.loadFile(path.join(__dirname, "../dist/index.html"), { hash: "/panel" });
    await sleep(500);
    const panelRun = (code) => panel.webContents.executeJavaScript(code);
    assert.ok(await panelRun(`document.documentElement.classList.contains('is-panel')`));
    await panelRun(
      `window.__test.pasteStatus('copied'); document.querySelector('.clip-card').click()`,
    );
    await sleep(100);
    assert.equal(
      await panelRun(`document.querySelector('.panel-notice').textContent`),
      "已复制，请按 Ctrl + V 粘贴",
    );
    writeFileSync(
      path.join(output, "panel-copied.png"),
      (await panel.webContents.capturePage()).toPNG(),
    );
    await panelRun(
      `window.__test.pasteStatus('failed'); document.querySelector('.clip-card').click()`,
    );
    await sleep(100);
    assert.ok(
      (await panelRun(`document.querySelector('.panel-notice').textContent`)).includes("复制失败"),
    );
    panel.destroy();
    assert.deepEqual(errors, []);
    writeFileSync(path.join(output, "result.json"), JSON.stringify({ ok: true, output }));
    console.log(`UI smoke checks passed. Screenshots: ${output}`);
    app.quit();
  })
  .catch((error) => {
    writeFileSync(
      path.join(output, "result.json"),
      JSON.stringify({ ok: false, error: error.stack }),
    );
    console.error(error);
    app.exit(1);
  });
