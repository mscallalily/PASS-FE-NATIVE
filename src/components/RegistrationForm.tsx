import React, { useEffect, useRef, useState } from 'react';
import { AppState, Image, Pressable, Share, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import QRCode from 'react-native-qrcode-svg';
import { api, ApiError } from '../api/client';
import { toUploadFile } from '../api/upload';
import { API_URL } from '../config';
import { C } from '../theme';
import { Btn, ErrorBox, Field, PickedFile, T } from './ui';
import { Select } from './Select';

export const REGISTRATION_STEPS = ['Institutional ID', 'Verify email', 'Driver’s license', 'Review & create'] as const;
type Category = 'college' | 'employee' | 'shs';
type Draft = { email: string; registration_category: Category; first_name: string; middle_name: string; last_name: string; suffix: string; birth_date: string; user_code: string; department: string; contact_number: string; year_level: string; section: string };
type IdCheck = { status: 'passed' | 'retake' | 'unavailable'; message: string; fields: Record<string, string>; profile_fields: Record<string, string>; receipt: string | null };
const ID_LABELS: Record<string, string> = { first_name: 'First name', last_name: 'Surname', middle_initial: 'Middle initial', suffix: 'Suffix', user_code: 'Institutional ID number' };
type License = { status: 'passed' | 'blocked' | 'retake' | 'unavailable'; message: string; fields: Record<string, string | null>; reasons: string[] };
type Status = { email_verified: boolean; completed: boolean; expires_at: string; license_processing: boolean; license: License | null };
type Session = { id: string; key: string };
type Department = { department_id: number; department_code: string; department_name: string };
const INITIAL: Draft = { email: '', registration_category: 'college', first_name: '', middle_name: '', last_name: '', suffix: '', birth_date: '', user_code: '', department: '', contact_number: '', year_level: '', section: '' };
const LABELS: Record<string, string> = { full_name: 'Full printed name', license_number: 'License number', birth_date: 'Birth date', expiry_date: 'Expiration date' };

export default function RegistrationForm({ onBackToLogin, onExit }: { onBackToLogin: () => void; onExit?: () => void }) {
  const [draft, setDraft] = useState<Draft>(INITIAL), [step, setStep] = useState(0);
  const [session, setSession] = useState<Session | null>(null), [status, setStatus] = useState<Status | null>(null), [departments, setDepartments] = useState<Department[]>([]);
  const [code, setCode] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState(''), [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string[]>>({}), [file, setFile] = useState<PickedFile | null>(null), [handoff, setHandoff] = useState<{ url: string; expires: string } | null>(null);
  const [done, setDone] = useState(false), [expired, setExpired] = useState(false), [now, setNow] = useState(Date.now());
  const [idFile, setIdFile] = useState<PickedFile | null>(null), [idCheck, setIdCheck] = useState<IdCheck | null>(null), [readingId, setReadingId] = useState(false);
  const autoIdChecked = useRef<PickedFile | null>(null);
  const autoChecked = useRef<PickedFile | null>(null);
  const alive = useRef(true), generation = useRef(0), busyRef = useRef(false), selectedRef = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; }; }, []);
  useEffect(() => { let current = true; api<{ data: Department[] }>('/departments').then(r => { if (current) setDepartments(r.data); }).catch(() => { if (current) setError('Departments could not be loaded. Check the server connection, then restart registration.'); }); return () => { current = false; }; }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!session || done || expired) return;
    let current = true, pending = false;
    const poll = async () => {
      if (pending || busyRef.current || selectedRef.current || AppState.currentState !== 'active') return;
      pending = true; const g = generation.current;
      try {
        const r = await api<{ data: Status }>(`/registration/sessions/${session.id}`, { headers: { 'X-Registration-Key': session.key } });
        if (current && g === generation.current) { setStatus(r.data); if (r.data.license?.status === 'passed') setHandoff(null); }
      } catch (e) { if (current && e instanceof ApiError && [404, 410].includes(e.status)) { setExpired(true); setError(e.message); } }
      finally { pending = false; }
    };
    const timer = setInterval(() => { void poll(); }, 3000); return () => { current = false; clearInterval(timer); };
  }, [session, done, expired]);
  const act = async (action: () => Promise<void>) => {
    if (busyRef.current) return; busyRef.current = true; generation.current++; setBusy(true); setError(''); setErrors({});
    try { await action(); } catch (e) { if (alive.current) { setError(e instanceof Error ? e.message : 'The action could not complete. Try again.'); if (e instanceof ApiError) { setErrors(e.errors); const fieldMessage = Object.values(e.errors).flat().filter(Boolean).join(' '); if (fieldMessage) setError(fieldMessage); if ([404, 410].includes(e.status)) setExpired(true); } } }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  };
  const call = <T,>(suffix: string, options: Parameters<typeof api>[1] = {}) => {
    if (!session) return Promise.reject(new Error('Start registration first.')) as Promise<T>;
    return api<T>(`/registration/sessions/${session.id}${suffix}`, { ...options, headers: { ...options.headers, 'X-Registration-Key': session.key } });
  };
  const chooseId = (camera: boolean) => act(async () => {
    if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new Error('Allow camera access to photograph your ID, or choose a photo from your library.');
    const options = { mediaTypes: ['images'] as ImagePicker.MediaType[], quality: 0.9, allowsEditing: false };
    const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets[0]) return;
    const a = result.assets[0], type = a.mimeType || 'image/jpeg';
    if (!['image/jpeg', 'image/png'].includes(type) || (a.fileSize || 0) > 5 * 1024 * 1024) throw new Error('Choose a JPG or PNG ID photo of 5 MB or smaller.');
    setIdFile({ uri: a.uri, name: a.fileName || `institutional-id.${type === 'image/png' ? 'png' : 'jpg'}`, type, size: a.fileSize || 0 });
    setIdCheck(null); setDraft(d => ({ ...INITIAL, email: d.email, registration_category: d.registration_category, department: d.registration_category === 'shs' ? 'Senior High School' : '', contact_number: d.contact_number }));
  });
  const readId = () => act(async () => {
    if (!idFile) throw new Error('Upload your institutional ID first.');
    setReadingId(true); const form = new FormData(); form.append('registration_category', draft.registration_category); form.append('school_id_file', toUploadFile(idFile) as unknown as Blob, idFile.name);
    try {
      const r = await api<{ data: IdCheck }>('/registration/institutional-id', { form, timeoutMs: 110000 });
      setIdCheck(r.data); setMessage(r.data.message);
      if (r.data.status === 'passed') setDraft(d => ({ ...d, ...r.data.fields, ...r.data.profile_fields }));
    } finally { setReadingId(false); }
  });
  useEffect(() => {
    if (idFile && !busy && autoIdChecked.current !== idFile) { autoIdChecked.current = idFile; void readId(); }
    // Read each new ID photo once. Explicit retry is available after a network error.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idFile, busy]);
  const start = () => act(async () => {
    if (!/^[^@\s]+@dyci\.edu\.ph$/i.test(draft.email.trim())) throw new Error('Use your institutional email ending exactly in @dyci.edu.ph.');
    if (!idFile || idCheck?.status !== 'passed' || !idCheck.receipt) throw new Error('Upload and read a clear institutional ID first.');
    const form = new FormData();
    for (const key of ['email', 'registration_category', 'department', 'contact_number'] as const) form.append(key, draft[key]);
    if (draft.registration_category === 'shs') { form.append('year_level', draft.year_level); form.append('section', draft.section); }
    form.append('school_id_file', toUploadFile(idFile) as unknown as Blob, idFile.name); form.append('id_check_receipt', idCheck.receipt);
    const r = await api<{ session_id: string; owner_key: string; data: Status; message: string }>('/registration/sessions', { form });
    if (!alive.current) return;
    setSession({ id: r.session_id, key: r.owner_key }); setStatus(r.data); setStep(1); setMessage(r.message); setIdFile(null);
  });
  const verify = () => act(async () => { const r = await call<{ data: Status; message: string }>('/verify', { json: { code } }); setStatus(r.data); setCode(''); setStep(2); setMessage(r.message); });
  const choose = (camera: boolean) => act(async () => {
    if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new Error('Allow camera access to photograph your license, or choose a photo from your library.');
    const options = { mediaTypes: ['images'] as ImagePicker.MediaType[], quality: 0.9, allowsEditing: false };
    const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets[0]) return;
    const a = result.assets[0], type = a.mimeType || 'image/jpeg';
    if (!['image/jpeg', 'image/png'].includes(type) || (a.fileSize || 0) > 5 * 1024 * 1024) throw new Error('Choose a JPG or PNG photo of 5 MB or smaller.');
    setFile({ uri: a.uri, name: a.fileName || `license.${type === 'image/png' ? 'png' : 'jpg'}`, type, size: a.fileSize || 0 }); selectedRef.current = true;
    setStatus(s => s ? { ...s, license: null } : s); setMessage('Photo selected. Check this photo to read and validate it.');
  });
  const checkPhoto = () => act(async () => {
    if (!file) throw new Error('Take or choose a photo first.');
    setUploading(true); setHandoff(null); const form = new FormData(); form.append('license_file', toUploadFile(file) as unknown as Blob, file.name);
    try { const r = await call<{ data: Status }>('/license', { form, timeoutMs: 110000 }); setStatus(r.data); setMessage(r.data.license?.message || 'License check finished.'); setFile(null); selectedRef.current = false; }
    finally { setUploading(false); }
  });
  useEffect(() => {
    if (file && !busy && autoChecked.current !== file) {
      autoChecked.current = file;
      void checkPhoto();
    }
    // Check each newly captured/selected photo once; retries remain an explicit action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, busy]);
  const createLink = () => act(async () => {
    const r = await call<{ capture_key: string; capture_path: string; expires_at: string }>('/handoff', { json: {} });
    const url = `${API_URL}${r.capture_path}#${new URLSearchParams({ id: session!.id, key: r.capture_key }).toString()}`;
    setStatus(s => s ? { ...s, license: null, license_processing: false } : s);
    setHandoff({ url, expires: r.expires_at }); setMessage('Scan this QR on your other device. Keep this registration open.');
  });
  const restart = () => act(async () => {
    if (session && !expired) await call('', { method: 'DELETE' });
    setSession(null); setStatus(null); setIdFile(null); setIdCheck(null); setDraft(d => ({ ...INITIAL, email: d.email })); setStep(0); setHandoff(null); setExpired(false); setFile(null); selectedRef.current = false; setPassword(''); setConfirmation(''); setAgree(false); setCode(''); setMessage('Upload your institutional ID again, then verify your email and license.');
  });
  const submit = () => act(async () => {
    if (!session || status?.license?.status !== 'passed' || file) throw new Error('Pass the current license photo check first.');
    await api('/register', { headers: { 'X-Registration-Key': session.key }, json: { session_id: session.id, password, password_confirmation: confirmation, agree } });
    setPassword(''); setConfirmation(''); setHandoff(null); setFile(null); setDone(true);
  });
  const field = (key: keyof Draft, label: string, placeholder = '', keyboardType: React.ComponentProps<typeof Field>['keyboardType'] = 'default') => <Field key={key} label={label} accessibilityLabel={label} placeholder={placeholder} value={draft[key]} onChangeText={value => setDraft(d => ({ ...d, [key]: value }))} error={errors[key]?.[0]} keyboardType={keyboardType} autoCapitalize={key === 'email' ? 'none' : 'words'} autoCorrect={false} editable={!busy} />;
  const working = busy || !!status?.license_processing, license = status?.license, canContinue = license?.status === 'passed' && !file && !working && !expired;
  const details = () => <View style={{ gap: 10, padding: 16, backgroundColor: C.slate50, borderRadius: 12 }}>{Object.entries(LABELS).map(([key, label]) => <View key={key}><T s={12} c={C.slate500}>{label}</T><T s={15} w="semibold" c={C.navy}>{license?.fields[key] || 'Could not be read'}</T></View>)}</View>;
  if (done || status?.completed) return <View style={{ gap: 18 }}><T s={22} w="head" c={C.navy}>Your PASS account is ready</T><T s={14} c={C.slate600}>Your institutional ID, email and license checks passed. Sign in to register your vehicle.</T><Btn label="Go to sign in" onPress={onBackToLogin} /></View>;
  return <View style={{ gap: 16 }}>
    <View style={{ flexDirection: 'row', gap: 6 }}>{REGISTRATION_STEPS.map((label, i) => <View key={label} style={{ flex: 1 }}><View style={{ height: 5, borderRadius: 4, marginBottom: 6, backgroundColor: i <= step ? C.royal : C.slate200 }} /><T s={10} w={i === step ? 'bold' : 'regular'} c={i === step ? C.royal : C.slate500}>{i + 1}. {label}</T></View>)}</View>
    {!!error && <ErrorBox>{error}</ErrorBox>}
    {!!message && <View accessibilityLiveRegion="polite" style={{ padding: 12, borderRadius: 12, backgroundColor: C.blue50 }}><T s={13} c={C.navy}>{message}</T></View>}
    {expired ? <Btn label="Start a new registration" onPress={restart} disabled={busy} /> : <>
    {step === 0 && <View style={{ gap: 14 }} pointerEvents={busy ? 'none' : 'auto'}>
      <T s={13} c={C.slate600}>Upload your institutional ID to fill your name and ID number automatically. Your birth date and full middle name will be read from your driver’s license next.</T>
      {field('email', 'Institutional email', 'yourname@dyci.edu.ph', 'email-address')}
      <Select label="Profile type" value={draft.registration_category} options={[{ value: 'college', label: 'College student' }, { value: 'employee', label: 'Employee' }, { value: 'shs', label: 'SHS student' }]} onChange={value => { setIdFile(null); setIdCheck(null); setDraft(d => ({ ...INITIAL, email: d.email, contact_number: d.contact_number, registration_category: value as Category, department: value === 'shs' ? 'Senior High School' : '' })); setMessage('Upload the ID for this profile type.'); }} />
      <T s={11} c={C.slate500}>Choose the type of ID you will upload. Your DYCI inbox is verified separately.</T>
      <View style={{ flexDirection: 'row', gap: 10 }}><Btn label="Take ID photo" onPress={() => chooseId(true)} disabled={busy} style={{ flex: 1 }} /><Btn label="Upload institutional ID" onPress={() => chooseId(false)} disabled={busy} bg={C.blue50} color={C.royal} style={{ flex: 1 }} /></View>
      <T s={11} c={C.slate500}>JPG/PNG front · up to 5 MB. Frame the full card upright, close to its edges, without glare.</T>
      {idFile && <Image source={{ uri: idFile.uri }} style={{ width: '100%', height: 230, borderRadius: 12 }} resizeMode="contain" accessibilityLabel="Selected institutional ID" />}
      {readingId && <T s={13} c={C.royal}>Reading the printed ID details… Keep this screen open.</T>}
      {idFile && !busy && <Btn label="Read ID again" onPress={readId} bg={C.blue50} color={C.royal} />}
      {idCheck && <View accessibilityLiveRegion="polite" style={{ gap: 10, padding: 16, borderWidth: 1, borderColor: idCheck.status === 'passed' ? C.green200 : C.slate200, borderRadius: 12 }}><T s={16} w="bold" c={C.navy}>{idCheck.status === 'passed' ? 'ID details filled automatically' : idCheck.status === 'unavailable' ? 'ID reader unavailable' : 'Retake your ID photo'}</T><T s={13} c={C.slate600}>{idCheck.message}</T>{idCheck.status === 'passed' && Object.entries(ID_LABELS).map(([key, label]) => <View key={key}><T s={12} c={C.slate500}>{label}</T><T s={15} w="semibold" c={C.navy}>{idCheck.fields[key] || 'Not printed'}</T></View>)}</View>}
      {idCheck?.status === 'passed' && <View style={{ gap: 14 }}>
        <T s={13} c={C.slate600}>Complete only the details not read from your ID. Printed fields stay read-only.</T>
        {idCheck.profile_fields.department ? <T s={14} c={C.navy}>Department / office: {draft.department} (from ID)</T> : draft.registration_category === 'college' ? <Select label="College department" value={draft.department} options={departments.filter(d => !['SHS', 'JHS', 'BED'].includes(d.department_code.toUpperCase()) && !['SECURITY OFFICE', 'HR DEPARTMENT', 'IT DEPARTMENT', 'REGISTRAR OFFICE'].includes(d.department_name.toUpperCase())).map(d => ({ value: d.department_name, label: d.department_name }))} onChange={value => setDraft(d => ({ ...d, department: value }))} error={errors.department?.[0]} /> : draft.registration_category === 'employee' ? field('department', 'Department or office') : <T s={13} c={C.slate600}>Senior High School</T>}
        {draft.registration_category === 'shs' && <>{idCheck.profile_fields.year_level ? <T s={14} c={C.navy}>Grade {draft.year_level} (from ID)</T> : <Select label="Grade" value={draft.year_level} options={[{ value: '11', label: 'Grade 11' }, { value: '12', label: 'Grade 12' }]} onChange={value => setDraft(d => ({ ...d, year_level: value }))} error={errors.year_level?.[0]} />}{idCheck.profile_fields.section ? <T s={14} c={C.navy}>Section: {draft.section} (from ID)</T> : field('section', 'Section')}</>}
        {field('contact_number', 'Your contact number', '', 'phone-pad')}
        <T s={11} c={C.slate500}>Use your own number. Emergency contacts on an ID are not used as your number.</T>
      </View>}
      <Btn label="Send verification code" onPress={start} loading={busy} disabled={idCheck?.status !== 'passed' || !/^[^@\s]+@dyci\.edu\.ph$/i.test(draft.email.trim())} />
    </View>}
    {step === 1 && <View style={{ gap: 14 }}><T s={18} w="bold" c={C.navy}>Verify your institutional email</T><T s={13} c={C.slate600}>Enter the 6-digit code sent to {draft.email}. It expires after 10 minutes.</T><Field accessibilityLabel="Verification code" label="Verification code" value={code} onChangeText={v => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" error={errors.code?.[0]} maxLength={6} editable={!busy} /><Btn label="Verify email" onPress={verify} loading={busy} disabled={code.length !== 6} /><Btn label="Send / resend code" bg={C.blue50} color={C.royal} disabled={busy} onPress={() => act(async () => { const r = await call<{ message: string }>('/code', { json: {} }); setMessage(r.message); })} /></View>}
    {step === 2 && <View style={{ gap: 14 }}><T s={18} w="bold" c={C.navy}>Driver’s license front</T><T s={13} c={C.slate600}>Keep all four corners visible. Hold the camera parallel to the card, in good light and without glare. The extracted details cannot be edited.</T>
      <View style={{ flexDirection: 'row', gap: 10 }}><Btn label="Take photo" onPress={() => choose(true)} disabled={working} style={{ flex: 1 }} /><Btn label="Choose photo" onPress={() => choose(false)} disabled={working} bg={C.blue50} color={C.royal} style={{ flex: 1 }} /></View>
      {file && <><Image source={{ uri: file.uri }} style={{ width: '100%', height: 210, borderRadius: 12 }} resizeMode="contain" accessibilityLabel="Selected license photo" /><Btn label="Check this photo" onPress={checkPhoto} disabled={working} /></>}
      {working && <T s={13} c={C.royal}>{uploading ? 'Reading your license… This can take up to 90 seconds. Keep this screen open.' : 'Please wait for the current check…'}</T>}
      <Btn label="Continue on another device" bg={C.blue50} color={C.royal} disabled={working || !!file} onPress={createLink} />
      {handoff && <View style={{ gap: 12, padding: 16, backgroundColor: C.slate50, borderRadius: 12 }}><T s={13} c={C.slate600}>Scan using the camera on your other device. The photo will return to this registration.</T><View style={{ alignSelf: 'center', padding: 8, backgroundColor: C.white }}><QRCode value={handoff.url} size={190} /></View><T s={12} c={C.slate500}>{Date.parse(handoff.expires) > now ? `Expires in ${Math.ceil((Date.parse(handoff.expires) - now) / 60000)} minute(s).` : 'The link expired. Generate a new one.'}</T>{/https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:|\/)/i.test(API_URL) && <T s={12} c={C.red500}>This server address works only on this device. Use your laptop’s Wi-Fi IP in EXPO_PUBLIC_API_URL for a phone link.</T>}<Btn label="Share temporary link" onPress={() => act(async () => { await Share.share({ message: handoff.url }); })} disabled={busy} /><Btn label="Cancel phone link" bg={C.blue50} color={C.royal} disabled={busy} onPress={() => act(async () => { await call('/handoff', { method: 'DELETE' }); setHandoff(null); })} /></View>}
      {license && <View accessibilityLiveRegion="polite" style={{ gap: 10, borderWidth: 1, borderColor: license.status === 'passed' ? C.green200 : C.slate200, borderRadius: 12, padding: 14 }}><T s={16} w="bold" c={C.navy}>{license.status === 'passed' ? 'License checks passed' : license.status === 'blocked' ? 'Registration blocked' : license.status === 'unavailable' ? 'Reader unavailable' : 'Retake your photo'}</T><T s={13} c={C.slate600}>{license.message}</T>{license.reasons.map(r => <T s={12} c={C.slate600} key={r}>{r}</T>)}{details()}</View>}
      <T s={11} c={C.slate500}>JPG or PNG · up to 5 MB. Blurry or uncertain details need a new photo. Expired licenses and identity mismatches cannot proceed.</T>
      <Btn label="Review & create account" disabled={!canContinue} onPress={() => { setStep(3); setMessage(''); }} />
    </View>}
    {step === 3 && <View style={{ gap: 14 }}><T s={18} w="bold" c={C.navy}>Review your verified details</T><View style={{ gap: 10, padding: 16, backgroundColor: C.slate50, borderRadius: 12 }}>{Object.entries(ID_LABELS).map(([key, label]) => <View key={key}><T s={12} c={C.slate500}>{label} · from institutional ID</T><T s={15} c={C.navy}>{idCheck?.fields[key] || 'Not printed'}</T></View>)}</View><T s={13} c={C.slate600}>{draft.email} · verified</T>{details()}<T s={11} c={C.slate500}>These details came from your license photo and cannot be edited.</T><Field accessibilityLabel="Choose password" label="Choose password" secureTextEntry value={password} onChangeText={setPassword} autoComplete="new-password" editable={!busy} /><Field accessibilityLabel="Confirm password" label="Confirm password" secureTextEntry value={confirmation} onChangeText={setConfirmation} autoComplete="new-password" editable={!busy} /><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: agree }} disabled={busy} onPress={() => setAgree(v => !v)} style={{ padding: 12, borderWidth: 1, borderColor: agree ? C.royal : C.slate200, borderRadius: 12 }}><T s={13} c={C.slate600}>{agree ? '✓ ' : '○ '}I confirm these are my details and license, and agree to their use for PASS registration and parking access checks.</T></Pressable><Btn label="Create my account" onPress={submit} loading={busy} disabled={!canContinue || !agree || password.length < 8 || password !== confirmation} /><Btn label="Retake license photo" onPress={() => setStep(2)} bg={C.blue50} color={C.royal} disabled={busy} /></View>}
    {session && <Btn label="Change ID / restart verification" bg={C.slate50} color={C.slate600} onPress={restart} disabled={busy || !!status?.license_processing} />}
    </>}
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Pressable onPress={onBackToLogin} disabled={busy}><T s={13} c={C.royal}>Back to sign in</T></Pressable>{onExit && <Pressable onPress={onExit} disabled={busy}><T s={13} c={C.slate500}>Exit</T></Pressable>}</View>
  </View>;
}
