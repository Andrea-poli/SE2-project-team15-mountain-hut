// MH-07 – Change password (any logged-in user with a password). A hiker created by staff has
// mustChangePassword: true and is sent here by RequirePasswordChange until the generated password is replaced
// (PO #36: "they will be forced to change the password on their next login"). PUT /api/auth/password.
import { useState } from 'react';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import { Navigate } from 'react-router';
import { homeFor } from '../../auth/roles.js';
import { useAuth } from '../../auth/useAuth.js';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import PasswordField from '../../components/PasswordField.jsx';
import { useFormErrors } from '../../hooks/useFormErrors.js';
import { NEW_PASSWORD_HELP, newPasswordErrors } from '../../utils/password.js';
import { isBlank } from '../../utils/validation.js';

const FIELD_IDS = {
  currentPassword: 'change-current-password',
  newPassword: 'change-new-password',
  confirmPassword: 'change-confirm-password',
};

function validate(v) {
  const errors = {};
  if (isBlank(v.currentPassword)) errors.currentPassword = 'Enter your current password.';
  return { ...errors, ...newPasswordErrors(v) };
}

export default function ChangePasswordPage() {
  const { user, changePassword } = useAuth();
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const { errors, setErrors, generalError, generalRef, checkOnSubmit, recheck, focusField, showGeneralError } =
    useFormErrors(validate, FIELD_IDS);
  const forced = Boolean(user?.mustChangePassword);

  if (done) return <Navigate replace to={homeFor(user)} state={{ passwordChanged: true }} />;

  const change = (name) => (e) => setValues((v) => ({ ...v, [name]: e.target.value }));
  const recheckField = (name) => () => recheck(name, values);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting || !checkOnSubmit(values)) return;
    setSubmitting(true);
    try {
      await changePassword(values.currentPassword, values.newPassword);
      setDone(true);
    } catch (err) {
      if (err.status === 401) {
        setValues((v) => ({ ...v, currentPassword: '' }));
        setErrors({ currentPassword: `${err.message}.` });
        focusField('currentPassword');
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
        <title>Change password – Mountain Hut</title>
        <Card>
          <Card.Body className="p-4">
            <h1 className="mb-2">Change password</h1>
            {forced ? (
              <p className="mb-4" role="status">
                Your password was created by the hut staff. Choose your own password to continue.
              </p>
            ) : (
              <p className="mb-4">Choose a new password for your account.</p>
            )}
            <ErrorMessage message={generalError} ref={generalRef} />
            <Form noValidate onSubmit={handleSubmit}>
              <PasswordField
                id={FIELD_IDS.currentPassword}
                label={forced ? 'Password you were given' : 'Current password'}
                toggleLabel="Show current password"
                autoComplete="current-password"
                value={values.currentPassword}
                onChange={change('currentPassword')}
                onBlur={recheckField('currentPassword')}
                required
                error={errors.currentPassword}
              />
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
                {submitting ? 'Saving…' : 'Change password'}
              </Button>
            </Form>
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
}
