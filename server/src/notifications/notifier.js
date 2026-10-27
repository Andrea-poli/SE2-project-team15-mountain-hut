// Hook called by MH-01 (booking service) after a booking is committed.
// MH-03 fills it: it sends the confirmation email to the hiker.
// It must never throw: if the email fails, the booking stays valid (planning 4.3 B).

/**
 * @param {object} booking the created booking, as returned by GET /api/bookings/:id
 * @param {object} hiker   { id, firstName, lastName, email }
 */
// eslint-disable-next-line no-unused-vars -- empty until MH-03
export async function bookingConfirmed(booking, hiker) {
  // MH-03 BE1: send the confirmation email.
}
