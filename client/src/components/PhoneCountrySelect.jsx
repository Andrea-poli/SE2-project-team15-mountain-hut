// Country part of the phone field (countrySelectComponent of react-phone-number-input):
// flag + calling code + arrow, with the library's native <select> on top of them (invisible,
// same classes and CSS as the library), so keyboard and screen readers get a plain <select>
// named "Country" whose options read "Italy +39". Flag, code and arrow are decoration only.
// Same logic as the library's CountrySelectWithIcon, which is not exported.
import { getCountryCallingCode } from 'libphonenumber-js';

export default function PhoneCountrySelect({
  value,
  onChange,
  options,
  iconComponent: Icon,
  disabled,
  readOnly,
  // Library props this component does not use (kept out of the <select>).
  getIconAspectRatio: _getIconAspectRatio,
  arrowComponent: _arrowComponent,
  unicodeFlags: _unicodeFlags,
  ...selectProps
}) {
  const selected = options.find((option) => !option.divider && option.value === value);

  return (
    <div className="PhoneInputCountry">
      <select
        {...selectProps}
        className="PhoneInputCountrySelect"
        value={value ?? ''}
        disabled={disabled || readOnly}
        onChange={(event) => onChange(event.target.value || undefined)}
      >
        {options.map((option) =>
          option.divider ? (
            <option key="|" value="|" disabled>
              {option.label}
            </option>
          ) : (
            <option key={option.value ?? ''} value={option.value ?? ''}>
              {option.label}
            </option>
          ),
        )}
      </select>
      {selected && <Icon aria-hidden="true" country={value} label={selected.label} />}
      {value && (
        <span className="mh-phone-prefix" aria-hidden="true">
          +{getCountryCallingCode(value)}
        </span>
      )}
      <div className="PhoneInputCountrySelectArrow" aria-hidden="true" />
    </div>
  );
}
