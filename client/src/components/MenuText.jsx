// MH-10 FE1 – safe renderer of a menu (utils/menuFormat.js): paragraphs, lists with sub-items, bold and italic.
// Shared by the menu editor preview (MH-10) and the meals page (MH-11). Every piece of text is a React text node,
// never HTML (no dangerouslySetInnerHTML), so a menu with "<b>" or "<script>" shows exactly those characters.
import { Fragment } from 'react';
import { parseMenu } from '../utils/menuFormat.js';
import './MenuText.css';

function Inline({ parts }) {
  return parts.map((part, index) => {
    let content = part.text;
    if (part.italic) content = <em>{content}</em>;
    if (part.bold) content = <strong>{content}</strong>;
    return <Fragment key={index}>{content}</Fragment>;
  });
}

/** Renders `menu` (a text, or null / empty: nothing is rendered). Extra props (e.g. className, id) go to the div. */
export default function MenuText({ menu, className = '', ...props }) {
  const blocks = parseMenu(menu);
  if (blocks.length === 0) return null;
  return (
    <div className={`mh-menu ${className}`.trim()} {...props}>
      {blocks.map((block, index) =>
        block.type === 'paragraph' ? (
          <p key={index}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                <Inline parts={line} />
              </Fragment>
            ))}
          </p>
        ) : (
          <ul key={index}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <Inline parts={item.content} />
                {item.subItems.length > 0 && (
                  <ul>
                    {item.subItems.map((subItem, subIndex) => (
                      <li key={subIndex}>
                        <Inline parts={subItem} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
