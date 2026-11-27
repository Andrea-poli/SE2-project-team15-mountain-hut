// MH-10 FT1 – utils/menuFormat.js (task MH-10 FE1), from docs/openapi.yaml (info "Menus": **bold**, *italic*,
// "- " item, "  - " sub-item, empty line = new paragraph, nothing else interpreted) and the editor toolbar.
//  parseInline: bold, italic, both (***x***), italic inside bold, bold inside italic; marks without their pair and
//  "2 * 3 * 4" stay text.
//  parseMenu: paragraphs of several lines, empty line = new block, items and sub-items, a sub-item with no item
//  above becomes an item, CRLF, null / undefined / '' give no blocks.
//  wrapSelection: adds the marks (the selection then includes them, so pressing again removes them), removes them
//  (inside or just outside the selection), empty selection; Bold and Italic combine; with nothing selected, right
//  before the closing marks the caret goes past them; on several lines each line gets its marks, after the item marker.
//  prefixLines: item / sub-item on one or several lines, the other marker switched, the same marker removed (toggle);
//  a sub-item needs an item above, so with none the first line becomes an item; no selection = current line, with
//  the caret kept on the same character; with a selection the whole lines stay selected; a first empty line.
// Where the place of the selection is a free choice, the tests check the text and what pressing again does.
import { describe, expect, it } from 'vitest';
import { MENU_MAX_LENGTH, parseInline, parseMenu, prefixLines, wrapSelection } from '../../../src/utils/menuFormat.js';

const plain = (text) => ({ text, bold: false, italic: false });
const bold = (text) => ({ text, bold: true, italic: false });
const italic = (text) => ({ text, bold: false, italic: true });
const both = (text) => ({ text, bold: true, italic: true });

describe('MENU_MAX_LENGTH', () => {
  it('is 2000, the limit of PUT /api/slots/{id}/menu', () => {
    expect(MENU_MAX_LENGTH).toBe(2000);
  });
});

describe('parseInline', () => {
  it('plain text is one plain part; an empty line has no parts', () => {
    expect(parseInline('Barley soup')).toEqual([plain('Barley soup')]);
    expect(parseInline('')).toEqual([]);
  });

  it('**bold** and *italic*, with the text around them', () => {
    expect(parseInline('Polenta **with** *mushrooms*')).toEqual([
      plain('Polenta '),
      bold('with'),
      plain(' '),
      italic('mushrooms'),
    ]);
  });

  it('***x*** is bold and italic together', () => {
    expect(parseInline('***Chef special***')).toEqual([both('Chef special')]);
  });

  it('italic inside bold', () => {
    expect(parseInline('**Stew *of the day* here**')).toEqual([bold('Stew '), both('of the day'), bold(' here')]);
  });

  it('bold inside italic', () => {
    expect(parseInline('*Polenta **with** mushrooms*')).toEqual([
      italic('Polenta '),
      both('with'),
      italic(' mushrooms'),
    ]);
  });

  it.each(['**Polenta', 'Polenta**', '*Polenta', 'Polenta*', '**', '*'])(
    'a mark without its closing pair stays as text: %s',
    (line) => {
      expect(parseInline(line)).toEqual([plain(line)]);
    },
  );

  it('"2 * 3 * 4" stays as it is (no space right inside the marks)', () => {
    expect(parseInline('2 * 3 * 4')).toEqual([plain('2 * 3 * 4')]);
    expect(parseInline('a ** b ** c')).toEqual([plain('a ** b ** c')]);
  });
});

describe('parseMenu', () => {
  it.each([null, undefined, ''])('%s gives no blocks', (text) => {
    expect(parseMenu(text)).toEqual([]);
  });

  it('consecutive text lines are one paragraph, line by line', () => {
    expect(parseMenu('Tonight:\n**Polenta**')).toEqual([
      { type: 'paragraph', lines: [[plain('Tonight:')], [bold('Polenta')]] },
    ]);
  });

  it('an empty line (also one with only spaces) starts a new block', () => {
    expect(parseMenu('Lunch\n\nDinner\n   \nLater')).toEqual([
      { type: 'paragraph', lines: [[plain('Lunch')]] },
      { type: 'paragraph', lines: [[plain('Dinner')]] },
      { type: 'paragraph', lines: [[plain('Later')]] },
    ]);
    expect(parseMenu('- Soup\n\n- Tart')).toEqual([
      { type: 'list', items: [{ content: [plain('Soup')], subItems: [] }] },
      { type: 'list', items: [{ content: [plain('Tart')], subItems: [] }] },
    ]);
  });

  it('"- " lines are items, "  - " lines are sub-items of the item above; text before is a paragraph', () => {
    expect(parseMenu('Tonight:\n- Soup\n  - *vegetarian*\n  - vegan\n- Tart')).toEqual([
      { type: 'paragraph', lines: [[plain('Tonight:')]] },
      {
        type: 'list',
        items: [
          { content: [plain('Soup')], subItems: [[italic('vegetarian')], [plain('vegan')]] },
          { content: [plain('Tart')], subItems: [] },
        ],
      },
    ]);
  });

  it('a text line after a list starts a new paragraph', () => {
    expect(parseMenu('- Soup\nCoffee included')).toEqual([
      { type: 'list', items: [{ content: [plain('Soup')], subItems: [] }] },
      { type: 'paragraph', lines: [[plain('Coffee included')]] },
    ]);
  });

  it('a sub-item with no item above becomes an item', () => {
    // "  - Soup" opens the list as an item; "  - Tart" then has an item above, so it is its sub-item.
    expect(parseMenu('  - Soup\n  - Tart')).toEqual([
      { type: 'list', items: [{ content: [plain('Soup')], subItems: [[plain('Tart')]] }] },
    ]);
    expect(parseMenu('Tonight:\n  - Soup')).toEqual([
      { type: 'paragraph', lines: [[plain('Tonight:')]] },
      { type: 'list', items: [{ content: [plain('Soup')], subItems: [] }] },
    ]);
  });

  it('CRLF line ends work like LF; spaces at the end of a line are dropped', () => {
    expect(parseMenu('Tonight:  \r\n- Soup\r\n  - vegan\r\n\r\nEnd')).toEqual([
      { type: 'paragraph', lines: [[plain('Tonight:')]] },
      { type: 'list', items: [{ content: [plain('Soup')], subItems: [[plain('vegan')]] }] },
      { type: 'paragraph', lines: [[plain('End')]] },
    ]);
  });
});

/** Presses the same button again on the text and selection a toolbar change gave back. */
const wrapAgain = (result, mark) => wrapSelection(result.value, result.start, result.end, mark);
const selectedText = (result) => result.value.slice(result.start, result.end);

describe('wrapSelection', () => {
  it('puts the marks around the selection; the selection then includes the marks', () => {
    const bolded = wrapSelection('a bold b', 2, 6, '**');
    expect(bolded.value).toBe('a **bold** b');
    expect(selectedText(bolded)).toBe('**bold**');
    const italicized = wrapSelection('a word b', 2, 6, '*');
    expect(italicized.value).toBe('a *word* b');
    expect(selectedText(italicized)).toBe('*word*');
  });

  it.each([['Bold', '**'], ['Italic', '*']])('%s pressed again on the same selection gives back the text', (_name, mark) => {
    const once = wrapSelection('a word b', 2, 6, mark);
    const twice = wrapAgain(once, mark);
    expect(twice.value).toBe('a word b');
    expect(selectedText(twice)).toBe('word');
  });

  it('spaces selected at the ends stay outside the marks', () => {
    expect(wrapSelection('a bold b', 1, 7, '**').value).toBe('a **bold** b');
  });

  it('removes the marks when the selection includes them', () => {
    expect(wrapSelection('a **bold** b', 2, 10, '**')).toEqual({ value: 'a bold b', start: 2, end: 6 });
    expect(wrapSelection('a *word* b', 2, 8, '*')).toEqual({ value: 'a word b', start: 2, end: 6 });
  });

  it('removes the marks when they are just outside the selection', () => {
    expect(wrapSelection('a **bold** b', 4, 8, '**')).toEqual({ value: 'a bold b', start: 2, end: 6 });
    expect(wrapSelection('a *word* b', 3, 7, '*')).toEqual({ value: 'a word b', start: 2, end: 6 });
  });

  it('with nothing selected inserts the marks with the caret between them', () => {
    expect(wrapSelection('ab', 1, 1, '**')).toEqual({ value: 'a****b', start: 3, end: 3 });
    expect(wrapSelection('', 0, 0, '*')).toEqual({ value: '**', start: 1, end: 1 });
  });

  it('Italic on bold text gives bold and italic; Italic again gives back the bold text', () => {
    const result = wrapSelection('**Polenta**', 2, 9, '*');
    expect(result.value).toBe('***Polenta***');
    expect(wrapAgain(result, '*').value).toBe('**Polenta**');
  });

  it('Italic on the whole bold text, marks included, gives bold and italic', () => {
    expect(wrapSelection('**Polenta**', 0, 11, '*').value).toBe('***Polenta***');
  });

  it('Bold on italic text gives bold and italic; Bold again gives back the italic text', () => {
    const result = wrapSelection('*Polenta*', 1, 8, '**');
    expect(result.value).toBe('***Polenta***');
    expect(wrapAgain(result, '**').value).toBe('*Polenta*');
  });

  it('removing Bold or Italic from bold and italic text keeps the other one', () => {
    expect(wrapSelection('***Polenta***', 3, 10, '**')).toEqual({ value: '*Polenta*', start: 1, end: 8 });
    expect(wrapSelection('***Polenta***', 3, 10, '*')).toEqual({ value: '**Polenta**', start: 2, end: 9 });
  });

  it('with nothing selected, Bold right before the closing marks moves the caret after them', () => {
    expect(wrapSelection('**Polenta**', 9, 9, '**')).toEqual({ value: '**Polenta**', start: 11, end: 11 });
  });

  it('with nothing selected, Italic right before the closing italic mark moves the caret after it', () => {
    expect(wrapSelection('**Polenta *with***', 15, 15, '*')).toEqual({ value: '**Polenta *with***', start: 16, end: 16 });
  });

  it('Bold on several selected lines puts the marks on each line, after the item marker; Bold again removes them', () => {
    const result = wrapSelection('- Soup\n- Stew', 0, 13, '**');
    expect(result.value).toBe('- **Soup**\n- **Stew**');
    expect(wrapAgain(result, '**').value).toBe('- Soup\n- Stew');
  });

  it('Italic on several selected lines puts the marks on each line, after the item marker', () => {
    expect(wrapSelection('- Soup\n- Stew', 0, 13, '*').value).toBe('- *Soup*\n- *Stew*');
  });

  it('on several lines, the first line gets the marks only around its selected part', () => {
    expect(wrapSelection('- Soup\n- Stew', 4, 13, '**').value).toBe('- So**up**\n- **Stew**');
  });

  it('on several lines, spaces at the ends of each line stay outside the marks', () => {
    expect(wrapSelection('Soup \n Stew', 0, 11, '**').value).toBe('**Soup** \n **Stew**');
  });

  it('on several lines, empty lines are left as they are', () => {
    expect(wrapSelection('Soup\n\nStew', 0, 10, '**').value).toBe('**Soup**\n\n**Stew**');
  });

  it('on several lines, when only some lines have the marks, the others get them too', () => {
    expect(wrapSelection('**Soup**\nStew', 0, 13, '**').value).toBe('**Soup**\n**Stew**');
  });

  it('a selection of spaces only works like no selection', () => {
    const result = wrapSelection('a  b', 1, 3, '**');
    expect(result.value).toBe('a****  b');
    expect(result.start).toBe(result.end);
  });

  it('with nothing selected, pressed twice gives back the text (the empty pair goes away)', () => {
    const once = wrapSelection('ab', 1, 1, '**');
    expect(wrapAgain(once, '**')).toEqual({ value: 'ab', start: 1, end: 1 });
    const italicOnce = wrapSelection('ab', 1, 1, '*');
    expect(wrapAgain(italicOnce, '*')).toEqual({ value: 'ab', start: 1, end: 1 });
  });

  it('with nothing selected, after a closed bold text Bold opens a new pair', () => {
    expect(wrapSelection('**a** b', 7, 7, '**')).toEqual({ value: '**a** b****', start: 9, end: 9 });
  });

  it('with nothing selected, between two italic words Italic opens a new pair instead of removing marks', () => {
    expect(wrapSelection('*a**b*', 3, 3, '*')).toEqual({ value: '*a****b*', start: 4, end: 4 });
  });

  it('with nothing selected, a star with spaces around it does not count as an open italic', () => {
    expect(wrapSelection('2 * 3', 5, 5, '*')).toEqual({ value: '2 * 3**', start: 6, end: 6 });
  });

  it('with nothing selected inside bold and italic, Italic then Bold move the caret past their closing marks', () => {
    const afterItalic = wrapSelection('***Polenta***', 10, 10, '*');
    expect(afterItalic).toEqual({ value: '***Polenta***', start: 11, end: 11 });
    expect(wrapSelection(afterItalic.value, 11, 11, '**')).toEqual({ value: '***Polenta***', start: 13, end: 13 });
  });
});

/** The character right after the caret of a prefixLines result with nothing selected. */
const charAtCaret = (result) => {
  expect(result.start).toBe(result.end);
  return result.value[result.start];
};

describe('prefixLines', () => {
  it('no selection: List item marks the line, the caret stays on the same character, after the marker', () => {
    const result = prefixLines('Soup', 2, 2, 'item'); // caret before "u"
    expect(result.value).toBe('- Soup');
    expect(charAtCaret(result)).toBe('u');
  });

  it('no selection: only the line of the caret, the caret on the same character', () => {
    const result = prefixLines('Tonight:\nSoup\nTart', 11, 11, 'item'); // caret before the "u" of "Soup"
    expect(result.value).toBe('Tonight:\n- Soup\nTart');
    expect(charAtCaret(result)).toBe('u');
  });

  it('no selection: switching or removing the marker keeps the caret on the same character', () => {
    const switched = prefixLines('- Soup\n- Veg', 10, 10, 'subItem'); // caret before the "e" of "Veg"
    expect(switched.value).toBe('- Soup\n  - Veg');
    expect(charAtCaret(switched)).toBe('e');

    const removed = prefixLines('- Soup', 3, 3, 'item'); // caret before "o"
    expect(removed.value).toBe('Soup');
    expect(charAtCaret(removed)).toBe('o');
  });

  it('a selected line: the whole line stays selected', () => {
    expect(prefixLines('Soup', 0, 4, 'item')).toEqual({ value: '- Soup', start: 0, end: 6 });
  });

  it('every line touched by the selection, also when it starts or ends inside a line; the whole lines stay selected', () => {
    // "up\nTa" selected: the lines "Soup" and "Tart"
    expect(prefixLines('Tonight:\nSoup\nTart', 11, 16, 'item')).toEqual({
      value: 'Tonight:\n- Soup\n- Tart',
      start: 9,
      end: 22,
    });
  });

  it('a selection that ends at the start of a line does not touch that line', () => {
    expect(prefixLines('Soup\nTart', 0, 5, 'item')).toEqual({ value: '- Soup\nTart', start: 0, end: 6 });
  });

  it('empty lines inside a selection of several lines are left as they are', () => {
    expect(prefixLines('Soup\n\nStew', 0, 10, 'item').value).toBe('- Soup\n\n- Stew');
  });

  it('List item on items and sub-items makes them all items', () => {
    expect(prefixLines('- Soup\n  - vegan', 0, 16, 'item')).toEqual({ value: '- Soup\n- vegan', start: 0, end: 14 });
    expect(prefixLines('  - Veg', 0, 7, 'item').value).toBe('- Veg');
  });

  it('List item on lines that are all items removes the marker', () => {
    expect(prefixLines('- Soup\n- Stew', 0, 13, 'item').value).toBe('Soup\nStew');
  });

  it('List item pressed twice on the same lines gives back the text', () => {
    const once = prefixLines('Soup\nStew', 0, 9, 'item');
    expect(once.value).toBe('- Soup\n- Stew');
    expect(prefixLines(once.value, once.start, once.end, 'item').value).toBe('Soup\nStew');
  });

  it('Sub-item on lines with no item above: the first line becomes an item, the others its sub-items', () => {
    const result = prefixLines('Soup\nTart', 0, 9, 'subItem');
    expect(result).toEqual({ value: '- Soup\n  - Tart', start: 0, end: 15 });
    expect(prefixLines('Tonight:\nSoup\nTart', 9, 18, 'subItem').value).toBe('Tonight:\n- Soup\n  - Tart');
  });

  it('Sub-item on a single sub-item with nothing above makes it an item', () => {
    expect(prefixLines('  - Veg', 0, 7, 'subItem').value).toBe('- Veg');
  });

  it('Sub-item under an item makes the line a sub-item, also when it was an item', () => {
    expect(prefixLines('- Soup\nVeg', 7, 10, 'subItem').value).toBe('- Soup\n  - Veg');
    expect(prefixLines('- Soup\n- Veg', 7, 12, 'subItem').value).toBe('- Soup\n  - Veg');
  });

  it('Sub-item on a sub-item that has an item above removes the marker', () => {
    expect(prefixLines('- Soup\n  - Veg', 7, 14, 'subItem').value).toBe('- Soup\nVeg');
  });

  it('Sub-item on an item with nothing above removes the marker, also with its sub-items selected', () => {
    expect(prefixLines('- Soup', 0, 6, 'subItem').value).toBe('Soup');
    expect(prefixLines('- Soup\n  - vegan', 0, 16, 'subItem').value).toBe('Soup\nvegan');
  });

  it('List item on a text that starts with an empty line marks only that first line', () => {
    expect(prefixLines('\nSoup', 0, 0, 'item').value).toBe('- \nSoup');
  });
});
