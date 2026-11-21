import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  IdCard,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Phone,
  Save,
  Shield,
  User,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth, roleLabels } from "@/hooks/use-auth";
import type { User as UserType } from "@/types";
import { formatDate, formatDateTime, initials } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const profileSchema = z.object({
  full_name: z.string().min(2, "Full name must be at least 2 characters."),
  department: z.string().optional(),
  phone: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    current_password: z.string().min(1, "Please enter your current password."),
    new_password: z.string().min(6, "New password must be at least 6 characters."),
    confirm_password: z.string().min(1, "Please confirm your new password."),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "New passwords do not match.",
    path: ["confirm_password"],
  });

type PasswordFormValues = z.infer<typeof passwordSchema>;

export function ProfilePage() {
  const { user, updateUser } = useAuth();

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: user?.full_name ?? "",
      department: user?.department ?? "",
      phone: user?.phone ?? "",
    },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      current_password: "",
      new_password: "",
      confirm_password: "",
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: (values: ProfileFormValues) => api.put<UserType>("/auth/profile", values),
    onSuccess: (updatedUser) => {
      updateUser(updatedUser);
      toast.success("Profile details updated successfully.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to update profile.");
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (values: PasswordFormValues) =>
      api.post<{ message: string }>("/auth/change-password", {
        current_password: values.current_password,
        new_password: values.new_password,
      }),
    onSuccess: (res) => {
      toast.success(res.message || "Password changed successfully.");
      passwordForm.reset();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to change password.");
    },
  });

  if (!user) return null;

  return (
    <div className="page-container space-y-6 pb-12">
      <PageHeader
        eyebrow="Account"
        title="User Profile & Security"
        description="Review personal information, institutional affiliation, and update authentication credentials."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Profile Card & Institutional Info */}
        <div className="space-y-6 lg:col-span-4">
          <Card className="overflow-hidden border-border bg-card shadow-card text-center p-6">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 border-2 border-primary/20 text-primary text-2xl font-bold">
              {initials(user.full_name)}
            </div>
            <h2 className="mt-4 text-base font-bold text-foreground">{user.full_name}</h2>
            <p className="text-xs text-muted-foreground font-mono">@{user.username}</p>

            <div className="mt-3 flex items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                <Shield className="h-3 w-3" />
                {roleLabels[user.role]}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success-background px-2.5 py-0.5 text-xs font-semibold text-success">
                <UserCheck className="h-3 w-3" /> Active
              </span>
            </div>

            <div className="mt-6 border-t border-border pt-4 text-left space-y-3 text-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-primary" /> Email
                </span>
                <span className="font-medium text-foreground">{user.email}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <IdCard className="h-3.5 w-3.5 text-primary" /> Institutional ID
                </span>
                <span className="font-mono text-foreground">{user.identifier || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-primary" /> Department
                </span>
                <span className="font-medium text-foreground">{user.department || "General"}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary" /> Last Sign-in
                </span>
                <span className="text-foreground">
                  {user.last_login_at ? formatDateTime(user.last_login_at) : "Recent"}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-primary" /> Member Since
                </span>
                <span className="text-foreground">{formatDate(user.created_at)}</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Forms for Profile Update and Password Change */}
        <div className="space-y-6 lg:col-span-8">
          {/* Edit Profile Details */}
          <Card className="border-border bg-card shadow-card">
            <CardHeader className="border-b border-border bg-warm-200/30 p-4">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <User className="h-4 w-4 text-primary" /> Edit Personal Information
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Keep your laboratory profile details and contact number up to date.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              <form
                onSubmit={profileForm.handleSubmit((values) => updateProfileMutation.mutate(values))}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="prof-name">Full Name *</Label>
                    <Input id="prof-name" {...profileForm.register("full_name")} />
                    {profileForm.formState.errors.full_name ? (
                      <p className="text-[11px] text-danger">{profileForm.formState.errors.full_name.message}</p>
                    ) : null}
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="prof-email">Email Address (Read Only)</Label>
                    <Input id="prof-email" value={user.email} disabled className="opacity-70 bg-warm-200/50" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="prof-dept">Department / Division</Label>
                    <Input id="prof-dept" placeholder="e.g. Electrical Engineering" {...profileForm.register("department")} />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="prof-phone">Phone / Extension</Label>
                    <Input id="prof-phone" placeholder="e.g. +1 555 0102" {...profileForm.register("phone")} />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={updateProfileMutation.isPending} size="sm" className="h-8.5 font-semibold text-xs">
                    {updateProfileMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                    Save Profile
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Change Password */}
          <Card className="border-border bg-card shadow-card">
            <CardHeader className="border-b border-border bg-warm-200/30 p-4">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" /> Security & Password
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Update your account password. Choose a strong combination of characters.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              <form
                onSubmit={passwordForm.handleSubmit((values) => changePasswordMutation.mutate(values))}
                className="space-y-4"
              >
                <div className="space-y-1">
                  <Label htmlFor="current-pw">Current Password</Label>
                  <Input id="current-pw" type="password" {...passwordForm.register("current_password")} />
                  {passwordForm.formState.errors.current_password ? (
                    <p className="text-[11px] text-danger">{passwordForm.formState.errors.current_password.message}</p>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="new-pw">New Password</Label>
                    <Input id="new-pw" type="password" {...passwordForm.register("new_password")} />
                    {passwordForm.formState.errors.new_password ? (
                      <p className="text-[11px] text-danger">{passwordForm.formState.errors.new_password.message}</p>
                    ) : null}
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="confirm-pw">Confirm New Password</Label>
                    <Input id="confirm-pw" type="password" {...passwordForm.register("confirm_password")} />
                    {passwordForm.formState.errors.confirm_password ? (
                      <p className="text-[11px] text-danger">{passwordForm.formState.errors.confirm_password.message}</p>
                    ) : null}
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={changePasswordMutation.isPending} size="sm" className="h-8.5 font-semibold text-xs">
                    {changePasswordMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <KeyRound className="mr-1.5 h-3.5 w-3.5" />}
                    Update Password
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
