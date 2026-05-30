import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useCurrentUser } from '@/lib/hooks/use-current-user';
import { useAuthStore } from '@/lib/auth/auth-store';
import { usersApi } from '@/lib/api/users.api';
import { apiErrorMessage } from '@/lib/api/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Tabs } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  password: z.string().max(120).optional().or(z.literal('')),
});
type Form = z.infer<typeof schema>;

export const SettingsPage = () => {
  const [tab, setTab] = useState<'profile' | 'prefs'>('profile');
  const { user } = useCurrentUser();
  const setAuthUser = useAuthStore((s) => s.setUser);

  const { register, handleSubmit, formState, reset } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { name: user?.name ?? '', password: '' },
  });

  const mutation = useMutation({
    mutationFn: (data: Form) => {
      if (!user) throw new Error('Not authenticated');
      return usersApi.update(user.id, {
        name: data.name,
        password: data.password || undefined,
      });
    },
    onSuccess: (updatedUser) => {
      toast.success('Profile updated successfully');
      setAuthUser({ ...user!, name: updatedUser.name });
      reset({ name: updatedUser.name, password: '' });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  return (
    <>
      <PageHeader title="Settings" />
      <Tabs
        active={tab}
        onChange={(k) => setTab(k as 'profile' | 'prefs')}
        tabs={[
          { key: 'profile', label: 'Profile' },
          { key: 'prefs', label: 'Preferences' },
        ]}
      />
      {tab === 'profile' ? (
        <Card>
          <CardHeader>Profile</CardHeader>
          <CardBody>
            <form onSubmit={handleSubmit((v) => mutation.mutate(v))}>
              <FormField label="Email">
                <Input value={user?.email ?? ''} disabled />
              </FormField>
              <FormField label="Name" htmlFor="name" error={formState.errors.name?.message}>
                <Input id="name" {...register('name')} />
              </FormField>
              <FormField label="New password" htmlFor="password" help="Leave empty to keep current password." error={formState.errors.password?.message}>
                <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
              </FormField>
              <div className="mt-4">
                <Button type="submit" variant="primary" loading={mutation.isPending}>
                  Save changes
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader>Preferences</CardHeader>
          <CardBody>
            <FormField label="Language" help="More languages in Phase 4.">
              <Select defaultValue="en">
                <option value="en">English</option>
              </Select>
            </FormField>
            <FormField label="Default landing page">
              <Select defaultValue="dashboard">
                <option value="dashboard">Dashboard</option>
                <option value="exams">Exams</option>
              </Select>
            </FormField>
          </CardBody>
        </Card>
      )}
    </>
  );
};
