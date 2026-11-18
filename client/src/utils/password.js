// MH-07 – checks of a new password, shared by Change password and Set new password (reset link).
// Same rule and messages as the registration (RegisterPage, U8): at least 8 characters, typed twice.
import { MAX_LENGTH, MIN_PASSWORD_LENGTH, isBlank, tooLongMessage } from './validation.js';

/** Field errors of { newPassword, confirmPassword } (keys as the field names). */
export function newPasswordErrors({ newPassword, confirmPassword }) {
  const errors = {};
  if (isBlank(newPassword)) errors.newPassword = 'Enter a new password.';
  else if (newPassword.length < MIN_PASSWORD_LENGTH) {
    errors.newPassword = `The password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
  } else if (newPassword.length > MAX_LENGTH.password) {
    errors.newPassword = `${tooLongMessage('The password', MAX_LENGTH.password)}.`;
  }
  if (isBlank(confirmPassword)) errors.confirmPassword = 'Confirm the new password.';
  else if (confirmPassword !== newPassword) errors.confirmPassword = 'The passwords do not match.';
  return errors;
}

export const NEW_PASSWORD_HELP = `At least ${MIN_PASSWORD_LENGTH} characters`;
