// Errors of a form, as every form of the app shows them (U8 pages, MH-01, MH-02):
// - on submit: all field errors at once, focus on the first field with an error (form order);
// - on blur: only a field that already shows an error is checked again (nothing while typing);
// - a general message (server, network) above the form, with the focus on it.
// The focus moves after the next render, when the error and its aria attributes are in the page.
//
// Example:
//   const FIELD_IDS = { date: 'book-date', partySize: 'book-party-size' }; // form order
//   function validate(v) { return isBlank(v.date) ? { date: 'Choose a date.' } : {}; }
//
//   const { errors, setErrors, generalError, generalRef, checkOnSubmit, recheck, focusField, showGeneralError } =
//     useFormErrors(validate, FIELD_IDS);
//
//   async function handleSubmit(event) {
//     event.preventDefault();
//     if (submitting || !checkOnSubmit(values)) return;
//     try {
//       await save(values);
//     } catch (err) {
//       if (err.status === 409) {
//         setErrors({ partySize: err.message }); // a server error that belongs to one field
//         focusField('partySize');
//       } else {
//         showGeneralError(err.message);
//       }
//     }
//   }
//
//   <ErrorMessage message={generalError} ref={generalRef} />
//   <FormField id={FIELD_IDS.date} … onBlur={() => recheck('date', values)} error={errors.date} />
import { useEffect, useRef, useState } from 'react';

const GENERAL = Symbol('general message');

/**
 * @param {(values: object) => Record<string, string>} validate field name → message, only for wrong fields
 * @param {Record<string, string>} fieldIds field name → id of its control, in form order
 */
export function useFormErrors(validate, fieldIds) {
  const [errors, setErrors] = useState({});
  const [generalError, setGeneralError] = useState(null);
  const generalRef = useRef(null);

  // What gets the focus after the next render: a control id, or GENERAL for the general message.
  const pendingFocus = useRef(null);
  useEffect(() => {
    if (!pendingFocus.current) return;
    if (pendingFocus.current === GENERAL) generalRef.current?.focus();
    else document.getElementById(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  });

  /** Focus on the control of field `name` after the next render. */
  function focusField(name) {
    pendingFocus.current = fieldIds[name];
  }

  /** Shows `message` above the form and moves the focus to it. */
  function showGeneralError(message) {
    setGeneralError(message);
    pendingFocus.current = GENERAL;
  }

  /** On submit: removes the general message, shows every field error, focuses the first one. True when valid. */
  function checkOnSubmit(values) {
    setGeneralError(null);
    const found = validate(values);
    setErrors(found);
    const firstInvalid = Object.keys(fieldIds).find((name) => found[name]);
    if (firstInvalid) focusField(firstInvalid);
    return !firstInvalid;
  }

  /** On blur, only for a field that already shows an error: checks it again, updates or removes its message. */
  function recheck(name, values) {
    if (!errors[name]) return;
    const now = validate(values)[name];
    setErrors((current) => {
      const { [name]: _old, ...rest } = current;
      return now ? { ...rest, [name]: now } : rest;
    });
  }

  return { errors, setErrors, generalError, generalRef, checkOnSubmit, recheck, focusField, showGeneralError };
}
