import { searchParts } from "../../shared/search";

/** Mark text nodes only, preserving syntax tokens and never interpreting a search term as HTML. */
export function markSearchHtml(html: string, keyword: string): string {
  if (!keyword.trim()) return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  const ranges: { start: number; end: number }[] = [];
  let offset = 0;
  for (const part of searchParts(nodes.map((node) => node.data).join(""), keyword)) {
    if (part.match) ranges.push({ start: offset, end: offset + part.text.length });
    offset += part.text.length;
  }
  offset = 0;
  for (const node of nodes) {
    const end = offset + node.length;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const range of ranges) {
      if (range.end <= offset || range.start >= end) continue;
      const start = Math.max(0, range.start - offset);
      const stop = Math.min(node.length, range.end - offset);
      fragment.append(document.createTextNode(node.data.slice(cursor, start)));
      const mark = document.createElement("mark");
      mark.textContent = node.data.slice(start, stop);
      fragment.append(mark);
      cursor = stop;
    }
    fragment.append(document.createTextNode(node.data.slice(cursor)));
    node.replaceWith(fragment);
    offset = end;
  }
  return template.innerHTML;
}
