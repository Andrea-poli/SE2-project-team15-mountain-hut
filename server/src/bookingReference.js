// Booking reference shown to hikers (MH-03 email) and, later, on other screens and staff views.
// Kept in its own module so every part of the product formats it the same way (review of PR #10).

/** Booking id → reference, e.g. 7 → "MH-000007". */
export function bookingReference(id) {
  return `MH-${String(id).padStart(6, '0')}`;
}
