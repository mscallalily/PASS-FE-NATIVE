import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Check, ChevronLeft, ChevronRight, Eye, EyeOff, RefreshCw, ShieldCheck } from 'lucide-react-native';
import { api, ApiError } from '../api/client';
import { toUploadFile } from '../api/upload';
import { C } from '../theme';
import { Btn, Card, ErrorBox, Field, FileUpload, PickedFile, T, txt } from './ui';
import { Select } from './Select';
import EmailCodeVerification from './EmailCodeVerification';
import {
  CHECK_LABELS, Department, IDENTITY_KEYS, ID_LABELS, IdCheck, INITIAL_REGISTRATION,
  manilaYear, RegistrationCategory, RegistrationValues, validateRegistrationStep,
} from '../services/registration';

export const REGISTRATION_STEPS = ['User Details', 'ID Verification', 'Account Info', 'Review'] as const;
const CATEGORIES: { value: RegistrationCategory; label: string; hint: string }[] = [
  { value: 'college', label: 'College Student', hint: '9-digit college student number' },
  { value: 'employee', label: 'Employee', hint: '7-digit employee number' },
  { value: 'shs', label: 'SHS Student', hint: '12-digit LRN · ID reviewed by PASS personnel' },
];
const SUFFIXES = ['', 'Jr.', 'Sr.', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** Native counterpart of the current web registration contract. No client-side auto-approval. */
export default function RegistrationForm({ onBackToLogin, onExit }: { onBackToLogin: () => void; onExit?: () => void }) {
  const [form, setForm] = useState<RegistrationValues>(INITIAL_REGISTRATION);
  const [step, setStep] = useState(0);
  const [idFile, setIdFile] = useState<PickedFile | null>(null);
  const [check, setCheck] = useState<IdCheck | null>(null);
  const [checkEdited, setCheckEdited] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [year, setYear] = useState(manilaYear());
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [registered, setRegistered] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const formRef = useRef(form);
  formRef.current = form;

  useEffect(() => {
    const abort = new AbortController();
    Promise.all([
      api<{ data: Department[] } | Department[]>('/departments', { signal: abort.signal }),
      api<{ current_year: number }>('/registration/options', { signal: abort.signal }),
    ]).then(([departmentsResponse, options]) => {
      if (abort.signal.aborted) return;
      const data = Array.isArray(departmentsResponse) ? departmentsResponse : departmentsResponse.data;
      setDepartments(Array.isArray(data) ? data : []);
      if (Number.isInteger(options.current_year)) setYear(options.current_year);
      setReady(true);
    }).catch((e) => { if (!abort.signal.aborted) setLoadError(
      e instanceof ApiError && e.status === 404
        ? 'This server does not have the current PASS registration/automatic ID verification API. Install the matching Laravel backend before registering.'
        : e instanceof Error ? e.message : 'Registration settings could not be loaded.',
    ); });
    return () => { abort.abort(); sequence.current++; controller.current?.abort(); };
  }, []);

  const set = <K extends keyof RegistrationValues>(key: K, value: RegistrationValues[K]) => {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: '' }));
    setMessage('');
    if (IDENTITY_KEYS.includes(key as any)) setCheckEdited(true);
  };

  const changeCategory = (category: RegistrationCategory) => {
    if (category === form.category) return;
    sequence.current++; controller.current?.abort(); setReading(false); setCheck(null); setIdFile(null);
    setCheckEdited(false); setErrors({}); setMessage('');
    setForm(current => ({ ...current, category, department: category === 'shs' ? 'Senior High School' : '', year_level: '', section: '',
      first_name: '', last_name: '', middle_initial: '', suffix: '', user_code: '', request_manual_review: false }));
  };

  const changeFile = (file: PickedFile | null) => {
    sequence.current++; controller.current?.abort(); setReading(false); setCheck(null); setCheckEdited(false);
    setIdFile(file); setForm(current => ({ ...current, request_manual_review: false }));
    setErrors(current => ({ ...current, school_id_file: '', id_check_receipt: '' })); setMessage('');
  };

  const readId = async (apply: boolean): Promise<IdCheck | null> => {
    if (!idFile || !ready) return null;
    const seq = ++sequence.current;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setReading(true); setMessage('');
    const current = formRef.current;
    const body = new FormData();
    body.append('registration_category', current.category);
    body.append('school_id_file', toUploadFile(idFile) as any);
    if (!apply) {
      if (check?.receipt) body.append('id_check_receipt', check.receipt);
      body.append('request_manual_review', current.request_manual_review ? '1' : '0');
      for (const key of IDENTITY_KEYS) body.append(key, current[key].trim());
    }
    try {
      const response = await api<{ data: IdCheck }>('/registration/id-check', {
        method: 'POST', form: body, signal: request.signal, timeoutMs: 100000,
      });
      if (seq !== sequence.current) return null;
      if (!response.data?.receipt || !response.data.status) throw new Error('The server returned an incomplete ID check. Please try again.');
      const result = response.data;
      setCheck(result); setCheckEdited(false);
      if (Number.isInteger(result.current_year)) setYear(result.current_year);
      if (apply) {
        setForm(previous => {
          const updates: Partial<RegistrationValues> = {};
          for (const key of IDENTITY_KEYS) if (result.fields?.[key]) (updates as any)[key] = result.fields[key];
          return { ...previous, ...updates };
        });
        setMessage('Suggested details were added. Check every field against your ID; you can edit them.');
      }
      return result;
    } catch (e) {
      if (seq === sequence.current) setMessage(e instanceof ApiError && e.status === 0
        ? 'The ID reader was interrupted or took too long. Try again or upload a clearer image.'
        : e instanceof Error ? e.message : 'Could not read your ID.');
      return null;
    } finally {
      if (seq === sequence.current) setReading(false);
    }
  };

  // File/category changes invalidate the previous receipt. Read newly chosen documents automatically.
  useEffect(() => {
    if (ready && idFile) void readId(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idFile, form.category, ready]);

  const validate = (target: number) => validateRegistrationStep(target, form, year, !!idFile, check);
  const next = async () => {
    const found = validate(step); setErrors(found); setMessage('');
    if (Object.keys(found).length) return;
    if (step === 1) {
      const latest = await readId(false);
      if (!latest || latest.status === 'needs_correction') return;
    }
    setStep(current => Math.min(current + 1, 3));
  };

  const submit = async () => {
    if (!ready || busy || reading || !form.agree) return;
    for (const target of [0, 1, 2]) {
      const found = validate(target);
      if (Object.keys(found).length) { setErrors(found); setStep(target); return; }
    }
    setBusy(true); setMessage('');
    try {
      const body = new FormData();
      for (const key of [...IDENTITY_KEYS, 'email', 'password', 'password_confirmation', 'department', 'contact'] as const) {
        const field = key === 'contact' ? 'contact_number' : key;
        body.append(field, key === 'password' || key === 'password_confirmation' ? form[key] : form[key].trim());
      }
      body.append('registration_category', form.category);
      if (form.category === 'shs') {
        body.append('year_level', form.year_level);
        body.append('section', form.section.trim());
      }
      body.append('agree', '1');
      body.append('request_manual_review', form.request_manual_review ? '1' : '0');
      body.append('school_id_file', toUploadFile(idFile!) as any);
      if (check?.receipt) body.append('id_check_receipt', check.receipt);
      const response = await api<{ email_verification_sent?: boolean }>('/register', { method: 'POST', form: body });
      setEmailSent(response.email_verification_sent === true);
      setRegistered(true);
    } catch (e) {
      if (e instanceof ApiError && e.errors) {
        const found: Record<string, string> = {};
        for (const [key, values] of Object.entries(e.errors)) found[key === 'contact_number' ? 'contact' : key] = values[0];
        setErrors(found);
        if (Object.keys(found).some(k => [...IDENTITY_KEYS, 'school_id_file', 'id_check_receipt', 'registration_category'].includes(k))) setStep(1);
        else if (found.email || found.password || found.password_confirmation) setStep(2);
        else if (found.department || found.contact || found.year_level || found.section) setStep(0);
      }
      setMessage(e instanceof Error ? e.message : 'Registration failed. Please retry.');
    } finally { setBusy(false); }
  };

  if (registered) return <EmailCodeVerification initialEmail={form.email.trim()} onBack={onBackToLogin}
    notice={emailSent
      ? form.category === 'shs'
        ? 'SHS registration saved. Verify your email and wait for PASS staff approval. Even a matched SHS ID cannot automatically activate your account.'
        : 'Registration saved. Verify your email. A matching ID may activate your account automatically; uncertain IDs remain pending staff review.'
      : 'Registration saved, but no verification email was sent. Choose Send / resend code to try again.'} />;

  const input = (label: string, key: keyof RegistrationValues, placeholder = '', other: object = {}) => (
    <Field key={key} label={label} value={form[key] as string} placeholder={placeholder} editable={!busy && !reading}
      onChangeText={value => set(key, value as never)} error={errors[key]} {...other} />
  );
  const selectedCategory = CATEGORIES.find(c => c.value === form.category)!.label;
  const needsAttention = Object.entries(check?.checks ?? {}).filter(([, value]) => value.result !== 'pass');
  const summary: [string, string][] = [
    ['User type', selectedCategory], ['Department / Office', form.department],
    ...(form.category === 'shs' ? [['Grade level', `Grade ${form.year_level}`], ['Section', form.section]] as [string, string][] : []),
    ['Contact', form.contact],
    ['Name', [form.first_name, form.middle_initial, form.last_name, form.suffix].filter(Boolean).join(' ')],
    ['ID number', form.user_code], ['ID document', idFile?.name ?? '—'],
    ['ID check', check ? ID_LABELS[check.status] + (form.category === 'shs' ? ' · staff approval required' : '') : 'Not checked'],
    ['Email', form.email],
  ];

  return <View style={{ gap: 18 }}>
    <View style={{ gap: 9 }}>
      <T s={13} c={C.slate500}>Step {step + 1} of 4 · {REGISTRATION_STEPS[step]}</T>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {REGISTRATION_STEPS.map((name, index) => <View key={name} style={{ flex: 1, height: 6, borderRadius: 4, backgroundColor: index <= step ? C.royal : C.slate200 }} />)}
      </View>
    </View>
    <T s={19} w="head" c={C.navy}>{REGISTRATION_STEPS[step]}</T>
    {!!loadError && <ErrorBox>{loadError}</ErrorBox>}

    {step === 0 && <View style={{ gap: 16 }}>
      <T s={14} w="semibold">User Type</T>
      {CATEGORIES.map(category => <Pressable key={category.value} accessibilityRole="radio"
        accessibilityState={{ checked: form.category === category.value }}
        disabled={busy || reading} onPress={() => changeCategory(category.value)}
        style={{ padding: 14, flexDirection: 'row', borderRadius: 12, borderWidth: 2, alignItems: 'center', gap: 12,
          borderColor: form.category === category.value ? C.royal : C.slate200, backgroundColor: form.category === category.value ? C.blue50 : C.white }}>
        <View style={{ flex: 1 }}><T s={14} w="semibold" c={C.navy}>{category.label}</T><T s={12} c={C.slate500}>{category.hint}</T></View>
        {form.category === category.value && <Check size={18} color={C.royal} />}
      </Pressable>)}
      {form.category === 'college'
        ? <Select label="College Department" value={form.department} placeholder={ready ? 'Select department' : 'Loading departments…'}
            options={departments.filter(dept => !['SHS', 'JHS', 'BED'].includes(dept.department_code?.toUpperCase())).map(dept => ({ label: dept.department_name, value: dept.department_name }))}
            onChange={value => set('department', value)} error={errors.department} />
        : form.category === 'employee' ? input('Department / Office', 'department', 'e.g. General Services')
        : <View style={{ gap: 12 }}>
          <Card bg={C.slate50}><T s={13}>Senior High School · Your 12-digit Learner Reference Number and the ID text will be checked. PASS staff must still approve your account.</T></Card>
          <Select label="Grade level" value={form.year_level} placeholder="Choose grade"
            options={[{ label: 'Grade 11', value: '11' }, { label: 'Grade 12', value: '12' }]}
            onChange={value => set('year_level', value)} error={errors.year_level} />
          {input('Section', 'section', 'e.g. STEM A', { autoCapitalize: 'characters' })}
        </View>}
      {input('Contact Number', 'contact', '09XX XXX XXXX', { keyboardType: 'phone-pad' })}
    </View>}

    {step === 1 && <View style={{ gap: 15 }}>
      <T s={13} c={C.slate500}>Upload the complete, upright front of your {form.category === 'employee' ? 'employee' : 'school'} ID. JPG/PNG gives the reader the best chance to extract text.</T>
      <FileUpload label={`${selectedCategory} ID (front)`} file={idFile} error={errors.school_id_file}
        onChange={changeFile} onError={error => setErrors(current => ({ ...current, school_id_file: error }))} />
      {!!idFile && <Btn label={reading ? 'Reading ID…' : 'Read ID again'}
        icon={<RefreshCw size={16} color={C.royal} />} bg={C.blue50} color={C.royal} border={C.blue100}
        loading={reading} disabled={busy} py={10} onPress={() => void readId(true)} />}
      {reading && <T s={13} c={C.royal}>Checking the document text and suggesting names and the ID number…</T>}
      {check && !reading && <Card border={check.status === 'matched' && !checkEdited ? C.green200 : C.blue100}
        bg={check.status === 'matched' && !checkEdited ? C.green50 : C.amber50}>
        <T s={15} w="bold" c={C.navy}>{checkEdited ? 'Edited details will be checked again' : ID_LABELS[check.status]}</T>
        {!checkEdited && <View style={{ gap: 8, marginTop: 9 }}>
          {needsAttention.length > 0 && <T s={13} w="semibold">Checks that need attention</T>}
          {Object.entries(check.checks ?? {}).map(([key, value]) => <View key={key} style={{ borderTopColor: C.slate200, borderTopWidth: 1, paddingTop: 7 }}>
            <T s={12} w="semibold">{value.result === 'pass' ? value.advisory ? 'Passed with advisory' : 'Passed' : value.result === 'fail' ? 'Correction needed' : 'Needs review'} · {CHECK_LABELS[key] ?? key}{typeof check.field_confidence?.[key] === 'number' ? ` · OCR ${check.field_confidence[key].toFixed(1)}%` : ''}</T>
            <T s={12} c={C.slate600}>{value.detail}</T>
          </View>)}
          {(check.reasons ?? []).filter(reason => !Object.values(check.checks ?? {}).some(value => value.result !== 'pass' && value.detail === reason)).map((reason, index) => <T s={12} key={index}>{reason}</T>)}
          {check.status === 'matched' && <T s={12}>{form.category === 'shs'
            ? 'Your ID text matched, but SHS accounts always require staff approval after email verification.'
            : 'If you verify your email, the server can activate this account automatically.'}</T>}
        </View>}
      </Card>}
      {check && (check.status === 'needs_correction' || form.request_manual_review) && <Pressable accessibilityRole="checkbox"
        accessibilityState={{ checked: form.request_manual_review }} onPress={() => set('request_manual_review', !form.request_manual_review)}
        style={{ flexDirection: 'row', gap: 9, padding: 12, borderRadius: 12, backgroundColor: C.amber50 }}>
        <T s={16} c={C.navy}>{form.request_manual_review ? '☑' : '☐'}</T>
        <T s={13} style={{ flex: 1 }}>The OCR reading is wrong but my details are correct. Request staff review; my account will remain pending.</T>
      </Pressable>}
      {input(form.category === 'shs' ? 'Learner Reference Number (LRN)' : 'ID Number', 'user_code', form.category === 'college' ? '2026-00123' : form.category === 'employee' ? '022-0001' : '000123456789', { autoCapitalize: 'characters' })}
      <T s={12} c={C.slate500}>{form.category === 'college' ? `9 digits; the first four are the starting year (no later than ${year}).` : form.category === 'employee' ? `7 digits; positions 2–3 indicate 2000+year (no later than ${year}). Keep any leading zero.` : 'Enter all 12 digits of the LRN printed on your SHS ID. Keep leading zeros; no enrollment-year pattern applies.'}</T>
      {input('First Name', 'first_name', 'First name', { autoCapitalize: 'words' })}
      {input('Surname', 'last_name', 'Full surname', { autoCapitalize: 'words' })}
      {input('M.I. (optional)', 'middle_initial', 'A.')}
      <Select label="Suffix (optional)" value={form.suffix} options={SUFFIXES.map(value => ({ value, label: value || 'None' }))} onChange={value => set('suffix', value)} />
      <T s={12} c={C.slate500}>Keep compound surnames intact. Place Jr., Sr. or Roman numerals in Suffix. All suggestions remain editable and are rechecked by the server.</T>
      {!!errors.id_check_receipt && <ErrorBox>{errors.id_check_receipt}</ErrorBox>}
    </View>}

    {step === 2 && <View style={{ gap: 16 }}>
      {input('Email Address', 'email', 'you@example.com', { keyboardType: 'email-address', autoCapitalize: 'none', autoCorrect: false })}
      {input('Password', 'password', 'At least 8 characters', { secureTextEntry: !showPassword, autoCapitalize: 'none' })}
      {input('Confirm Password', 'password_confirmation', 'Repeat password', { secureTextEntry: !showPassword, autoCapitalize: 'none' })}
      <Pressable onPress={() => setShowPassword(current => !current)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {showPassword ? <EyeOff color={C.royal} size={17} /> : <Eye color={C.royal} size={17} />}
        <Text style={txt(13, 'medium', C.royal)}>{showPassword ? 'Hide passwords' : 'Show passwords'}</Text>
      </Pressable>
      <T s={13} c={C.slate500}>After submitting, enter the six-digit code sent to your email. {form.category === 'shs'
        ? 'SHS always requires staff review, even when the document details match.'
        : 'A matched ID may lead to automatic account activation; unclear IDs remain pending staff review.'}</T>
    </View>}

    {step === 3 && <View style={{ gap: 12 }}>
      {summary.map(([label, value]) => <View key={label} style={{ flexDirection: 'row', gap: 14, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.slate100 }}>
        <T s={13} c={C.slate500} style={{ flex: 1 }}>{label}</T><T s={13} w="semibold" style={{ flex: 1, textAlign: 'right' }}>{value || '—'}</T>
      </View>)}
      <Card bg={C.blue50}><T s={13} c={C.navy}>Vehicle registration, photos and driver's license submissions happen after account activation, inside your dashboard. They never grant RFID access automatically.</T></Card>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: form.agree }} onPress={() => set('agree', !form.agree)}
        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8 }}>
        <T s={19} c={C.royal}>{form.agree ? '☑' : '☐'}</T><T s={13} style={{ flex: 1 }}>I agree to the PASS Terms and Conditions and Privacy Notice. I confirm these details and documents are accurate and mine.</T>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 8 }}><ShieldCheck size={17} color={C.royal} /><T s={12} c={C.slate500} style={{ flex: 1 }}>ID OCR compares document text, not the physical holder, actual enrollment or card authenticity.</T></View>
    </View>}

    {!!message && <Card bg={C.blue50}><T s={13} c={C.navy}>{message}</T></Card>}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 }}>
      <Pressable disabled={busy || reading} onPress={() => { if (step > 0) setStep(current => current - 1); else (onExit ?? onBackToLogin)(); setErrors({}); setMessage(''); }}
        style={{ paddingVertical: 13, paddingHorizontal: 12, borderWidth: 1, borderColor: C.slate200, borderRadius: 12, opacity: busy || reading ? 0.5 : 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <ChevronLeft color={C.slate600} size={16} /><T s={13}>Back</T>
      </Pressable>
      <View style={{ flex: 1 }}>
        <Btn label={busy ? 'Submitting…' : reading ? 'Checking…' : step === 3 ? 'Submit registration' : 'Continue'}
          icon={step < 3 ? <ChevronRight size={17} color={C.white} /> : <Check size={17} color={C.white} />}
          py={12} disabled={!ready || busy || reading || (step === 3 && !form.agree)} loading={busy || reading}
          onPress={() => { void (step === 3 ? submit() : next()); }} />
      </View>
    </View>
  </View>;
}
