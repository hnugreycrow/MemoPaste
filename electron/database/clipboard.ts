import path from "node:path";
import { createRequire } from "node:module";
import fs from "node:fs";
import { app } from "electron";

// 在ES模块中模拟CommonJS的require功能（因为Electron有时需要使用CommonJS模块）
const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

// 数据库连接实例
let db: any = null;

/**
 * 初始化数据库
 * @param _isDevelopment 是否为开发环境
 * @returns 数据库实例
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
      db = new Database(dbFile);
    } catch (dbError) {
      console.error("数据库创建/打开失败:", dbError);
      throw dbError;
    }

    const createCliboardItemQuery = `
      CREATE TABLE IF NOT EXISTS clipboard_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        type TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        size VARCHAR(10),
        is_favorite BOOLEAN DEFAULT 0
      );
    `;
    db.prepare(createCliboardItemQuery).run();

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
    // 关闭数据库连接
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
export function saveClipboardItem(item: any) {
  try {
    // 将Date对象转换为ISO字符串
    const timestamp =
      item.timestamp instanceof Date
        ? item.timestamp.toISOString()
        : item.timestamp;
    const isFavorite = item.is_favorite ? 1 : 0;

    const insertQuery = `
      INSERT INTO clipboard_items (content, type, timestamp, size, is_favorite)
      VALUES (?, ?, ?, ?, ?)
    `;
    const result = db
      .prepare(insertQuery)
      .run(item.content, item.type, timestamp, item.size, isFavorite);

    // 返回插入的记录ID
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
export function deleteClipboardItem(id: string) {
  try {
    const deleteQuery = `
      DELETE FROM clipboard_items WHERE id = ?
    `;
    db.prepare(deleteQuery).run(id);
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
    db.transaction(() => {
      db.prepare(`DELETE FROM clipboard_items`).run();
      db.prepare(
        `DELETE FROM sqlite_sequence WHERE name='clipboard_items'`
      ).run();
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
    let deletedCount = 0;
    db.transaction(() => {
      // 删除所有非收藏记录
      const result = db
        .prepare(`DELETE FROM clipboard_items WHERE is_favorite = 0`)
        .run();
      deletedCount = result.changes;

      // 重新整理ID序列
      const maxIdResult = db
        .prepare("SELECT MAX(id) as maxId FROM clipboard_items")
        .get();
      const maxId = maxIdResult?.maxId || 0;

      if (maxId > 0) {
        db.prepare(
          `UPDATE sqlite_sequence SET seq = ? WHERE name = 'clipboard_items'`
        ).run(maxId);
      } else {
        db.prepare(
          `DELETE FROM sqlite_sequence WHERE name = 'clipboard_items'`
        ).run();
      }
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
    // 计算过期时间点
    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - retentionDays);
    const expiredTimestamp = expiredDate.toISOString();

    console.log(`清除 ${expiredTimestamp} 之前的非收藏记录`);

    // 删除过期且非收藏的记录
    const deleteQuery = `
      DELETE FROM clipboard_items 
      WHERE timestamp < ? AND is_favorite = 0
    `;
    const result = db.prepare(deleteQuery).run(expiredTimestamp);

    // 如果删除了记录，重新整理ID序列
    if (result.changes > 0) {
      // 获取当前最大ID
      const maxIdResult = db
        .prepare("SELECT MAX(id) as maxId FROM clipboard_items")
        .get();
      const maxId = maxIdResult?.maxId || 0;

      // 重置自增序列
      if (maxId > 0) {
        db.prepare(
          `UPDATE sqlite_sequence SET seq = ? WHERE name = 'clipboard_items'`
        ).run(maxId);
      } else {
        // 如果没有记录了，删除序列记录
        db.prepare(
          `DELETE FROM sqlite_sequence WHERE name = 'clipboard_items'`
        ).run();
      }
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
  keyword = ""
) {
  try {
    const offset = (page - 1) * pageSize;

    const whereClauses: string[] = [];
    const filterParams: any[] = [];

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

    const totalResult = db.prepare(countQuery).get(...filterParams);
    const total = totalResult ? totalResult.total : 0;

    const items = db
      .prepare(selectQuery)
      .all(...filterParams, pageSize, offset);

    return {
      items,
      total,
      page,
      pageSize,
    };
  } catch (error) {
    console.error("Failed to get clipboard history:", error);
    return {
      items: [],
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
export function setFavoriteStatus(id: string, isFavorite: boolean) {
  try {
    const updateQuery = `
      UPDATE clipboard_items SET is_favorite = ? WHERE id = ?
    `;
    db.prepare(updateQuery).run(isFavorite ? 1 : 0, id);
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
    const typeRows = db
      .prepare(`SELECT type, COUNT(*) as c FROM clipboard_items GROUP BY type`)
      .all() as Array<{ type: string; c: number }>;
    for (const row of typeRows) {
      counts.all += row.c;
      if (row.type === "text" || row.type === "url" || row.type === "code") {
        counts[row.type] = row.c;
      }
    }
    const favRow = db
      .prepare(`SELECT COUNT(*) as c FROM clipboard_items WHERE is_favorite = 1`)
      .get() as { c: number } | undefined;
    counts.favorite = favRow?.c ?? 0;
    return counts;
  } catch (error) {
    console.error("Failed to get clipboard counts:", error);
    return counts;
  }
}
