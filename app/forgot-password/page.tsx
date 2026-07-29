'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  BookOpen,
  Mail,
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState(''); // use code, not token
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (!email) {
        throw new Error('Please enter your email');
      }

      const res = await api.forgotPassword({ email: email.trim().toLowerCase() });

      toast.success(
        res.message || 'Check your email for the password reset code.'
      );

      setStep(2);
    } catch (err: any) {
      const message =
        err?.message || 'Request failed. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (!code) {
        throw new Error('Please enter the reset code');
      }

      if (!newPassword) {
        throw new Error('Please enter a new password');
      }

      if (newPassword.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }

      const res = await api.resetPassword({
        email: email.trim().toLowerCase(),
        code: code.trim(),
        newPassword,
      });

      toast.success(
        res.message ||
        'Your password has been updated. You can now login with your new password.'
      );

      setStep(3);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err: any) {
      const message =
        err?.message || 'Reset failed. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl"></div>
      </div>

      <Card className="w-full max-w-md border-border/50 shadow-2xl relative z-10">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center mb-2">
            <Logo variant="full" size={112} priority />
          </div>
          <CardTitle className="text-2xl font-bold">Reset Password</CardTitle>
          <CardDescription>
            {step === 1 && 'Enter your email to receive a reset code'}
            {step === 2 && 'Enter the code and your new password'}
            {step === 3 && 'Password reset successful'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {step === 1 && (
            <form onSubmit={handleRequestReset} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    className="pl-10 bg-background/50 border-border/50"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold h-10"
              >
                {isLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isLoading ? 'Sending...' : 'Send Reset Code'}
              </Button>

              <Link
                href="/login"
                className="flex items-center justify-center gap-1 text-sm text-primary hover:underline mt-4"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to login
              </Link>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="code" className="text-sm font-medium">
                  Reset Code
                </Label>
                <Input
                  id="code"
                  placeholder="Enter 6-digit code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={isLoading}
                  className="bg-background/50 border-border/50"
                  maxLength={6}
                />
                <p className="text-xs text-muted-foreground">
                  Check your email for the 6-digit reset code
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-sm font-medium">
                  New Password
                </Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isLoading}
                  className="bg-background/50 border-border/50"
                />
                <p className="text-xs text-muted-foreground">
                  At least 8 characters
                </p>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold h-10"
              >
                {isLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isLoading ? 'Resetting...' : 'Reset Password'}
              </Button>

              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center justify-center gap-1 text-sm text-primary hover:underline w-full"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            </form>
          )}

          {step === 3 && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Your password has been successfully reset. You can now login
                with your new password.
              </p>
              <p className="text-xs text-muted-foreground">
                Redirecting to login page...
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}