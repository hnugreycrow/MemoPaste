import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

const require = createRequire(import.meta.url);
function compile(source, resolve = require) {
  const code = ts
    .transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    })
    .outputText.replaceAll("import.meta.url", '"file:///clipboard.js"');
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(resolve, module, module.exports);
  return module.exports;
}
const { searchParts } = compile(readFileSync("shared/search.ts", "utf8"));
const databaseModule = compile(
  readFileSync("electron/database/clipboard.ts", "utf8")
    .replace("const require = createRequire", "const runtimeRequire = createRequire")
    .replace('require("better-sqlite3")', 'runtimeRequire("better-sqlite3")') +
    "\nexport function useTestDatabase(value: SqliteDatabase) { db = value; }",
  (name) => {
    if (name === "electron" || name === "../services/image-storage") return {};
    if (name === "node:module") return { createRequire: () => () => null };
    return require(name);
  },
);

function createMemoryDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE clipboard_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    size TEXT,
    is_favorite INTEGER DEFAULT 0,
    alias TEXT,
    content_hash TEXT,
    file_path TEXT,
    thumb_path TEXT
  )`);
  db.transaction = (fn) => () => {
    db.exec("BEGIN");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  databaseModule.useTestDatabase(db);
  return db;
}

test("bounded search previews find late literal matches and preserve full content", () => {
  const db = createMemoryDb();
  const content = "前文😀".repeat(1100) + "Needle 中文 %_\\ <script> &" + "后文".repeat(150);
  db.prepare(
    "INSERT INTO clipboard_items VALUES (1, ?, 'code', '2026-10-02', '20 KB', 0, NULL, NULL, NULL, NULL)",
  ).run(content);
  for (const keyword of ["needle", "中文", "%_\\", "<script>", "&"]) {
    const result = databaseModule.getClipboardHistory(1, 10, "all", keyword);
    assert.equal(result.total, 1);
    assert.ok(result.items[0].searchPreview.startsWith("…"));
    assert.ok(result.items[0].searchPreview.endsWith("…"));
    assert.ok(result.items[0].searchPreview.length < 420);
    assert.ok(searchParts(result.items[0].searchPreview, keyword).some((part) => part.match));
    assert.equal(databaseModule.getClipboardItemById(1).content, content);
  }
  assert.equal(databaseModule.getClipboardHistory(1, 10, "all", "missing").total, 0);
  assert.equal(databaseModule.getClipboardHistory(1, 10, "all").items[0].searchPreview, undefined);
  db.close();
});

test("alias supports saving, trimming, searching and surviving deduplication", () => {
  const db = createMemoryDb();
  const saved = databaseModule.saveClipboardItem({
    content: "91110108MA0012345X",
    type: "text",
    timestamp: new Date("2026-10-02T01:00:00Z"),
    size: "18 B",
    is_favorite: true,
  });
  assert.ok(saved);

  assert.equal(databaseModule.setClipboardItemAlias(saved.id, "  公司发票抬头  "), true);
  const byAlias = databaseModule.getClipboardHistory(1, 10, "all", "发票");
  assert.equal(byAlias.total, 1);
  assert.equal(byAlias.items[0].alias, "公司发票抬头");
  assert.equal(byAlias.items[0].content, "91110108MA0012345X");

  // Re-copying the same content deduplicates and keeps alias + favorite
  const deduped = databaseModule.saveClipboardItem({
    content: "91110108MA0012345X",
    type: "text",
    timestamp: new Date("2026-10-02T02:00:00Z"),
    size: "18 B",
  });
  assert.equal(deduped.isNew, false);
  assert.equal(deduped.is_favorite, true);
  assert.equal(databaseModule.getClipboardItemById(saved.id).alias, "公司发票抬头");

  // Blank alias clears it back to null
  assert.equal(databaseModule.setClipboardItemAlias(saved.id, "   "), true);
  assert.equal(databaseModule.getClipboardItemById(saved.id).alias, null);
  db.close();
});

test("matching treats markup and wildcard characters as text and only folds ASCII", () => {
  const text = "中文 <script> %_\\ NEEDLE ä Ä";
  for (const query of ["<script>", "%_\\", "needle", "中文", "Ä"]) {
    const parts = searchParts(text, query);
    assert.equal(parts.map((part) => part.text).join(""), text);
    assert.equal(parts.filter((part) => part.match).length, 1);
  }
});
