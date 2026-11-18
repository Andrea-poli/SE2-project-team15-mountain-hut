// MH-07 – Set new password: the page of the reset link (/reset-password?token=…, valid 24 h, PO #44).
// The link is checked on load (GET .../validity, never consumes it) so a dead link is caught right away,
// before the hiker types a new password twice. On success the server logs the user out everywhere; the
// page then asks to log in with the new password.
import { useEffect, useState } from 'react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import { Link, useSearchParams } from 'react-router';
import { checkPasswordResetToken, confirmPasswordReset } from '../../api/auth.js';
import { useAuth } from '../../auth/useAuth.js';
import AuthCard from '../../components/AuthCard.jsx';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import Loading from '../../components/Loading.jsx';
import { useFormErrors } from '../../hooks/useFormErrors.js';
import { routes } from '../../routes.js';
import { newPasswordErrors } from '../../utils/password.js';
import NewPasswordFields from './NewPasswordFields.jsx';

const FIELD_IDS = { newPassword: 'reset-new-password', confirmPassword: 'reset-confirm-password' };
const BAD_LINK_MESSAGE = 'This link is not valid: ask for a new one.';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { forgetUser } = useAuth();
  const [values, setValues] = useState({ newPassword: '', confirmPassword: '' });
  const [submitting, setSubmitting] = useState(false);
  // checking (GET .../validity, only while a token is present) | form | done | badLink
  const [state, setState] = useState(token ? 'checking' : 'badLink');
  const [badLinkMessage, setBadLinkMessage] = useState('');
  const { errors, generalError, generalRef, checkOnSubmit, recheck, showGeneralError } = useFormErrors(
    newPasswordErrors,
    FIELD_IDS,
  );

  // Checks the link before showing the form, so a used/expired link is caught at once (PO #36, #44)
  // instead of only after a submit. Does not consume the token: a second check or /confirm still sees it.
  useEffect(() => {
    if (!token) return undefined; // already badLink, nothing to check
    let cancelled = false;
    checkPasswordResetToken(token).then(
      () => {
        if (!cancelled) setState('form');
      },
      (err) => {
        if (cancelled) return;
        setBadLinkMessage(err.message);
        setState('badLink');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token]);

  const change = (name) => (e) => setValues((v) => ({ ...v, [name]: e.target.value }));
  const recheckField = (name) => () => recheck(name, values);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting || !checkOnSubmit(values)) return;
    setSubmitting(true);
    try {
      await confirmPasswordReset(token, values.newPassword);
      forgetUser(); // the server ended every session of this user
      setState('done');
    } catch (err) {
      // The token is non-empty (else we would not be in 'form') and the password length was already
      // checked client-side, so the only way the server answers 400 here is the link itself: it may have
      // been used in another tab, or expired, while the hiker was typing.
      if (err.status === 400) {
        setBadLinkMessage(err.message);
        setState('badLink');
      } else {
        showGeneralError(err.message);
      }
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Choose a new password – Mountain Hut" heading="Choose a new password">
      {state === 'checking' && <Loading />}
      {state === 'done' && (
        <>
          <p role="status">Your password has been changed. Log in with the new password.</p>
          <Link to={routes.login}>Log in</Link>
        </>
      )}
      {state === 'badLink' && (
        <>
          <ErrorMessage message={badLinkMessage || BAD_LINK_MESSAGE} />
          <Link to={routes.forgotPassword}>Ask for a new link</Link>
        </>
      )}
      {state === 'form' && (
        <>
          <ErrorMessage message={generalError} ref={generalRef} />
          <Form noValidate onSubmit={handleSubmit}>
            <NewPasswordFields
              fieldIds={FIELD_IDS}
              values={values}
              errors={errors}
              onFieldChange={change}
              onFieldBlur={recheckField}
            />
            <Button type="submit" className="w-100 mt-2" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save the new password'}
            </Button>
          </Form>
        </>
      )}
    </AuthCard>
  );
}
