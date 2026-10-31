// Log in (U8). After success, or when already logged in, the page sends the user to nextFor(user, ?next=).
import { useState } from 'react';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import { Link, Navigate, useSearchParams } from 'react-router';
import { nextFor } from '../../auth/roles.js';
import { useAuth } from '../../auth/useAuth.js';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import FormField from '../../components/FormField.jsx';
import PasswordField from '../../components/PasswordField.jsx';
import Loading from '../../components/Loading.jsx';
import { useFormErrors } from '../../hooks/useFormErrors.js';
import { routes } from '../../routes.js';
import { isBlank, isEmail } from '../../utils/validation.js';

// Field ids in form order: after a failed submit, the first one with an error gets the focus.
const FIELD_IDS = { email: 'login-email', password: 'login-password' };

function validate({ email, password }) {
  const errors = {};
  if (isBlank(email)) errors.email = 'Enter your email.';
  else if (!isEmail(email)) errors.email = 'Enter a valid email, e.g. name@example.com.';
  if (isBlank(password)) errors.password = 'Enter your password.';
  return errors;
}

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const [params] = useSearchParams();
  const next = params.get('next');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { errors, generalError, generalRef, checkOnSubmit, recheck, showGeneralError } = useFormErrors(
    validate,
    FIELD_IDS,
  );

  // Wait for the startup check; a logged-in user (also right after a successful login) leaves the page.
  if (loading) return <Loading />;
  if (user) return <Navigate replace to={nextFor(user, next)} />;

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting || !checkOnSubmit({ email, password })) return;

    setSubmitting(true);
    try {
      await login(email.trim(), password);
      // Success: AuthContext sets the user and the <Navigate> above takes over.
    } catch (err) {
      // 401 wrong credentials, or 400/network/500: one general message (the server does not name a field).
      if (err.status === 401) setPassword('');
      showGeneralError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const registerLink = next ? `${routes.register}?next=${encodeURIComponent(next)}` : routes.register;

  return (
    <Row className="justify-content-center">
      <Col md={8} lg={6}>
        <title>Log in – Mountain Hut</title>
        <Card>
          <Card.Body className="p-4">
            <h1 className="mb-4">Log in</h1>
            <ErrorMessage message={generalError} ref={generalRef} />
            {/* noValidate: our checks run on submit instead of the browser's bubbles. */}
            <Form noValidate onSubmit={handleSubmit}>
              <FormField
                id={FIELD_IDS.email}
                label="Email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => recheck('email', { email, password })}
                required
                error={errors.email}
              />
              <PasswordField
                id={FIELD_IDS.password}
                label="Password"
                toggleLabel="Show password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => recheck('password', { email, password })}
                required
                error={errors.password}
              />
              {/* preventDefault on mousedown: the field keeps the focus, so its blur check cannot remove
                  an error above the button and move the button away before the click ends. */}
              <Button
                type="submit"
                className="w-100 mt-2"
                disabled={submitting}
                onMouseDown={(e) => e.preventDefault()}
              >
                {submitting ? 'Logging in…' : 'Log in'}
              </Button>
            </Form>
            <p className="mt-4 mb-0">
              No account yet? <Link to={registerLink}>Register</Link>
            </p>
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
}
