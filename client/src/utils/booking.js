// Text helpers for bookings, shared by the confirmation page (MH-01) and the availability page (MH-04).
// Hikers see the seat split ("2 + 3 + 1 seats"), never table names (openapi Allocation).

/** [{seats: 3}] → "3 seats at one table"; [{seats: 2}, {seats: 3}] → "2 + 3 seats". */
export function seatSplitText(tables) {
  const seats = (tables ?? []).map((t) => t.seats);
  if (seats.length === 0) return '';
  const total = seats.reduce((sum, n) => sum + n, 0);
  const unit = total === 1 ? 'seat' : 'seats';
  return seats.length === 1 ? `${total} ${unit} at one table` : `${seats.join(' + ')} ${unit}`;
}

/** 1 → "1 person", 3 → "3 people". */
export function peopleText(n) {
  return n === 1 ? '1 person' : `${n} people`;
}
