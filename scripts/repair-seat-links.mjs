/**
 * One-time repair.
 *
 * Purane code me student update karte waqt `Student.seatNumber` null ho jaata
 * tha lekin Seat document abhi bhi us student ko point karta rehta tha. Isse
 * dono collections drift kar gaye — table me "no seat" dikhta tha jabki seat
 * actually us student ke paas reserved thi.
 *
 * Seat collection ko source of truth maan kar Student.seatNumber wapas set
 * karta hai, aur un seats ko release karta hai jinke student delete ho chuke hain.
 *
 *   node --env-file=.env scripts/repair-seat-links.mjs          # dry run
 *   node --env-file=.env scripts/repair-seat-links.mjs --apply  # changes likhega
 */
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set.');
  process.exit(1);
}

await mongoose.connect(uri);
const db = mongoose.connection;

const seats = await db.collection('seats').find({ studentId: { $ne: null } }).toArray();

let relinked = 0;
let orphaned = 0;

for (const seat of seats) {
  const student = await db
    .collection('students')
    .findOne({ _id: seat.studentId });

  if (!student) {
    // Student delete ho chuka hai — seat free karo
    orphaned++;
    console.log(`  seat ${seat.seatNumber}: student gone → release`);
    if (APPLY) {
      await db.collection('seats').updateOne(
        { _id: seat._id },
        {
          $set: {
            status: 'available',
            studentId: null,
            reservedDate: null,
            reservedUntil: null,
          },
          $unset: { studentName: '', studentEmail: '' },
        }
      );
    }
    continue;
  }

  if (student.seatNumber !== seat.seatNumber) {
    relinked++;
    console.log(
      `  seat ${seat.seatNumber}: ${student.name} — student.seatNumber ` +
        `${student.seatNumber ?? 'null'} → ${seat.seatNumber}`
    );
    if (APPLY) {
      await db
        .collection('students')
        .updateOne({ _id: student._id }, { $set: { seatNumber: seat.seatNumber } });
    }
  }
}

// Ulta case: Student par seatNumber hai par koi Seat use claim nahi karti
const students = await db
  .collection('students')
  .find({ seatNumber: { $ne: null } })
  .toArray();

let stale = 0;
for (const student of students) {
  const seat = await db
    .collection('seats')
    .findOne({ studentId: student._id });

  if (!seat) {
    stale++;
    console.log(
      `  ${student.name}: seatNumber ${student.seatNumber} but no seat claims them → clear`
    );
    if (APPLY) {
      await db
        .collection('students')
        .updateOne({ _id: student._id }, { $set: { seatNumber: null } });
    }
  }
}

console.log(
  `\n${APPLY ? 'Applied' : 'Dry run'}: ${relinked} relinked, ${orphaned} orphan seats, ${stale} stale links`
);
if (!APPLY && relinked + orphaned + stale > 0) {
  console.log('Re-run with --apply to write these changes.');
}

await mongoose.disconnect();
