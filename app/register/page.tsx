'use client';

import { useState } from 'react';
import Link from 'next/link';
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
  Lock,
  Phone,
  Loader2,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Logo } from '@/components/logo';
import { api, storeAuthData } from '@/lib/api';

type RegistrationStep = 'personal' | 'contact' | 'password' | 'otp' | 'success';

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [currentStep, setCurrentStep] =
    useState<RegistrationStep>('personal');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [otpCode, setOtpCode] = useState('');

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });

  // ---------- Helpers ----------
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError('');
  };

  const validatePersonal = () => {
    if (!formData.firstName.trim()) {
      setError('First name is required');
      return false;
    }
    if (!formData.lastName.trim()) {
      setError('Last name is required');
      return false;
    }
    setError('');
    return true;
  };

  const validateContact = () => {
    if (!formData.email) {
      setError('Email is required');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('Please enter a valid email address');
      return false;
    }
    if (!formData.phone) {
      setError('Phone number is required');
      return false;
    }
    if (formData.phone.replace(/\D/g, '').length < 10) {
      setError('Phone number must be at least 10 digits');
      return false;
    }
    setError('');
    return true;
  };

  const validatePassword = () => {
    if (!formData.password) {
      setError('Password is required');
      return false;
    }
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return false;
    }
    if (!/[A-Z]/.test(formData.password)) {
      setError('Password must contain at least one uppercase letter');
      return false;
    }
    if (!/[0-9]/.test(formData.password)) {
      setError('Password must contain at least one number');
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    if (!acceptedTerms || !acceptedPrivacy) {
      setError(
        'You must accept Terms of Service and Privacy Policy'
      );
      return false;
    }
    setError('');
    return true;
  };

  const handleNext = async () => {
    if (currentStep === 'personal' && validatePersonal()) {
      setCurrentStep('contact');
    } else if (currentStep === 'contact' && validateContact()) {
      setCurrentStep('password');
    } else if (
      currentStep === 'password' &&
      validatePassword()
    ) {
      await registerUser();
    }
  };

  // ---------- Register Librarian ----------
  const registerUser = async () => {
    setIsLoading(true);
    setError('');

    try {
      await api.register({
        name: `${formData.firstName} ${formData.lastName}`,
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        phone: formData.phone,
      });

      console.log('✅ Librarian registered:', formData.email);

      toast({
        title: 'Registration Successful!',
        description: 'OTP sent to your email for verification',
      });

      // Move to OTP step
      setCurrentStep('otp');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
      toast({
        title: 'Registration Failed',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ---------- Resend OTP ----------
  const resendOTP = async () => {
    setIsLoading(true);
    setError('');

    try {
      await api.resendOTP({
        email: formData.email,
      });

      toast({
        title: 'OTP Sent!',
        description: `Verification code sent to ${formData.email}`,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP');
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ---------- Verify OTP ----------
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!otpCode || otpCode.length < 6) {
      setError('Please enter a valid 6-digit OTP');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await api.verifyOTP({
        email: formData.email,
        otp: otpCode,
      });

      const user = res?.data?.user;

      setCurrentStep('success');

      if (user) {
        // Server already set the session cookie — straight into the dashboard
        storeAuthData(user);
        toast({
          title: 'Email verified!',
          description: 'Your free trial has started. Explore the dashboard.',
        });
        setTimeout(() => router.push('/librarian'), 1200);
      } else {
        // Already verified earlier — no new session issued
        toast({ title: 'Email already verified', description: 'Please log in.' });
        setTimeout(() => router.push('/login'), 1500);
      }
    } catch (err: any) {
      setError(err.message || 'Invalid OTP');
      toast({
        title: 'Verification Failed',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ---------- UI ----------
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      <Card className="w-full max-w-md border-border/50 shadow-2xl relative z-10">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center mb-2">
            <Logo variant="full" size={112} priority />
          </div>
          <CardTitle className="text-2xl font-bold">
            Register as Librarian
          </CardTitle>
          <CardDescription>
            {currentStep === 'personal' &&
              'Step 1: Personal Information'}
            {currentStep === 'contact' &&
              'Step 2: Contact Details'}
            {currentStep === 'password' &&
              'Step 3: Create Password'}
            {currentStep === 'otp' &&
              'Step 4: Verify Email'}
            {currentStep === 'success' &&
              'Registration Complete!'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {/* Error Alert */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Success State */}
          {currentStep === 'success' && (
            <div className="space-y-4 text-center py-4">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
              <h3 className="text-lg font-semibold">
                Registration Successful!
              </h3>
              <p className="text-sm text-muted-foreground">
                Your email has been verified and your free trial has
                started.
              </p>
              <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Taking you to your dashboard…
              </p>
            </div>
          )}

          {/* Step 1: Personal Info */}
          {currentStep === 'personal' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleNext();
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label
                    htmlFor="firstName"
                    className="text-sm font-medium"
                  >
                    First Name
                  </Label>
                  <Input
                    id="firstName"
                    name="firstName"
                    placeholder="John"
                    value={formData.firstName}
                    onChange={handleChange}
                    className="bg-background/50 border-border/50"
                  />
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="lastName"
                    className="text-sm font-medium"
                  >
                    Last Name
                  </Label>
                  <Input
                    id="lastName"
                    name="lastName"
                    placeholder="Doe"
                    value={formData.lastName}
                    onChange={handleChange}
                    className="bg-background/50 border-border/50"
                  />
                </div>
              </div>

              <Button className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold">
                Continue
              </Button>
            </form>
          )}

          {/* Step 2: Contact Info */}
          {currentStep === 'contact' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleNext();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className="text-sm font-medium"
                >
                  Email Address
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
                    className="pl-10 bg-background/50 border-border/50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="phone"
                  className="text-sm font-medium"
                >
                  Phone Number
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    name="phone"
                    placeholder="+91 98765 43210"
                    value={formData.phone}
                    onChange={handleChange}
                    className="pl-10 bg-background/50 border-border/50"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCurrentStep('personal')}
                  className="flex-1 border-border/50"
                >
                  Back
                </Button>
                <Button className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold">
                  Continue
                </Button>
              </div>
            </form>
          )}

          {/* Step 3: Password */}
          {currentStep === 'password' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleNext();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label
                  htmlFor="password"
                  className="text-sm font-medium"
                >
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={handleChange}
                    className="pl-10 pr-10 bg-background/50 border-border/50"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(!showPassword)
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Min 8 chars, 1 uppercase, 1 number
                </p>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="confirmPassword"
                  className="text-sm font-medium"
                >
                  Confirm Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={
                      showConfirmPassword ? 'text' : 'password'
                    }
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="pl-10 pr-10 bg-background/50 border-border/50"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowConfirmPassword(
                        !showConfirmPassword
                      )
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Terms & Privacy */}
              <div className="space-y-3 my-4 p-3 bg-background/30 rounded-lg border border-border/50">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="terms"
                    checked={acceptedTerms}
                    onChange={() =>
                      setAcceptedTerms(!acceptedTerms)
                    }
                    className="mt-1 w-4 h-4 cursor-pointer"
                  />
                  <label
                    htmlFor="terms"
                    className="text-sm text-muted-foreground cursor-pointer flex-1"
                  >
                    I agree to the{' '}
                    <Link
                      href="/terms"
                      target="_blank"
                      className="text-primary hover:underline font-medium"
                    >
                      Terms of Service
                    </Link>
                  </label>
                </div>

                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="privacy"
                    checked={acceptedPrivacy}
                    onChange={() =>
                      setAcceptedPrivacy(!acceptedPrivacy)
                    }
                    className="mt-1 w-4 h-4 cursor-pointer"
                  />
                  <label
                    htmlFor="privacy"
                    className="text-sm text-muted-foreground cursor-pointer flex-1"
                  >
                    I agree to the{' '}
                    <Link
                      href="/privacy"
                      target="_blank"
                      className="text-primary hover:underline font-medium"
                    >
                      Privacy Policy
                    </Link>
                  </label>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCurrentStep('contact')}
                  className="flex-1 border-border/50"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold"
                >
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isLoading
                    ? 'Creating Account...'
                    : 'Create Account'}
                </Button>
              </div>
            </form>
          )}

          {/* Step 4: OTP Verification */}
          {currentStep === 'otp' && (
            <form
              onSubmit={handleVerifyOTP}
              className="space-y-4"
            >
              <div className="text-center mb-4">
                <p className="text-sm text-muted-foreground mb-2">
                  We sent a verification code to
                </p>
                <p className="font-semibold text-primary">
                  {formData.email}
                </p>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="otp"
                  className="text-sm font-medium"
                >
                  Enter 6-Digit Code
                </Label>
                <Input
                  id="otp"
                  type="text"
                  maxLength={6}
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) => {
                    setOtpCode(
                      e.target.value.replace(/\D/g, '')
                    );
                    setError('');
                  }}
                  className="text-center text-2xl tracking-widest bg-background/50 border-border/50"
                  autoComplete="one-time-code"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setCurrentStep('password')
                  }
                  className="flex-1 border-border/50"
                  disabled={isLoading}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={
                    isLoading || otpCode.length < 6
                  }
                  className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold"
                >
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isLoading ? 'Verifying...' : 'Verify & Complete'}
                </Button>
              </div>

              <Button
                type="button"
                variant="ghost"
                onClick={resendOTP}
                disabled={isLoading}
                className="w-full text-sm"
              >
                Didn&apos;t receive code? Resend
              </Button>
            </form>
          )}

          {/* Footer */}
          {currentStep !== 'success' && (
            <p className="text-center text-sm text-muted-foreground mt-6">
              Already have an account?{' '}
              <Link
                href="/login"
                className="text-primary font-semibold hover:underline"
              >
                Sign in
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}