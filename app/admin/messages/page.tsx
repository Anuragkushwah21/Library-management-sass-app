'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Mail,
  User,
  MessageSquare,
  Calendar,
  Loader2,
  CheckCircle2,
  Clock,
  CircleDot,
  RefreshCw,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'react-toastify';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type MessageStatus = 'open' | 'in_progress' | 'resolved';

interface AdminMessage {
  _id: string;
  librarianId?: string | null;
  name: string;
  email: string;
  subject?: string;
  message: string;
  status: MessageStatus;
  createdAt: string;
  updatedAt: string;
}

export default function AdminMessagesPage() {
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [filteredMessages, setFilteredMessages] = useState<AdminMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | MessageStatus>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchMessages();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [messages, statusFilter, search]);

  const fetchMessages = async () => {
    try {
      setIsLoading(true);
      const res = await api.getMessages();
      // API returns { success, data }
      setMessages(res.data || []);
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch messages');
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    let data = [...messages];

    if (statusFilter !== 'all') {
      data = data.filter((m) => m.status === statusFilter);
    }

    if (search) {
      const q = search.toLowerCase();
      data = data.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          (m.subject || '').toLowerCase().includes(q) ||
          m.message.toLowerCase().includes(q)
      );
    }

    setFilteredMessages(data);
  };

  const handleStatusChange = async (
    message: AdminMessage,
    status: MessageStatus
  ) => {
    try {
      setActionLoadingId(message._id);
      await api.updateMessageStatus(message._id, status);

      toast.success(`Message marked as ${status.replace('_', ' ')}.`);

      setMessages((prev) =>
        prev.map((m) =>
          m._id === message._id ? { ...m, status, updatedAt: new Date().toISOString() } : m
        )
      );
    } catch (error: any) {
      toast.error(error.message || 'Failed to update status');
    } finally {
      setActionLoadingId(null);
    }
  };

  const getStatusBadge = (status: MessageStatus) => {
    switch (status) {
      case 'open':
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <CircleDot className="w-3 h-3" />
            Open
          </Badge>
        );
      case 'in_progress':
        return (
          <Badge variant="outline" className="flex items-center gap-1 border-amber-500 text-amber-600">
            <Clock className="w-3 h-3" />
            In progress
          </Badge>
        );
      case 'resolved':
        return (
          <Badge variant="outline" className="flex items-center gap-1 border-green-500 text-green-600">
            <CheckCircle2 className="w-3 h-3" />
            Resolved
          </Badge>
        );
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
    <TooltipProvider>
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-primary" />
                Messages from Librarians
              </CardTitle>
              <CardDescription>
                View and respond to queries and messages sent by librarians.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="px-3 py-1">
                Total: {messages.length}
              </Badge>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={fetchMessages}
                    disabled={isLoading}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Refresh messages</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <div className="relative flex-1">
                <Input
                  placeholder="Search by name, email, subject or message..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(val: 'all' | MessageStatus) => setStatusFilter(val)}
              >
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filteredMessages.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-60" />
                <p>No messages found.</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>From</TableHead>
                      <TableHead>Subject & Message</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMessages.map((msg) => (
                      <TableRow key={msg._id}>
                        <TableCell className="align-top">
                          <div className="space-y-1 text-sm">
                            <div className="flex items-center gap-2">
                              <User className="w-3 h-3 text-muted-foreground" />
                              <span className="font-medium">{msg.name}</span>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Mail className="w-3 h-3" />
                              <span className="text-xs">{msg.email}</span>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="align-top">
                          <div className="space-y-1 text-sm">
                            {msg.subject && (
                              <p className="font-medium line-clamp-1">
                                {msg.subject}
                              </p>
                            )}
                            <p className="text-muted-foreground text-xs line-clamp-2">
                              {msg.message}
                            </p>
                          </div>
                        </TableCell>

                        <TableCell className="align-top">
                          {getStatusBadge(msg.status)}
                        </TableCell>

                        <TableCell className="align-top text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3 h-3" />
                            <span>
                              {formatDistanceToNow(new Date(msg.createdAt), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="align-top text-right">
                          <div className="flex justify-end gap-2">
                            {/* Open */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={actionLoadingId === msg._id || msg.status === 'open'}
                                  onClick={() => handleStatusChange(msg, 'open')}
                                >
                                  {actionLoadingId === msg._id && msg.status !== 'open' ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <CircleDot className="w-3 h-3" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Mark as open</p>
                              </TooltipContent>
                            </Tooltip>

                            {/* In progress */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={actionLoadingId === msg._id || msg.status === 'in_progress'}
                                  onClick={() => handleStatusChange(msg, 'in_progress')}
                                >
                                  {actionLoadingId === msg._id && msg.status !== 'in_progress' ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Clock className="w-3 h-3" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Mark as in progress</p>
                              </TooltipContent>
                            </Tooltip>

                            {/* Resolved */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={actionLoadingId === msg._id || msg.status === 'resolved'}
                                  onClick={() => handleStatusChange(msg, 'resolved')}
                                >
                                  {actionLoadingId === msg._id && msg.status !== 'resolved' ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="w-3 h-3 text-green-600" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Mark as resolved</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}