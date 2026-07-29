'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CheckCircle2, Trash2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type BookStatus = 'issued' | 'returned' | 'overdue' | 'available';

export interface Book {
  _id: string;
  title: string;
  author: string;
  isbn?: string;
  currentHolder?:
    | {
        _id: string;
        name?: string;
        email?: string;
      }
    | null;
  issueDate?: string | null;
  dueDate?: string | null;
  status?: BookStatus;
  notes?: string;
  transactionId?: string; // IMPORTANT for return/renew
  studentId?: string;
  studentName?: string;
  studentEmail?: string;
}

const statusColors: Partial<Record<BookStatus, string>> = {
  issued: 'bg-blue-100 text-blue-800',
  returned: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
};

function safeDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString();
}

interface BookTrackingTableProps {
  books: Book[];
  loading?: boolean;
  onReturnBook: (book: Book) => Promise<void> | void;
  onRenewBook: (book: Book) => Promise<void> | void;
  onDeleteBook: (bookId: string, title: string) => Promise<void> | void;
}

export const BookTrackingTable: React.FC<BookTrackingTableProps> = ({
  books,
  loading = false,
  onReturnBook,
  onRenewBook,
  onDeleteBook,
}) => {
  const [filterStatus, setFilterStatus] = useState<'all' | BookStatus>('all');

  // pagination state
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filteredBooks = useMemo(
    () =>
      books.filter((book) => {
        const status: BookStatus = book.status ?? 'available';
        if (filterStatus === 'all') return true;
        return status === filterStatus;
      }),
    [books, filterStatus]
  );

  const totalPages = Math.max(1, Math.ceil(filteredBooks.length / pageSize));

  const paginatedBooks = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredBooks.slice(start, start + pageSize);
  }, [filteredBooks, page]);

  // agar filter change ho to page reset
  const handleFilterChange = (val: 'all' | BookStatus) => {
    setFilterStatus(val);
    setPage(1);
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Filter */}
        <div className="w-full max-w-xs">
          <Select
            value={filterStatus}
            onValueChange={(val) =>
              handleFilterChange(val as 'all' | BookStatus)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Books</SelectItem>
              <SelectItem value="issued">Issued</SelectItem>
              <SelectItem value="returned">Returned</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Book Tracking</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Author</TableHead>
                    <TableHead>ISBN</TableHead>
                    <TableHead>Issued To</TableHead>
                    <TableHead>Issue Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedBooks.map((book) => {
                    const status: BookStatus = book.status ?? 'available';
                    const badgeClass =
                      status === 'available'
                        ? 'bg-gray-100 text-gray-800'
                        : statusColors[status] ||
                          'bg-gray-100 text-gray-800';

                    return (
                      <TableRow key={book._id}>
                        <TableCell className="font-medium">
                          {book.title}
                        </TableCell>
                        <TableCell className="text-sm">
                          {book.author}
                        </TableCell>
                        <TableCell className="text-sm">
                          {book.isbn || '-'}
                        </TableCell>
                        <TableCell>
                          {book.currentHolder?.name
                            ? `${book.currentHolder.name}${
                                book.currentHolder.email
                                  ? ` (${book.currentHolder.email})`
                                  : ''
                              }`
                            : '-'}
                        </TableCell>
                        <TableCell>{safeDate(book.issueDate)}</TableCell>
                        <TableCell>{safeDate(book.dueDate)}</TableCell>
                        <TableCell>
                          <Badge className={badgeClass}>
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="space-x-2 text-right">
                          {(status === 'issued' || status === 'overdue') && (
                            <>
                              {/* Return */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => onReturnBook(book)}
                                  >
                                    <CheckCircle2 className="mr-1 h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Mark this book as returned to the library.</p>
                                </TooltipContent>
                              </Tooltip>

                              {/* Renew */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => onRenewBook(book)}
                                  >
                                    Renew
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Extend due date by 14 days.</p>
                                </TooltipContent>
                              </Tooltip>
                            </>
                          )}

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() =>
                                  onDeleteBook(book._id, book.title)
                                }
                              >
                                <Trash2 className="mr-1 h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Delete this book record permanently.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {!loading && paginatedBooks.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center text-sm text-muted-foreground"
                      >
                        No books found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination controls */}
            {filteredBooks.length > 0 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-muted-foreground">
                  Showing{' '}
                  <span className="font-medium">
                    {(page - 1) * pageSize + 1}
                  </span>{' '}
                  to{' '}
                  <span className="font-medium">
                    {Math.min(page * pageSize, filteredBooks.length)}
                  </span>{' '}
                  of{' '}
                  <span className="font-medium">
                    {filteredBooks.length}
                  </span>{' '}
                  books
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-sm">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === totalPages}
                    onClick={() =>
                      setPage((p) => Math.min(totalPages, p + 1))
                    }
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
};