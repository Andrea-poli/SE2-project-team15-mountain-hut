// MH-07 – Set new password: the page of the reset link (/reset-password?token=…, valid 24 h, PO #44).
// On success the server logs the user out everywhere; the page then asks to log in with the new password.
import { useState } from 'react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import { Link, useSearchParams } from 'react-router';
import { confirmPasswordReset } from '../../api/auth.js';
import { useAuth } from '../../auth/useAuth.js';
import AuthCard from '../../components/AuthCard.jsx';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import { useFormErrors } from '../../hooks/useFormErrors.js';
import { routes } from '../../routes.js';
import { newPasswordErrors } from '../../utils/password.js';
import NewPasswordFields from './NewPasswordFields.jsx';

const FIELD_IDS = { newPassword: 'reset-new-password', confirmPassword: 'reset-confirm-password' };

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { forgetUser } = useAuth();
  const [values, setValues] = useState({ newPassword: '', confirmPassword: '' });
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState(token ? 'form' : 'badLink'); // form | done | badLink
  const [badLinkMessage, setBadLinkMessage] = useState('');
  const { errors, setErrors, generalError, generalRef, checkOnSubmit, recheck, focusField, showGeneralError } =
    useFormErrors(newPasswordErrors, FIELD_IDS);

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
      if (err.status === 400 && /link/i.test(err.message)) {
        setBadLinkMessage(err.message);
        setState('badLink');
      } else if (err.status === 400) {
        setErrors({ newPassword: `${err.message}.` });
        focusField('newPassword');
      } else {
        showGeneralError(err.message);
      }
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Choose a new password – Mountain Hut" heading="Choose a new password">
      {state === 'done' && (
        <>
          <p role="status">Your password has been changed. Log in with the new password.</p>
          <Link to={routes.login}>Log in</Link>
        </>
      )}
      {state === 'badLink' && (
        <>
          <ErrorMessage message={badLinkMessage || 'This link is not valid: ask for a new one.'} />
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
