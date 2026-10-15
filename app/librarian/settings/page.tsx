// app/librarian/settings/page.tsx
'use client';

import { useEffect, useState } from 'react';
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
import { Lock, Bell, Moon, Loader2, Eye, EyeOff } from 'lucide-react';
import { useTheme } from 'next-themes';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import { LibrarySettingsCard } from '@/components/librarian/library-settings-card';

type NotificationSettings = {
  emailNotifications: boolean;
  overdueReminders: boolean;
  newMemberAlerts: boolean;
  systemUpdates: boolean;
};

export default function LibrarianSettingsPage() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  // Server par theme pata nahi hota — mount se pehle switch render karne par
  // hydration mismatch aur flicker dono aate hain
  const [themeMounted, setThemeMounted] = useState(false);
  useEffect(() => setThemeMounted(true), []);

  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(true);

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [notifications, setNotifications] = useState<NotificationSettings>({
    emailNotifications: true,
    overdueReminders: true,
    newMemberAlerts: false,
    systemUpdates: true,
  });

  // load notification settings from API on mount
  useEffect(() => {
    const loadNotifications = async () => {
      try {
        setIsLoadingNotifications(true);
        const res = await api.getLibrarianNotificationSettings();
        if (res?.data) {
          setNotifications(res.data);
        }
      } catch (error: any) {
        console.error('[Settings] load notifications error', error);
        toast.error(
          error.message || 'Failed to load notification settings'
        );
      } finally {
        setIsLoadingNotifications(false);
      }
    };

    loadNotifications();
  }, []);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setIsSavingPassword(true);

    try {
      await api.changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });

      toast.success('Password changed successfully');

      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (error: any) {
      console.error('[Settings] change password error', error);
      toast.error(error.message || 'Failed to change password');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleNotificationToggle = (
    key: keyof NotificationSettings,
    value: boolean
  ) => {
    const newSettings = { ...notifications, [key]: value };
    setNotifications(newSettings);
    saveNotificationSettings(newSettings);

    const label = key
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());

    toast.success(`${label} ${value ? 'enabled' : 'disabled'}`);
  };

  const saveNotificationSettings = async (settings: NotificationSettings) => {
    try {
      setIsSavingNotifications(true);
      await api.updateLibrarianNotificationSettings(settings);
    } catch (error: any) {
      console.error('[Settings] save notifications error', error);
      toast.error(error.message || 'Failed to save notification settings');
    } finally {
      setIsSavingNotifications(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your preferences and security settings
        </p>
      </div>

      <LibrarySettingsCard />

      {/* Change Password */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            <CardTitle>Change Password</CardTitle>
          </div>
          <CardDescription>
            Update your password to keep your account secure
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            {/* Current Password */}
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
                  placeholder="Enter current password"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() =>
                    setShowCurrentPassword((prev) => !prev)
                  }
                >
                  {showCurrentPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* New Password */}
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
                  placeholder="Enter new password"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                >
                  {showNewPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Must be at least 8 characters long
              </p>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">
                Confirm New Password
              </Label>
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
                placeholder="Confirm new password"
                required
              />
            </div>

            <Button type="submit" disabled={isSavingPassword}>
              {isSavingPassword ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Changing Password...
                </>
              ) : (
                'Change Password'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            <CardTitle>Notification Preferences</CardTitle>
          </div>
          <CardDescription>
            Choose what notifications you want to receive
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingNotifications ? (
            <p className="text-sm text-muted-foreground">
              Loading notification settings...
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive email updates about your library
                  </p>
                </div>
                <Switch
                  checked={notifications.emailNotifications}
                  onCheckedChange={(checked) =>
                    handleNotificationToggle(
                      'emailNotifications',
                      checked
                    )
                  }
                  disabled={isSavingNotifications}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Overdue Reminders</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified about overdue books
                  </p>
                </div>
                <Switch
                  checked={notifications.overdueReminders}
                  onCheckedChange={(checked) =>
                    handleNotificationToggle(
                      'overdueReminders',
                      checked
                    )
                  }
                  disabled={isSavingNotifications}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>New Member Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when new members register
                  </p>
                </div>
                <Switch
                  checked={notifications.newMemberAlerts}
                  onCheckedChange={(checked) =>
                    handleNotificationToggle(
                      'newMemberAlerts',
                      checked
                    )
                  }
                  disabled={isSavingNotifications}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>System Updates</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications about system updates
                  </p>
                </div>
                <Switch
                  checked={notifications.systemUpdates}
                  onCheckedChange={(checked) =>
                    handleNotificationToggle(
                      'systemUpdates',
                      checked
                    )
                  }
                  disabled={isSavingNotifications}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Moon className="w-5 h-5" />
            <CardTitle>Appearance</CardTitle>
          </div>
          <CardDescription>
            Customize how the application looks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="dark-mode">Dark Mode</Label>
                <p className="text-sm text-muted-foreground">
                  Switch between light and dark themes
                </p>
              </div>
              <Switch
                id="dark-mode"
                disabled={!themeMounted}
                // resolvedTheme, kyunki theme "system" ho sakta hai — us case me
                // `theme === 'dark'` false aata hai jabki UI dark dikh rahi hoti hai
                checked={themeMounted ? resolvedTheme === 'dark' : false}
                onCheckedChange={(checked) =>
                  setTheme(checked ? 'dark' : 'light')
                }
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="system-theme">Follow system</Label>
                <p className="text-sm text-muted-foreground">
                  Follows your device setting automatically
                </p>
              </div>
              <Switch
                id="system-theme"
                disabled={!themeMounted}
                checked={themeMounted ? theme === 'system' : false}
                onCheckedChange={(checked) =>
                  setTheme(checked ? 'system' : resolvedTheme || 'light')
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}