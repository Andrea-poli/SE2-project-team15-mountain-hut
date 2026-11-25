// MH-10 FE1 – the menu format (openapi.yaml, info "Menus"): a small Markdown subset, stored as plain text.
//   **bold**, *italic*, a line starting with "- " is a list item, a line starting with "  - " (two spaces before)
//   is a sub-item of the item above; any other line is text, and an empty line starts a new paragraph.
// Nothing else is interpreted. parseMenu only splits the text into blocks of plain strings: MenuText renders them
// as React elements, never as HTML, so "<b>" or "<script>" in a menu is shown as it was written.
// The editing helpers (wrapSelection, prefixLines) are pure: the menu editor applies their result to the textarea.

export const MENU_MAX_LENGTH = 2000; // team choice, same limit as the server (PUT /api/slots/{id}/menu)

const ITEM = '- ';
const SUB_ITEM = '  - ';

// In order: bold and italic together ("***x***"), bold ("**x**", italic allowed inside), italic ("*x*", no other
// "*" inside). The text inside the marks must not start or end with a space, so "2 * 3 * 4" stays as it is.
const INLINE_RE = /\*\*\*([^*\s](?:[^*]*[^*\s])?)\*\*\*|\*\*(\S(?:.*?\S)?)\*\*|\*([^*\s](?:[^*]*[^*\s])?)\*/g;

/**
 * "Polenta **with** *mushrooms*" → [{ text: 'Polenta ', bold: false, italic: false },
 *   { text: 'with', bold: true, italic: false }, { text: ' ', ... }, { text: 'mushrooms', bold: false, italic: true }]
 * Marks without their closing pair stay in the text.
 */
export function parseInline(line, bold = false, italic = false) {
  const parts = [];
  const push = (text) => {
    if (text) parts.push({ text, bold, italic });
  };
  let last = 0;
  for (const match of line.matchAll(INLINE_RE)) {
    push(line.slice(last, match.index));
    const [, both, boldText, italicText] = match;
    if (both !== undefined) parts.push({ text: both, bold: true, italic: true });
    else if (boldText !== undefined) parts.push(...parseInline(boldText, true, italic));
    else parts.push({ text: italicText, bold, italic: true });
    last = match.index + match[0].length;
  }
  push(line.slice(last));
  return parts;
}

/**
 * Splits a menu into blocks, in order:
 *   { type: 'paragraph', lines: Inline[][] }               consecutive text lines (shown with line breaks)
 *   { type: 'list', items: [{ content: Inline[], subItems: Inline[][] }] }
 * A sub-item with no item above becomes an item. null, undefined or an empty text give no blocks.
 */
export function parseMenu(text) {
  const blocks = [];
  let current = null; // the block the next line can join
  for (const rawLine of (text ?? '').split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.trim() === '') {
      current = null;
    } else if (line.startsWith(SUB_ITEM) && current?.type === 'list') {
      current.items.at(-1).subItems.push(parseInline(line.slice(SUB_ITEM.length)));
    } else if (line.startsWith(ITEM) || line.startsWith(SUB_ITEM)) {
      const content = parseInline(line.slice(line.indexOf(ITEM) + ITEM.length));
      if (current?.type !== 'list') {
        current = { type: 'list', items: [] };
        blocks.push(current);
      }
      current.items.push({ content, subItems: [] });
    } else {
      if (current?.type !== 'paragraph') {
        current = { type: 'paragraph', lines: [] };
        blocks.push(current);
      }
      current.lines.push(parseInline(line));
    }
  }
  return blocks;
}

/**
 * Toolbar "Bold" / "Italic": puts `mark` ("**" or "*") around the selected text, or removes it when the selection
 * is already wrapped. With nothing selected the marks are inserted and the caret goes between them.
 * @returns {{ value: string, start: number, end: number }} the new text and the new selection
 */
export function wrapSelection(value, start, end, mark) {
  const before = value.slice(0, start);
  const selected = value.slice(start, end);
  const after = value.slice(end);
  const size = mark.length;
  if (selected.length > 2 * size && selected.startsWith(mark) && selected.endsWith(mark)) {
    const inner = selected.slice(size, -size);
    return { value: before + inner + after, start, end: start + inner.length };
  }
  if (before.endsWith(mark) && after.startsWith(mark) && selected.length > 0) {
    return { value: before.slice(0, -size) + selected + after.slice(size), start: start - size, end: end - size };
  }
  return { value: before + mark + selected + mark + after, start: start + size, end: end + size };
}

/**
 * Toolbar "List item" / "Sub-item": turns every line touched by the selection into an item ("- ") or a sub-item
 * ("  - "), replacing the other marker if the line had one. The whole lines stay selected.
 * @param {'item' | 'subItem'} kind
 * @returns {{ value: string, start: number, end: number }}
 */
export function prefixLines(value, start, end, kind) {
  const prefix = kind === 'subItem' ? SUB_ITEM : ITEM;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const nextBreak = value.indexOf('\n', Math.max(end - (end > start ? 1 : 0), start));
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const lines = value
    .slice(lineStart, lineEnd)
    .split('\n')
    .map((line) => {
      let content = line;
      if (content.startsWith(SUB_ITEM)) content = content.slice(SUB_ITEM.length);
      else if (content.startsWith(ITEM)) content = content.slice(ITEM.length);
      return prefix + content;
    })
    .join('\n');
  return { value: value.slice(0, lineStart) + lines + value.slice(lineEnd), start: lineStart, end: lineStart + lines.length };
}
