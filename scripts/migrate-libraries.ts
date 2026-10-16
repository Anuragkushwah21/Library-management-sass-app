/**
 * Phase 1 tenant migration (PLAN.md §8). Safe to re-run; never deletes data.
 *
 *   npx tsx --env-file=.env scripts/migrate-libraries.ts            # dry run (read-only)
 *   npx tsx --env-file=.env scripts/migrate-libraries.ts --apply    # write
 *
 * For every librarian: create their Library + default "Full Day" shift, set
 * libraryId on their students/seats/books/transactions/messages, normalize
 * student phones to E.164, derive Student.status, and give students a shift.
 * Then build the new indexes. The unique {libraryId, phone} index is only built
 * when no duplicates remain — duplicates are listed for the librarian to fix.
 */
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  // Dry run must not write anything — not even indexes
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
  await mongoose.connect(process.env.MONGODB_URI);

  const { User } = await import('@/lib/models/User');
  const { Library } = await import('@/lib/models/Library');
  const { Student, UNIQUE_PHONE_INDEX, UNIQUE_EMAIL_INDEX } = await import('@/lib/models/Students');
  const { normalizePhone } = await import('@/lib/phone');
  const { ensureLibraryForUser, backfillTenant } = await import('@/lib/services/library');

  console.log(`\n=== Library tenant migration — ${APPLY ? 'APPLY' : 'DRY RUN (read-only)'} ===\n`);

  const librarians = await User.find({ role: 'librarian' }).select('name email libraryId').lean<any[]>();
  const db = mongoose.connection.db!;
  const missing = (librarianId: unknown) => ({ librarianId, $or: [{ libraryId: null }, { libraryId: { $exists: false } }] });

  for (const u of librarians) {
    const lib = u.libraryId ? await Library.findById(u.libraryId).lean<any>() : await Library.findOne({ ownerId: u._id }).lean<any>();
    const counts: Record<string, number> = {};
    for (const c of ['students', 'seats', 'books', 'transactions', 'messages']) {
      counts[c] = await db.collection(c).countDocuments(missing(u._id));
    }
    const toNormalize = await db.collection('students').countDocuments({ librarianId: u._id, phoneRaw: { $exists: false } });
    console.log(
      `• ${u.email}: library ${lib ? `"${lib.name}" (${lib.slug})` : 'will be CREATED'}; ` +
        `missing libraryId → ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}; ` +
        `phones to normalize ${toNormalize}`
    );
    if (APPLY) {
      const library = await ensureLibraryForUser(String(u._id));
      // Idempotent; a re-run picks up rows skipped earlier (e.g. fixed duplicates)
      await backfillTenant(String(u._id), library);
    }
  }

  // Step 2.5 (PLAN §12.7): admin-controlled QR/OTP access. Libraries that had
  // turned QR on themselves keep it (D22), with 0 credits.
  const needAccess = await db.collection('libraries').find({ accessStatus: { $exists: false } }).toArray();
  console.log(`\n• QR/OTP access fields to add: ${needAccess.length} librar${needAccess.length === 1 ? 'y' : 'ies'}` +
    (needAccess.length ? ` (${needAccess.filter((l: any) => l.settings?.otpEnabled).length} had QR on and keep it)` : ''));
  if (APPLY) {
    const month = new Date().toISOString().slice(0, 7);
    for (const l of needAccess) {
      const on = Boolean(l.settings?.otpEnabled);
      await db.collection('libraries').updateOne(
        { _id: l._id, accessStatus: { $exists: false } },
        {
          $set: {
            accessStatus: 'ACTIVE',
            qrAttendanceEnabled: on,
            otpEnabled: on,
            smsCreditBalance: 0,
            monthlyOtpLimit: null,
            otpUsedThisMonth: 0,
            otpUsageMonth: month,
            accessNote: on ? 'Carried over from the old librarian switch' : '',
          },
        }
      );
    }
  }

  const orphans = await db.collection('students').countDocuments({
    librarianId: { $nin: librarians.map((u) => u._id) },
  });
  if (orphans) console.log(`\n⚠ ${orphans} student(s) belong to no existing librarian — left untouched.`);

  // Duplicate phones per library, AFTER normalization (9876543210 == +919876543210)
  const all = await db
    .collection('students')
    .find({}, { projection: { librarianId: 1, libraryId: 1, phone: 1, email: 1, name: 1, status: 1 } })
    .toArray();
  const groups = new Map<string, any[]>();
  for (const s of all) {
    if (s.status === 'REJECTED') continue;
    const key = `${String(s.libraryId ?? s.librarianId)}|${normalizePhone(s.phone) ?? s.phone}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const dups = [...groups.values()].filter((g) => g.length > 1);
  if (dups.length) {
    console.log(`\n⚠ ${dups.length} duplicate phone group(s) — ask the librarian to fix these, then re-run:`);
    for (const g of dups) {
      console.log(`   ${normalizePhone(g[0].phone) ?? g[0].phone}: ${g.map((s) => `${s.name} (${s._id})`).join(', ')}`);
    }
  } else {
    console.log('\n✓ No duplicate phone numbers within a library.');
  }

  // Same for emails (case-insensitive)
  const emailGroups = new Map<string, any[]>();
  for (const s of all) {
    if (s.status === 'REJECTED' || !s.email) continue;
    const key = `${String(s.libraryId ?? s.librarianId)}|${String(s.email).trim().toLowerCase()}`;
    emailGroups.set(key, [...(emailGroups.get(key) ?? []), s]);
  }
  const emailDups = [...emailGroups.values()].filter((g) => g.length > 1);
  if (emailDups.length) {
    console.log(`\n⚠ ${emailDups.length} duplicate email group(s) — fix these too, then re-run:`);
    for (const g of emailDups) {
      console.log(`   ${String(g[0].email).toLowerCase()}: ${g.map((s) => `${s.name} (${s._id})`).join(', ')}`);
    }
  } else {
    console.log('✓ No duplicate emails within a library.');
  }

  if (APPLY) {
    console.log('\nBuilding indexes…');
    const models = ['Library', 'Shift', 'Attendance', 'StudentOtp', 'AuditLog'];
    for (const name of models) {
      await import(`@/lib/models/${name}`);
      await mongoose.model(name).createCollection().catch(() => {});
      await mongoose.model(name).createIndexes();
      console.log(`  ✓ ${name}`);
    }
    await import('@/lib/models/Seat');
    await import('@/lib/models/Book');
    await import('@/lib/models/Transaction');
    for (const name of ['Seat', 'Book', 'Transaction', 'User']) {
      await mongoose.model(name).createIndexes();
      console.log(`  ✓ ${name}`);
    }
    await Student.createIndexes();
    // The unique phone index only once no duplicates remain
    if (dups.length === 0) {
      await Student.collection.createIndex(
        UNIQUE_PHONE_INDEX.key,
        UNIQUE_PHONE_INDEX.options as any
      );
      console.log('  ✓ Student (incl. unique libraryId+phone)');
    } else {
      console.log('  ✓ Student (unique libraryId+phone SKIPPED until duplicates are fixed)');
    }
    if (emailDups.length === 0) {
      // Lowercase legacy emails first, or the index would miss case duplicates
      await Student.collection.updateMany({ email: /[A-Z]|^\s|\s$/ }, [
        { $set: { email: { $toLower: { $trim: { input: '$email' } } } } },
      ]);
      await Student.collection.createIndex(UNIQUE_EMAIL_INDEX.key, UNIQUE_EMAIL_INDEX.options as any);
      console.log('  ✓ Student (incl. unique libraryId+email)');
    } else {
      console.log('  ✓ Student (unique libraryId+email SKIPPED until duplicates are fixed)');
    }
  }

  console.log(APPLY ? '\nDone.\n' : '\nDry run only — nothing was written. Re-run with --apply.\n');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
