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
  const { Student, UNIQUE_PHONE_INDEX } = await import('@/lib/models/Students');
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

  const orphans = await db.collection('students').countDocuments({
    librarianId: { $nin: librarians.map((u) => u._id) },
  });
  if (orphans) console.log(`\n⚠ ${orphans} student(s) belong to no existing librarian — left untouched.`);

  // Duplicate phones per library, AFTER normalization (9876543210 == +919876543210)
  const all = await db
    .collection('students')
    .find({}, { projection: { librarianId: 1, libraryId: 1, phone: 1, name: 1, status: 1 } })
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
  }

  console.log(APPLY ? '\nDone.\n' : '\nDry run only — nothing was written. Re-run with --apply.\n');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
