/** Role-specific PASS mobile workspaces. Actions use the existing Laravel API. */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { AlertTriangle, ArrowLeft, BarChart3, ChevronRight, ClipboardCheck, Clock3, DoorOpen, FileCheck2, Fingerprint, ListFilter, LockKeyhole, MapPinned, RefreshCcw, Settings2, ShieldCheck, Users } from 'lucide-react-native';
import { api } from '../api/client';
import { useAuth, type MobileRole } from '../context/AuthContext';
import { Btn, Card, Field, Frame, T } from '../components/ui';
import { C } from '../theme';
import { NavyHeader } from './shared';
import ParkingMapScreen from './ParkingMapScreen';
import RfidWorkspaceScreen from './RfidWorkspaceScreen';
import VehicleReleaseScreen from './VehicleReleaseScreen';
import PrivateDocumentPreview from '../components/PrivateDocumentPreview';
import VisitorPassVerifier from '../components/VisitorPassVerifier';
import { MODULES, type ModuleKey, isStaff, isAdmin, canAccessModule, modulesForRole, GROUP_LABELS, ROLE_LABELS, roleSubtitle, type GroupKey } from '../permissions';

export { MODULES, isStaff, isAdmin };
export type { ModuleKey };

const MODULE_ICONS: Record<ModuleKey, any> = {
  'vehicle-releases': ShieldCheck, users: Users, authorizations: ClipboardCheck, 'licenses-review': FileCheck2, rfid: Fingerprint,
  transactions: Clock3, 'access-events': ListFilter, slots: MapPinned, visitors: Users,
  passes: ShieldCheck, 'qr-verify': ShieldCheck, gate: DoorOpen, violations: AlertTriangle,
  audit: LockKeyhole, settings: Settings2, reports: BarChart3, 'my-vehicles': ClipboardCheck,
};

const primaryTasks: Partial<Record<Exclude<MobileRole, null>, ModuleKey[]>> = {
  admin: ['users','rfid','reports','audit','settings'],
  parking_admin: ['authorizations','licenses-review','rfid','visitors','slots'],
  parking_staff: ['gate','rfid','vehicle-releases','visitors','transactions','slots'],
  security: ['gate','qr-verify','access-events','violations','slots'],
};

function Heading({ title, detail }: { title: string; detail?: string }) {
  return <View style={{gap:4}}><T s={17} w="head" c={C.navy}>{title}</T>{detail && <T s={12} c={C.slate500}>{detail}</T>}</View>;
}

function ModuleTile({ item, open }: { item: ModuleKey; open: (m: ModuleKey) => void }) {
  const spec = MODULES[item];
  const Icon = MODULE_ICONS[item];
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${spec.title}`} onPress={() => open(item)}
    style={({ pressed }) => ({ opacity: pressed ? 0.76 : 1 })}>
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
      <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' }}><Icon size={20} color={C.royal} /></View>
      <View style={{ flex: 1, gap: 3 }}><T s={14} w="semibold" c={C.navy}>{spec.title}</T><T s={12} c={C.slate500}>{spec.description}</T></View>
      <ChevronRight color={C.slate400} size={18}/>
    </Card>
  </Pressable>;
}

export function ModuleMenu({ open }: { open: (m: ModuleKey) => void }) {
  const { user } = useAuth();
  const role = user?.role ?? null;
  const entries = modulesForRole(role);
  const groups: GroupKey[] = ['administration','reviews','operations','security','monitoring'];
  return <Frame topInset={false} bottomPad={32}>
    <NavyHeader pb={28}><T s={12} c={C.blue200}>PASS WORKSPACE</T><T s={23} w="head" c={C.white}>{role === 'security' ? 'Security Tools' : role === 'admin' ? 'Administration' : 'Operations & Management'}</T><T s={12} c={C.blue200}>{roleSubtitle(role)}</T></NavyHeader>
    <View style={{ padding: 16, gap: 22 }}>
      {groups.map(group => {
        const keys = entries.filter(k => MODULES[k].group === group);
        return keys.length ? <View key={group} style={{ gap: 10 }}><Heading title={GROUP_LABELS[group]} /><View style={{ gap: 9 }}>{keys.map(k => <ModuleTile item={k} key={k} open={open} />)}</View></View> : null;
      })}
      {!entries.length && <Card><T s={14}>There are no management tools for this account.</T></Card>}
    </View>
  </Frame>;
}

const statsForRole = (role: MobileRole, payload: any): { label: string; value: unknown }[] => {
  const overall = payload?.overall ?? {};
  if (role === 'security') return [
    {label:'Occupied',value:overall.occupied}, {label:'Available',value:overall.available},
    {label:'Open incidents',value:payload?.open_incidents},
  ];
  return [
    {label:'Occupied',value:overall.occupied}, {label:'Available',value:overall.available},
    {label:'Total spaces',value:overall.capacity},
  ];
};

function StatCard({ label, value }: {label:string;value:unknown}) {
  return <Card style={{ flex:1, minWidth: 94, gap: 9, padding: 16, borderRadius: 18 }}>
    <View style={{width:25,height:4,backgroundColor:C.sky,borderRadius:99}}/>
    <T s={25} w="bold" c={C.navy} numberOfLines={1}>{typeof value === 'number' ? value.toLocaleString() : display(value)}</T>
    <T s={11} w="medium" c={C.slate500}>{label}</T>
  </Card>;
}

/** Security is intentionally a separate daily-duty dashboard from administration. */
export function StaffDashboardScreen({ open }: {open:(m:ModuleKey)=>void}) {
  const { user, token } = useAuth();
  const role = user?.role;
  const [summary, setSummary] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading,setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);setError('');
    try { setSummary(await api('/parking/overview', {token})); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load parking overview.'); }
    finally { setLoading(false); }
  },[token]);
  useEffect(()=>{void load();},[load]);
  if (!role || !['parking_admin','parking_staff','security'].includes(role)) return <Denied/>;
  const tasks = (primaryTasks[role] ?? []).filter(key=>canAccessModule(role,key));
  return <Frame topInset={false} bottomPad={30}>
    <NavyHeader pb={32}><T s={12} c={C.blue200}>{ROLE_LABELS[role].toUpperCase()}</T><T s={23} w="head" c={C.white}>Dashboard</T><T s={13} c={C.blue200}>{roleSubtitle(role)}</T></NavyHeader>
    <View style={{padding:16,gap:22}}>
      <View style={{gap:10}}><Heading title="Live campus parking" detail="Latest figures from the PASS server" />
        {!!error && <Card bg={C.red50} border={C.red200}><T s={12} c={C.red700}>{error}</T></Card>}
        {loading && <ActivityIndicator color={C.royal} />}
        <View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}>{statsForRole(role,summary).map(s=><StatCard key={s.label} {...s}/>)}</View>
        <Pressable accessibilityRole="button" onPress={()=>void load()} style={{flexDirection:'row',alignItems:'center',gap:8,paddingVertical:8}}><RefreshCcw size={15} color={C.royal}/><T s={13} w="medium" c={C.royal}>Refresh overview</T></Pressable>
      </View>
      <View style={{gap:11}}><Heading title={role === 'security' ? 'Security desk' : 'Priority tasks'} detail={role === 'security' ? 'Gate checks, visitor identity and access incidents' : 'Go directly to the tasks you handle'} />
        {tasks.map(key=><ModuleTile key={key} item={key} open={open}/>)}</View>
    </View>
  </Frame>;
}

function Summary({ token }: { token: string }) {
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState('');
  const [loading,setLoading] = useState(true);
  const load = useCallback(async()=>{
    setLoading(true);setError('');
    try { const r=await api<any>('/admin/dashboard',{token});setData({...(r.summary ?? {}),...(r.today_activity ?? {})}); }
    catch(e){setError(e instanceof Error?e.message:'Unable to load administrator summary.');}
    finally {setLoading(false);}
  },[token]);
  useEffect(()=>{void load();},[load]);
  const order = ['total_users','pending_approvals','total_vehicles','pending_vehicle_authorizations','total_rfid_tags','assigned_rfid_tags','available_rfid_tags','entries','exits'];
  const labels:Record<string,string> = {total_users:'Registered users',pending_approvals:'Pending accounts',total_vehicles:'Registered vehicles',pending_vehicle_authorizations:'Pending vehicles',total_rfid_tags:'RFID tags',assigned_rfid_tags:'Assigned tags',available_rfid_tags:'Available tags',entries:'Entries today',exits:'Exits today'};
  return <View style={{gap:10}}><Heading title="System overview" detail="Live figures for administrator oversight" />
    {!!error && <Card bg={C.red50} border={C.red200}><T s={12} c={C.red700}>{error}</T></Card>}
    {loading && <ActivityIndicator color={C.royal}/>}
    {!!data && <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{order.filter(key=>key in data).map(key=><View key={key} style={{width:'47%',flexGrow:1}}><StatCard label={labels[key]} value={data[key]}/></View>)}</View>}
    <Pressable onPress={()=>void load()} accessibilityRole="button" style={{flexDirection:'row',gap:8,paddingVertical:8,alignItems:'center'}}><RefreshCcw color={C.royal} size={15}/><T s={13} w="medium" c={C.royal}>Refresh statistics</T></Pressable>
  </View>;
}

export function AdminDashboardScreen({ open }: { open: (m: ModuleKey) => void }) {
  const { token, user } = useAuth();
  if (!token || user?.role !== 'admin') return <Denied />;
  return <Frame topInset={false} bottomPad={30}>
    <NavyHeader pb={28}><T s={12} c={C.blue200}>SYSTEM ADMINISTRATOR</T><T s={23} w="head" c={C.white}>Dashboard</T><T s={13} c={C.blue200}>System access, governance and reporting</T></NavyHeader>
    <View style={{padding:16,gap:24}}><Summary token={token}/>
      <View style={{gap:10}}><Heading title="Administrator tools" detail="Daily parking and gate operations are assigned to on-duty staff" />
        {(primaryTasks.admin ?? []).map(k=><ModuleTile item={k} open={open} key={k}/>)}</View>
    </View>
  </Frame>;
}

function Denied() { return <Frame><View style={{ padding: 24, gap: 8 }}><LockKeyhole size={26} color={C.red600}/><T s={20} w="bold" c={C.red600}>Access denied</T><T s={14}>Your PASS role does not have permission to use this feature.</T></View></Frame>; }

const display = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return Array.isArray(value) ? `${value.length} records` : Object.entries(value as Record<string, unknown>).map(([k,v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? 'Details' : String(v ?? '—')}`).join(' · ');
  return String(value);
};
const extractRows = (payload: any, key: ModuleKey): Record<string, any>[] => {
  if (key === 'users') return Array.isArray(payload?.users?.data) ? payload.users.data : [];
  if (key === 'slots') return Array.isArray(payload?.slots) ? payload.slots : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.areas) ? payload.areas : [];
  if (key === 'reports') return Object.entries({ ...(payload?.summary ?? {}), ...(payload?.today_activity ?? {}) }).map(([name, value]) => ({ name, value }));
  if (key === 'settings') return [];
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload)) return payload;
  return [];
};

function labelFor(row: any, key: ModuleKey): string {
  return display(row.name ?? row.visitor_name ?? row.party_name ?? row.plate_number ?? row.title ?? row.visitor?.name ?? row.owner_name ?? row.actor_label ?? row.action ?? row.slot_code ?? row.ticket_number ?? row.tag_uid ?? row.license_number ?? row.email ?? row.pass_code ?? row.request_id ?? row.event_id ?? row.notification_id ?? row.log_id ?? row.id ?? row.vehicle_id ?? row.transaction_id ?? key);
}
const FIELD_KEYS = ['visitor_name','party_name','actor_label','violation_name','description','severity','status','account_status','authorization_status','verification_status','request_status','pass_status','transaction_status','auth_result','entry_datetime','exit_datetime','event_datetime','occurred_at','plate_number','owner_name','owner_code','email','role','vehicle_type','license_type','slot_code','parking_area','area_name','is_occupied','visitor','vehicle','valid_from','valid_until','purpose','action','created_at','reason','denial_reason','value'];

const pretty = (key: string) => key.replace(/_/g, ' ').replace(/\b\w/g, c=>c.toUpperCase());
const STATUS_FIELDS = ['status','account_status','authorization_status','verification_status','request_status','pass_status','transaction_status','violation_status','stored_status','auth_result'];
function StatusTag({ value }: {value:string}) {
  const lower=value.toLowerCase();
  const good=['approved','active','verified','granted','completed','resolved','available'].includes(lower);
  const bad=['rejected','denied','revoked','suspended','dismissed','expired'].includes(lower);
  const background = good ? C.green50 : bad ? C.red50 : C.amber50;
  const textColor = good ? C.green700 : bad ? C.red700 : C.amber800;
  return <View style={{backgroundColor:background,borderRadius:20,paddingVertical:5,paddingHorizontal:10,alignSelf:'flex-start'}}><T s={11} w="semibold" c={textColor}>{pretty(value)}</T></View>;
}
function Detail({ label, value }: {label:string;value:unknown}) {
  return <View style={{flexDirection:'row',gap:9,paddingVertical:5,borderBottomWidth:1,borderBottomColor:C.slate50}}>
    <T s={12} c={C.slate500} style={{width:118,flexShrink:0}}>{pretty(label)}</T>
    <T s={12} c={C.slate700} style={{flex:1}}>{display(value)}</T>
  </View>;
}

export function DataModuleScreen({ module, back }: { module: ModuleKey; back: () => void }) {
  const { token, user } = useAuth();
  const spec = MODULES[module];
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [statusFilter,setStatusFilter] = useState('all');
  const [expanded,setExpanded] = useState<Record<string,boolean>>({});
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [visitorRejectReasons, setVisitorRejectReasons] = useState<Record<number,string>>({});
  const [licenseReviewReasons, setLicenseReviewReasons] = useState<Record<number,string>>({});
  const [authorizationReasons, setAuthorizationReasons] = useState<Record<number,string>>({});
  const [inviteFormOpen, setInviteFormOpen] = useState(false);
  const [invite, setInvite] = useState({ first_name: '', last_name: '', email: '', user_code: '', contact_number: '', role: 'parking_staff' });
  const [plate, setPlate] = useState('');
  const [direction, setDirection] = useState<'entry' | 'exit'>('entry');
  const [identityMode, setIdentityMode] = useState<'plate_number' | 'rfid_tag_uid' | 'qr_pass_code'>('plate_number');
  const [types,setTypes] = useState<{ vehicle_type_id:number; type_name:string; area_name:string }[]>([]);
  const [showVisitorForm,setShowVisitorForm] = useState(false);
  const [visitor,setVisitor] = useState({ first_name:'', last_name:'', contact_number:'', plate_number:'', vehicle_type_id:'', purpose:'', visiting:'', valid_from:'', valid_until:'' });
  const [settings, setSettings] = useState<Record<string,string>>({});
  const [incidentTypes,setIncidentTypes] = useState<{violation_code:string;violation_name:string;severity?:string}[]>([]);
  const [showIncidentForm,setShowIncidentForm] = useState(false);
  const [incident,setIncident] = useState({violation_code:'',plate_number:'',slot_code:'',description:''});
  const refresh = useCallback(async () => {
    if (!token || !spec?.endpoint) { setLoading(false); return; }
    if (module === 'slots') { setLoading(false); return; } // native map owns its live polling and selection
    setLoading(true); setError('');
    try {
      const result = await api<any>(spec.endpoint, { token });
      setRows(extractRows(result, module));
      if (module === 'settings') setSettings(result.data ?? {});
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load data.'); }
    finally { setLoading(false); }
  }, [module, token, spec?.endpoint]);
  useEffect(() => { setQ('');setStatusFilter('all');setExpanded({});void refresh(); }, [refresh]);
  useEffect(() => { if (module === 'visitors' && token) api<any>('/visitors/options', {token}).then(r => setTypes(r.vehicle_types ?? [])).catch(e => setError(e.message)); }, [module, token]);
  useEffect(() => { if (module === 'violations' && token) api<any>('/violation-types',{token}).then(r=>setIncidentTypes(r.data ?? [])).catch(e=>setError(e.message)); },[module,token]);
  if (!spec || !canAccessModule(user?.role ?? null, module) || !token) return <Denied />;
  if (module === 'slots') return <ParkingMapScreen back={back} />;
  if (module === 'vehicle-releases') return <VehicleReleaseScreen back={back} />;
  if (module === 'rfid' || module === 'access-events') return <RfidWorkspaceScreen back={back} initialTab={module === 'rfid' && user?.role === 'admin' ? 'credentials' : 'events'} />;

  async function action(path: string, method: 'POST'|'PATCH'|'PUT', json?: any) {
    if (!token || busy) return;
    setBusy(true); setError('');
    try { const response = await api<any>(path, { token, method, json }); Alert.alert('PASS', response.message ?? 'Operation completed.'); await refresh(); }
    catch (e) { Alert.alert('Action failed', e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  function confirm(title: string, path: string, method: 'POST' | 'PATCH', json?: any) {
    Alert.alert(title, 'Confirm this action on the live PASS database?', [ { text: 'Cancel', style: 'cancel' }, { text: 'Confirm', onPress: () => { void action(path, method, json); } } ]);
  }
  const keys = module === 'users' ? ['name','email','idNum','role','status','dept'] : FIELD_KEYS;
  const statusOf = (r:Record<string,any>) => String(STATUS_FIELDS.map(k => r[k]).find(v => v !== undefined && v !== null) ?? '');
  const availableStatuses = Array.from(new Set(rows.map(statusOf).filter(Boolean))).slice(0, 8);
  const shown = rows.filter(r => (statusFilter === 'all' || statusOf(r) === statusFilter) && (!q.trim() || JSON.stringify(r).toLowerCase().includes(q.trim().toLowerCase())));
  const renderRow = (r: Record<string, any>, idx: number) => {
    const id = Number(r.id ?? r.request_id ?? r.license_id ?? r.qr_pass_id ?? r.transaction_id ?? r.authorization_id ?? r.violation_id);
    const identifier = String(r.id ?? r.user_id ?? r.request_id ?? r.license_id ?? r.qr_pass_id ?? r.transaction_id ?? r.authorization_id ?? r.violation_id ?? r.log_id ?? r.event_id ?? idx);
    const open = !!expanded[identifier];
    const status = statusOf(r);
    const usable = keys.filter(k => r[k] !== undefined && r[k] !== null && !STATUS_FIELDS.includes(k));
    const details = open ? usable : usable.slice(0, 3);
    return <Card key={`${module}-${identifier}`} style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row',alignItems:'flex-start',gap:10,justifyContent:'space-between' }}>
        <View style={{flex:1,gap:5}}><T s={15} w="semibold" c={C.navy}>{module === 'reports' ? pretty(String(r.name)) : labelFor(r, module)}</T>
          {!!status && <StatusTag value={status}/>}</View>
        <T s={11} c={C.slate400}>{module === 'users' ? r.idNum ?? '' : ''}</T>
      </View>
      <View>{details.map(k=><Detail key={k} label={k} value={r[k]}/>)}</View>
      {module === 'users' && r.schoolIdCheck && <Card bg={C.blue50} style={{ gap: 6 }}>
        <T s={13} w="bold" c={C.navy}>Institutional ID verification evidence</T>
        <T s={12}>Category: {r.registrationCategory ?? '—'} · OCR: {r.schoolIdCheck.status ?? 'unknown'}</T>
        <T s={12}>Grade/section: {[r.yearLevel && `Grade ${r.yearLevel}`, r.section].filter(Boolean).join(' · ') || 'Not applicable'}</T>
        {Object.entries(r.schoolIdCheck.checks ?? {}).map(([key, value]: [string, any]) => <T s={12} key={key}>
          {pretty(key)}: {value?.result ?? '—'} · {value?.detail ?? ''}
        </T>)}
        {(r.schoolIdCheck.reasons ?? []).map((reason: string, index: number) => <T s={12} key={index} c={C.amber800}>{reason}</T>)}
        <T s={12} c={C.slate500}>OCR text does not prove membership or ID authenticity. Check the original document before deciding.</T>
      </Card>}
      {module === 'users' && r.schoolIdSubmitted && <PrivateDocumentPreview path={`/admin/users/${id}/school-id`} label="institutional ID" />}
      {usable.length > 3 && <Pressable accessibilityRole="button" onPress={()=>setExpanded(prev=>({...prev,[identifier]:!prev[identifier]}))} style={{paddingVertical:6}}><T s={12} w="medium" c={C.royal}>{open ? 'Show less' : `View all details (${usable.length})`}  {open ? '↑' : '↓'}</T></Pressable>}
      {module === 'users' && user?.role === 'admin' && r.status === 'pending' && <View style={{ gap: 8, marginTop: 8 }}><Btn label="Approve account" disabled={busy} onPress={() => confirm('Approve account', `/admin/users/${id}/approve`, 'PATCH')} py={10} /><Btn label="Reject account" disabled={busy} bg={C.red600} onPress={() => confirm('Reject account', `/admin/users/${id}/reject`, 'PATCH')} py={10} /></View>}
      {module === 'visitors' && (user?.role === 'parking_admin' || user?.role === 'parking_staff') && r.request_status === 'pending' && <View style={{ gap: 8, marginTop: 8 }}><Btn label="Approve visitor" disabled={busy} onPress={() => confirm('Approve visitor', `/visitors/requests/${id}/approve`, 'POST', {})} py={10} /><Field label="Reason for rejection" value={visitorRejectReasons[id] ?? ''} onChangeText={value => setVisitorRejectReasons(prev => ({...prev,[id]:value}))} placeholder="Explain why this visit is rejected"/><Btn label="Reject visitor" disabled={busy} onPress={() => { const reason = (visitorRejectReasons[id] ?? '').trim(); if (!reason) {Alert.alert('Reason required','Enter a reason before rejecting the visitor request.');return;}confirm('Reject visitor', `/visitors/requests/${id}/reject`, 'POST', {remarks:reason}); }} bg={C.red600} py={10} /></View>}
      {module === 'licenses-review' && <View style={{ gap: 8, marginTop: 8 }}>
        {r.has_file && <PrivateDocumentPreview path={`/licenses/${id}/file`} label="driver's license" />}
        <T s={12} c={C.slate500}>Automatic check: {r.verification_status ?? 'Unknown'} · Source: {r.verification_source ?? '—'}</T>
        {r.verification_reason ? <T s={12} c={C.red700}>{r.verification_reason}</T> : null}
        {r.ocr_result?.checks && Object.entries(r.ocr_result.checks).map(([key, value]: [string, any]) =>
          <T key={key} s={11}>{key.replace(/_/g, ' ')}: {value?.result ?? ''} {value?.detail ?? ''}</T>)}
        {r.verification_status !== 'verified' && r.verification_status !== 'processing' && <>
          <T s={12} c={C.slate500}>Review the private document and OCR evidence before making an exception decision. For PDFs or any unreadable evidence, use the authorized web review.</T>
          <Field label="Staff review reason" value={licenseReviewReasons[id] ?? ''} placeholder="Explain your decision / correction needed"
            onChangeText={value => setLicenseReviewReasons(previous => ({ ...previous, [id]: value }))} />
          <Btn label="Verify as staff exception" disabled={busy} onPress={() => confirm('Verify license', `/licenses/${id}/review`, 'PATCH', { decision: 'verified', reason: (licenseReviewReasons[id] ?? '').trim() || null })} py={10} />
          <Btn label="Request correction" disabled={busy} bg={C.red600} onPress={() => {
            const reason = (licenseReviewReasons[id] ?? '').trim();
            if (!reason) { Alert.alert('Reason required', 'Explain what the owner needs to correct.'); return; }
            confirm('Request correction', `/licenses/${id}/review`, 'PATCH', { decision: 'needs_correction', reason });
          }} py={10} />
          {r.verification_status !== 'pending_review' && <Btn label="Hold for staff review" bg={C.slate600} disabled={busy}
            onPress={() => confirm('Hold license for staff review', `/licenses/${id}/review`, 'PATCH', { decision: 'pending_review', reason: (licenseReviewReasons[id] ?? '').trim() || null })} py={10} />}
        </>}
      </View>}
      {module === 'authorizations' && r.authorization_status === 'approved' && <Btn label="Suspend authorization" bg={C.red600} py={10} disabled={busy} onPress={() => confirm('Suspend authorization', `/vehicles/authorizations/${r.authorization_id}/suspend`, 'PATCH', { reason: 'Suspended by the parking administrator.' })} />}
      {module === 'authorizations' && r.authorization_status === 'pending' && <View style={{ gap: 9 }}>
        <T s={12} c={C.slate500}>Before approving, inspect the vehicle photograph and latest verified driver's license in the PASS staff web view. RFID assignment remains separate.</T>
        <Field label="Reason if rejecting" placeholder="Explain required corrections" value={authorizationReasons[id] ?? ''}
          onChangeText={value => setAuthorizationReasons(previous => ({ ...previous, [id]: value }))} />
        <Btn label="Approve vehicle authorization" py={10} disabled={busy}
          onPress={() => confirm('Approve vehicle authorization', `/vehicles/authorizations/${id}/review`, 'PATCH', { decision: 'approved' })} />
        <Btn label="Reject vehicle authorization" bg={C.red600} py={10} disabled={busy}
          onPress={() => { const reason = (authorizationReasons[id] ?? '').trim(); if (!reason) { Alert.alert('Reason required', 'Enter a reason for rejecting the vehicle.'); return; }
            confirm('Reject vehicle authorization', `/vehicles/authorizations/${id}/review`, 'PATCH', { decision: 'rejected', reason }); }} />
      </View>}
      {module === 'authorizations' && r.authorization_status === 'suspended' && <Btn label="Lift suspension" py={10} disabled={busy} onPress={() => confirm('Lift suspension', `/vehicles/authorizations/${r.authorization_id}/lift-suspension`, 'PATCH')} />}
      {module === 'violations' && r.violation_status === 'open' && <Btn label="Acknowledge incident" py={10} disabled={busy} onPress={()=>confirm('Acknowledge incident',`/violations/${r.violation_id}`,'PATCH',{action:'acknowledge'})}/>}
      {module === 'violations' && r.violation_status === 'under_review' && <Btn label="Mark resolved" py={10} disabled={busy} onPress={()=>confirm('Resolve incident',`/violations/${r.violation_id}`,'PATCH',{action:'resolve'})}/>}
      {module === 'passes' && (r.status === 'active' || r.stored_status === 'active') && <Btn label="Revoke pass" disabled={busy} py={10} bg={C.red600} onPress={() => confirm('Revoke pass', `/visitors/passes/${r.qr_pass_id}/revoke`, 'POST', { reason: 'Revoked by authorized staff' })} />}
    </Card>;
  };
  return <Frame topInset={false} bottomPad={32}><NavyHeader pb={26}><Pressable accessibilityRole="button" onPress={back} style={{flexDirection:'row',alignItems:'center',gap:5,marginBottom:16}}><ArrowLeft size={15} color={C.blue200}/><T s={13} c={C.blue200}>Back to workspace</T></Pressable><T s={22} w="head" c={C.white}>{spec.title}</T><T s={12} c={C.blue200}>{spec.description}</T></NavyHeader>
    <View style={{ padding: 16, gap: 12 }}>
      {module === 'users' && <Card style={{ gap: 11 }}>
        <T s={16} w="bold" c={C.navy}>Administrator and parking staff accounts</T>
        <T s={12} c={C.slate500}>Invitations generate a temporary password on the server. Recipients must activate their email and set a personal password before receiving full access.</T>
        <Btn label={inviteFormOpen ? 'Hide invitation form' : 'Invite an administrator or parking staff'} bg={C.navy} py={10}
          onPress={() => setInviteFormOpen(value => !value)} />
        {inviteFormOpen && <View style={{ gap: 11 }}>
          {(['first_name', 'last_name', 'email', 'user_code', 'contact_number'] as const).map(key =>
            <Field key={key} label={pretty(key)} value={invite[key]}
              autoCapitalize={key === 'email' ? 'none' : key === 'contact_number' ? 'none' : 'characters'}
              onChangeText={value => setInvite(previous => ({ ...previous, [key]: value }))} />)}
          <T s={12} w="semibold">Requested role</T>
          {([{ role: 'parking_staff', label: 'Parking staff / security officer' }, { role: 'admin', label: 'System administrator' }] as const).map(option =>
            <Pressable key={option.role} accessibilityRole="radio" accessibilityState={{ checked: invite.role === option.role }}
              onPress={() => setInvite(previous => ({ ...previous, role: option.role }))}
              style={{ padding: 10, borderRadius: 9, backgroundColor: invite.role === option.role ? C.blue100 : C.slate50 }}>
              <T s={13}>{invite.role === option.role ? '✓ ' : ''}{option.label}</T>
            </Pressable>)}
          <Btn label="Confirm and send invitation" disabled={busy || !invite.first_name.trim() || !invite.last_name.trim() || !invite.email.trim() || !invite.user_code.trim()}
            onPress={() => confirm('Invite privileged account', '/admin/account-invitations', 'POST', {
              first_name: invite.first_name.trim(), last_name: invite.last_name.trim(), email: invite.email.trim(),
              user_code: invite.user_code.trim().toUpperCase(), role: invite.role,
              ...(invite.contact_number.trim() ? { contact_number: invite.contact_number.trim() } : {}),
            })} />
        </View>}
      </Card>}
      {module === 'qr-verify' && <VisitorPassVerifier token={token} />}
      {module === 'violations' && <Card style={{gap:11}}>
        <Pressable accessibilityRole="button" onPress={()=>setShowIncidentForm(v=>!v)}><T s={16} w="semibold" c={C.navy}>{showIncidentForm ? '− Close incident form' : '+ Report an incident'}</T></Pressable>
        {showIncidentForm && <>
          <T s={12} c={C.slate500}>Create a record for an observed campus parking incident. Select the actual violation type.</T>
          <T s={12} w="medium">Incident type</T>
          {incidentTypes.map(type=><Pressable key={type.violation_code} onPress={()=>setIncident(prev=>({...prev,violation_code:type.violation_code}))} style={{padding:11,borderRadius:10,borderColor:incident.violation_code===type.violation_code?C.royal:C.slate200,borderWidth:1,backgroundColor:incident.violation_code===type.violation_code?C.blue50:C.white}}><T s={13} c={C.navy}>{incident.violation_code===type.violation_code?'✓ ':''}{type.violation_name}</T>{!!type.severity && <T s={11} c={C.slate500}>{type.severity}</T>}</Pressable>)}
          <Field label="Vehicle plate number" value={incident.plate_number} autoCapitalize="characters" onChangeText={v=>setIncident(prev=>({...prev,plate_number:v}))}/>
          <Field label="Observed slot (if applicable)" value={incident.slot_code} autoCapitalize="characters" onChangeText={v=>setIncident(prev=>({...prev,slot_code:v}))} placeholder="Required for wrong-slot incidents"/>
          <Field label="Incident description" multiline numberOfLines={3} value={incident.description} onChangeText={v=>setIncident(prev=>({...prev,description:v}))}/>
          <Btn label="Submit incident report" loading={busy} disabled={!incident.violation_code || !incident.plate_number.trim() || !incident.description.trim()} onPress={()=>{void action('/violations','POST',{...incident,plate_number:incident.plate_number.toUpperCase().trim(),slot_code:incident.slot_code.trim() || null});}}/>
        </>}
      </Card>}
      {module === 'visitors' && <Card style={{gap:10}}><Pressable accessibilityRole="button" onPress={()=>setShowVisitorForm(v=>!v)}><T s={16} w="bold" c={C.navy}>{showVisitorForm ? '− Hide registration form' : '+ Register a visitor'}</T></Pressable>{showVisitorForm && <><T s={12} c={C.slate500}>Authorized PASS staff register visitors here. The request will require approval before a QR pass is issued.</T>
        {(['first_name','last_name','contact_number','plate_number','purpose','visiting','valid_from','valid_until'] as const).map(k => <Field key={k} label={k.replace(/_/g,' ')} value={visitor[k]} onChangeText={v => setVisitor(prev=>({...prev,[k]:v}))} placeholder={k.startsWith('valid_')?'YYYY-MM-DDTHH:MM':k.replace(/_/g,' ')}/>)}
        <T s={12} c={C.slate500}>Vehicle type (required)</T>
        {types.map(type => <Pressable key={type.vehicle_type_id} onPress={() => setVisitor(prev=>({...prev,vehicle_type_id:String(type.vehicle_type_id)}))} style={{padding:9,borderRadius:8,backgroundColor:visitor.vehicle_type_id===String(type.vehicle_type_id)?C.blue100:C.slate50}}><T s={13}>{visitor.vehicle_type_id===String(type.vehicle_type_id)?'✓ ':''}{type.type_name} — {type.area_name}</T></Pressable>)}
        <Btn label="Create pending visitor request" onPress={() => { if (Object.values(visitor).some(v => !v.trim())) {setError('Complete all visitor details, dates, and vehicle type first.');return;} void action('/visitors/requests','POST',{...visitor,vehicle_type_id:Number(visitor.vehicle_type_id)}); }} />
      </>}</Card>}
      {module === 'gate' && <Card style={{ gap: 12 }}><T s={13} c={C.slate600}>Enter an RFID tag, visitor QR code, or plate. Laravel decides whether access is authorized.</T>
        <T s={12} c={C.slate500}>Identification method</T>
        {(['plate_number','rfid_tag_uid','qr_pass_code'] as const).map(mode => <Pressable key={mode} onPress={() => setIdentityMode(mode)} style={{padding:9,backgroundColor:identityMode===mode?C.blue100:C.slate50,borderRadius:8}}><T s={13}>{identityMode===mode?'✓ ':''}{mode.replace(/_/g,' ')}</T></Pressable>)}
        <Field label={identityMode.replace(/_/g,' ')} value={identityMode==='plate_number'?plate:code} onChangeText={identityMode==='plate_number'?setPlate:setCode} autoCapitalize="characters"/>
        <View style={{ flexDirection: 'row', gap: 8 }}><Btn label="Entry" onPress={() => setDirection('entry')} bg={direction === 'entry' ? C.royal : C.slate500} py={10} style={{ flex: 1 }} /><Btn label="Exit" onPress={() => setDirection('exit')} bg={direction === 'exit' ? C.royal : C.slate500} py={10} style={{ flex: 1 }} /></View>
        <Btn label={`Record ${direction}`} disabled={busy || !(identityMode==='plate_number'?plate.trim():code.trim())} onPress={() => { const value = (identityMode==='plate_number'?plate:code).trim(); confirm(`Record ${direction}`, `/parking/${direction}`, 'POST', { [identityMode]: identityMode==='plate_number'?value.toUpperCase():value }); }} />
      </Card>}
      {module === 'settings' && <Card style={{ gap: 12 }}><Heading title="General configuration" detail="Changes apply system-wide. Check the values before saving." />{loading && <ActivityIndicator color={C.royal}/>}{['system_name','institution_name','contact_email','contact_phone','timezone','date_format'].map(k => <Field key={k} label={k.replace(/_/g, ' ')} value={settings[k] ?? ''} onChangeText={v => setSettings(prev => ({ ...prev, [k]: v }))} />)}<Btn label="Save general settings" disabled={busy || loading} loading={busy} onPress={() => { Alert.alert('Save system settings','These changes affect the entire PASS system.',[{text:'Cancel',style:'cancel'},{text:'Save',onPress:()=>{void action('/admin/system-settings','PUT',settings);}}]); }} /></Card>}
      {module !== 'qr-verify' && module !== 'gate' && module !== 'settings' && <>
        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Heading title="Records" detail={`${shown.length} shown · ${rows.length} loaded from PASS`}/>
          <Pressable onPress={()=>void refresh()} disabled={loading} accessibilityLabel="Refresh records" style={{padding:10,backgroundColor:C.blue50,borderRadius:12}}><RefreshCcw size={18} color={C.royal}/></Pressable></View>
        <Field value={q} onChangeText={setQ} placeholder="Search by name, plate or status..." autoCorrect={false} />
        {availableStatuses.length > 1 && <View style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>{['all',...availableStatuses].map(value=><Pressable accessibilityRole="button" key={value} onPress={()=>setStatusFilter(value)} style={{paddingVertical:8,paddingHorizontal:12,borderRadius:20,borderWidth:1,borderColor:statusFilter===value?C.royal:C.slate200,backgroundColor:statusFilter===value?C.blue50:C.white}}><T s={12} w="medium" c={statusFilter===value?C.royal:C.slate600}>{value==='all'?'All statuses':pretty(value)}</T></Pressable>)}</View>}
        {loading && <ActivityIndicator color={C.royal} />}
        {!!error && <Card bg={C.red50} border={C.red200}><T s={13} c={C.red700}>{error}</T><Pressable onPress={()=>void refresh()}><T s={12} w="medium" c={C.royal}>Retry</T></Pressable></Card>}
        {!loading && !error && shown.length === 0 && <Card><T s={15} w="semibold" c={C.navy}>No matching records</T><T s={12} c={C.slate500}>{rows.length ? 'Try clearing the search or status filter.' : 'This module has no records yet.'}</T></Card>}
        {shown.slice(0, 200).map(renderRow)}
        {shown.length > 200 && <T s={12} c={C.slate500}>Showing the first 200 results. Refine your search to narrow the list.</T>}
      </>}
      {(module === 'qr-verify' || module === 'gate' || module === 'settings') && !!error && <T s={12} c={C.red600}>{error}</T>}
    </View>
  </Frame>;
}
