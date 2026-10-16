'use client';

import { todayInput } from '@/lib/date-rules';
import { formatTime } from '@/lib/time';
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
  Clock,
  Armchair,
  Loader2,
  IndianRupee,
  Printer,
  CheckCircle2,
} from 'lucide-react';
import { addDays, addMonths, format } from 'date-fns';
import { openReceipt } from '@/components/librarian/fees-dialog';
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

const PLANS = [
  { key: 'monthly', label: 'Monthly', months: 1 },
  { key: 'quarterly', label: 'Quarterly', months: 3 },
  { key: 'yearly', label: 'Yearly', months: 12 },
  { key: 'custom', label: 'Custom', months: 0 },
] as const;
type PlanKey = (typeof PLANS)[number]['key'];

const METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
] as const;

/** Inclusive end: 1 month from 16 Oct ends 15 Nov. */
const planEnd = (start: string, months: number) =>
  format(addDays(addMonths(new Date(`${start}T00:00:00`), months), -1), 'yyyy-MM-dd');
const newRequestId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export default function AddStudentPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    membershipStartDate: todayInput(),
    membershipEndDate: planEnd(todayInput(), 1),
    address: '',
    shiftId: '',
  });
  // Joining fee — recorded with the member, receipt generated when anything is paid
  const [plan, setPlan] = useState<PlanKey>('monthly');
  const [fee, setFee] = useState('');
  const [paid, setPaid] = useState('');
  const [method, setMethod] = useState<(typeof METHODS)[number]['value']>('CASH');
  const [reference, setReference] = useState('');
  const [requestId, setRequestId] = useState(newRequestId);
  const [added, setAdded] = useState<{ name: string; paymentId: string | null; receipt: string | null; paid: number; due: number } | null>(null);

  const feeNum = Number(fee || 0);
  const paidNum = paid === '' ? feeNum : Number(paid);
  const due = Math.max(0, feeNum - paidNum);

  const choosePlan = (key: PlanKey) => {
    setPlan(key);
    const p = PLANS.find((x) => x.key === key)!;
    if (p.months && formData.membershipStartDate) {
      setFormData((prev) => ({ ...prev, membershipEndDate: planEnd(prev.membershipStartDate, p.months) }));
    }
  };
  const [shifts, setShifts] = useState<{ _id: string; name: string; startTime: string; endTime: string }[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [availableSeats, setAvailableSeats] = useState<Seat[]>([]);
  const [seatLoading, setSeatLoading] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState<string>(NO_SEAT);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      // Start date moves the end date along with the chosen plan
      const p = PLANS.find((x) => x.key === plan)!;
      if (name === 'membershipStartDate' && value && p.months) next.membershipEndDate = planEnd(value, p.months);
      return next;
    });
    if (name === 'membershipEndDate') setPlan('custom');
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
    // Attendance is per shift; default to the first active one
    api
      .getShifts()
      .then((res: any) => {
        const active = (res.data || []).filter((s: any) => s.isActive);
        setShifts(active);
        if (active[0]) setFormData((prev) => (prev.shiftId ? prev : { ...prev, shiftId: active[0]._id }));
      })
      .catch(() => setShifts([]));
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

    if (formData.membershipEndDate < todayInput()) {
      toast.error('Membership end date cannot be in the past.');
      return;
    }

    if (!fee || !Number.isInteger(feeNum) || feeNum <= 0) {
      toast.error('Enter the total fee in whole rupees.');
      return;
    }
    if (!Number.isInteger(paidNum) || paidNum < 0 || paidNum > feeNum) {
      toast.error('Paid amount must be a whole number, not more than the fee.');
      return;
    }

    setIsLoading(true);

    try {
      const res: any = await api.createStudent({
        ...formData,
        planName: PLANS.find((p) => p.key === plan)!.label,
        fee: feeNum,
        paidAmount: paidNum,
        method,
        reference: reference.trim() || undefined,
        requestId,
      });
      const createdStudent: Student = res.data || res;
      setAdded({
        name: createdStudent.name,
        paymentId: res.payment?._id ?? null,
        receipt: res.payment?.receiptNumber ?? null,
        paid: paidNum,
        due,
      });

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
        membershipStartDate: todayInput(),
        membershipEndDate: planEnd(todayInput(), PLANS.find((p) => p.key === plan)!.months || 1),
        address: '',
        // Keep the shift — the next student is usually on the same one
        shiftId: formData.shiftId,
      });
      if (plan === 'custom') setPlan('monthly');
      setFee('');
      setPaid('');
      setReference('');
      setRequestId(newRequestId());
      window.scrollTo({ top: 0, behavior: 'smooth' });
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

      {added && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          <p className="min-w-0 flex-1">
            <strong>{added.name}</strong> added.{' '}
            {added.receipt ? `Receipt ${added.receipt} · paid ${rupees(added.paid)}` : 'No payment taken yet'}
            {added.due > 0 ? ` · ${rupees(added.due)} due` : ' · fully paid'}
          </p>
          {added.paymentId && (
            <Button size="sm" variant="outline" type="button" onClick={() => openReceipt(added.paymentId!)}>
              <Printer className="mr-1.5 h-4 w-4" /> Print receipt
            </Button>
          )}
        </div>
      )}

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
            <div className="space-y-2 sm:col-span-2">
              <Label className="text-sm font-medium">Plan</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PLANS.map((p) => (
                  <Button key={p.key} type="button" size="sm" variant={plan === p.key ? 'default' : 'outline'} onClick={() => choosePlan(p.key)} disabled={isLoading}>
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>

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
                // End can't be before the start or before today (past start is fine for existing members)
                min={
                  formData.membershipStartDate && formData.membershipStartDate > todayInput()
                    ? formData.membershipStartDate
                    : todayInput()
                }
                value={formData.membershipEndDate}
                onChange={handleChange}
                required
                disabled={isLoading}
              />
            </Field>

            <Field
              id="shiftId"
              label="Shift"
              icon={<Clock className="h-4 w-4" />}
              hint="Used for QR attendance and late marking."
            >
              <Select
                value={formData.shiftId}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, shiftId: value }))}
                disabled={isLoading || shifts.length === 0}
              >
                <SelectTrigger id="shiftId" className="pl-9">
                  <SelectValue placeholder={shifts.length ? 'Select shift' : 'No shifts yet'} />
                </SelectTrigger>
                <SelectContent>
                  {shifts.map((sh) => (
                    <SelectItem key={sh._id} value={sh._id}>
                      {sh.name} ({formatTime(sh.startTime)}–{formatTime(sh.endTime)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </CardContent>
        </Card>

        {/* ---------- Fee ---------- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <IndianRupee className="h-4 w-4 text-muted-foreground" />
              Fee
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="fee" label="Total fee (₹)" required>
              <Input id="fee" type="number" inputMode="numeric" min={1} step={1} placeholder="e.g. 800" value={fee} onChange={(e) => setFee(e.target.value)} required disabled={isLoading} />
            </Field>
            <Field id="paid" label="Paid now (₹)" hint="Leave empty if the full fee is paid. Enter 0 if nothing is paid yet.">
              <Input id="paid" type="number" inputMode="numeric" min={0} step={1} placeholder={fee || '0'} value={paid} onChange={(e) => setPaid(e.target.value)} disabled={isLoading} />
            </Field>
            <Field id="method" label="Payment method">
              <Select value={method} onValueChange={(v) => setMethod(v as any)} disabled={isLoading || paidNum === 0}>
                <SelectTrigger id="method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="reference" label="Reference (optional)">
              <Input id="reference" placeholder="UPI / txn ID" value={reference} onChange={(e) => setReference(e.target.value)} disabled={isLoading || paidNum === 0} />
            </Field>
            {fee && feeNum > 0 && (
              <p
                className={
                  'rounded-md px-3 py-2 text-sm sm:col-span-2 ' +
                  (due > 0 ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300' : 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300')
                }
              >
                {paidNum === 0
                  ? `Nothing paid now — ${rupees(feeNum)} will be due. Collect it later from Students → Fees Due.`
                  : due > 0
                  ? `Paid ${rupees(paidNum)} now — ${rupees(due)} will stay due. A receipt is generated.`
                  : `Fully paid — a receipt for ${rupees(feeNum)} is generated.`}
              </p>
            )}
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
