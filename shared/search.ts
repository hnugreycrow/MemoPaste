/** SQLite NOCASE folds ASCII only; keep previews and highlights consistent with LIKE. */
export const foldSearch = (text: string) => text.replace(/[A-Z]/g, (c) => c.toLowerCase());

export function searchParts(text: string, keyword: string): { text: string; match: boolean }[] {
  const term = foldSearch(keyword.trim());
  if (!term) return [{ text, match: false }];
  const folded = foldSearch(text);
  const parts: { text: string; match: boolean }[] = [];
  let cursor = 0;
  let index = folded.indexOf(term);
  while (index >= 0) {
    if (index > cursor) parts.push({ text: text.slice(cursor, index), match: false });
    parts.push({ text: text.slice(index, index + term.length), match: true });
    cursor = index + term.length;
    index = folded.indexOf(term, cursor);
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts;
}
