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
import { Check, X, Mail, Phone, Calendar, Loader2, UserCheck } from 'lucide-react';
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
}

export default function PendingLibrariansPage() {
  const { toast } = useToast();
  const [librarians, setLibrarians] = useState<Librarian[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
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

  const handleApprove = async (librarianId: string) => {
    setActionLoading(librarianId);
    try {
      await api.approveLibrarian(librarianId);
      
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
            Review and approve or reject librarian applications
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
                  <TableHead>Status</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {librarians.map((librarian) => (
                  <TableRow key={librarian._id}>
                    <TableCell className="font-medium">
                      {librarian.name}
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
                      <Badge variant={librarian.isVerified ? 'default' : 'secondary'}>
                        {librarian.isVerified ? 'Verified' : 'Unverified'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {formatDistanceToNow(new Date(librarian.createdAt), {
                          addSuffix: true,
                        })}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleApprove(librarian._id)}
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