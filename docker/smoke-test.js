// Smoke test of a running Mountain Hut container (D2). Checks every API endpoint of the current
// release from the outside, the way a user would reach it: guest, hiker, employee, warden, the main
// error answers, and the demo data of the seed (C3). It does not replace the unit, integration and
// E2E tests: it answers "does this image, started with these variables, work?" in a few seconds.
//
//   docker compose down -v && docker compose up -d      (a FRESH start: the checks expect the seed)
//   node docker/smoke-test.js                            (or: node docker/smoke-test.js http://host:port)
//
// It writes to the database (a new hiker, a booking, a slot), so run it once per fresh start.
// Exit code 0 = all passed, 1 = something failed (usable in a script or a CI job).
// The confirmation email is not checked here: look at the mailbox (e.g. Ethereal → Messages).

const BASE = (process.argv[2] || 'http://localhost:3001').replace(/\/$/, '');
let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

/** A browser-like client: keeps its own session cookie between calls. */
function client() {
  let cookie = '';
  return async (method, path, body) => {
    const res = await fetch(BASE + path, {
      method,
      redirect: 'manual',
      headers: { ...(body && { 'Content-Type': 'application/json' }), ...(cookie && { cookie }) },
      body: body && JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await res.text();
    let json = text;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // not JSON (e.g. the HTML page): keep the text
    }
    return { status: res.status, body: json, headers: res.headers };
  };
}

/** Date in hut local time, `n` days from today: the seed counts its days the same way. */
function day(n) {
  const date = new Date();
  date.setDate(date.getDate() + n);
  return date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
}
const hutHour = Number(
  new Date().toLocaleString('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', hour12: false }),
);

async function main() {
  console.log(`Smoke test of ${BASE}\n`);
  const guest = client();
  let r = await guest('GET', '/api/auth/me').catch((err) => ({ error: err }));
  if (r.error) {
    console.log(`FAIL  the server does not answer at ${BASE} (${r.error.cause?.code || r.error.message})`);
    process.exit(1);
  }

  // ---------- guest and public endpoints
  check('guest: GET /api/auth/me → 401', r.status === 401);
  r = await guest('GET', `/api/public/slots?date=${day(1)}`);
  const lunch = r.body?.find?.((s) => s.label === 'Lunch');
  const dinner = r.body?.find?.((s) => s.label.startsWith('Dinner – 1st'));
  check('public slots of tomorrow → 200 with Lunch and Dinner', r.status === 200 && lunch && dinner);
  if (!lunch || !dinner) {
    console.log('\nNo demo slots: the database was not seeded. Start from a fresh volume (docker compose down -v).');
    process.exit(1);
  }
  r = await guest('GET', '/api/public/slots?date=2026-02-30');
  check('public slots with an impossible date → 400', r.status === 400, r.body?.error);
  r = await guest('GET', `/api/public/slots?date=${day(3)}`);
  const dinnerIn3 = r.body.find((s) => s.label.startsWith('Dinner – 1st'));
  check('demo data: the dinner in 3 days is full', dinnerIn3?.bookingState === 'full');
  r = await guest('GET', `/api/public/slots/${lunch.id}/availability?partySize=1`);
  check('availability: tomorrow\'s lunch for 1 → available (1 seat left)',
    r.status === 200 && r.body.available === true);
  r = await guest('GET', `/api/public/slots/${lunch.id}/availability?partySize=2`);
  check('availability: tomorrow\'s lunch for 2 → not available', r.status === 200 && r.body.available === false);
  r = await guest('GET', `/api/public/slots/${dinner.id}/availability?partySize=12`);
  check('availability: tomorrow\'s dinner for 12 → available, split', r.body?.available === true,
    r.body?.split?.map((t) => t.seats).join(' + '));
  r = await guest('GET', '/api/public/slots/999999/availability?partySize=2');
  check('availability of an unknown slot → 404', r.status === 404);
  r = await guest('GET', '/api/nothing');
  check('unknown /api route → 404 with { error }', r.status === 404 && typeof r.body?.error === 'string');
  r = await guest('POST', '/api/bookings', { slotId: dinner.id, partySize: 2 });
  check('guest cannot book → 401', r.status === 401);
  r = await guest('GET', '/api/test/emails');
  check('test-only route absent in production → 404', r.status === 404);

  // ---------- accounts
  const hiker = client();
  const email = `smoke-${Date.now()}@example.com`;
  const newUser = {
    firstName: 'Smoke', lastName: 'Test', email, password: 'smoke-test-pass', phone: '+39 333 1234567',
  };
  r = await hiker('POST', '/api/auth/register', newUser);
  check('register a new hiker → 201, logged in', r.status === 201 && r.body?.role === 'hiker');
  r = await hiker('GET', '/api/auth/me');
  check('me after register → 200', r.status === 200 && r.body?.email === email);
  r = await guest('POST', '/api/auth/register', { ...newUser, firstName: 'Again' });
  check('register the same email again → 409', r.status === 409, r.body?.error);
  const shortPassword = { ...newUser, email: `short-${Date.now()}@example.com`, password: 'short' };
  r = await guest('POST', '/api/auth/register', shortPassword);
  check('register with a short password → 400', r.status === 400, r.body?.error);
  r = await hiker('POST', '/api/auth/logout');
  check('logout → 2xx', r.status >= 200 && r.status < 300, String(r.status));
  r = await hiker('GET', '/api/auth/me');
  check('me after logout → 401', r.status === 401);
  r = await hiker('POST', '/api/auth/login', { email, password: 'wrong-password' });
  check('login with a wrong password → 401', r.status === 401);
  r = await hiker('POST', '/api/auth/login', { email, password: 'smoke-test-pass' });
  check('login → 200', r.status === 200);

  // ---------- bookings (hiker)
  r = await hiker('POST', '/api/bookings', { slotId: dinner.id, partySize: 4 });
  check('book tomorrow\'s dinner for 4 → 201 with Location',
    r.status === 201 && /^\/api\/bookings\/\d+$/.test(r.headers.get('location') || ''));
  const bookingId = r.body?.id;
  r = await hiker('GET', `/api/bookings/${bookingId}`);
  check('read your own booking → 200', r.status === 200 && r.body?.partySize === 4);
  r = await hiker('POST', '/api/bookings', { slotId: dinner.id, partySize: 1 });
  check('the same slot again → 409', r.status === 409, r.body?.error);
  r = await hiker('POST', '/api/bookings', { slotId: lunch.id, partySize: 2 });
  check('more people than the free seats → 409', r.status === 409, r.body?.error);
  r = await hiker('POST', '/api/bookings', { slotId: lunch.id, partySize: 0 });
  check('party size 0 → 400', r.status === 400);
  r = await hiker('GET', `/api/public/slots?date=${day(0)}`);
  const todayLunch = r.body.find((s) => s.label === 'Lunch')?.bookingState;
  // Today's 12:00 lunch closes at 10:00 (2-hour rule).
  const lunchRuleOk = hutHour >= 10 ? todayLunch === 'tooLate' : todayLunch !== 'tooLate';
  check('today\'s lunch follows the 2-hour rule', lunchRuleOk, `${todayLunch} at ${hutHour}h`);
  r = await hiker('GET', '/api/bookings/1');
  check('someone else\'s booking → 404', r.status === 404);
  r = await hiker('GET', '/api/bookings/abc');
  check('a booking id that is not a number → 400', r.status === 400);

  // ---------- staff and roles
  const employee = client();
  r = await employee('POST', '/api/auth/login', { email: 'employee@example.com', password: 'employeepass' });
  check('employee login → 200', r.status === 200 && r.body?.role === 'employee');
  r = await employee('GET', `/api/slots?from=${day(0)}&to=${day(6)}`);
  check('employee: slots of the week, with tables → 200', r.status === 200 && r.body[0]?.tables?.length > 0,
    `${r.body.length} slots`);
  r = await employee('GET', `/api/slots?from=${day(0)}&to=${day(40)}`);
  check('slots over more than 31 days → 400', r.status === 400, r.body?.error);
  const target = day(10);
  const tables = [{ name: 'T1', seats: 4 }, { name: 'T2', seats: 6 }];
  const slot = (startTime, endTime, label, slotTables = tables) => ({
    date: target, startTime, endTime, label, tables: slotTables,
  });
  r = await employee('POST', '/api/slots', slot('15:00', '16:30', 'Smoke tea'));
  check('employee creates a slot → 201', r.status === 201 && r.body?.tables?.length === 2);
  r = await employee('POST', '/api/slots', slot('13:00', '15:30', 'Overlap'));
  check('a slot overlapping another → 409', r.status === 409, r.body?.error);
  r = await employee('POST', '/api/slots', slot('17:00', '16:00', 'Bad'));
  check('end before start → 400', r.status === 400, r.body?.error);
  const sameNames = [{ name: 'A', seats: 2 }, { name: 'A', seats: 2 }];
  r = await employee('POST', '/api/slots', slot('17:00', '18:00', 'Dup', sameNames));
  check('two tables with the same name → 400', r.status === 400, r.body?.error);
  r = await employee('POST', '/api/bookings', { slotId: dinner.id, partySize: 2 });
  check('employee cannot book as a hiker → 403', r.status === 403, r.body?.error);
  r = await hiker('GET', `/api/slots?from=${day(0)}&to=${day(6)}`);
  check('hiker cannot open the staff slots → 403', r.status === 403);
  const warden = client();
  await warden('POST', '/api/auth/login', { email: 'warden@example.com', password: 'wardenpass' });
  r = await warden('GET', `/api/slots?from=${day(0)}&to=${day(6)}`);
  check('warden passes the staff checks → 200', r.status === 200);

  // ---------- web pages (served by Express once D1 is in)
  r = await guest('GET', '/');
  if (r.status === 404) {
    console.log('INFO  GET / → 404: the pages are not served yet (D1: Express serves client/dist)');
  } else {
    check('GET / → the web app (HTML with the React root)', r.status === 200 && /id="root"/.test(String(r.body)));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (bookingId) console.log(`A confirmation email for booking ${bookingId} should be in the mailbox of ${email}.`);
  process.exit(failed ? 1 : 0);
}

main();
