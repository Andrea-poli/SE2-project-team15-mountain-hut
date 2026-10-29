// Register a hiker (U8). After success (already logged in), or when already logged in,
// the page sends the user to nextFor(user, ?next=).
// TODO: align with the updated contract (U2) and U5: phone required, notes and emergencyContact
// (PO, context.md "Hiker Information"); planning 3.3 still has phone optional and no other fields.
import { useEffect, useRef, useState } from 'react';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
// Phone field with country menu. Metadata: the same set as utils/phone.js and the server (U5).
// Flags are bundled SVGs: without the `flags` prop the library would load them from an external site.
import PhoneInput from 'react-phone-number-input';
import flags from 'react-phone-number-input/flags';
import 'react-phone-number-input/style.css'; // the only import of the library CSS (colours: theme.css, section 11)
import { Link, Navigate, useSearchParams } from 'react-router';
import { nextFor } from '../../auth/roles.js';
import { useAuth } from '../../auth/useAuth.js';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import FormField from '../../components/FormField.jsx';
import PasswordField from '../../components/PasswordField.jsx';
import Loading from '../../components/Loading.jsx';
import { routes } from '../../routes.js';
import PhoneCountrySelect from '../../components/PhoneCountrySelect.jsx';
import { countryLabels, examplePhone, isPhone, pastedInternationalPhone } from '../../utils/phone.js';
import { MIN_PASSWORD_LENGTH, isBlank, isEmail } from '../../utils/validation.js';

// Ids of the checked fields in form order: after a failed submit, the first one with an error gets the focus.
const FIELD_IDS = {
  firstName: 'register-first-name',
  lastName: 'register-last-name',
  email: 'register-email',
  password: 'register-password',
  confirmPassword: 'register-confirm-password',
  phone: 'register-phone',
};
const GENERAL = 'general';
const DEFAULT_PHONE_COUNTRY = 'IT';

const EMPTY = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
  phone: '',
  notes: '',
  emergencyContact: '',
};

function validate(v) {
  const errors = {};
  if (isBlank(v.firstName)) errors.firstName = 'Enter your first name.';
  if (isBlank(v.lastName)) errors.lastName = 'Enter your last name.';
  if (isBlank(v.email)) errors.email = 'Enter your email.';
  else if (!isEmail(v.email)) errors.email = 'Enter a valid email, e.g. name@example.com.';
  if (isBlank(v.password)) errors.password = 'Enter a password.';
  else if (v.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `The password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
  }
  if (isBlank(v.confirmPassword)) errors.confirmPassword = 'Confirm your password.';
  else if (v.confirmPassword !== v.password) errors.confirmPassword = 'The passwords do not match.';
  if (isBlank(v.phone)) errors.phone = 'Enter your mobile number.';
  else if (!isPhone(v.phone)) errors.phone = 'Enter a valid mobile number for the chosen country.';
  return errors;
}

// Text fields trimmed, password as typed, phone already E.164 (e.g. "+393401234567"),
// empty optional fields not sent. confirmPassword is a client-side check only: never sent.
function toPayload(v) {
  const data = {
    firstName: v.firstName.trim(),
    lastName: v.lastName.trim(),
    email: v.email.trim(),
    password: v.password,
    phone: v.phone,
  };
  if (!isBlank(v.notes)) data.notes = v.notes.trim();
  if (!isBlank(v.emergencyContact)) data.emergencyContact = v.emergencyContact.trim();
  return data;
}

export default function RegisterPage() {
  const { user, loading, register } = useAuth();
  const [params] = useSearchParams();
  const next = params.get('next');

  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [generalError, setGeneralError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  // Country of the phone field: drives the example number in the placeholder.
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY);

  const generalRef = useRef(null);
  // What gets the focus after a failed submit: a field id, or GENERAL for the general message.
  // It is moved after the next render, when the error and its aria attributes are in the page.
  const pendingFocus = useRef(null);
  useEffect(() => {
    if (!pendingFocus.current) return;
    if (pendingFocus.current === GENERAL) generalRef.current?.focus();
    else document.getElementById(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  });
  // Email refused by the server (409): its error stays until the email is changed.
  const rejectedEmail = useRef(null);

  // Wait for the startup check; a logged-in user (also right after registering) leaves the page.
  if (loading) return <Loading />;
  if (user) return <Navigate replace to={nextFor(user, next)} />;

  const change = (name) => (e) => setValues((v) => ({ ...v, [name]: e.target.value }));

  // Pasting "+41 79 123 45 67": the library would switch to Switzerland but keep "+41" in the field,
  // next to the "+41" already shown by the flag. Passing the E.164 value instead lets PhoneInput
  // pick the country and show only the national part.
  const pastePhone = (event) => {
    const e164 = pastedInternationalPhone(event.clipboardData.getData('text'));
    if (!e164) return;
    event.preventDefault();
    setValues((v) => ({ ...v, phone: e164 }));
  };

  // On blur, only for a field that already shows an error: check it again and update or remove
  // its message. Nothing while typing, and no errors on fields that were never flagged.
  const recheck = (name) => () => {
    if (!errors[name]) return;
    if (name === 'email' && values.email.trim() === rejectedEmail.current) return;
    const now = validate(values)[name];
    setErrors((current) => {
      const { [name]: _old, ...rest } = current;
      return now ? { ...rest, [name]: now } : rest;
    });
  };

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setGeneralError(null);

    const found = validate(values);
    setErrors(found);
    const firstInvalid = Object.keys(FIELD_IDS).find((name) => found[name]);
    if (firstInvalid) {
      pendingFocus.current = FIELD_IDS[firstInvalid];
      return;
    }

    setSubmitting(true);
    try {
      await register(toPayload(values));
      // Success: AuthContext sets the user and the <Navigate> above takes over.
    } catch (err) {
      if (err.status === 409) {
        // The only error that names a field without guessing from the text: email already in use.
        setErrors({ email: err.message });
        rejectedEmail.current = values.email.trim();
        pendingFocus.current = FIELD_IDS.email;
      } else {
        setGeneralError(err.message);
        pendingFocus.current = GENERAL;
      }
    } finally {
      setSubmitting(false);
    }
  }

  const loginLink = next ? `${routes.login}?next=${encodeURIComponent(next)}` : routes.login;

  return (
    <Row className="justify-content-center">
      <Col md={8} lg={6}>
        <title>Register – Mountain Hut</title>
        <Card>
          <Card.Body className="p-4">
            <h1 className="mb-4">Register</h1>
            <ErrorMessage message={generalError} ref={generalRef} />
            {/* noValidate: our checks run on submit instead of the browser's bubbles. */}
            <Form noValidate onSubmit={handleSubmit}>
              <FormField
                id={FIELD_IDS.firstName}
                label="First name"
                autoComplete="given-name"
                value={values.firstName}
                onChange={change('firstName')}
                onBlur={recheck('firstName')}
                required
                error={errors.firstName}
              />
              <FormField
                id={FIELD_IDS.lastName}
                label="Last name"
                autoComplete="family-name"
                value={values.lastName}
                onChange={change('lastName')}
                onBlur={recheck('lastName')}
                required
                error={errors.lastName}
              />
              <FormField
                id={FIELD_IDS.email}
                label="Email"
                type="email"
                autoComplete="email"
                value={values.email}
                onChange={change('email')}
                onBlur={recheck('email')}
                required
                error={errors.email}
              />
              <PasswordField
                id={FIELD_IDS.password}
                label="Password"
                toggleLabel="Show password"
                autoComplete="new-password"
                help={`At least ${MIN_PASSWORD_LENGTH} characters`}
                value={values.password}
                onChange={change('password')}
                onBlur={recheck('password')}
                required
                error={errors.password}
              />
              <PasswordField
                id={FIELD_IDS.confirmPassword}
                label="Confirm password"
                toggleLabel="Show confirmed password"
                autoComplete="new-password"
                value={values.confirmPassword}
                onChange={change('confirmPassword')}
                onBlur={recheck('confirmPassword')}
                required
                error={errors.confirmPassword}
              />
              {/* PhoneInput as the control: the container gets .form-control (border, 44px, is-invalid),
                  id, aria-*, required, autoComplete, placeholder, onPaste and onBlur go to the number <input>.
                  onChange gives the E.164 value (undefined when empty), not an event.
                  The field holds the national number; the calling code is shown next to the flag
                  (PhoneCountrySelect), and changes with the country. */}
              <FormField
                id={FIELD_IDS.phone}
                as={PhoneInput}
                label="Mobile number"
                help="Choose the country, then type your mobile number."
                defaultCountry={DEFAULT_PHONE_COUNTRY}
                addInternationalOption={false}
                labels={countryLabels}
                flags={flags}
                countrySelectComponent={PhoneCountrySelect}
                countrySelectProps={{ 'aria-label': 'Country' }}
                onCountryChange={(country) => setPhoneCountry(country)}
                placeholder={examplePhone(phoneCountry)}
                onPaste={pastePhone}
                // A value set from outside (the pasted number) is shown in national format.
                initialValueFormat="national"
                // Arrow keys on the country menu must not jump to the number field.
                focusInputOnCountrySelection={false}
                autoComplete="tel"
                value={values.phone || undefined}
                onChange={(phone) => setValues((v) => ({ ...v, phone: phone ?? '' }))}
                onBlur={recheck('phone')}
                required
                error={errors.phone}
              />
              <FormField
                id="register-notes"
                label="Notes (optional)"
                as="textarea"
                rows={3}
                help='e.g. "registered mountain guide"'
                value={values.notes}
                onChange={change('notes')}
              />
              <FormField
                id="register-emergency-contact"
                label="Emergency contact (optional)"
                autoComplete="off"
                help="Name and phone number"
                value={values.emergencyContact}
                onChange={change('emergencyContact')}
              />
              {/* preventDefault on mousedown: the field keeps the focus, so its blur check cannot remove
                  an error above the button and move the button away before the click ends. */}
              <Button
                type="submit"
                className="w-100 mt-2"
                disabled={submitting}
                onMouseDown={(e) => e.preventDefault()}
              >
                {submitting ? 'Creating account…' : 'Create account'}
              </Button>
            </Form>
            <p className="mt-4 mb-0">
              Already registered? <Link to={loginLink}>Log in</Link>
            </p>
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
}
