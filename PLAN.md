# PLAN: Student lifecycle, QR attendance, seats, memberships & payments

**Status (2026-10-16, revision 5):** adds **admin-controlled QR/OTP access per library**, with SMS credits, monthly limits and a credit ledger (§12). It **awaits approval**. Changes since revision 4 are marked 🆕5.

Earlier revisions added manual demo admission, manual attendance and a QR switch. Revision 5 **moves that switch from the librarian to the admin**.

**Delivered 2026-10-16 (ahead of the phase order, on request):**
- The QR switch (`otpEnabled`, default off).
- The per-phone daily OTP limit.
- **Add Demo Student** (manual).
- The **QR demo form** (unregistered number → demo starts → checked in).
- Demo extend / end / lazy expiry.
- Manual Present/Absent.
- The tabbed Students page (Demo · All · Demo Ended · Expired · Blocked).
- **Collect fee & activate**, with Membership + Payment records, receipt numbers and double-click safety.

Verified by 154 e2e checks and 38 unit tests.

**Deviations from this plan:**
- Demo seats use the existing one-student-per-seat model; shift-wise `SeatAssignment` / R3 sharing is still Phase 3.
- Not built yet: the printable receipt page, the Pending Payments tab and ESLint.

**Revision 4 change:** a new student who scans the QR fills the demo form and **their demo starts immediately** — there is no librarian approval step and no "New Requests" list. Everything the QR does can also be done manually by the librarian (§2.3).

- **Phase 1 is already built and verified:**
  - 100/100 end-to-end checks in `scripts/e2e-phase1.mjs`
  - 34 unit tests
  - build passing
- **Phase 1.1** is a small set of gaps in Phase 1 found against the new spec (§10).
- **Phases 2–4** are not started.
- **No source code changes** until this revision is approved.

The previous version of this plan is in git (commit `86c1255`).

Stack: Next.js 16 App Router · React 19 · TypeScript · **MongoDB + Mongoose 9** (no Prisma) · Tailwind v4 + shadcn/ui · zod · Vercel.

---

## 0. Decisions

### 0.1 Already approved (still in force)

| # | Decision |
|---|---|
| D1 | SMS goes through a pluggable `OtpChannel`. The provider is chosen in `.env` (`OTP_CHANNEL` = fast2sms / msg91 / 2factor / twilio / webhook / console). `OTP_TEST_MODE=true` shows the code on screen for free testing. |
| D2 | OTP once per device, then a 30-day per-library student session cookie. |
| D3 | Signed QR plus an optional geofence. |
| D4 | Student check-in keeps working for 7 days after the librarian's own plan lapses. |
| D5 | One protected cron endpoint, called every 15 minutes (cron-job.org or Vercel Pro). Every rule is also enforced lazily at scan time and on list reads. |
| D6 | Receipts and reports are print-optimized HTML (the browser saves them as PDF). CSV for exports. |
| D7 | The live seat map polls every 10–30 s. |

### 0.2 New decisions for this revision (defaults apply unless you change them)

| # | Question | Default | Why |
|---|---|---|---|
| D8 🆕 | What does "3-day demo" mean exactly? | **Default end date = start date + 3 days, as your new spec says, editable on the manual form.** Both dates are calendar dates in the library's timezone and are **inclusive**. Start Monday → default end Thursday, so attendance is allowed Mon–Thu, and the demo expires after Thursday 23:59. QR approval uses the same rule. | Your spec gives the default explicitly. If you meant exactly 3 days (Mon–Wed), say so and the default becomes start + 2. |
| D9 | Phone storage format | **E.164 `+91XXXXXXXXXX`** everywhere (already implemented). The original input is kept in `phoneRaw`. | Works for non-Indian numbers too; SMS providers need it. |
| D10 | "Delete/Archive" on Demo Ended | **Archive only** (soft: `archivedAt`). Archived students are hidden from lists, kept in the DB and in reports. No hard delete for students who have attendance or payments. | Never lose history. |
| D11 | Is partial payment allowed at activation? | **Yes.** Status is PARTIAL and the student appears in Pending Payments. Controlled by the library setting `allowPartialPayment` (default on). | Matches the spec ("if partial payment is allowed"). |
| D12 | Lint | **Add ESLint** (`eslint` + `eslint-config-next`, flat config) in Phase 1.1. Errors are fixed in new and changed files; legacy issues are reported as warnings, not mass-rewritten. | `npm run lint` currently fails: eslint is not installed. |
| D13 | Where the student lists live | **Refactor the existing `/librarian/students` page into tabs** (not a new page): Demo Students, All Students (= ACTIVE_MEMBER), Demo Ended, Expired, Pending Payments. 🆕 No New Requests tab. The sidebar keeps one "Students" entry, with a badge counting demos started today. | Avoids a parallel student UI. |
| D14 | The existing "Memberships" page | Keep its "send expiry reminders" action. In Phase 3 it becomes **Plans & Payments**: membership plans, Pending Payments, receipts. | Reuse, no duplicate page. |
| D15 🆕 ~~superseded by §12~~ | QR/OTP for libraries that already use it | `settings.otpEnabled` defaults to **false for every library**, including existing ones (your spec: "false initially"). Librarians turn it on in Settings. | **Behaviour change:** a library that is testing QR check-in today stops working until the switch is turned on. Nothing is deleted. |
| D16 🆕 | ID proof privacy | ID proofs are uploaded as **private** Cloudinary files (`type: authenticated`), never public URLs. They are viewable only by the library's librarian, through a link that expires in 5 minutes. Photos are normal public images. | ID documents are sensitive personal data. |
| D17 🆕 | What "Mark Present" records | A present record with **no real times**: `checkInAt = shift start`, `checkOutAt = shift end`, `timesRecorded = false`. Study-hour totals and "Late" ignore such records. Manual Check In / Check Out record real times. | Roll-call style attendance without inventing study hours. |
| D18 🆕 | Where the form lives | A new page **`/librarian/students/add-demo`**: a sidebar item "Add Demo Student", plus a button on the Demo Students tab. The existing Add Student form stays for direct paid members. | Clear separation; reuses the existing form layout and components. |
| D19 🆕5 | Does OTP **verify** cost a credit? | **No.** One credit per OTP **send** (one SMS). Verify checks access and writes a ledger entry with 0 credits. | Your spec says send *and* verify "deduct", but verify sends no SMS, so charging for it bills twice per login. If you really want verify charged, it's a one-line change. |
| D20 🆕5 | What "QR on, OTP off" means | **Phones that are already verified keep checking in. New phones can't be verified** (OTP send/verify refused). QR + access status gate every QR route; OTP + credits gate only the OTP routes. | Lets an admin stop SMS spending without stopping attendance for students who are already verified. With all four checks on every route, a library with 0 credits couldn't even scan. |
| D21 🆕5 | Test mode / console channel | **Uses no credits.** The ledger records `provider: console`, 0 credits. The access flags still apply. | No SMS is sent, so there is nothing to bill. |
| D22 🆕5 | Libraries that turned QR on themselves (revisions 3–4) | The migration **keeps their setting** (both flags on), with `smsCreditBalance = 0`. Their students keep scanning; new OTPs return 402 until the admin adds credits. | Doesn't silently break a library already using QR; spending still needs admin action. |
| D23 🆕5 | When does `accessStatus` become EXPIRED? | When the admin sets it, or automatically once the optional `accessExpiresAt` (set by the admin) passes. Checked lazily on every QR call. | Your spec lists EXPIRED but not what triggers it. |
| D24 🆕5 | Monthly limit hit | **429 `MONTHLY_OTP_LIMIT`** (distinct from 402 "no credits"). `monthlyOtpLimit = null` means no monthly limit. The counter resets on the 1st of each month in the library's timezone. | Different cause, different fix: wait vs. buy credits. |

---

## 1. Current state analysis

### 1.1 Already exists (Phase 1 + follow-up work)

| Area | What is there | Files |
|---|---|---|
| Tenant | `Library` model is the tenant. `User.libraryId`. Lazy `ensureLibraryForUser` with backfill. `requireLibraryContext` guard (libraryId always from session). `libraryIdFor()` for older routes. Re-runnable `scripts/migrate-libraries.ts` (dry-run by default, reports duplicate phones/emails, builds unique indexes only when clean). | `lib/models/Library.ts`, `lib/services/library.ts`, `lib/middleware/auth.ts` |
| Student | `status` field (PENDING, DEMO, ACTIVE_MEMBER, EXPIRED, DEMO_ENDED, REJECTED, BLOCKED; only ACTIVE_MEMBER, EXPIRED and BLOCKED are used so far). E.164 phone + `phoneRaw`. `shiftId`. One phone and one email per library (API + unique partial indexes). Block/unblock. Status derived from membership dates on add/edit. | `lib/models/Students.ts`, `app/api/students/*`, `lib/services/student-status.ts` |
| QR | Signed URL `/checkin/<slug>?k=<hmac>` (no personal data). Rotation via `qrVersion`. Library QR page: view, copy, download, print poster, regenerate. | `app/librarian/library-qr`, `app/api/library/qr*` |
| OTP | HMAC-hashed codes, 5-minute expiry, 5 attempts, 60 s cooldown, 5 sends/phone/hour, 500 sends/library/day, IP limit, constant-time compare. Five SMS providers + test mode. | `lib/services/student-otp.ts`, `lib/otp/channels.ts` |
| Check-in | Mobile flow: phone → OTP → scan. State machine covering CHECKED_IN, CHECKED_OUT, ALREADY_CHECKED_OUT, RENEWAL_REQUIRED, ACCESS_DENIED, NOT_REGISTERED, AWAITING_APPROVAL, OUTSIDE_SHIFT_HOURS, LIBRARY_UNAVAILABLE, OUT_OF_RANGE. 2-minute repeat-scan guard. Confirmation screen (library, name, seat, shift, membership days left, check-in time, Present/Late, expiring warning). | `app/checkin/[slug]`, `lib/services/checkin.ts` |
| Attendance | `Attendance` model with every spec field plus `arrivalStatus`, `lateMinutes`, `leftEarly`, `autoCheckedOut`, `manuallyEdited`, `note`. Unique `{studentId, shiftId, date}`. Lazy auto check-out at shift end + 30 min. Attendance page: filters, "Late by X", Inside now, manual check-in/out/override. Dashboard card. | `lib/models/Attendance.ts`, `lib/services/attendance.ts`, `app/librarian/attendance` |
| Shifts | `Shift` model, CRUD page, midnight-crossing support, default "Full Day". | `lib/models/Shift.ts`, `app/librarian/shifts` |
| Settings | Library profile, timezone, `graceMinutes` (default 15), `earlyCheckinMinutes`, `demoDays` (default 3, not yet used), `expiringSoonDays`, geofence. | `components/librarian/library-settings-card.tsx` |
| Seats (v1.5) | One student per seat (no shifts). Computed state: available / assigned / occupied (inside now) / expired. Colour seat map, bulk add, assign/move/release with conflict check, "Free expired seats", audit. | `app/librarian/seats`, `lib/services/seats.ts`, `lib/services/seat-view.ts` |
| Audit | `AuditLog`. Logged so far: librarian login, manual attendance, QR rotation, settings, shifts, seats. | `lib/services/audit.ts` |
| Tests | Vitest units (time, phone, attendance rules, OTP providers, URL scheme). Node e2e on a throwaway local Mongo (100 checks). | `tests/`, `scripts/e2e-phase1.mjs` |

### 1.2 Missing

- **Registration and demo:** 🆕 the QR demo form (starts the demo directly); the DEMO lifecycle (start/end, extend, end now); DEMO attendance; demo expiry.
- **Membership and payments:**
  - `MembershipPlan`, `Membership`, `Payment`, receipt numbers, the activation modal, Pending Payments.
  - The six status-driven student lists.
- **Shift-wise seats:**
  - `Section`, `SeatAssignment` (shift-wise, date-ranged, DEMO_HOLD / ACTIVE).
  - The REQUESTED and DEMO_HOLD seat states.
  - Seat history.
- **Background and admin work:**
  - The cron endpoint: ABSENT marking, demo and membership expiry, seat release.
  - Reports and CSV.
  - The "My Library" student page and printable receipts.
  - Admin library management, revenue, the audit viewer.
- 🆕 **Manual operation without QR:** the "Add Demo Student" form, manual Present/Absent, and the `otpEnabled` switch.
- **Phase 1 gaps (→ Phase 1.1):**
  - per-phone *daily* OTP limit
  - ESLint

### 1.3 Needs refactoring (no parallel systems)

| Today | Becomes | How (backward compatible) |
|---|---|---|
| `Seat.studentId` (one holder per seat) | `SeatAssignment` per (seat, shift, date range) is the source of truth | Migration converts each held seat into an ACTIVE assignment on the student's shift. `Seat.studentId` / `Student.seatNumber` stay as a **mirror** of the student's primary active assignment, so books issue, the student list and the existing forms keep working. `lib/services/seats.ts` keeps its exported signatures and delegates to `seat-assignments.ts`. |
| Membership dates on `Student` (`membershipStartDate/EndDate`, `paymentStatus`) | `Membership` + `Payment` documents | The migration creates one `Membership` per student from the existing dates. The Student fields stay as a mirror of the *current* membership, so the existing pages and reminder emails keep working. |
| `/librarian/students` (one flat list) | A tabbed page with the six lists (D13) | Same route. The existing edit/delete dialogs are reused inside the tabs. |
| `Student.address` (🆕 **existing bug**) | Added to the schema | The Add Student form sends an address, but the model has no `address` field, so Mongoose silently drops it today. Adding the field fixes this; old students simply have none. |
| `/librarian/students/add` | Unchanged form. Creates an ACTIVE_MEMBER (walk-in). Phase 3 adds plan + payment fields so a Membership and Payment are created too. | Additive. |
| Seat states available/assigned/occupied/expired | AVAILABLE / REQUESTED / DEMO_HOLD / ASSIGNED / OCCUPIED / EXPIRED per shift | The same seat-map component gains a shift filter and two colours. |

---

## 2. Student lifecycle (single source of truth)

### 2.1 Statuses and lists

| Status | Meaning | Librarian list (tab) | QR scan result | Attendance |
|---|---|---|---|---|
| `PENDING` | 🆕 *Not used.* QR registration starts the demo directly. Kept in the enum only so old data and a possible future approval mode still validate. | – | – | ✗ |
| `DEMO` | Demo running (started from the QR form or by the librarian) | **Demo Students** | Check-in/out | ✓ `entryType=DEMO` |
| `ACTIVE_MEMBER` | Membership active (paid or partially paid) | **All Students / Active Members** | Check-in/out | ✓ `entryType=MEMBER` |
| `DEMO_ENDED` | Demo finished, no membership | **Demo Ended / Follow-up** | Activation/renewal screen (R5) | ✗ |
| `EXPIRED` | Paid membership ended | **Expired Members** | Membership expired screen (R5) | ✗ |
| `BLOCKED` | Blocked by the librarian | Shown in the list matching `statusBeforeBlock`, with a Blocked badge, plus a "Blocked" filter | Access denied | ✗ |
| `REJECTED` (internal) | 🆕 Not used (no approval step); kept in the enum | – | – | ✗ |

**Pending Payments** is a cross-cutting list: any student whose current membership has `dueAmount > 0`, whatever their status.

**List movement is purely status-driven.** Every list endpoint filters by `status`, so a status change *is* the move. The UI refetches after every mutation, which means a student activated in the Demo tab disappears from it and appears in All Students straight after the API responds.

### 2.2 Transitions (all server-side, all audited)

```
QR demo form ─────┐
                  ├──► DEMO ──activate (fee)──► ACTIVE_MEMBER ──expire──► EXPIRED
Add Demo Student ─┘     │  ▲                         ▲   │                    │
(librarian)        end/expire extend                 │   └──────renew─◄───────┘
                        ▼                            │
                    DEMO_ENDED ──activate (fee)──────┘
any ──block──► BLOCKED ──unblock──► status derived again from demo/membership dates
walk-in (Add Student form) ─────► ACTIVE_MEMBER
```

The "expire" edges run in three places, all through the same idempotent service function:
1. the cron (Phase 4),
2. lazily at scan time (Phase 1+),
3. lazily when the librarian opens a list (Phase 2+).

That way a missed cron run never shows a stale status.

---

### 2.3 🆕 Two ways in, one lifecycle

| | Manual admission (default) | QR self-registration (only if `otpEnabled`) |
|---|---|---|
| Who starts it | Librarian, using the **Add Demo Student** form | Student: scan QR → verify OTP → fill the demo form |
| Resulting status | **DEMO** immediately | 🆕 **DEMO** immediately (no approval) |
| Seat | Chosen by the librarian from available seats → `SeatAssignment` **DEMO_HOLD** | 🆕 Chosen by the student from seats free for their shift → **DEMO_HOLD**. If no seat is free, the demo starts without a seat and the librarian assigns one later. |
| `registrationSource` | `MANUAL` | `QR` |
| Demo dates | Entered on the form (default start + 3 days, editable) | 🆕 Today → today + `demoDays` (D8); the student can't change them |
| Attendance | Manual (Present / Absent / Check in / Check out) | 🆕 **Checked in straight after the form** if inside a shift window; then QR scans. Manual is always available too. |

**🆕 Every QR action has a manual equivalent**, so a library that doesn't use QR loses nothing:

| What happens with QR | Same thing done by the librarian |
|---|---|
| Unregistered number → demo form → demo starts | **Add Demo Student** form |
| Registered student scans → check-in / check-out | Attendance page → **Check in / Check out** (or **Present / Absent**) |
| Expired student scans → renewal screen | Expired Members tab → **Renew** |
| Student sees seat, shift, days left | Student detail drawer shows the same |

**After that the lifecycle is identical:** Demo → activate (fee) → Active Member → Expired, with the same lists and rules. Manual attendance works whatever the `otpEnabled` setting.

**When `otpEnabled = false`** (the default):
- **Public QR routes** (`/api/checkin/*`) return **403 `QR_DISABLED`**, and the check-in page shows "QR check-in isn't used at this library — please check in at the desk."
- **Library QR page:** shows "QR check-in is off" with a link to Settings; download and print are disabled.
- **Dashboard and sidebar** promote the manual flow:
  - quick actions "Add Demo Student" and "Take attendance";
  - "Library QR" stays in the menu with an "Off" badge;
- **Nothing is deleted:** QR sessions, OTP records and the QR signature stay as they are, so turning the switch on later makes everything work again.

---

## 3. Binding rules

**R1, R2, R5, R8 and R9 are unchanged from the approved plan.** R3, R4 and R6 are refined. R10–R12 are new.

**R1 – Scans.**
- First scan of a shift occurrence = check-in. Second = check-out. Third and later = "You have already checked out today."
- A repeat scan within 2 minutes of check-in = "Already checked in" (no check-out).
- Auto check-out once shift end + 30 min has passed: `checkOutAt = shift end`, `autoCheckedOut = true`.
- Check-ins are accepted from start − `earlyCheckinMinutes` (default 60) until shift end.

**R2 – Late.**
- `settings.graceMinutes` (default 15). Late means `checkInAt > shiftStart + grace`.
- Displayed as "Late by 25 min" / "Late by 1 hour 30 min".

**R3 – Seat conflict (🆕 Phase 2, needed by demo holds).**
- A seat cannot have two assignments with status `ACTIVE` or `DEMO_HOLD` whose shift time windows overlap (compared on a 24-hour circle; touching edges don't overlap) **and** whose date ranges overlap.
- Full Day conflicts with Morning, Evening and Night. Non-overlapping Morning (06–14) and Evening (14–24) can share a seat.
- Enforced by a per-seat atomic lock plus a re-check, and a transaction when available.

**R4 – Demo expiry.**
- Run by the cron, at scan time and on list reads, for every student with `status = DEMO` and `now > demoEndDate`:
  - status → `DEMO_ENDED`
  - their DEMO_HOLD assignment → `EXPIRED` (`endDate = now`)
  - the seat becomes AVAILABLE for that shift
  - an audit entry is written
- Members whose `membership.endDate` has passed are handled the same way → `EXPIRED`, with their seat released.

**R5 – Ended or expired student scans the QR.**
- They see the end date and a renewal option: the library phone with Call, plus the active plans from Phase 3.
- No attendance is written; their history is kept.

**R6 – Payments.** See §4.3. Modes are CASH / UPI / BANK_TRANSFER; status is PAID / PARTIAL / PENDING. Receipt numbers are unique per library and come from an atomic counter.

**R7 – Seat Utilisation Report.** Seat, assigned student, shift, present days, absent days, total study hours, last visit.

**R8 – Audit actions.**

| Action | Phase |
|---|---|
| Librarian login | 1 |
| Manual attendance | 1 |
| Seat assign / release | 1 |
| Registration | 2 |
| Demo started (QR or manual) | 2 |
| Demo extend / end | 2 |
| Membership activate / renew / expire | 3 |
| Payment entry | 3 |
| Library status change | 4 |
| 🆕5 QR/OTP access change, credits added/adjusted, limit change | 2.5 |

**R9 – Notifications (minimal).**

| Notification | Phase |
|---|---|
| OTP SMS | 1 |
| Seat-assignment confirmation | 3 |
| Payment receipt | 3 |
| Membership expiry reminder | 4 |

Email where an address exists. No WhatsApp automation.

**R10 – Demo.**
- 🆕 **Manual admission** → `DEMO` straight away, with the dates entered on the form. Default end = start + `demoDays` (D8). The seat is required and becomes a `DEMO_HOLD`.
- 🆕 **QR demo form** → `DEMO` immediately, `demoStartDate = today`, `demoEndDate = today + demoDays` (D8; `demoDays` default 3). The seat the student picked becomes a `DEMO_HOLD`. If it was taken in the meantime → "That seat was just taken, pick another". If no seat is free at all, the demo starts without one. The student is then **checked in at once** when a shift window is open (R1).
- 🆕 **One demo per phone per library, ever.** A number that already had a demo (DEMO_ENDED) or membership never sees the form again; it gets the renewal screen (R5).
- **Extend** by 1–3 days (cumulative cap: 7 extra days). This also extends the DEMO_HOLD.
- **End now** → DEMO_ENDED immediately (R4 effects).
- **Activate early** is allowed at any time during the demo.

**R11 – Activation** is one service call: `activateMembership(student, input)`. Validation and seat availability are checked first, then everything is written:
- `Membership` (ACTIVE)
- `Payment` (PAID or PARTIAL, receipt number)
- `SeatAssignment`: 🆕 the **same document** changes `status` from `DEMO_HOLD` to `ACTIVE` with the membership dates, or a new ACTIVE one if the librarian picks another seat — then the old hold is released)
- Student → `ACTIVE_MEMBER`, with the mirror fields updated

A Mongo transaction is used where available (Atlas = yes). Without one, writes happen in that order with compensating rollback on failure. Activation is idempotent per request: a client `requestId` is stored on the Payment, so a double click doesn't charge twice.

**R12 – Seat display states (Phase 3), per selected shift and date:**

| State | When |
|---|---|
| OCCUPIED | The holder is checked in now |
| ASSIGNED | An ACTIVE assignment exists |
| DEMO_HOLD | A DEMO_HOLD assignment exists |
| REQUESTED | 🆕 Not used without an approval step (kept for a future approval mode) |
| EXPIRED | Seat inactive, or its holder's membership/demo lapsed and the seat isn't released yet |
| AVAILABLE | None of the above |

Colours: green available · blue requested · yellow demo hold · purple assigned · red occupied · grey expired/inactive.

**R13 🆕 – QR/OTP switch.**
- `Library.settings.otpEnabled` (default `false`) gates every route under `/api/checkin/*`: info, OTP send/verify, scan, register.
- When it is off they return **403 `QR_DISABLED`** before any OTP is generated or any SMS is spent. Manual routes are never gated.
- Turning it on or off is audited (`library.otp_toggled`).
- Turning it on while no SMS provider is configured shows a warning in Settings: "Students will see the code on screen (test mode)" or "Text messages are not set up".

**R14 🆕 – Manual attendance** (works for any `otpEnabled` value). Allowed only for students with status `DEMO` or `ACTIVE_MEMBER`, on dates inside their demo or membership period, for today or past dates (never the future). `entryType` comes from the student's status at that date (DEMO/MEMBER) and `source = MANUAL`. Every action is audited.

| Action | Effect |
|---|---|
| **Mark Present** | Creates a PRESENT record with `timesRecorded = false` (D17). If a record already exists, it upgrades ABSENT → PRESENT. |
| **Mark Absent** | Creates an ABSENT record with no times. If the student has already checked in, this needs `force: true` and a note; it clears the check-in. |
| **Check In** | Records the real time (default now). Present/Late follows R2. 409 if already checked in. |
| **Check Out** | Records the real time. 409 if not checked in. 400 if earlier than check-in. |

**R15 🆕 – Validation and exact error messages** (manual admission, seat assignment, activation)

| Problem | HTTP | Message |
|---|---|---|
| Missing required field | 400 | "Full name is required." / "Mobile number is required." / "Choose a shift." / "Choose a seat." / "Demo start date is required." |
| Bad phone | 400 | "Enter a valid 10-digit mobile number." (same check for the parent contact) |
| Duplicate phone, same library | 409 | "This mobile number is already registered to {name}." |
| Duplicate email, same library | 409 | "This email is already registered to {name}." |
| Start date in the past | 400 | "Demo start date can't be in the past." |
| End before start | 400 | "Demo end date must be on or after the start date." |
| Demo longer than 30 days | 400 | "A demo can be at most 30 days." |
| Seat taken, same shift and dates | 409 | "Seat {n} is already held by {name} ({shift}) from {d1} to {d2}." |
| Seat taken by a Full Day booking | 409 | "Seat {n} is booked by {name} for the Full Day shift, which overlaps {selected shift}." |
| Seat freed and retaken during submit | 409 | "Seat {n} was just taken. Pick another seat." (the availability list refreshes) |
| Upload too large or wrong type | 400 | "Photo must be a JPG, PNG or WebP under 5 MB." / "ID proof must be a JPG, PNG, WebP or PDF under 5 MB." |
| Uploads not configured | 503 on the upload only | The form submits without the files and shows "Photo/ID upload isn't set up yet." |

---

## 4. Database changes

All changes are additive. Nothing is dropped. Every new model uses `defineModel` (safe under dev hot reload).

### 4.1 New fields on existing models

| Model | New fields | Phase |
|---|---|---|
| `Student` | 🆕 `registrationSource` (`MANUAL` / `QR`; existing students → `MANUAL`), 🆕 `address` (fixes the dropped-field bug), 🆕 `examTarget`, 🆕 `collegeName`, 🆕 `parentContact` (E.164), 🆕 `notes`, 🆕 `idProof` (`{publicId, format, bytes, uploadedAt}`, private, D16), `photoUrl`, `preferredShiftId`, `preferredSectionId`, `preferredSeatId`, `requestedAt`, `demoStartDate`, `demoEndDate`, `demoExtendedDays` (0–7), `approvedAt`, `approvedBy`, `rejectedAt`, `rejectionReason`, `statusBeforeBlock`, `archivedAt`, `currentMembershipId`. `email` becomes **optional** for QR registrants; the unique email index already ignores missing emails. | 2 / 3 |
| `Library` | 🆕 `settings.otpEnabled` (**false**, D15), `settings.demoMaxExtensionDays` (7), `settings.allowPartialPayment` (true). `receiptSeq` already exists. | 🆕 1.1 / 2 / 3 |
| `Attendance` 🆕 | `timesRecorded` (default true; false for Mark Present/Absent, D17) | 2 |
| `Seat` | `sectionId`, `seatType` (free label, e.g. AC/Window), `isActive`, `lockUntil` | 3 |
| `StudentOtp` | `dayKey`, `dayCount` (per-phone daily limit) | 1.1 |

### 4.2 New models

| Model | Key fields | Indexes |
|---|---|---|
| `Section` (3) | `libraryId`, `name`, `description`, `sortOrder`, `isActive` | `{libraryId, name}` unique (case-insensitive) |
| `SeatAssignment` (🆕 **2**) | `libraryId`, `seatId`, `shiftId`, `studentId`, 🆕 `status` (`DEMO_HOLD` / `ACTIVE` / `RELEASED` / `EXPIRED`; one field, matching your spec wording), `startDate`, `endDate`, `membershipId?`, `createdBy`, `releasedAt`, `releasedBy`, `releaseReason` | `{seatId, shiftId, startDate, endDate}`, `{libraryId, studentId, status}`, `{libraryId, status, endDate}` |
| `MembershipPlan` (3) | `libraryId`, `name`, `durationDays` (30/90/365/custom), `price`, `isActive`, `sortOrder` | `{libraryId, isActive, sortOrder}` |
| `Membership` (3) | `libraryId`, `studentId`, `planId?`, `planName` (snapshot), `startDate`, `endDate`, `fee` (snapshot), `paidTotal`, `dueAmount`, `paymentStatus` (`PAID` / `PARTIAL` / `PENDING`), `status` (`ACTIVE` / `EXPIRED` / `CANCELLED`), `shiftId`, `seatAssignmentId?`, `createdBy`, `source` (`ACTIVATION` / `RENEWAL` / `MIGRATED` / `WALK_IN`) | `{libraryId, studentId, status}`, `{libraryId, endDate}`, `{libraryId, dueAmount}` |
| `Payment` (3) | `libraryId`, `studentId`, `membershipId`, `amount` (total fee snapshot), `paidAmount` (this payment), `dueAmount` (remaining after it), `paymentMethod` (`CASH` / `UPI` / `BANK_TRANSFER`), `reference?`, `receiptNumber`, `status` (`PAID` / `PARTIAL` / `PENDING`), `paidAt`, `collectedBy`, `requestId` (idempotency) | `{libraryId, receiptNumber}` unique, `{libraryId, paidAt}`, `{libraryId, studentId, paidAt}`, `{libraryId, requestId}` unique sparse |
| `ShiftRun` (4) | `libraryId`, `shiftId`, `date`, `ranAt`, `absentMarked`, `autoClosed` | `{libraryId, shiftId, date}` unique (cron idempotency) |
| `PlatformPayment` (4) | `libraryId`, `planId`, `amount`, `recordedBy`, `periodStart`, `periodEnd` | `{libraryId, createdAt}` |

**Spec indexes:**
- `libraryId + phone`: ✅ exists, unique partial.
- `studentId + date`: ✅ exists.
- `libraryId + date`: ✅ exists.
- `seatId + shiftId + date`: ✅ exists on Attendance; Phase 3 adds the SeatAssignment range index.

### 4.3 Payment arithmetic (R6/R11)

`Membership.fee` = total. Each `Payment` has the following fields:

| Field | Meaning |
|---|---|
| `paidAmount` | This instalment |
| `amount` | The fee snapshot |
| `dueAmount` | `fee − paidTotal` after this payment |
| `status` | `PAID` if `dueAmount = 0`, `PARTIAL` if `0 < dueAmount < fee`, `PENDING` if `paidAmount = 0` |

The membership mirrors `paidTotal`, `dueAmount` and `paymentStatus`. Amounts are stored in **whole rupees (integers)** to avoid float errors. Overpayment is refused.

### 4.4 Backfill and migration (re-runnable, dry-run first)

All of these live in `scripts/migrate-libraries.ts`; each phase adds a step.

| Step | Phase | What it does |
|---|---|---|
| 1 | 1 ✅ | Libraries, `libraryId` backfill, E.164 phones, status from dates, default shift, unique phone/email indexes when clean, duplicate report |
| 1.1 🆕 | 1.1 | Set `settings.otpEnabled = false` on every library that doesn't have the field yet (D15) |
| 2 | 2 | Set `registrationSource: 'MANUAL'` on existing students. Convert each held seat into an `ACTIVE` `SeatAssignment` on the student's shift (moved from step 3). Ensure `demoDays` is in settings. |
| 3 | 3 | For each student with membership dates, create `Membership` (`source: MIGRATED`, `fee: 0`, PAID if `paymentStatus = paid`, else PENDING with `dueAmount 0`; amounts are never invented). Create a default "General" section. |
| 4 | 4 | `ShiftRun` / `PlatformPayment` indexes. Nothing to backfill. |

**Order in production:**
1. Deploy code that reads old and new shapes.
2. Run the dry run.
3. Run `--apply`.
4. Enable the cron.

Each phase's code works before its migration step has run (lazy fallbacks), so a deploy is never broken by ordering.

---

## 5. API endpoints

Conventions:
- Responses are `{ success, data?, message?, error?, code? }`.
- Validation uses zod and returns 400 with `issues`.
- Another library's IDs return **404**.
- Every mutation is audited.

Roles:
- **L** = librarian, via `requireLibraryContext`.
- **A** = admin, via `requireAdmin`.
- **S** = student, via the per-library session cookie plus a valid QR `k`.
- **P** = public.
- **C** = cron, via `Authorization: Bearer $CRON_SECRET`.

### 5.1 Phase 1 (exists): summary

| Method | Route | Role | Notes |
|---|---|---|---|
| GET | `/api/checkin/[slug]?k=` | P | Library name/phone, available, timezone, geofence, masked session. 404 on bad QR. |
| POST | `/api/checkin/[slug]/otp/send` | P | `{k, phone}` → `{resendInSeconds, devCode?}`. Errors: 400 bad phone, 429 cooldown/limits, 503 SMS not configured, 502 provider failed. |
| POST | `/api/checkin/[slug]/otp/verify` | P | `{k, phone, code}` → sets cookie. Errors: 400 wrong/expired code, 429 locked. |
| POST | `/api/checkin/[slug]/scan` | S | `{k, location?}` → ScanResult (outcomes in §1.1). Error: 401 `SESSION_REQUIRED`. |
| POST | `/api/checkin/[slug]/logout` | S | Clears the session. |
| GET, PATCH | `/api/library` | L | Profile and settings. |
| GET | `/api/library/qr` | L | url, png, svg. |
| POST | `/api/library/qr/rotate` | L | Regenerate. |
| GET, POST | `/api/shifts` | L | |
| PATCH, DELETE | `/api/shifts/[id]` | L | 409 when in use. |
| GET | `/api/attendance?date&shiftId` | L | Records + notCheckedIn + counts. |
| POST | `/api/attendance/manual` | L | `{studentId, shiftId, date, action, time?, note?}`. 409 duplicate, 400 future. |
| PATCH | `/api/attendance/[id]` | L | `{arrivalStatus?, note?}` |
| GET, POST | `/api/seats` | L | List with live state; one seat or a range. |
| GET, PUT, DELETE | `/api/seats/[id]` | L | Assign / release / notes. 409 taken/blocked/assigned. |
| POST | `/api/seats/release-expired` | L | |
| GET, POST | `/api/students` | L | Existing; adds phone/email uniqueness and shift. |
| PUT, DELETE | `/api/students/[id]` | L | Existing; adds block/unblock and shift. |

### 5.1a 🆕 Phase 1.1 changes

| Method | Route | Role | Change | Errors |
|---|---|---|---|---|
| PATCH | `/api/library` | L | Accepts `settings.otpEnabled: boolean` (audited `library.otp_toggled`). The response includes `smsConfigured` and `smsTestMode` for the Settings warning. | 400 |
| * | `/api/checkin/[slug]/*` | P/S | Gated by R13. GET returns `{qrEnabled:false, library}` (so the page can show the desk message). Every POST returns 403 `QR_DISABLED`. | 403 `QR_DISABLED` |

### 5.2 Phase 2: registration, approval, demo

| Method | Route | Role | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/checkin/[slug]/options?k=` | S | – | Active shifts; sections; free seats per shift. Seats are a plain list until Phase 3; then per-shift availability. | 401, 404 |
| POST | `/api/checkin/[slug]/register` | S | multipart: `k`, `name`* (2–80), `photo?` (jpeg/png/webp ≤ 5 MB), `shiftId`*, `seatId?` (required when any seat is free for that shift), `email?`, `examTarget?`, `collegeName?`, `parentContact?` | 🆕 `{student (DEMO, registrationSource QR), seatAssignment (DEMO_HOLD) or null, scan: ScanResult}`: the demo has started and, when a shift window is open, the student is already checked in | R15 messages; 409 this phone already has a record (returns its current state instead: attendance, renewal, …); 409 seat just taken; 404 shift/seat not in this library; 403 `QR_DISABLED`; upload unavailable → registered without a photo |
| GET 🆕 | `/api/seats/availability?shiftId&from&to` | L | – | Every active seat with `available: boolean` and, when taken, `{studentName, shiftName, from, to, fullDayConflict}` (R3) | 400 bad dates, 404 shift |
| POST 🆕 | `/api/students/demo` | L | **multipart:** `name`*, `phone`*, `shiftId`*, `seatId`*, `demoStartDate`*, `demoEndDate` (default start + `demoDays`), `photo?`, `idProof?`, `email?`, `address?`, `examTarget?`, `collegeName?`, `parentContact?`, `notes?` (* required) | `{student (DEMO, registrationSource MANUAL), seatAssignment (DEMO_HOLD), photoUrl?, warnings[]}` | All of R15. Writes happen under a seat lock (R3), and a transaction when available. If an upload fails, the student is still created and `warnings` explains it. |
| GET 🆕 | `/api/students/[id]/id-proof` | L | – | `{url}`: a signed link that expires in 5 minutes (D16) | 404 none / other library |
| POST 🆕 | `/api/attendance/manual` (extended) | L | `{studentId, shiftId, date, action: 'present'\|'absent'\|'checkin'\|'checkout', time?, note?, force?}` | Attendance record | R14: 409 student not DEMO/ACTIVE_MEMBER; 409 date outside demo/membership; 400 future date; 409 already checked in / not checked in; 409 absent over a check-in without `force` |
| GET | `/api/students/lists?tab=` | L | `tab` = demo / active / demo-ended / expired / payments / blocked | Rows with the per-tab columns of §6.2, plus counts for every tab. Runs the R4 lazy sweep first. | 400 bad tab |
| POST | `/api/students/[id]/demo/extend` | L | `{days: 1–3}` | New `demoEndDate` | 409 not DEMO; 409 over the cap |
| POST | `/api/students/[id]/demo/end` | L | `{reason?}` | Student (DEMO_ENDED) | 409 not DEMO |
| POST | `/api/students/[id]/archive` | L | – | `archivedAt` | 409 only DEMO_ENDED / EXPIRED |

The scan (Phase 1 route) is extended. Unregistered number → `NEEDS_REGISTRATION` (the page shows the demo form instead of "Not registered"). DEMO → checks the demo dates and writes `entryType: DEMO`. Number with a past demo or membership → R5 renewal screen.

### 5.3 Phase 3: membership, payments, seats

| Method | Route | Role | Request | Response | Errors |
|---|---|---|---|---|---|
| GET, POST | `/api/membership-plans` | L | `{name, durationDays, price, isActive?}` | Plans | 400; 409 duplicate name |
| PATCH | `/api/membership-plans/[id]` | L | Partial | Plan | 404 |
| POST | `/api/students/[id]/activate` | L | `{planId? \| startDate+endDate+fee, shiftId, seatId? (keep demo seat if omitted), payment:{paidAmount, method, reference?}, requestId}` | `{student, membership, payment, receiptNumber, seatAssignment}` | 409 not DEMO/DEMO_ENDED/EXPIRED; 409 seat conflict (R3, with the conflicting assignment); 400 paid > fee; 400 partial not allowed by settings; 400 end ≤ start; 200 replay of the same `requestId` |
| POST | `/api/students/[id]/renew` | L | Same as activate; starts at old end or today, whichever is later | Same | 409 BLOCKED |
| POST | `/api/memberships/[id]/payments` | L | `{paidAmount, method, reference?, requestId}` | Payment + updated dues | 400 > due; 409 nothing due |
| GET | `/api/payments?due=true&from&to` | L | – | Pending Payments rows (fee, paid, due, history) / payment list | – |
| GET | `/api/payments/[id]/receipt` | L/S | – | Receipt data (library, student, plan, period, amounts, method, receiptNumber, collectedBy) | 404 (other student/library) |
| GET, POST | `/api/sections` | L | `{name, description?}` | Sections | 409 duplicate |
| PATCH, DELETE | `/api/sections/[id]` | L | – | – | 409 seats in section |
| GET | `/api/seats/map?shiftId&date` | L | – | Seats with R12 state, holder, section | – |
| GET | `/api/seats/availability?shiftId&from&to` | L/S | – | Free seats under R3 | – |
| POST | `/api/seat-assignments` | L | `{studentId, seatId, shiftId, startDate, endDate, kind}` | Assignment | 409 R3 conflict, 409 BLOCKED |
| PATCH | `/api/seat-assignments/[id]` | L | `{seatId?, endDate?}` (change seat) | Assignment | 409 R3 |
| DELETE | `/api/seat-assignments/[id]` | L | `{reason?}` | Released | – |
| GET | `/api/seats/[id]/history` | L | – | Assignments over time | – |

### 5.4 Phase 4: cron, reports, receipts, admin

| Method | Route | Role | Notes |
|---|---|---|---|
| POST | `/api/cron/attendance` | C | Auto check-out (R1), ABSENT for active/demo students after shift end (ShiftRun-idempotent, 3-day catch-up), R4 demo/membership expiry + seat release, expiry reminders. Returns per-library counts. 401 on wrong secret. |
| GET | `/api/reports/[type]?from&to&shiftId&format=json\|csv` | L | `type` ∈ daily, monthly, shift, occupancy, seat-utilisation (R7), fees, expiring, absent |
| GET | `/api/my-library` | S | Seat, shift, library, status, days left, attendance history (paged), total study hours, dues, receipts, renewal status |
| GET, POST | `/api/admin/libraries` | A | List with stats / create library + owner librarian |
| GET, PATCH | `/api/admin/libraries/[id]` | A | Edit; `status` ACTIVE/SUSPENDED (audited) |
| POST | `/api/admin/libraries/[id]/librarians` | A | Assign/move a librarian |
| GET | `/api/admin/reports/revenue` | A | Platform revenue (`PlatformPayment`), subscriptions by plan |
| GET | `/api/admin/audit-logs` | A | Filter by library, action, date |

---

## 6. Frontend

### 6.1 Student (mobile-first, no app chrome): `/checkin/[slug]`

| Step | Phase |
|---|---|
| Phone → OTP | 1 ✅ |
| 🆕 **Demo form** (shown when the number isn't registered): name, photo (camera), shift, seat from the free-seat grid, and optional email, exam target, college, parent contact | 2 |
| 🆕 After the form: "Your 3-day demo has started! You're checked in." (or "Your demo has started. Scan again during your shift to check in."). Result screens: checked in, checked out, already out, renewal/expired (R5) with Call and plans, access denied, outside hours, unavailable, out of range | 1 ✅, 2 updates |
| `/my-library` (status, seat, shift, days left, attendance history, study hours, dues, receipts) | 4 |
| `/receipt/[id]` printable | 3 (librarian), 4 (student) |

### 6.2 Librarian

**`/librarian/students`: tabbed (D13), with a count on every tab and search, shift and section filters.** 🆕 No New Requests tab: there is no approval step.

| Tab | Columns | Actions |
|---|---|---|
| Demo Students | 🆕 Source badge (QR / Manual), "New today" highlight, photo, name, phone, shift, demo seat, start, end, **days-left badge** (green ≥ 2, yellow 1, red today/expired), attendance count | **Collect fee & activate**, Extend (1–3 days), End demo, View |
| All Students / Active Members | Photo, name, phone, seat, shift, plan, expiry, days left, dues, today's attendance | Renew, Change seat, Collect payment, Block, View |
| Demo Ended / Follow-up | Name, phone, demo period, last attendance, seat (released) | Activate, Archive, View |
| Expired Members | Name, phone, expired on, previous plan, dues | Renew, Block, View |
| Pending Payments | Name, fee, paid, due, history | Collect payment, View receipts |

Badge thresholds follow the spec: green while 2+ days remain, yellow when 1 day remains, red on the last day or after. With the default demo (start + 3 days, D8), green shows on the first two days, yellow on the third, red on the last.

**🆕 Add Demo Student page `/librarian/students/add-demo` (Phase 2)**

Same card layout as the existing Add Student form, mobile-friendly.

| Section | Contents |
|---|---|
| Student | Full name*, Mobile*, Photo (take or upload, with preview), Email, Address |
| Demo | Shift*, Start date* (today by default; the date picker blocks past days), End date* (start + `demoDays` by default, editable; shows "4 days of demo"), Seat* |
| More details (collapsible) | Exam target, College, Parent contact, Notes, ID proof (image or PDF, marked "private") |

- **Seat\* behaviour:** a grid showing **only seats free for the chosen shift and dates**. It reloads when the shift or dates change; taken seats are hidden, and a "Show taken" toggle reveals why each is taken.
- **Inline validation:** R15 messages appear under each field; server errors map back onto the same field.
- **On success:** the toast "Demo started for {name}" appears and the page goes to **Students → Demo Students** with the new row highlighted. Buttons: "Add another" and "Go to Demo Students".

**🆕 Attendance page changes (Phase 2)**
- Every "Not checked in" row gets **Present · Absent · Check in** buttons; inside rows get **Check out**.
- A "Mark all remaining present" button with a confirmation, for roll call.
- Demo students carry a "Demo" badge.
- When `otpEnabled = false`, the page subtitle reads "Manual attendance".

**🆕 Settings → Library & check-in (Phase 1.1)**
- A "QR check-in with OTP" switch (off by default) with a short explanation.
- The SMS warning from R13.

**Membership activation modal (Phase 3), sections:**
1. Student and current demo seat.
2. Plan: Monthly / Quarterly / Yearly / Custom dates. Fee auto-filled and editable.
3. Payment: method, total, paid, due (live).
4. Seat: "Keep demo seat" or pick from the availability grid for the shift and dates (conflicts greyed out).

On success: toast "Membership activated successfully.", a receipt link, and refetched lists.

**Other librarian pages:**

| Page | Content |
|---|---|
| **Student detail** drawer | Profile, status timeline, memberships, payments + receipts, seat history, attendance summary |
| **Seats** `/librarian/seats` (Phase 3) | Shift selector + date. R12 colours. Section tabs. Seat drawer with history, assign/change/release. Sections manager. |
| **Plans & Payments** `/librarian/membership` (D14, Phase 3) | Plans CRUD, Pending Payments, recent receipts, expiry reminders (existing) |
| **Reports** `/librarian/reports` (Phase 4) | Type, range, shift; table preview; CSV; Print |
| **Dashboard** | Today's attendance (✅). New: 🆕 **New demos today** (with source), Demo ending today, Pending dues totals. |
| **Sidebar** | "Students" gets a badge counting 🆕 demos started today. Plans & Payments; Reports. |

### 6.3 Admin (Phase 4)

`/admin/libraries` (list, create, suspend), `/admin/libraries/[id]`, `/admin/reports`, `/admin/audit-logs`.

**All screens:** loading skeleton, empty state, error with retry, success toasts, labelled inputs, 44 px touch targets on student pages.

---

## 7. Role permissions

| Capability | Admin | Librarian (own library) | Student (own record, one library) |
|---|---|---|---|
| Libraries, librarians, platform plans, revenue, all audit logs | ✅ | ✗ | ✗ |
| Library stats (read) | All libraries | Own | ✗ |
| Shifts, sections, seats, plans, settings, QR | Read via library detail | ✅ | ✗ |
| Start demo (manual), demo extend/end, activate, renew, block, archive | ✗ | ✅ | 🆕 Start own demo via QR (once per phone) |
| Payments, receipts | Read | ✅ | Own receipts |
| Attendance overrides, reports | ✗ | ✅ | ✗ |
| Fill the demo form, check in/out, My Library | ✗ | ✗ | ✅ |

**Enforcement:**
- Guards: `requireAdmin`, `requireLibraryContext`, student session.
- The session's `libraryId` must match the QR slug's library.
- `libraryId` is never read from request bodies.
- Every query filters by `libraryId`.
- Regression tests call each librarian endpoint with another library's IDs and expect 404.

---

## 8. Edge cases

| Case | Handling |
|---|---|
| **Duplicate phone** | Unique per library (API + index). QR registration with an existing phone shows that student's current state instead of creating a new one. Legacy duplicates are reported by the migration script, never auto-merged. Same email rule (one per library). |
| **Expired demo** | R4 lazily on scan and list reads + cron. Scan shows the R5 screen. The seat is released. |
| **Expired membership** | Same: EXPIRED, seat released, renewal screen, history kept. Renewal starts at today or the old end date, whichever is later. |
| **Seat conflict** | R3 check under a per-seat lock. The second request gets 409 with the conflicting student and shift. The availability grid hides conflicts. A seat picked in the QR form may be taken by the time it's submitted → "That seat was just taken, pick another" (the grid refreshes). |
| **Missed check-out** | Auto at shift end + 30 min (`checkOutAt = shift end`, flagged `autoCheckedOut`). |
| **Late check-in** | R2; "Late by 1 hour 30 min" formatting. A late arrival after the cron already wrote ABSENT turns the ABSENT row into a LATE check-in. |
| **Multiple scans** | Unique index + R1 + 2-minute repeat guard. A third scan reads only. |
| **OTP failure** | Provider error → code cleared, cooldown reset, "try again". Config missing → 503 before any code is created. Limits: 60 s resend, 5/hour/phone, **10/day/phone (1.1)**, 500/day/library, IP limit. 5 wrong attempts → new code required. |
| **Wrong library QR** | Bad or old signature → "This QR code is not valid any more…". A session from library A is never accepted by library B (per-library cookie + server check). |
| **Blocked student** | Access denied on scan. No seat assignment, activation or renewal until unblocked. Unblock restores the status derived from dates. |
| 🆕 **QR demo misuse** | Without approval, anyone with a working phone can start a demo. Protections: OTP-verified number; one demo per phone per library ever; the optional location check (D3) so it only works inside the library; the librarian sees "New demos today" and can **End demo** or **Block** in one tap, which frees the seat at once. |
| 🆕 **QR off** | `/checkin` links and old printed QRs show the desk message; no OTP is generated or charged. Manual admission and attendance are unaffected. Turning QR on later restores everything without reprinting. |
| 🆕 **Demo seat race** | Two librarians pick the same seat at once → the seat lock lets one through; the other gets "Seat {n} was just taken". |
| 🆕 **Manual attendance outside the period** | Marking a demo student for a day after `demoEndDate` → 409 "{name}'s demo ended on {date}." Same for an expired membership. |
| 🆕 **Absent over a real check-in** | Refused unless forced with a note, so roll call doesn't wipe a real QR record by accident. |
| 🆕 **ID proof** | Never a public URL. Signed 5-minute link for the librarian only. |
| **Other** | Night shifts across midnight · Full Day vs Morning seat sharing · shift deactivated with students on it (409) · deleting a seat with assignments (409) · double-submitted activation (`requestId` replay) · partial payment then expiry (dues stay in Pending Payments) · demo extension cap · re-registration after rejection (24 h) · photo upload unavailable (registration proceeds without a photo) · librarian's own plan lapsed (D4) · library suspended. |

---

## 9. Testing approach (every phase)

- **Unit tests (Vitest):** pure rules. Time, lateness, R3 overlap, R4/R10 demo dates (D8), payment arithmetic, phone, OTP.
- **End-to-end:** the Node script against a **throwaway local Mongo** and a production build. The real database is never touched. The suite grows per phase.
- **Visual:** headless screenshots at 390 px and 1280 px.
- **Gates:** `npm run typecheck`, `npm run lint` (after D12), `npm test`, `npm run build`, the e2e script.

---

## 10. Implementation phases

### Phase 1: tenant migration, QR, OTP check-in, attendance — ✅ DONE

Delivered as described in §1.1 and verified.

**Deviations already recorded:**
- The unique phone/email indexes are built by the migration only once the data is clean.
- 2-minute repeat-scan guard.
- Lazy library creation.
- Node e2e script.
- The QR link uses the address the librarian has open (and adds a missing `http(s)://`).

**Phase 1 testing checklist** (already provided; still valid):

- [ ] Library settings: grace 15; timezone.
- [ ] Shifts: CRUD, Night "ends next day", duplicate name refused.
- [ ] Library QR: download, print, copy, regenerate (old QR invalid).
- [ ] OTP: wrong code counts attempts, 60 s resend, lockout after 5, test mode shows the code.
- [ ] Scans: check-in → Present / "Late by …" → repeat within 2 min = already in → check-out with study time → "already checked out today".
- [ ] Expired → renewal screen, no attendance. Blocked → denied. Unknown phone → not registered.
- [ ] Attendance page: counts, tabs, manual in/out, override, note; auto check-out after end + 30.
- [ ] Seats: bulk add, assign/move/release, taken seat refused, Free expired seats.
- [ ] Isolation: a second librarian sees none of the first library's data.

### Phase 1.1: gaps against the new spec + 🆕 QR switch (small; done first after approval, then stop for QA)

- 🆕 **`settings.otpEnabled`** (default false, D15): the R13 gate on every `/api/checkin/*` route, the Settings switch with the SMS warning, the "QR is off" state on the Library QR page and the check-in page, the sidebar "Off" badge, migration step 1.1, and an audit entry.
- **Per-phone daily OTP limit:** 10 sends/day, alongside the existing 5/hour.
- **ESLint (D12):** install and configure; fix errors in new/changed files; report legacy warnings.

**1.1 checklist:**
- [ ] A new library has QR check-in **off**. Opening its `/checkin` link shows "please check in at the desk". OTP send returns `QR_DISABLED`, and no SMS is sent.
- [ ] The Library QR page shows "QR check-in is off" with download and print disabled. The sidebar shows "Off".
- [ ] Turning the switch on in Settings makes the same QR work again with no reprint. Turning it on with no SMS provider shows the warning.
- [ ] The toggle appears in the audit log.
- [ ] 11th OTP request in a day for one phone is refused with a clear message.
- [ ] `npm run lint` runs without errors.

### Phase 2: manual demo admission, manual attendance, QR demo form, 3-day demo

🆕 **Built in this order: manual path first, QR path second.**
1. `SeatAssignment` + R3 (moved here from Phase 3) + migration step 2 + the availability API.
2. The **Add Demo Student** form and API (R15), the `Student` fields (incl. the `address` fix), private ID-proof upload.
3. **Manual attendance:** Present/Absent/Check in/Check out (R14), the attendance-page buttons, "mark all remaining present".
4. The Students page tabs (Demo Students first), extend / end demo, R4 lazy sweep, archive.
5. 🆕 The QR demo form: an unregistered number → form → DEMO + seat hold + immediate check-in (only when `otpEnabled`).

**Delivers:** §5.2 APIs and the demo form. The Students page becomes tabbed with **Demo Students, Demo Ended**; the existing list becomes **All Students** (ACTIVE_MEMBER) and **Expired**. Also:
- extend / end demo
- archive
- DEMO scans with `entryType = DEMO`
- the R4 lazy sweep
- days-left badges
- the "New demos today" sidebar badge and dashboard card
- audit for demo start (QR/manual), extend and end

**Phase 2 testing checklist (🆕 manual path):**
- [ ] With QR **off**, add a demo student with every required field. They appear at once in **Demo Students** with `registrationSource = MANUAL`, status DEMO, the chosen seat on **DEMO_HOLD**, and default end date = start + 3 days.
- [ ] Each required field left empty shows its own message; the form keeps the other values.
- [ ] Phone `98765 43210` and `+91 9876543210` are treated as the same number. The second student → "This mobile number is already registered to …".
- [ ] Past start date → refused. End before start → refused. A 31-day demo → refused. Editing the end date to start + 5 → accepted.
- [ ] The seat grid lists only seats free for the shift and dates. Choosing a seat held by an Evening student while adding a Morning demo → allowed. Choosing a seat booked **Full Day** → "booked … for the Full Day shift" message.
- [ ] Two browser tabs submitting the same seat at once → one succeeds, the other gets "was just taken".
- [ ] Photo and ID proof upload. The ID proof opens only through the librarian's link, and the link stops working after 5 minutes. With Cloudinary unset, the student is still created, with a warning.
- [ ] Address is saved (bug fixed) for both forms.
- [ ] Manual attendance: Present (no study hours counted), Absent, Check in (Late computed), Check out (study time); `source = MANUAL`; `entryType` DEMO for demo students, MEMBER for members; each appears in the audit log.
- [ ] Marking a demo student for a day after the demo end → refused with the end date. A future date → refused. Absent over a QR check-in → needs a confirmation and a note.
- [ ] "Mark all remaining present" marks only the not-checked-in active/demo students of the chosen shift.

**Phase 2 testing checklist (QR path, `otpEnabled` on):**
- [ ] Unregistered number: scan → OTP → **demo form** appears (not "Not registered").
- [ ] Fill in name, photo, shift and a free seat → "Your 3-day demo has started!". During a shift the student is **checked in immediately** with `entryType = DEMO`.
- [ ] The student appears at once in **Demo Students** with a "QR" badge and "New today"; the seat shows Demo Hold; the dashboard counts the new demo.
- [ ] A seat taken by someone else between loading and submitting → "That seat was just taken"; the grid refreshes.
- [ ] No free seat for the shift → the demo starts without a seat; the librarian can assign one later.
- [ ] Registered number scans → normal check-in/out (no form).
- [ ] A number whose demo has ended scans → renewal screen; the form is **never** shown again.
- [ ] Two phones submitting the form for the same number at once → exactly one student is created.
- [ ] Badge colours: green with 2+ days left, yellow with 1, red on the last day or after.
- [ ] Extend +2 → the end date moves; over the 7-day cap refused.
- [ ] End demo → moves to Demo Ended; seat freed; scan shows the R5 screen.
- [ ] Demo end date passed (time-travel in the test DB) → opening any list or scanning moves the student to Demo Ended.
- [ ] Archive from Demo Ended → hidden; history kept.
- [ ] With the QR switch **off**: the same steps are done by the librarian (Add Demo Student, manual check-in), with identical results in the lists.
- [ ] Isolation: library B can't see or end library A's demos.

### 🆕5 Phase 2.5: admin-controlled QR/OTP access (spec §12)

Built in four steps; the details are in §12.

**Status (2026-10-16): built.** Typecheck clean, 38/38 unit tests, build OK, e2e 202/202 (incl. gating, credits, refunds, monthly limit, race, OTP-off, expiry, isolation, audit). The checkboxes below are for your manual pass. The old 1.1 "switch in Settings" items are superseded by this phase.

| Step | Contents |
|---|---|
| **2.5a Backend** | Library fields; `SmsTransaction` model; migration step; `assertQrOtpAccess`; credit charge/refund in OTP send; monthly reset; gating every QR route; librarian settings API stops accepting the switch |
| **2.5b Admin** | `/admin/qr-access` list + detail drawer, the APIs, audit, notifications |
| **2.5c Librarian** | "QR Attendance" page (enabled vs. locked), read-only status in Settings, sidebar rename |
| **2.5d Student + tests** | Exact unavailable texts on the check-in page; e2e for gating, credits, limits, refunds, isolation, audit |

**Phase 2.5 testing checklist:**
- [ ] A new library: the librarian sees **QR Attendance → "Contact admin to enable QR attendance."** Manual attendance and Add Demo Student work. Settings has **no switch**, only "Managed by admin".
- [ ] A librarian calling the access API directly → **403**. Sending `otpEnabled` through `/api/library` does nothing.
- [ ] A student scanning a disabled library sees **"QR check-in is currently unavailable. Please contact library staff."**; the browser makes **no** OTP request; nothing is recorded.
- [ ] Admin enables QR + OTP with a note → the librarian page shows the QR and usage. Audit shows `qr_access.updated` with before/after.
- [ ] 0 credits → OTP send **402** "SMS credits are over…". Admin adds 50 credits with a note → the ledger shows +50 and balance 50; audit `qr_access.credits_added`.
- [ ] Each real OTP send: balance −1, `otpUsedThisMonth` +1, one `OTP_SEND` row with masked phone and balance after. Verify: a row with 0 credits (D19).
- [ ] Provider failure → the credit comes back (`REFUND` row); the balance is unchanged overall.
- [ ] Monthly limit 3 → the 4th send **429**; the next month (time-travel the month key) the counter resets.
- [ ] Two sends racing with 1 credit left → exactly one succeeds and the balance never goes below 0.
- [ ] QR on, OTP off → an already-verified phone still checks in; a new phone gets "Phone verification is currently unavailable…"; no credit is used.
- [ ] Access SUSPENDED or EXPIRED (incl. `accessExpiresAt` in the past) → every QR route 403; the student message as above.
- [ ] Disabling access deletes nothing: attendance, students and sessions remain, and re-enabling works without reprinting the QR.
- [ ] Isolation: library B's librarian can't see A's usage or ledger; only admins see all libraries.
- [ ] Credits low (≤ 10 % of the last top-up or ≤ 10) → the librarian and admin get a notification once.

### Phase 3: membership, payments, seats, automatic list movement

**Delivers:**
- Sections, shift-wise seat map (R12), seat history (`SeatAssignment` itself arrives in Phase 2 🆕).
- Migration step 3.
- MembershipPlans, the **activation modal** (R11), renew, collect payment, **Pending Payments**, printable receipts.
- Plans & Payments page.
- Notifications: seat assignment, receipt email.
- Audit for membership, payment and seat events.

**Phase 3 testing checklist:**
- [ ] 🆕 Activating a **manually admitted** demo student: the same `SeatAssignment` document goes from `DEMO_HOLD` to `ACTIVE` (no new seat record). Payment and membership are created; status becomes ACTIVE_MEMBER. The student leaves Demo Students, appears in All Students, and the receipt prints.
- [ ] Plans CRUD; plan price auto-fills the activation modal.
- [ ] Activate from Demo: full payment → PAID receipt. Student leaves Demo, appears in All Students immediately; toast shown.
- [ ] Partial payment → PARTIAL; appears in Pending Payments with fee/paid/due. Collect the rest → PAID; leaves Pending Payments.
- [ ] Overpayment refused. A double click on Activate creates exactly one payment (`requestId`).
- [ ] Keep demo seat → the DEMO_HOLD becomes ASSIGNED. Pick another seat → old hold released.
- [ ] R3: Morning + Evening share a seat ✓. Full Day vs Morning ✗ (409 names the holder). Same shift with overlapping dates ✗.
- [ ] Seat map per shift shows Available / Requested / Demo hold / Assigned / Occupied / Expired in the right colours; seat history lists past holders.
- [ ] Activated student's next scan → `entryType = MEMBER`.
- [ ] Receipt page prints cleanly; receipt numbers are sequential per library and unique.
- [ ] Renew an expired member → back in All Students; dates continue correctly.
- [ ] Migration step 3 on a copy: memberships and assignments created, amounts not invented, re-run safe.
- [ ] Isolation for plans, payments, receipts and assignments.

### Phase 4: cron, reports, receipts for students, admin

**Delivers:** §5.4. ShiftRun ABSENT marking; R4 via cron; expiry reminders; reports + CSV + print (incl. R7); `/my-library`; admin libraries, suspend, librarian assignment, revenue, audit viewer.

**Phase 4 testing checklist:**
- [ ] Cron without the secret → 401. With it → per-library counts. Running twice changes nothing more.
- [ ] After shift end, students who didn't come show ABSENT. A late arrival afterwards becomes LATE.
- [ ] Open record past end + 30 → auto checked out by the cron.
- [ ] Demo/membership expiry and seat release happen without anyone opening a page.
- [ ] Every report matches hand-counted test data; CSV opens in Excel; print layout is clean.
- [ ] Seat Utilisation shows present/absent days, study hours, last visit.
- [ ] My Library on a phone: seat, shift, days left, history, hours, dues, receipts.
- [ ] Admin: create library + librarian (the librarian logs in and sees only their library), suspend (check-in unavailable, librarian blocked), revenue, audit filter.

**At the end of every phase I report:** files created/modified, database changes, API list, UI pages, the manual testing checklist, known limitations, and the next phase summary.

---

## 12. 🆕5 Admin-controlled QR/OTP access per library

### 12.1 Model changes

**`Library`** gets top-level fields, separate from `settings`, because librarians must not be able to edit them through the settings API:

| Field | Type / default | Meaning |
|---|---|---|
| `qrAttendanceEnabled` | Boolean, **false** | Library QR check-in allowed |
| `otpEnabled` | Boolean, **false** | New phones can verify by OTP (D20) |
| `smsCreditBalance` | Int ≥ 0, **0** | Prepaid SMS credits (1 credit = 1 OTP SMS) |
| `monthlyOtpLimit` | Int ≥ 1 or **null** (no limit) | Max OTP sends per calendar month (D24) |
| `otpUsedThisMonth` | Int, 0 | OTP sends this month |
| `otpUsageMonth` | String `YYYY-MM` | Month the counter belongs to; reset when it changes |
| `accessStatus` | `ACTIVE` \| `SUSPENDED` \| `EXPIRED`, **ACTIVE** | Admin state for QR/OTP only. The existing `Library.status` (whole library) is unchanged and still wins. |
| `accessExpiresAt` | Date \| null | Optional; once passed → EXPIRED (D23) |
| `accessNote` | String ≤ 300 | Last reason given by the admin (shown to the librarian) |
| `accessUpdatedAt` / `accessUpdatedBy` | Date / User ref | Last admin change |
| `creditsLowNotifiedAt` | Date \| null | So the "credits low" notice is sent once per top-up |

The old `settings.otpEnabled` (revisions 3–4) is **deprecated**. The migration copies it (D22), and after that nothing reads it.

**New `SmsTransaction`** (append-only ledger, never edited or deleted):

| Field | Notes |
|---|---|
| `libraryId` | required, indexed |
| `type` | `CREDIT_ADD` \| `CREDIT_ADJUST` \| `OTP_SEND` \| `OTP_VERIFY` \| `REFUND` |
| `credits` | +N for top-ups and refunds, −1 for a send, 0 for verify and test-mode sends |
| `balanceAfter` | Balance right after this row |
| `monthKey` | `YYYY-MM` |
| `phoneMasked` | `+91 ••••• •3210` (never the full number) |
| `provider` | `msg91` / `fast2sms` / … / `console` |
| `status` | `OK` \| `FAILED` |
| `refundOf` | Original send's id (for REFUND) |
| `actorId`, `actorRole` | Admin for credits; `student` / `system` for sends |
| `note` | Admin's reason for top-ups and adjustments |
| `createdAt` | |

Indexes: `{libraryId, createdAt:-1}`, `{libraryId, monthKey, type}`.

### 12.2 `assertQrOtpAccess(libraryId, { otp?, charge? })`

One server function (in `lib/services/qr-access.ts`), called **first** by every QR/OTP route:

1. Load the library.
2. If `status = SUSPENDED` (whole library) → 403 `LIBRARY_UNAVAILABLE`.
3. If `accessExpiresAt` has passed and the status is ACTIVE → set EXPIRED (audited as `system`).
4. If `accessStatus ≠ ACTIVE` or `!qrAttendanceEnabled` → **403 `QR_DISABLED`**.
5. If `otp` and `!otpEnabled` → **403 `OTP_DISABLED`**.
6. If `charge` (OTP send only), skipped for the console/test channel (D21):
   - **Month rollover:** if `otpUsageMonth ≠ current month`, atomically reset `otpUsedThisMonth = 0`.
   - **Atomic reservation, in one `findOneAndUpdate`:** `{_id, smsCreditBalance ≥ 1, (monthlyOtpLimit = null OR otpUsedThisMonth < monthlyOtpLimit)}` → `$inc {smsCreditBalance: −1, otpUsedThisMonth: +1}`. Under concurrency, the balance can never go negative and the limit can never be exceeded.
   - **If nothing matched:** re-read to tell which rule failed → **402 `SMS_CREDITS_EXHAUSTED`** or **429 `MONTHLY_OTP_LIMIT`**.
   - **On success:** write an `OTP_SEND` row with `balanceAfter`.
7. **If the SMS provider then fails:** `$inc` the credit back and the monthly counter back, and write a `REFUND` row. The existing "code cleared, retry allowed" behaviour stays.
8. **Credits low:** when `balanceAfter ≤ max(10, 10 % of last top-up)` and not yet notified → notify the librarian (section `account`) and the admins (section `librarians`), and set `creditsLowNotifiedAt`.

| Route | `otp` | `charge` |
|---|---|---|
| GET `/api/checkin/[slug]` | – (**never 403**: returns `{qrEnabled, otpEnabled, reason}` so the page can show the right message without calling OTP APIs) | – |
| POST `/otp/send` | ✓ | ✓ |
| POST `/otp/verify` | ✓ | ✗ (ledger row, 0 credits, D19) |
| POST `/scan`, GET `/options`, POST `/register` | ✗ | ✗ |
| Manual attendance, Add Demo Student, everything librarian | **not gated** | – |

### 12.3 APIs

| Method | Route | Role | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/admin/qr-access?search&status&page` | Admin | – | Libraries: name, owner, QR/OTP flags, accessStatus, credits, used/limit this month, last change | 403 non-admin |
| GET | `/api/admin/qr-access/[libraryId]` | Admin | – | Library access fields + last 50 ledger rows + last 20 related audit entries + this month's sends/verifies/refunds | 404 |
| PATCH | `/api/admin/qr-access/[libraryId]` | Admin | `{qrAttendanceEnabled?, otpEnabled?, accessStatus?, accessExpiresAt?, monthlyOtpLimit? (int ≥ 1 or null), note* (3–300)}` | Updated access | 400: note missing; limit not a positive whole number; OTP on while QR off ("Turn on QR attendance first"). 404. Audited `qr_access.updated` with before/after; librarian notified |
| POST | `/api/admin/qr-access/[libraryId]/credits` | Admin | `{credits (int, ±, ≠ 0, \|n\| ≤ 100000), note*, requestId}` | New balance + ledger row | 400 would go below 0 / no note; 200 replay of the same `requestId`. Audited `qr_access.credits_added` / `qr_access.credits_adjusted` |
| GET | `/api/admin/qr-access/[libraryId]/transactions?page&type` | Admin | – | Paged ledger | 404 |
| GET | `/api/library/qr-access` | Librarian | – | Own flags, status, note, credits, used/limit, last 20 ledger rows (masked) | – |
| PATCH | `/api/library` (changed) | Librarian | `settings.otpEnabled` **removed from the schema**; the access fields are not accepted | – | Unknown fields are ignored (zod strip) |

### 12.4 UI

**Admin: `/admin/qr-access` ("QR/OTP Access", new sidebar item)**
- **List:**
  - A table on desktop, cards on phones.
  - Columns: Library, Owner, QR, OTP, Status badge, Credits (red at 0, amber when low), Used this month / limit.
  - Search and a status filter.
- **Row drawer:**
  - Switches: QR attendance and OTP (OTP is disabled while QR is off).
  - Access status: Active / Suspended / Expired, plus an optional expiry date.
  - Monthly limit: number or "No limit".
  - **Reason / note** (required to save).
  - **Add credits**: amount, presets +50 / +100 / +500 / +1000, note. A negative amount is an adjustment.
  - **Usage**: sends / verifies / refunds this month.
  - **History**: tabs for Credits & OTP (ledger) and Changes (audit).
- Every save shows a toast; the history reloads.

**Librarian: `/librarian/qr-attendance` ("QR Attendance")**
- Replaces "Library QR"; the old route redirects.
- **Enabled:** the existing QR card (view, download, print, regenerate) plus a usage card: credits left, used this month / limit, the admin's note, and the last 20 OTP rows with masked phones.
- **Disabled, suspended or expired:**
  - A lock card: **"Contact admin to enable QR attendance."**, plus the admin's note and status when present.
  - The QR is hidden (not just faded), so a disabled library can't print one.
  - Buttons: "Take attendance manually" → Attendance; "Add Demo Student".
- **Settings:** the "QR check-in with OTP" switch is replaced by a read-only line: "QR attendance: Enabled / Off — managed by the platform admin."
- **Attendance page:** unchanged. Manual Present / Absent / Check in / Check out always work.

**Student `/checkin/[slug]`**
- GET says QR is off, suspended or expired → **"QR check-in is currently unavailable. Please contact library staff."** No OTP request is made and nothing is recorded.
- QR on, OTP off, no session on this phone → "Phone verification is currently unavailable. Please contact library staff."
- 402 on send → "SMS service is temporarily unavailable at this library. Please contact library staff." Credits aren't mentioned to students.
- 429 monthly limit → the same student-facing text. The librarian and admin see the real reason in their notifications.

### 12.5 Permissions

| Action | Admin | Librarian | Student |
|---|---|---|---|
| Enable/disable QR, OTP; status; expiry; limits | ✅ | ✗ (403) | ✗ |
| Add / adjust credits | ✅ | ✗ | ✗ |
| View every library's usage and ledger | ✅ | ✗ | ✗ |
| View own library's access, usage, ledger (masked) | – | ✅ | ✗ |
| Use QR check-in / OTP | – | – | Only when allowed by §12.2 |
| Manual attendance, manual demo admission | – | ✅ always | – |

Guards: `requireAdmin` on `/api/admin/qr-access/*`; `requireLibraryContext` on `/api/library/qr-access`; `assertQrOtpAccess` on the public QR routes.

### 12.6 Edge cases

| Case | Handling |
|---|---|
| Admin disables while a student is mid-flow | The next call (verify/scan/register) returns 403. A code already sent stays valid only if access comes back within its 5 minutes. |
| Disabling access | **Deletes nothing.** Attendance, students, OTP records and student sessions remain; re-enabling works with the same QR. |
| Credits run out between check and send | Impossible: the reservation is atomic. A provider failure refunds. |
| Concurrent top-ups | `$inc` is atomic; each top-up writes its own ledger row with the correct `balanceAfter`. A replayed `requestId` adds nothing. |
| Negative adjustment below 0 | 400 "Balance can't go below 0". |
| Limit lowered below this month's usage | Allowed; further sends get 429 until next month. |
| Month rollover in the middle of traffic | The reset is conditional on `otpUsageMonth`, so it happens exactly once. |
| Whole library SUSPENDED (`Library.status`) | Wins over QR access: everything is unavailable, as today. |
| Test mode (console) | No credits used (D21); still needs QR + OTP enabled. |
| Librarian tries to flip flags via `/api/library` or by guessing admin routes | Fields stripped / 403. Admin routes are never reachable by librarians. |
| Ledger privacy | Phones stored masked only; library B never sees A's rows. |

### 12.7 Migration (step 2.5, re-runnable)

For each library without `accessStatus`:
- set `accessStatus = ACTIVE`;
- copy `settings.otpEnabled` into **both** `qrAttendanceEnabled` and `otpEnabled` (D22);
- set `smsCreditBalance = 0`, `monthlyOtpLimit = null`, `otpUsedThisMonth = 0`, `otpUsageMonth = current month`.

Dry run first, as for every step. Without the migration, Mongoose defaults (both false) mean QR is simply off; nothing breaks.

---

## 11. Known limitations and next steps

- **SMS:** Fast2SMS needs website verification (OTP route) or a ₹100 recharge (`FAST2SMS_ROUTE=q`). Until then, use test mode.
- **Remote check-in:** a static QR can be used remotely unless the geofence is on; a rotating door-screen QR is a future option.
- **Rate limiting:** the general API limiter is in-memory (per instance); OTP limits are in the DB. Move to Upstash Redis for multi-instance deploys.
- **Payments:** no online gateway (manual entry only, by design).
- **Library staff:** one owner librarian per library; staff roles are not built.
- **Current repository state:** the work since commit `86c1255` (SMS providers, test mode, seat fixes, email rule, late formatting, phone access in dev) is **not yet committed**.
