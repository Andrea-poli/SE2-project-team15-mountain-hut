// MH-07 – the "new password" + "confirm new password" pair, identical on Change password and Set new
// password (reset link): same labels, help text and autoComplete; only the field ids differ per page.
import PasswordField from '../../components/PasswordField.jsx';
import { NEW_PASSWORD_HELP } from '../../utils/password.js';

export default function NewPasswordFields({ fieldIds, values, errors, onFieldChange, onFieldBlur }) {
  return (
    <>
      <PasswordField
        id={fieldIds.newPassword}
        label="New password"
        toggleLabel="Show new password"
        autoComplete="new-password"
        help={NEW_PASSWORD_HELP}
        value={values.newPassword}
        onChange={onFieldChange('newPassword')}
        onBlur={onFieldBlur('newPassword')}
        required
        error={errors.newPassword}
      />
      <PasswordField
        id={fieldIds.confirmPassword}
        label="Confirm new password"
        toggleLabel="Show confirmed password"
        autoComplete="new-password"
        value={values.confirmPassword}
        onChange={onFieldChange('confirmPassword')}
        onBlur={onFieldBlur('confirmPassword')}
        required
        error={errors.confirmPassword}
      />
    </>
  );
}
