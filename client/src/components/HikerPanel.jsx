// MH-07 FE1 – who a staff booking is for: an existing hiker (search by name, email or phone), a new hiker
// (full details: a regular profile who can later log in), or a quick entry (a temporary hiker: first name
// and optional phone). Controlled like the SlotPicker: the parent owns the value and the submit button;
// validation and the request body are in utils/hikerPanel.js.
//
//   const [hiker, setHiker] = useState(EMPTY_HIKER);
//   <HikerPanel idPrefix="staff-book" value={hiker} onChange={setHiker} errors={errors} onBlurField={…} />
import { useEffect, useState } from 'react';
import Form from 'react-bootstrap/Form';
import PhoneInput from 'react-phone-number-input';
import flags from 'react-phone-number-input/flags';
import { searchHikers } from '../api/staff.js';
import { hikerPanelFieldIds, hikerSummaryText } from '../utils/hikerPanel.js';
import { countryLabels, examplePhone } from '../utils/phone.js';
import { MAX_LENGTH } from '../utils/validation.js';
import ErrorMessage from './ErrorMessage.jsx';
import FormField from './FormField.jsx';
import Loading from './Loading.jsx';
import PhoneCountrySelect from './PhoneCountrySelect.jsx';

const MIN_QUERY = 2;
const DEBOUNCE_MS = 300;
const DEFAULT_PHONE_COUNTRY = 'IT';
const MODES = [
  { mode: 'existing', label: 'Existing hiker' },
  { mode: 'new', label: 'New hiker' },
  { mode: 'quick', label: 'Quick entry' },
];

/** Hikers matching `query` (after a pause in typing): short | loading | done with { hikers, error }. */
function useHikerSearch(query) {
  const [result, setResult] = useState(null);
  const q = query.trim();

  useEffect(() => {
    if (q.length < MIN_QUERY) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchHikers(q).then(
        (hikers) => !cancelled && setResult({ query: q, hikers, error: null }),
        (err) => !cancelled && setResult({ query: q, hikers: [], error: err.message }),
      );
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  if (q.length < MIN_QUERY) return { state: 'short' };
  return result?.query === q ? { state: 'done', ...result } : { state: 'loading' };
}

/** A mobile number field as on the registration page: E.164 value, country menu with its calling code. */
function PhoneField({ id, label, help, value, onChange, onBlur, error, required }) {
  const [country, setCountry] = useState(DEFAULT_PHONE_COUNTRY);
  return (
    <FormField
      id={id}
      as={PhoneInput}
      label={label}
      help={help}
      defaultCountry={DEFAULT_PHONE_COUNTRY}
      addInternationalOption={false}
      labels={countryLabels}
      flags={flags}
      countrySelectComponent={PhoneCountrySelect}
      countrySelectProps={{ 'aria-label': 'Country' }}
      onCountryChange={setCountry}
      placeholder={examplePhone(country)}
      initialValueFormat="national"
      focusInputOnCountrySelection={false}
      autoComplete="off"
      value={value || undefined}
      onChange={(phone) => onChange(phone ?? '')}
      onBlur={onBlur}
      required={required}
      error={error}
    />
  );
}

function SearchMode({ idPrefix, ids, value, onChange, errors, onBlurField }) {
  const [query, setQuery] = useState('');
  const search = useHikerSearch(query);
  const found = search.state === 'done' && !search.error ? search.hikers.length : null;
  const statusText = found === null ? '' : `${found || 'No'} hiker${found === 1 ? '' : 's'} found`;

  return (
    <>
      <FormField
        id={ids.hikerId}
        label="Search"
        help="Name, email or phone, at least 2 characters."
        type="search"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => onBlurField?.('hikerId')}
        error={errors.hikerId}
      />
      {search.state === 'loading' && <Loading />}
      <ErrorMessage message={search.error} />
      <p role="status" className="small mb-2">
        {statusText}
      </p>
      {search.state === 'done' && search.hikers.length > 0 && (
        <fieldset className="mb-3">
          <legend className="visually-hidden">Search results</legend>
          {search.hikers.map((hiker) => (
            <Form.Check
              key={hiker.id}
              type="radio"
              id={`${idPrefix}-hiker-${hiker.id}`}
              name={`${idPrefix}-hiker`}
              label={hikerSummaryText(hiker)}
              checked={value.hikerId === hiker.id}
              onChange={() => onChange({ ...value, hikerId: hiker.id, chosen: hiker })}
              className="mb-2"
            />
          ))}
        </fieldset>
      )}
      {value.chosen && (
        <p className="mb-3">
          Booking for: <strong>{hikerSummaryText(value.chosen)}</strong>
        </p>
      )}
    </>
  );
}

function NewHikerMode({ ids, value, onChange, errors, onBlurField }) {
  const v = value.newHiker;
  const set = (field) => (input) =>
    onChange({ ...value, newHiker: { ...v, [field]: typeof input === 'string' ? input : input.target.value } });
  const blur = (field) => () => onBlurField?.(field);
  return (
    <>
      <p className="small">
        A hiker profile is created; the system generates a password, shown once after the booking, for you to give
        to the hiker.
      </p>
      <FormField id={ids.firstName} label="First name" autoComplete="off" value={v.firstName}
        onChange={set('firstName')} onBlur={blur('firstName')} required error={errors.firstName} />
      <FormField id={ids.lastName} label="Last name" autoComplete="off" value={v.lastName}
        onChange={set('lastName')} onBlur={blur('lastName')} required error={errors.lastName} />
      <FormField id={ids.email} label="Email" type="email" autoComplete="off" value={v.email}
        onChange={set('email')} onBlur={blur('email')} required error={errors.email} />
      <PhoneField id={ids.phone} label="Mobile number" help="Choose the country, then type the number."
        value={v.phone} onChange={set('phone')} onBlur={blur('phone')} required error={errors.phone} />
      <FormField id={ids.notes} label="Notes (optional)" as="textarea" rows={2} characterLimit={MAX_LENGTH.notes}
        value={v.notes} onChange={set('notes')} onBlur={blur('notes')} error={errors.notes} />
      <FormField id={ids.emergencyContact} label="Emergency contact (optional)" help="Name and phone number"
        characterLimit={MAX_LENGTH.emergencyContact} value={v.emergencyContact} onChange={set('emergencyContact')}
        onBlur={blur('emergencyContact')} error={errors.emergencyContact} />
    </>
  );
}

function QuickEntryMode({ ids, value, onChange, errors, onBlurField }) {
  const v = value.temporaryHiker;
  const set = (field) => (input) =>
    onChange({
      ...value,
      temporaryHiker: { ...v, [field]: typeof input === 'string' ? input : input.target.value },
    });
  const blur = (field) => () => onBlurField?.(field);
  return (
    <>
      <p className="small">For a quick booking: a temporary hiker, with no email, who cannot log in.</p>
      <FormField id={ids.firstName} label="First name" autoComplete="off" value={v.firstName}
        onChange={set('firstName')} onBlur={blur('firstName')} required error={errors.firstName} />
      <FormField id={ids.lastName} label="Last name (optional)" autoComplete="off" value={v.lastName}
        onChange={set('lastName')} onBlur={blur('lastName')} error={errors.lastName} />
      <PhoneField id={ids.phone} label="Mobile number (optional)" value={v.phone} onChange={set('phone')}
        onBlur={blur('phone')} error={errors.phone} />
    </>
  );
}

/**
 * @param {object} props
 * @param {string} props.idPrefix prefix of the control ids, unique in the page
 * @param {object} props.value see EMPTY_HIKER in utils/hikerPanel.js
 * @param {(value: object) => void} props.onChange
 * @param {Record<string, string>} [props.errors] keys of hikerPanelFieldIds
 * @param {(name: string) => void} [props.onBlurField] e.g. recheck of useFormErrors
 */
export default function HikerPanel({ idPrefix, value, onChange, errors = {}, onBlurField }) {
  const ids = hikerPanelFieldIds(idPrefix, value.mode);
  const modeProps = { idPrefix, ids, value, onChange, errors, onBlurField };
  return (
    <fieldset className="mb-3">
      <legend className="h5">Hiker</legend>
      <fieldset className="mb-3">
        <legend className="form-label mb-1">Who is the booking for?</legend>
        {MODES.map(({ mode, label }) => (
          <Form.Check
            key={mode}
            inline
            type="radio"
            id={`${idPrefix}-mode-${mode}`}
            name={`${idPrefix}-mode`}
            label={label}
            checked={value.mode === mode}
            onChange={() => onChange({ ...value, mode })}
          />
        ))}
      </fieldset>
      {value.mode === 'existing' && <SearchMode {...modeProps} />}
      {value.mode === 'new' && <NewHikerMode {...modeProps} />}
      {value.mode === 'quick' && <QuickEntryMode {...modeProps} />}
    </fieldset>
  );
}
