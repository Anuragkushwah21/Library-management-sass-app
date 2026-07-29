'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, MoreHorizontal, Trash2, Edit } from 'lucide-react';

interface Book {
  id: string;
  title: string;
  author: string;
  isbn: string;
  category: string;
  available: number;
  total: number;
}

interface BooksTableProps {
  books: Book[];
  isLoading?: boolean;
  onEdit?: (book: Book) => void;
  onDelete?: (bookId: string) => void;
  onSearch?: (query: string) => void;
  onFilterCategory?: (category: string) => void;
}

const CATEGORIES = [
  'Fiction',
  'Non-Fiction',
  'Science',
  'History',
  'Biography',
  'Mystery',
  'Romance',
  'Technology',
];

export function BooksTable({
  books,
  isLoading,
  onEdit,
  onDelete,
  onSearch,
  onFilterCategory,
}: BooksTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    onSearch?.(value);
  };

  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
    onFilterCategory?.(value);
  };

  const filteredBooks = books.filter((book) => {
    const matchesSearch =
      searchQuery === '' ||
      book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.author.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === 'all' || book.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <Card className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-800/50 backdrop-blur-sm border-slate-200/50 dark:border-slate-700/50">
      <div className="p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search books..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10 bg-white dark:bg-slate-800 border-slate-200/50 dark:border-slate-700/50"
            />
          </div>
          <Select value={selectedCategory} onValueChange={handleCategoryChange}>
            <SelectTrigger className="w-full sm:w-48 bg-white dark:bg-slate-800 border-slate-200/50 dark:border-slate-700/50">
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filteredBooks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-500 dark:text-slate-400">No books found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-slate-200/50 dark:border-slate-700/50">
                  <TableHead className="text-slate-600 dark:text-slate-300">
                    Title
                  </TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">
                    Author
                  </TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">
                    ISBN
                  </TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">
                    Category
                  </TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">
                    Available
                  </TableHead>
                  <TableHead className="text-right text-slate-600 dark:text-slate-300">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBooks.map((book) => (
                  <TableRow
                    key={book.id}
                    className="border-slate-200/50 dark:border-slate-700/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/50"
                  >
                    <TableCell className="font-medium text-slate-900 dark:text-white">
                      {book.title}
                    </TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400">
                      {book.author}
                    </TableCell>
                    <TableCell className="text-slate-500 dark:text-slate-500">
                      {book.isbn}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700/50"
                      >
                        {book.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          book.available > 0 ? 'default' : 'destructive'
                        }
                        className={
                          book.available > 0
                            ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700/50'
                            : ''
                        }
                      >
                        {book.available}/{book.total}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit?.(book)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onDelete?.(book.id)}
                            className="text-red-600 dark:text-red-400"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Card>
  );
}
