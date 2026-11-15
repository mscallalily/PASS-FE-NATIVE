import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { C } from '../theme';
import { Btn, Card, Field, T } from './ui';
import { Select } from './Select';

interface Profile {
  full_name?: string;
  name?: string;
  email?: string;
  contact_number: string;
  affiliation?: string | null;
  registration_category?: string | null;
  year_level?: string | null;
  section?: string | null;
}

/** Backend-owned, verified profile changes. Identity numbers and roles are never editable here. */
export default function AccountProfilePanel({ onPasswordChanged }: { onPasswordChanged: () => void }) {
  const { token, user, refreshUser } = useAuth();
  const guest = user?.role === 'guest';
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [password, setPassword] = useState({ current_password: '', password: '', password_confirmation: '' });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      if (guest) {
        const data = await api<Profile>('/guest/profile', { token });
        setProfile(data);
      } else {
        const data = await api<{ data: Profile }>('/profile', { token });
        setProfile(data.data);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load your profile.'); }
    finally { setLoading(false); }
  }, [token, guest]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!token || !profile || saving) return;
    if (!/^(09\d{9}|\+639\d{9})$/.test(profile.contact_number.replace(/[\s-]/g, ''))) {
      setError('Enter a valid Philippine contact number, such as 09171234567.'); return;
    }
    if (guest && !/^\S+(\s+\S+)+$/.test(profile.full_name?.trim() ?? '')) {
      setError('Enter your first and last name.'); return;
    }
    if (!guest && profile.registration_category === 'shs' &&
      (!['11', '12'].includes(profile.year_level ?? '') || !profile.section?.trim())) {
      setError('Choose your SHS grade level and enter your section.'); return;
    }
    setSaving(true); setError(''); setMessage('');
    try {
      const path = guest ? '/guest/profile' : '/profile';
      const body = guest
        ? { full_name: profile.full_name?.trim(), contact_number: profile.contact_number.replace(/[\s-]/g, ''), affiliation: profile.affiliation?.trim() ?? '' }
        : { contact_number: profile.contact_number.replace(/[\s-]/g, ''),
          ...(profile.registration_category === 'shs' ? { year_level: profile.year_level, section: profile.section?.trim() } : {}) };
      const result = await api<{ message: string }>(path, { method: 'PATCH', token, json: body });
      setMessage(result.message || 'Profile updated.'); setEditing(false);
      await load();
      if (guest) await refreshUser();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update your profile.'); }
    finally { setSaving(false); }
  };

  const changePassword = async () => {
    if (!token || saving) return;
    if (password.password.length < 8 || password.password !== password.password_confirmation) {
      setError('Choose a new password with at least eight characters and confirm it exactly.'); return;
    }
    setSaving(true); setError(''); setMessage('');
    try {
      await api('/profile/password', { method: 'POST', token, json: password });
      // Laravel revokes all tokens after changing the password; leave the secured app.
      onPasswordChanged();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not change your password.'); }
    finally { setSaving(false); }
  };

  if (!token) return <Card bg={C.blue50}><T s={13}>Create a guest account and sign in to edit your contact details and account settings.</T></Card>;

  return <Card style={{ gap: 12 }}>
    <T s={16} w="bold" c={C.navy}>Account settings</T>
    {loading && <T s={12} c={C.slate500}>Loading account details…</T>}
    {!!message && <Card bg={C.green50}><T s={12}>{message}</T></Card>}
    {!!error && <Card bg={C.red50}><T s={12} c={C.red700}>{error}</T></Card>}
    {!!profile && <>
      <T s={13}>Contact: {profile.contact_number || 'Not set'}</T>
      {guest && <T s={13}>Affiliation: {profile.affiliation || 'Not provided'}</T>}
      {profile.registration_category === 'shs' && <T s={13}>Grade: {profile.year_level || '—'} · Section: {profile.section || '—'}</T>}
      <Btn label={editing ? 'Cancel editing' : 'Edit contact and school details'} bg={C.blue50} color={C.royal} py={10}
        onPress={() => { setEditing(value => !value); setError(''); }} />
      {editing && <View style={{ gap: 12 }}>
        {guest && <Field label="Full name" value={profile.full_name ?? ''} onChangeText={value => setProfile(previous => previous && ({ ...previous, full_name: value }))} />}
        <Field label="Contact number" keyboardType="phone-pad" value={profile.contact_number ?? ''}
          onChangeText={value => setProfile(previous => previous && ({ ...previous, contact_number: value }))} />
        {guest && <Field label="Affiliation (optional)" value={profile.affiliation ?? ''}
          onChangeText={value => setProfile(previous => previous && ({ ...previous, affiliation: value }))} />}
        {profile.registration_category === 'shs' && <>
          <Select label="Grade level" value={profile.year_level ?? ''} options={[{ label: 'Grade 11', value: '11' }, { label: 'Grade 12', value: '12' }]}
            onChange={value => setProfile(previous => previous && ({ ...previous, year_level: value }))} />
          <Field label="Section" value={profile.section ?? ''}
            onChangeText={value => setProfile(previous => previous && ({ ...previous, section: value }))} />
        </>}
        <Btn label="Save profile" loading={saving} onPress={() => void save()} py={11} />
      </View>}
    </>}
    <Btn label={changingPassword ? 'Hide password form' : 'Change password'} py={10} bg={C.navy}
      onPress={() => { setChangingPassword(value => !value); setError(''); }} />
    {changingPassword && <View style={{ gap: 12 }}>
      <T s={12} c={C.slate500}>After changing your password, PASS signs you out of every device.</T>
      <Field label="Current password" secureTextEntry autoCapitalize="none" value={password.current_password}
        onChangeText={value => setPassword(previous => ({ ...previous, current_password: value }))} />
      <Field label="New password" secureTextEntry autoCapitalize="none" value={password.password}
        onChangeText={value => setPassword(previous => ({ ...previous, password: value }))} />
      <Field label="Confirm new password" secureTextEntry autoCapitalize="none" value={password.password_confirmation}
        onChangeText={value => setPassword(previous => ({ ...previous, password_confirmation: value }))} />
      <Btn label="Update password and sign out" loading={saving} py={11} onPress={() => void changePassword()} />
    </View>}
  </Card>;
}
