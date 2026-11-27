// MH-10 FT1 – MenuText, the safe renderer of a menu (task MH-10 FE1): bold, italic, lists with sub-items, line
// breaks; HTML in a menu is shown as text, never interpreted; nothing for an empty menu; extra props on the div.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MenuText from '../../../src/components/MenuText.jsx';

describe('MenuText', () => {
  it('bold is <strong>, italic is <em>, bold and italic both', () => {
    render(<MenuText menu={'**Polenta** with *mushrooms* and ***cream***'} />);
    expect(screen.getByText('Polenta').tagName).toBe('STRONG');
    expect(screen.getByText('mushrooms').tagName).toBe('EM');
    const cream = screen.getByText('cream');
    expect(cream.tagName).toBe('EM');
    expect(cream.parentElement.tagName).toBe('STRONG');
  });

  it('items are a list, sub-items a list inside their item', () => {
    render(<MenuText menu={'Tonight:\n- Soup\n  - vegetarian\n  - vegan\n- Tart'} />);
    expect(screen.getByText('Tonight:')).toBeInTheDocument();
    const [outer, inner] = screen.getAllByRole('list');
    const items = within(outer).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(/^Soupvegetarianvegan$/);
    expect(items[0]).toContainElement(inner);
    expect(within(inner).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['vegetarian', 'vegan']);
    expect(items.at(-1)).toHaveTextContent('Tart');
    expect(items.filter((li) => !inner.contains(li))).toHaveLength(2); // Soup and Tart
  });

  it('lines of a paragraph keep their line breaks', () => {
    render(<MenuText menu={'Soup\nTart'} />);
    const paragraph = screen.getByText(/Soup/);
    expect(paragraph).toHaveTextContent('SoupTart');
    expect(paragraph.querySelectorAll('br')).toHaveLength(1);
  });

  it.each(['<b>x</b>', '<script>alert(1)</script>'])('HTML is shown as written, never interpreted: %s', (menu) => {
    const { container } = render(<MenuText menu={menu} />);
    expect(screen.getByText(menu)).toBeInTheDocument();
    expect(container.querySelector('b, script')).toBeNull();
  });

  it.each([null, '', '   \n  '])('renders nothing for %j', (menu) => {
    const { container } = render(<MenuText menu={menu} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('className and the other props reach the div', () => {
    const { container } = render(<MenuText menu="Soup" className="small" id="slot-menu" aria-label="Menu of the day" />);
    const div = container.firstChild;
    expect(div).toHaveClass('small');
    expect(div).toHaveAttribute('id', 'slot-menu');
    expect(div).toHaveAttribute('aria-label', 'Menu of the day');
  });
});
