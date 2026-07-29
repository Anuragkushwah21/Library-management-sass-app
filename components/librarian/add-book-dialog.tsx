'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface AddBookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: BookFormData) => Promise<void>;
  isLoading?: boolean;
}

export interface BookFormData {
  title: string;
  author: string;
  isbn: string;
  description: string;
  category: string;
  total: number;
  publisher?: string;
  year?: number;
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

export function AddBookDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: AddBookDialogProps) {
  const [formData, setFormData] = useState<BookFormData>({
    title: '',
    author: '',
    isbn: '',
    description: '',
    category: 'Fiction',
    total: 1,
    publisher: '',
    year: new Date().getFullYear(),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await onSubmit(formData);
      setFormData({
        title: '',
        author: '',
        isbn: '',
        description: '',
        category: 'Fiction',
        total: 1,
        publisher: '',
        year: new Date().getFullYear(),
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to add book:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-800 border-slate-200/50 dark:border-slate-700/50">
        <DialogHeader>
          <DialogTitle className="text-slate-900 dark:text-white">
            Add New Book
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400">
            Fill in the book details below. Click save when done.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-slate-700 dark:text-slate-300">
                Title *
              </Label>
              <Input
                id="title"
                required
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                className="bg-white dark:bg-slate-800 border-slate-200/50 dark:border-slate-700/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="author" className="text-slate-700 dark:text-slate-300">
                Author *
              </Label>
              <Input
                id="author"
                required
                value={formData.author}
                onChange={(e) =>
                  setFormData({ ...formData, author: e.target.value })
                }
                className="bg-white dark:bg-slate-800 border-slate-200/50 dark:border-slate-700/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="isbn" className="text-slate-700 dark:text-slate-300">
                ISBN *
              </Label>
              <Input
                id="isbn"
                required
                value={formData.isbn}
                onChange={(e) =>
                  setFormData({ ...formData, isbn: e.target.value })
                }
                className="bg-white dark:bg-slate-800 border-slate-200/50 dark:border-slate-700/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category" className="text-slate-700 dark:text-slate-300">
                Category *
              </Label>
              <Select
                value={formData.category}
                onValueChange={(value) =>
                  setFormData({ ...formData, category: value })
                }
              >
                <SelectTrigger className="bg-white dark:bg-slate-800 border-slate-200/50 dark:border-slate-700/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="copies" className="text-slate-700 dark:text-slate-300">
                Total Copies *
              </Label>
              <Input
                id="copies"
                type="number"
                required
                min="1"
                value={formData.total}
                onChange={(e) =>
                  setFormData({ ...formData, total: parseInt(e.target.value) })
                }
                className="bg-white dark:bg-slate-800 border-slate-200/50 dark:border-slate-700/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="year" className="text-slate-700 dark:text-slate-300">
                Year
              </Label>
              <Input
                id="year"
                type="number"
                value={formData.year}
                onChange={(e) =>
                  setFormData({ ...formData, year: parseInt(e.target.value) })
                }
                className="bg-white dark:bg-slate-800 border-slate-200/50 dark:border-slate-700/50"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="publisher" className="text-slate-700 dark:text-slate-300">
              Publisher
            </Label>
            <Input
              id="publisher"
              value={formData.publisher}
              onChange={(e) =>
                setFormData({ ...formData, publisher: e.target.value })
              }
              className="bg-white dark:bg-slate-800 border-slate-200/50 dark:border-slate-700/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-slate-700 dark:text-slate-300">
              Description
            </Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="bg-white dark:bg-slate-800 border-slate-200/50 dark:border-slate-700/50 min-h-20"
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-slate-200/50 dark:border-slate-700/50"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700"
            >
              {isLoading ? 'Saving...' : 'Add Book'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
