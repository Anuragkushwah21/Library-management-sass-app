'use client';

import { todayInput } from '@/lib/date-rules';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'react-toastify';
import { PlusCircle } from 'lucide-react';
import { AddBookDialog, BookFormData } from '@/components/librarian/add-book-dialog';
import { BookTrackingTable, Book } from '@/components/librarian/BookTrackingTable';

type MembershipStatus = 'active' | 'inactive' | 'expired';

interface Student {
  _id: string;
  name: string;
  email: string;
  membershipStatus?: MembershipStatus;
}

function safeDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString();
}

export default function BooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  // Issue form state
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [bookTitle, setBookTitle] = useState('');
  const [bookAuthor, setBookAuthor] = useState('');
  const [bookIsbn, setBookIsbn] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [issuing, setIssuing] = useState(false);

  // AddBookDialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addingBook, setAddingBook] = useState(false);

  const fetchBooks = async () => {
    try {
      setLoading(true);
      const res: any = await api.getBooks();
      const list = Array.isArray(res.data) ? res.data : res;
      setBooks(list as Book[]);
    } catch (error: any) {
      console.error('[BooksPage] fetch error:', error);
      toast.error(error.message || 'Failed to load books.');
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async () => {
    try {
      setStudentsLoading(true);
      const res: any = await api.getStudents();
      const list = Array.isArray(res.data) ? res.data : res;
      setStudents(list as Student[]);
    } catch (error: any) {
      console.error('[BooksPage] students fetch error:', error);
      toast.error(error.message || 'Failed to load students.');
    } finally {
      setStudentsLoading(false);
    }
  };

  useEffect(() => {
    fetchBooks();
    fetchStudents();
  }, []);

  // Sirf active membership wale students
  const activeStudents = useMemo(
    () =>
      students.filter((s) => {
        if (!s.membershipStatus) return true;
        return s.membershipStatus.toLowerCase() === 'active';
      }),
    [students]
  );

  const stats = useMemo(() => {
    const safe = (b: Book) => b.status ?? 'available';
    return {
      issued: books.filter((b) => safe(b) === 'issued').length,
      returned: books.filter((b) => safe(b) === 'returned').length,
      overdue: books.filter((b) => safe(b) === 'overdue').length,
    };
  }, [books]);

  // -------- Add Book (Inventory) --------
  const handleAddBook = async (data: BookFormData) => {
    setAddingBook(true);
    try {
      await api.createBook({
        title: data.title,
        author: data.author,
        isbn: data.isbn || undefined,
        totalCopies: data.total,
      });

      toast.success('Book added to inventory');
      await fetchBooks();
    } catch (error: any) {
      console.error('[BooksPage] add book error:', error);
      toast.error(error.message || 'Failed to add book.');
      throw error;
    } finally {
      setAddingBook(false);
    }
  };

  // -------- Issue Book (Physical) --------
  const handleIssueBook = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedStudentId || !bookTitle.trim() || !bookAuthor.trim()) {
      toast.error('Student, book title and author are required.');
      return;
    }

    setIssuing(true);

    try {
      const createdBookRes: any = await api.createBook({
        title: bookTitle.trim(),
        author: bookAuthor.trim(),
        isbn: bookIsbn.trim() || undefined,
      });

      const createdBook: Book = createdBookRes.data || createdBookRes;

      const issuePayload: {
        bookId: string;
        memberId: string;
        dueDate?: string;
        notes?: string;
      } = {
        bookId: createdBook._id,
        memberId: selectedStudentId,
      };

      if (dueDate) {
        if (dueDate < todayInput()) {
          throw new Error('Due date cannot be in the past.');
        }
        issuePayload.dueDate = dueDate;
      }
      if (notes.trim()) issuePayload.notes = notes.trim();

      await api.issueBook(issuePayload);

      toast.success('Book has been issued successfully.');

      setSelectedStudentId('');
      setBookTitle('');
      setBookAuthor('');
      setBookIsbn('');
      setDueDate('');
      setNotes('');

      fetchBooks();
    } catch (error: any) {
      console.error('[BooksPage] issue error:', error);
      toast.error(error.message || 'Something went wrong while issuing book.');
    } finally {
      setIssuing(false);
    }
  };

const handleReturnBook = async (book: Book) => {
  try {
    if (!book.transactionId) {
      toast.error('No active transaction found for this book.');
      return;
    }

    await api.returnBook(book.transactionId);
    toast.success('Book marked as returned.');
    fetchBooks();
  } catch (error: any) {
    toast.error(error.message || 'Something went wrong while returning book.');
  }
};

const handleRenewBook = async (book: Book) => {
  try {
    if (!book.transactionId) {
      toast.error('No active transaction found for this book.');
      return;
    }

    // optional: custom days pass kar sakte ho, e.g. 7
    await api.renewBook(book.transactionId /* , 7 */);
    toast.success('Book renewed successfully.');
    fetchBooks();
  } catch (error: any) {
    toast.error(error.message || 'Something went wrong while renewing book.');
  }
};

  const handleDeleteBook = async (bookId: string, title: string) => {
    if (!confirm(`Delete book "${title}"? This cannot be undone.`)) return;

    try {
      await api.deleteBook(bookId);
      toast.success(`"${title}" deleted successfully.`);
      fetchBooks();
    } catch (error: any) {
      console.error('[BooksPage] delete error:', error);
      toast.error(error.message || 'Something went wrong while deleting book.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Books Issue &amp; Return</h1>
          <p className="text-muted-foreground">
            Track book issuance and returns
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setAddDialogOpen(true)}
          className="flex items-center gap-2"
        >
          <PlusCircle className="w-4 h-4" />
          Add Book to Inventory
        </Button>
      </div>

      {/* Add Book Dialog */}
      <AddBookDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSubmit={handleAddBook}
        isLoading={addingBook}
      />

      {/* Issue Book form */}
      <Card>
        <CardHeader>
          <CardTitle>Issue Book (Physical)</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleIssueBook}
            className="grid gap-4 md:grid-cols-4 items-end"
          >
            <div className="space-y-2 md:col-span-1">
              <label className="text-sm font-medium">Student (active)</label>
              <Select
                value={selectedStudentId}
                onValueChange={setSelectedStudentId}
                disabled={studentsLoading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      studentsLoading
                        ? 'Loading students...'
                        : activeStudents.length === 0
                        ? 'No active students'
                        : 'Select student'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {activeStudents.map((student) => (
                    <SelectItem key={student._id} value={student._id}>
                      {student.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-1">
              <label className="text-sm font-medium">Book title</label>
              <Input
                placeholder="Enter physical book name"
                value={bookTitle}
                onChange={(e) => setBookTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2 md:col-span-1">
              <label className="text-sm font-medium">Author</label>
              <Input
                placeholder="Enter author name"
                value={bookAuthor}
                onChange={(e) => setBookAuthor(e.target.value)}
              />
            </div>

            <div className="space-y-2 md:col-span-1">
              <label className="text-sm font-medium">ISBN (optional)</label>
              <Input
                placeholder="Enter ISBN if available"
                value={bookIsbn}
                onChange={(e) => setBookIsbn(e.target.value)}
              />
            </div>

            <div className="space-y-2 md:col-span-1">
              <label className="text-sm font-medium">Due date (optional)</label>
              <Input
                type="date"
                min={todayInput()}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty for default policy (e.g. 14 days).
              </p>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Notes (optional)</label>
              <Input
                placeholder="Any remarks about this issue"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="md:col-span-1">
              <Button
                type="submit"
                className="w-full"
                disabled={issuing || activeStudents.length === 0}
              >
                {issuing ? 'Issuing...' : 'Issue Book'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Books Issued</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.issued}</div>
            <p className="text-xs text-muted-foreground">Currently issued</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Books Returned</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.returned}</div>
            <p className="text-xs text-muted-foreground">Returned to library</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Overdue Books</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.overdue}</div>
            <p className="text-xs text-muted-foreground">Action required</p>
          </CardContent>
        </Card>
      </div>

      {/* Tracking Table (separate component + pagination) */}
      <BookTrackingTable
        books={books}
        loading={loading}
        onReturnBook={handleReturnBook}
        onRenewBook={handleRenewBook}
        onDeleteBook={handleDeleteBook}
      />
    </div>
  );
}