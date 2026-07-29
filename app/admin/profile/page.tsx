// app/(admin)/profile/page.tsx
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/middleware/auth';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { connectDB } from '@/lib/db';
import { User } from '@/lib/models/User';

export const metadata: Metadata = {
  title: 'Admin Profile',
};

export default async function AdminProfilePage() {
  const decoded = await getCurrentUser();

  if (!decoded) {
    redirect('/login');
  }

  await connectDB();

  // ✅ populate('library') hata diya
  const dbUser = await User.findById(decoded.userId).lean();

  if (!dbUser) {
    redirect('/login');
  }

  const name: string = dbUser.name || decoded.email || 'Admin';
  const role: string = decoded.role || 'admin';

  const initials =
    name
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase() || 'AD';

  // Agar future me library field add karoge, ye safe fallback rahega
  const library: any = (dbUser as any).library;

  return (
    <div className="max-w-2xl mx-auto py-8">
      <Card>
        <CardHeader className="flex items-center gap-4">
          <Avatar className="h-12 w-12">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <CardTitle className="text-xl">Admin Profile</CardTitle>
            <CardDescription>
              View and manage your admin account details.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Name
            </p>
            <p className="text-base">{name}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Email
            </p>
            <p className="text-base">{decoded.email}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Role
            </p>
            <p className="text-base capitalize">{role}</p>
          </div>

          {library && (
            <>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Library name
                </p>
                <p className="text-base">{library.name}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Subdomain
                </p>
                <p className="text-base">
                  {library.subdomain
                    ? `${library.subdomain}.yourdomain.com`
                    : 'Not set'}
                </p>
              </div>
            </>
          )}
        </CardContent>

        <CardFooter className="flex justify-between">
          <Button variant="outline" asChild>
            <a href="/admin/settings">Edit profile</a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/admin/settings">Change password</a>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}