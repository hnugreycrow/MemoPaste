/* eslint-disable @typescript-eslint/no-require-imports -- Electron sandbox preload and test runner use CommonJS. */
// Run after `npx vite build`: electron tests/ui-smoke.cjs
const { app, BrowserWindow, protocol } = require("electron");
const { mkdtempSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");

protocol.registerSchemesAsPrivileged([
  { scheme: "clipimg", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const WHITE_MOCK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
  <rect width="80" height="80" fill="#ffffff"/>
  <rect x="12" y="16" width="56" height="8" rx="3" fill="#e5e7eb"/>
  <rect x="12" y="32" width="42" height="6" rx="3" fill="#d1d5db"/>
  <rect x="12" y="46" width="50" height="6" rx="3" fill="#e5e7eb"/>
</svg>`;

const output = mkdtempSync(path.join(os.tmpdir(), "memopaste-ui-"));
app.setPath("userData", path.join(output, "profile"));
app.disableHardwareAcceleration();
app.on("window-all-closed", () => {});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app
  .whenReady()
  .then(async () => {
    protocol.handle("clipimg", () => {
      return new Response(WHITE_MOCK_SVG, { headers: { "content-type": "image/svg+xml" } });
    });

    const errors = [];

    for (const theme of ["light", "dark"]) {
      const win = new BrowserWindow({
        width: 380,
        height: 520,
        show: false,
        frame: false,
        backgroundColor: theme === "dark" ? "#191715" : "#faf7f2",
        hasShadow: true,
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
      await sleep(120);

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
        imgPrimary: document.querySelector('.clip-card[data-id="4"] .image-primary')?.textContent?.trim() || '',
        imgSub: document.querySelector('.clip-card[data-id="4"] .image-sub')?.textContent?.trim() || '',
        aliasedImgSub: document.querySelector('.clip-card[data-id="5"] .image-sub')?.textContent?.trim() || '',
      }))()`);
      assert.equal(layout.overflowX, false);
      assert.equal(layout.cardCount, 5);
      assert.equal(layout.firstAlias, "公司发票抬头");
      assert.equal(layout.slot1, "1");
      assert.equal(layout.imgPrimary, "494×594");
      assert.equal(layout.imgSub, "PNG · 128 KB");
      assert.equal(layout.aliasedImgSub, "PNG · 1920×1080 · 420 KB");
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
      assert.equal(await run(`document.querySelectorAll('.clip-card').length`), 5);

      // 4. 预览全文 + 仅复制（验证写入完整长文本）
      await run(`document.querySelector('.action-icon[aria-label="预览全文"]').click()`);
      await sleep(360);
      assert.ok(await run(`!!document.querySelector('.preview-view')`));
      await run(`document.querySelector('.preview-footer .btn.secondary').click()`);
      await sleep(120);
      assert.ok((await run(`window.__test.snapshot().written`)).length > 2000);
      writeFileSync(
        path.join(output, `${theme}-preview.png`),
        (await win.webContents.capturePage()).toPNG(),
      );
      await run(`document.querySelector('.preview-view .back-btn').click()`);
      await sleep(360);

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

      // 7. 内嵌设置：主题保存失败回滚 + 正常切换
      await run(`document.querySelector('.header-btn[aria-label="打开设置"]').click()`);
      await sleep(360);
      assert.ok(await run(`!!document.querySelector('.settings-view')`));
      assert.equal(await run(`!!document.querySelector('.retention-row')`), false);
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
        `window.__test.failSave(false); document.querySelectorAll('.settings-view [aria-label="外观主题"] .seg-btn')[${otherThemeIndex}].click()`,
      );
      await sleep(100);
      assert.equal(
        await run(`window.__test.snapshot().config.theme`),
        theme === "light" ? "dark" : "light",
      );

      await run(`document.querySelector('.settings-view .back-btn').click()`);
      await sleep(360);
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
