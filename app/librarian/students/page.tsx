'use client';

import { minForExisting, todayInput } from '@/lib/date-rules';
import { useEffect, useMemo, useState } from 'react';
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
import { Pencil, Trash2 } from 'lucide-react';
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
  seatNumber?: number | null;
}

type SeatStatus = 'available' | 'reserved' | 'occupied';

interface SeatRow {
  _id: string;
  seatNumber: number;
  status: SeatStatus;
  studentId?: string | null;
  studentName?: string;
  studentEmail?: string;
}

export default function StudentsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    phone: string;
    paymentStatus: PaymentStatus;
    membershipEndDate: string;
    seatId: string;
  }>({
    name: '',
    phone: '',
    paymentStatus: 'unpaid',
    membershipEndDate: '',
    seatId: 'none',
  });

  // Seats
  const [availableSeats, setAvailableSeats] = useState<SeatRow[]>([]);
  const [loadingSeats, setLoadingSeats] = useState(false);

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

  // ------- Fetch seats for the edit dropdown -------
  // Saari seats laate hain, sirf `available` nahi — warna jis student ke paas
  // pehle se seat hai uski apni seat list me hoti hi nahi, aur dropdown
  // "none" par gir jaata hai. Filter neeche karte hain.
  const fetchAvailableSeats = async (): Promise<SeatRow[]> => {
    try {
      setLoadingSeats(true);
      const res: any = await api.getSeats();
      const list = (Array.isArray(res.data) ? res.data : res) as SeatRow[];
      setAvailableSeats(list);
      return list;
    } catch (error: any) {
      console.error('[StudentsPage] fetch seats error:', error);
      toast.error(error.message || 'Failed to load seats.');
      return [];
    } finally {
      setLoadingSeats(false);
    }
  };

  useEffect(() => {
    // initial load / page change
    fetchStudents(searchTerm || undefined, page, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

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

  const updateStudent = async (
    id: string,
    payload: {
      name?: string;
      phone?: string;
      paymentStatus?: PaymentStatus;
      membershipEndDate?: string;
      seatNumber?: number | null;
    }
  ) => {
    try {
      await api.updateStudent(id, payload);
      toast.success('Student updated successfully.');
      setEditingId(null);
      await fetchStudents(
        searchTerm || undefined,
        page,
        pageSize
      );
    } catch (error: any) {
      console.error('[StudentsPage] update error:', error);
      toast.error(
        error.message ||
          'Something went wrong while updating student.'
      );
    }
  };

  const startEdit = async (student: StudentRow) => {
    setEditingId(student._id);

    // Seats pehle laao, phir student ki current seat preselect karo.
    // Pehle yahan hardcoded 'none' set hota tha — isliye edit kholte hi form
    // "no seat" dikhata tha, aur save karne par seat chhin jaati thi.
    const seats = await fetchAvailableSeats();

    const ownSeat = seats.find(
      (s) =>
        String(s.studentId || '') === String(student._id) ||
        (student.seatNumber != null && s.seatNumber === student.seatNumber)
    );

    setEditForm({
      name: student.name,
      phone: student.phone,
      paymentStatus: student.paymentStatus,
      membershipEndDate: student.membershipEndDate
        ? student.membershipEndDate.slice(0, 10)
        : '',
      seatId: ownSeat ? ownSeat._id : 'none',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const handleEditChange = (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSeatChange = (value: string) => {
    setEditForm((prev) => ({ ...prev, seatId: value }));
  };

  const handleEditSave = async (student: StudentRow) => {
    if (!editForm.name.trim() || !editForm.phone.trim()) {
      toast.error('Name and phone are required.');
      return;
    }

    if (
      !['paid', 'unpaid', 'pending'].includes(
        editForm.paymentStatus as PaymentStatus
      )
    ) {
      toast.error('Invalid payment status.');
      return;
    }

    const payload: {
      name?: string;
      phone?: string;
      paymentStatus?: PaymentStatus;
      membershipEndDate?: string;
      seatNumber?: number | null;
    } = {
      name: editForm.name.trim(),
      phone: editForm.phone.trim(),
      paymentStatus: editForm.paymentStatus,
    };

    if (editForm.membershipEndDate) {
      const saved = student.membershipEndDate?.slice(0, 10);
      if (
        editForm.membershipEndDate !== saved &&
        editForm.membershipEndDate < todayInput()
      ) {
        toast.error('Membership end date cannot be in the past.');
        return;
      }
      payload.membershipEndDate = editForm.membershipEndDate;
    }

    // Seat SIRF tab bhejo jab librarian ne use actually badla ho.
    //
    // Agar seat unchanged hai to `seatNumber` payload me daalte hi nahi —
    // backend key absent dekh kar seat ko haath nahi lagata. Isi wajah se
    // membership renew / payment status update par seat student ke paas hi
    // rehti hai. (Pehle yahan hamesha value jaati thi aur `none` par null
    // chala jaata tha, jisse seat chup-chaap chhin jaati thi.)
    const currentSeat = availableSeats.find(
      (s) => String(s.studentId || '') === String(student._id)
    );
    const currentSeatId = currentSeat?._id ?? 'none';

    if (editForm.seatId !== currentSeatId) {
      if (editForm.seatId === 'none') {
        payload.seatNumber = null;
      } else {
        const seat = availableSeats.find((s) => s._id === editForm.seatId);
        if (seat) payload.seatNumber = seat.seatNumber;
      }
    }

    // Ek hi call — backend Seat aur Student dono ko sync karta hai
    try {
      await updateStudent(student._id, payload);
    } catch (error: any) {
      console.error('[StudentsPage] student update error:', error);
      toast.error(error.message || 'Failed to update student.');
      // Form khula rehne do taaki librarian dobara try kar sake — warna
      // "Seat already assigned" jaisi error ke baad changes gayab ho jaate hain
      return;
    }

    setEditingId(null);
    await fetchStudents(
      searchTerm || undefined,
      page,
      pageSize
    );
  };

  const columns: ColumnDef<StudentRow>[] = useMemo(
    () => [
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
        header: 'Payment',
        cell: ({ row }) => {
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
          const isEditing = editingId === student._id;

          return (
            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      handleEditSave(student)
                    }
                  >
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={cancelEdit}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          startEdit(student)
                        }
                      >
                        <Pencil className="mr-1 h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        Edit this student&apos;s details.
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
              )}
            </div>
          );
        },
      },
    ],
    [editingId, availableSeats]
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
              All Students
            </h1>
            <p className="text-muted-foreground">
              Manage and view all student records
            </p>
          </div>
          <Link href="/librarian/students/add">
            <Button>Add Student</Button>
          </Link>
        </div>

        <div className="w-full max-w-sm">
          <Input
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>

        {editingId && (
          <div className="border rounded-lg p-4 space-y-3 bg-muted/50">
            <h2 className="text-lg font-semibold">
              Edit student
            </h2>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  Name
                </label>
                <Input
                  name="name"
                  value={editForm.name}
                  onChange={handleEditChange}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  Phone
                </label>
                <Input
                  name="phone"
                  value={editForm.phone}
                  onChange={handleEditChange}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  Membership end
                </label>
                <Input
                  name="membershipEndDate"
                  type="date"
                  min={minForExisting(
                    students
                      .find((s) => s._id === editingId)
                      ?.membershipEndDate?.slice(0, 10)
                  )}
                  value={editForm.membershipEndDate}
                  onChange={handleEditChange}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">
                  Seat
                </label>
                <Select
                  value={editForm.seatId}
                  onValueChange={handleSeatChange}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        loadingSeats
                          ? 'Loading seats...'
                          : 'Select seat'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      No seat
                    </SelectItem>
                    {availableSeats
                      // Free seats + is student ki apni seat. Doosron ki
                      // occupied seats list me nahi aani chahiye.
                      .filter(
                        (seat) =>
                          seat.status === 'available' ||
                          String(seat.studentId || '') === String(editingId)
                      )
                      .map((seat) => {
                        const isOwn =
                          String(seat.studentId || '') === String(editingId);
                        return (
                          <SelectItem key={seat._id} value={seat._id}>
                            Seat {seat.seatNumber}
                            {isOwn && ' (current)'}
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">
                  Payment status
                </label>
                <select
                  name="paymentStatus"
                  value={editForm.paymentStatus}
                  onChange={handleEditChange}
                  className="border rounded-md h-9 px-2 text-sm"
                >
                  <option value="paid">Paid</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="pending">
                    Pending
                  </option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                onClick={() => {
                  const student = students.find(
                    (s) => s._id === editingId
                  );
                  if (student) handleEditSave(student);
                }}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={cancelEdit}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

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
      </div>
    </TooltipProvider>
  );
}