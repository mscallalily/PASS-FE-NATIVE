import React, { useEffect, useState } from 'react';
import { Alert, ActivityIndicator } from 'react-native';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Pressable, Text, View } from 'react-native';
import {
  AlertTriangle, ArrowLeft, Bell, Car, CheckCircle, ChevronRight, ClipboardList, Clock, CreditCard, IdCard,
  LogOut, QrCode, Send, Settings, ShieldCheck, User,
} from 'lucide-react-native';
import { DyciLogo } from '../components/Brand';
import AccountProfilePanel from '../components/AccountProfilePanel';
import { Btn, Card, Field, FileUpload, Frame, PickedFile, T, txt } from '../components/ui';
import { MobileUser } from '../context/AuthContext';
import { LICENSE_STATUS_LABEL, LicenseStatus, useLicense } from '../context/LicenseContext';
import { C, withAlpha } from '../theme';
import { ROLE_LABELS } from '../permissions';
import { MobileScreen, NavyHeader } from './shared';
import VehicleRegistrationScreen from './VehicleRegistrationScreen';
import { GuestRequestPortal, GuestPassPortal } from './GuestScreens';

/* ------------------------------------------------------------------ Guest request */
export type GuestRequestStatus = 'not_submitted' | 'pending' | 'approved';
export type GuestRequestData = { reason: string; contactPerson: string; visitDate: string; arrivalTime: string; vehicleType: string; plate: string; makeModel: string };
/** Browsing-only guest session; no locally fabricated approval or credential. */
export function useGuestRequest() {
  return { status: 'not_submitted' as GuestRequestStatus, details: null as GuestRequestData | null,
    set: (_status: GuestRequestStatus, _details: GuestRequestData | null) => {} };
}
export function GuestRequestScreen({ status }: { status: GuestRequestStatus; details: GuestRequestData | null; setRequest: (s: GuestRequestStatus, d: GuestRequestData | null) => void }) {
  return <GuestRequestPortal />;
}

/* ------------------------------------------------------------------ QR pass */
export function QRPassScreen({ user }: { user: MobileUser; guestStatus?: GuestRequestStatus }) {
  if (user.role === 'guest') return <GuestPassPortal user={user} />;
  return <Frame bottomPad={96}><View style={{padding:20,gap:14}}><T s={22} w="head" c={C.navy}>Campus Access Credentials</T><Card style={{gap:8}}><T s={15} w="bold" c={C.navy}>Registered user access</T><T s={13} c={C.slate600}>Regular campus users use assigned RFID tags. The app will not display a fabricated QR access credential.</T></Card></View></Frame>;
}

/* ------------------------------------------------------------------ Profile */
export function ProfileScreen({ user, onLogout, onNavigate }: { user: MobileUser; onLogout: () => void; onNavigate: (s: MobileScreen) => void }) {
  const { status: licenseStatus } = useLicense();
  const roleLabel = user.role ? ROLE_LABELS[user.role] : 'User';

  type Item = { label: string; description: string; icon: React.ReactNode; onPress: () => void };
  const ic = (I: any) => <I size={18} color={C.royal} />;
  const items: Item[] = ['parking_staff','security','admin','parking_admin'].includes(user.role ?? '')
    ? [
        { label: user.role === 'security' ? 'Security Tools' : user.role === 'admin' ? 'Administration' : 'Operations & Management', description: 'Open your role-specific PASS workspace', icon: ic(Settings), onPress: () => onNavigate('modules') },
        { label: 'Notifications', description: 'View parking alerts and updates', icon: ic(Bell), onPress: () => onNavigate('notifications') },
      ]
    : user.role === 'guest'
      ? [
          { label: 'Visitor Information', description: 'Your visitor access requires PASS staff approval', icon: ic(User), onPress: () => onNavigate('qr') },
          { label: 'Visitor Parking Request', description: 'Review your visit request and vehicle details', icon: ic(ClipboardList), onPress: () => onNavigate('guest-request') },
          { label: 'Visitor Pass', description: 'Available only after request approval', icon: ic(QrCode), onPress: () => onNavigate('qr') },
          { label: 'Notifications', description: 'View request status and updates', icon: ic(Bell), onPress: () => onNavigate('notifications') },
          ]
      : [
          { label: "Driver's License", description: `Verification: ${LICENSE_STATUS_LABEL[licenseStatus]}`, icon: ic(IdCard), onPress: () => onNavigate('license') },
          { label: 'My Vehicles & RFID Requests', description: 'Review vehicle registration and RFID request information', icon: ic(Car), onPress: () => onNavigate('vehicles') },
          { label: 'Emergency Vehicle Release', description: 'Authorize a substitute driver for one parked vehicle exit', icon: ic(ShieldCheck), onPress: () => onNavigate('release') },
          { label: 'Notifications', description: 'View parking updates and alerts', icon: ic(Bell), onPress: () => onNavigate('notifications') },
          ];

  return (
    <Frame topInset={false} bottomPad={96}>
      <NavyHeader pb={48}>
        <View style={{ alignItems: 'center' }}>
          <View style={{ width: 80, height: 80, borderRadius: 16, backgroundColor: withAlpha(C.sky, 0.2), borderWidth: 2, borderColor: withAlpha(C.sky, 0.3), alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <T s={30} w="bold" c={C.white}>{user.name[0]}</T>
          </View>
          <T s={20} w="head" c={C.white}>{user.name}</T>
          <T s={14} c={C.blue300}>{user.email}</T>
          <View style={{ marginTop: 8, backgroundColor: withAlpha(C.sky, 0.2), paddingHorizontal: 12, paddingVertical: 4, borderRadius: 99 }}>
            <T s={12} w="medium" c={C.sky}>{roleLabel}</T>
          </View>
          <T s={12} c="rgba(219,234,254,0.8)" style={{ marginTop: 8 }}>
            {user.role === 'security' ? 'Campus gate and security account' : user.role === 'admin' ? 'System administration account' : user.role === 'parking_admin' ? 'Parking management account' : user.role === 'parking_staff' ? 'Parking operations account' : user.role === 'guest' ? 'Temporary visitor account' : 'Campus member account'}
          </T>
        </View>
      </NavyHeader>
      <View style={{ paddingHorizontal: 20, marginTop: -16, gap: 12, paddingBottom: 20 }}>
        <Card style={{gap:6}}><T s={15} w="semibold" c={C.navy}>Account information</T><T s={13}>Role: {roleLabel}</T><T s={13}>Email: {user.email || 'Not provided'}</T>{!!user.idNum && <T s={13}>Campus ID: {user.idNum}</T>}{!!user.dept && <T s={13}>Department: {user.dept}</T>}</Card>
        <AccountProfilePanel onPasswordChanged={onLogout} />
        <View style={{ backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.blue100, overflow: 'hidden' }}>
          {items.map((item, i) => (
            <Pressable key={item.label} onPress={item.onPress} style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 16,
              borderTopWidth: i > 0 ? 1 : 0, borderTopColor: C.slate100, backgroundColor: pressed ? C.blue50 : C.white,
            })}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' }}>{item.icon}</View>
              <View style={{ flex: 1 }}>
                <T s={14} w="semibold" c={C.slate700}>{item.label}</T>
                <T s={12} c={C.slate500} style={{ marginTop: 2 }}>{item.description}</T>
              </View>
              <ChevronRight size={16} color={C.slate300} />
            </Pressable>
          ))}
        </View>
        <Btn label="Sign Out" onPress={onLogout} bg={C.red50} color={C.red600} border={C.red200} radius={16}
          icon={<LogOut size={18} color={C.red600} />} />
      </View>
    </Frame>
  );
}

/* ------------------------------------------------------------------ Vehicles and RFID requests */
export function VehicleScreen() {
  return <VehicleRegistrationScreen />;
}

/* ------------------------------------------------------------------ Driver's license */
const maskNo = (n: string) => (n.length > 4 ? `•••• ${n.slice(-4)}` : n);

export function LicenseScreen({ user, onBack }: { user: MobileUser; onBack: () => void }) {
  const { status, submission, rejectReason, submit, loading, error, refresh, recheck } = useLicense();
  const [licenseNo, setLicenseNo] = useState('');
  const [licenseType, setLicenseType] = useState('non_professional');
  const [expiry,setExpiry] = useState('');
  const [file,setFile] = useState<PickedFile|null>(null);
  const [formError,setFormError] = useState('');
  const [sending,setSending] = useState(false);
  const [retrying,setRetrying] = useState(false);
  const autoPending = submission?.verification_status === 'pending_review' && submission.verification_source !== 'staff';
  const retry = async () => { setRetrying(true);setFormError('');try{await recheck();Alert.alert('Check queued','The server will attempt the automatic document check again.');}catch(e){setFormError(e instanceof Error ? e.message : 'Retry failed.');}finally{setRetrying(false);} };
  const upload = async () => {
    if (!file || !licenseNo.trim() || !expiry.trim()) { setFormError('Complete license number, expiry date and document.');return; }
    setSending(true);setFormError('');
    try {await submit({licenseNo: licenseNo.trim(),licenseType, expiry, file});Alert.alert('Submitted','Your license is now being checked by PASS.');setFile(null);setLicenseNo('');setExpiry('');}
    catch(e){setFormError(e instanceof Error ? e.message : 'Upload failed');}
    finally{setSending(false);}
  };
  return <Frame bottomPad={96}><View style={{padding:20,gap:14}}><Pressable onPress={onBack}><T s={14} c={C.royal}>‹ Back</T></Pressable><T s={22} w="head" c={C.navy}>Driver’s License</T><Card style={{gap:8}}><T s={15} w="bold" c={C.navy}>Status: {status === 'verified' && submission?.verification_source === 'automatic' ? 'Approved automatically' : autoPending ? 'Automatic check unavailable' : LICENSE_STATUS_LABEL[status]}</T>{loading && <ActivityIndicator/>}{!!error && <T s={13} c={C.red600}>{error}</T>}{submission && <><T s={13}>Number: {submission.license_number}</T><T s={12}>Type: {submission.license_type}</T><T s={12}>Expires: {submission.expiry_date}</T><T s={12}>Uploaded: {submission.original_file_name}</T></>}{status === 'verified' && <T s={12} c={C.green600}>{submission?.verification_source === 'automatic' ? 'Document consistency and OCR checks passed.' : 'PASS staff approved your submission.'}</T>}{autoPending && <T s={12} c={C.amber600}>The automatic check has not completed. This license is not approved; you may retry or contact PASS staff.</T>}{!!rejectReason && <T s={12} c={C.red600}>{rejectReason}</T>}<Btn label="Refresh verification" onPress={()=>void refresh()} py={10}/>{autoPending && <Btn label="Retry automatic check" loading={retrying} onPress={()=>void retry()} py={10} />}</Card>
      {status !== 'verified' && <Card style={{gap:12}}><T s={15} w="bold" c={C.navy}>Submit / Resubmit</T><Field label="LTO license number" value={licenseNo} onChangeText={setLicenseNo} placeholder="N01-23-456789"/><T s={12} c={C.slate500}>License type</T>{['student_permit','non_professional','professional','international'].map(v=><Pressable key={v} onPress={()=>setLicenseType(v)} style={{padding:8,backgroundColor:licenseType===v?C.blue100:C.white,borderRadius:8}}><T s={13}>{licenseType===v?'✓ ':''}{v.replace(/_/g,' ')}</T></Pressable>)}<Field label="Expiry date" value={expiry} onChangeText={setExpiry} placeholder="YYYY-MM-DD"/><FileUpload label="License document" file={file} onChange={setFile} onError={setFormError}/>{!!formError && <T s={13} c={C.red600}>{formError}</T>}<Btn label="Submit to PASS" loading={sending} onPress={()=>void upload()}/></Card>}
    </View></Frame>;
}
