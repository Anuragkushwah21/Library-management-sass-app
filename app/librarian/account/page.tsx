// app/librarian/account/page.tsx

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { api, getStoredUser } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { 
  User, 
  Mail, 
  Phone, 
  Calendar, 
  Shield, 
  Loader2,
  CheckCircle,
  Camera,
} from 'lucide-react';
import { format } from 'date-fns';

interface LibrarianProfile {
  _id: string;
  name: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role: string;
  isVerified: boolean;
  isApproved: boolean;
  profileImage?: string;
  createdAt: string;
  approvedAt?: string;
}

export default function LibrarianAccountPage() {
  const { toast } = useToast();
  const router = useRouter();

  const [profile, setProfile] = useState<LibrarianProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Photo upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    firstName: '',
    lastName: '',
    phone: '',
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await api.getMyProfile();
      setProfile(response.data);
      
      setFormData({
        name: response.data.name || '',
        firstName: response.data.firstName || '',
        lastName: response.data.lastName || '',
        phone: response.data.phone || '',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch profile',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      await api.updateMyProfile(formData);
      
      toast({
        title: 'Success',
        description: 'Profile updated successfully',
      });

      await fetchProfile();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update profile',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePhotoSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    // Same file dobara choose kar sakein isliye input reset kar do
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file',
        description: 'Please choose an image file.',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Image too large',
        description: `${(file.size / 1024 / 1024).toFixed(1)} MB — max is 5 MB.`,
        variant: 'destructive',
      });
      return;
    }

    // Server jawab dene tak local preview dikhao
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    setIsUploadingPhoto(true);

    try {
      const body = new FormData();
      body.append('file', file);

      const res = await fetch('/api/profile/avatar', {
        method: 'POST',
        body, // Content-Type set mat karo — browser boundary khud lagata hai
        credentials: 'same-origin',
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || 'Upload failed');
      }

      toast({ title: 'Photo updated' });
      await fetchProfile();
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error.message || 'Could not upload the photo.',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingPhoto(false);
      URL.revokeObjectURL(localPreview);
      setPreviewUrl(null);
    }
  };

  const handleRemovePhoto = async () => {
    setIsUploadingPhoto(true);
    try {
      const res = await fetch('/api/profile/avatar', {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Could not remove photo');

      toast({ title: 'Photo removed' });
      await fetchProfile();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const getInitials = () => {
    if (profile?.firstName && profile?.lastName) {
      return `${profile.firstName[0]}${profile.lastName[0]}`.toUpperCase();
    }
    return profile?.name?.substring(0, 2).toUpperCase() || 'LB';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">My Account</h1>
        <p className="text-muted-foreground">
          Manage your profile and account settings
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Profile Card */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar */}
            <div className="flex flex-col items-center space-y-4">
              <div className="relative">
                <Avatar className="w-32 h-32">
                  <AvatarImage src={previewUrl || profile.profileImage} />
                  <AvatarFallback className="text-2xl bg-gradient-to-br from-purple-500 to-blue-500 text-white">
                    {getInitials()}
                  </AvatarFallback>
                </Avatar>

                {isUploadingPhoto && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={handlePhotoSelected}
                />

                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute bottom-0 right-0 rounded-full shadow"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingPhoto}
                  aria-label="Change profile photo"
                >
                  <Camera className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingPhoto}
                  className="text-xs text-primary hover:underline disabled:opacity-50"
                >
                  {profile.profileImage ? 'Change photo' : 'Upload photo'}
                </button>

                {profile.profileImage && (
                  <>
                    <span className="text-xs text-muted-foreground">·</span>
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      disabled={isUploadingPhoto}
                      className="text-xs text-destructive hover:underline disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground">
                JPG, PNG, WebP or GIF · max 5 MB
              </p>

              <div className="text-center">
                <h3 className="text-xl font-semibold">{profile.name}</h3>
                <p className="text-sm text-muted-foreground">{profile.email}</p>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2 justify-center">
                <Badge variant="secondary" className="gap-1">
                  <Shield className="w-3 h-3" />
                  {profile.role}
                </Badge>
                {profile.isVerified && (
                  <Badge variant="default" className="gap-1 bg-green-500">
                    <CheckCircle className="w-3 h-3" />
                    Verified
                  </Badge>
                )}
                {profile.isApproved && (
                  <Badge variant="default" className="gap-1 bg-blue-500">
                    <CheckCircle className="w-3 h-3" />
                    Approved
                  </Badge>
                )}
              </div>
            </div>

            <Separator />

            {/* Account Details */}
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p className="font-medium">{profile.email}</p>
                </div>
              </div>

              {profile.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">Phone</p>
                    <p className="font-medium">{profile.phone}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 text-sm">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground">Member Since</p>
                  <p className="font-medium">
                    {format(new Date(profile.createdAt), 'MMM dd, yyyy')}
                  </p>
                </div>
              </div>

              {profile.approvedAt && (
                <div className="flex items-center gap-3 text-sm">
                  <CheckCircle className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">Approved On</p>
                    <p className="font-medium">
                      {format(new Date(profile.approvedAt), 'MMM dd, yyyy')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Edit Profile Card */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Edit Profile</CardTitle>
            <CardDescription>
              Update your personal information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateProfile} className="space-y-6">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="John Doe"
                  required
                />
              </div>

              {/* First Name & Last Name */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => handleInputChange('firstName', e.target.value)}
                    placeholder="John"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => handleInputChange('lastName', e.target.value)}
                    placeholder="Doe"
                  />
                </div>
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="+91 98765 43210"
                />
              </div>

              {/* Email (Read-only) */}
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={profile.email}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Email cannot be changed
                </p>
              </div>

              <Separator />

              {/* Submit Button */}
              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setFormData({
                      name: profile.name || '',
                      firstName: profile.firstName || '',
                      lastName: profile.lastName || '',
                      phone: profile.phone || '',
                    });
                  }}
                >
                  Reset
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}