'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  MapPin,
  CalendarDays,
  CreditCard,
  Armchair,
  Loader2,
} from 'lucide-react';
import { toast } from 'react-toastify';

type PaymentStatus = 'paid' | 'unpaid' | 'pending';
type SeatStatus = 'available' | 'reserved' | 'occupied';

interface Seat {
  _id: string;
  seatNumber: number;
  status: SeatStatus;
}

interface Student {
  _id: string;
  name: string;
  email: string;
  phone: string;
  paymentStatus: PaymentStatus;
  membershipStatus: 'active' | 'inactive' | 'expired';
  membershipStartDate?: string;
  membershipEndDate?: string;
  seatNumber?: number | null;
}

const NO_SEAT = '__none__';

export default function AddStudentPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    membershipStartDate: '',
    membershipEndDate: '',
    paymentStatus: 'unpaid' as PaymentStatus,
    address: '',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [availableSeats, setAvailableSeats] = useState<Seat[]>([]);
  const [seatLoading, setSeatLoading] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState<string>(NO_SEAT);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const fetchAvailableSeats = async () => {
    try {
      setSeatLoading(true);
      const res: any = await api.getSeats({ status: 'available' });
      const list = Array.isArray(res.data) ? res.data : res;
      setAvailableSeats(list as Seat[]);
    } catch (error: any) {
      console.error('[AddStudent] seats fetch error:', error);
      toast.error(error.message || 'Failed to load available seats.');
    } finally {
      setSeatLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailableSeats();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.name ||
      !formData.email ||
      !formData.phone ||
      !formData.membershipStartDate ||
      !formData.membershipEndDate
    ) {
      toast.error(
        'Name, email, phone, membership start and end date are required.'
      );
      return;
    }

    // End date start se pehle nahi ho sakti — pehle yeh check nahi tha aur
    // backend membershipStatus isi par calculate karta hai
    if (
      new Date(formData.membershipEndDate) <=
      new Date(formData.membershipStartDate)
    ) {
      toast.error('Membership end date must be after the start date.');
      return;
    }

    setIsLoading(true);

    try {
      const res: any = await api.createStudent(formData);
      const createdStudent: Student = res.data || res;

      if (selectedSeat && selectedSeat !== NO_SEAT) {
        const seatNumber = Number(selectedSeat);
        const seat = availableSeats.find((s) => s.seatNumber === seatNumber);

        if (!seat) {
          toast.error('Selected seat not found in available list.');
        } else {
          try {
            await api.updateSeat(seat._id, {
              status: 'reserved',
              studentId: createdStudent._id,
            });
            toast.success(
              `Student ${createdStudent.name} added and seat ${seatNumber} reserved.`
            );
          } catch (err: any) {
            console.error('[AddStudent] reserve error:', err);
            toast.error(
              err.message || 'Student added, but the seat could not be reserved.'
            );
          }
        }
      } else {
        toast.success(
          `Student ${createdStudent.name} has been added successfully.`
        );
      }

      setFormData({
        name: '',
        email: '',
        phone: '',
        membershipStartDate: '',
        membershipEndDate: '',
        paymentStatus: 'unpaid',
        address: '',
      });
      setSelectedSeat(NO_SEAT);
      fetchAvailableSeats();
    } catch (error: any) {
      console.error('[AddStudent] error:', error);
      toast.error(error.message || 'Something went wrong while adding student.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold">Add Student</h1>
          <p className="text-muted-foreground">
            Add a new student and optionally assign an available seat
          </p>
        </div>

        <Button variant="outline" asChild>
          <Link href="/librarian/students">
            <ArrowLeft className="mr-2 h-4 w-4" />
            All Students
          </Link>
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ---------- Personal details ---------- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4 text-muted-foreground" />
              Personal Details
            </CardTitle>
          </CardHeader>

          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              id="name"
              label="Full Name"
              required
              icon={<User className="h-4 w-4" />}
            >
              <Input
                id="name"
                name="name"
                placeholder="John Doe"
                className="pl-9"
                value={formData.name}
                onChange={handleChange}
                required
                disabled={isLoading}
                autoComplete="name"
              />
            </Field>

            <Field
              id="email"
              label="Email Address"
              required
              icon={<Mail className="h-4 w-4" />}
            >
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="john@example.com"
                className="pl-9"
                value={formData.email}
                onChange={handleChange}
                required
                disabled={isLoading}
                autoComplete="email"
              />
            </Field>

            <Field
              id="phone"
              label="Phone Number"
              required
              icon={<Phone className="h-4 w-4" />}
            >
              <Input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                placeholder="+91 9876543210"
                className="pl-9"
                value={formData.phone}
                onChange={handleChange}
                required
                disabled={isLoading}
                autoComplete="tel"
              />
            </Field>

            <Field
              id="address"
              label="Address"
              icon={<MapPin className="h-4 w-4" />}
            >
              <Input
                id="address"
                name="address"
                placeholder="Full address"
                className="pl-9"
                value={formData.address}
                onChange={handleChange}
                disabled={isLoading}
              />
            </Field>
          </CardContent>
        </Card>

        {/* ---------- Membership ---------- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              Membership
            </CardTitle>
          </CardHeader>

          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="membershipStartDate" label="Start Date" required>
              <Input
                id="membershipStartDate"
                name="membershipStartDate"
                type="date"
                value={formData.membershipStartDate}
                onChange={handleChange}
                required
                disabled={isLoading}
              />
            </Field>

            <Field id="membershipEndDate" label="End Date" required>
              <Input
                id="membershipEndDate"
                name="membershipEndDate"
                type="date"
                min={formData.membershipStartDate || undefined}
                value={formData.membershipEndDate}
                onChange={handleChange}
                required
                disabled={isLoading}
              />
            </Field>

            <Field
              id="paymentStatus"
              label="Payment Status"
              icon={<CreditCard className="h-4 w-4" />}
              hint="Status must be 'Paid' before books can be issued."
            >
              <Select
                value={formData.paymentStatus}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    paymentStatus: value as PaymentStatus,
                  }))
                }
                disabled={isLoading}
              >
                <SelectTrigger id="paymentStatus" className="pl-9">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </CardContent>
        </Card>

        {/* ---------- Seat ---------- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Armchair className="h-4 w-4 text-muted-foreground" />
              Seat Assignment
              <span className="text-xs font-normal text-muted-foreground">
                (optional)
              </span>
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="sm:max-w-sm">
              <Field
                id="seat"
                label="Assign Seat"
                hint={
                  seatLoading
                    ? 'Loading available seats…'
                    : availableSeats.length === 0
                    ? 'No seats are available right now.'
                    : `${availableSeats.length} seat${
                        availableSeats.length === 1 ? '' : 's'
                      } available.`
                }
              >
                <Select
                  value={selectedSeat}
                  onValueChange={setSelectedSeat}
                  disabled={isLoading || seatLoading}
                >
                  <SelectTrigger id="seat">
                    <SelectValue placeholder="Select seat" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SEAT}>No seat</SelectItem>
                    {availableSeats.map((seat) => (
                      <SelectItem key={seat._id} value={String(seat.seatNumber)}>
                        Seat {seat.seatNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </CardContent>
        </Card>

        {/* ---------- Actions — mobile par full width, desktop par right ---------- */}
        <Separator />

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            asChild
            disabled={isLoading}
            className="sm:w-auto"
          >
            <Link href="/librarian/students">Cancel</Link>
          </Button>

          <Button type="submit" disabled={isLoading} className="sm:w-auto">
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLoading ? 'Saving…' : 'Add Student'}
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Label + optional leading icon + hint ka consistent wrapper. */
function Field({
  id,
  label,
  required,
  icon,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  icon?: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>

      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground">
            {icon}
          </span>
        )}
        {children}
      </div>

      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
