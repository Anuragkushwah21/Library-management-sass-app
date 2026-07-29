import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BookOpen, ArrowLeft, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl"></div>
      </div>

      <div className="text-center relative z-10">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500/20 to-blue-600/20 rounded-full flex items-center justify-center">
            <span className="text-5xl font-bold text-muted-foreground">404</span>
          </div>
        </div>

        <h1 className="text-4xl md:text-5xl font-bold mb-2">Page Not Found</h1>
        <p className="text-xl text-muted-foreground max-w-md mx-auto mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            asChild
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold gap-2"
          >
            <Link href="/">
              <Home className="w-4 h-4" />
              Go Home
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="border-border/50 gap-2"
          >
            <Link href="/login">
              <ArrowLeft className="w-4 h-4" />
              Back to Login
            </Link>
          </Button>
        </div>

        <div className="mt-16 pt-8 border-t border-border/50">
          <p className="text-sm text-muted-foreground mb-4">
            Need help? Contact our support team
          </p>
          <Link
            href="mailto:support@librasaas.com"
            className="text-primary hover:underline text-sm font-medium"
          >
            support@librasaas.com
          </Link>
        </div>
      </div>
    </div>
  );
}
