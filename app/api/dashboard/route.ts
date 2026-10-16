// app/api/dashboard/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, libraryIdFor } from '@/lib/middleware/auth';
import { Library } from '@/lib/models/Library';
import { feesOverview } from '@/lib/services/membership';
import { handleRouteError } from '@/lib/api-response';
import {
  fetchDashboardStats,
  fetchStudentChartData,
  fetchPaymentStatusData,
  fetchRecentActivity,
} from '@/lib/dashboard-data';

export const runtime = 'nodejs';

type ActivityItemResponse = {
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

export async function GET(request: NextRequest) {
  try {
    const decoded = await authenticateRequest(request);
    const userId = decoded.userId;

    const libraryId = await libraryIdFor(decoded);
    const library = libraryId ? await Library.findById(libraryId) : null;

    const [stats, studentChartRaw, paymentStatusRaw, activitiesRaw, fees] =
      await Promise.all([
        fetchDashboardStats(userId),
        fetchStudentChartData(userId),
        fetchPaymentStatusData(userId),
        fetchRecentActivity(userId),
        library ? feesOverview(library) : null,
      ]);

    // student chart
    const studentChart = studentChartRaw.map((p) => ({
      month: p.label,
      students: p.value,
      paid: 0,
    }));

    // payment chart
    const paymentChart = paymentStatusRaw.map((p) => ({
      name: p.label,
      value: p.value,
      fill:
        p.label === 'Paid'
          ? '#10b981'
          : p.label === 'Unpaid'
          ? '#ef4444'
          : '#f59e0b',
    }));

    // activities
    const activities: ActivityItemResponse[] = activitiesRaw.map((a) => {
      if (a.type === 'student') {
        return {
          id: a.id,
          type: 'student_join',
          description: a.description,
          timestamp: a.createdAt,
        };
      }

      return {
        id: a.id,
        type: 'book_issued',
        description: a.description,
        timestamp: a.createdAt,
      };
    });

    activities.sort(
      (a, b) => +new Date(b.timestamp) - +new Date(a.timestamp)
    );
    const slicedActivities = activities.slice(0, 5);

    return NextResponse.json({
      success: true,
      data: {
        // 👇 yahi stats object me booksIssued aa raha hai
        stats,
        studentChart,
        paymentChart,
        activities: slicedActivities,
        fees,
      },
    });
  } catch (error) {
    return handleRouteError(error, 'Failed to load dashboard data', 'Dashboard');
  }
}