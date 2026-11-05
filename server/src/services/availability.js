// Shared table allocation of MH-01

const BOOKING_DEADLINE_MS = 2 * 60 * 60 * 1000; // a slot can be booked up to 2 h before it starts (PO, MH-01)

/** Free seats at each table: [{ id, free }] in the order of `tables`, also tables with 0 free seats. */
function freeByTable(tables, allocations) {
  const taken = new Map(allocations.map(({ slotTableId, seats }) => [slotTableId, seats]));
  return tables.map(({ id, seats }) => ({ id, free: Math.max(0, seats - (taken.get(id) ?? 0)) }));
}

/** Free seats of the whole slot (sum over its tables). */
export function freeSeats(tables, allocations) {
  return freeByTable(tables, allocations).reduce((sum, { free }) => sum + free, 0);
}

/** Every way to choose `k` items of `items`, in order: [a,b,c], 2 → [a,b], [a,c], [b,c]. */
function* combinations(items, k, start = 0, chosen = []) {
  if (chosen.length === k) {
    yield chosen;
    return;
  }
  for (let i = start; i <= items.length - (k - chosen.length); i++) {
    yield* combinations(items, k, i + 1, [...chosen, items[i]]);
  }
}

/**
 * Where a party of `partySize` sits, or null when it does not fit (party size > free seats of the slot).
 * Rule (planning 4.3 B): (1) fewest tables; (2) among those, fewest seats left over on the tables used,
 * so big tables stay whole; (3) tie → lowest table ids.
 *   tables 8, 4, 4 + party of 8 → the 8 · tables 6, 4, 4 + 8 → the two 4s · tables 6, 4, 4 + 5 → the 6
 * Not greedy: "6, 4, 4 + 8" needs to compare combinations. A slot has few tables (5–10), so trying
 * the combinations of 1, 2, 3… tables is fast enough.
 * @returns {{ slotTableId: number, seats: number }[] | null} one entry per table used, ordered by table id;
 *          the seats add up to partySize
 */
export function allocate(tables, allocations, partySize) {
  if (!Number.isInteger(partySize) || partySize < 1) throw new RangeError(`Invalid party size: ${partySize}`);

  // Only tables with room, by id: combinations come out in id order, so the first best one wins rule (3).
  const candidates = freeByTable(tables, allocations)
    .filter(({ free }) => free > 0)
    .sort((a, b) => a.id - b.id);
  const total = candidates.reduce((sum, { free }) => sum + free, 0);
  if (partySize > total) return null; // "≤ free seats" is provisional (PO question 6)

  for (let k = 1; k <= candidates.length; k++) {
    let best = null;
    let bestLeftOver = Infinity;
    for (const combination of combinations(candidates, k)) {
      const leftOver = combination.reduce((sum, { free }) => sum + free, 0) - partySize;
      if (leftOver >= 0 && leftOver < bestLeftOver) {
        best = combination;
        bestLeftOver = leftOver;
      }
    }
    if (best) return split(best, partySize);
  }
  return null; // not reached: all the candidates together have room for the party
}

// Fills the chosen tables, the ones with more free seats first: the seats left over stay at the smaller ones.
function split(chosen, partySize) {
  let left = partySize;
  const seats = new Map();
  for (const { id, free } of [...chosen].sort((a, b) => b.free - a.free || a.id - b.id)) {
    seats.set(id, Math.min(free, left));
    left -= seats.get(id);
  }
  return chosen.map(({ id }) => ({ slotTableId: id, seats: seats.get(id) }));
}

/**
 * True when the slot can no longer be booked: less than 2 h before it starts, or already started.
 * Exactly 2 h before is still open. Dates and times are in hut local time (the server runs with
 * TZ=Europe/Rome); `now` comes from now() of clock.js.
 * @param {{ date: string, startTime: string }} slot date 'YYYY-MM-DD', startTime 'HH:MM'
 * @param {Date} now
 */
export function bookingClosed(slot, now) {
  const [year, month, day] = slot.date.split('-').map(Number);
  const [hours, minutes] = slot.startTime.split(':').map(Number);
  const start = new Date(year, month - 1, day, hours, minutes);
  return start.getTime() - now.getTime() < BOOKING_DEADLINE_MS;
}
