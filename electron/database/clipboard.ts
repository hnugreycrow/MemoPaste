import path from "node:path";
import { createRequire } from "node:module";
import fs from "node:fs";
import { app } from "electron";
import { deleteImageFiles } from "../services/image-storage";

// better-sqlite3 是 CJS native addon；打包后的 ESM 主进程用 createRequire 更稳
const require = createRequire(import.meta.url);
const BetterSqlite3 = require("better-sqlite3");

/** SQLite 行：timestamp 存 ISO 字符串；is_favorite 为 0/1 */
export type ClipboardRow = {
  id: number;
  content: string;
  type: string;
  timestamp: string;
  size: string | null;
  is_favorite: number;
  content_hash: string | null;
  file_path: string | null;
  thumb_path: string | null;
};

/** 写入用入参（与渲染进程 ClipboardItem 字段对齐） */
export type ClipboardItemInput = {
  content: string;
  type: string;
  timestamp: Date | string;
  size?: string;
  is_favorite?: boolean;
  content_hash?: string | null;
  file_path?: string | null;
  thumb_path?: string | null;
};

/** better-sqlite3 未自带完整 d.ts 时的最小类型 */
type SqliteStatement = {
  run: (...params: unknown[]) => { changes: number; lastInsertRowid: number | bigint };
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
};

type SqliteDatabase = {
  prepare: (sql: string) => SqliteStatement;
  close: () => void;
  transaction: <T>(fn: () => T) => () => T;
  exec: (sql: string) => void;
};

let db: SqliteDatabase | null = null;

function requireDb(): SqliteDatabase {
  if (!db) {
    throw new Error("Database is not initialized");
  }
  return db;
}

/**
 * 清空/删后若不重置 sqlite_sequence，新 id 会一直增大。
 * 列表与调试更习惯从较小 id 续号，故按当前 MAX(id) 回写序列。
 */
function resetIdSequence(): void {
  const database = requireDb();
  const maxIdResult = database
    .prepare("SELECT MAX(id) as maxId FROM clipboard_items")
    .get() as { maxId: number | null } | undefined;
  const maxId = maxIdResult?.maxId ?? 0;

  if (maxId > 0) {
    database
      .prepare(
        `UPDATE sqlite_sequence SET seq = ? WHERE name = 'clipboard_items'`,
      )
      .run(maxId);
  } else {
    database
      .prepare(`DELETE FROM sqlite_sequence WHERE name = 'clipboard_items'`)
      .run();
  }
}

function tableHasColumn(database: SqliteDatabase, column: string): boolean {
  const cols = database.prepare(`PRAGMA table_info(clipboard_items)`).all() as Array<{
    name: string;
  }>;
  return cols.some((c) => c.name === column);
}

function migrateClipboardSchema(database: SqliteDatabase): void {
  if (!tableHasColumn(database, "content_hash")) {
    database.exec(`ALTER TABLE clipboard_items ADD COLUMN content_hash TEXT`);
  }
  if (!tableHasColumn(database, "file_path")) {
    database.exec(`ALTER TABLE clipboard_items ADD COLUMN file_path TEXT`);
  }
  if (!tableHasColumn(database, "thumb_path")) {
    database.exec(`ALTER TABLE clipboard_items ADD COLUMN thumb_path TEXT`);
  }

  // 列表/筛选常用路径；IF NOT EXISTS 可重复执行
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_clipboard_ts_id ON clipboard_items(timestamp DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_clipboard_type ON clipboard_items(type);
    CREATE INDEX IF NOT EXISTS idx_clipboard_favorite ON clipboard_items(is_favorite);
    CREATE INDEX IF NOT EXISTS idx_clipboard_hash ON clipboard_items(content_hash);
  `);
}

function rowImagePaths(row: {
  file_path?: string | null;
  thumb_path?: string | null;
}): void {
  if (row.file_path || row.thumb_path) {
    deleteImageFiles(row.file_path, row.thumb_path);
  }
}

export function initDatabase(_isDevelopment = false) {
  try {
    console.log("Initializing SQLite database");

    function getDbPath() {
      // 跟安装目录走，卸载/换机不会丢在项目目录里
      return path.join(app.getPath("userData"), "database/clipboard.db");
    }

    const dbFile = getDbPath();
    const dbDir = path.dirname(dbFile);
    if (!fs.existsSync(dbDir)) {
      console.log("创建数据库目录:", dbDir);
      fs.mkdirSync(dbDir, { recursive: true });
    }

    console.log("尝试创建或打开数据库:", dbFile);
    try {
      db = new BetterSqlite3(dbFile) as SqliteDatabase;
    } catch (dbError) {
      console.error("数据库创建/打开失败:", dbError);
      throw dbError;
    }

    const createClipboardItemQuery = `
      CREATE TABLE IF NOT EXISTS clipboard_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        type TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        size VARCHAR(10),
        is_favorite BOOLEAN DEFAULT 0,
        content_hash TEXT,
        file_path TEXT,
        thumb_path TEXT
      );
    `;
    db.prepare(createClipboardItemQuery).run();
    migrateClipboardSchema(db);

    return true;
  } catch (error) {
    console.error("Failed to initialize memory storage:", error);
    throw error;
  }
}

export function closeDatabase() {
  try {
    if (db) {
      db.close();
      db = null;
      console.log("Database connection closed");
    }
  } catch (error) {
    console.error("Failed to close database connection:", error);
  }
}

/** 保存结果：新建或同内容置顶 */
export type SaveClipboardResult = {
  id: number;
  isNew: boolean;
  is_favorite: boolean;
};

/** 文本按 content 去重；图片按 content_hash 去重。已存在则更新时间置顶，并合并收藏标记 */
export function saveClipboardItem(
  item: ClipboardItemInput,
): SaveClipboardResult | null {
  try {
    const database = requireDb();
    const timestamp =
      item.timestamp instanceof Date
        ? item.timestamp.toISOString()
        : item.timestamp;

    const contentHash = item.content_hash ?? null;
    const filePath = item.file_path ?? null;
    const thumbPath = item.thumb_path ?? null;

    return database.transaction(() => {
      type DupRow = { id: number; is_favorite: number };
      const duplicates: DupRow[] =
        item.type === "image" && contentHash
          ? (database
              .prepare(
                `SELECT id, is_favorite FROM clipboard_items
                 WHERE content_hash = ?
                 ORDER BY timestamp DESC, id DESC`,
              )
              .all(contentHash) as DupRow[])
          : (database
              .prepare(
                `SELECT id, is_favorite FROM clipboard_items
                 WHERE content = ? AND (type IS NULL OR type != 'image')
                 ORDER BY timestamp DESC, id DESC`,
              )
              .all(item.content) as DupRow[]);

      if (duplicates.length > 0) {
        const keep = duplicates[0];
        // 任一副本曾收藏则保留收藏
        const isFavorite = duplicates.some((row) => !!row.is_favorite) ? 1 : 0;

        database
          .prepare(
            `UPDATE clipboard_items
             SET type = ?, timestamp = ?, size = ?, is_favorite = ?,
                 content = ?, content_hash = ?, file_path = ?, thumb_path = ?
             WHERE id = ?`,
          )
          .run(
            item.type,
            timestamp,
            item.size ?? null,
            isFavorite,
            item.content,
            contentHash,
            filePath,
            thumbPath,
            keep.id,
          );

        if (duplicates.length > 1) {
          const staleIds = duplicates.slice(1).map((row) => row.id);
          database
            .prepare(
              `DELETE FROM clipboard_items WHERE id IN (${staleIds
                .map(() => "?")
                .join(",")})`,
            )
            .run(...staleIds);
        }

        return {
          id: keep.id,
          isNew: false,
          is_favorite: isFavorite === 1,
        };
      }

      const isFavorite = item.is_favorite ? 1 : 0;
      const result = database
        .prepare(
          `INSERT INTO clipboard_items
           (content, type, timestamp, size, is_favorite, content_hash, file_path, thumb_path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          item.content,
          item.type,
          timestamp,
          item.size ?? null,
          isFavorite,
          contentHash,
          filePath,
          thumbPath,
        );

      return {
        id: Number(result.lastInsertRowid),
        isNew: true,
        is_favorite: isFavorite === 1,
      };
    })();
  } catch (error) {
    console.error("Failed to save clipboard item:", error);
    return null;
  }
}

export function getClipboardItemById(id: number | string): ClipboardRow | null {
  try {
    const row = requireDb()
      .prepare(`SELECT * FROM clipboard_items WHERE id = ?`)
      .get(id) as ClipboardRow | undefined;
    return row ?? null;
  } catch (error) {
    console.error("Failed to get clipboard item:", error);
    return null;
  }
}

export function deleteClipboardItem(id: number | string) {
  try {
    const database = requireDb();
    return database.transaction(() => {
      const row = database
        .prepare(
          `SELECT file_path, thumb_path FROM clipboard_items WHERE id = ?`,
        )
        .get(id) as { file_path: string | null; thumb_path: string | null } | undefined;

      database.prepare(`DELETE FROM clipboard_items WHERE id = ?`).run(id);
      if (row) {
        rowImagePaths(row);
      }
      return true;
    })();
  } catch (error) {
    console.error("Failed to delete clipboard item:", error);
    return false;
  }
}

export function clearClipboardHistory() {
  try {
    const database = requireDb();
    database.transaction(() => {
      const rows = database
        .prepare(
          `SELECT file_path, thumb_path FROM clipboard_items
           WHERE file_path IS NOT NULL OR thumb_path IS NOT NULL`,
        )
        .all() as Array<{ file_path: string | null; thumb_path: string | null }>;

      database.prepare(`DELETE FROM clipboard_items`).run();
      resetIdSequence();

      for (const row of rows) {
        rowImagePaths(row);
      }
    })();
    return true;
  } catch (err) {
    console.error("Failed to clear clipboard history:", err);
    return false;
  }
}

export function clearClipboardExceptFavorites() {
  try {
    const database = requireDb();
    let deletedCount = 0;
    database.transaction(() => {
      const rows = database
        .prepare(
          `SELECT file_path, thumb_path FROM clipboard_items
           WHERE is_favorite = 0 AND (file_path IS NOT NULL OR thumb_path IS NOT NULL)`,
        )
        .all() as Array<{ file_path: string | null; thumb_path: string | null }>;

      const result = database
        .prepare(`DELETE FROM clipboard_items WHERE is_favorite = 0`)
        .run();
      deletedCount = result.changes;
      resetIdSequence();

      for (const row of rows) {
        rowImagePaths(row);
      }
    })();
    console.log(`已清除 ${deletedCount} 条非收藏记录`);
    return deletedCount;
  } catch (err) {
    console.error("Failed to clear clipboard except favorites:", err);
    return -1;
  }
}

/** 按保留天数删过期非收藏记录（收藏不受保留策略影响） */
export function clearExpiredClipboardItems(retentionDays: number) {
  try {
    const database = requireDb();
    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - retentionDays);
    const expiredTimestamp = expiredDate.toISOString();

    console.log(`清除 ${expiredTimestamp} 之前的非收藏记录`);

    return database.transaction(() => {
      const rows = database
        .prepare(
          `SELECT file_path, thumb_path FROM clipboard_items
           WHERE timestamp < ? AND is_favorite = 0
             AND (file_path IS NOT NULL OR thumb_path IS NOT NULL)`,
        )
        .all(expiredTimestamp) as Array<{
        file_path: string | null;
        thumb_path: string | null;
      }>;

      const result = database
        .prepare(
          `DELETE FROM clipboard_items
           WHERE timestamp < ? AND is_favorite = 0`,
        )
        .run(expiredTimestamp);

      if (result.changes > 0) {
        resetIdSequence();
      }

      for (const row of rows) {
        rowImagePaths(row);
      }

      console.log(`已清除 ${result.changes} 条过期记录`);
      return result.changes;
    })();
  } catch (error) {
    console.error("Failed to clear expired clipboard items:", error);
    return 0;
  }
}

/**
 * 转义 LIKE 通配符，避免用户输入中的 % _ \ 被当成模式字符
 */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => "\\" + c);
}

/** 列表/面板只需预览；全文按 id 另取，避免 IPC 拖大段 content */
const LIST_CONTENT_PREVIEW_LEN = 200;

export function getClipboardHistory(
  page = 1,
  pageSize = 50,
  type = "all",
  keyword = "",
) {
  try {
    const database = requireDb();
    const offset = (page - 1) * pageSize;

    const whereClauses: string[] = [];
    const filterParams: unknown[] = [];

    if (type === "favorite") {
      whereClauses.push("is_favorite = 1");
    } else if (type && type !== "all") {
      whereClauses.push("type = ?");
      filterParams.push(type);
    }

    const trimmedKeyword = (keyword || "").trim();
    if (trimmedKeyword) {
      whereClauses.push("content LIKE ? COLLATE NOCASE ESCAPE '\\'");
      filterParams.push(`%${escapeLike(trimmedKeyword)}%`);
    }

    const whereSql =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const selectQuery = `
      SELECT id,
             substr(content, 1, ${LIST_CONTENT_PREVIEW_LEN}) AS content,
             type, timestamp, size, is_favorite,
             content_hash, file_path, thumb_path
      FROM clipboard_items
      ${whereSql}
      ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?
    `;
    const countQuery = `
      SELECT COUNT(*) as total FROM clipboard_items
      ${whereSql}
    `;

    const totalResult = database.prepare(countQuery).get(...filterParams) as
      | { total: number }
      | undefined;
    const total = totalResult ? totalResult.total : 0;

    const items = database
      .prepare(selectQuery)
      .all(...filterParams, pageSize, offset) as ClipboardRow[];

    return {
      items,
      total,
      page,
      pageSize,
    };
  } catch (error) {
    console.error("Failed to get clipboard history:", error);
    return {
      items: [] as ClipboardRow[],
      total: 0,
      page,
      pageSize,
    };
  }
}

export function setFavoriteStatus(id: number | string, isFavorite: boolean) {
  try {
    requireDb()
      .prepare(`UPDATE clipboard_items SET is_favorite = ? WHERE id = ?`)
      .run(isFavorite ? 1 : 0, id);
    return true;
  } catch (error) {
    console.error("Failed to update favorite status:", error);
    return false;
  }
}

export function getClipboardCounts() {
  const counts = { all: 0, text: 0, url: 0, code: 0, image: 0, favorite: 0 };
  try {
    const database = requireDb();
    const typeRows = database
      .prepare(`SELECT type, COUNT(*) as c FROM clipboard_items GROUP BY type`)
      .all() as Array<{ type: string; c: number }>;
    for (const typeRow of typeRows) {
      counts.all += typeRow.c;
      if (
        typeRow.type === "text" ||
        typeRow.type === "url" ||
        typeRow.type === "code" ||
        typeRow.type === "image"
      ) {
        counts[typeRow.type] = typeRow.c;
      }
    }
    const favRow = database
      .prepare(`SELECT COUNT(*) as c FROM clipboard_items WHERE is_favorite = 1`)
      .get() as { c: number } | undefined;
    counts.favorite = favRow?.c ?? 0;
    return counts;
  } catch (error) {
    console.error("Failed to get clipboard counts:", error);
    return counts;
  }
}
