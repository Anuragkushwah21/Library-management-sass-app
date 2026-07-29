'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, UserCheck, UserX, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface DashboardStats {
  totalLibrarians: number;
  approvedLibrarians: number;
  pendingLibrarians: number;
  rejectedLibrarians: number;
}

export default function AdminDashboard() {
  const { toast } = useToast();
  const [stats, setStats] = useState<DashboardStats>({
    totalLibrarians: 0,
    approvedLibrarians: 0,
    pendingLibrarians: 0,
    rejectedLibrarians: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.getAdminStats();
      setStats(response.data);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch statistics',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const statsCards = [
    {
      title: 'Total Librarians',
      value: stats.totalLibrarians,
      icon: Users,
      description: 'All registered librarians',
      color: 'text-blue-600',
      bgColor: 'bg-blue-100 dark:bg-blue-950',
    },
    {
      title: 'Approved',
      value: stats.approvedLibrarians,
      icon: UserCheck,
      description: 'Active librarians',
      color: 'text-green-600',
      bgColor: 'bg-green-100 dark:bg-green-950',
    },
    {
      title: 'Pending Approval',
      value: stats.pendingLibrarians,
      icon: TrendingUp,
      description: 'Awaiting review',
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100 dark:bg-yellow-950',
    },
    {
      title: 'Rejected',
      value: stats.rejectedLibrarians,
      icon: UserX,
      description: 'Declined applications',
      color: 'text-red-600',
      bgColor: 'bg-red-100 dark:bg-red-950',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-4 bg-muted rounded w-1/2"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted rounded w-1/3"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Welcome to Admin Dashboard</CardTitle>
          <CardDescription>
            Manage librarians, approve registrations, and oversee the library management system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 border border-border rounded-lg">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                <UserCheck className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Pending Approvals</h3>
                <p className="text-sm text-muted-foreground">
                  {stats.pendingLibrarians} librarian{stats.pendingLibrarians !== 1 ? 's' : ''} waiting for approval
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}