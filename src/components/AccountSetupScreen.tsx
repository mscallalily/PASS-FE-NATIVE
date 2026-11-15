import React, { useState } from 'react';
import { View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { C } from '../theme';
import { Btn, Card, Field, Frame, T } from './ui';

/** An invited administrator/security account has a restricted setup-only Sanctum token. */
export default function AccountSetupScreen() {
  const { user, token, refreshUser, finishAccountSetup, logout } = useAuth();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const state = user?.accountSetup;

  const perform = async (kind: 'resend' | 'verify' | 'complete') => {
    if (!token || busy) return;
    if (kind === 'verify' && !/^\d{6}$/.test(code)) { setError('Enter the six-digit invitation code.'); return; }
    if (kind === 'complete' && (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$/.test(password) || password !== confirmPassword)) {
      setError('Use at least 12 characters with upper/lowercase letters and a number, then confirm it.'); return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      if (kind === 'complete') {
        const result = await api<{ token: string; message: string }>('/account/setup/complete', {
          token, method: 'POST', json: { password, password_confirmation: confirmPassword },
        });
        if (!result.token) throw new Error('The server did not provide an activated session.');
        await finishAccountSetup(result.token);
        setPassword(''); setConfirmPassword('');
        return;
      }
      const result = await api<{ message: string }>(kind === 'resend' ? '/account/setup/resend-code' : '/account/setup/verify', {
        token, method: 'POST', json: kind === 'verify' ? { code } : {},
      });
      setMessage(result.message || 'Request completed.');
      await refreshUser();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not complete account setup.'); }
    finally { setBusy(false); }
  };

  return <Frame bg={C.bg}><View style={{ padding: 24, gap: 16 }}>
    <View style={{ alignItems: 'center', gap: 9, paddingVertical: 12 }}>
      <ShieldCheck size={42} color={C.royal} />
      <T s={23} w="head" c={C.navy}>Activate your PASS staff account</T>
      <T s={13} c={C.slate500} style={{ textAlign: 'center' }}>{user?.email ?? ''}</T>
    </View>
    <Card style={{ gap: 14 }}>
      <T s={15} w="semibold" c={C.navy}>{state?.step === 'change_password' ? 'Step 2 · Set a personal password' : 'Step 1 · Verify invitation email'}</T>
      {!!state?.expired && <Card bg={C.amber50}><T s={13}>This invitation has expired. Ask your PASS administrator to resend the invitation.</T></Card>}
      {!!error && <Card bg={C.red50}><T s={13} c={C.red700}>{error}</T></Card>}
      {!!message && <Card bg={C.green50}><T s={13}>{message}</T></Card>}
      {!state?.expired && state?.step === 'verify_email' && <>
        <T s={13}>Enter the six-digit activation code from your invitation email. It is separate from a regular student's verification code.</T>
        <Field label="Invitation code" keyboardType="number-pad" textContentType="oneTimeCode" autoCapitalize="none"
          value={code} onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" />
        <Btn label="Verify activation code" disabled={code.length !== 6 || busy} loading={busy} onPress={() => void perform('verify')} />
        <Btn label="Request another invitation code" disabled={busy} py={10} bg={C.blue50} color={C.royal}
          onPress={() => void perform('resend')} />
      </>}
      {!state?.expired && state?.step === 'change_password' && <>
        <T s={13}>Email activated. Set a new password to replace the temporary password. PASS will issue a full-access token only after this succeeds.</T>
        <Field label="New password (12+ characters, mixed case and a number)" secureTextEntry autoCapitalize="none"
          value={password} onChangeText={setPassword} />
        <Field label="Confirm new password" secureTextEntry autoCapitalize="none"
          value={confirmPassword} onChangeText={setConfirmPassword} />
        <Btn label="Finish account activation" disabled={busy || !password || !confirmPassword} loading={busy}
          onPress={() => void perform('complete')} />
      </>}
      <Btn label="Sign out" bg={C.slate200} color={C.navy} py={10} onPress={() => void logout()} />
    </Card>
  </View></Frame>;
}
