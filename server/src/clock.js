// The only source of "now" for the server (planning 4.3, A6).
// Time rules (e.g. the 2-hour booking deadline) belong to the stories, not to this file.
//
// - Unit tests: setNow('2026-11-02T10:00') / resetNow()
// - E2E tests and demos: env variable FAKE_NOW (Playwright's clock only changes the browser)

let fixedNow = null;

export function now() {
  if (fixedNow) return new Date(fixedNow);
  if (process.env.FAKE_NOW) return new Date(process.env.FAKE_NOW);
  return new Date();
}

export function setNow(date) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) throw new TypeError(`Invalid date: ${date}`);
  fixedNow = value;
}

export function resetNow() {
  fixedNow = null;
}
