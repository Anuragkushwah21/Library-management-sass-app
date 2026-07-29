/**
 * One-time migration.
 *
 * Book schema me `isbn` par global unique index tha (`isbn_1`), jiski wajah se
 * do librarians ek hi ISBN wali book stock nahi kar paate the. Ab uski jagah
 * per-tenant compound index hai ({ librarianId, isbn }).
 *
 * Mongoose purana index automatically drop nahi karta, isliye ek baar yeh
 * chalana zaroori hai:
 *
 *   node --env-file=.env scripts/drop-legacy-isbn-index.mjs
 */
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('MONGODB_URI is not set.');
  process.exit(1);
}

await mongoose.connect(uri);

const collection = mongoose.connection.collection('books');
const indexes = await collection.indexes();

const legacy = indexes.find((i) => i.name === 'isbn_1');

if (legacy) {
  await collection.dropIndex('isbn_1');
  console.log('Dropped legacy global index: isbn_1');
} else {
  console.log('No legacy isbn_1 index found — nothing to do.');
}

// Naya compound index ensure karo
await collection.createIndex(
  { librarianId: 1, isbn: 1 },
  { unique: true, partialFilterExpression: { isbn: { $type: 'string' } } }
);
console.log('Ensured per-tenant index: librarianId_1_isbn_1');

await mongoose.disconnect();
