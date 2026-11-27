// MH-10 FE1 – the menu format (openapi.yaml, info "Menus"): a small Markdown subset, stored as plain text.
//   **bold**, *italic*, a line starting with "- " is a list item, a line starting with "  - " (two spaces before)
//   is a sub-item of the item above; any other line is text, and an empty line starts a new paragraph.
// Nothing else is interpreted. parseMenu only splits the text into blocks of plain strings: MenuText renders them
// as React elements, never as HTML, so "<b>" or "<script>" in a menu is shown as it was written.
// The editing helpers (wrapSelection, prefixLines) are pure: the menu editor applies their result to the textarea.

export const MENU_MAX_LENGTH = 2000; // team choice, same limit as the server (PUT /api/slots/{id}/menu)

const ITEM = '- ';
const SUB_ITEM = '  - ';

/** The list marker a line starts with: SUB_ITEM, ITEM or '' (checked before any trimming: "- " is an empty item). */
function markerOf(line) {
  if (line.startsWith(SUB_ITEM)) return SUB_ITEM;
  if (line.startsWith(ITEM)) return ITEM;
  return '';
}

// ---------------------------------------------------------------------------------------------- reading a menu

// The text inside the marks must not start or end with a space, so "2 * 3 * 4" stays as it is.
// Bold may contain italic and italic may contain bold, also at their edges ("***with** mushrooms*").
const ITALIC_CHUNK = String.raw`\*[^*\s](?:[^*]*[^*\s])?\*`;
const BOLD_CHUNK = String.raw`\*\*[^*\s](?:[^*]*[^*\s])?\*\*`;
const INLINE_RE = new RegExp(
  [
    String.raw`\*\*\*([^*\s](?:[^*]*[^*\s])?)\*\*\*`, // bold and italic together: ***x***
    String.raw`\*\*(?!\s)((?:${ITALIC_CHUNK}|[^*])+?)(?<!\s)\*\*`, // bold: **x**
    String.raw`\*(?!\s)((?:${BOLD_CHUNK}|[^*])+?)(?<!\s)\*`, // italic: *x*
  ].join('|'),
  'g',
);

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
    else parts.push(...parseInline(italicText, bold, true));
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
  for (const line of (text ?? '').split(/\r?\n/)) {
    const marker = markerOf(line);
    const content = line.slice(marker.length).trimEnd();
    if (!marker && content.trim() === '') {
      current = null;
    } else if (marker === SUB_ITEM && current?.type === 'list') {
      current.items.at(-1).subItems.push(parseInline(content));
    } else if (marker) {
      if (current?.type !== 'list') {
        current = { type: 'list', items: [] };
        blocks.push(current);
      }
      current.items.push({ content: parseInline(content), subItems: [] });
    } else {
      if (current?.type !== 'paragraph') {
        current = { type: 'paragraph', lines: [] };
        blocks.push(current);
      }
      current.lines.push(parseInline(content));
    }
  }
  return blocks;
}

// ---------------------------------------------------------------------------------------------- toolbar helpers

/** True when a run of `run` stars holds the mark of `size` stars: italic = 1 or 3 stars, bold = 2 or 3. */
function holdsMark(run, size) {
  return size === 1 ? run === 1 || run === 3 : run === 2 || run === 3;
}

const leadingStars = (text) => text.length - text.replace(/^\*+/, '').length;
const trailingStars = (text) => text.length - text.replace(/\*+$/, '').length;

/** True when `text` is wrapped in this mark (e.g. "**a**" or "***a***" for bold, not "**a**" for italic). */
function isWrapped(text, size) {
  const run = Math.min(leadingStars(text), trailingStars(text));
  return text.length > 2 * run && holdsMark(run, size);
}

/**
 * The marks still open at the end of `prefix` (one line, up to the caret), innermost last: 1 = italic, 2 = bold.
 * A run of stars after a non-space closes the open marks it can; otherwise, before a non-space (or at the caret),
 * it opens new ones.
 */
function openMarks(prefix) {
  const stack = [];
  for (const match of prefix.matchAll(/\*+/g)) {
    let run = match[0].length;
    const previous = prefix[match.index - 1];
    const next = prefix[match.index + run];
    if (stack.length > 0 && previous !== undefined && !/\s/.test(previous)) {
      while (stack.length > 0 && run >= stack.at(-1)) run -= stack.pop();
    } else if (next === undefined || !/\s/.test(next)) {
      if (run >= 3) stack.push(2, 1);
      else stack.push(run);
    }
  }
  return stack;
}

/** Bold / Italic with nothing selected: close the open mark, remove an empty pair, or insert a pair. */
function toggleAtCaret(value, caret, mark) {
  const before = value.slice(0, caret);
  const after = value.slice(caret);
  const size = mark.length;
  // Pressed again right after the button: the empty pair goes away (the mark before the caret is an opening one:
  // at the start, after a space or after other marks; "*a*|*b*" is not an empty pair).
  const beforeMark = before.slice(0, -size).at(-1);
  const opening = beforeMark === undefined || beforeMark === '*' || /\s/.test(beforeMark);
  if (before.endsWith(mark) && after.startsWith(mark) && opening) {
    return { value: before.slice(0, -size) + after.slice(size), start: caret - size, end: caret - size };
  }
  // The caret is just before the closing mark of the same type: only move after it.
  const line = before.slice(before.lastIndexOf('\n') + 1);
  if (openMarks(line).at(-1) === size && after.startsWith(mark)) {
    return { value, start: caret + size, end: caret + size };
  }
  return { value: before + mark + mark + after, start: caret + size, end: caret + size };
}

/** Bold / Italic on a selection inside one line: remove the mark when the text has it, otherwise add it. */
function toggleOnSelection(value, start, end, mark) {
  const size = mark.length;
  // The marks go around the text only: spaces selected at the ends stay outside.
  const raw = value.slice(start, end);
  const from = start + (raw.length - raw.trimStart().length);
  const to = end - (raw.length - raw.trimEnd().length);
  if (from >= to) return toggleAtCaret(value, start, mark);
  const selected = value.slice(from, to);
  const before = value.slice(0, from);
  const after = value.slice(to);
  if (isWrapped(selected, size)) {
    const inner = selected.slice(size, -size);
    return { value: before + inner + after, start: from, end: from + inner.length };
  }
  if (holdsMark(Math.min(trailingStars(before), leadingStars(after)), size)) {
    return { value: before.slice(0, -size) + selected + after.slice(size), start: from - size, end: to - size };
  }
  return { value: before + mark + selected + mark + after, start: from, end: to + 2 * size };
}

/** Start of the line holding `index`, and end of the line holding `end` (a selection ending on "\n" stops before). */
function lineRange(value, start, end) {
  const lineStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
  const nextBreak = value.indexOf('\n', end > start ? end - 1 : start);
  return { lineStart, lineEnd: nextBreak === -1 ? value.length : nextBreak };
}

/**
 * Bold / Italic on a selection over several lines: the marks go on each line, after its list marker, around the
 * selected text of that line (empty lines are skipped). If every line already has the mark, it is removed.
 */
function toggleOnLines(value, start, end, mark) {
  const size = mark.length;
  const { lineStart, lineEnd } = lineRange(value, start, end);
  let offset = lineStart;
  const lines = value
    .slice(lineStart, lineEnd)
    .split('\n')
    .map((text) => {
      let from = Math.max(start - offset, 0);
      let to = Math.min(end - offset, text.length);
      if (from === 0) from = markerOf(text).length;
      while (from < to && /\s/.test(text[from])) from += 1;
      while (to > from && /\s/.test(text[to - 1])) to -= 1;
      offset += text.length + 1;
      return { text, from, to, wrapped: from < to && isWrapped(text.slice(from, to), size) };
    });
  const selected = lines.filter((line) => line.from < line.to);
  const unwrap = selected.length > 0 && selected.every((line) => line.wrapped);
  const changed = lines
    .map(({ text, from, to, wrapped }) => {
      if (from >= to) return text;
      const part = text.slice(from, to);
      if (unwrap) return text.slice(0, from) + part.slice(size, -size) + text.slice(to);
      if (wrapped) return text;
      return text.slice(0, from) + mark + part + mark + text.slice(to);
    })
    .join('\n');
  const delta = changed.length - (lineEnd - lineStart);
  return { value: value.slice(0, lineStart) + changed + value.slice(lineEnd), start, end: end + delta };
}

/**
 * Toolbar "Bold" / "Italic" (mark "**" or "*"), as a toggle:
 * - nothing selected: inserts a pair of marks with the caret between them; pressed again just before the closing
 *   mark of the same type, it only moves the caret after it (so typing goes on outside); on an empty pair it
 *   removes the pair;
 * - a selection in one line: adds the marks around it, or removes them when the text has them (italic on bold text
 *   adds italic: "***x***");
 * - a selection over several lines: the same on each line, after the list marker.
 * @returns {{ value: string, start: number, end: number }} the new text and the new selection
 */
export function wrapSelection(value, start, end, mark) {
  if (start === end) return toggleAtCaret(value, start, mark);
  if (value.slice(start, end).includes('\n')) return toggleOnLines(value, start, end, mark);
  return toggleOnSelection(value, start, end, mark);
}

/**
 * Toolbar "List item" / "Sub-item", as a toggle: every line touched by the selection becomes an item ("- ") or a
 * sub-item ("  - "), replacing the other marker if it had one. A sub-item needs an item above: when the line above
 * the selection is not part of a list, the first line becomes an item. If the lines are already like that, the
 * markers are removed. Empty lines in a selection of several lines are left as they are.
 * With nothing selected the caret stays in its place in the text; otherwise the whole lines stay selected.
 * @param {'item' | 'subItem'} kind
 * @returns {{ value: string, start: number, end: number }}
 */
export function prefixLines(value, start, end, kind) {
  const { lineStart, lineEnd } = lineRange(value, start, end);
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const skip = (line) => lines.length > 1 && line.trim() === '';
  const lineAbove = lineStart === 0 ? '' : value.slice(value.lastIndexOf('\n', lineStart - 2) + 1, lineStart - 1);
  let needsItem = kind === 'subItem' && !markerOf(lineAbove);
  const target = lines.map((line) => {
    if (skip(line)) return line;
    const content = line.slice(markerOf(line).length);
    let prefix = kind === 'subItem' ? SUB_ITEM : ITEM;
    if (needsItem) {
      prefix = ITEM;
      needsItem = false;
    }
    return prefix + content;
  });
  const remove = lines.every((line, index) => skip(line) || line === target[index]);
  const changed = (remove ? lines.map((line) => line.slice(markerOf(line).length)) : target).join('\n');
  const result = value.slice(0, lineStart) + changed + value.slice(lineEnd);
  if (start === end) {
    // Keep the caret on the same character of the line, never inside the new marker.
    const oldLine = lines[0];
    const newLine = changed;
    const column = Math.max(start - lineStart - markerOf(oldLine).length, 0);
    const caret = lineStart + Math.min(markerOf(newLine).length + column, newLine.length);
    return { value: result, start: caret, end: caret };
  }
  return { value: result, start: lineStart, end: lineStart + changed.length };
}
