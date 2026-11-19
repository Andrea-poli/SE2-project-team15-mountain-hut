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

## Sprint 2 (C2)

Same setup as above: `npm run seed`, then `npm run dev`, browser on http://localhost:5173, with no SMTP_* in `.env` (every email is printed in the server console).
"Keyboard only" means: no mouse at all. Tab / Shift+Tab to move, Enter for links and buttons, Space for checkboxes and radios, arrows for selects and radio groups, Esc to close dialogs. The focus must always be visible and land where the check says.
"360 px" means: browser DevTools (F12) → device toolbar → width 360. No horizontal scroll, nothing cut off.
Days below are relative to the day of the seed ("in 3 days" = today + 3). Fill the Result column with Pass, or Fail plus a short note.

### MH-05 Provide party requirements

| Check | Result |
|---|---|
| hiker@example.com, Book a table: a free lunch in 5 days for 4 people, "Add" a requirement 3 times: "1 vegan, peanut allergy" with Allergies checked, "1 shellfish allergy" with Allergies checked, "2 vegetarians" without → booked; the confirmation lists the three, the two allergies clearly marked | Pass |
| The confirmation email in the server console lists the same three requirements, with the allergy mark on the first two | Pass |
| Add two requirements and leave the second description empty → "Enter a description for requirement 2." next to the field, the focus goes there, nothing booked | Pass |
| Remove a requirement → it disappears and the others keep their text and checkbox; booking with no requirements still works | Pass |
| Keyboard only: Add, type the description, Space on Allergies, remove, submit; after Add, Tab reaches the new description and its Allergies checkbox in order | Pass |
| 360 px: three requirements with long descriptions fit, no horizontal scroll | Pass |

### MH-06 Change a booking

| Check | Result |
|---|---|
| hiker@example.com, My bookings: every booking with date, slot and party; tomorrow's dinner says "Changes close 48 hours before the meal" and has no Change link; the dinner in 3 days has Change | Pass |
| Change the dinner in 3 days: the form is prefilled (date, time, party, requirements); move it to the lunch in 6 days → back on My bookings, "Booking changed", the card is highlighted and shows the new slot | Pass |
| Change the party size of that booking (e.g. 2 → 5) → "Booking changed", new seats shown; the server console prints a "changed" email with the new details | Pass |
| Change it to a slot without enough seats (the dinner in 3 days is full) → refused with a clear message, the booking stays as it was | Pass |
| Change only the requirements (add "1 gluten free" with Allergies) → saved; the Change form shows it next time | Pass |
| Save changes without changing anything → "Nothing to change", nothing sent, the booking stays the same | Pass |
| The time list of the Change form offers only slots starting at least 48 h from now (plus the booked one) | Pass |
| Keyboard only: Change link → form → Save changes; back on My bookings the message is announced (role="status") and the focus is on the page | Pass |
| 360 px: My bookings cards and the Change form, no horizontal scroll | Pass |

### MH-07 Reserve for a hiker

| Check | Result |
|---|---|
| employee@example.com: menu "New reservation" opens /staff/bookings/new; a hiker cannot open it ("Page not available") | Pass |
| Quick entry: first name "Giulia", mobile "333 765 4321", a free dinner in 5 days for 4 → "Reservation confirmed", marked temporary, seats shown as "a + b seats" without table names; no email, no password | Pass |
| Check availability for that dinner → fewer free seats than before | Pass |
| New hiker: first name, last name, a new email, mobile → confirmed; a generated password is shown once, "Copy password" says "Copied"; the staff never choose it | Pass |
| The same email again as New hiker → "Email already in use" next to Email | Pass |
| Log out, log in as the new hiker with the generated password → the page says the account was created by the hut staff and asks for a new password; other pages (e.g. /book) stay closed until it is changed; after the change → normal hiker menu | Pass |
| Existing hiker: search "rossi" and "340 123 4567" (with spaces) → Marco Rossi found, "Booking for: Marco Rossi"; book 3 people → confirmed with his name and email, not temporary | Pass |
| Search a name that does not exist → "Hiker not found" next to Search | Pass |
| Staff book today's slot that starts in less than 2 hours (`FAKE_NOW=<today>T10:30` in `.env`, restart, lunch at 12:00) → booked; as hiker@example.com the same slot shows "booking closed" | Pass |
| Staff cannot book a slot that has already started (`FAKE_NOW=<today>T12:30`, today's lunch) → "This slot has already started"; remove FAKE_NOW afterwards | Pass |
| Forgot password: Log in → "Forgot your password?" → email of hiker@example.com → "Send the link" → the message names the email; the server console prints the email with the link | Pass |
| Open the link → new password twice → "Save the new password" → "password has been changed" → log in with it works; the same link again → "not valid" with a link to ask for a new one | Pass |
| Forgot password with an email that does not exist → the same message (nothing tells whether the account exists) | Pass |
| Keyboard only: the three modes (radios with arrows), search and choose a hiker, the whole form, Copy password; after an error the focus goes to the wrong field | Pass |
| 360 px: New reservation, confirmation with password, Forgot / Reset / Change password pages | Pass |

### MH-08 Cancel a booking

| Check | Result |
|---|---|
| hiker@example.com, My bookings: "Cancel booking" on every booking not started yet, also on tomorrow's dinner (inside the 48 hours: no time limit, PO) | Pass |
| Cancel booking → dialog "Cancel this booking?" with date, slot and party; the focus is on "Keep it"; "Keep it" and Esc close it and change nothing | Pass |
| "Yes, cancel booking" → "Booking cancelled. We sent you an email.", the card shows Cancelled and has no Change or Cancel; the server console prints the cancellation email | Pass |
| Check availability for that slot → the seats are free again; employee, Slots → the booking is gone from the tables of that slot | Pass |
| After a refresh the booking is still Cancelled; anna.bianchi's cancelled seed booking (lunch in 3 days) is shown as Cancelled too | Pass |
| Keyboard only: Tab to Cancel booking, Enter, the focus stays inside the dialog (Tab cycles), Enter on "Yes, cancel booking"; afterwards the focus is not lost (it is on the message or the page) | Pass |
| 360 px: the dialog fits, buttons readable | Pass |

### MH-09 Repeat a weekly schedule

| Check | Result |
|---|---|
| employee@example.com, Slots: "Copy week" → dialog "Copy the slots of <this week>, with their tables, into:"; Previous / Next week move the target week | Pass |
| Target: the week after next (seed slots, no bookings) → the dialog warns that its slots will be replaced; "Copy slots" → summary "… copied", the page shows the target week with the same slots and tables (open Monday's lunch: same tables and seats) | Pass |
| Target: an empty week (go 3 weeks ahead first) → no warning, slots copied | Pass |
| Target: a week with bookings still to come (show next week, Copy week, Previous week to this week) → "This week has bookings: choose another week.", Copy slots disabled, nothing changed | Pass |
| Cancel and Esc close the dialog without copying | Pass |
| warden@example.com can copy too; a hiker has no Copy week | Pass |
| Keyboard only: open the dialog, change week, Copy slots; the focus starts in the dialog, stays inside, and after an error moves to the message | Pass |
| 360 px: dialog and the week view after the copy, no horizontal scroll | Pass |

### Common base, sprint 2

| Check | Result |
|---|---|
| Navbar: hiker sees My bookings; employee and warden see New reservation; guest sees neither | Pass |
| Docker image (README, Docker section): `docker run` with an env file → the app opens, log in with the demo accounts works, a booking prints or sends its email | Pass |
| `npm run test:e2e` → all passing; minor axe violations printed, if any, copied in "Minor axe violations" above | Pass |
