# PLAN — QR Check-in, Shifts, Seats, Attendance, Memberships & Admin Libraries

Status: **approved** (2026-10-16), with the refinements in §0.1. The D1–D7 defaults are accepted. Built in four phases (§11). **Phase 1 complete and verified (2026-10-16); Phase 2 awaiting go-ahead.**

---

## 0. Decisions needed before implementation

Each has a recommended default. Approving the plan as-is means accepting these defaults.

| # | Decision | Recommended default | Why it matters |
|---|---|---|---|
| D1 | **SMS provider for student OTP.** The project has email (SMTP/Resend) but no SMS. | **MSG91** (India DLT-ready), behind a pluggable `OtpChannel` interface. In development, the OTP is printed to the server console. Fast2SMS and Twilio can be added later behind the same interface. | Phone OTP can't reach real students without a paid SMS account and DLT template registration (takes days in India). Until it's set up, check-in works only in dev mode. |
| D2 | **How often a student must enter an OTP** | OTP once per device; a signed, httpOnly **student session cookie** lasts **30 days**, scoped to that one library. Later scans only need the session. | Requiring an OTP on every scan costs one SMS per scan (2 per day per student) and slows the entry queue. |
| D3 | **Stopping remote check-in** (someone photographs the QR and scans from home) | v1: signed QR plus an **optional geofence**: the librarian sets the library's location and a radius, and the browser must share its location to check in. Off by default. | A static QR can be used from anywhere. A rotating on-screen QR is the stronger option but needs a screen at the door; listed under next steps. |
| D4 | **Librarian's own trial/plan lapses** (the existing `ACCESS_LOCKED` flow) | Student check-in **keeps working for 7 days** after the librarian is locked, then the check-in page shows "Library temporarily unavailable". | Students shouldn't be locked out the moment the owner's subscription lapses. |
| D5 | **Background jobs on Vercel.** Vercel Hobby cron runs at most once a day. | One idempotent endpoint, `POST /api/cron/attendance`, protected by `CRON_SECRET`. Call it **every 15 minutes** from cron-job.org (free) or Vercel Pro cron. Check-in rules are also enforced **at scan time**, so a late cron never lets an expired student in. | Shift-end jobs (absent marking, auto check-out) need to run several times a day. |
| D6 | **PDF exports and receipts** | Print-optimized HTML pages; the browser's "Save as PDF" produces the PDF. CSV is generated server-side. No PDF library. | Avoids a heavy dependency; can switch to `@react-pdf/renderer` later if needed. |
| D7 | **Real-time seat map** | **Polling every 10 s** with SWR (already installed). | Vercel serverless can't hold WebSockets; polling is reliable and cheap at this scale. |

New dependencies: **`qrcode`** (QR image generation) and **`vitest`** (dev only, unit tests). Nothing else.

---

## 0.1 Approved refinements (binding rules)

These override anything less specific elsewhere in this plan.

### R1. Attendance scan rules
For one student, one shift occurrence (shift + library-local start date):

| Scan | Existing record | Result |
|---|---|---|
| 1st | none | **Check-in.** `checkInAt = now`, `isInside = true` |
| 2nd | open (no `checkOutAt`) | **Check-out.** `checkOutAt = now`, `totalMinutes` computed, `isInside = false` |
| 3rd and later | closed | **"You have already checked out today."** Nothing is written. |

- **Auto check-out:** an open record is closed once **shift end + 30 minutes** has passed. It gets `checkOutAt = shift end` (the student is not credited the 30 minutes) and `autoCheckedOut = true`.
  - Applied lazily, whenever a scan or the attendance list touches the record, from Phase 1.
  - From Phase 4 it is also applied by the cron.
- A scan between shift end and shift end + 30 min, with an open record, is a normal check-out at the real time.
- A check-in is accepted from `shift start − earlyCheckinMinutes` (default 60) up to shift end. Outside that window: **"Outside shift hours"**, with the next start time.

### R2. Grace period
- **Library-level setting** `settings.graceMinutes`, default **15**, range 0–180.
- **Late** means `checkInAt > shiftStart + graceMinutes`; otherwise Present.
- `lateMinutes = ceil((checkInAt − shiftStart) / 1 min)` is stored on the record. The librarian dashboard and attendance list show **"Late by X min"**.

### R3. Seat conflict rule (Phase 3)
- A seat can't have two assignments with status **ACTIVE** or **DEMO_HOLD** whose **shift time windows overlap** *and* whose **date ranges overlap**.
- Time windows are compared on a 24 h circle, so midnight-crossing shifts work. Touching edges (one ends 14:00, the next starts 14:00) do **not** overlap.
- **Full Day conflicts with Morning, Evening and Night.** Morning and Evening that don't overlap can share the same seat.

### R4. Demo expiry job (Phase 4; enforced at scan time from Phase 2)
A daily cron, plus every 15-minute run (it's idempotent), handles every student with `status = DEMO` and `demoEndDate < now`:
- Mark them `DEMO_ENDED`, or `EXPIRED` if they had held a paid membership before.
- End their `SeatAssignment` (status `EXPIRED`, `endDate = now`).
- Set the seat back to `AVAILABLE` for that shift.
- Write an audit log entry.

The same applies to `ACTIVE_MEMBER` students whose membership `endDate < now` → `EXPIRED`.

### R5. Expired student QR flow
For `EXPIRED` or `DEMO_ENDED` (or a lapsed date found at scan time):
- **Shown:** "Membership expired on <date>", plus a renewal option: the library's phone with a **Call** button and "Ask the librarian to renew". From Phase 3, the available plans are listed too.
- **No attendance is written.**
- **Old attendance history is kept**; nothing is deleted or modified.

### R6. Minimum payment model (Phase 3)
- `Payment { libraryId, studentId, membershipId, amount, mode: CASH | UPI | BANK, reference?, receiptNo, status: PAID | PARTIAL | PENDING, paidAt, collectedBy }`.
- `Membership.fee` minus the sum of `PAID`/`PARTIAL` amounts is **dues**.
- A membership is fully paid, partial or pending. Online payment is out of scope.

### R7. Seat Utilisation Report (Phase 4)
Per seat, per shift, for a date range: **seat number, assigned student, shift, present days, absent days, total study hours, last visited date.** Available as CSV and printable.

### R8. Audit logs
`AuditLog { libraryId?, actorId, actorRole, action, entity, entityId, meta, ip, createdAt }`, written for:

| Action | Phase |
|---|---|
| Librarian login | 1 |
| Manual attendance override (check-in, check-out, status change, note) | 1 |
| Student approval / rejection | 2 |
| Membership changes (convert, renew, expire) | 3 |
| Seat assignment / release | 3 |
| Payment entry | 3 |
| Library status change (activate/suspend) | 4 |

Phase 1 also logs QR regeneration and library settings changes.

### R9. Notifications (MVP only)
1. **OTP SMS** (Phase 1)
2. **Seat assignment confirmation** (Phase 3)
3. **Membership expiry reminder** (Phase 4, reusing the existing reminder email when the student has an email)
4. **Payment receipt** (Phase 3)

Channels are SMS (OTP) and email where an address exists. **No WhatsApp automation.**

---

## 1. What exists today (inspection results)

**Stack**
- Next.js 16 App Router, React 19, TypeScript.
- **MongoDB + Mongoose 9.** There is no Prisma; "migrations" means idempotent Node scripts in `scripts/` plus schema changes.
- Tailwind v4 with shadcn/ui, SWR, zod, date-fns, Cloudinary, nodemailer/Resend.
- Deployed on Vercel (`@vercel/analytics`; `CRON_SECRET` is already in `.env.example`).

**Auth**
- JWT in the httpOnly cookie `authToken`.
- `proxy.ts` gates `/admin/*` and `/librarian/*` at the edge.
- `lib/middleware/auth.ts` provides `authenticateRequest`, `requireAdmin`, `requireLibrarian` and `requireAdminOrLibrarian`. It re-checks the DB on every request and includes the trial/plan lock (`ACCESS_LOCKED`).
- Roles are `admin` and `librarian`. There is no student login.

**Tenancy (important)**
- Every tenant document (`Student`, `Seat`, `Book`, `Transaction`, `Message`) is scoped by **`librarianId`** (the owner `User._id`). One librarian is one library.
- `lib/models/Library.ts` exists but is **unused**: no code imports it and the `libraries` collection doesn't exist in the DB.
- `Student.libraryId` exists but is never set.

**Live data** (read-only check of the configured DB):
- Collection counts: 3 librarians, 5 students, 5 seats (all assigned), 1 book, 1 transaction, 1 ad, 0 plans.
- Phone numbers are stored in **mixed formats** (3 × 10-digit, 2 × `+91…`).
- There is **1 duplicate phone group** within the same librarian.
- The DB is a replica set (Atlas), so multi-document transactions are available in production. Local dev may run a standalone `mongod`, so the design must not *depend* on transactions.

**Relevant existing modules**

| Area | Files | Status |
|---|---|---|
| Students | `lib/models/Students.ts`, `app/api/students/*`, `app/librarian/students/*` | Manual add/edit/delete. `paymentStatus` is paid/unpaid/pending; `membershipStatus` is active/inactive/expired. Email is required. |
| Seats | `lib/models/Seat.ts`, `lib/services/seats.ts`, `app/api/seats/*`, `app/librarian/seats/page.tsx` | One student per seat. No shifts or sections. Status is available/reserved/occupied. |
| Memberships | `app/librarian/membership/page.tsx`, `app/api/send-reminder` | Dates live on the Student record. No plans, payments or receipts. |
| Books | `Book`, `Transaction`, `lib/services/transactions.ts` | Issue/return/renew. **Not touched** by this plan beyond the `libraryId` backfill. |
| Dashboard | `app/librarian/DashboardClient.tsx`, `app/api/dashboard`, `lib/dashboard-data.ts` | Stats and charts. To be extended. |
| Librarian subscription | `lib/services/access.ts`, `lib/models/Plan.ts`, `app/admin/plans`, `app/api/librarian/access` | Trial, approval request, plan with expiry (built earlier). Reused as the "subscription plans for libraries". |
| Rate limiting | `lib/rate-limit.ts` | In-memory, so it only works on one instance. Used for OTP as a first line; OTP attempt counters are also kept in the DB (see §7). |
| Uploads | `lib/cloudinary.ts` | Reused for student photos. |
| Model registration | `lib/models/define-model.ts` | Reused for every new model. |
| Tooling | — | **No test framework.** `npm run lint` is declared but eslint isn't installed. Typecheck and build work. |

---

## 2. Key design decisions (backward-compatible)

### 2.1 Tenant: make `Library` the tenant without breaking `librarianId`
- Reuse `lib/models/Library.ts`. Add `slug`, `settings`, `status` and `qrVersion`. Keep `ownerId`. Make `subdomain` optional; this is safe because the collection is empty.
- Add **`User.libraryId`**. Each librarian belongs to exactly one library.
- **Backfill script.** For every librarian without a library, create one (`name` = "<Name>'s Library", unique `slug`) and set `User.libraryId`. Also set `libraryId` on all their `Student`, `Seat`, `Book`, `Transaction` and `Message` docs.
- New code scopes by **`libraryId`**. Existing routes keep their `librarianId` filters, and every write now sets **both** fields. Nothing that works today changes behavior.
- A new guard, **`requireLibraryContext(request)`**, returns `{ userId, role, libraryId }`. It throws 403 if the librarian has no library or the library is suspended. Every new librarian API uses it, and `libraryId` always comes from the session, **never from the request body or query**.
- **New librarian signups:** the `Library` is created when the OTP is verified, next to the existing trial start.

### 2.2 Student lifecycle
- Add **`Student.status`**: `PENDING | DEMO | ACTIVE_MEMBER | EXPIRED | DEMO_ENDED | REJECTED | BLOCKED`.
- **Backfill** for existing students: `ACTIVE_MEMBER` if `membershipEndDate > now`, otherwise `EXPIRED`.
- The legacy fields `paymentStatus` and `membershipStatus` are **kept and mirrored** from `status` and payments, so the existing Students and Memberships pages keep working.
- `Student.email` becomes **optional**, since QR registrants may have no email. The existing add-student form still asks for it.
- Phones are stored **normalized to E.164** (`+91XXXXXXXXXX`). The original value is kept in `phoneRaw`.
- **Unique index `{libraryId, phone}`**, partial on `status != 'REJECTED'`.
  - Before building it, the migration runs in **report mode**: it prints the duplicate groups (1 today) and refuses to create the unique index until they are resolved.
  - Until then, a non-unique index is used and check-in picks the most recently updated record. Nothing is deleted automatically.

### 2.3 Seats become shift-aware through assignments
- **`Seat`** gains:
  - `libraryId`
  - `sectionId`
  - `seatType` (`STANDARD | AC | WINDOW | CABIN | …`, free label)
  - `isActive`
  - `lockUntil` (concurrency guard)

  The legacy `status`, `studentId` and `studentName` fields are kept for the existing page. They are updated as a mirror of the student's "primary" assignment.
- **New `SeatAssignment`** (the source of truth):
  - `seatId`, `shiftId`, `studentId`, `libraryId`
  - `kind`: `REQUESTED | DEMO | MEMBER`
  - `startDate`, `endDate`
  - `status`: `ACTIVE | RELEASED | EXPIRED`
- **Displayed seat status is computed** per (shift, date), never stored:

  | Status | Shown when |
  |---|---|
  | `OCCUPIED` | Someone is inside now (open attendance) |
  | `ASSIGNED` | An active MEMBER assignment exists |
  | `DEMO_HOLD` | An active DEMO assignment exists |
  | `REQUESTED` | A pending student chose this seat |
  | `AVAILABLE` | None of the above |
  | `EXPIRED` | The seat is inactive, or its assignment ended without release |

  This avoids the stale-status drift that the existing `repair-seat-links.mjs` script was written to fix.
- **Double-booking rule:** a seat can't have two ACTIVE assignments whose **shift time windows overlap** *and* whose **date ranges overlap**. This also blocks "Full Day" against "Morning" on the same seat.
- **Concurrency:** the seat is locked atomically (`findOneAndUpdate({_id, lockUntil < now}, {lockUntil: now+10s})`), then overlaps are checked, the assignment is inserted, and the lock is released. A Mongo transaction is used when available. This works on standalone dev Mongo too.
- **Migration:** each library gets a default shift, **"Full Day"** (06:00–22:00, editable). Every currently assigned seat becomes a `MEMBER` assignment on that shift, with `endDate` set to the student's `membershipEndDate`, or open-ended if that's empty.

### 2.4 Memberships, plans, payments
- **New `MembershipPlan`** (per library): name, `durationDays` (30/90/365/custom), price, `isActive`. This is **separate** from the existing platform `Plan`, which stays as the librarian subscription.
- **New `Membership`:** `studentId`, `libraryId`, `planId?`, `kind DEMO|MEMBER`, `startDate`, `endDate`, `fee` (a snapshot of the plan price), `status ACTIVE|EXPIRED|CANCELLED`, `shiftId`, `seatId?`.
  - `Student.membershipStartDate`, `membershipEndDate` and `paymentStatus` mirror the current membership.
- **New `Payment`:** see **R6** for the exact model (modes CASH/UPI/BANK; status PAID/PARTIAL/PENDING).
  - `receiptNo` is unique per library and comes from an atomic counter, `Library.receiptSeq`.
- **Dues** = membership fee − sum of payments. Partial payments are allowed.

### 2.5 Shifts and attendance
- **New `Shift`:** `libraryId`, `name`, `startTime`/`endTime` as `"HH:mm"`, `isActive`, `sortOrder`. `crossesMidnight` is derived (for example, Night 22:00–06:00).
- All date logic uses the **library timezone** (`settings.timezone`, default `Asia/Kolkata`).
  - `Attendance.date` is the library-local `YYYY-MM-DD` on which the **shift started**, so a night shift that runs past midnight belongs to the start day.
- **Student shift (`Student.shiftId`):** the shift a student attends. The migration sets it to the library's "Full Day" shift for existing students. From Phase 3, `SeatAssignment` carries the seat per shift.
- **New `Attendance`:** every field in the spec, plus `note`, `overriddenBy`, `manuallyEdited`, `autoCheckedOut`, `lateMinutes` and `seatNumber` (seat snapshot). Unique index `{studentId, shiftId, date}` makes duplicate check-ins impossible, even under a double-tap race.
- **Status fields:**
  - `arrivalStatus`: `PRESENT | LATE | ABSENT` (R2).
  - `leftEarly`: boolean, true when check-out is before shift end.
  - **`status`** is stored for filtering and is always derived:
    1. `CURRENTLY_INSIDE` while `isInside`
    2. else `LEFT_EARLY` if `leftEarly`
    3. else `arrivalStatus`

    This keeps "late *and* left early" from losing information.
  - No check-in by shift end → `ABSENT`. In Phases 1–3 this is shown as a computed "Not checked in / Absent" row in the attendance list; from Phase 4 the cron also writes it.
- **Scan rules and auto check-out:** see **R1**. When a student has several shifts, the one whose window contains "now" is used.

### 2.6 Student identity, OTP, QR
- **QR URL:** `https://<app>/checkin/<slug>?k=<sig>`, where `sig = HMAC_SHA256(JWT_SECRET, libraryId + ':' + qrVersion)`, truncated to 16 chars.
  - The server rejects a missing or invalid `k`.
  - The librarian can **regenerate the QR**, which bumps `qrVersion` and makes old prints stop working.
- **New `StudentOtp`:**
  - `libraryId`, `phone`, `codeHash` (an HMAC of the code, never plaintext)
  - `expiresAt` (5 min, with a TTL index)
  - `attempts` (max 5), `sendCount`, `lastSentAt`
- **Limits:**
  - 60 s resend cooldown.
  - Max 5 sends per phone per hour.
  - Max 30 sends per IP per hour.
  - Max 500 sends per library per day (cost guard).
- Codes are compared with `timingSafeEqual`.
- **Student session:** after verification, a JWT with `{purpose: 'student', libraryId, phone, studentId?}` is set as the httpOnly cookie `studentSession` for 30 days (D2). It is a separate cookie and purpose from the staff `authToken`, so it can never pass staff guards, and staff tokens can never pass student guards.

---

## 3. Existing files to reuse or modify

| File | Change |
|---|---|
| `lib/models/Library.ts` | Add `slug`, `status ACTIVE|SUSPENDED`, `settings {timezone, graceMinutes, demoDays, earlyCheckinMinutes, expiringSoonDays, geofence?}`, `qrVersion`, `receiptSeq`. Make `subdomain` optional. Switch to `defineModel`. |
| `lib/models/User.ts` | Add `libraryId`. |
| `lib/models/Students.ts` | Add `status`, `phoneRaw`, `photoUrl`, `preferredShiftId`, `preferredSectionId`, `preferredSeatId`, `demoStartDate`, `demoEndDate`, `rejectionReason`, `notes`. Email becomes optional. Add indexes. Switch to `defineModel`. |
| `lib/models/Seat.ts` | Add `libraryId`, `sectionId`, `seatType`, `isActive`, `lockUntil`. Extend the legacy status enum (additive). |
| `lib/models/Book.ts`, `Transaction.ts`, `Message.ts` | Add an optional `libraryId` (backfilled). |
| `lib/middleware/auth.ts` | Add `requireLibraryContext`, `requireStudentSession`, `getStudentSession`. |
| `lib/services/seats.ts` | Re-implement on top of `SeatAssignment`, keeping the same exported function signatures, which `/api/students` and `/api/seats` already call. |
| `app/api/students/route.ts`, `[id]/route.ts` | Normalize phone; set `libraryId` and `status`; on create, also create a `Membership` (and a `Payment` if marked paid). Response shapes unchanged. |
| `app/api/seats/*` | Add `libraryId`, `sectionId`, `seatType`; refuse to delete seats with active assignments. |
| `app/api/auth/verify-otp/route.ts` | Create the `Library` for a new librarian. |
| `app/api/admin/librarians/*`, `app/api/admin/stats` | Include library info and per-library stats. |
| `app/librarian/seats/page.tsx` | Rebuilt as the **color-coded seat map** with section/shift filters. The current actions (assign/release) are kept. |
| `app/librarian/DashboardClient.tsx` | New widgets (§6.2). |
| `app/librarian/membership/page.tsx` | Uses `Membership`, `Payment` and dues. |
| `components/librarian/sidebar.tsx`, `bottom-nav.tsx` | New nav items. |
| `app/admin/layout.tsx`, `bottom-nav` tabs | Libraries and Audit log items. |
| `lib/api.ts` | Client methods for all new endpoints. |
| `lib/email-service.ts` | Optional emails: new student request to librarian, receipt to student when an email exists. |
| `lib/cloudinary.ts` | `uploadStudentPhoto`. |
| `proxy.ts` | No change. `/checkin` and `/my-library` are public pages and are protected by the student session in their APIs. |

---

## 4. New files

**Models** (`lib/models/`): `Shift.ts`, `Section.ts`, `SeatAssignment.ts`, `MembershipPlan.ts`, `Membership.ts`, `Payment.ts`, `Attendance.ts`, `StudentOtp.ts`, `AuditLog.ts`, `PlatformPayment.ts`, `ShiftRun.ts` (cron idempotency).

**Services** (`lib/services/`):

| File | Responsibility |
|---|---|
| `library.ts` | Context, slug generation, settings defaults, QR signing |
| `time.ts` | Library-timezone helpers, shift windows, overlap math (pure, unit-tested) |
| `shifts.ts` | Shift CRUD rules |
| `seat-assignments.ts` | Assign, change, vacate, overlap check, lock, seat-map computation |
| `student-otp.ts` | Send, verify, rate limits, `OtpChannel` interface |
| `otp-channels/console.ts`, `otp-channels/msg91.ts` | OTP delivery implementations |
| `checkin.ts` | The scan state machine (§5.2) |
| `attendance.ts` | Status calculation, manual overrides |
| `memberships.ts` | Demo creation, conversion, renewal, expiry, dues |
| `payments.ts` | Receipt numbers, recording payments |
| `reports.ts` | Aggregations and CSV builder |
| `audit.ts` | `logAudit(actor, action, entity, meta)` |
| `cron.ts` | Shift-close and expiry jobs |

**Other lib files**
- `lib/phone.ts`: E.164 normalization (unit-tested).
- `lib/validation-library.ts`: zod schemas for every new form and API.

**Scripts**
- `scripts/migrate-libraries.mjs`: `--dry-run` by default, `--apply` to write; idempotent.
- `scripts/report-duplicate-phones.mjs`

**Tests:** `tests/*.test.ts` (vitest) and `scripts/e2e-checkin.sh` (curl flow against a throwaway local DB, the same approach used in earlier sessions).

**Pages:** see §6.

---

## 5. API endpoints

All librarian endpoints use `requireLibraryContext`: `libraryId` comes from the session, every query filters by it, and IDs from other libraries return **404** (not 403) so they can't be probed. Mutations write to `AuditLog`.

### 5.1 Public / student (QR flow)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/checkin/[slug]?k=` | Validate QR. Return library name, status, active shifts, sections, geofence on/off. No personal data. |
| POST | `/api/checkin/[slug]/otp/send` | `{phone, k}` → send OTP (rate-limited). |
| POST | `/api/checkin/[slug]/otp/verify` | `{phone, code, k}` → set the `studentSession` cookie and return `{studentState}`. |
| GET | `/api/checkin/[slug]/availability?shiftId=` | Available seats and sections for the registration form (student session required). |
| POST | `/api/checkin/[slug]/register` | multipart: name, photo, shift, section, optional seat → `PENDING` student plus a `REQUESTED` hold. |
| POST | `/api/checkin/[slug]/scan` | `{k, lat?, lng?}` → state machine (§5.2); returns the result screen payload. |
| GET | `/api/my-library` | Seat, shift, membership, days left, attendance history, study hours, dues, receipts. |
| GET | `/api/my-library/receipts/[id]` | Receipt data (only if it belongs to this student). |
| POST | `/api/checkin/[slug]/logout` | Clear the student session. |

### 5.2 Scan state machine (`lib/services/checkin.ts`)

1. **Library not active** (suspended, or past the D4 grace period) → `LIBRARY_UNAVAILABLE`.
2. **Optional geofence:** location outside the radius or not shared → `OUT_OF_RANGE`.
3. **Student lookup** by `libraryId + phone`:
   - None → `NEEDS_REGISTRATION`
   - `PENDING` → `AWAITING_APPROVAL`
   - `REJECTED` → `REJECTED` with reason; may re-register after 24 h
   - `BLOCKED` → `ACCESS_DENIED`
   - `EXPIRED` / `DEMO_ENDED` → `RENEWAL_REQUIRED`
4. **Validity:**
   - `DEMO` with `demoEndDate` passed → set `DEMO_ENDED`, release the seat → `RENEWAL_REQUIRED`.
   - `ACTIVE_MEMBER` with membership ended → set `EXPIRED`, release the seat → `RENEWAL_REQUIRED`.
5. **Shift:** pick the student's shift whose window contains now. None → `OUTSIDE_SHIFT_HOURS`, with the next start time.
6. **Attendance** for (student, shift, date):
   - None → insert check-in (`PRESENT`/`LATE`, `entryType` DEMO|MEMBER, `source` QR) → `CHECKED_IN`
   - Open → set check-out, `totalMinutes`, and `LEFT_EARLY` if before shift end → `CHECKED_OUT`
   - Closed → `ALREADY_CHECKED_OUT`
   - Absent (cron already ran) but the student arrives → convert to `LATE` check-in
7. **Expiry warning:** membership days left ≤ `expiringSoonDays` → `warning: EXPIRING_SOON`.

### 5.3 Librarian

| Method | Path | Purpose |
|---|---|---|
| GET/PATCH | `/api/library` | Own library profile and settings (grace, timezone, demo days, geofence) |
| GET | `/api/library/qr` | QR URL and PNG/SVG data |
| POST | `/api/library/qr/rotate` | Bump `qrVersion` |
| GET/POST | `/api/shifts` | List / create |
| PATCH | `/api/shifts/[id]` | Edit, activate/deactivate (blocked while active assignments exist, unless forced with reassignment) |
| GET/POST | `/api/sections` | List / create |
| PATCH/DELETE | `/api/sections/[id]` | Edit / delete |
| GET | `/api/seats` | *(existing, extended)* `?sectionId=` filter |
| POST | `/api/seats/bulk` | Create a range, e.g. A1–A40 |
| GET | `/api/seats/map?shiftId=&date=` | Computed statuses for the live map |
| POST | `/api/seat-assignments` | Assign |
| PATCH | `/api/seat-assignments/[id]` | Change seat/shift/dates |
| DELETE | `/api/seat-assignments/[id]` | Vacate/release |
| GET | `/api/student-requests` | Pending registrations |
| POST | `/api/student-requests/[id]/approve` | Creates a DEMO membership (demo days from settings) plus a DEMO seat hold if one is available |
| POST | `/api/student-requests/[id]/reject` | `{reason}` |
| GET | `/api/students?status=` | *(existing, extended)* filter by lifecycle status |
| POST | `/api/students/[id]/convert` | Plan or custom dates, fee, payment, final seat + shift → `ACTIVE_MEMBER` + receipt |
| POST | `/api/students/[id]/renew` | Renew membership |
| PATCH | `/api/students/[id]/status` | Block/unblock |
| GET/POST | `/api/membership-plans` | List / create |
| PATCH | `/api/membership-plans/[id]` | Edit |
| GET/POST | `/api/payments` | List (dues view) / record payment |
| GET | `/api/payments/[id]/receipt` | Receipt data |
| GET | `/api/attendance?date=&shiftId=&status=` | Today's list, Currently Inside |
| POST | `/api/attendance/manual` | Manual check-in or check-out |
| PATCH | `/api/attendance/[id]` | Change status, convert absent→present, add note (stores `overriddenBy`) |
| GET | `/api/reports/[type]?from=&to=&shiftId=&format=json\|csv` | `type` ∈ daily, monthly, shift, occupancy, fees, expiring, absent |

### 5.4 Admin

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/admin/libraries` | List with stats / create library + owner librarian (pre-verified, optional plan) |
| GET/PATCH | `/api/admin/libraries/[id]` | Edit; `status` ACTIVE/SUSPENDED |
| POST | `/api/admin/libraries/[id]/librarians` | Assign/move a librarian to this library |
| PATCH | `/api/admin/librarians/[id]` | *(existing)* Deactivate |
| GET | `/api/admin/reports/revenue?from=&to=` | Platform revenue from `PlatformPayment`, subscriptions by plan |
| GET | `/api/admin/audit-logs?libraryId=&action=&from=&to=` | Audit log |

Existing `/api/admin/plans`, `/api/admin/librarians/*` and the approval flow are unchanged. Approving a librarian with a plan now also writes a `PlatformPayment` (amount = plan price, status `RECORDED`) so revenue reports have data.

### 5.5 Cron

- `POST /api/cron/attendance`, header `Authorization: Bearer $CRON_SECRET`.
- For each active library and each shift whose end has passed in library time:
  - Insert `ABSENT` for active/demo students assigned to that shift with no record.
  - Auto check-out open records at shift end.
  - Keyed by `ShiftRun {libraryId, shiftId, date}` (unique), so it runs at most once per shift per day.
- It catches up on up to 3 missed days.
- It also expires demos and memberships and releases their seats.

---

## 6. Frontend pages

### 6.1 Student (public, mobile-first, no app chrome)

**`/checkin/[slug]`**: one page with these steps:

- **Phone**: enter phone number.
- **OTP**: 6-box input, resend countdown.
- **Register**: name, photo (camera capture), shift, section, optional seat picked from the availability grid.
- **Result**: one of the following screens.
  - Checked in: library, name, seat, shift + timing, membership status, days left, check-in time, Present/Late badge, expiring-soon warning.
  - Checked out: check-out time, total study time, seat, library.
  - Already checked out.
  - Awaiting approval.
  - Renewal required (with the library's phone).
  - Access denied.
  - Outside shift hours.
  - Library unavailable.
  - Out of range.
- A visible session lets the student scan straight to the result (D2).

**`/my-library`**: seat, shift timing, library, membership status and days left, attendance history (paged), total study hours, dues, receipts, renewal status, log out.

**`/receipt/[id]`**: printable receipt. Available to the student via session and to the librarian.

### 6.2 Librarian (existing layout and access gate; new sidebar items)

| Page | Content |
|---|---|
| `/librarian` *(extended)* | Cards: Inside now, Present, Late, Absent, New requests, Demo students, Expiring (7 d), Pending dues. Mini live seat map. Requests panel with Approve / Reject / Assign seat. |
| `/librarian/library-qr` | QR preview, Download PNG, Print (A4 poster layout), Regenerate (with confirm), copy link |
| `/librarian/shifts` | Table plus create/edit dialog, activate toggle |
| `/librarian/seats` *(rebuilt)* | Section and shift tabs; color-coded grid (green available / blue requested / yellow demo hold / purple assigned / red occupied / gray inactive or expired); seat drawer with assign / change / vacate; section manager; bulk-add seats |
| `/librarian/requests` | Pending registrations with photo, shift, preferred seat; approve (choose demo seat) or reject |
| `/librarian/students` *(extended)* | Status filter tabs: Pending, Demo (days left), Active (expiry), Expired, Blocked. Row actions: Convert to member, Renew, Block |
| `/librarian/attendance` | Date and shift filters; tabs Present / Late / Absent / Inside; manual check-in and check-out; edit status/note |
| `/librarian/membership` *(extended)* | Membership plans manager; expiring list; dues with "Collect payment"; receipts |
| `/librarian/reports` | Report type, date range, shift; table preview; **Export CSV**; **Print / Save PDF** |
| `/librarian/settings` *(extended)* | Library profile, timezone, grace minutes, demo days, geofence |

Bottom nav (mobile): Home, Students, Seats, **Attendance**, More.

### 6.3 Admin

| Page | Content |
|---|---|
| `/admin/libraries` | Table (students, seats, active members, today's attendance, revenue), create library + librarian dialog, suspend/activate |
| `/admin/libraries/[id]` | Detail, stats, librarians, settings, recent audit events |
| `/admin/reports` | Platform revenue, subscriptions by plan, libraries growth |
| `/admin/audit-logs` | Filterable table |

Every screen gets loading skeletons, empty state, error state with retry, toasts on success, labelled inputs, keyboard-reachable dialogs, and 44 px touch targets on student pages.

---

## 7. Role-based permissions

| Capability | Admin | Librarian (own library only) | Student (session for one library) |
|---|---|---|---|
| Create/suspend libraries, create/assign librarians | ✅ | ❌ | ❌ |
| Platform plans, revenue, audit logs (all) | ✅ | ❌ | ❌ |
| View any library's stats | ✅ (read) | Own only | ❌ |
| Shifts, sections, seats, membership plans, settings, QR | ❌ (read via library detail) | ✅ | ❌ |
| Approve/reject requests, convert, renew, block | ❌ | ✅ | ❌ |
| Assign/change/vacate seats | ❌ | ✅ | Request preferred seat only |
| Attendance manual override, reports, CSV/PDF | ❌ | ✅ | ❌ |
| Check in/out via QR | ❌ | ❌ | ✅ (own record) |
| View own seat/membership/attendance/receipts | — | — | ✅ |

**Enforcement**
- `requireAdmin` (existing).
- `requireLibraryContext`, which also applies the existing trial lock.
- `requireStudentSession`, which checks that the session's `libraryId` equals the `slug`'s library.
- Each service function takes `libraryId` as its first argument, and every query filters by it.
- A regression test calls each librarian endpoint with library B's IDs while logged in to library A and expects 404.

---

## 8. Database changes and migration

**No data is dropped. All changes are additive.**

**`scripts/migrate-libraries.mjs`**: dry-run by default, prints planned changes; `--apply` writes them. Safe to re-run.

1. Create a `Library` per librarian that lacks one: unique slug from the name plus a short suffix, default settings, `qrVersion: 1`. Set `User.libraryId`.
2. Backfill `libraryId` on `students`, `seats`, `books`, `transactions` and `messages` from `librarianId`.
3. Students:
   - Set `status`: `ACTIVE_MEMBER` if `membershipEndDate > now`, otherwise `EXPIRED`.
   - Normalize `phone` to E.164 and copy the original to `phoneRaw`.
   - Create a `Membership` from the existing dates, and a `Payment` only if `paymentStatus = paid` with fee `0` and `mode OTHER`, marked "migrated". This avoids inventing amounts.
4. Create the "Full Day" shift per library. Convert each seat with `studentId` into a `MEMBER` `SeatAssignment`.
5. **Indexes**, created after the backfill:

   | Collection | Index |
   |---|---|
   | `students` | `{libraryId, phone}` (unique, partial; **skipped with a report if duplicates exist**) |
   | `students` | `{libraryId, status}` |
   | `attendance` | `{studentId, date}` |
   | `attendance` | `{libraryId, date}` |
   | `attendance` | `{studentId, shiftId, date}` (unique) |
   | `attendance` | `{libraryId, isInside}` |
   | `seatassignments` | `{seatId, shiftId, startDate, endDate}` |
   | `seatassignments` | `{libraryId, studentId, status}` |
   | `studentotps` | `{libraryId, phone}` |
   | `studentotps` | `{expiresAt}` (TTL) |
   | `memberships` | `{libraryId, endDate}` |
   | `payments` | `{libraryId, paidAt}` |
   | `payments` | `{libraryId, receiptNo}` (unique) |
   | `auditlogs` | `{libraryId, createdAt}` |
   | `libraries` | `{slug}` (unique) |
   | `shiftruns` | `{libraryId, shiftId, date}` (unique) |

   The spec's `seatId + shiftId + date` index lives on `attendance` plus the `seatassignments` range index.
6. **Phone normalization can create new duplicates** (`9876543210` and `+919876543210` are the same person). The script reports these together with the 1 existing duplicate group. The librarian merges or deletes them from the UI before the unique index is created. No automatic merging.

**Rollback:** every change is additive. Old code ignores new fields, and the old filters (`librarianId`) still match every document.

**Order in production:** deploy code that writes both fields → run the migration dry-run → run `--apply` → enable the cron.

---

## 9. Edge cases handled

**Time and shifts**
- Night shift across midnight: attendance dated to the shift's start day; absent marking runs after the real end.
- Overlapping shifts (Full Day vs Morning) on one seat are blocked by time-window overlap, not just `shiftId` equality.
- A student with two shifts gets attendance per shift; a scan picks the shift whose window contains now.
- Scan before the early window or after shift end → "Outside shift hours" with the next start time.
- Shift edited or deactivated while assignments exist: an edit that would create overlaps is rejected; deactivation requires reassigning first.
- Library timezone differs from the server's UTC: all "today" and window math goes through `time.ts`.

**Expiry timing**
- Demo or membership ends mid-session: check-out is still allowed; the next check-in is refused.
- The cron is late or misses a run: scan-time validation still blocks expired students; the cron catches up on missed days, and `ShiftRun` keeps it idempotent.
- A student arrives after the cron marked them absent: the record converts to a `LATE` check-in.

**Scanning and attendance**
- Double-tap or two devices scanning at once: the unique index makes exactly one check-in win, and the other reads the existing record.
- Scan after check-out → "You have already checked out today" (only for that shift).
- Manual override of attendance stores `overriddenBy`, a note and an audit entry; cron and scans never overwrite a manually edited record.

**Seats**
- Seat deleted or deactivated with an active assignment: delete is blocked; deactivate is allowed only after vacating.
- Preferred seat taken by the time the librarian approves: approval shows the conflict and lets them pick another seat or approve without one.
- Concurrent assignment of one seat by two tabs: the seat lock plus re-check means the second gets "Seat just taken".

**Students and registration**
- Same phone at two libraries: allowed (separate students, separate sessions).
- Rejected student re-registers: allowed after 24 h; the old record stays `REJECTED` (partial unique index).
- Blocked student: access denied; the librarian can unblock.
- Student changes phone: librarian edits the phone; the old session stops matching.
- Photo upload: JPEG/PNG/WebP, ≤ 5 MB, resized by Cloudinary. If uploads aren't configured, registration still works without a photo.

**OTP and QR**
- OTP brute force: 5 attempts per code, codes are hashed, 5-minute expiry, send limits per phone/IP/library, constant-time compare.
- Old printed QR after regeneration → "This QR code is no longer valid. Ask the librarian for the new one."
- Library suspended or plan lapsed → check-in shows "Library temporarily unavailable" (D4).

**Plans and payments**
- Plan price changes after purchase: the fee is snapshotted on `Membership`.
- Partial payment: dues show the remainder.
- Receipt numbers never collide: atomic per-library counter.

**Existing data**
- Existing students with no phone/email edge cases: none have a missing phone (verified). Email becomes optional, so QR registrants without email are fine.

---

## 10. Testing

- **Unit (vitest):**
  - `time.ts` (windows, midnight crossing, timezone)
  - attendance status calculation (present/late/left early)
  - seat overlap logic
  - `phone.ts` normalization
  - OTP hash/verify and attempt limits
  - QR signature verify
  - the check-in state machine with a stubbed repository
- **End to end** (`scripts/e2e-checkin.sh`, throwaway local `mongod` and a production build, real DB never touched), covering all 16 acceptance criteria:
  - Admin creates library + librarian → librarian logs in → creates sections, seats, shifts → gets QR.
  - Student OTP (console channel) → register → librarian approves → DEMO.
  - Scan → DEMO check-in → second scan check-out → third scan already-out.
  - Convert → MEMBER attendance.
  - Time-travel by editing dates in the DB → cron marks absent and expires the demo → scan shows renewal.
  - Library A token against library B IDs → 404 on every endpoint.
- **Visual:** headless screenshots of the student check-in screens at 390 px and the seat map at desktop width.
- **Gates before done:** `tsc --noEmit`, `npm run build`, vitest, the e2e script. `npm run lint` can't run (eslint isn't installed). I'll leave it as is and report it, unless you want eslint added.

---

## 11. Implementation order (four phases)

Each phase ends with typecheck, build, unit tests, an end-to-end run on a throwaway DB, and a **testing checklist for approval before the next phase starts**.

### Phase 1: Tenant migration, library QR, OTP check-in, attendance

**Tenant**
- `Library` model update, `User.libraryId`.
- `ensureLibraryForUser`: creates the library and backfills `libraryId` on that librarian's existing docs the first time.
- `requireLibraryContext`, `libraryId` on new writes (students, seats, books, transactions).
- `scripts/migrate-libraries.mjs` (dry-run / `--apply`), duplicate-phone report, indexes.

**Students**
- `status` (`ACTIVE_MEMBER` / `EXPIRED` / `BLOCKED`), E.164 phone, `shiftId`.
- The existing add/edit flows keep `status` in sync with the membership dates.

**Shifts**
- Model, API and `/librarian/shifts` page. A default "Full Day" shift is created per library.

**Library settings**
- Timezone, grace minutes (R2), early check-in minutes, optional geofence (D3).

**Library QR**
- Signed URL, `/librarian/library-qr` (view / download PNG / print / regenerate).

**Student OTP**
- `StudentOtp` (hashed, 5-minute expiry, 5 attempts, send limits), `OtpChannel` (console in dev, MSG91), 30-day per-library student session.

**Check-in**
- `/checkin/[slug]` mobile flow and the scan state machine (R1, R5).
- Statuses not created until Phase 2 (`PENDING`, `DEMO`, unknown phone) show a holding message: "Not registered — ask the librarian".

**Attendance**
- Model and service (R1, R2), lazy auto check-out.
- `/librarian/attendance`: date and shift filters; Present / Late (late by X) / Not checked in / Inside tabs; manual check-in / check-out / status / note.
- Today's attendance card on the dashboard.

**Audit and tests**
- `AuditLog`, with librarian login and manual overrides (R8).
- Vitest unit tests (time, phone, attendance rules, OTP, QR signature), e2e script, screenshots.

**Phase 1 — delivered, with these deviations from the plan above:**
- The unique `{libraryId, phone}` index is **not** declared on the schema. `scripts/migrate-libraries.ts` builds it only once duplicates are resolved. Declaring it made every server start fail to build it and broke the backfill of duplicate rows (found by the e2e test). The API still blocks new duplicates.
- **Repeat-scan guard:** a scan within 2 minutes of check-in returns "already checked in" instead of checking out, so a page refresh or double tap can't end a session.
- **Library creation is lazy:** each librarian's library is created on their first login or API call, with backfill. Running the migration script is still recommended, to tag every record and build the indexes.
- **E2E test is Node, not bash** (`scripts/e2e-phase1.mjs`). macOS bash 3.2 mis-parses the quoted JSON bodies.
- The QR link uses `NEXT_PUBLIC_APP_URL` when it is set, and the request origin otherwise.

### Phase 2: Registration, librarian approval, 3-day demo
- Register API and form (photo, shift, section/seat preference).
- `PENDING` student, `/librarian/requests` with approve/reject (audited).
- Demo creation (`demoDays` setting, default 3).
- DEMO scans with `entryType = DEMO`; demo expiry enforced at scan time.
- Email becomes optional on students.

### Phase 3: Membership conversion, seat assignment, seat map
- `Section`, `SeatAssignment` (R3 conflict rule, seat lock), seat-service refactor.
- Colour-coded live seat map.
- `MembershipPlan`, `Membership`, `Payment` (R6), convert/renew with dues.
- Notifications: seat assignment and receipt emails; audit logs for membership, seat and payment events.

### Phase 4: Reports, admin panel, cron jobs, receipts
- Cron endpoint (R1 auto check-out, absent marking, R4 demo/membership expiry, seat release; `ShiftRun` idempotency).
- Reports: daily, monthly, shift, occupancy, **Seat Utilisation (R7)**, fees, expiring, absent; CSV and print.
- Printable receipts, `/my-library`.
- Admin: libraries (create / suspend, audited), librarian assignment, platform revenue (`PlatformPayment`), audit-log viewer, library stats.
- Expiry reminder notification.

## 12. Known limitations and next steps

- **SMS:** real OTP delivery needs an MSG91 account and DLT template approval (D1). Until then, OTP works in dev via the console only.
- **Remote check-in:** a static QR can still be used remotely unless the geofence is enabled (D3). A rotating QR on a door screen is the stronger next step.
- **Rate limiting:** the in-memory limiter is per instance. OTP limits are also enforced in the DB, but general API rate limits should move to Redis (Upstash) for multi-instance deploys (already noted in the README).
- **Payments:** online payments (Razorpay/UPI collect) are out of scope; payments are recorded manually.
- **One library per librarian:** multi-staff per library is enabled by `User.libraryId`, but staff roles and permissions inside a library are not built.
- **Student identity:** the student "login" is the OTP session only; no password accounts, as the spec asks.
