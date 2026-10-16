#!/usr/bin/env node
/**
 * Phase 1 end-to-end check (PLAN.md §10). Runs against a THROWAWAY database only.
 *
 *   mongod --dbpath /tmp/e2edb --port 27999 --replSet rs0 --fork --logpath /tmp/e2edb.log
 *   mongosh --port 27999 --eval 'rs.initiate()'
 *   npm run build
 *   MONGODB_URI=mongodb://127.0.0.1:27999/e2e JWT_SECRET=e2e-secret-0123456789abcdef \
 *     OTP_CHANNEL=console ALLOW_CONSOLE_OTP=true npx next start -p 3999 > /tmp/next.log 2>&1 &
 *   node scripts/e2e-phase1.mjs mongodb://127.0.0.1:27999/e2e http://localhost:3999 /tmp/next.log
 *
 * Seeds legacy-shaped data, runs the migration, then drives the APIs. A
 * production server never returns OTPs, so codes are read from the console
 * channel's lines in the server log (3rd argument).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const [DB, BASE, LOG] = process.argv.slice(2);
if (!DB || !BASE) {
  console.error('usage: node scripts/e2e-phase1.mjs <local mongo uri> <base url> [server log]');
  process.exit(2);
}
if (!/127\.0\.0\.1|localhost/.test(DB)) {
  console.error(`Refusing: ${DB} is not a local database`);
  process.exit(2);
}

let pass = 0;
let fail = 0;
const ok = (label) => (pass++, console.log(`  ✓ ${label}`));
const bad = (label) => (fail++, console.log(`  ✗ ${label}`));
const expect = (label, actual, expected) =>
  actual === expected ? ok(label) : bad(`${label} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
const section = (t) => console.log(`\n== ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A browser-ish client with its own cookie jar. */
function client() {
  const jar = new Map();
  return {
    jar,
    async call(method, path, body) {
      const res = await fetch(BASE + path, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual',
      });
      for (const c of res.headers.getSetCookie()) {
        const [pair, ...attrs] = c.split(';');
        const i = pair.indexOf('=');
        const name = pair.slice(0, i).trim();
        const value = pair.slice(i + 1).trim();
        if (!value || attrs.some((a) => /max-age=0/i.test(a))) jar.delete(name);
        else jar.set(name, value);
      }
      const json = await res.json().catch(() => null);
      return { status: res.status, ...(json ?? {}) };
    },
    async form(path, fields) {
      const fd = new FormData();
      for (const [key, v] of Object.entries(fields)) if (v !== undefined && v !== null) fd.append(key, String(v));
      const res = await fetch(BASE + path, {
        method: 'POST',
        headers: jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {},
        body: fd,
      });
      const json = await res.json().catch(() => null);
      return { status: res.status, ...(json ?? {}) };
    },
  };
}

/**
 * Fake SMS provider for the webhook channel, so OTP sends go through the real
 * credit-charging path. Start the server with:
 *   OTP_CHANNEL=webhook OTP_WEBHOOK_URL=http://127.0.0.1:3998/sms
 *   OTP_WEBHOOK_BODY='{"to":"{{phone}}","code":"{{code}}"}'
 * Numbers ending in 0000 fail (500) to exercise the refund.
 */
const smsInbox = new Map();
const { createServer } = await import('node:http');
const smsServer = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    try {
      const { to, code } = JSON.parse(body);
      if (String(to).endsWith('0000')) {
        res.writeHead(500).end('{"error":"carrier rejected"}');
        return;
      }
      smsInbox.set(to, code);
    } catch {}
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
  });
});
await new Promise((r) => smsServer.listen(3998, '127.0.0.1', r));

function otpFromLog(e164) {
  if (smsInbox.has(e164)) return smsInbox.get(e164);
  if (!LOG) return null;
  const lines = readFileSync(LOG, 'utf8').split('\n').filter((l) => l.includes(`→ ${e164}:`));
  return lines.at(-1)?.match(/(\d{6})\s*$/)?.[1] ?? null;
}

async function main() {
  await mongoose.connect(DB);
  const db = mongoose.connection.db;
  const col = (n) => db.collection(n);
  const oid = (s) => new mongoose.Types.ObjectId(String(s));

  section('Seed legacy data (pre-tenant shape)');
  await db.dropDatabase();
  const hash = bcrypt.hashSync('password123', 10);
  const mkLib = async (email, name) =>
    (
      await col('users').insertOne({
        email, name, password: hash, role: 'librarian', isVerified: true, isApproved: true, status: 'active',
        createdAt: new Date(Date.now() - 90 * 864e5), updatedAt: new Date(),
      })
    ).insertedId;
  const libA = await mkLib('one@example.com', 'Lib One');
  const libB = await mkLib('two@example.com', 'Lib Two');
  const future = new Date(Date.now() + 30 * 864e5);
  const past = new Date(Date.now() - 5 * 864e5);
  const st = (l, name, phone, end) =>
    col('students').insertOne({
      name, email: `${name.toLowerCase().replace(/ /g, '')}@example.com`, phone,
      paymentStatus: 'paid', membershipStatus: 'active',
      membershipStartDate: new Date(Date.now() - 60 * 864e5), membershipEndDate: end, seatNumber: null,
      librarianId: l, createdAt: new Date(Date.now() - 60 * 864e5), updatedAt: new Date(),
    });
  await st(libA, 'Asha Active', '9876500001', future);
  await st(libA, 'Ravi Plus', '+919876500002', future);
  await st(libA, 'Esha Expired', '9876500003', past);
  await st(libA, 'Dup One', '9876500004', future);
  await st(libA, 'Dup Two', '+919876500004', future);
  await st(libB, 'Other Lib', '9876500001', future);
  await col('seats').insertOne({ seatNumber: 1, status: 'reserved', librarianId: libA });
  await col('books').insertOne({ title: 'T', author: 'A', librarianId: libA, totalCopies: 1, availableCopies: 1 });
  ok('seeded 2 librarians, 6 students (mixed phone formats, 1 duplicate), seat, book');

  const migrate = (...args) =>
    execFileSync('npx', ['tsx', 'scripts/migrate-libraries.ts', ...args], {
      env: { ...process.env, MONGODB_URI: DB },
      encoding: 'utf8',
    });

  section('Migration dry run writes nothing');
  const dry = migrate();
  expect('dry run creates no library', await col('libraries').countDocuments(), 0);
  expect('dry run leaves students untouched', await col('students').countDocuments({ libraryId: { $exists: true } }), 0);
  dry.includes('duplicate phone group') ? ok('dry run reports the duplicate phone') : bad('dry run missed duplicate');

  section('Migration apply');
  const applied = migrate('--apply');
  expect('one library per librarian', await col('libraries').countDocuments(), 2);
  expect('every student has libraryId', await col('students').countDocuments({ libraryId: null }), 0);
  expect('seat + book backfilled',
    (await col('seats').countDocuments({ libraryId: { $ne: null } })) + (await col('books').countDocuments({ libraryId: { $ne: null } })), 2);
  const asha = await col('students').findOne({ name: 'Asha Active' });
  expect('10-digit phone normalized', asha.phone, '+919876500001');
  expect('original phone kept in phoneRaw', asha.phoneRaw, '9876500001');
  expect('past end date → EXPIRED', (await col('students').findOne({ name: 'Esha Expired' })).status, 'EXPIRED');
  expect('default Full Day shift created', await col('shifts').countDocuments({ name: 'Full Day' }), 2);
  applied.includes('SKIPPED until duplicates') ? ok('unique phone index skipped while duplicate exists') : bad('unique index not skipped');
  migrate('--apply');
  expect('re-run is safe (no extra library)', await col('libraries').countDocuments(), 2);

  section('Librarian: login, library, shifts, QR');
  const L1 = client();
  const L2 = client();
  expect('librarian login', (await L1.call('POST', '/api/auth/login', { email: 'one@example.com', password: 'password123' })).success, true);
  await L2.call('POST', '/api/auth/login', { email: 'two@example.com', password: 'password123' });
  expect('login audited', await col('auditlogs').countDocuments({ action: 'librarian.login' }), 2);
  expect('GET /api/library grace default', (await L1.call('GET', '/api/library')).data?.settings?.graceMinutes, 15);

  // A shift that started 20 min ago (IST), so a check-in now is "Late by ~20 min"
  const hhmm = (d) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  const startTime = hhmm(new Date(Date.now() - 20 * 60000));
  const endTime = hhmm(new Date(Date.now() + 120 * 60000));
  const created = await L1.call('POST', '/api/shifts', { name: 'Test Shift', startTime, endTime });
  const SHIFT = created.data?._id;
  SHIFT ? ok(`create shift ${startTime}–${endTime}`) : bad(`create shift: ${created.error}`);
  expect('duplicate shift name rejected', (await L1.call('POST', '/api/shifts', { name: 'test shift', startTime: '01:00', endTime: '02:00' })).status, 409);
  expect('start == end rejected', (await L1.call('POST', '/api/shifts', { name: 'Zero', startTime: '05:00', endTime: '05:00' })).status, 400);
  await col('students').updateMany({ librarianId: libA }, { $set: { shiftId: oid(SHIFT) } });

  // QR access is off until the admin enables it, so derive the signed link
  // the same way the server does (HMAC of library id + QR version)
  const { createHmac } = await import('node:crypto');
  const libDocA = await col('libraries').findOne({ ownerId: libA });
  const SLUG = libDocA.slug;
  let K = createHmac('sha256', process.env.E2E_JWT_SECRET || 'e2e-secret-0123456789abcdef')
    .update(`library-qr:${libDocA._id}:${libDocA.qrVersion}`)
    .digest('base64url')
    .slice(0, 16);
  const anon = client();
  expect('QR intro loads', (await anon.call('GET', `/api/checkin/${SLUG}?k=${K}`)).data?.available, true);
  expect('tampered QR rejected', (await anon.call('GET', `/api/checkin/${SLUG}?k=AAAAAAAAAAAAAAAA`)).status, 404);

  section('QR/OTP access is admin-controlled');
  await col('users').insertOne({ email: 'admin@example.com', name: 'Admin', password: hash, role: 'admin', isVerified: true, isApproved: true, status: 'active', createdAt: new Date(), updatedAt: new Date() });
  const AD = client();
  await AD.call('POST', '/api/auth/login', { email: 'admin@example.com', password: 'password123' });
  await AD.call('POST', '/api/notifications/read', { all: true });
  const LIB_A = String((await col('libraries').findOne({ ownerId: libA }))._id);
  let intro = (await anon.call('GET', `/api/checkin/${SLUG}?k=${K}`)).data;
  expect('new library: QR off, page told so (no 403 on intro)', `${intro?.qrEnabled}/${intro?.reason}`, 'false/QR_DISABLED');
  const off = await anon.call('POST', `/api/checkin/${SLUG}/otp/send`, { k: K, phone: '9876500001' });
  expect('OTP refused while QR off', `${off.status}/${off.code}/${off.error}`, '403/QR_DISABLED/QR check-in is currently unavailable. Please contact library staff.');
  await L1.call('PATCH', '/api/library', { settings: { otpEnabled: true }, qrAttendanceEnabled: true, otpEnabled: true });
  expect('librarian cannot switch QR on via settings', (await anon.call('GET', `/api/checkin/${SLUG}?k=${K}`)).data?.qrEnabled, false);
  expect('librarian cannot call admin access API', (await L1.call('PATCH', `/api/admin/qr-access/${LIB_A}`, { qrAttendanceEnabled: true, note: 'self' })).status, 403);
  expect('librarian QR image locked while off', (await L1.call('GET', '/api/library/qr')).code, 'QR_DISABLED');
  let acc = await L1.call('GET', '/api/library/qr-access');
  expect('librarian sees locked state', `${acc.data?.enabled}/${acc.data?.reason}`, 'false/QR_DISABLED');
  expect('admin change needs a note', (await AD.call('PATCH', `/api/admin/qr-access/${LIB_A}`, { qrAttendanceEnabled: true, note: '' })).status, 400);
  expect('OTP needs QR first', (await AD.call('PATCH', `/api/admin/qr-access/${LIB_A}`, { otpEnabled: true, note: 'try otp only' })).status, 400);
  await AD.call('PATCH', `/api/admin/qr-access/${LIB_A}`, { qrAttendanceEnabled: true, otpEnabled: true, note: 'Paid ₹499 UPI' });
  expect('admin enables QR + OTP', (await anon.call('GET', `/api/checkin/${SLUG}?k=${K}`)).data?.otpEnabled, true);
  expect('access change audited', await col('auditlogs').countDocuments({ action: 'qr_access.updated' }), 1);
  const qr = (await L1.call('GET', '/api/library/qr')).data;
  qr?.png?.startsWith('data:image/png;base64,') ? ok('QR image available once enabled') : bad('QR PNG');
  expect('QR link signature matches', new URL(qr.url).searchParams.get('k'), K);
  const noCredit = await anon.call('POST', `/api/checkin/${SLUG}/otp/send`, { k: K, phone: '9876511110' });
  expect('0 credits → 402 (no SMS sent)', `${noCredit.status}/${noCredit.code}`, '402/SMS_CREDITS_EXHAUSTED');
  expect('…and no SMS reached the provider', smsInbox.has('+919876511110'), false);
  let cr = await AD.call('POST', `/api/admin/qr-access/${LIB_A}/credits`, { credits: 100, note: 'Paid ₹100', requestId: 'credit-req-0001' });
  expect('admin adds 100 credits', cr.data?.balance, 100);
  cr = await AD.call('POST', `/api/admin/qr-access/${LIB_A}/credits`, { credits: 100, note: 'Paid ₹100', requestId: 'credit-req-0001' });
  expect('double-click on add credits adds once', `${cr.data?.replayed}/${cr.data?.balance}`, 'true/100');
  expect('credit top-up audited + in ledger', `${await col('auditlogs').countDocuments({ action: 'qr_access.credits_added' })}/${await col('smstransactions').countDocuments({ type: 'CREDIT_ADD' })}`, '1/1');

  section('Student OTP');
  const S1 = client();
  const send = await S1.call('POST', `/api/checkin/${SLUG}/otp/send`, { k: K, phone: '98765 00001' });
  await sleep(300);
  const code = send.data?.devCode ?? otpFromLog('+919876500001');
  code?.length === 6 ? ok('OTP sent (console channel)') : bad(`OTP send: ${JSON.stringify(send)}`);
  expect('OTP stored hashed, not plain', await col('studentotps').countDocuments({ codeHash: code }), 0);
  expect('resend inside 60s blocked', (await S1.call('POST', `/api/checkin/${SLUG}/otp/send`, { k: K, phone: '9876500001' })).status, 429);
  const wrong = code === '111111' ? '222222' : '111111';
  const w = await S1.call('POST', `/api/checkin/${SLUG}/otp/verify`, { k: K, phone: '9876500001', code: wrong });
  w.error?.includes('4 attempts left') ? ok('wrong code counts attempts') : bad(`attempt counter: ${w.error}`);
  expect('scan without session refused', (await anon.call('POST', `/api/checkin/${SLUG}/scan`, { k: K })).code, 'SESSION_REQUIRED');
  expect('correct code verifies', (await S1.call('POST', `/api/checkin/${SLUG}/otp/verify`, { k: K, phone: '9876500001', code })).data?.verified, true);
  expect('session cookie is per library', [...S1.jar.keys()].some((k) => k.startsWith('ss_')), true);
  expect('code is single-use', (await S1.call('POST', `/api/checkin/${SLUG}/otp/verify`, { k: K, phone: '9876500001', code })).success, false);

  section('Scan rules (R1, R2)');
  let r = (await S1.call('POST', `/api/checkin/${SLUG}/scan`, { k: K })).data;
  expect('1st scan → check-in', r?.outcome, 'CHECKED_IN');
  expect('checked in after grace → LATE', r?.attendance?.arrivalStatus, 'LATE');
  const late = r?.attendance?.lateMinutes;
  late >= 19 && late <= 22 ? ok(`late by ${late} min`) : bad(`lateMinutes ${late}`);
  expect('result shows shift + library + student', `${r?.shift?.name}|${r?.library?.name}|${r?.student?.name}`, "Test Shift|Lib One's Library|Asha Active");
  expect('membership days left shown', r?.membership?.daysLeft, 30);
  expect('entryType MEMBER, source QR', JSON.stringify(await col('attendances').findOne({}, { projection: { _id: 0, entryType: 1, source: 1 } })), '{"entryType":"MEMBER","source":"QR"}');
  r = (await S1.call('POST', `/api/checkin/${SLUG}/scan`, { k: K })).data;
  expect('double tap ≠ check-out', `${r?.outcome}/${r?.repeat}`, 'CHECKED_IN/true');
  await col('attendances').updateOne({}, { $set: { checkInAt: new Date(Date.now() - 10 * 60000) } });
  r = (await S1.call('POST', `/api/checkin/${SLUG}/scan`, { k: K })).data;
  expect('2nd scan → check-out', r?.outcome, 'CHECKED_OUT');
  expect('study time computed', r?.attendance?.totalMinutes, 10);
  expect('left before shift end → LEFT_EARLY', (await col('attendances').findOne()).status, 'LEFT_EARLY');
  expect('3rd scan → already checked out', (await S1.call('POST', `/api/checkin/${SLUG}/scan`, { k: K })).data?.outcome, 'ALREADY_CHECKED_OUT');
  expect('still exactly one record', await col('attendances').countDocuments(), 1);

  section('Other student states (R5)');
  const loginStudent = async (phone) => {
    const c = client();
    const s = await c.call('POST', `/api/checkin/${SLUG}/otp/send`, { k: K, phone });
    await sleep(300);
    const cd = s.data?.devCode ?? otpFromLog(`+91${phone}`);
    await c.call('POST', `/api/checkin/${SLUG}/otp/verify`, { k: K, phone, code: cd });
    return c;
  };
  const S2 = await loginStudent('9876500003');
  r = (await S2.call('POST', `/api/checkin/${SLUG}/scan`, { k: K })).data;
  expect('expired → renewal screen', r?.outcome, 'RENEWAL_REQUIRED');
  r?.membership?.endDate ? ok('renewal shows expiry date') : bad('no expiry date');
  expect('expired scan writes no attendance', await col('attendances').countDocuments(), 1);
  const S3 = await loginStudent('9876599999');
  expect('unknown number → not registered', (await S3.call('POST', `/api/checkin/${SLUG}/scan`, { k: K })).data?.outcome, 'NOT_REGISTERED');
  const ravi = await col('students').findOne({ name: 'Ravi Plus' });
  await L1.call('PUT', `/api/students/${ravi._id}`, { blocked: true });
  const S4 = await loginStudent('9876500002');
  expect('blocked → access denied', (await S4.call('POST', `/api/checkin/${SLUG}/scan`, { k: K })).data?.outcome, 'ACCESS_DENIED');
  await L1.call('PUT', `/api/students/${ravi._id}`, { blocked: false });
  expect('unblock restores member', (await col('students').findOne({ _id: ravi._id })).status, 'ACTIVE_MEMBER');

  section('Auto check-out (shift end + 30 min)');
  const libADoc = await col('libraries').findOne({ ownerId: libA });
  const fullDay = await col('shifts').findOne({ libraryId: libADoc._id, name: 'Full Day' });
  await col('attendances').insertOne({
    libraryId: libADoc._id, studentId: asha._id, shiftId: fullDay._id, date: '2026-01-01',
    shiftStartAt: new Date(Date.now() - 5 * 3600e3), shiftEndAt: new Date(Date.now() - 3600e3),
    checkInAt: new Date(Date.now() - 4 * 3600e3), checkOutAt: null, totalMinutes: 0, arrivalStatus: 'PRESENT',
    lateMinutes: 0, leftEarly: false, isInside: true, status: 'CURRENTLY_INSIDE', entryType: 'MEMBER', source: 'QR',
    autoCheckedOut: false, manuallyEdited: false,
  });
  await L1.call('GET', '/api/attendance?date=2026-01-01');
  const auto = await col('attendances').findOne({ date: '2026-01-01' });
  expect('stale open record auto-closed', auto.autoCheckedOut, true);
  expect('checked out at shift end (180 min, not 210)', auto.totalMinutes, 180);

  section('Librarian attendance list + manual override');
  const list = (await L1.call('GET', `/api/attendance?shiftId=${SHIFT}`)).data;
  expect('list counts the late record', list?.counts?.late, 1);
  expect('not-checked-in = active members without a record',
    list?.notCheckedIn?.map((n) => n.student.name).sort().join(','), 'Dup One,Dup Two,Ravi Plus');
  const dup = await col('students').findOne({ name: 'Dup One' });
  const man = await L1.call('POST', '/api/attendance/manual', { studentId: String(dup._id), shiftId: SHIFT, date: list.date, action: 'checkin', note: 'Forgot phone' });
  expect('manual check-in', man.data?.source, 'MANUAL');
  expect('manual check-in twice refused', (await L1.call('POST', '/api/attendance/manual', { studentId: String(dup._id), shiftId: SHIFT, date: list.date, action: 'checkin' })).status, 409);
  const ov = (await L1.call('PATCH', `/api/attendance/${man.data?._id}`, { arrivalStatus: 'PRESENT' })).data;
  expect('override LATE → PRESENT', `${ov?.arrivalStatus}/${ov?.lateMinutes}`, 'PRESENT/0');
  expect('manual check-out', (await L1.call('POST', '/api/attendance/manual', { studentId: String(dup._id), shiftId: SHIFT, date: list.date, action: 'checkout' })).data?.isInside, false);
  expect('future date refused', (await L1.call('POST', '/api/attendance/manual', { studentId: String(dup._id), shiftId: SHIFT, date: '2099-01-01', action: 'checkin' })).status, 400);
  expect('overrides audited', await col('auditlogs').countDocuments({ action: { $in: ['attendance.manual_checkin', 'attendance.manual_checkout', 'attendance.override'] } }), 3);

  section('Tenant isolation (library B → library A data)');
  expect('B cannot override A attendance', (await L2.call('PATCH', `/api/attendance/${man.data?._id}`, { note: 'x' })).status, 404);
  expect('B cannot manual-mark A student', (await L2.call('POST', '/api/attendance/manual', { studentId: String(dup._id), shiftId: SHIFT, date: list.date, action: 'checkin' })).status, 404);
  expect('B cannot edit A shift', (await L2.call('PATCH', `/api/shifts/${SHIFT}`, { name: 'x' })).status, 404);
  expect('B sees only its own shifts', (await L2.call('GET', '/api/shifts')).data?.map((s) => s.name).join(','), 'Full Day');
  expect('B attendance list is empty', (await L2.call('GET', `/api/attendance?date=${list.date}`)).data?.records?.length, 0);
  await L2.call('POST', '/api/students', { name: 'Sneaky', email: 's@example.com', phone: '9876511111', libraryId: String(libADoc._id), membershipStartDate: '2026-01-01', membershipEndDate: '2099-01-01' });
  const sneaky = await col('students').findOne({ name: 'Sneaky' });
  expect('body libraryId ignored on create', String(sneaky?.libraryId) === String(libADoc._id), false);
  expect('duplicate phone in same library refused', (await L1.call('POST', '/api/students', { name: 'Copy', email: 'c@example.com', phone: '+91 98765 00001', membershipStartDate: '2026-01-01', membershipEndDate: '2099-01-01' })).status, 409);
  const libBDoc = await col('libraries').findOne({ ownerId: libB });
  expect("A's student session can't scan library B", (await S1.call('POST', `/api/checkin/${libBDoc.slug}/scan`, { k: K })).success, false);

  section('Manual demo admission (Add Demo Student)');
  await L1.call('POST', '/api/seats', { from: 20, to: 25 });
  const opts = (await L1.call('GET', '/api/students/demo')).data;
  const addDays = (key, n) => { const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  expect('default demo end = start + 3 days', opts?.defaultEnd, addDays(opts?.today, 3));
  const freeSeat = opts?.freeSeats?.find((n) => n >= 20);
  const demoBase = { name: 'Demo Dev', phone: '98765 44444', shiftId: SHIFT, seatNumber: freeSeat, demoStartDate: opts.today, demoEndDate: opts.defaultEnd };
  const tryDemo = (over) => L1.form('/api/students/demo', { ...demoBase, ...over });
  let d = await tryDemo({ name: '' });
  expect('missing name → field error', `${d.status}/${d.code}/${d.error}`, '400/FIELD_name/Full name is required.');
  d = await tryDemo({ phone: '123' });
  expect('bad phone → field error', `${d.code}/${d.error}`, 'FIELD_phone/Enter a valid 10-digit mobile number.');
  d = await tryDemo({ phone: '+91 98765 00002' });
  expect('duplicate phone → names the student', `${d.status}/${d.error}`, '409/This mobile number is already registered to Ravi Plus.');
  d = await tryDemo({ seatNumber: '' });
  expect('seat is required', d.error, 'Choose a seat.');
  d = await tryDemo({ demoStartDate: addDays(opts.today, -1) });
  expect('past start refused', d.error, "Demo start date can't be in the past.");
  d = await tryDemo({ demoEndDate: addDays(opts.today, -1) });
  expect('end before start refused', d.error, 'Demo end date must be on or after the start date.');
  d = await tryDemo({ demoEndDate: addDays(opts.today, 30) });
  expect('demo over 30 days refused', d.error, 'A demo can be at most 30 days.');
  d = await tryDemo({ examTarget: 'UPSC 2027', parentContact: '9876555555', address: 'Lane 4' });
  expect('demo created', `${d.status}/${d.data?.student?.status}/${d.data?.student?.registrationSource}`, '201/DEMO/MANUAL');
  const demoId = d.data?.student?._id;
  d = await tryDemo({ name: 'Seat Thief', phone: '9876544446' });
  expect('seat held by someone else refused', `${d.status}/${d.code}`, '409/SEAT_TAKEN');
  const demoDoc = await col('students').findOne({ _id: oid(demoId) });
  expect('demo seat held', demoDoc.seatNumber, freeSeat);
  expect('address saved (old bug fixed)', demoDoc.address, 'Lane 4');
  expect('parent contact normalised', demoDoc.parentContact, '+919876555555');
  expect('demo ends at end of the 4th day (IST)', new Date(demoDoc.demoEndDate).toISOString(), new Date(Date.parse(`${addDays(opts.today, 4)}T00:00:00+05:30`) - 1).toISOString());
  let demoList = (await L1.call('GET', '/api/students?status=DEMO&withStats=1')).data ?? [];
  expect('appears in Demo Students list', demoList.some((x) => x._id === demoId), true);
  expect('not in All Students list', ((await L1.call('GET', '/api/students?status=ACTIVE_MEMBER')).data ?? []).some((x) => x._id === demoId), false);
  expect('admission audited', await col('auditlogs').countDocuments({ action: 'demo.started' }), 1);

  section('Manual attendance (Present / Absent)');
  const today = opts.today;
  let m = await L1.call('POST', '/api/attendance/manual', { studentId: demoId, shiftId: SHIFT, date: today, action: 'present' });
  expect('mark present', `${m.data?.status}/${m.data?.entryType}/${m.data?.source}/${m.data?.timesRecorded}`, 'PRESENT/DEMO/MANUAL/false');
  m = await L1.call('POST', '/api/attendance/manual', { studentId: demoId, shiftId: SHIFT, date: today, action: 'absent' });
  expect('mark absent replaces it', m.data?.status, 'ABSENT');
  expect('one record per student per shift-day', await col('attendances').countDocuments({ studentId: oid(demoId) }), 1);
  m = await L1.call('POST', '/api/attendance/manual', { studentId: demoId, shiftId: SHIFT, date: addDays(today, 5), action: 'present' });
  expect('future / out-of-demo date refused', m.status, 400);
  demoList = (await L1.call('GET', '/api/students?status=DEMO&withStats=1')).data ?? [];
  expect('absent doesn\'t count as a visit', demoList.find((x) => x._id === demoId)?.attendanceCount, 0);
  await L1.call('POST', '/api/attendance/manual', { studentId: demoId, shiftId: SHIFT, date: today, action: 'present' });
  demoList = (await L1.call('GET', '/api/students?status=DEMO&withStats=1')).data ?? [];
  expect('present counts as a visit', demoList.find((x) => x._id === demoId)?.attendanceCount, 1);

  section('Demo extend / end / expire');
  let ex = await L1.call('POST', `/api/students/${demoId}/demo`, { action: 'extend', days: 2 });
  expect('extend +2 days', ex.data?.demoEnd, addDays(opts.defaultEnd, 2));
  await L1.call('POST', `/api/students/${demoId}/demo`, { action: 'extend', days: 3 });
  ex = await L1.call('POST', `/api/students/${demoId}/demo`, { action: 'extend', days: 3 });
  expect('extension cap of 7 days', ex.status, 409);
  const d2 = await tryDemo({ name: 'Demo Two', phone: '9876544445', seatNumber: opts.freeSeats.find((n) => n > freeSeat) });
  const demo2 = d2.data?.student?._id;
  await col('students').updateOne({ _id: oid(demo2) }, { $set: { demoEndDate: new Date(Date.now() - 60_000) } });
  await L1.call('GET', '/api/students');
  const d2doc = await col('students').findOne({ _id: oid(demo2) });
  expect('finished demo moves to DEMO_ENDED on next list', `${d2doc.status}/${d2doc.seatNumber}`, 'DEMO_ENDED/null');
  expect('its seat is free again', ((await L1.call('GET', '/api/seats')).data ?? []).find((x) => x.seatNumber === opts.freeSeats.find((n) => n > freeSeat))?.state, 'available');
  await L1.call('POST', `/api/students/${demoId}/demo`, { action: 'end' });
  expect('end demo now', (await col('students').findOne({ _id: oid(demoId) })).status, 'DEMO_ENDED');
  expect('ended-demo student can\'t be marked', (await L1.call('POST', '/api/attendance/manual', { studentId: demoId, shiftId: SHIFT, date: today, action: 'present' })).status, 409);

  section('Collect fee & activate');
  const actBody = (over) => ({ planName: 'Monthly', startDate: today, endDate: addDays(today, 29), fee: 800, paidAmount: 800, method: 'UPI', requestId: 'req-demo-1-abcdef', seatNumber: opts.freeSeats.find((n) => n > freeSeat), ...over });
  expect('overpayment refused', (await L1.call('POST', `/api/students/${demoId}/activate`, actBody({ paidAmount: 900, requestId: 'req-over-123456' }))).status, 400);
  let act = await L1.call('POST', `/api/students/${demoId}/activate`, actBody());
  expect('activated', `${act.data?.student?.status}/${act.data?.payment?.status}/${act.data?.payment?.receiptNumber}`, 'ACTIVE_MEMBER/PAID/R-00001');
  expect('seat given on activation', (await col('students').findOne({ _id: oid(demoId) })).seatNumber, opts.freeSeats.find((n) => n > freeSeat));
  act = await L1.call('POST', `/api/students/${demoId}/activate`, actBody());
  expect('double click → same payment, no second charge', `${act.data?.replayed}/${await col('payments').countDocuments()}`, 'true/1');
  expect('moves from Demo to All Students', ((await L1.call('GET', '/api/students?status=ACTIVE_MEMBER')).data ?? []).some((x) => x._id === demoId), true);
  expect('activating an active member refused', (await L1.call('POST', `/api/students/${demoId}/activate`, actBody({ requestId: 'req-again-123456' }))).status, 409);
  act = await L1.call('POST', `/api/students/${demo2}/activate`, actBody({ fee: 1000, paidAmount: 400, requestId: 'req-partial-1234', seatNumber: null }));
  expect('partial payment', `${act.data?.payment?.status}/${act.data?.payment?.dueAmount}/${act.data?.payment?.receiptNumber}`, 'PARTIAL/600/R-00002');
  expect('partial → paymentStatus pending', (await col('students').findOne({ _id: oid(demo2) })).paymentStatus, 'pending');
  expect('activation + payment audited', await col('auditlogs').countDocuments({ action: { $in: ['membership.activated', 'payment.recorded'] } }), 4);
  expect("B can't extend A's demo", (await L2.call('POST', `/api/students/${demo2}/demo`, { action: 'end' })).status, 404);
  expect("B can't activate A's student", (await L2.call('POST', `/api/students/${demo2}/activate`, actBody({ requestId: 'req-b-12345678' }))).status, 404);

  section('QR demo form (unregistered number)');
  const S6 = client();
  const sendNew = await S6.call('POST', `/api/checkin/${SLUG}/otp/send`, { k: K, phone: '9876533333' });
  await sleep(300);
  await S6.call('POST', `/api/checkin/${SLUG}/otp/verify`, { k: K, phone: '9876533333', code: sendNew.data?.devCode ?? otpFromLog('+919876533333') });
  expect('unregistered number → NOT_REGISTERED (form shown)', (await S6.call('POST', `/api/checkin/${SLUG}/scan`, { k: K })).data?.outcome, 'NOT_REGISTERED');
  const qopts = (await S6.call('GET', `/api/checkin/${SLUG}/options?k=${K}`)).data;
  const qrSeat = qopts?.freeSeats?.find((n) => n >= 20);
  expect('form options list shifts and free seats', Boolean(qopts?.shifts?.length && qopts?.freeSeats?.length), true);
  let reg = await S6.form(`/api/checkin/${SLUG}/register`, { k: K, name: '', shiftId: SHIFT, seatNumber: qrSeat });
  expect('name required', reg.code, 'FIELD_name');
  reg = await S6.form(`/api/checkin/${SLUG}/register`, { k: K, name: 'Qr Student', shiftId: SHIFT, seatNumber: qrSeat, phone: '9999999999' });
  expect('demo starts immediately', `${reg.status}/${reg.data?.demoStarted}`, '201/true');
  expect('…and is checked in straight away', `${reg.data?.scan?.outcome}`, 'CHECKED_IN');
  const qrStu = await col('students').findOne({ name: 'Qr Student' });
  expect('phone comes from the OTP session, not the form', qrStu.phone, '+919876533333');
  expect('QR student is DEMO from QR with the seat', `${qrStu.status}/${qrStu.registrationSource}/${qrStu.seatNumber}`, `DEMO/QR/${qrSeat}`);
  expect('QR check-in recorded as DEMO', (await col('attendances').findOne({ studentId: qrStu._id })).entryType, 'DEMO');
  reg = await S6.form(`/api/checkin/${SLUG}/register`, { k: K, name: 'Again', shiftId: SHIFT });
  expect('form never creates a second student', `${reg.data?.alreadyRegistered}/${await col('students').countDocuments({ phone: '+919876533333' })}`, 'true/1');
  await AD.call('PATCH', `/api/admin/qr-access/${LIB_A}`, { qrAttendanceEnabled: false, otpEnabled: false, note: 'test off' });
  expect('QR off blocks the form too', (await S6.form(`/api/checkin/${SLUG}/register`, { k: K, name: 'X', shiftId: SHIFT })).code, 'QR_DISABLED');
  await AD.call('PATCH', `/api/admin/qr-access/${LIB_A}`, { qrAttendanceEnabled: true, otpEnabled: true, note: 'back on' });

  section('SMS credits, refunds, limits');
  const bal = async () => (await col('libraries').findOne({ _id: oid(LIB_A) })).smsCreditBalance;
  const sendTo = (phone) => client().call('POST', `/api/checkin/${SLUG}/otp/send`, { k: K, phone });
  let b0 = await bal();
  let r1 = await sendTo('9876512301');
  expect('real send costs 1 credit', `${r1.status}/${b0 - (await bal())}`, '200/1');
  const sendRow = await col('smstransactions').findOne({ type: 'OTP_SEND', phoneMasked: /2301$/ });
  expect('ledger row: masked phone + balance after', `${sendRow?.credits}/${sendRow?.balanceAfter === (await bal())}/${sendRow?.phoneMasked}`, '-1/true/+91 ••••• •2301');
  expect('verify logged at 0 credits (D19)', (await col('smstransactions').countDocuments({ type: 'OTP_VERIFY', credits: 0 })) > 0, true);
  b0 = await bal();
  const failSend = await sendTo('9876510000');
  expect('provider failure → error to student', failSend.status, 502);
  expect('…and the credit is refunded', `${b0 - (await bal())}/${await col('smstransactions').countDocuments({ type: 'REFUND' })}`, '0/1');
  const used = (await col('libraries').findOne({ _id: oid(LIB_A) })).otpUsedThisMonth;
  await AD.call('PATCH', `/api/admin/qr-access/${LIB_A}`, { monthlyOtpLimit: used + 1, note: 'cap' });
  expect('send within monthly limit', (await sendTo('9876512302')).status, 200);
  const capped = await sendTo('9876512303');
  expect('monthly limit → 429', `${capped.status}/${capped.code}`, '429/MONTHLY_OTP_LIMIT');
  await col('libraries').updateOne({ _id: oid(LIB_A) }, { $set: { otpUsageMonth: '2000-01' } });
  expect('new month resets the counter', (await sendTo('9876512304')).status, 200);
  await AD.call('PATCH', `/api/admin/qr-access/${LIB_A}`, { monthlyOtpLimit: null, note: 'uncap' });
  await col('libraries').updateOne({ _id: oid(LIB_A) }, { $set: { smsCreditBalance: 1 } });
  const race = await Promise.all([sendTo('9876512305'), sendTo('9876512306'), sendTo('9876512307')]);
  expect('race with 1 credit: exactly one send', race.filter((x) => x.status === 200).length, 1);
  expect('balance never below 0', await bal(), 0);
  expect('credits-empty notification to librarian', (await col('notifications').countDocuments({ libraryId: oid(LIB_A), type: 'credits.empty' })) >= 1, true);
  expect('negative adjustment below 0 refused', (await AD.call('POST', `/api/admin/qr-access/${LIB_A}/credits`, { credits: -5, note: 'oops', requestId: 'credit-req-neg1' })).status, 400);
  await AD.call('POST', `/api/admin/qr-access/${LIB_A}/credits`, { credits: 50, note: 'Top up', requestId: 'credit-req-0002' });

  section('QR on, OTP off; expiry; nothing deleted');
  await AD.call('PATCH', `/api/admin/qr-access/${LIB_A}`, { otpEnabled: false, note: 'stop SMS spend' });
  const otpOff = await sendTo('9876512308');
  expect('OTP off → new phones refused', `${otpOff.status}/${otpOff.code}`, '403/OTP_DISABLED');
  expect('…already-verified phone still scans', (await S4.call('POST', `/api/checkin/${SLUG}/scan`, { k: K })).success, true);
  const attBefore = await col('attendances').countDocuments();
  await AD.call('PATCH', `/api/admin/qr-access/${LIB_A}`, { qrAttendanceEnabled: true, otpEnabled: true, accessExpiresAt: new Date(Date.now() - 60_000).toISOString(), note: 'expired yesterday' });
  const exp = await S4.call('POST', `/api/checkin/${SLUG}/scan`, { k: K });
  expect('past paid-until date → EXPIRED, scans refused', `${exp.status}/${(await col('libraries').findOne({ _id: oid(LIB_A) })).accessStatus}`, '403/EXPIRED');
  expect('manual attendance still works while QR is off', (await L1.call('GET', '/api/attendance')).success, true);
  expect('disabling deletes no attendance', await col('attendances').countDocuments(), attBefore);
  await AD.call('PATCH', `/api/admin/qr-access/${LIB_A}`, { accessStatus: 'ACTIVE', accessExpiresAt: null, note: 'renewed' });
  expect('renewed → same QR works again', (await anon.call('GET', `/api/checkin/${SLUG}?k=${K}`)).data?.qrEnabled, true);
  const lib2Id = String((await col('libraries').findOne({ ownerId: libB }))._id);
  expect("library B can't see A's credits", (await L2.call('GET', '/api/library/qr-access')).data?.smsCreditBalance, 0);
  expect('only admin lists all libraries', `${(await L1.call('GET', '/api/admin/qr-access')).status}/${(await AD.call('GET', '/api/admin/qr-access')).data?.libraries?.length}`, '403/2');
  const reqQr = await L2.call('POST', '/api/library/qr-access/request', { message: 'Please enable' });
  expect('library without QR can request it', reqQr.success, true);
  expect('second request the same day refused', (await L2.call('POST', '/api/library/qr-access/request', {})).status, 409);
  expect('admin badge counts the request', (await AD.call('GET', '/api/notifications/feed')).data?.counts?.qrRequests, 1);
  void lib2Id;

  section('QR rotation, suspension, OTP lockout');
  await L1.call('POST', '/api/library/qr/rotate');
  expect('old QR stops working', (await anon.call('GET', `/api/checkin/${SLUG}?k=${K}`)).status, 404);
  K = new URL((await L1.call('GET', '/api/library/qr')).data.url).searchParams.get('k');
  expect('new QR works', (await anon.call('GET', `/api/checkin/${SLUG}?k=${K}`)).success, true);
  await col('libraries').updateOne({ _id: libADoc._id }, { $set: { status: 'SUSPENDED' } });
  expect('suspended → check-in unavailable', (await S1.call('POST', `/api/checkin/${SLUG}/scan`, { k: K })).code, 'LIBRARY_UNAVAILABLE');
  expect('suspended → librarian API blocked', (await L1.call('GET', '/api/library')).code, 'LIBRARY_SUSPENDED');
  await col('libraries').updateOne({ _id: libADoc._id }, { $set: { status: 'ACTIVE' } });
  await col('studentotps').deleteMany({});
  const S5 = client();
  await S5.call('POST', `/api/checkin/${SLUG}/otp/send`, { k: K, phone: '9876500002' });
  for (let i = 0; i < 5; i++) await S5.call('POST', `/api/checkin/${SLUG}/otp/verify`, { k: K, phone: '9876500002', code: '000000' });
  const locked = await S5.call('POST', `/api/checkin/${SLUG}/otp/verify`, { k: K, phone: '9876500002', code: '000000' });
  locked.error?.includes('Too many wrong attempts') ? ok('OTP locked after 5 wrong codes') : bad(`OTP lockout: ${locked.error}`);

  section('Seats');
  const seatList = async (c = L1) => (await c.call('GET', '/api/seats')).data ?? [];
  const seatOf = async (n, c = L1) => (await seatList(c)).find((x) => x.seatNumber === n);
  let res = await L1.call('POST', '/api/seats', { from: 1, to: 10 });
  expect('bulk add 1–10 skips the existing seat 1', `${res.data?.created}/${res.data?.skipped}`, '9/1');
  res = await L1.call('POST', '/api/seats', { from: 9, to: 12 });
  expect('overlapping range only adds new numbers', res.data?.created, 2);
  expect('duplicate single seat refused', (await L1.call('POST', '/api/seats', { seatNumber: 5 })).status, 409);
  expect('range over 500 refused', (await L1.call('POST', '/api/seats', { from: 1, to: 900 })).status, 400);
  await L1.call('POST', '/api/seats', { seatNumber: 13, status: 'occupied' });
  expect('new seat is always available', (await seatOf(13)).state, 'available');
  const seedSeat = await seatOf(1);
  expect('legacy "reserved" seat with nobody shows available', seedSeat.state, 'available');

  const ashaId = String(asha._id);
  const raviId = String((await col('students').findOne({ name: 'Ravi Plus' }))._id);
  const s2 = await seatOf(2);
  const s3 = await seatOf(3);
  expect('assign seat', (await L1.call('PUT', `/api/seats/${s2._id}`, { studentId: ashaId })).success, true);
  expect('student record gets the seat number', (await col('students').findOne({ _id: asha._id })).seatNumber, 2);
  expect('taken seat refused (no overwrite)', (await L1.call('PUT', `/api/seats/${s2._id}`, { studentId: raviId })).status, 409);
  await L1.call('PUT', `/api/seats/${s3._id}`, { studentId: ashaId });
  expect('moving a student frees their old seat', `${(await seatOf(2)).state}/${(await seatOf(3)).student?.name}`, 'available/Asha Active');
  expect('only one seat per student', (await seatList()).filter((x) => String(x.student?._id) === ashaId).length, 1);
  expect('assigned seat cannot be deleted', (await L1.call('DELETE', `/api/seats/${s3._id}`)).status, 409);
  expect('reserve without a student refused', (await L1.call('PUT', `/api/seats/${(await seatOf(4))._id}`, { status: 'reserved' })).status, 400);

  await L1.call('PUT', `/api/students/${raviId}`, { blocked: true });
  expect('blocked student cannot get a seat', (await L1.call('PUT', `/api/seats/${(await seatOf(4))._id}`, { studentId: raviId })).status, 409);
  await L1.call('PUT', `/api/students/${raviId}`, { blocked: false });
  await L1.call('PUT', `/api/seats/${(await seatOf(4))._id}`, { studentId: raviId });
  await col('attendances').insertOne({
    libraryId: libADoc._id, studentId: oid(raviId), shiftId: fullDay._id, date: '2026-02-02',
    shiftStartAt: new Date(Date.now() - 3600e3), shiftEndAt: new Date(Date.now() + 3600e3),
    checkInAt: new Date(Date.now() - 600e3), checkOutAt: null, totalMinutes: 0, arrivalStatus: 'PRESENT',
    lateMinutes: 0, leftEarly: false, isInside: true, status: 'CURRENTLY_INSIDE', entryType: 'MEMBER', source: 'QR',
    autoCheckedOut: false, manuallyEdited: false,
  });
  expect('checked-in student shows "occupied"', (await seatOf(4)).state, 'occupied');

  await col('students').updateOne({ _id: asha._id }, { $set: { membershipEndDate: new Date(Date.now() - 864e5) } });
  expect('expired member\'s seat flagged', (await seatOf(3)).state, 'expired');
  res = await L1.call('POST', '/api/seats/release-expired');
  expect('free expired seats', JSON.stringify(res.data?.released), '[3]');
  const ashaNow = await col('students').findOne({ _id: asha._id });
  expect('expired student loses seat and is marked EXPIRED', `${ashaNow.seatNumber}/${ashaNow.status}`, 'null/EXPIRED');
  expect('seat changes audited', (await col('auditlogs').countDocuments({ action: { $in: ['seat.assigned', 'seat.released'] } })) >= 4, true);

  const bSeat = (await L2.call('POST', '/api/seats', { seatNumber: 1 }), (await seatList(L2))[0]);
  expect("B can't touch A's seat", (await L2.call('PUT', `/api/seats/${s2._id}`, { release: true })).status, 404);
  expect("B can't seat A's student", (await L2.call('PUT', `/api/seats/${bSeat._id}`, { studentId: raviId })).status, 404);
  expect('B sees only its own seats', (await seatList(L2)).length, 1);

  section('One email per library');
  const stu = (email, phone) => ({ name: 'Mail Test', email, phone, membershipStartDate: '2026-01-01', membershipEndDate: '2099-01-01' });
  res = await L1.call('POST', '/api/students', stu('RaviPlus@Example.com', '9876522222'));
  expect('same email, different case → refused', `${res.status}|${res.error}`, '409|This email is already registered to Ravi Plus.');
  expect('invalid email refused', (await L1.call('POST', '/api/students', stu('not-an-email', '9876522223'))).status, 400);
  res = await L1.call('POST', '/api/students', stu('  New.Person@Example.com ', '9876522224'));
  expect('new email accepted and stored lowercase', `${res.status}|${res.data?.email}`, '201|new.person@example.com');
  expect('editing to an existing email refused', (await L1.call('PUT', `/api/students/${res.data?._id}`, { email: 'raviplus@example.com' })).status, 409);
  expect('same email allowed in another library', (await L2.call('POST', '/api/students', stu('raviplus@example.com', '9876522225'))).status, 201);

  section('Notifications (bell + badges)');
  let feed = (await L1.call('GET', '/api/notifications/feed')).data;
  const titles = (f) => (f?.items ?? []).map((n) => n.title);
  expect('QR demo → librarian notified', titles(feed).includes('New demo: Qr Student'), true);
  expect('auto-expired demo → librarian notified', titles(feed).includes('Demo ended: Demo Two'), true);
  expect('unread count + Students badge', feed?.unread > 0 && feed?.sections?.students > 0, true);
  expect('live count of demo students', typeof feed?.counts?.demoStudents, 'number');
  const L2feed = (await L2.call('GET', '/api/notifications/feed')).data;
  expect("library B doesn't see library A's notifications", titles(L2feed).some((t) => t.includes('Qr Student')), false);
  const oneId = feed.items.find((n) => !n.read)?._id;
  await L1.call('POST', '/api/notifications/read', { ids: [oneId] });
  const after1 = (await L1.call('GET', '/api/notifications/feed')).data;
  expect('mark one read', after1.unread, feed.unread - 1);
  await L1.call('POST', '/api/notifications/read', { section: 'students' });
  expect('visiting Students clears its badge', ((await L1.call('GET', '/api/notifications/feed')).data?.sections?.students ?? 0), 0);
  const aUnreadBefore = await col('notifications').countDocuments({ libraryId: libADoc._id, readBy: { $size: 0 } });
  await L2.call('POST', '/api/notifications/read', { all: true });
  expect("B's 'mark all' can't touch A's notifications", await col('notifications').countDocuments({ libraryId: libADoc._id, readBy: { $size: 0 } }), aUnreadBefore);

  await anon.call('POST', '/api/messages', { name: 'Visitor', email: 'v@example.com', subject: 'Pricing?', message: 'How much per month?' });
  const adFeed = (await AD.call('GET', '/api/notifications/feed')).data;
  expect('contact message → admin notified', titles(adFeed).includes('New message from Visitor'), true);
  expect('admin badge counts open messages', adFeed?.counts?.openMessages >= 1, true);
  expect("librarians don't get admin notifications", titles((await L1.call('GET', '/api/notifications/feed')).data).includes('New message from Visitor'), false);
  await AD.call('POST', '/api/notifications/read', { all: true });
  expect('admin mark all read', (await AD.call('GET', '/api/notifications/feed')).data?.unread, 0);
  expect('signed-out request refused', (await anon.call('GET', '/api/notifications/feed')).status, 401);

  section('Unique phone index once duplicates are resolved');
  await col('students').deleteOne({ name: 'Dup Two' });
  const fixed = migrate('--apply');
  fixed.includes('No duplicate phone numbers') ? ok('migration sees no duplicates') : bad('still reports duplicates');
  const idx = await col('students').indexes();
  expect('unique libraryId+phone index built', idx.some((i) => i.name === 'libraryId_phone_unique' && i.unique), true);

  smsServer.close();
  console.log(`\nPassed: ${pass}   Failed: ${fail}`);
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
