// 'use client';

// import { useEffect, useState } from 'react';
// import { StatCard } from '@/components/librarian/stats-card';
// import { StudentChart } from '@/components/librarian/student-chart';
// import { PaymentChart } from '@/components/librarian/payment-chart';
// import { RecentActivity } from '@/components/librarian/recent-activity';
// import { Users, CreditCard, Armchair, BookOpen } from 'lucide-react';
// import { useToast } from '@/hooks/use-toast';
// // import { api } from '@/lib/api'; // dummy mode me जरूरत नहीं

// type StatData = {
//   totalStudents: number;
//   paidMembers: number;
//   seatsAvailable: number;
//   booksIssued: number;
// };

// type StudentChartPoint = {
//   month: string;
//   students: number;
//   paid: number;
// };

// type PaymentPoint = {
//   name: string;
//   value: number;
//   fill: string;
// };

// type ActivityItem = {
//   id: string;
//   type:
//     | 'student_join'
//     | 'book_issued'
//     | 'payment_received'
//     | 'overdue_book'
//     | 'seat_reserved';
//   description: string;
//   timestamp: string;
// };

// export default function DashboardClient() {
//   const { toast } = useToast();

//   const [stats, setStats] = useState<StatData | null>(null);
//   const [studentData, setStudentData] = useState<StudentChartPoint[]>([]);
//   const [paymentData, setPaymentData] = useState<PaymentPoint[]>([]);
//   const [activities, setActivities] = useState<ActivityItem[]>([]);
//   const [loading, setLoading] = useState(true);

//   const fetchDashboard = async () => {
//     try {
//       setLoading(true);

//       // ✅ Dummy stats
//       const dummyStats: StatData = {
//         totalStudents: 120,
//         paidMembers: 80,
//         seatsAvailable: 25,
//         booksIssued: 40,
//       };

//       // ✅ Dummy student chart (last 6 months)
//       const dummyStudentData: StudentChartPoint[] = [
//         { month: 'Jan', students: 10, paid: 6 },
//         { month: 'Feb', students: 15, paid: 9 },
//         { month: 'Mar', students: 20, paid: 12 },
//         { month: 'Apr', students: 18, paid: 11 },
//         { month: 'May', students: 25, paid: 15 },
//         { month: 'Jun', students: 22, paid: 14 },
//       ];

//       // ✅ Dummy payment chart
//       const dummyPaymentData: PaymentPoint[] = [
//         { name: 'Paid', value: 80, fill: '#10b981' },
//         { name: 'Unpaid', value: 25, fill: '#ef4444' },
//         { name: 'Pending', value: 15, fill: '#f59e0b' },
//       ];

//       // ✅ Dummy recent activity
//       const now = new Date();
//       const dummyActivities: ActivityItem[] = [
//         {
//           id: '1',
//           type: 'student_join',
//           description: 'Rahul Sharma joined the library',
//           timestamp: new Date(
//             now.getTime() - 1 * 60 * 60 * 1000
//           ).toISOString(),
//         },
//         {
//           id: '2',
//           type: 'book_issued',
//           description: 'Priya Verma issued "Atomic Habits"',
//           timestamp: new Date(
//             now.getTime() - 2 * 60 * 60 * 1000
//           ).toISOString(),
//         },
//         {
//           id: '3',
//           type: 'payment_received',
//           description: 'Membership payment received from Aman Singh',
//           timestamp: new Date(
//             now.getTime() - 3 * 60 * 60 * 1000
//           ).toISOString(),
//         },
//         {
//           id: '4',
//           type: 'overdue_book',
//           description: 'Overdue: "Rich Dad Poor Dad" (Neha Gupta)',
//           timestamp: new Date(
//             now.getTime() - 4 * 60 * 60 * 1000
//           ).toISOString(),
//         },
//         {
//           id: '5',
//           type: 'seat_reserved',
//           description: 'Seat 12 reserved by Mohit Jain',
//           timestamp: new Date(
//             now.getTime() - 5 * 60 * 60 * 1000
//           ).toISOString(),
//         },
//       ];

//       setStats(dummyStats);
//       setStudentData(dummyStudentData);
//       setPaymentData(dummyPaymentData);
//       setActivities(dummyActivities);
//     } catch (error: any) {
//       console.error('[Dashboard] dummy load error:', error);
//       toast({
//         title: 'Error',
//         description:
//           error.message || 'Something went wrong while loading dashboard.',
//         variant: 'destructive',
//       });
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     fetchDashboard();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   if (loading && !stats) {
//     return (
//       <div className="space-y-4">
//         <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
//         <p className="text-muted-foreground">Loading dashboard data...</p>
//       </div>
//     );
//   }

//   if (!stats) {
//     return (
//       <div className="space-y-4">
//         <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
//         <p className="text-muted-foreground">
//           Unable to load dashboard data.
//         </p>
//         <button
//           className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground"
//           onClick={fetchDashboard}
//         >
//           Retry
//         </button>
//       </div>
//     );
//   }

//   return (
//     <div className="space-y-8">
//       <div>
//         <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
//         <p className="text-muted-foreground">
//           Welcome to the library management dashboard
//         </p>
//       </div>

//       {/* Stats Grid */}
//       <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
//         <StatCard
//           title="Total Students"
//           value={stats.totalStudents}
//           icon={<Users className="w-5 h-5" />}
//           color="bg-blue-500"
//         />
//         <StatCard
//           title="Paid Members"
//           value={stats.paidMembers}
//           icon={<CreditCard className="w-5 h-5" />}
//           color="bg-green-500"
//         />
//         <StatCard
//           title="Available Seats"
//           value={stats.seatsAvailable}
//           icon={<Armchair className="w-5 h-5" />}
//           color="bg-purple-500"
//         />
//         <StatCard
//           title="Books Issued"
//           value={stats.booksIssued}
//           icon={<BookOpen className="w-5 h-5" />}
//           color="bg-orange-500"
//         />
//       </div>

//       {/* Charts Grid */}
//       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
//         <StudentChart data={studentData} />
//         <PaymentChart data={paymentData} />
//       </div>

//       {/* Recent Activity */}
//       <RecentActivity activities={activities} />
//     </div>
//   );
// }

'use client';

import { useEffect, useState } from 'react';
import { StatCard } from '@/components/librarian/stats-card';
import { StudentChart } from '@/components/librarian/student-chart';
import { PaymentChart } from '@/components/librarian/payment-chart';
import { RecentActivity } from '@/components/librarian/recent-activity';
import { TodayAttendanceCard } from '@/components/librarian/today-attendance-card';
import { FeesOverviewCard, type FeesOverview } from '@/components/librarian/fees-overview-card';
import { Users, CreditCard, Armchair, BookOpen, UserPlus, ClipboardCheck } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';

type StatData = {
  totalStudents: number;
  paidMembers: number;
  seatsAvailable: number;
  booksIssued: number;
};

type StudentChartPoint = {
  month: string;
  students: number;
  paid: number;
};

type PaymentPoint = {
  name: string;
  value: number;
  fill: string;
};

type ActivityItem = {
  id: string;
  type:
    | 'student_join'
    | 'book_issued'
    | 'payment_received'
    | 'overdue_book'
    | 'seat_reserved';
  description: string;
  timestamp: string;
};

type DashboardApiResponse = {
  success: boolean;
  data?: {
    stats: StatData;
    studentChart: StudentChartPoint[];
    paymentChart: PaymentPoint[];
    activities: ActivityItem[];
    fees: FeesOverview | null;
  };
  error?: string;
};

export default function DashboardClient() {
  const { toast } = useToast();

  const [stats, setStats] = useState<StatData | null>(null);
  const [studentData, setStudentData] = useState<StudentChartPoint[]>([]);
  const [paymentData, setPaymentData] = useState<PaymentPoint[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [fees, setFees] = useState<FeesOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = async () => {
    try {
      setLoading(true);

      const res = await fetch('/api/dashboard', {
        credentials: 'include',
        cache: 'no-store', // optional, fresh data ensure
      });

      const json: DashboardApiResponse = await res.json();

      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || 'Failed to load dashboard data');
      }

      setStats(json.data.stats);
      setStudentData(json.data.studentChart || []);
      setPaymentData(json.data.paymentChart || []);
      setActivities(json.data.activities || []);
      setFees(json.data.fees ?? null);
    } catch (error: any) {
      console.error('[Dashboard] fetch error:', error);
      toast({
        title: 'Error',
        description:
          error.message || 'Something went wrong while loading dashboard.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading && !stats) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Loading dashboard data...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Unable to load dashboard data.
        </p>
        <button
          className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground"
          onClick={fetchDashboard}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to the library management dashboard
        </p>
      </div>

      {/* Stats Grid — phone par 2-up, tablet par 2, desktop par 4 */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          title="Total Students"
          value={stats.totalStudents}
          icon={<Users className="w-5 h-5" />}
          color="bg-blue-500"
        />
        <StatCard
          title="Paid Members"
          value={stats.paidMembers}
          icon={<CreditCard className="w-5 h-5" />}
          color="bg-green-500"
        />
        <StatCard
          title="Available Seats"
          value={stats.seatsAvailable}
          icon={<Armchair className="w-5 h-5" />}
          color="bg-purple-500"
        />
        <StatCard
          title="Books Issued"
          value={stats.booksIssued}
          icon={<BookOpen className="w-5 h-5" />}
          color="bg-orange-500"
        />
      </div>

      {/* Quick actions — the manual flow works with or without QR check-in */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { href: '/librarian/students/add-demo', label: 'Add Demo Student', icon: UserPlus },
          { href: '/librarian/attendance', label: 'Take attendance', icon: ClipboardCheck },
          { href: '/librarian/students?tab=demo', label: 'Demo Students', icon: Users },
          { href: '/librarian/seats', label: 'Seats', icon: Armchair },
        ].map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm font-medium shadow-sm transition-colors hover:border-primary/50 hover:bg-accent"
          >
            <Icon className="h-5 w-5 shrink-0 text-primary" />
            {label}
          </Link>
        ))}
      </div>

      {fees && <FeesOverviewCard fees={fees} />}

      <TodayAttendanceCard />

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <StudentChart data={studentData} />
        <PaymentChart data={paymentData} />
      </div>

      {/* Recent Activity */}
      <RecentActivity activities={activities} />
    </div>
  );
}