import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Poppins_600SemiBold } from '@expo-google-fonts/poppins/600SemiBold';
import { Poppins_700Bold } from '@expo-google-fonts/poppins/700Bold';
import { Bell, Clock, Home, ParkingSquare, QrCode, User, ShieldCheck, Settings2, ClipboardList } from 'lucide-react-native';
import { notificationApi } from './src/services/notifications';
import { AuthProvider, MobileRole, useAuth } from './src/context/AuthContext';
import AccountSetupScreen from './src/components/AccountSetupScreen';
import { LicenseProvider } from './src/context/LicenseContext';
import { LoginScreen, RegisterScreen, GuestRegisterScreen, WelcomeScreen, ForgotPasswordScreen, ResetPasswordScreen, VerifyEmailScreen } from './src/screens/AuthScreens';
import { HistoryScreen, HomeScreen, NotificationScreen, ParkingScreen } from './src/screens/MainScreens';
import { GuestRequestScreen, LicenseScreen, ProfileScreen, QRPassScreen, VehicleScreen, useGuestRequest } from './src/screens/MoreScreens';
import { GuestHomeScreen } from './src/screens/GuestScreens';
import { MobileScreen } from './src/screens/shared';
import { AdminDashboardScreen, StaffDashboardScreen, DataModuleScreen, ModuleMenu } from './src/screens/OperationsScreens';
import VehicleReleaseScreen from './src/screens/VehicleReleaseScreen';
import { type ModuleKey, isStaff, canAccessModule } from './src/permissions';
import { C, F } from './src/theme';

function navItems(role: MobileRole): { key: MobileScreen; label: string; Icon: any }[] {
  if (isStaff(role)) {
    return [
      { key: 'home', label: 'Dashboard', Icon: Home },
      { key: 'modules', label: role === 'security' ? 'Security' : role === 'admin' ? 'Manage' : 'Operations', Icon: role === 'security' ? ShieldCheck : role === 'admin' ? Settings2 : ClipboardList },
      { key: 'parking', label: 'Parking', Icon: ParkingSquare },
      { key: 'notifications', label: 'Alerts', Icon: Bell },
      { key: 'profile', label: 'Profile', Icon: User },
    ];
  }
  if (role === 'guest') {
    return [
      { key: 'home', label: 'Home', Icon: Home },
      { key: 'qr', label: 'Visitor Pass', Icon: QrCode },
      { key: 'parking', label: 'Parking', Icon: ParkingSquare },
      { key: 'profile', label: 'Profile', Icon: User },
    ];
  }
  return [
    { key: 'home', label: 'Home', Icon: Home },
    { key: 'parking', label: 'Parking', Icon: ParkingSquare },
    { key: 'history', label: 'History', Icon: Clock },
    { key: 'notifications', label: 'Notifs', Icon: Bell },
    { key: 'profile', label: 'Profile', Icon: User },
  ];
}

function BottomNav({ role, active, onChange, unreadCount = 0 }: { role: MobileRole; active: MobileScreen; onChange: (s: MobileScreen) => void; unreadCount?: number }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.slate100, flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 9, paddingTop: 7, height: 73 + insets.bottom, paddingBottom: insets.bottom + 4, shadowColor: C.navy, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -3 }, elevation: 8 }}>
      {navItems(role).map(({ key, label, Icon }) => {
        const highlightedTab = active === 'module-detail' ? 'modules' : ['vehicles', 'license', 'guest-request', 'release'].includes(active) ? 'profile' : active;
        const on = highlightedTab === key;
        return (
          <Pressable key={key} accessibilityRole="tab" accessibilityLabel={key === 'notifications' && unreadCount > 0 ? `${label}, ${unreadCount} unread` : label} accessibilityState={{ selected: on }} onPress={() => onChange(key)} style={({ pressed }) => ({ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 2, borderRadius: 14, backgroundColor: pressed ? C.slate50 : C.white })}>
            <View style={{ width: 48, height: 35, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.blue50 : C.white }}>
              <Icon size={21} strokeWidth={on ? 2.5 : 2} color={on ? C.royal : C.slate500} />
              {key === 'notifications' && unreadCount > 0 && <View style={{ position: 'absolute', right: 0, top: -3, minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 4, backgroundColor: C.red500, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: C.white }}><Text style={{ color: C.white, fontFamily: F.bold, fontSize: 9 }}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View>}
            </View>
            <Text numberOfLines={1} style={{ fontFamily: on ? F.semibold : F.medium, fontSize: 10, color: on ? C.navy : C.slate500 }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Root() {
  const { user, token, logout, refreshUser, restoring } = useAuth();
  const insets = useSafeAreaInsets();
  const [unreadCount, setUnreadCount] = useState(0);
  const [checkingApproval, setCheckingApproval] = useState(false);
  const [approvalError, setApprovalError] = useState('');
  const [authScreen, setAuthScreen] = useState<'welcome' | 'login' | 'register' | 'guest-register' | 'forgot' | 'reset' | 'verify'>('welcome');
  const [verifyEmail, setVerifyEmail] = useState('');
  const [tab, setTab] = useState<MobileScreen>('home');
  const [module, setModule] = useState<ModuleKey | null>(null);
  const openModule = (key: ModuleKey) => {if (!canAccessModule(user?.role ?? null,key)) return;setModule(key);setTab('module-detail');};
  const guest = useGuestRequest();

  // Unread badges reflect the server, not a decorative hardcoded dot.
  useEffect(() => {
    if (!token || !user || user.accountSetup?.required || (user.accountStatus && user.accountStatus !== 'active')) { setUnreadCount(0); return; }
    let active = true;
    const sync = async () => {
      try { const result = await notificationApi.count(token); if (active) setUnreadCount(result.unread_count ?? 0); }
      catch { /* A failed badge request should never block the rest of PASS. */ }
    };
    void sync();
    const interval = setInterval(() => void sync(), 60000);
    // Pull the actual unread count when a guard returns to PASS after using
    // the camera or after another device updates the account's notifications.
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void sync();
    });
    return () => { active = false; clearInterval(interval); subscription.remove(); };
  }, [token, user?.id, user?.accountStatus, user?.accountSetup?.required, tab]);

  if (restoring) {
    return <View style={{ flex: 1, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.royal} /></View>;
  }

  if (!user) {
    return (
      <View style={{ flex: 1 }}>
        <StatusBar style={authScreen === 'welcome' ? 'light' : 'dark'} />
        {authScreen === 'welcome' && <WelcomeScreen onLogin={() => setAuthScreen('login')} onRegister={() => setAuthScreen('register')} onGuestRegister={() => setAuthScreen('guest-register')} />}
        {authScreen === 'login' && <LoginScreen onBack={() => setAuthScreen('welcome')} onForgot={() => setAuthScreen('forgot')}
          onVerify={email => { setVerifyEmail(email); setAuthScreen('verify'); }} />}
        {authScreen === 'verify' && <VerifyEmailScreen initialEmail={verifyEmail} onBack={() => setAuthScreen('login')} />}
        {authScreen === 'forgot' && <ForgotPasswordScreen onBack={() => setAuthScreen('login')} onReset={() => setAuthScreen('reset')} />}
        {authScreen === 'reset' && <ResetPasswordScreen onBack={() => setAuthScreen('login')} />}
        {authScreen === 'register' && <RegisterScreen onBack={() => setAuthScreen('welcome')} onDone={() => setAuthScreen('login')} />}
        {authScreen === 'guest-register' && <GuestRegisterScreen onBack={() => setAuthScreen('login')} />}
      </View>
    );
  }

  const handleLogout = async () => {
    await logout();
    setAuthScreen('welcome');
    setTab('home');setModule(null);
  };

  if (user.accountSetup?.required) return <AccountSetupScreen />;

  // Laravel intentionally permits verified, pending applicants to read only /me and /logout.
  if (user.accountStatus === 'pending') {
    const checkStatus = async () => {
      if (checkingApproval) return;
      setCheckingApproval(true); setApprovalError('');
      try { await refreshUser(); }
      catch (e) { setApprovalError(e instanceof Error ? e.message : 'Could not refresh the account.'); }
      finally { setCheckingApproval(false); }
    };
    return <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + 30, paddingHorizontal: 24, gap: 16 }}>
      <StatusBar style="dark" />
      <View style={{ alignItems: 'center', padding: 25, backgroundColor: C.white, borderRadius: 20, gap: 12, borderWidth: 1, borderColor: C.slate200 }}>
        <ShieldCheck size={40} color={C.royal} />
        <Text style={{ color: C.navy, fontFamily: F.headBold, fontSize: 22, textAlign: 'center' }}>Account awaiting approval</Text>
        <Text style={{ color: C.slate600, fontFamily: F.regular, fontSize: 14, textAlign: 'center', lineHeight: 21 }}>
          Welcome, {user.name}. Your email is verified, but PASS staff still need to review your institutional ID.
          Automatic ID verification is not a substitute for staff review when the evidence is uncertain.
        </Text>
        <Text style={{ color: C.slate500, fontFamily: F.medium, fontSize: 13, textAlign: 'center' }}>
          {user.registrationCategory === 'shs' ? 'Senior High School registrations always require staff approval.' :
            user.schoolIdCheckStatus === 'manual_review' || user.schoolIdCheckStatus === 'unavailable'
              ? 'Your ID needs manual review. An unreadable ID is not an automatic rejection.'
              : 'If your ID matched automatically, allow a moment for the server to update your application.'}
        </Text>
        {!!approvalError && <Text style={{ color: C.red600, fontFamily: F.medium, fontSize: 13 }}>{approvalError}</Text>}
        <Pressable accessibilityRole="button" disabled={checkingApproval} onPress={() => void checkStatus()}
          style={{ padding: 14, alignItems: 'center', alignSelf: 'stretch', backgroundColor: C.royal, borderRadius: 12, opacity: checkingApproval ? .65 : 1 }}>
          <Text style={{ color: C.white, fontFamily: F.bold, fontSize: 14 }}>{checkingApproval ? 'Checking approval…' : 'Check approval status'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void handleLogout()} style={{ padding: 14 }}>
          <Text style={{ color: C.royal, fontFamily: F.semibold, fontSize: 14 }}>Sign out</Text>
        </Pressable>
      </View>
    </View>;
  }

  // Screens with a navy header run edge-to-edge, so the status bar icons must be light there.
  const navyHeader = ['profile', 'home', 'modules', 'module-detail', 'notifications', 'parking', 'vehicles'].includes(tab);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style={navyHeader ? 'light' : 'dark'} />
      <View style={{ flex: 1 }}>
        {tab === 'home' && (user.role === 'admin' ? <AdminDashboardScreen open={openModule} /> : ['parking_admin','parking_staff','security'].includes(user.role ?? '') ? <StaffDashboardScreen open={openModule} /> : user.role === 'guest' ? <GuestHomeScreen user={user} onNavigate={setTab} /> : <HomeScreen user={user} onNavigate={setTab} unreadCount={unreadCount} />)}
        {tab === 'modules' && isStaff(user.role) && <ModuleMenu open={openModule} />}
        {tab === 'module-detail' && module && canAccessModule(user.role,module) && <DataModuleScreen module={module} back={() => setTab('modules')} />}
        {tab === 'guest-request' && user.role === 'guest' && <GuestRequestScreen status={guest.status} details={guest.details} setRequest={guest.set} />}
        {tab === 'parking' && <ParkingScreen />}
        {tab === 'vehicles' && ['student','faculty','employee'].includes(user.role ?? '') && <VehicleScreen />}
        {tab === 'release' && ['student','faculty','employee'].includes(user.role ?? '') && <VehicleReleaseScreen back={() => setTab('profile')}/>}
        {tab === 'history' && ['student','faculty','employee'].includes(user.role ?? '') && <HistoryScreen />}
        {tab === 'notifications' && <NotificationScreen onNavigate={setTab} onOpenModule={openModule} onUnreadChange={setUnreadCount} />}
        {tab === 'qr' && user.role === 'guest' && <QRPassScreen user={user} guestStatus={guest.status} />}
        {tab === 'license' && ['student','faculty','employee'].includes(user.role ?? '') && <LicenseScreen user={user} onBack={() => setTab('profile')} />}
        {tab === 'profile' && <ProfileScreen user={user} onLogout={handleLogout} onNavigate={setTab} />}
      </View>
      <BottomNav role={user.role} active={tab} onChange={setTab} unreadCount={unreadCount} />
    </View>
  );
}

export default function App() {
  const [loaded] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Poppins_600SemiBold, Poppins_700Bold,
  });
  if (!loaded) {
    return <View style={{ flex: 1, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.royal} /></View>;
  }
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <LicenseProvider>
          <Root />
        </LicenseProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
