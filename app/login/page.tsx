'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { BookOpen, Mail, Lock, Loader2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Logo } from '@/components/logo';
import { api, storeAuthData } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Validate
      if (!formData.email || !formData.password) {
        throw new Error('Please fill in all fields');
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        throw new Error('Please enter a valid email');
      }

      if (formData.password.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }

      // ✅ Call login API (returns token directly)
      const response = await api.login({
        email: formData.email,
        password: formData.password,
      });

      // ✅ Token httpOnly cookie me server ne set kar diya; yahan sirf
      //    display data store karte hain
      if (response.data?.user) {
        storeAuthData(response.data.user);

        toast({
          title: 'Login successful',
          description: `Welcome back, ${response.data.user.name || response.data.user.email}!`,
        });

        // ✅ Redirect based on role
        const role = response.data.user.role;

        if (role === 'admin') {
          router.push('/admin/dashboard');
        } else if (role === 'librarian') {
          router.push('/librarian');
        } else {
          router.push('/dashboard');
        }
      } else {
        throw new Error('Invalid response from server');
      }

    } catch (err: any) {
      console.error('[Login Error]:', err);

      let message = 'Login failed. Please try again.';

      // ✅ Handle specific errors
      if (err.message.includes('verify your email') || err.message.includes('needsVerification')) {
        message = 'Please verify your email first';
        setError(message);
        toast({
          title: 'Email not verified',
          description: 'Please check your email and complete verification.',
          variant: 'destructive',
        });

      } else if (err.message.includes('pending approval') || err.message.includes('pendingApproval')) {
        message = 'Your profile is pending admin approval';
        setError(message);
        toast({
          title: 'Pending Approval',
          description: 'Your account is under review. You will be notified once approved.',
          variant: 'destructive',
        });

      } else if (err.message.includes('rejected') || err.message.includes('isRejected')) {
        message = err.message || 'Your registration was rejected';
        setError(message);
        toast({
          title: 'Account Rejected',
          description: message,
          variant: 'destructive',
        });

      } else if (err.message.includes('Invalid email or password')) {
        message = 'Invalid email or password';
        setError(message);
        toast({
          title: 'Login failed',
          description: message,
          variant: 'destructive',
        });

      } else {
        message = err.message || 'Login failed. Please try again.';
        setError(message);
        toast({
          title: 'Login failed',
          description: message,
          variant: 'destructive',
        });
      }

    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl"></div>
      </div>

      <Card className="w-full max-w-md border-border/50 shadow-2xl relative z-10">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center mb-2">
            <Logo variant="full" size={112} priority />
          </div>
          <CardTitle className="text-2xl font-bold">Library Management</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={isLoading}
                  className="pl-10 bg-background/50 border-border/50 focus:border-primary"
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap justify-between items-center gap-3">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-primary hover:underline"
                >
                  Forgot?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  disabled={isLoading}
                  className="pl-10 bg-background/50 border-border/50 focus:border-primary"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold h-10"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Don&apos;t have an account?{' '}
            <Link
              href="/register"
              className="text-primary font-semibold hover:underline"
            >
              Register as Librarian
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}