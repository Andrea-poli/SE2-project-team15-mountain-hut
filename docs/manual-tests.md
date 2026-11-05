# Manual tests

Part of the Definition of Done: every story is checked by hand with the seed data, on a phone-width window (360 px) and with the keyboard only.
Run `npm run seed` before each section below: some checks book seats and would change the next ones.
One row per check: what was checked, result. Minor axe findings that the E2E test lets through (printed by `e2e/helpers/axe.js`) are listed here too.

## Minor axe violations

None in the E2E run of 5 Nov 2026 (all scenarios, desktop and phone).

## Common base

| Check | Result |
|---|---|
| Fresh start: `npm run seed`, then `npm run dev`; the home page opens on http://localhost:5173 with no console errors (as a guest, the 401 of /api/auth/me is expected) | Pass |
| Navbar by role: guest (Check availability, Log in, Register), hiker@example.com (Check availability, Book a table, name, Log out), employee@example.com and warden@example.com (Slots, Check availability, name, Log out) | Pass |
| Log in with a wrong password → error message, focus on it; log in with hikerpass → home page; Log out → guest menu | Pass |
| Register a new hiker (all required fields, Italian mobile number) → logged in; the same email again → "Email already in use" | Pass |
| Keyboard only: Tab from the top shows "Skip to main content", Enter moves the focus to the page; every menu entry is reachable with Tab and visible focus | Pass |
| 360 px window: the menu collapses into "Open menu", no horizontal scroll on home, login and register | Pass |
| Protected pages: /book as guest → login page, then back to /book after logging in; /staff/slots as hiker → "Page not available" with a link to the home page | Pass |

## MH-01 Book a table

| Check | Result |
|---|---|
| hiker@example.com books the lunch in 4 days, 3 people → confirmation page with date, time, party and seating | Pass |
| marco.rossi@example.com books 10 people at tomorrow's first dinner turn (seed already has 12 seats taken) → booked on several tables, shown as "a + b seats" | Pass |
| Almost full: register a new hiker first (the four seed hikers already have a booking there), tomorrow's lunch for 2 → "Not enough seats available for this party"; for 1 → booked, then the lunch shows "– full" | Pass |
| hiker@example.com books tomorrow's first dinner turn again (seed already has her booking there) → "You already have a booking for this slot" | Pass |
| Full: the dinner in 3 days is listed "– full" and cannot be chosen; a past day cannot be chosen | Pass |
| Closing within 2 h: `FAKE_NOW=<today>T10:30` in `.env`, restart → today's lunch shows "booking closed" and cannot be booked | Pass |
| Closing within 2 h at the real time: in the afternoon, without `FAKE_NOW`, today's lunch is listed "– booking closed" and cannot be chosen | Pass |
| Keyboard only and 360 px: date, time and number of people filled and submitted without the mouse, no horizontal scroll | Pass |

## MH-02 Define slot capacity

| Check | Result |
|---|---|
| employee@example.com: the week view shows Mon–Sun, today marked, past days greyed with "Past"; Previous/Next week and Today work | Pass |
| Click a slot → its tables and seats open in place; click again → it closes | Pass |
| "Add slot" on a future day → form with that date; create Breakfast 08:00–09:00 with T1 4 seats + T2 6 seats → back to that week, "Slot created" message, total capacity 10 | Pass |
| Form errors: empty label, end before start, two tables with the same name, 0 seats, a slot overlapping Lunch → each error next to its field, nothing created | Pass |
| "Copy tables from" a nearby slot replaces the table rows; Cancel goes back to the week view | Pass |
| warden@example.com sees and uses the same pages; keyboard only and 360 px on both pages | Pass |

## MH-03 Receive confirmation

| Check | Result |
|---|---|
| After a booking, the server console (no SMTP_HOST) prints the email to the hiker with booking reference, name, date, slot and party size, and no table numbers (PO) | Pass |
| With a test mailbox (SMTP_* of Ethereal in .env) the email arrives and its text reads well on a phone | Pass |
| Hiker without phone or notes (marco.rossi@example.com) → email still complete, no "undefined" or empty lines | Pass |
| After a booking, the confirmation page shows the green line "A confirmation email has been sent to <the hiker's email>" (MH-03 FE1) | Pass |

## MH-04 Check availability

| Check | Result |
|---|---|
| Guest: tomorrow's dinner, 12 people → "Available", "2 + 4 + 6 seats", link "Log in or register to book"; after logging in the Book page opens prefilled | Pass |
| hiker@example.com: same check → "Book this table" opens the Book page prefilled; employee: no booking link | Pass |
| Tomorrow's dinner for 13, and tomorrow's lunch for 2 (almost full) → "Not available", no booking link and no other slots suggested | Pass |
| Guest: tomorrow's lunch for 1 (1 seat left) → "Available" with the seat split | Pass |
| "Check" with empty fields → an error under each wrong field, focus on the first one, nothing sent (the button is always enabled) | Pass |
| Changing any field after a result removes the result; a refresh keeps the values in the URL | Pass |
| Keyboard only and 360 px: the result is announced (screen reader / role="status") and readable without horizontal scroll | Pass |
