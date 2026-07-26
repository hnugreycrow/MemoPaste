import path from "node:path";
import { createRequire } from "node:module";
import fs from "node:fs";
import { app } from "electron";

// 在ES模块中模拟CommonJS的require功能（因为Electron有时需要使用CommonJS模块）
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
};

/** 写入用入参（与渲染进程 ClipboardItem 字段对齐） */
export type ClipboardItemInput = {
  content: string;
  type: string;
  timestamp: Date | string;
  size?: string;
  is_favorite?: boolean;
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
};

// 数据库连接实例
let db: SqliteDatabase | null = null;

function requireDb(): SqliteDatabase {
  if (!db) {
    throw new Error("Database is not initialized");
  }
  return db;
}

/**
 * 按当前表内最大 id 重置 sqlite 自增序列；无记录则删除序列行
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

/**
 * 初始化数据库
 * @param _isDevelopment 是否为开发环境
 * @returns 是否初始化成功
 */
export function initDatabase(_isDevelopment = false) {
  try {
    console.log("Initializing SQLite database");

    function getDbPath() {
      return path.join(app.getPath("userData"), "database/clipboard.db"); // 生产 -> %APPDATA%/<your-app-name>/database/clipboard.db
    }

    // 确保数据库目录存在
    const dbFile = getDbPath();
    const dbDir = path.dirname(dbFile);
    if (!fs.existsSync(dbDir)) {
      console.log("创建数据库目录:", dbDir);
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // 创建或打开数据库
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
        is_favorite BOOLEAN DEFAULT 0
      );
    `;
    db.prepare(createClipboardItemQuery).run();

    return true;
  } catch (error) {
    console.error("Failed to initialize memory storage:", error);
    throw error;
  }
}

/**
 * 关闭数据库连接
 */
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

/**
 * 保存剪贴板项目
 * @param item 剪贴板项目
 * @returns 保存后的项目ID，失败时返回null
 */
export function saveClipboardItem(item: ClipboardItemInput) {
  try {
    const database = requireDb();
    const timestamp =
      item.timestamp instanceof Date
        ? item.timestamp.toISOString()
        : item.timestamp;
    const isFavorite = item.is_favorite ? 1 : 0;

    const insertQuery = `
      INSERT INTO clipboard_items (content, type, timestamp, size, is_favorite)
      VALUES (?, ?, ?, ?, ?)
    `;
    const result = database
      .prepare(insertQuery)
      .run(item.content, item.type, timestamp, item.size ?? null, isFavorite);

    return result.lastInsertRowid;
  } catch (error) {
    console.error("Failed to save clipboard item:", error);
    return null;
  }
}

/**
 * 删除剪贴板项目
 * @param id 项目ID
 * @returns 是否删除成功
 */
export function deleteClipboardItem(id: number | string) {
  try {
    requireDb().prepare(`DELETE FROM clipboard_items WHERE id = ?`).run(id);
    return true;
  } catch (error) {
    console.error("Failed to delete clipboard item:", error);
    return false;
  }
}

/**
 * 清空剪贴板历史并重置ID
 * @returns 是否清空成功
 */
export function clearClipboardHistory() {
  try {
    const database = requireDb();
    database.transaction(() => {
      database.prepare(`DELETE FROM clipboard_items`).run();
      resetIdSequence();
    })();
    return true;
  } catch (err) {
    console.error("Failed to clear clipboard history:", err);
    return false;
  }
}

/**
 * 清空剪贴板历史但保留收藏的记录
 * @returns 删除的记录数量，失败时返回 -1
 */
export function clearClipboardExceptFavorites() {
  try {
    const database = requireDb();
    let deletedCount = 0;
    database.transaction(() => {
      const result = database
        .prepare(`DELETE FROM clipboard_items WHERE is_favorite = 0`)
        .run();
      deletedCount = result.changes;
      resetIdSequence();
    })();
    console.log(`已清除 ${deletedCount} 条非收藏记录`);
    return deletedCount;
  } catch (err) {
    console.error("Failed to clear clipboard except favorites:", err);
    return -1;
  }
}

/**
 * 清除过期的剪贴板记录（保留收藏的记录）
 * @param retentionDays 保留天数
 * @returns 清除的记录数量
 */
export function clearExpiredClipboardItems(retentionDays: number) {
  try {
    const database = requireDb();
    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - retentionDays);
    const expiredTimestamp = expiredDate.toISOString();

    console.log(`清除 ${expiredTimestamp} 之前的非收藏记录`);

    const deleteQuery = `
      DELETE FROM clipboard_items 
      WHERE timestamp < ? AND is_favorite = 0
    `;
    const result = database.prepare(deleteQuery).run(expiredTimestamp);

    if (result.changes > 0) {
      resetIdSequence();
    }

    console.log(`已清除 ${result.changes} 条过期记录`);
    return result.changes;
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

/**
 * 获取剪贴板历史（支持分页、按类型筛选、关键词搜索）
 * @param page 页码（从1开始）
 * @param pageSize 每页数量
 * @param type 可选的类型筛选
 * @param keyword 可选的关键词，按 content 做 LIKE 模糊匹配
 * @returns 剪贴板历史列表和总数
 */
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
      SELECT * FROM clipboard_items
      ${whereSql}
      ORDER BY id DESC LIMIT ? OFFSET ?
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

/**
 * 设置剪贴板项目的收藏状态
 * @param id 项目ID
 * @param isFavorite 是否收藏
 * @returns 是否设置成功
 */
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

/**
 * 按类型统计剪贴板项目数量
 * @returns 各类型计数对象
 */
export function getClipboardCounts() {
  const counts = { all: 0, text: 0, url: 0, code: 0, favorite: 0 };
  try {
    const database = requireDb();
    const typeRows = database
      .prepare(`SELECT type, COUNT(*) as c FROM clipboard_items GROUP BY type`)
      .all() as Array<{ type: string; c: number }>;
    for (const row of typeRows) {
      counts.all += row.c;
      if (row.type === "text" || row.type === "url" || row.type === "code") {
        counts[row.type] = row.c;
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
