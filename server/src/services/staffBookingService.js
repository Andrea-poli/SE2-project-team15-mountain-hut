// Staff booking flow (MH-07): hiker creation and booking are atomic; email is sent after commit.
import { now } from '../clock.js';
import * as bookingDao from '../dao/bookingDao.js';
import { getDb } from '../dao/db.js';
import * as slotDao from '../dao/slotDao.js';
import * as userDao from '../dao/userDao.js';
import { withTransaction } from '../dao/transaction.js';
import { BadRequest, Conflict, NotFound } from '../errors.js';
import { bookingConfirmed } from '../notifications/notifier.js';
import { validateNewBooking } from './bookingService.js';
import { allocate } from './availability.js';
import { hasStarted } from './slotService.js';
import { createPreparedHiker, prepareFullHiker, prepareTemporaryHiker } from './staffHikerService.js';

const MESSAGES = {
  invalidBody: 'Booking details are required',
  hikerChoice: 'Give exactly one of hikerId, newHiker or temporaryHiker',
  invalidHikerId: 'hikerId must be a positive integer',
  slotNotFound: 'Slot not found',
  hikerNotFound: 'Hiker not found',
  slotClosed: 'This slot is closed',
  slotStarted: 'This slot has already started',
  notEnoughSeats: 'Not enough seats available for this party',
  alreadyBooked: 'This hiker already has a booking for this slot',
};

function validateStaffBooking(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequest(MESSAGES.invalidBody);
  }

  const choices = ['hikerId', 'newHiker', 'temporaryHiker'].filter((key) => Object.hasOwn(body, key));
  if (choices.length !== 1) throw new BadRequest(MESSAGES.hikerChoice);

  const { slotId, partySize, requirements } = validateNewBooking(body);
  const choice = choices[0];
  if (choice === 'hikerId') {
    if (!Number.isSafeInteger(body.hikerId) || body.hikerId < 1) {
      throw new BadRequest(MESSAGES.invalidHikerId);
    }
    return {
      choice,
      hikerId: body.hikerId,
      slotId,
      partySize,
      requirements,
    };
  }
  if (choice === 'newHiker' || choice === 'temporaryHiker') {
    return {
      choice,
      hikerBody: body[choice],
      slotId,
      partySize,
      requirements,
    };
  }
}

/**
 * Creates a staff booking, plus a regular or temporary hiker when requested.
 * The staff cutoff is the slot start (not the public hiker 2-hour deadline).
 */
export async function createStaffBooking(body) {
  const input = validateStaffBooking(body);
  let preparedHiker = null;
  if (input.choice === 'newHiker') {
    preparedHiker = await prepareFullHiker(input.hikerBody);
  } else if (input.choice === 'temporaryHiker') {
    preparedHiker = prepareTemporaryHiker(input.hikerBody);
  }
  const db = await getDb();

  let saved;
  try {
    saved = await withTransaction(db, async (transactionDb) => {
      const slot = await slotDao.findById(transactionDb, input.slotId);
      if (!slot) throw new NotFound(MESSAGES.slotNotFound);
      if (slot.status !== 'open') throw new BadRequest(MESSAGES.slotClosed);
      if (hasStarted(slot)) throw new BadRequest(MESSAGES.slotStarted);

      let hiker;
      let generatedPassword;
      if (input.choice === 'hikerId') {
        hiker = await userDao.findById(transactionDb, input.hikerId);
        if (!hiker || hiker.role !== 'hiker') throw new NotFound(MESSAGES.hikerNotFound);
      } else {
        const created = await createPreparedHiker(transactionDb, preparedHiker);
        ({ hiker, generatedPassword } = created);
      }

      if (await bookingDao.hasConfirmedBooking(transactionDb, input.slotId, hiker.id)) {
        throw new Conflict(MESSAGES.alreadyBooked);
      }
      const tables = allocate(
        slot.tables,
        await bookingDao.allocationsForSlot(transactionDb, input.slotId),
        input.partySize,
      );
      if (!tables) throw new Conflict(MESSAGES.notEnoughSeats);

      const booking = await bookingDao.create(transactionDb, {
        slotId: input.slotId,
        hikerId: hiker.id,
        partySize: input.partySize,
        createdAt: now().toISOString(),
        tables,
        requirements: input.requirements,
      });
      const hikerSummary = await userDao.findHikerSummaryById(transactionDb, hiker.id);
      if (!hikerSummary) throw new NotFound(MESSAGES.hikerNotFound);
      return { booking, hiker, hikerSummary, generatedPassword };
    });
  } catch (err) {
    if (bookingDao.isSecondBooking(err)) throw new Conflict(MESSAGES.alreadyBooked);
    throw err;
  }

  const booking = { ...saved.booking };
  delete booking.hikerId;
  const response = {
    ...booking,
    hiker: saved.hikerSummary,
  };
  if (saved.generatedPassword) response.generatedPassword = saved.generatedPassword;

  await bookingConfirmed(booking, saved.hiker);
  return response;
}
