import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";

// Exercise the real Pinia store without starting Electron.
const compiled = await build({
  stdin: {
    contents: `export { useClipboardStore } from './src/stores/clipboardStore';
      export { createPinia, setActivePinia } from 'pinia';
      export { nextTick } from 'vue';`,
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
const { useClipboardStore, createPinia, setActivePinia, nextTick } = module.exports;

const item = (id) => ({
  id,
  content: `record ${id}`,
  type: "text",
  timestamp: new Date(2026, 8, 10),
  size: "10 B",
  alias: null,
});

test("background arrivals retain loaded records and pagination without duplicating", async () => {
  setActivePinia(createPinia());
  const database = Array.from({ length: 100 }, (_, i) => item(100 - i));
  globalThis.window = {
    clipboard: {
      getHistory: async (page, size) => ({
        items: database.slice((page - 1) * size, page * size),
        total: database.length,
      }),
      getCounts: async () => ({ all: database.length, text: database.length, url: 0, code: 0, image: 0, favorite: 0 }),
    },
  };
  const store = useClipboardStore();
  await store.loadClipboardHistory();
  await store.loadClipboardHistory(2, true);
  assert.equal(store.clipboardData.length, 40);

  database.unshift(item(101));
  await store.refreshAfterClipboardChange();
  assert.ok(store.clipboardData.some((row) => row.id === 61));
  assert.equal(store.currentPage, 3);

  await store.loadClipboardHistory(4, true);
  assert.equal(new Set(store.clipboardData.map((row) => row.id)).size, 80);

  // Recopying the top record must not expand loaded range
  await store.refreshAfterClipboardChange();
  assert.equal(store.clipboardData.length, 80);

  // A burst larger than one page must still retain the old tail
  database.unshift(...Array.from({ length: 25 }, (_, i) => item(126 - i)));
  await store.refreshAfterClipboardChange();
  assert.ok(store.clipboardData.some((row) => row.id === 22));
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
      getCounts: async () => ({ all: 100, text: 100, url: 0, code: 0, image: 0, favorite: 0 }),
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
  const database = Array.from({ length: 30 }, (_, index) => ({
    ...item(30 - index),
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
      getCounts: async () => ({
        all: database.length,
        text: database.length,
        url: 0,
        code: 0,
        image: 0,
        favorite: database.filter((row) => row.is_favorite).length,
      }),
    },
  };
  const store = useClipboardStore();
  store.activeFilter = "favorite";
  await store.loadClipboardHistory();
  const result = await store.toggleFavorite(store.clipboardData[0]);
  assert.equal(result.ok, true);
  assert.equal(result.favorited, false);
  assert.equal(store.totalItems, 29);
  assert.equal(store.clipboardData.length, 20);
  assert.deepEqual(
    store.clipboardData.map((row) => row.id),
    Array.from({ length: 20 }, (_, index) => 29 - index),
  );
  await store.loadClipboardHistory(2, true);
  assert.deepEqual(
    store.clipboardData.map((row) => row.id),
    Array.from({ length: 29 }, (_, index) => 29 - index),
  );
});

test("setting a non-empty alias auto-favorites the item and updates state", async () => {
  setActivePinia(createPinia());
  const favCalls = [];
  const aliasCalls = [];
  globalThis.window = {
    clipboard: {
      getHistory: async () => ({ items: [item(1)], total: 1 }),
      setAlias: async (id, alias) => {
        aliasCalls.push({ id, alias });
        return true;
      },
      setFavorite: async (id, fav) => {
        favCalls.push({ id, fav });
        return true;
      },
      getCounts: async () => ({ all: 1, text: 1, url: 0, code: 0, image: 0, favorite: 1 }),
    },
  };
  const store = useClipboardStore();
  await store.loadClipboardHistory();
  const res = await store.setItemAlias(store.clipboardData[0], "  常用命令  ");
  assert.deepEqual(res, { ok: true, favorited: true });
  assert.equal(store.clipboardData[0].alias, "常用命令");
  assert.equal(store.clipboardData[0].is_favorite, true);
  assert.deepEqual(aliasCalls, [{ id: 1, alias: "常用命令" }]);
  assert.deepEqual(favCalls, [{ id: 1, fav: true }]);
});

test("failed search does not show stale rows and can be retried", async () => {
  setActivePinia(createPinia());
  let fails = false;
  globalThis.window = {
    clipboard: {
      getHistory: async () => {
        if (fails) throw new Error("offline");
        return { items: [item(1)], total: 1 };
      },
    },
  };
  const store = useClipboardStore();
  await store.loadClipboardHistory();
  fails = true;
  store.setSearchKeyword("new query");
  await nextTick();
  assert.equal(store.clipboardData.length, 0);
  assert.ok(store.historyError);
  fails = false;
  await store.loadClipboardHistory();
  assert.equal(store.historyError, "");
  assert.equal(store.clipboardData.length, 1);
});
