'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, Save, ShieldBan, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { minForExisting } from '@/lib/date-rules';
import { formatTime } from '@/lib/time';

interface Shift {
  _id: string;
  name: string;
  startTime: string;
  endTime: string;
  isActive?: boolean;
}
interface SeatRow {
  _id: string;
  seatNumber: number;
  status: string;
  studentId?: string | null;
}

const day = (v?: string | null) => (v ? String(v).slice(0, 10) : '');
const STATUS_LABEL: Record<string, string> = {
  ACTIVE_MEMBER: 'Active member',
  EXPIRED: 'Expired',
  DEMO: 'Demo',
  DEMO_ENDED: 'Demo ended',
  BLOCKED: 'Blocked',
};

/** View and edit everything about one student; delete from here too. */
export function StudentEditDialog({
  studentId,
  onClose,
  onSaved,
}: {
  studentId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [student, setStudent] = useState<any>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', shiftId: '', seat: '', start: '', end: '' });
  const [busy, setBusy] = useState<'save' | 'delete' | 'block' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) return;
    setStudent(null);
    setError(null);
    setConfirmDelete(false);
    Promise.all([api.getStudent(studentId), api.getShifts().catch(() => ({ data: [] })), api.getSeats().catch(() => ({ data: [] }))])
      .then(([st, sh, se]: any[]) => {
        const s = st.data;
        setStudent(s);
        setShifts((sh.data ?? []).filter((x: Shift) => x.isActive !== false || String(x._id) === String(s.shiftId)));
        setSeats(Array.isArray(se.data) ? se.data : []);
        setForm({
          name: s.name ?? '',
          email: s.email ?? '',
          phone: s.phoneRaw || s.phone || '',
          address: s.address ?? '',
          shiftId: s.shiftId ? String(s.shiftId) : '',
          seat: s.seatNumber ? String(s.seatNumber) : '',
          start: day(s.membershipStartDate),
          end: day(s.membershipEndDate),
        });
      })
      .catch((err) => {
        toast.error(err.message || 'Could not load the student.');
        onClose();
      });
  }, [studentId, onClose]);

  // Seats this student can take: free ones plus their own
  const seatOptions = seats
    .filter((s) => s.status === 'available' || (student && (String(s.studentId) === String(student._id) || s.seatNumber === student.seatNumber)))
    .sort((a, b) => a.seatNumber - b.seatNumber);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student) return;
    if (form.name.trim().length < 2) return setError('Enter the student’s full name.');
    if (!form.phone.trim()) return setError('Phone number is required.');
    if (form.start && form.end && form.end <= form.start) return setError('End date must be after the start date.');
    setError(null);

    // Send only what changed — an untouched seat or date is never rewritten
    const payload: Record<string, any> = {};
    if (form.name.trim() !== student.name) payload.name = form.name.trim();
    if (form.email.trim().toLowerCase() !== (student.email ?? '')) payload.email = form.email.trim();
    if (form.phone.trim() !== (student.phoneRaw || student.phone)) payload.phone = form.phone.trim();
    if (form.address.trim() !== (student.address ?? '')) payload.address = form.address.trim();
    if (form.shiftId && form.shiftId !== String(student.shiftId ?? '')) payload.shiftId = form.shiftId;
    if (form.start !== day(student.membershipStartDate)) payload.membershipStartDate = form.start || null;
    if (form.end !== day(student.membershipEndDate)) payload.membershipEndDate = form.end || null;
    if (form.seat !== (student.seatNumber ? String(student.seatNumber) : '')) payload.seatNumber = form.seat ? Number(form.seat) : null;

    if (Object.keys(payload).length === 0) {
      toast.info('Nothing changed.');
      return;
    }
    setBusy('save');
    try {
      await api.updateStudent(student._id, payload);
      toast.success(`${form.name.trim()} updated.`);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const toggleBlock = async () => {
    if (!student) return;
    const block = student.status !== 'BLOCKED';
    setBusy('block');
    try {
      await api.updateStudent(student._id, { blocked: block });
      toast.success(block ? `${student.name} blocked — QR check-in is refused.` : `${student.name} unblocked.`);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!student) return;
    setBusy('delete');
    try {
      await api.deleteStudent(student._id);
      toast.success(`${student.name} has been removed.`);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <Dialog open={!!studentId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        {!student ? (
          <div className="flex justify-center py-12">
            <DialogTitle className="sr-only">Loading student</DialogTitle>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : confirmDelete ? (
          <>
            <DialogHeader>
              <DialogTitle>Delete {student.name}?</DialogTitle>
              <DialogDescription>
                The student is removed from your lists and their seat{student.seatNumber ? ` (Seat ${student.seatNumber})` : ''} is freed. Use this for a wrong
                entry or someone who has left for good — to keep their history, mark the membership as expired instead.
              </DialogDescription>
            </DialogHeader>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={remove} disabled={busy === 'delete'}>
                {busy === 'delete' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete student
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {student.name}
                <Badge variant={student.status === 'BLOCKED' ? 'destructive' : 'secondary'}>{STATUS_LABEL[student.status] ?? student.status}</Badge>
              </DialogTitle>
              <DialogDescription>
                Added {student.createdAt ? format(new Date(student.createdAt), 'd MMM yyyy') : '—'}
                {student.registrationSource ? ` · via ${String(student.registrationSource).toLowerCase()}` : ''}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={save} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="se-name">Full name *</Label>
                  <Input id="se-name" value={form.name} onChange={set('name')} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="se-phone">Phone *</Label>
                  <Input id="se-phone" type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="se-email">Email</Label>
                  <Input id="se-email" type="email" value={form.email} onChange={set('email')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="se-address">Address</Label>
                  <Input id="se-address" value={form.address} onChange={set('address')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="se-shift">Shift</Label>
                  <select id="se-shift" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.shiftId} onChange={set('shiftId')}>
                    {!form.shiftId && <option value="">No shift</option>}
                    {shifts.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name} ({formatTime(s.startTime)}–{formatTime(s.endTime)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="se-seat">Seat</Label>
                  <select id="se-seat" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.seat} onChange={set('seat')}>
                    <option value="">No seat</option>
                    {seatOptions.map((s) => (
                      <option key={s._id} value={s.seatNumber}>
                        Seat {s.seatNumber}
                        {String(s.seatNumber) === String(student.seatNumber ?? '') ? ' (current)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {['ACTIVE_MEMBER', 'EXPIRED', 'BLOCKED'].includes(student.status) && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="se-start">Membership start</Label>
                      <Input id="se-start" type="date" value={form.start} onChange={set('start')} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="se-end">Membership end</Label>
                      <Input id="se-end" type="date" min={minForExisting(day(student.membershipEndDate))} value={form.end} onChange={set('end')} />
                    </div>
                  </>
                )}
              </div>

              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center">
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="mr-1.5 h-4 w-4" /> Delete
                  </Button>
                  <Button type="button" variant="ghost" onClick={toggleBlock} disabled={busy === 'block'}>
                    {student.status === 'BLOCKED' ? <ShieldCheck className="mr-1.5 h-4 w-4" /> : <ShieldBan className="mr-1.5 h-4 w-4" />}
                    {student.status === 'BLOCKED' ? 'Unblock' : 'Block'}
                  </Button>
                </div>
                <div className="flex gap-2 sm:ml-auto">
                  <Button type="button" variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={busy === 'save'}>
                    {busy === 'save' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                    Save changes
                  </Button>
                </div>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
