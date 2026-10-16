'use client';

import { useEffect, useMemo, useState } from 'react';
import { DataTable } from '@/components/librarian/data-table';
import { formatTime } from '@/lib/time';
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
  seatNumber?: number | null;
  shiftId?: string | null;
  /** Filled in on the page from the library's shifts */
  shift?: { name: string; startTime: string; endTime: string } | null;
  createdAt: string;
  fees?: { fee: number; paid: number; due: number } | null;
}

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

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
    accessorKey: 'seatNumber',
    header: 'Seat',
    cell: ({ row }) => {
      const seat = row.getValue('seatNumber') as number | null | undefined;
      return seat ? (
        <Badge variant="outline" className="font-semibold tabular-nums">
          Seat {seat}
        </Badge>
      ) : (
        <span className="text-sm text-muted-foreground">No seat</span>
      );
    },
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
    id: 'shift',
    header: 'Shift',
    cell: ({ row }) => {
      const shift = row.original.shift;
      return shift ? (
        <div className="leading-tight">
          <p className="font-medium">{shift.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatTime(shift.startTime)}–{formatTime(shift.endTime)}
          </p>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: 'paymentStatus',
    header: 'Fees',
    cell: ({ row }) => {
      const f = row.original.fees;
      if (f) {
        return (
          <div className="space-y-1">
            <p className="text-sm tabular-nums">
              {rupees(f.paid)} <span className="text-muted-foreground">/ {rupees(f.fee)}</span>
            </p>
            {f.due > 0 ? (
              <Badge className="bg-red-100 text-red-800 hover:bg-red-100">{rupees(f.due)} due</Badge>
            ) : (
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid</Badge>
            )}
          </div>
        );
      }
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
      const [res, shiftRes]: any[] = await Promise.all([
        api.getStudents({ status: 'ACTIVE_MEMBER' }),
        // Shift names are optional garnish — never fail the page over them
        api.getShifts().catch(() => ({ data: [] })),
      ]);
      const list = Array.isArray(res.data)
        ? res.data
        : res;
      const shiftById = new Map<string, StudentRow['shift']>(
        (shiftRes.data ?? []).map((sh: any) => [
          String(sh._id),
          { name: sh.name, startTime: sh.startTime, endTime: sh.endTime },
        ])
      );
      setStudents(
        (list as StudentRow[]).map((st) => ({
          ...st,
          shift: st.shiftId ? shiftById.get(String(st.shiftId)) ?? null : null,
        }))
      );
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

  // Every active member — part-paid ones too, so dues aren't hidden
  const paidMembers = students;
  const totals = useMemo(
    () =>
      students.reduce(
        (t, s) => ({ paid: t.paid + (s.fees?.paid ?? 0), due: t.due + (s.fees?.due ?? 0) }),
        { paid: 0, due: 0 }
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
            Active members, what they paid and
            what is still due, plus renewal reminders
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border p-3">
            <p className="text-xs text-muted-foreground">Active members</p>
            <p className="text-xl font-bold tabular-nums">{students.length}</p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-xs text-muted-foreground">Fees received</p>
            <p className="text-xl font-bold tabular-nums text-emerald-600">{rupees(totals.paid)}</p>
          </div>
          <a href="/librarian/students?tab=due" className={'rounded-xl border p-3 transition-colors hover:border-primary/50 ' + (totals.due > 0 ? 'border-red-500/30 bg-red-500/5' : '')}>
            <p className="text-xs text-muted-foreground">Still due</p>
            <p className={'text-xl font-bold tabular-nums ' + (totals.due > 0 ? 'text-red-600' : 'text-emerald-600')}>{rupees(totals.due)}</p>
          </a>
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