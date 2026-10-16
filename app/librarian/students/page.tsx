'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '@/components/librarian/data-table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { toast } from 'react-toastify';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { IndianRupee, Pencil, Trash2 } from 'lucide-react';
import { FeesDialog, type FeeStudent } from '@/components/librarian/fees-dialog';
import { StudentEditDialog } from '@/components/librarian/student-edit-dialog';
import { api } from '@/lib/api';
import { DemoStudentsPanel } from '@/components/librarian/demo-students-panel';
import { ActivationDialog, type ActivatableStudent } from '@/components/librarian/activation-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type PaymentStatus = 'paid' | 'unpaid' | 'pending';
type MembershipStatus = 'active' | 'inactive' | 'expired';

type Tab = 'demo' | 'active' | 'due' | 'ended' | 'expired' | 'blocked';

/** Each tab is just a status filter, so a status change moves the student (PLAN §2.1). */
const TABS: { key: Tab; label: string; status?: string; due?: boolean }[] = [
  { key: 'demo', label: 'Demo Students' },
  { key: 'active', label: 'All Students', status: 'ACTIVE_MEMBER' },
  { key: 'due', label: 'Fees Due', status: 'ACTIVE_MEMBER,EXPIRED', due: true },
  { key: 'ended', label: 'Demo Ended' },
  { key: 'expired', label: 'Expired', status: 'EXPIRED' },
  { key: 'blocked', label: 'Blocked', status: 'BLOCKED' },
];

interface StudentRow {
  _id: string;
  name: string;
  status?: string;
  email: string;
  phone: string;
  paymentStatus: PaymentStatus;
  membershipStatus: MembershipStatus;
  membershipEndDate?: string | null;
  createdAt: string;
  seatNumber?: number | null;
  /** Fee totals over all membership periods; null = no fee recorded yet */
  fees?: { fee: number; paid: number; due: number } | null;
}

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export default function StudentsPage() {
  const [tab, setTab] = useState<Tab>('active');
  const [renewing, setRenewing] = useState<ActivatableStudent | null>(null);
  const [feesFor, setFeesFor] = useState<FeeStudent | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const closeEdit = useCallback(() => setEditId(null), []);
  const [searchTerm, setSearchTerm] = useState('');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  // ------- Fetch students with pagination -------
  const fetchStudents = async (
    search?: string,
    pageArg?: number,
    pageSizeArg?: number
  ) => {
    try {
      setLoading(true);

      const params: Record<string, any> = {};
      if (search) params.search = search;
      const tabStatus = TABS.find((t) => t.key === tab)?.status;
      if (tabStatus) params.status = tabStatus;
      if (TABS.find((t) => t.key === tab)?.due) params.due = '1';
      params.page = pageArg ?? page;
      params.pageSize = pageSizeArg ?? pageSize;

      const res: any = await api.getStudents(params);

      // Expecting something like { data: studentsArray, total: number }
      const list = Array.isArray(res.data)
        ? res.data
        : res.data?.students || res;
      const totalCount =
        typeof res.total === 'number'
          ? res.total
          : res.data?.total ?? list.length;

      setStudents(list as StudentRow[]);
      setTotal(totalCount);
    } catch (error: any) {
      console.error('[StudentsPage] fetch error:', error);
      toast.error(error.message || 'Failed to load students.');
    } finally {
      setLoading(false);
    }
  };

  // Open a specific tab from a link, e.g. /librarian/students?tab=demo
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    if (t && TABS.some((x) => x.key === t)) setTab(t);
  }, []);

  const switchTab = (t: Tab) => {
    setTab(t);
    setPage(1);
    window.history.replaceState(null, '', `?tab=${t}`);
  };

  useEffect(() => {
    // initial load / page change / tab change
    if (TABS.find((t) => t.key === tab)?.status) fetchStudents(searchTerm || undefined, page, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, tab]);

  const handleSearchChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value;
    setSearchTerm(value);
    setPage(1);
    fetchStudents(value, 1, pageSize);
  };

  const handleDeleteStudent = async (student: StudentRow) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete ${student.name}?`
    );
    if (!confirmDelete) return;

    try {
      await api.deleteStudent(student._id);
      toast.success(`${student.name} has been removed.`);
      setStudents((prev) =>
        prev.filter((s) => s._id !== student._id)
      );
      // Optionally refetch to keep pagination consistent
      fetchStudents(searchTerm || undefined, page, pageSize);
    } catch (error: any) {
      console.error('[StudentsPage] delete error:', error);
      toast.error(
        error.message || 'Failed to delete student.'
      );
    }
  };

  const columns: ColumnDef<StudentRow>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <button type="button" className="text-left font-medium hover:text-primary hover:underline" onClick={() => setEditId(row.original._id)}>
            {row.original.name}
            <span className="block text-xs font-normal text-muted-foreground">{row.original.phone}</span>
          </button>
        ),
      },
      {
        accessorKey: 'email',
        header: 'Email',
      },
      {
        accessorKey: 'seatNumber',
        header: 'Seat',
        cell: ({ row }) => {
          const seat = row.getValue(
            'seatNumber'
          ) as number | null;
          if (!seat) {
            return (
              <span className="text-xs text-muted-foreground">
                Not assigned
              </span>
            );
          }
          return (
            <Badge className="bg-blue-100 text-blue-800">
              Seat {seat}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'membershipStatus',
        header: 'Status',
        cell: ({ row }) => {
          const status =
            row.getValue('membershipStatus') as string;
          const colorMap: Record<string, string> = {
            active: 'bg-green-100 text-green-800',
            inactive: 'bg-gray-100 text-gray-800',
            expired: 'bg-red-100 text-red-800',
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
      {
        accessorKey: 'membershipEndDate',
        header: 'End Date',
        cell: ({ row }) => {
          const value = row.getValue(
            'membershipEndDate'
          ) as string | null;
          if (!value) return '-';
          const date = new Date(value);
          if (Number.isNaN(date.getTime())) return '-';
          return date.toLocaleDateString();
        },
      },
      {
        accessorKey: 'paymentStatus',
        header: 'Fees',
        cell: ({ row }) => {
          const f = row.original.fees;
          if (f) {
            return (
              <button type="button" className="text-left" onClick={() => setFeesFor(row.original)}>
                <span className="block text-sm tabular-nums">
                  {rupees(f.paid)} <span className="text-muted-foreground">/ {rupees(f.fee)}</span>
                </span>
                {f.due > 0 ? (
                  <Badge className="bg-red-100 text-red-800 hover:bg-red-100">{rupees(f.due)} due</Badge>
                ) : (
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid</Badge>
                )}
              </button>
            );
          }
          const status =
            row.getValue('paymentStatus') as string;
          const colorMap: Record<string, string> = {
            paid: 'bg-green-100 text-green-800',
            pending: 'bg-yellow-100 text-yellow-800',
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
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const student = row.original;

          return (
            <div className="flex gap-2">
              <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant={student.fees?.due ? 'default' : 'outline'} onClick={() => setFeesFor(student)}>
                        <IndianRupee className="h-4 w-4" />
                        <span className="ml-1 hidden sm:inline">{student.fees?.due ? 'Collect' : 'Fees'}</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Collect fee, see what&apos;s paid and due, print receipts.</p>
                    </TooltipContent>
                  </Tooltip>
                  {tab === 'expired' && (
                    <Button size="sm" onClick={() => setRenewing({ ...student, status: student.status ?? 'EXPIRED' } as any)}>
                      Renew
                    </Button>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setEditId(student._id)
                        }
                      >
                        <Pencil className="mr-1 h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        View or edit details, seat, shift and dates.
                      </p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() =>
                          handleDeleteStudent(student)
                        }
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        Delete this student
                        permanently.
                      </p>
                    </TooltipContent>
                  </Tooltip>
              </>
            </div>
          );
        },
      },
    ],
    [tab]
  );

  const totalPages =
    total > 0
      ? Math.ceil(total / pageSize)
      : students.length > 0
      ? 1
      : 1;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">
              Students
            </h1>
            <p className="text-muted-foreground">
              Demo students, members and follow-ups in one place
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/librarian/students/add-demo">
              <Button variant="outline">Add Demo Student</Button>
            </Link>
            <Link href="/librarian/students/add">
              <Button>Add Member</Button>
            </Link>
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/40 p-1" role="tablist" aria-label="Student lists">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => switchTab(t.key)}
              className={
                'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
                (tab === t.key ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'demo' || tab === 'ended' ? (
          <DemoStudentsPanel mode={tab === 'demo' ? 'DEMO' : 'DEMO_ENDED'} />
        ) : (
        <>

        {tab === 'due' && !loading && (
          <div className="flex flex-wrap items-baseline gap-x-2 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
            <span className="text-xl font-bold tabular-nums text-red-600">
              {rupees(students.reduce((sum, st) => sum + (st.fees?.due ?? 0), 0))}
            </span>
            <span className="text-sm text-muted-foreground">
              pending from {students.length} student{students.length === 1 ? '' : 's'} — tap Collect to take a payment and print the receipt.
            </span>
          </div>
        )}

        <div className="w-full max-w-sm">
          <Input
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>

        <DataTable columns={columns} data={students} />

        {/* Pagination controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1 || loading}
              onClick={() =>
                setPage((prev) => Math.max(prev - 1, 1))
              }
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={
                loading ||
                page >= totalPages
              }
              onClick={() =>
                setPage((prev) => prev + 1)
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
                fetchStudents(
                  searchTerm || undefined,
                  1,
                  size
                );
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
        </>
        )}
      </div>

      <StudentEditDialog
        studentId={editId}
        onClose={closeEdit}
        onSaved={() => fetchStudents(searchTerm || undefined, page, pageSize)}
      />

      <FeesDialog
        student={feesFor}
        onClose={() => setFeesFor(null)}
        onChanged={() => fetchStudents(searchTerm || undefined, page, pageSize)}
        onRenew={(st) => {
          setFeesFor(null);
          setRenewing(st);
        }}
      />

      <ActivationDialog
        student={renewing}
        onClose={() => setRenewing(null)}
        onDone={() => fetchStudents(searchTerm || undefined, page, pageSize)}
      />
    </TooltipProvider>
  );
}