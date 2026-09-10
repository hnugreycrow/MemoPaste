import type { ClipboardItem } from "./type";

export type DateGroup = string;
export type ClipboardRow =
  | { kind: "header"; key: string; label: DateGroup; height: number }
  | {
      kind: "item";
      key: string;
      item: ClipboardItem;
      index: number;
      label: DateGroup;
      height: number;
    };

export function getDateGroup(timestamp: Date, now: Date): DateGroup {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(timestamp, today)) return "今天";
  const date = `${timestamp.getMonth() + 1}月${timestamp.getDate()}日`;
  const label =
    timestamp.getFullYear() === now.getFullYear() ? date : `${timestamp.getFullYear()}年${date}`;
  if (sameDay(timestamp, yesterday)) return `昨天 · ${label}`;
  return label;
}

/** Input retains the store's timestamp-descending order and original navigation indices. */
export function groupClipboardRows(items: ClipboardItem[], now: Date): ClipboardRow[] {
  const rows: ClipboardRow[] = [];
  let previous: DateGroup | undefined;
  items.forEach((item, index) => {
    const label = getDateGroup(item.timestamp, now);
    if (label !== previous) {
      rows.push({
        kind: "header",
        key: `group-${item.timestamp.getFullYear()}-${item.timestamp.getMonth() + 1}-${item.timestamp.getDate()}`,
        label,
        height: 24,
      });
      previous = label;
    }
    rows.push({ kind: "item", key: `item-${item.id}`, item, index, label, height: 72 });
  });
  return rows;
}
