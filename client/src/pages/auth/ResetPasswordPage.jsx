// MH-07 – Set new password: the page of the reset link (/reset-password?token=…, valid 24 h, PO #44).
// On success the server logs the user out everywhere; the page then asks to log in with the new password.
import { useState } from 'react';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import { Link, useSearchParams } from 'react-router';
import { confirmPasswordReset } from '../../api/auth.js';
import { useAuth } from '../../auth/useAuth.js';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import PasswordField from '../../components/PasswordField.jsx';
import { useFormErrors } from '../../hooks/useFormErrors.js';
import { routes } from '../../routes.js';
import { NEW_PASSWORD_HELP, newPasswordErrors } from '../../utils/password.js';

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
    <Row className="justify-content-center">
      <Col md={8} lg={6}>
        <title>Choose a new password – Mountain Hut</title>
        <Card>
          <Card.Body className="p-4">
            <h1 className="mb-2">Choose a new password</h1>
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
                  <PasswordField
                    id={FIELD_IDS.newPassword}
                    label="New password"
                    toggleLabel="Show new password"
                    autoComplete="new-password"
                    help={NEW_PASSWORD_HELP}
                    value={values.newPassword}
                    onChange={change('newPassword')}
                    onBlur={recheckField('newPassword')}
                    required
                    error={errors.newPassword}
                  />
                  <PasswordField
                    id={FIELD_IDS.confirmPassword}
                    label="Confirm new password"
                    toggleLabel="Show confirmed password"
                    autoComplete="new-password"
                    value={values.confirmPassword}
                    onChange={change('confirmPassword')}
                    onBlur={recheckField('confirmPassword')}
                    required
                    error={errors.confirmPassword}
                  />
                  <Button type="submit" className="w-100 mt-2" disabled={submitting}>
                    {submitting ? 'Saving…' : 'Save the new password'}
                  </Button>
                </Form>
              </>
            )}
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
}
