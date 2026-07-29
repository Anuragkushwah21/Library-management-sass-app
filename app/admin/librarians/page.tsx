'use client';

import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Search,
  MoreVertical,
  Mail,
  Phone,
  Calendar,
  Loader2,
  Trash2,
  Edit,
  UserCheck,
  MailCheck,
  UserX,
  Filter,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'react-toastify';

interface Librarian {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  createdAt: string;
  isApproved: boolean;
  isVerified: boolean;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  status?: string; // 'active' | 'inactive'
}

export default function AllLibrariansPage() {
  const [librarians, setLibrarians] = useState<Librarian[]>([]);
  const [filteredLibrarians, setFilteredLibrarians] = useState<Librarian[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    librarianId: string | null;
  }>({
    open: false,
    librarianId: null,
  });

  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    librarian: Librarian | null;
  }>({
    open: false,
    librarian: null,
  });

  const [editForm, setEditForm] = useState<{
    name: string;
    email: string;
    phone: string;
    status: string;
  }>({
    name: '',
    email: '',
    phone: '',
    status: 'active',
  });

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // reject dialog state
  const [rejectDialog, setRejectDialog] = useState<{
    open: boolean;
    librarian: Librarian | null;
    reason: string;
  }>({
    open: false,
    librarian: null,
    reason: '',
  });

  useEffect(() => {
    fetchLibrarians();
  }, []);

  useEffect(() => {
    filterLibrarians();
  }, [searchQuery, statusFilter, librarians]);

  const fetchLibrarians = async () => {
    try {
      const response = await api.getAllLibrarians();
      setLibrarians(response.data);
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch librarians');
    } finally {
      setIsLoading(false);
    }
  };

  const filterLibrarians = () => {
    let filtered = [...librarians];

    if (searchQuery) {
      filtered = filtered.filter(
        (lib) =>
          lib.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          lib.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          lib.phone?.includes(searchQuery)
      );
    }

    if (statusFilter !== 'all') {
      if (statusFilter === 'approved') {
        filtered = filtered.filter((lib) => lib.isApproved && !lib.rejectedAt);
      } else if (statusFilter === 'pending') {
        filtered = filtered.filter((lib) => !lib.isApproved && !lib.rejectedAt);
      } else if (statusFilter === 'rejected') {
        filtered = filtered.filter((lib) => lib.rejectedAt);
      }
    }

    setFilteredLibrarians(filtered);
  };

  const openEditDialog = (librarian: Librarian) => {
    setEditForm({
      name: librarian.name || '',
      email: librarian.email || '',
      phone: librarian.phone || '',
      status: librarian.status || 'active',
    });
    setEditDialog({ open: true, librarian });
  };

  const handleEditChange = (
    field: keyof typeof editForm,
    value: string
  ) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveEdit = async () => {
    if (!editDialog.librarian) return;
    const id = editDialog.librarian._id;

    try {
      setIsSavingEdit(true);

      await api.updateLibrarian(id, {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone,
        status: editForm.status,
      });

      toast.success('Librarian updated successfully.');

      setLibrarians((prev) =>
        prev.map((l) =>
          l._id === id
            ? {
                ...l,
                name: editForm.name,
                email: editForm.email,
                phone: editForm.phone,
                status: editForm.status,
              }
            : l
        )
      );

      setEditDialog({ open: false, librarian: null });
    } catch (error: any) {
      toast.error(error.message || 'Failed to update librarian');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.librarianId) return;

    setActionLoading(deleteDialog.librarianId);
    try {
      await api.deleteLibrarian(deleteDialog.librarianId);

      toast.success('Librarian deleted successfully.');

      setLibrarians((prev) =>
        prev.filter((l) => l._id !== deleteDialog.librarianId)
      );

      setDeleteDialog({ open: false, librarianId: null });
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete librarian');
    } finally {
      setActionLoading(null);
    }
  };

  // Approve librarian (including re-approving previously rejected)
  /**
   * Email delivery fail ho jaye (spam, provider block) to librarian hamesha ke
   * liye atak jaata hai — kyunki approve karne ke liye isVerified chahiye.
   * Ye escape hatch admin ko us deadlock se nikalne deta hai.
   */
  const handleManualVerify = async (librarian: Librarian) => {
    const id = librarian._id;

    const ok = window.confirm(
      `Mark ${librarian.name} (${librarian.email}) as email-verified?\n\n` +
        `Only do this once you have confirmed by another means — a call or ` +
        `in person — that this email really belongs to them.`
    );
    if (!ok) return;

    try {
      setActionLoading(id);

      const res = await fetch(`/api/admin/librarians/${id}/verify`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Could not verify');

      toast.success(json.message || 'Email marked as verified.');

      setLibrarians((prev) =>
        prev.map((l) => (l._id === id ? { ...l, isVerified: true } : l))
      );
    } catch (error: any) {
      toast.error(error.message || 'Failed to verify email.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = async (librarian: Librarian) => {
    const id = librarian._id;
    try {
      setActionLoading(id);
      await api.updateLibrarian(id, {
        isApproved: true,
        rejectionReason: '',
      });

      toast.success('Librarian approved successfully.');

      const now = new Date().toISOString();

      setLibrarians((prev) =>
        prev.map((l) =>
          l._id === id
            ? {
                ...l,
                isApproved: true,
                approvedAt: now,
                rejectedAt: undefined,
                rejectionReason: undefined,
              }
            : l
        )
      );
    } catch (error: any) {
      toast.error(error.message || 'Failed to approve librarian');
    } finally {
      setActionLoading(null);
    }
  };

  // Open reject dialog
  const openRejectDialog = (librarian: Librarian) => {
    setRejectDialog({
      open: true,
      librarian,
      reason: librarian.rejectionReason || '',
    });
  };

  // Submit reject action
  const handleRejectSubmit = async () => {
    if (!rejectDialog.librarian) return;
    const id = rejectDialog.librarian._id;

    if (!rejectDialog.reason.trim()) {
      toast.error('Please enter a rejection reason.');
      return;
    }

    try {
      setActionLoading(id);
      await api.updateLibrarian(id, {
        isApproved: false,
        rejectionReason: rejectDialog.reason.trim(),
      });

      toast.success('Librarian rejected.');

      const now = new Date().toISOString();

      setLibrarians((prev) =>
        prev.map((l) =>
          l._id === id
            ? {
                ...l,
                isApproved: false,
                rejectedAt: now,
                rejectionReason: rejectDialog.reason.trim(),
              }
            : l
        )
      );

      setRejectDialog({ open: false, librarian: null, reason: '' });
    } catch (error: any) {
      toast.error(error.message || 'Failed to reject librarian');
    } finally {
      setActionLoading(null);
    }
  };

  // Approval status badge (Approved/Pending/Rejected)
  const getApprovalStatusBadge = (librarian: Librarian) => {
    if (librarian.rejectedAt) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="destructive" className="flex items-center gap-1">
              <UserX className="w-3 h-3" />
              Rejected
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p>
              {librarian.rejectionReason
                ? `Reason: ${librarian.rejectionReason}`
                : 'Rejected'}
            </p>
          </TooltipContent>
        </Tooltip>
      );
    }
    if (librarian.isApproved) {
      return (
        <Badge variant="default" className="bg-green-600 flex items-center gap-1">
          <UserCheck className="w-3 h-3" />
          Approved
        </Badge>
      );
    }
    return <Badge variant="secondary">Pending</Badge>;
  };

  // Account status badge (Active/Inactive)
  const getAccountStatusBadge = (librarian: Librarian) => {
    const status = (librarian.status || 'active').toLowerCase();

    if (status === 'inactive') {
      return (
        <Badge variant="outline" className="border-red-500 text-red-600">
          Inactive
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="border-green-500 text-green-600">
        Active
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle>All Librarians</CardTitle>
              <CardDescription>
                Manage all registered librarians in the system
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-base px-3 py-1">
                Total: {librarians.length}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredLibrarians.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <UserCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No librarians found</p>
            </div>
          ) : (
            <div className="border rounded-lg">
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
                  {filteredLibrarians.map((librarian) => (
                    <TableRow key={librarian._id}>
                      <TableCell className="font-medium">
                        <div>
                          <p>{librarian.name}</p>
                          {!librarian.isVerified && (
                            <Badge variant="outline" className="mt-1 text-xs">
                              Unverified Email
                            </Badge>
                          )}
                        </div>
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
                        <div className="flex flex-col gap-1">
                          {getApprovalStatusBadge(librarian)}
                          {getAccountStatusBadge(librarian)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            {formatDistanceToNow(
                              new Date(librarian.createdAt),
                              {
                                addSuffix: true,
                              }
                            )}
                          </div>
                          {librarian.approvedAt && (
                            <div className="flex items-center gap-2 text-green-600 text-xs">
                              <UserCheck className="w-3 h-3" />
                              Approved{' '}
                              {formatDistanceToNow(
                                new Date(librarian.approvedAt),
                                {
                                  addSuffix: true,
                                }
                              )}
                            </div>
                          )}
                          {librarian.rejectedAt && (
                            <div className="flex items-center gap-2 text-red-600 text-xs">
                              <UserX className="w-3 h-3" />
                              Rejected
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>More actions</p>
                            </TooltipContent>
                          </Tooltip>

                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />

                            {/* Email verify nahi hui — approve tab tak nahi ho
                                sakta. OTP na pahunche to admin manually
                                verify kar sakta hai. */}
                            {!librarian.isVerified && (
                              <>
                                <DropdownMenuItem
                                  disabled={actionLoading === librarian._id}
                                  onClick={() => handleManualVerify(librarian)}
                                >
                                  <MailCheck className="w-4 h-4 mr-2 text-blue-600" />
                                  Mark email verified
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}

                            {/* Approve / Re-approve */}
                            {!librarian.isApproved && (
                              <DropdownMenuItem
                                disabled={actionLoading === librarian._id}
                                onClick={() => handleApprove(librarian)}
                              >
                                <UserCheck className="w-4 h-4 mr-2 text-green-600" />
                                Approve
                              </DropdownMenuItem>
                            )}
                            {librarian.rejectedAt && librarian.isApproved && (
                              <DropdownMenuItem
                                disabled={actionLoading === librarian._id}
                                onClick={() => handleApprove(librarian)}
                              >
                                <UserCheck className="w-4 h-4 mr-2 text-green-600" />
                                Re-approve
                              </DropdownMenuItem>
                            )}

                            {/* Reject */}
                            <DropdownMenuItem
                              disabled={actionLoading === librarian._id}
                              onClick={() => openRejectDialog(librarian)}
                            >
                              <UserX className="w-4 h-4 mr-2 text-red-600" />
                              Reject
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                              onClick={() => openEditDialog(librarian)}
                            >
                              <Edit className="w-4 h-4 mr-2" />
                              Edit Details
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Mail className="w-4 h-4 mr-2" />
                              Send Email
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <DropdownMenuItem
                                  className="text-destructive"
                                  disabled={actionLoading === librarian._id}
                                  onClick={() =>
                                    setDeleteDialog({
                                      open: true,
                                      librarianId: librarian._id,
                                    })
                                  }
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Permanently delete this librarian</p>
                              </TooltipContent>
                            </Tooltip>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.open}
        onOpenChange={(open) =>
          setDeleteDialog((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Librarian</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this librarian? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setDeleteDialog({ open: false, librarianId: null })
              }
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!!actionLoading}
            >
              {actionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Librarian Dialog */}
      <Dialog
        open={editDialog.open}
        onOpenChange={(open) =>
          setEditDialog((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Librarian</DialogTitle>
            <DialogDescription>
              Update the librarian&apos;s details and save the changes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={editForm.name}
                onChange={(e) => handleEditChange('name', e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => handleEditChange('email', e.target.value)}
                placeholder="email@example.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Phone</label>
              <Input
                value={editForm.phone}
                onChange={(e) => handleEditChange('phone', e.target.value)}
                placeholder="Phone number"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Account Status</label>
              <Select
                value={editForm.status}
                onValueChange={(value) => handleEditChange('status', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialog({ open: false, librarian: null })}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSavingEdit}>
              {isSavingEdit && (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Librarian Dialog */}
      <Dialog
        open={rejectDialog.open}
        onOpenChange={(open) =>
          setRejectDialog((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Librarian</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this librarian. They can be
              approved again later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Rejection Reason</label>
            <Input
              placeholder="Reason for rejection"
              value={rejectDialog.reason}
              onChange={(e) =>
                setRejectDialog((prev) => ({
                  ...prev,
                  reason: e.target.value,
                }))
              }
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setRejectDialog({ open: false, librarian: null, reason: '' })
              }
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectSubmit}
              disabled={!!actionLoading}
            >
              {actionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <UserX className="w-4 h-4 mr-2" />
              )}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}