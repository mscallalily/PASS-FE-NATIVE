import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { CheckCircle, Mail } from 'lucide-react-native';
import { api } from '../api/client';
import { C } from '../theme';
import { Btn, Card, ErrorBox, Field, T } from './ui';

/** Public six-digit email flow. The Laravel response determines account activation. */
export default function EmailCodeVerification({ initialEmail = '', notice = '', onBack }: {
  initialEmail?: string; notice?: string; onBack: () => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(notice);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!cooldown) return;
    const id = setTimeout(() => setCooldown(value => Math.max(value - 1, 0)), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const request = async (verify: boolean) => {
    if (busy || (verify === false && cooldown > 0)) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter your registered email address.'); return; }
    if (verify && !/^\d{6}$/.test(code)) { setError('Enter the six-digit code sent to your email.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await api<{ message: string }>(verify ? '/email/verify-code' : '/email/verification-notification', {
        method: 'POST', json: { email: email.trim(), ...(verify ? { code } : {}) }, timeoutMs: 25000,
      });
      setMessage(response.message || (verify ? 'Your email has been verified.' : 'Check your inbox for a new code.'));
      if (verify) setVerified(true);
      else { setCooldown(60); setCode(''); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not contact PASS. Please retry.');
    } finally { setBusy(false); }
  };

  return <View style={{ gap: 17 }}>
    <View style={{ alignItems: 'center', gap: 8 }}>
      {verified ? <CheckCircle color={C.green600} size={40} /> : <Mail color={C.royal} size={40} />}
      <T s={23} w="head" c={C.navy}>{verified ? 'Email verified' : 'Verify your email'}</T>
      <T s={13} c={C.slate500} style={{ textAlign: 'center' }}>Enter the 6-digit code from your inbox. Codes expire in 10 minutes. Check your spam folder too.</T>
    </View>
    {!!message && <Card bg={C.green50} border={C.green200}><T s={13} c={C.navy}>{message}</T></Card>}
    {!!error && <ErrorBox>{error}</ErrorBox>}
    {!verified && <View style={{ gap: 15 }}>
      <Field label="Email address" value={email} onChangeText={value => { setEmail(value); setError(''); }}
        autoCapitalize="none" autoCorrect={false} keyboardType="email-address" editable={!busy} />
      <Field label="Verification code" value={code} onChangeText={value => { setCode(value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
        keyboardType="number-pad" textContentType="oneTimeCode" maxLength={6} editable={!busy} placeholder="000000" />
      <Btn label="Verify email" loading={busy} disabled={code.length !== 6} onPress={() => void request(true)} />
      <Btn label={cooldown ? `Resend code in ${cooldown}s` : 'Send / resend code'} py={12}
        color={C.royal} bg={C.blue50} border={C.blue100} disabled={busy || cooldown > 0} onPress={() => void request(false)} />
    </View>}
    <Pressable onPress={onBack} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 10 }}>
      <T s={14} w="semibold" c={C.royal}>{verified ? 'Continue to sign in' : 'Back to sign in'}</T>
    </Pressable>
  </View>;
}
