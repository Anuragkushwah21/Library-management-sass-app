'use client';

import { useEffect, useMemo, useState } from 'react';
import { DataTable } from '@/components/librarian/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ColumnDef } from '@tanstack/react-table';
import { Mail } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type PaymentStatus = 'paid' | 'unpaid' | 'pending';
type MembershipStatus = 'active' | 'inactive' | 'expired';

interface StudentRow {
  _id: string;
  name: string;
  email: string;
  phone: string;
  paymentStatus: PaymentStatus;
  membershipStatus: MembershipStatus;
  membershipEndDate?: string | null;
  createdAt: string;
}

const baseColumns: ColumnDef<StudentRow>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'membershipEndDate',
    header: 'Membership Expires',
    cell: ({ row }) => {
      const dateStr = row.getValue(
        'membershipEndDate'
      ) as string | null;
      if (!dateStr) return '-';

      const expiryDate = new Date(dateStr);
      if (Number.isNaN(expiryDate.getTime()))
        return '-';

      const today = new Date();
      const diffMs =
        expiryDate.getTime() - today.getTime();
      const daysLeft = Math.ceil(
        diffMs / (1000 * 60 * 60 * 24)
      );

      let color =
        'bg-green-100 text-green-800';
      if (daysLeft <= 0)
        color = 'bg-red-100 text-red-800';
      else if (daysLeft <= 30)
        color = 'bg-red-100 text-red-800';
      else if (daysLeft <= 60)
        color =
          'bg-yellow-100 text-yellow-800';

      return (
        <div className="space-y-1">
          <p className="font-medium">
            {expiryDate.toLocaleDateString()}
          </p>
          <Badge className={color}>
            {daysLeft > 0
              ? `${daysLeft} days left`
              : 'Expired'}
          </Badge>
        </div>
      );
    },
  },
  {
    accessorKey: 'paymentStatus',
    header: 'Payment Status',
    cell: ({ row }) => {
      const status =
        row.getValue('paymentStatus') as string;
      const colorMap: Record<string, string> = {
        paid: 'bg-green-100 text-green-800',
        pending:
          'bg-yellow-100 text-yellow-800',
        unpaid: 'bg-red-100 text-red-800',
      };
      const classes =
        colorMap[status] ||
        'bg-gray-100 text-gray-800';
      return (
        <Badge className={classes}>
          {status.charAt(0).toUpperCase() +
            status.slice(1)}
        </Badge>
      );
    },
  },
];

export default function MembershipsPage() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedMember, setSelectedMember] =
    useState<StudentRow | null>(null);
  const [isDialogOpen, setIsDialogOpen] =
    useState(false);

  // Pagination (client-side)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] =
    useState(10);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const res: any = await api.getStudents();
      const list = Array.isArray(res.data)
        ? res.data
        : res;
      setStudents(list as StudentRow[]);
    } catch (error: any) {
      console.error(
        '[MembershipsPage] fetch error:',
        error
      );
      toast.error(
        error.message ||
          'Something went wrong while loading memberships.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  // Filter only paid members on frontend
  const paidMembers = useMemo(
    () =>
      students.filter(
        (s) => s.paymentStatus === 'paid'
      ),
    [students]
  );

  // Pagination derived values
  const totalMembers = paidMembers.length;
  const totalPages =
    totalMembers > 0
      ? Math.ceil(totalMembers / pageSize)
      : 1;

  const paginatedMembers = useMemo(
    () =>
      paidMembers.slice(
        (page - 1) * pageSize,
        page * pageSize
      ),
    [paidMembers, page, pageSize]
  );

  // Agar page bounds se bahar chala jaye (filter/change se), adjust karo
  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages || 1);
    }
  }, [totalPages, page]);

  const handleSendReminder = (
    member: StudentRow
  ) => {
    setSelectedMember(member);
    setIsDialogOpen(true);
  };

  const handleConfirmSend = async () => {
    try {
      const data: any =
        await api.sendMembershipReminders();

      toast.success(
        `Sent ${data.details?.sentCount ?? 0} reminder(s).`
      );
    } catch (error: any) {
      console.error(
        '[Memberships] reminder error:',
        error
      );
      toast.error(
        error.message ||
          'Failed to send reminders.'
      );
    } finally {
      setIsDialogOpen(false);
    }
  };

  const columns: ColumnDef<StudentRow>[] =
    useMemo(
      () => [
        ...baseColumns,
        {
          id: 'actions',
          header: 'Actions',
          cell: ({ row }) => {
            const member = row.original;
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      handleSendReminder(member)
                    }
                  >
                    <Mail className="mr-2 h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    Send renewal reminder email to
                    this member.
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          },
        },
      ],
      []
    );

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">
            Memberships
          </h1>
          <p className="text-muted-foreground">
            Manage paid memberships and send
            renewal reminders
          </p>
        </div>

        <DataTable
          columns={columns}
          data={paginatedMembers}
          // agar DataTable isLoading support karta ho:
          // isLoading={loading}
        />

        {/* Pagination controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="text-sm text-muted-foreground">
            Showing{' '}
            {totalMembers === 0
              ? '0'
              : (page - 1) * pageSize + 1}
            –
            {Math.min(
              page * pageSize,
              totalMembers
            )}{' '}
            of {totalMembers} members
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1 || loading}
              onClick={() =>
                setPage((prev) =>
                  Math.max(prev - 1, 1)
                )
              }
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={
                loading || page >= totalPages
              }
              onClick={() =>
                setPage((prev) =>
                  Math.min(
                    prev + 1,
                    totalPages
                  )
                )
              }
            >
              Next
            </Button>

            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                const size = Number(value);
                setPageSize(size);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">
                  10
                </SelectItem>
                <SelectItem value="20">
                  20
                </SelectItem>
                <SelectItem value="50">
                  50
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Dialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Send Renewal Reminder
              </DialogTitle>
              <DialogDescription>
                This will send an email reminder to
                the selected member about their
                upcoming membership expiry.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {selectedMember && (
                <>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Member
                    </p>
                    <p className="font-medium">
                      {selectedMember.name}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Email
                    </p>
                    <p className="font-medium">
                      {selectedMember.email}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Membership Expires
                    </p>
                    <p className="font-medium">
                      {selectedMember.membershipEndDate
                        ? new Date(
                            selectedMember.membershipEndDate
                          ).toLocaleDateString()
                        : '-'}
                    </p>
                  </div>
                </>
              )}
              <Button
                onClick={handleConfirmSend}
                className="w-full"
              >
                <Mail className="mr-2 h-4 w-4" />
                Send Email Reminder
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}