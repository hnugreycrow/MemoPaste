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
        width: 424,
        height: 564,
        show: false,
        frame: false,
        transparent: true,
        backgroundColor: "#00000000",
        hasShadow: false,
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
      for (let i = 0; i < 50 && !(await run('!!document.querySelector(".clip-card")')); i++) {
        await sleep(100);
      }

      // 1. 主题与无横向溢出校验
      assert.equal(
        await run(`document.documentElement.classList.contains(${JSON.stringify(theme)})`),
        true,
      );
      const layout = await run(`(() => ({
        overflowX: document.documentElement.scrollWidth > innerWidth,
        cardCount: document.querySelectorAll('.clip-card').length,
        firstAlias: document.querySelector('.card-alias')?.textContent?.trim() || '',
        slot1: document.querySelector('.slot-num')?.textContent?.trim() || '',
      }))()`);
      assert.equal(layout.overflowX, false);
      assert.equal(layout.cardCount, 3);
      assert.equal(layout.firstAlias, "公司发票抬头");
      assert.equal(layout.slot1, "1");
      writeFileSync(
        path.join(output, `${theme}-panel.png`),
        (await win.webContents.capturePage()).toPNG(),
      );

      // 2. 实时搜索内容与安全高亮（无 script 注入）
      await run(`(() => {
        const el = document.querySelector('.search-input');
        el.value = 'Needle';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await sleep(300);
      assert.equal(await run(`document.querySelectorAll('.clip-card').length`), 2);
      assert.equal(await run(`document.querySelector('.card-text mark')?.textContent`), "Needle");
      assert.equal(await run(`document.querySelector('.panel-list script')`), null);
      writeFileSync(
        path.join(output, `${theme}-search.png`),
        (await win.webContents.capturePage()).toPNG(),
      );

      // 3. 搜索备注名命中
      await run(`(() => {
        const el = document.querySelector('.search-input');
        el.value = '发票';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await sleep(300);
      assert.equal(await run(`document.querySelectorAll('.clip-card').length`), 1);
      assert.equal(await run(`document.querySelector('.card-alias mark')?.textContent`), "发票");

      // 清空搜索
      await run(`document.querySelector('.search-clear').click()`);
      await sleep(250);
      assert.equal(await run(`document.querySelectorAll('.clip-card').length`), 3);

      // 4. 预览全文 + 仅复制（验证写入完整长文本）
      await run(`document.querySelector('.action-icon[aria-label="预览全文"]').click()`);
      await sleep(200);
      assert.ok(await run(`!!document.querySelector('.preview-view')`));
      await run(`document.querySelector('.preview-footer .btn.secondary').click()`);
      await sleep(100);
      assert.ok((await run(`window.__test.snapshot().written`)).length > 2000);
      writeFileSync(
        path.join(output, `${theme}-preview.png`),
        (await win.webContents.capturePage()).toPNG(),
      );
      await run(`document.querySelector('.preview-view .back-btn').click()`);
      await sleep(150);

      // 5. 暂停监听按钮 + 提示条
      await run(`document.querySelector('.header-btn[aria-label="暂停记录"]').click()`);
      await sleep(120);
      assert.equal(await run(`window.__test.snapshot().paused`), true);
      assert.ok(await run(`!!document.querySelector('.paused-strip')`));
      await run(`document.querySelector('.paused-strip').click()`);
      await sleep(120);
      assert.equal(await run(`window.__test.snapshot().paused`), false);

      // 6. 粘贴降级提示
      await run(`window.__test.pasteStatus('copied'); document.querySelector('.clip-card').click()`);
      await sleep(120);
      assert.ok(
        (await run(`document.querySelector('.panel-toast')?.textContent || ''`)).includes("Ctrl+V"),
      );

      // 7. 内嵌设置：主题与保留天数保存失败回滚 + 正常保存
      await run(`document.querySelector('.header-btn[aria-label="打开设置"]').click()`);
      await sleep(200);
      assert.ok(await run(`!!document.querySelector('.settings-view')`));
      writeFileSync(
        path.join(output, `${theme}-settings.png`),
        (await win.webContents.capturePage()).toPNG(),
      );

      const otherThemeIndex = theme === "light" ? 1 : 0;
      await run(
        `window.__test.failSave(true); document.querySelectorAll('.settings-view [aria-label="外观主题"] .seg-btn')[${otherThemeIndex}].click()`,
      );
      await sleep(100);
      assert.equal(await run(`window.__test.snapshot().config.theme`), theme);

      await run(
        `window.__test.failSave(false, true); document.querySelectorAll('.retention-row .seg-btn')[3].click()`,
      );
      await sleep(100);
      assert.equal(await run(`window.__test.snapshot().config.dataRetentionDays`), 7);

      await run(
        `window.__test.failSave(false); document.querySelectorAll('.retention-row .seg-btn')[3].click()`,
      );
      await sleep(100);
      assert.equal(await run(`window.__test.snapshot().config.dataRetentionDays`), 30);

      await run(`document.querySelector('.settings-view .back-btn').click()`);
      await sleep(120);
      assert.ok(await run(`!!document.querySelector('.panel-list')`));

      win.destroy();
    }

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
