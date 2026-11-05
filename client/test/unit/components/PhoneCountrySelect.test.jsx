// The country part of the phone field (U8), on its own: the native <select> named "Country" with its
// options, the flag and the calling code shown next to it, and what it reports when the choice changes.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PhoneCountrySelect from '../../../src/components/PhoneCountrySelect.jsx';

const Flag = ({ country, label }) => <span data-testid="flag">{`${country} ${label}`}</span>;
const OPTIONS = [
  { value: undefined, label: 'International' },
  { value: 'IT', label: 'Italy' },
  { divider: true, label: '──────' },
  { value: 'CH', label: 'Switzerland' },
];

function renderSelect(props = {}) {
  const onChange = vi.fn();
  render(
    <PhoneCountrySelect aria-label="Country" options={OPTIONS} iconComponent={Flag} onChange={onChange} {...props} />,
  );
  return { select: screen.getByRole('combobox', { name: 'Country' }), onChange };
}

describe('PhoneCountrySelect', () => {
  it('shows the flag and the calling code of the chosen country', () => {
    const { select } = renderSelect({ value: 'IT' });
    expect(select).toHaveValue('IT');
    expect(screen.getByTestId('flag')).toHaveTextContent('IT Italy');
    expect(screen.getByText('+39')).toBeInTheDocument();
  });

  it('lists every option, the divider disabled, the option without a country as ""', () => {
    const { select } = renderSelect({ value: 'IT' });
    const options = Array.from(select.options);
    expect(options.map((o) => [o.value, o.textContent, o.disabled])).toEqual([
      ['', 'International', false],
      ['IT', 'Italy', false],
      ['|', '──────', true],
      ['CH', 'Switzerland', false],
    ]);
  });

  it('with the option without a country: its icon, but no calling code', () => {
    const { select } = renderSelect({ value: undefined });
    expect(select).toHaveValue('');
    expect(screen.getByTestId('flag')).toHaveTextContent('International');
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });

  it('shows no icon when the value is not one of the options', () => {
    renderSelect({ value: undefined, options: OPTIONS.slice(1) });
    expect(screen.queryByTestId('flag')).not.toBeInTheDocument();
  });

  it('reports the new country, or undefined for the option without a country', () => {
    const { select, onChange } = renderSelect({ value: 'IT' });
    fireEvent.change(select, { target: { value: 'CH' } });
    expect(onChange).toHaveBeenLastCalledWith('CH');
    fireEvent.change(select, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('is disabled when the field is disabled or read only', () => {
    const { select } = renderSelect({ value: 'IT', readOnly: true });
    expect(select).toBeDisabled();
  });
});
