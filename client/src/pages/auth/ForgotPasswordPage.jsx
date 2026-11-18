// MH-07 – Forgot password: ask for a reset link by email (PO #36). The page says the same thing whether the
// email has an account or not (the server answers 202 in both cases), so it never reveals who is registered.
import { useState } from 'react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import { Link } from 'react-router';
import { requestPasswordReset } from '../../api/auth.js';
import AuthCard from '../../components/AuthCard.jsx';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import FormField from '../../components/FormField.jsx';
import { useFormErrors } from '../../hooks/useFormErrors.js';
import { routes } from '../../routes.js';
import { isBlank, isEmail } from '../../utils/validation.js';

const FIELD_IDS = { email: 'forgot-email' };

function validate({ email }) {
  if (isBlank(email)) return { email: 'Enter your email.' };
  if (!isEmail(email)) return { email: 'Enter a valid email, e.g. name@example.com.' };
  return {};
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState(null);
  const { errors, generalError, generalRef, checkOnSubmit, recheck, showGeneralError } = useFormErrors(
    validate,
    FIELD_IDS,
  );

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting || !checkOnSubmit({ email })) return;
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      setSentTo(email.trim());
    } catch (err) {
      showGeneralError(err.message);
    }
    setSubmitting(false);
  }

  return (
    <AuthCard title="Forgot password – Mountain Hut" heading="Forgot password">
      {sentTo ? (
        <>
          <p role="status">
            If <strong>{sentTo}</strong> has an account, we sent it a link to choose a new password. The link
            works once, within 24 hours. Check the spam folder too.
          </p>
          <Link to={routes.login}>Back to log in</Link>
        </>
      ) : (
        <>
          <p className="mb-4">
            Enter the email of your account: we will send you a link to choose a new password.
          </p>
          <ErrorMessage message={generalError} ref={generalRef} />
          <Form noValidate onSubmit={handleSubmit}>
            <FormField
              id={FIELD_IDS.email}
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => recheck('email', { email })}
              required
              error={errors.email}
            />
            <Button type="submit" className="w-100 mt-2" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send the link'}
            </Button>
          </Form>
          <p className="mt-4 mb-0">
            <Link to={routes.login}>Back to log in</Link>
          </p>
        </>
      )}
    </AuthCard>
  );
}
