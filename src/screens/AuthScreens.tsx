import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AlertTriangle, ArrowLeft, Eye, EyeOff, LogIn, UserPlus } from 'lucide-react-native';
import { PassMark } from '../components/Brand';
import RegistrationForm from '../components/RegistrationForm';
import GuestRegistrationForm from '../components/GuestRegistrationForm';
import EmailCodeVerification from '../components/EmailCodeVerification';
import { Btn, ErrorBox, Field, Frame, T, txt } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { C, withAlpha } from '../theme';
import { api } from '../api/client';

export function WelcomeScreen({ onLogin, onRegister, onGuestRegister }: { onLogin: () => void; onRegister: () => void; onGuestRegister?: () => void }) {
  const { continueAsGuest } = useAuth();
  return (
    <Frame bg={C.navy} centered>
      <View style={{ alignItems: 'center', paddingHorizontal: 32, paddingVertical: 48 }}>
        <View style={{
          marginBottom: 20, backgroundColor: C.white, borderRadius: 100, overflow: 'hidden',
          shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 8,
        }}>
          <PassMark size="xl" />
        </View>
        <T s={30} w="head" c={C.white} style={{ marginBottom: 4 }}>PASS</T>
        <T s={14} c={C.blue200} style={{ marginBottom: 8 }}>Parking Access & Space Management</T>
        <T s={12} c={C.blue300} style={{ marginBottom: 48 }}>Mobile App</T>

        <View style={{ alignSelf: 'stretch', gap: 12 }}>
          <Btn label="Sign In" onPress={onLogin} bg={C.white} color={C.navy} radius={16}
            icon={<LogIn size={20} color={C.navy} />} />
          <Btn label="Create Account" onPress={onRegister} bg={withAlpha(C.sky, 0.2)} border={withAlpha(C.sky, 0.3)}
            color={C.white} radius={16} icon={<UserPlus size={20} color={C.white} />} />
          {!!onGuestRegister && <Pressable onPress={onGuestRegister} style={{ alignItems: 'center', paddingVertical: 9 }}>
            <T s={14} w="semibold" c={C.blue200}>Create Guest Account</T>
          </Pressable>}
          <Pressable onPress={continueAsGuest} style={({ pressed }) => ({ paddingVertical: 12, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
            <Text style={txt(14, 'medium', C.blue300)}>Continue as Guest</Text>
          </Pressable>
        </View>

        <T s={12} c={C.blue400} style={{ marginTop: 40, textAlign: 'center', lineHeight: 20, maxWidth: 320 }}>
          Sign in to access your parking dashboard, view slot availability, and manage your QR pass.
        </T>
      </View>
    </Frame>
  );
}

export function GuestRegisterScreen({ onBack }: { onBack: () => void }) {
  return <Frame bg={C.white}><View style={{ paddingHorizontal: 24, paddingVertical: 32, gap: 20 }}>
    <T s={24} w="head" c={C.navy} style={{ textAlign: 'center' }}>Guest Registration</T>
    <GuestRegistrationForm onBack={onBack} />
  </View></Frame>;
}

export function LoginScreen({ onBack, onForgot, onVerify }: { onBack: () => void; onForgot?: () => void; onVerify: (email: string) => void }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!email.trim() || loading) return;
    setError('');
    setLoading(true);
    try {
      await login(email, pwd); // success flips the app into the signed-in tabs
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to sign in. Please try again.');
      setLoading(false);
    }
  };

  return (
    <Frame bg={C.white}>
      <View style={{ paddingHorizontal: 24, paddingVertical: 32 }}>
        <Pressable onPress={onBack} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 24 }}>
          <ArrowLeft size={18} color={C.royal} />
          <Text style={txt(14, 'medium', C.royal)}>Back</Text>
        </Pressable>

        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <View style={{ marginBottom: 16 }}><PassMark size="xl" /></View>
          <T s={24} w="head" c={C.navy}>Sign In</T>
          <T s={14} c={C.slate400} style={{ marginTop: 4 }}>PASS Mobile</T>
        </View>

        {error ? (
          <View style={{ backgroundColor: C.red50, borderColor: C.red200, borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', gap: 8, marginBottom: 20 }}>
            <AlertTriangle size={16} color={C.red700} style={{ marginTop: 2 }} />
            <Text style={[txt(14, 'regular', C.red700), { flex: 1 }]}>{error}</Text>
          </View>
        ) : null}

        <View style={{ gap: 16 }}>
          <Field label="Email or ID" value={email} onChangeText={setEmail} placeholder="email@university.edu"
            autoCapitalize="none" autoCorrect={false} keyboardType="email-address" returnKeyType="next" />
          <Field label="Password" value={pwd} onChangeText={setPwd} placeholder="••••••••" secureTextEntry={!showPwd}
            autoCapitalize="none" returnKeyType="go" onSubmitEditing={submit}
            right={
              <Pressable onPress={() => setShowPwd(v => !v)} hitSlop={10} accessibilityLabel={showPwd ? 'Hide password' : 'Show password'}>
                {showPwd ? <EyeOff size={18} color={C.slate400} /> : <Eye size={18} color={C.slate400} />}
              </Pressable>
            } />
          <Btn label={loading ? 'Signing in...' : 'Sign In'} onPress={submit} disabled={!email.trim()} loading={loading} />
          <Pressable onPress={onForgot}><T s={13} c={C.royal} style={{textAlign:'center'}}>Forgot password?</T></Pressable>
          <Pressable onPress={() => onVerify(email.trim())} accessibilityRole="button" style={{ paddingVertical: 8 }}>
            <T s={13} c={C.royal} style={{ textAlign: 'center' }}>Verify email / resend code</T>
          </Pressable>
        </View>
      </View>
    </Frame>
  );
}

export function VerifyEmailScreen({ initialEmail, onBack }: { initialEmail?: string; onBack: () => void }) {
  return <Frame bg={C.white}><View style={{ paddingHorizontal: 24, paddingVertical: 32 }}>
    <EmailCodeVerification initialEmail={initialEmail} onBack={onBack} />
  </View></Frame>;
}

export function RegisterScreen({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  return (
    <Frame bg={C.white}>
      <View style={{ paddingHorizontal: 24, paddingVertical: 32 }}>
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <View style={{ marginBottom: 12 }}><PassMark size="lg" /></View>
          <T s={24} w="head" c={C.navy}>Create Account</T>
        </View>
        <RegistrationForm onExit={onBack} onBackToLogin={onDone} />
      </View>
    </Frame>
  );
}


/** Laravel password-broker endpoints; a reset token comes only from the email link. */
export function ForgotPasswordScreen({ onBack, onReset }: { onBack: () => void; onReset: () => void }) {
  const [email,setEmail] = useState(''); const [msg,setMsg] = useState(''); const [busy,setBusy] = useState(false);
  const submit = async () => {setBusy(true);setMsg('');try{const r=await api<{message:string}>('/forgot-password',{method:'POST',json:{email:email.trim()}});setMsg(r.message);}catch(e){setMsg(e instanceof Error ? e.message : 'Could not request reset.');}finally{setBusy(false);}};
  return <Frame><View style={{padding:24,gap:16}}><Pressable onPress={onBack}><T s={14} c={C.royal}>‹ Back to login</T></Pressable><T s={24} w="head" c={C.navy}>Forgot Password</T><Field label="Account email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"/><Btn label="Email reset link" disabled={!email.includes('@')} loading={busy} onPress={()=>void submit()}/>{!!msg && <T s={13}>{msg}</T>}<Pressable onPress={onReset}><T s={13} c={C.royal}>I have a reset token</T></Pressable></View></Frame>;
}
export function ResetPasswordScreen({ onBack }: {onBack: () => void}) {
  const [email,setEmail] = useState('');const [resetToken,setResetToken] = useState('');const [password,setPassword] = useState('');const [confirmation,setConfirmation] = useState('');const [msg,setMsg] = useState('');const [busy,setBusy] = useState(false);
  const submit = async () => {setBusy(true);setMsg('');try{const r=await api<{message:string}>('/reset-password',{method:'POST',json:{email:email.trim(),token:resetToken.trim(),password,password_confirmation:confirmation}});setMsg(r.message);}catch(e){setMsg(e instanceof Error ? e.message : 'Reset failed.');}finally{setBusy(false);}};
  return <Frame><View style={{padding:24,gap:14}}><Pressable onPress={onBack}><T s={14} c={C.royal}>‹ Back</T></Pressable><T s={24} w="head" c={C.navy}>Reset Password</T><Field label="Account email" value={email} onChangeText={setEmail} autoCapitalize="none"/><Field label="Reset token (from email link)" value={resetToken} onChangeText={setResetToken}/><Field label="New password" value={password} onChangeText={setPassword} secureTextEntry/><Field label="Confirm new password" value={confirmation} onChangeText={setConfirmation} secureTextEntry/><Btn label="Reset password" disabled={!email||!resetToken||!password||!confirmation} loading={busy} onPress={()=>void submit()}/>{!!msg && <T s={13}>{msg}</T>}</View></Frame>;
}
