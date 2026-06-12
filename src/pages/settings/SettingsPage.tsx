import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useCurrentUser } from '@/lib/hooks/use-current-user';
import { useAuthStore } from '@/lib/auth/auth-store';
import { usersApi } from '@/lib/api/users.api';
import { branchesApi } from '@/lib/api/branches.api';
import { apiErrorMessage } from '@/lib/api/client';
import type { Role } from '@/lib/types';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Tabs } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
};

const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

const profileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
});
type ProfileForm = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    password: z.string().min(8, 'Must be at least 8 characters').max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });
type PasswordForm = z.infer<typeof passwordSchema>;

type TabKey = 'profile' | 'security' | 'prefs';

/** A read-only label/value row used in the Account summary. */
const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between gap-4 border-b border-border-soft py-2.5 last:border-0">
    <span className="text-xs font-medium uppercase tracking-[0.4px] text-text-faint">{label}</span>
    <span className="text-sm text-text">{value}</span>
  </div>
);

export const SettingsPage = () => {
  const [tab, setTab] = useState<TabKey>('profile');
  const { user } = useCurrentUser();
  const setAuthUser = useAuthStore((s) => s.setUser);

  // Resolve the branch name for the Account summary. Only fetched when the user
  // actually has a branch; failures (e.g. a role without /branches access) are
  // swallowed so the row simply doesn't render — never a broken state.
  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list(),
    staleTime: 5 * 60 * 1000,
    enabled: !!user?.branchId,
    retry: false,
  });
  const branchName = user?.branchId
    ? branches.data?.data.find((b) => b.id === user.branchId)?.name
    : undefined;

  const profile = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    values: { name: user?.name ?? '' },
  });

  const password = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', confirm: '' },
  });

  const saveProfile = useMutation({
    mutationFn: (data: ProfileForm) => {
      if (!user) throw new Error('Not authenticated');
      return usersApi.update(user.id, { name: data.name });
    },
    onSuccess: (updated) => {
      toast.success('Profile updated');
      setAuthUser({ ...user!, name: updated.name });
      profile.reset({ name: updated.name });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const savePassword = useMutation({
    mutationFn: (data: PasswordForm) => {
      if (!user) throw new Error('Not authenticated');
      return usersApi.update(user.id, { password: data.password });
    },
    onSuccess: () => {
      toast.success('Password updated');
      password.reset({ password: '', confirm: '' });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <>
      <PageHeader title="Settings" />
      <Tabs
        active={tab}
        onChange={(k) => setTab(k as TabKey)}
        tabs={[
          { key: 'profile', label: 'Profile' },
          { key: 'security', label: 'Security' },
          { key: 'prefs', label: 'Preferences' },
        ]}
      />

      <div className="mx-auto max-w-2xl space-y-4 pt-4">
        {tab === 'profile' ? (
          <>
            <Card>
              <CardHeader>Profile</CardHeader>
              <CardBody className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                    {user ? initialsOf(user.name) : '?'}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-text">
                      {user?.name ?? '—'}
                    </div>
                    {user ? (
                      <span className="mt-0.5 inline-flex items-center rounded-full bg-subtle px-2 py-0.5 text-[11px] font-medium text-text-muted">
                        {ROLE_LABEL[user.role]}
                      </span>
                    ) : null}
                  </div>
                </div>

                <form
                  onSubmit={profile.handleSubmit((v) => saveProfile.mutate(v))}
                  className="space-y-4 border-t border-border-soft pt-4"
                >
                  <FormField
                    label="Full name"
                    htmlFor="name"
                    error={profile.formState.errors.name?.message}
                  >
                    <Input id="name" {...profile.register('name')} />
                  </FormField>
                  <div>
                    <Button
                      type="submit"
                      variant="primary"
                      loading={saveProfile.isPending}
                      disabled={!profile.formState.isDirty}
                    >
                      Save changes
                    </Button>
                  </div>
                </form>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>Account</CardHeader>
              <CardBody className="py-1">
                <InfoRow label="Email" value={user?.email ?? '—'} />
                <InfoRow label="Role" value={user ? ROLE_LABEL[user.role] : '—'} />
                {branchName ? <InfoRow label="Branch" value={branchName} /> : null}
              </CardBody>
            </Card>
          </>
        ) : tab === 'security' ? (
          <Card>
            <CardHeader>Password</CardHeader>
            <CardBody>
              <form
                onSubmit={password.handleSubmit((v) => savePassword.mutate(v))}
                className="space-y-4"
              >
                <FormField
                  label="New password"
                  htmlFor="password"
                  help="Use at least 8 characters."
                  error={password.formState.errors.password?.message}
                >
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    {...password.register('password')}
                  />
                </FormField>
                <FormField
                  label="Confirm new password"
                  htmlFor="confirm"
                  error={password.formState.errors.confirm?.message}
                >
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    {...password.register('confirm')}
                  />
                </FormField>
                <div>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={savePassword.isPending}
                    disabled={!password.formState.isDirty}
                  >
                    Update password
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardHeader>Preferences</CardHeader>
            <CardBody>
              <FormField label="Language" help="Additional languages coming soon.">
                <div className="form-input flex items-center gap-2 bg-subtle text-text-muted">
                  English
                </div>
              </FormField>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
};
