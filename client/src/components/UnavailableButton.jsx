// A button that cannot be used now, shown anyway with the reason (MH-10: the menu of a slot that has started).
// It is not `disabled`: a disabled button gets no mouse or focus events, so no tooltip could say why. Instead it is
// aria-disabled (screen readers say "dimmed" / "unavailable"), looks disabled, does nothing when pressed and shows
// the reason in a tooltip on hover or keyboard focus. The reason is also linked with aria-describedby, so a screen
// reader reads it without the tooltip.
import { useId } from 'react';
import Button from 'react-bootstrap/Button';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';
import './UnavailableButton.css';

export default function UnavailableButton({ reason, className = '', children, ...buttonProps }) {
  const id = useId();
  return (
    <>
      <OverlayTrigger placement="top" overlay={<Tooltip id={`${id}-tooltip`}>{reason}</Tooltip>}>
        <Button
          {...buttonProps}
          className={`mh-btn-unavailable ${className}`.trim()}
          aria-disabled="true"
          aria-describedby={`${id}-reason`}
          onClick={(event) => event.preventDefault()}
        >
          {children}
        </Button>
      </OverlayTrigger>
      <span id={`${id}-reason`} className="visually-hidden">
        {reason}
      </span>
    </>
  );
}
