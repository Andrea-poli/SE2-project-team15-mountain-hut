// MH-10 FT1 – utils/menuFormat.js (task MH-10 FE1), from docs/openapi.yaml (info "Menus": **bold**, *italic*,
// "- " item, "  - " sub-item, empty line = new paragraph, nothing else interpreted) and the editor toolbar.
//  parseInline: bold, italic, both (***x***), italic inside bold, bold inside italic; marks without their pair and
//  "2 * 3 * 4" stay text.
//  parseMenu: paragraphs of several lines, empty line = new block, items and sub-items, a sub-item with no item
//  above becomes an item, CRLF, null / undefined / '' give no blocks.
//  wrapSelection: adds the marks, removes them (inside or just outside the selection), empty selection; Bold and
//  Italic combine; with nothing selected, right before the closing marks the caret goes past them; on several lines
//  each line gets its marks, after the item marker.
//  prefixLines: item / sub-item on one or several lines, the other marker switched, the same marker removed, no
//  selection = current line, a first empty line.
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

describe('wrapSelection', () => {
  it('puts the marks around the selection, which stays on the same text', () => {
    expect(wrapSelection('a bold b', 2, 6, '**')).toEqual({ value: 'a **bold** b', start: 4, end: 8 });
    expect(wrapSelection('a word b', 2, 6, '*')).toEqual({ value: 'a *word* b', start: 3, end: 7 });
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

  it('Italic on bold text gives bold and italic, with the selection still on the text', () => {
    expect(wrapSelection('**Polenta**', 2, 9, '*')).toEqual({ value: '***Polenta***', start: 3, end: 10 });
  });

  it('Italic on the whole bold text, marks included, gives bold and italic', () => {
    expect(wrapSelection('**Polenta**', 0, 11, '*')).toMatchObject({ value: '***Polenta***' });
  });

  it('Bold on italic text gives bold and italic, with the selection still on the text', () => {
    expect(wrapSelection('*Polenta*', 1, 8, '**')).toEqual({ value: '***Polenta***', start: 3, end: 10 });
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

  it('Bold on several selected lines puts the marks on each line, after the item marker', () => {
    expect(wrapSelection('- Soup\n- Stew', 0, 13, '**')).toMatchObject({ value: '- **Soup**\n- **Stew**' });
  });

  it('Italic on several selected lines puts the marks on each line, after the item marker', () => {
    expect(wrapSelection('- Soup\n- Stew', 0, 13, '*')).toMatchObject({ value: '- *Soup*\n- *Stew*' });
  });
});

describe('prefixLines', () => {
  it('one line: item or sub-item, the whole line selected', () => {
    expect(prefixLines('Soup', 2, 2, 'item')).toEqual({ value: '- Soup', start: 0, end: 6 });
    expect(prefixLines('Soup', 0, 4, 'subItem')).toEqual({ value: '  - Soup', start: 0, end: 8 });
  });

  it('no selection: the line of the caret only', () => {
    expect(prefixLines('Tonight:\nSoup\nTart', 11, 11, 'item')).toEqual({
      value: 'Tonight:\n- Soup\nTart',
      start: 9,
      end: 15,
    });
  });

  it('every line touched by the selection, also when it starts or ends inside a line', () => {
    // "up\nTa" selected: the lines "Soup" and "Tart"
    expect(prefixLines('Tonight:\nSoup\nTart', 11, 16, 'item')).toEqual({
      value: 'Tonight:\n- Soup\n- Tart',
      start: 9,
      end: 22,
    });
    expect(prefixLines('Soup\nTart', 0, 9, 'subItem')).toEqual({ value: '  - Soup\n  - Tart', start: 0, end: 17 });
  });

  it('a selection that ends at the start of a line does not touch that line', () => {
    expect(prefixLines('Soup\nTart', 0, 5, 'item')).toEqual({ value: '- Soup\nTart', start: 0, end: 6 });
  });

  it('replaces the other marker instead of adding a second one', () => {
    expect(prefixLines('- Soup\n  - vegan', 0, 16, 'subItem')).toEqual({
      value: '  - Soup\n  - vegan',
      start: 0,
      end: 18,
    });
    expect(prefixLines('- Soup\n  - vegan', 0, 16, 'item')).toEqual({ value: '- Soup\n- vegan', start: 0, end: 14 });
  });

  it('a line with the other marker is switched: List item on a sub-item, Sub-item on an item', () => {
    expect(prefixLines('  - Veg', 0, 7, 'item')).toMatchObject({ value: '- Veg' });
    expect(prefixLines('- Soup', 0, 6, 'subItem')).toMatchObject({ value: '  - Soup' });
  });

  it('List item on lines that are all items removes the marker', () => {
    expect(prefixLines('- Soup\n- Stew', 0, 13, 'item')).toMatchObject({ value: 'Soup\nStew' });
  });

  it('Sub-item on lines that are all sub-items removes the marker', () => {
    expect(prefixLines('  - Veg', 0, 7, 'subItem')).toMatchObject({ value: 'Veg' });
  });

  it('List item on a text that starts with an empty line marks only that first line', () => {
    expect(prefixLines('\nSoup', 0, 0, 'item')).toMatchObject({ value: '- \nSoup' });
  });
});
