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

test("bounded search previews find late literal matches and preserve full content", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE clipboard_items (id INTEGER PRIMARY KEY, content TEXT, type TEXT,
    timestamp TEXT, size TEXT, is_favorite INTEGER, content_hash TEXT, file_path TEXT, thumb_path TEXT)`);
  databaseModule.useTestDatabase(db);
  const content = "前文😀".repeat(1100) + "Needle 中文 %_\\ <script> &" + "后文".repeat(150);
  db.prepare(
    "INSERT INTO clipboard_items VALUES (1, ?, 'code', '2026-10-02', '20 KB', 0, NULL, NULL, NULL)",
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

test("matching treats markup and wildcard characters as text and only folds ASCII", () => {
  const text = "中文 <script> %_\\ NEEDLE ä Ä";
  for (const query of ["<script>", "%_\\", "needle", "中文", "Ä"]) {
    const parts = searchParts(text, query);
    assert.equal(parts.map((part) => part.text).join(""), text);
    assert.equal(parts.filter((part) => part.match).length, 1);
  }
});
