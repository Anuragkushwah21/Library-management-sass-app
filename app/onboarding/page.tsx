'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BookOpen,
  Building2,
  MapPin,
  Phone,
  Mail,
  Users,
  Loader2,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Logo } from '@/components/logo';

export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    libraryName: '',
    libraryType: '',
    city: '',
    state: '',
    address: '',
    phone: '',
    email: '',
    totalBooks: '',
    totalMembers: '',
    description: '',
  });

  const handleChange = (
    e:
      | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
      | { name: string; value: string }
  ) => {
    // Input/Textarea se ChangeEvent aata hai (name/value target par hote hain),
    // Select se plain { name, value } object aata hai.
    const { name, value } = 'target' in e ? e.target : e;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const validateStep1 = () => {
    if (!formData.libraryName.trim()) {
      setError('Library name is required');
      return false;
    }
    if (!formData.libraryType) {
      setError('Please select a library type');
      return false;
    }
    setError('');
    return true;
  };

  const validateStep2 = () => {
    if (!formData.city.trim()) {
      setError('City is required');
      return false;
    }
    if (!formData.address.trim()) {
      setError('Address is required');
      return false;
    }
    setError('');
    return true;
  };

  const validateStep3 = () => {
    if (!formData.totalBooks) {
      setError('Please estimate total books');
      return false;
    }
    if (!formData.totalMembers) {
      setError('Please estimate total members');
      return false;
    }
    setError('');
    return true;
  };

  const handleNextStep = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2 && validateStep2()) {
      setStep(3);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep3()) return;

    setIsLoading(true);
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1200));

      console.log('[v0] Library setup data:', formData);

      toast({
        title: 'Library setup complete!',
        description: 'Redirecting to your dashboard...',
      });

      // Redirect to dashboard
      router.push('/dashboard/library/lib-001');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Setup failed. Please try again.';
      setError(message);
      toast({
        title: 'Setup failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      {/* Header */}
      <div className="border-b border-border/10 bg-card/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center">
          <div className="flex items-center gap-2">
            <Logo size={32} priority />
            <span className="font-bold">LibraSaaS</span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card className="border-border/50 shadow-2xl">
          <CardHeader className="space-y-2 text-center">
            <CardTitle className="text-2xl font-bold">Set up your library</CardTitle>
            <CardDescription>Step {step} of 3 - Tell us about your library</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Step 1: Basic Info */}
              {step === 1 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="libraryName" className="text-sm font-medium">
                      Library Name
                    </Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="libraryName"
                        name="libraryName"
                        placeholder="Central City Library"
                        value={formData.libraryName}
                        onChange={handleChange}
                        className="pl-10 bg-background/50 border-border/50"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="libraryType" className="text-sm font-medium">
                      Library Type
                    </Label>
                    <Select value={formData.libraryType} onValueChange={(value) => handleChange({ name: 'libraryType', value })}>
                      <SelectTrigger className="bg-background/50 border-border/50">
                        <SelectValue placeholder="Select library type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="public">Public Library</SelectItem>
                        <SelectItem value="academic">Academic Library</SelectItem>
                        <SelectItem value="school">School Library</SelectItem>
                        <SelectItem value="corporate">Corporate Library</SelectItem>
                        <SelectItem value="special">Special Library</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description" className="text-sm font-medium">
                      About Your Library
                    </Label>
                    <Textarea
                      id="description"
                      name="description"
                      placeholder="Tell us about your library..."
                      value={formData.description}
                      onChange={handleChange}
                      className="bg-background/50 border-border/50 resize-none"
                      rows={4}
                    />
                  </div>
                </>
              )}

              {/* Step 2: Location & Contact */}
              {step === 2 && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city" className="text-sm font-medium">
                        City
                      </Label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="city"
                          name="city"
                          placeholder="New Delhi"
                          value={formData.city}
                          onChange={handleChange}
                          className="pl-10 bg-background/50 border-border/50"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="state" className="text-sm font-medium">
                        State/Province
                      </Label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="state"
                          name="state"
                          placeholder="Delhi"
                          value={formData.state}
                          onChange={handleChange}
                          className="pl-10 bg-background/50 border-border/50"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address" className="text-sm font-medium">
                      Full Address
                    </Label>
                    <Textarea
                      id="address"
                      name="address"
                      placeholder="Enter your library's full address"
                      value={formData.address}
                      onChange={handleChange}
                      className="bg-background/50 border-border/50 resize-none"
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-sm font-medium">
                        Phone
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
                          placeholder="info@library.com"
                          value={formData.email}
                          onChange={handleChange}
                          className="pl-10 bg-background/50 border-border/50"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Step 3: Library Stats */}
              {step === 3 && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="totalBooks" className="text-sm font-medium">
                      Estimated Total Books
                    </Label>
                    <div className="relative">
                      <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Select value={formData.totalBooks} onValueChange={(value) => handleChange({ name: 'totalBooks', value })}>
                        <SelectTrigger className="pl-10 bg-background/50 border-border/50">
                          <SelectValue placeholder="Select range" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0-1000">0 - 1,000</SelectItem>
                          <SelectItem value="1000-5000">1,000 - 5,000</SelectItem>
                          <SelectItem value="5000-10000">5,000 - 10,000</SelectItem>
                          <SelectItem value="10000-50000">10,000 - 50,000</SelectItem>
                          <SelectItem value="50000+">50,000+</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="totalMembers" className="text-sm font-medium">
                      Estimated Total Members
                    </Label>
                    <div className="relative">
                      <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Select value={formData.totalMembers} onValueChange={(value) => handleChange({ name: 'totalMembers', value })}>
                        <SelectTrigger className="pl-10 bg-background/50 border-border/50">
                          <SelectValue placeholder="Select range" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0-100">0 - 100</SelectItem>
                          <SelectItem value="100-500">100 - 500</SelectItem>
                          <SelectItem value="500-1000">500 - 1,000</SelectItem>
                          <SelectItem value="1000-5000">1,000 - 5,000</SelectItem>
                          <SelectItem value="5000+">5,000+</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-muted/50 border border-border/50">
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      You&apos;re all set!
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Your library account is ready. Click continue to access your dashboard and start managing your library.
                    </p>
                  </div>
                </>
              )}

              {/* Progress indicator */}
              <div className="flex gap-2 my-6">
                {[1, 2, 3].map((s) => (
                  <div
                    key={s}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      s <= step
                        ? 'bg-gradient-to-r from-purple-500 to-blue-500'
                        : 'bg-border/50'
                    }`}
                  ></div>
                ))}
              </div>

              {step < 3 ? (
                <>
                  {step > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setStep(step - 1)}
                      className="w-full border-border/50"
                    >
                      Back
                    </Button>
                  )}
                  <Button
                    type="button"
                    onClick={handleNextStep}
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold"
                  >
                    Continue
                  </Button>
                </>
              ) : (
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold h-10"
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isLoading ? 'Setting up...' : 'Complete Setup'}
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Help section */}
        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">
            Need help? Contact our{' '}
            <a href="mailto:support@librasaas.com" className="text-primary hover:underline">
              support team
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
