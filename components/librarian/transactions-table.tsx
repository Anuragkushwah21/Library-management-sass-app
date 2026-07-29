import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/utils';

interface Transaction {
  id: string;
  memberName: string;
  bookTitle: string;
  issueDate: string;
  dueDate: string;
  returnDate?: string;
  status: 'issued' | 'overdue' | 'returned';
  fineAmount?: number;
}

interface TransactionsTableProps {
  transactions: Transaction[];
  isLoading?: boolean;
}

export function TransactionsTable({
  transactions,
  isLoading,
}: TransactionsTableProps) {
  const getStatusBadge = (status: Transaction['status'], dueDate: string) => {
    const isOverdue = new Date(dueDate) < new Date() && status === 'issued';
    const finalStatus = isOverdue ? 'overdue' : status;

    const variants = {
      issued: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700/50',
      overdue:
        'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700/50',
      returned:
        'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700/50',
    };

    const labels = {
      issued: 'Issued',
      overdue: 'Overdue',
      returned: 'Returned',
    };

    return (
      <Badge variant="outline" className={variants[finalStatus]}>
        {labels[finalStatus]}
      </Badge>
    );
  };

  return (
    <Card className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-800/50 backdrop-blur-sm border-slate-200/50 dark:border-slate-700/50">
      <div className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          Recent Transactions
        </h3>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-slate-500 dark:text-slate-400">
              No transactions yet
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-slate-200/50 dark:border-slate-700/50">
                  <TableHead className="text-slate-600 dark:text-slate-300">
                    Member
                  </TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">
                    Book
                  </TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">
                    Issued
                  </TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">
                    Due Date
                  </TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">
                    Status
                  </TableHead>
                  <TableHead className="text-right text-slate-600 dark:text-slate-300">
                    Fine
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((transaction) => (
                  <TableRow
                    key={transaction.id}
                    className="border-slate-200/50 dark:border-slate-700/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/50"
                  >
                    <TableCell className="font-medium text-slate-900 dark:text-white">
                      {transaction.memberName}
                    </TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400">
                      {transaction.bookTitle}
                    </TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400">
                      {formatDate(transaction.issueDate)}
                    </TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400">
                      {formatDate(transaction.dueDate)}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(transaction.status, transaction.dueDate)}
                    </TableCell>
                    <TableCell className="text-right font-medium text-slate-900 dark:text-white">
                      {transaction.fineAmount ? `₹${transaction.fineAmount}` : '-'}
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
