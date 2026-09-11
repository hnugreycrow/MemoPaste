import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";

// Exercise the real store and virtual scroll together without starting Electron.
const compiled = await build({
  stdin: {
    contents: `export { useClipboardStore } from './src/stores/clipboardStore';
      export { useVirtualScroll } from './src/views/clipboard/composables/useVirtualScroll';
      export { groupClipboardRows } from './src/utils/dateGroups';
      export { createPinia, setActivePinia } from 'pinia';
      export { effectScope, nextTick } from 'vue';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
});
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(
  createRequire(import.meta.url),
  module,
  module.exports,
);
const {
  useClipboardStore,
  useVirtualScroll,
  groupClipboardRows,
  createPinia,
  setActivePinia,
  effectScope,
  nextTick,
} = module.exports;
const item = (id) => ({
  id,
  content: `record ${id}`,
  type: "text",
  timestamp: new Date(2026, 8, 10),
  size: "10",
});

test("background arrivals retain loaded records, scroll anchor and pagination", async () => {
  setActivePinia(createPinia());
  let database = Array.from({ length: 80 }, (_, i) => item(80 - i));
  globalThis.window = {
    clipboard: {
      getHistory: async (page, size) => ({
        items: database.slice((page - 1) * size, page * size),
        total: database.length,
      }),
      getCounts: async () => ({ all: database.length }),
    },
  };
  const store = useClipboardStore();
  await store.loadClipboardHistory();
  await store.loadClipboardHistory(2, true);
  await store.loadClipboardHistory(3, true);
  const scope = effectScope();
  const scroll = scope.run(() =>
    useVirtualScroll(() => groupClipboardRows(store.clipboardData, new Date(2026, 8, 10))),
  );
  const element = { scrollTop: 24 + 15 * 72 + 13, clientHeight: 300 };
  scroll.contentListRef.value = element;
  scroll.handleScroll();
  database.unshift(item(81));
  await store.refreshAfterClipboardChange();
  await nextTick();
  assert.equal(element.scrollTop, 24 + 16 * 72 + 13);
  assert.ok(store.clipboardData.some((row) => row.id === 51));
  assert.equal(store.currentPage, 4);
  await store.loadClipboardHistory(5, true);
  assert.equal(new Set(store.clipboardData.map((row) => row.id)).size, 50);
  // Recopying an already first record must not load another page.
  await store.refreshAfterClipboardChange();
  assert.equal(store.clipboardData.length, 50);
  // A burst larger than one page must also retain the old tail.
  database.unshift(...Array.from({ length: 25 }, (_, i) => item(106 - i)));
  await store.refreshAfterClipboardChange();
  await nextTick();
  assert.ok(store.clipboardData.some((row) => row.id === 32));
  assert.equal(element.scrollTop, 24 + 41 * 72 + 13);
  // Recopy the visible anchor itself: stay with its neighbours instead of following it to the top.
  const movedIndex = database.findIndex((row) => row.id === 65);
  const [moved] = database.splice(movedIndex, 1);
  database.unshift({ ...moved, timestamp: new Date(2026, 8, 10, 12) });
  await store.refreshAfterClipboardChange();
  await nextTick();
  assert.equal(element.scrollTop, 24 + 41 * 72 + 13);
  scope.stop();
});

test("late background responses cannot replace newer search results", async () => {
  setActivePinia(createPinia());
  let resolveOld;
  globalThis.window = {
    clipboard: {
      getHistory: (_page, _size, _type, keyword) =>
        keyword === "find"
          ? Promise.resolve({ items: [item(9)], total: 1 })
          : new Promise((resolve) => {
              resolveOld = resolve;
            }),
      getCounts: async () => ({ all: 100 }),
    },
  };
  const store = useClipboardStore();
  const old = store.refreshAfterClipboardChange();
  store.searchKeyword = "find";
  await store.loadClipboardHistory();
  resolveOld({ items: [item(1)], total: 100 });
  await old;
  assert.deepEqual(
    store.clipboardData.map((row) => row.id),
    [9],
  );
  assert.equal(store.totalItems, 1);
  assert.equal(store.isLoadingMore, false);
});
