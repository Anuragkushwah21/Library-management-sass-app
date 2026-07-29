import { Schema, model, models, Types } from 'mongoose';

const bookSchema = new Schema(
  {
    title: { type: String, required: true },
    author: { type: String, required: true },

    // ISBN sirf ek library ke andar unique hona chahiye, globally nahi —
    // warna do librarians ek hi book stock nahi kar payenge.
    isbn: { type: String, trim: true, default: null },

    totalCopies: { type: Number, default: 1 },
    availableCopies: { type: Number, default: 1 },
    issuedCount: { type: Number, default: 0 },

    // simple reservation / issue record
    currentHolder: {
      type: Types.ObjectId,
      ref: 'Student',
      default: null,
    },
    dueDate: { type: Date, default: null },

    // multi-tenant: har book kis librarian ki hai
    librarianId: {
      type: Types.ObjectId,
      ref: 'User', // ya 'Librarian' agar separate model hai
      required: true,
    },
  },
  { timestamps: true }
);

// fast queries per librarian
bookSchema.index({ librarianId: 1 });

// Per-tenant ISBN uniqueness. `partialFilterExpression` isliye taaki bina ISBN
// wali books (null) is constraint me na aayen.
bookSchema.index(
  { librarianId: 1, isbn: 1 },
  {
    unique: true,
    partialFilterExpression: { isbn: { $type: 'string' } },
  }
);

const Book = models.Book || model('Book', bookSchema);
export default Book;