'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  User as UserIcon,
  Lock,
  Bell,
  Globe,
  Save,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { api, getStoredUser } from '@/lib/api';

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const user = getStoredUser();
  const [isLoading, setIsLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Profile Settings
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
  });

  // Password Settings
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Notification Settings
  const [notifications, setNotifications] = useState({
    emailNotifications: true,
    newRegistrations: true,
    systemUpdates: false,
    weeklyReports: true,
  });

  // System Settings
  const [systemSettings, setSystemSettings] = useState({
    siteName: 'Library Management System',
    supportEmail: 'support@library.com',
    autoApproveLibrarians: false,
    maintenanceMode: false,
  });

  // PROFILE UPDATE
  const handleProfileUpdate = async () => {
    setIsLoading(true);
    try {
      await api.updateAdminProfile(profileData);

      toast({
        title: 'Profile Updated',
        description: 'Your profile has been successfully updated',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update profile',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // PASSWORD UPDATE
  const handlePasswordUpdate = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({
        title: 'Error',
        description: 'Passwords do not match',
        variant: 'destructive',
      });
      return;
    }

    if (passwordData.newPassword.length < 8) {
      toast({
        title: 'Error',
        description: 'Password must be at least 8 characters',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      await api.updateAdminPassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });

      toast({
        title: 'Password Updated',
        description: 'Your password has been successfully changed',
      });

      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update password',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // NOTIFICATION UPDATE
  const handleNotificationUpdate = async () => {
    setIsLoading(true);
    try {
      await api.updateAdminNotifications(notifications);

      toast({
        title: 'Settings Updated',
        description: 'Notification preferences saved',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update settings',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // SYSTEM SETTINGS UPDATE
  const handleSystemUpdate = async () => {
    setIsLoading(true);
    try {
      await api.updateSystemSettings(systemSettings);

      toast({
        title: 'System Settings Updated',
        description: 'System configuration has been saved',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update system settings',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and system preferences
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile">
            <UserIcon className="w-4 h-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security">
            <Lock className="w-4 h-4 mr-2" />
            Security
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="w-4 h-4 mr-2" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="system">
            <Globe className="w-4 h-4 mr-2" />
            System
          </TabsTrigger>
        </TabsList>

        {/* Profile Settings */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>
                Update your personal information and contact details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={profileData.name}
                  onChange={(e) =>
                    setProfileData((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={profileData.email}
                  onChange={(e) =>
                    setProfileData((prev) => ({ ...prev, email: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  value={profileData.phone}
                  onChange={(e) =>
                    setProfileData((prev) => ({ ...prev, phone: e.target.value }))
                  }
                />
              </div>

              <Button onClick={handleProfileUpdate} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>
                Update your password to keep your account secure
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={passwordData.currentPassword}
                    onChange={(e) =>
                      setPasswordData((prev) => ({
                        ...prev,
                        currentPassword: e.target.value,
                      }))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  >
                    {showCurrentPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showNewPassword ? 'text' : 'password'}
                    value={passwordData.newPassword}
                    onChange={(e) =>
                      setPasswordData((prev) => ({
                        ...prev,
                        newPassword: e.target.value,
                      }))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={(e) =>
                    setPasswordData((prev) => ({
                      ...prev,
                      confirmPassword: e.target.value,
                    }))
                  }
                />
              </div>

              <Button onClick={handlePasswordUpdate} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Lock className="w-4 h-4 mr-2" />
                )}
                Update Password
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notification Settings */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>
                Manage how you receive notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications via email
                  </p>
                </div>
                <Switch
                  checked={notifications.emailNotifications}
                  onCheckedChange={(checked) =>
                    setNotifications((prev) => ({
                      ...prev,
                      emailNotifications: checked,
                    }))
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>New Registrations</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when new librarians register
                  </p>
                </div>
                <Switch
                  checked={notifications.newRegistrations}
                  onCheckedChange={(checked) =>
                    setNotifications((prev) => ({
                      ...prev,
                      newRegistrations: checked,
                    }))
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>System Updates</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive system maintenance notifications
                  </p>
                </div>
                <Switch
                  checked={notifications.systemUpdates}
                  onCheckedChange={(checked) =>
                    setNotifications((prev) => ({
                      ...prev,
                      systemUpdates: checked,
                    }))
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Weekly Reports</Label>
                  <p className="text-sm text-muted-foreground">
                    Get weekly summary reports
                  </p>
                </div>
                <Switch
                  checked={notifications.weeklyReports}
                  onCheckedChange={(checked) =>
                    setNotifications((prev) => ({
                      ...prev,
                      weeklyReports: checked,
                    }))
                  }
                />
              </div>

              <Button onClick={handleNotificationUpdate} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Preferences
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Settings */}
        <TabsContent value="system">
          <Card>
            <CardHeader>
              <CardTitle>System Configuration</CardTitle>
              <CardDescription>
                Manage system-wide settings and preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="siteName">Site Name</Label>
                <Input
                  id="siteName"
                  value={systemSettings.siteName}
                  onChange={(e) =>
                    setSystemSettings((prev) => ({
                      ...prev,
                      siteName: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="supportEmail">Support Email</Label>
                <Input
                  id="supportEmail"
                  type="email"
                  value={systemSettings.supportEmail}
                  onChange={(e) =>
                    setSystemSettings((prev) => ({
                      ...prev,
                      supportEmail: e.target.value,
                    }))
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Auto-Approve Librarians</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically approve new librarian registrations
                  </p>
                </div>
                <Switch
                  checked={systemSettings.autoApproveLibrarians}
                  onCheckedChange={(checked) =>
                    setSystemSettings((prev) => ({
                      ...prev,
                      autoApproveLibrarians: checked,
                    }))
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Maintenance Mode</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable maintenance mode for system updates
                  </p>
                </div>
                <Switch
                  checked={systemSettings.maintenanceMode}
                  onCheckedChange={(checked) =>
                    setSystemSettings((prev) => ({
                      ...prev,
                      maintenanceMode: checked,
                    }))
                  }
                />
              </div>

              <Button onClick={handleSystemUpdate} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}