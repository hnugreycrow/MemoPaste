import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";

// Exercise the real store and virtual scroll together without starting Electron.
const compiled = await build({
  stdin: {
    contents: `export { useClipboardStore } from './src/stores/clipboardStore';
      export { useVirtualScroll } from './src/views/clipboard/composables/useVirtualScroll';
      export { groupClipboardRows, HISTORY_ROW_HEIGHT, DATE_HEADER_HEIGHT } from './src/utils/dateGroups';
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
  HISTORY_ROW_HEIGHT,
  DATE_HEADER_HEIGHT,
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
  const element = {
    scrollTop: DATE_HEADER_HEIGHT + 15 * HISTORY_ROW_HEIGHT + 13,
    clientHeight: 300,
  };
  scroll.contentListRef.value = element;
  scroll.handleScroll();
  database.unshift(item(81));
  await store.refreshAfterClipboardChange();
  await nextTick();
  assert.equal(element.scrollTop, DATE_HEADER_HEIGHT + 16 * HISTORY_ROW_HEIGHT + 13);
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
  assert.equal(element.scrollTop, DATE_HEADER_HEIGHT + 41 * HISTORY_ROW_HEIGHT + 13);
  // Recopy the visible anchor itself: stay with its neighbours instead of following it to the top.
  const movedIndex = database.findIndex((row) => row.id === 65);
  const [moved] = database.splice(movedIndex, 1);
  database.unshift({ ...moved, timestamp: new Date(2026, 8, 10, 12) });
  await store.refreshAfterClipboardChange();
  await nextTick();
  assert.equal(element.scrollTop, DATE_HEADER_HEIGHT + 41 * HISTORY_ROW_HEIGHT + 13);
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

test("removing a favorite refills the loaded page without skipping the next record", async () => {
  setActivePinia(createPinia());
  const database = Array.from({ length: 25 }, (_, index) => ({
    ...item(25 - index),
    is_favorite: true,
  }));
  globalThis.window = {
    clipboard: {
      getHistory: async (page, size) => {
        const favorites = database.filter((row) => row.is_favorite);
        return {
          items: favorites.slice((page - 1) * size, page * size).map((row) => ({ ...row })),
          total: favorites.length,
        };
      },
      setFavorite: async (id, favorite) => {
        database.find((row) => row.id === id).is_favorite = favorite;
        return true;
      },
      getCounts: async () => ({ favorite: database.filter((row) => row.is_favorite).length }),
    },
  };
  const store = useClipboardStore();
  store.activeFilter = "favorite";
  await store.loadClipboardHistory();
  const result = await store.toggleFavorite(store.clipboardData[0]);
  assert.equal(result.ok, true);
  assert.equal(result.favorited, false);
  assert.equal(store.totalItems, 24);
  assert.equal(store.clipboardData.length, 10);
  assert.deepEqual(
    store.clipboardData.map((row) => row.id),
    Array.from({ length: 10 }, (_, index) => 24 - index),
  );
  await store.loadClipboardHistory(2, true);
  assert.deepEqual(
    store.clipboardData.map((row) => row.id),
    Array.from({ length: 20 }, (_, index) => 24 - index),
  );
});

test("clearing a search allows prefetching the same history range again", async () => {
  setActivePinia(createPinia());
  const database = Array.from({ length: 50 }, (_, index) => item(50 - index));
  const requests = [];
  globalThis.window = {
    clipboard: {
      getHistory: async (page, size, _type, keyword) => {
        requests.push({ page, keyword });
        const rows = keyword ? [] : database;
        return { items: rows.slice((page - 1) * size, page * size), total: rows.length };
      },
    },
  };
  const store = useClipboardStore();
  await store.loadClipboardHistory();
  const scope = effectScope();
  const scroll = scope.run(() =>
    useVirtualScroll(() => groupClipboardRows(store.clipboardData, new Date(2026, 8, 10))),
  );
  scroll.contentListRef.value = { scrollTop: 0, clientHeight: 500 };
  scroll.handleScroll();
  await nextTick();
  await nextTick();
  assert.equal(store.clipboardData.length, 20);
  store.searchKeyword = "missing";
  await store.loadClipboardHistory();
  await nextTick();
  assert.equal(store.clipboardData.length, 0);
  store.searchKeyword = "";
  await store.loadClipboardHistory();
  await nextTick();
  await nextTick();
  assert.equal(store.clipboardData.length, 20);
  assert.equal(requests.filter((request) => request.page === 2).length, 2);
  scope.stop();
});
