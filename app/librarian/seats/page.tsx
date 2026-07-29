'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'react-toastify';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Trash2, RotateCcw } from 'lucide-react';

type SeatStatus = 'available' | 'reserved' | 'occupied';

interface Seat {
  _id: string;
  seatNumber: number;
  status: SeatStatus;
  studentName?: string;
  studentEmail?: string;
  reservedDate?: string | null;
  reservedUntil?: string | null;
  notes?: string;
}

const statusColors: Record<SeatStatus, string> = {
  available: 'bg-green-100 text-green-800',
  reserved: 'bg-yellow-100 text-yellow-800',
  occupied: 'bg-blue-100 text-blue-800',
};

export default function SeatsPage() {
  const [seats, setSeats] = useState<Seat[]>([]);
  const [isLoadingSeats, setIsLoadingSeats] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const [newSeat, setNewSeat] = useState<{
    seatNumber: string;
    status: SeatStatus;
    notes: string;
  }>({
    seatNumber: '',
    status: 'available',
    notes: '',
  });

  // Pagination (client-side)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchSeats = async () => {
    try {
      setIsLoadingSeats(true);
      const res: any = await api.getSeats();
      const list = Array.isArray(res.data) ? res.data : res;
      setSeats(list as Seat[]);
    } catch (error: any) {
      console.error('[Seats] fetch error:', error);
      toast.error(error.message || 'Failed to load seats.');
    } finally {
      setIsLoadingSeats(false);
    }
  };

  useEffect(() => {
    fetchSeats();
  }, []);

  const handleAddSeat = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newSeat.seatNumber) {
      toast.error('Please enter a seat number.');
      return;
    }

    const seatNumberNum = Number(newSeat.seatNumber);
    if (Number.isNaN(seatNumberNum) || seatNumberNum <= 0) {
      toast.error('Seat number must be a positive number.');
      return;
    }

    setIsAdding(true);

    try {
      await api.createSeat({
        seatNumber: seatNumberNum,
        status: newSeat.status,
        notes: newSeat.notes || undefined,
      });

      toast.success(
        `Seat ${seatNumberNum} has been added successfully.`
      );
      setNewSeat({
        seatNumber: '',
        status: 'available',
        notes: '',
      });
      fetchSeats();
    } catch (error: any) {
      console.error('[Seats] add error:', error);
      toast.error(error.message || 'Failed to add seat.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteSeat = async (
    seatId: string,
    seatNumber: number
  ) => {
    if (
      !confirm(
        `Delete seat ${seatNumber}? This cannot be undone.`
      )
    )
      return;

    try {
      await api.deleteSeat(seatId);
      toast.success(`Seat ${seatNumber} has been deleted.`);
      fetchSeats();
    } catch (error: any) {
      console.error('[Seats] delete error:', error);
      toast.error(
        error.message || 'Failed to delete seat.'
      );
    }
  };

  const handleReleaseSeat = async (
    seatId: string,
    seatNumber: number
  ) => {
    if (
      !confirm(
        `Release seat ${seatNumber}? This will remove assigned student and reservation details.`
      )
    )
      return;

    try {
      await api.updateSeat(seatId, {
        status: 'available',
      });
      toast.success(
        `Seat ${seatNumber} is now available.`
      );
      fetchSeats();
    } catch (error: any) {
      console.error('[Seats] release error:', error);
      toast.error(
        error.message || 'Failed to release seat.'
      );
    }
  };

  const availableSeats = seats.filter(
    (s) => s.status === 'available'
  ).length;
  const occupiedSeats = seats.filter(
    (s) => s.status === 'occupied'
  ).length;
  const reservedSeats = seats.filter(
    (s) => s.status === 'reserved'
  ).length;

  // ---- Pagination derived values ----
  const totalSeats = seats.length;
  const totalPages =
    totalSeats > 0
      ? Math.ceil(totalSeats / pageSize)
      : 1;

  const currentSeats = seats.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  // Agar current page me data nahi bacha (delete/vs), to page ko adjust karo
  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages || 1);
    }
  }, [totalPages, page]);

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Heading */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">
            Seats Management
          </h1>
          <p className="text-muted-foreground">
            Manage library study seats
          </p>
        </div>

        {/* Add Seat Form */}
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Add New Seat</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleAddSeat}
              className="flex flex-col gap-4 md:flex-row md:items-end"
            >
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium">
                  Seat Number
                </label>
                <Input
                  type="number"
                  min={1}
                  placeholder="1"
                  value={newSeat.seatNumber}
                  onChange={(e) =>
                    setNewSeat((prev) => ({
                      ...prev,
                      seatNumber: e.target.value,
                    }))
                  }
                  disabled={isAdding}
                />
              </div>

              <div className="w-full md:w-40">
                <label className="text-sm font-medium">
                  Status
                </label>
                <Select
                  value={newSeat.status}
                  onValueChange={(val) =>
                    setNewSeat((prev) => ({
                      ...prev,
                      status: val as SeatStatus,
                    }))
                  }
                  disabled={isAdding}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">
                      Available
                    </SelectItem>
                    <SelectItem value="reserved">
                      Reserved
                    </SelectItem>
                    <SelectItem value="occupied">
                      Occupied
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium">
                  Notes (optional)
                </label>
                <Input
                  placeholder="Near window, corner seat..."
                  value={newSeat.notes}
                  onChange={(e) =>
                    setNewSeat((prev) => ({
                      ...prev,
                      notes: e.target.value,
                    }))
                  }
                  disabled={isAdding}
                />
              </div>

              <Button
                type="submit"
                className="w-full md:w-auto"
                disabled={isAdding}
              >
                {isAdding ? 'Adding...' : 'Add Seat'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Available Seats
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {availableSeats}
              </div>
              <p className="text-xs text-muted-foreground">
                Ready to use
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Occupied Seats
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {occupiedSeats}
              </div>
              <p className="text-xs text-muted-foreground">
                Currently in use
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Reserved Seats
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {reservedSeats}
              </div>
              <p className="text-xs text-muted-foreground">
                Reserved for later
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Seats Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Seats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg">
              {isLoadingSeats ? (
                <div className="p-4 text-sm text-muted-foreground">
                  Loading seats...
                </div>
              ) : seats.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  No seats found. Add a new seat above.
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Seat Number</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Student</TableHead>
                        <TableHead>Reservation</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="w-[140px] text-right">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentSeats.map((seat) => (
                        <TableRow key={seat._id}>
                          <TableCell className="font-medium">
                            {seat.seatNumber}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                statusColors[seat.status]
                              }
                            >
                              {seat.status
                                .charAt(0)
                                .toUpperCase() +
                                seat.status.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {seat.studentName
                              ? `${seat.studentName}${
                                  seat.studentEmail
                                    ? ` (${seat.studentEmail})`
                                    : ''
                                }`
                              : '—'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {seat.reservedUntil
                              ? `Reserved until ${new Date(
                                  seat.reservedUntil
                                ).toLocaleString()}`
                              : '—'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {seat.notes || '—'}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            {seat.status !== 'available' && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleReleaseSeat(
                                        seat._id,
                                        seat.seatNumber
                                      )
                                    }
                                  >
                                    <RotateCcw className="mr-1 h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>
                                    Mark seat{' '}
                                    {seat.seatNumber} as
                                    available and clear
                                    student details.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() =>
                                    handleDeleteSeat(
                                      seat._id,
                                      seat.seatNumber
                                    )
                                  }
                                >
                                  <Trash2 className="mr-1 h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  Delete this seat
                                  permanently.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination controls */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-t">
                    <div className="text-sm text-muted-foreground">
                      Showing{' '}
                      {(page - 1) * pageSize + 1}–
                      {Math.min(
                        page * pageSize,
                        totalSeats
                      )}{' '}
                      of {totalSeats} seats
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === 1}
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
                        disabled={page >= totalPages}
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
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}