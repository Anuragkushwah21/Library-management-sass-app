'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDuration, formatPrice } from '@/lib/plan-format';
import { Check, X, Mail, Phone, Calendar, Loader2, UserCheck, MessageSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface Librarian {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  createdAt: string;
  isApproved: boolean;
  isVerified: boolean;
  approvalRequestedAt?: string;
  approvalRequestNote?: string;
  trialEndsAt?: string;
  planExpiresAt?: string | null;
  requestedPlan?: PlanSummary | null;
}

interface PlanSummary {
  _id: string;
  name: string;
  price: number;
  currency: string;
  durationDays: number;
  isActive?: boolean;
}

// Radix Select can't hold an empty string as a value
const NO_PLAN = 'none';

export default function PendingLibrariansPage() {
  const { toast } = useToast();
  const [librarians, setLibrarians] = useState<Librarian[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [approveDialog, setApproveDialog] = useState<{
    librarian: Librarian | null;
    planId: string;
  }>({ librarian: null, planId: NO_PLAN });
  const [rejectDialog, setRejectDialog] = useState<{
    open: boolean;
    librarianId: string | null;
    reason: string;
  }>({
    open: false,
    librarianId: null,
    reason: '',
  });

  useEffect(() => {
    fetchPendingLibrarians();
    api
      .getAdminPlans()
      .then((res) => setPlans(res.data || []))
      .catch(() => setPlans([]));
  }, []);

  const fetchPendingLibrarians = async () => {
    try {
      const response = await api.getPendingLibrarians();
      setLibrarians(response.data);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch pending librarians',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const openApprove = (librarian: Librarian) => {
    setApproveDialog({
      librarian,
      planId: librarian.requestedPlan?._id ?? NO_PLAN,
    });
  };

  const handleApprove = async () => {
    const librarianId = approveDialog.librarian?._id;
    if (!librarianId) return;
    setActionLoading(librarianId);
    try {
      await api.approveLibrarian(
        librarianId,
        approveDialog.planId === NO_PLAN ? null : approveDialog.planId
      );
      setApproveDialog({ librarian: null, planId: NO_PLAN });

      toast({
        title: 'Librarian Approved',
        description: 'The librarian has been successfully approved',
      });

      // Remove from list
      setLibrarians((prev) => prev.filter((l) => l._id !== librarianId));
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve librarian',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectDialog.librarianId) return;

    setActionLoading(rejectDialog.librarianId);
    try {
      await api.rejectLibrarian(
        rejectDialog.librarianId,
        rejectDialog.reason || 'No reason provided'
      );

      toast({
        title: 'Librarian Rejected',
        description: 'The librarian application has been rejected',
      });

      // Remove from list
      setLibrarians((prev) =>
        prev.filter((l) => l._id !== rejectDialog.librarianId)
      );

      // Close dialog
      setRejectDialog({ open: false, librarianId: null, reason: '' });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to reject librarian',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Pending Approvals</CardTitle>
          <CardDescription>
            Librarians who sent an approval request from their dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          {librarians.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <UserCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No pending approvals</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Requested plan</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {librarians.map((librarian) => (
                  <TableRow key={librarian._id}>
                    <TableCell className="font-medium">
                      {librarian.name}
                      {librarian.approvalRequestNote && (
                        <p className="mt-1 flex max-w-xs items-start gap-1.5 text-xs font-normal text-muted-foreground">
                          <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" />
                          <span className="line-clamp-3">{librarian.approvalRequestNote}</span>
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="w-3 h-3 text-muted-foreground" />
                          {librarian.email}
                        </div>
                        {librarian.phone && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="w-3 h-3" />
                            {librarian.phone}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {librarian.requestedPlan ? (
                        <div className="text-sm">
                          <div className="font-medium">{librarian.requestedPlan.name}</div>
                          <div className="text-muted-foreground">
                            {formatPrice(librarian.requestedPlan.price, librarian.requestedPlan.currency)}
                            {' / '}
                            {formatDuration(librarian.requestedPlan.durationDays)}
                          </div>
                        </div>
                      ) : (
                        <Badge variant="secondary">No plan</Badge>
                      )}
                      {librarian.planExpiresAt && (
                        <Badge variant="outline" className="mt-1">Renewal</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {formatDistanceToNow(
                          new Date(librarian.approvalRequestedAt || librarian.createdAt),
                          { addSuffix: true }
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => openApprove(librarian)}
                          disabled={actionLoading === librarian._id}
                        >
                          {actionLoading === librarian._id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Check className="w-4 h-4 mr-1" />
                              Approve
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            setRejectDialog({
                              open: true,
                              librarianId: librarian._id,
                              reason: '',
                            })
                          }
                          disabled={actionLoading === librarian._id}
                        >
                          <X className="w-4 h-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Approve Dialog — admin confirms or changes the plan */}
      <Dialog
        open={!!approveDialog.librarian}
        onOpenChange={(open) =>
          !open && setApproveDialog({ librarian: null, planId: NO_PLAN })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve {approveDialog.librarian?.name}</DialogTitle>
            <DialogDescription>
              Access runs for the plan&apos;s duration, starting today.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Plan</Label>
            <Select
              value={approveDialog.planId}
              onValueChange={(planId) =>
                setApproveDialog((prev) => ({ ...prev, planId }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PLAN}>No plan — no expiry</SelectItem>
                {plans.map((plan) => (
                  <SelectItem key={plan._id} value={plan._id}>
                    {plan.name} · {formatPrice(plan.price, plan.currency)} /{' '}
                    {formatDuration(plan.durationDays)}
                    {plan.isActive === false ? ' (hidden)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setApproveDialog({ librarian: null, planId: NO_PLAN })}
            >
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={!!actionLoading}>
              {actionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog
        open={rejectDialog.open}
        onOpenChange={(open) =>
          setRejectDialog((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Librarian Application</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this application
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for rejection</Label>
              <Textarea
                id="reason"
                placeholder="Enter rejection reason..."
                value={rejectDialog.reason}
                onChange={(e) =>
                  setRejectDialog((prev) => ({
                    ...prev,
                    reason: e.target.value,
                  }))
                }
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setRejectDialog({ open: false, librarianId: null, reason: '' })
              }
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!!actionLoading}
            >
              {actionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Reject Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}