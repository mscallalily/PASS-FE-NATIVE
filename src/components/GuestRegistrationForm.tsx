import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { api, ApiError } from '../api/client';
import { C } from '../theme';
import { Btn, Card, ErrorBox, Field, T } from './ui';
import EmailCodeVerification from './EmailCodeVerification';

/** Public guest account sign-up, separate from school-ID registration. */
export default function GuestRegistrationForm({ onBack }: { onBack: () => void }) {
  const [values, setValues] = useState({ fullName: '', email: '', phone: '', password: '', confirmPwd: '', agree: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const set = (key: keyof typeof values, value: string | boolean) => {
    setValues(previous => ({ ...previous, [key]: value }));
    setErrors(previous => ({ ...previous, [key]: '' }));
  };

  const submit = async () => {
    if (busy) return;
    const next: Record<string, string> = {};
    if (!/^\S+(\s+\S+)+$/.test(values.fullName.trim())) next.fullName = 'Enter your first and last name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) next.email = 'Enter a valid email.';
    if (!/^(\+63|0)9\d{9}$/.test(values.phone.replace(/[\s-]/g, ''))) next.phone = 'Enter a Philippine mobile number like 09171234567.';
    if (values.password.length < 8 || !/[A-Za-z]/.test(values.password) || !/\d/.test(values.password)) next.password = 'Use 8 or more characters with letters and numbers.';
    if (values.password !== values.confirmPwd) next.confirmPwd = 'Passwords do not match.';
    if (!values.agree) next.agree = 'Agree to the terms to create your account.';
    setErrors(next); setNotice('');
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const result = await api<{ message?: string }>('/guest/register', { method: 'POST', json: {
        full_name: values.fullName.trim(), email: values.email.trim(), contact_number: values.phone.trim(),
        password: values.password, password_confirmation: values.confirmPwd, agree: true,
      }});
      setNotice(result.message || 'Check your inbox for a verification code.');
      setSubmitted(true);
    } catch (e) {
      if (e instanceof ApiError) {
        const names: Record<string, string> = { full_name: 'fullName', contact_number: 'phone', password_confirmation: 'confirmPwd' };
        const nextErrors: Record<string, string> = {};
        for (const [key, value] of Object.entries(e.errors)) nextErrors[names[key] ?? key] = value[0];
        setErrors(nextErrors);
      }
      setNotice(e instanceof ApiError && e.status === 404
        ? 'Guest registration is not available on this Laravel backend. The current web backend is required.'
        : e instanceof Error ? e.message : 'Could not register. Please try again.');
    } finally { setBusy(false); }
  };

  if (submitted) return <EmailCodeVerification initialEmail={values.email.trim()} notice={notice} onBack={onBack} />;
  return <View style={{ gap: 16 }}>
    <Card bg={C.amber50} border={C.slate200}><T s={13}>Guest account creation is not parking approval. After verifying your email and signing in, you must submit your visit schedule and vehicle details. A temporary QR pass is issued only after staff approval.</T></Card>
    <Field label="Full Name" placeholder="Juan Dela Cruz" value={values.fullName} onChangeText={value => set('fullName', value)} error={errors.fullName} />
    <Field label="Email Address" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={values.email} onChangeText={value => set('email', value)} error={errors.email} />
    <Field label="Contact Number" keyboardType="phone-pad" placeholder="09171234567" value={values.phone} onChangeText={value => set('phone', value)} error={errors.phone} />
    <Field label="Password" placeholder="8+ characters, letters and numbers" autoCapitalize="none" secureTextEntry={!showPassword} value={values.password} onChangeText={value => set('password', value)} error={errors.password} />
    <Field label="Confirm Password" autoCapitalize="none" secureTextEntry={!showPassword} value={values.confirmPwd} onChangeText={value => set('confirmPwd', value)} error={errors.confirmPwd} />
    <Pressable onPress={() => setShowPassword(!showPassword)}><T s={13} c={C.royal}>{showPassword ? 'Hide passwords' : 'Show passwords'}</T></Pressable>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: values.agree }} onPress={() => set('agree', !values.agree)} style={{ flexDirection: 'row', gap: 9 }}>
      <T s={18} c={C.royal}>{values.agree ? '☑' : '☐'}</T><T s={13} style={{ flex: 1 }}>I agree to the PASS Terms and Conditions and Privacy Notice. I understand this is a guest account.</T>
    </Pressable>
    {!!errors.agree && <T s={12} c={C.red600}>{errors.agree}</T>}
    {!!notice && <ErrorBox>{notice}</ErrorBox>}
    <Btn label="Create Guest Account" loading={busy} disabled={!values.agree} onPress={() => void submit()} />
    <Pressable onPress={onBack} style={{ alignItems: 'center', padding: 8 }}><T s={13} c={C.royal}>Back to sign in</T></Pressable>
  </View>;
}
