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
  };
}

function otpFromLog(e164) {
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

  const qr = (await L1.call('GET', '/api/library/qr')).data;
  const url = new URL(qr.url);
  const SLUG = url.pathname.split('/').pop();
  let K = url.searchParams.get('k');
  qr.png?.startsWith('data:image/png;base64,') ? ok('QR PNG generated') : bad('QR PNG');
  const anon = client();
  expect('QR intro loads', (await anon.call('GET', `/api/checkin/${SLUG}?k=${K}`)).data?.available, true);
  expect('tampered QR rejected', (await anon.call('GET', `/api/checkin/${SLUG}?k=AAAAAAAAAAAAAAAA`)).status, 404);

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

  section('QR rotation, suspension, OTP lockout');
  await L1.call('POST', '/api/library/qr/rotate');
  expect('old QR stops working', (await anon.call('GET', `/api/checkin/${SLUG}?k=${K}`)).status, 404);
  K = new URL((await L1.call('GET', '/api/library/qr')).data.url).searchParams.get('k');
  expect('new QR works', (await anon.call('GET', `/api/checkin/${SLUG}?k=${K}`)).success, true);
  await col('libraries').updateOne({ _id: libADoc._id }, { $set: { status: 'SUSPENDED' } });
  expect('suspended → check-in unavailable', (await S1.call('POST', `/api/checkin/${SLUG}/scan`, { k: K })).data?.outcome, 'LIBRARY_UNAVAILABLE');
  expect('suspended → librarian API blocked', (await L1.call('GET', '/api/library')).code, 'LIBRARY_SUSPENDED');
  await col('libraries').updateOne({ _id: libADoc._id }, { $set: { status: 'ACTIVE' } });
  await col('studentotps').deleteMany({});
  const S5 = client();
  await S5.call('POST', `/api/checkin/${SLUG}/otp/send`, { k: K, phone: '9876500002' });
  for (let i = 0; i < 5; i++) await S5.call('POST', `/api/checkin/${SLUG}/otp/verify`, { k: K, phone: '9876500002', code: '000000' });
  const locked = await S5.call('POST', `/api/checkin/${SLUG}/otp/verify`, { k: K, phone: '9876500002', code: '000000' });
  locked.error?.includes('Too many wrong attempts') ? ok('OTP locked after 5 wrong codes') : bad(`OTP lockout: ${locked.error}`);

  section('Unique phone index once duplicates are resolved');
  await col('students').deleteOne({ name: 'Dup Two' });
  const fixed = migrate('--apply');
  fixed.includes('No duplicate phone numbers') ? ok('migration sees no duplicates') : bad('still reports duplicates');
  const idx = await col('students').indexes();
  expect('unique libraryId+phone index built', idx.some((i) => i.name === 'libraryId_phone_unique' && i.unique), true);

  console.log(`\nPassed: ${pass}   Failed: ${fail}`);
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
