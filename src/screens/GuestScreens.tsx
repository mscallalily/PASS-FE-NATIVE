import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { api, ApiError } from '../api/client';
import { toUploadFile } from '../api/upload';
import { Select } from '../components/Select';
import { Btn, Card, Field, FileUpload, Frame, PickedFile, T } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { C } from '../theme';
import type { MobileUser } from '../context/AuthContext';
import type { MobileScreen } from './shared';

interface GuestVehicle { vehicle_id: number; plate_number: string; type_name: string; make?: string; model?: string; color?: string; area_name?: string }
interface VehicleType { vehicle_type_id: number; type_name: string }
interface GuestRequest { request_id: number; request_status: string; purpose?: string; valid_from?: string; valid_until?: string; review_remarks?: string; plate_number?: string }
interface GuestPass { qr_pass_id: number; pass_code: string; status: string; plate_number?: string; vehicle_type?: string;
  valid_from?: string; valid_until?: string; use_count?: number; max_uses?: number; revoke_reason?: string }
interface GuestVisit { transaction_id: number; plate_number?: string; ticket_number?: string; status?: string; entry_datetime?: string;
  exit_datetime?: string; slot_code?: string; area_name?: string; duration_minutes?: number }

const dateInManila = (offsetDays = 0) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(Date.now() + offsetDays * 86400000));

const safeError = (error: unknown) => error instanceof ApiError && error.status === 404
  ? 'The guest self-service API is unavailable on this server. Use the latest matching PASS backend.'
  : error instanceof Error ? error.message : 'Could not load guest information.';

export function GuestHomeScreen({ user, onNavigate }: { user: MobileUser; onNavigate: (screen: MobileScreen) => void }) {
  const { token } = useAuth();
  const [counts, setCounts] = useState({ vehicles: 0, requests: 0, passes: 0, visits: 0 });
  const [latest, setLatest] = useState<GuestRequest[]>([]);
  const [visits, setVisits] = useState<GuestVisit[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const [vehicle, requests, passes, visits] = await Promise.all([
        api<{ data: GuestVehicle[] }>('/guest/vehicles', { token }),
        api<{ data: GuestRequest[] }>('/guest/requests', { token }),
        api<{ data: GuestPass[] }>('/guest/passes', { token }),
        api<{ data: GuestVisit[] }>('/guest/visits', { token }),
      ]);
      setLatest(requests.data ?? []);
      setVisits(visits.data ?? []);
      setCounts({ vehicles: vehicle.data?.length ?? 0, requests: requests.data?.filter(r => r.request_status === 'pending').length ?? 0,
        passes: passes.data?.filter(pass => ['active', 'scheduled'].includes(pass.status)).length ?? 0, visits: visits.data?.length ?? 0 });
    } catch (e) { setError(safeError(e)); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  return <Frame bottomPad={100}><View style={{ padding: 20, gap: 14 }}>
    <T s={24} w="head" c={C.navy}>Guest Dashboard</T><T s={13} c={C.slate500}>Welcome, {user.name}. Your parking request must be approved before a visitor QR pass is issued.</T>
    {!token && <Card bg={C.amber50}><T s={15} w="bold" c={C.navy}>Browsing only</T><T s={13}>Sign in with your verified guest account to submit visitor requests and view passes. Browsing cannot grant access.</T></Card>}
    {loading && <ActivityIndicator color={C.royal} />}
    {!!error && <Card bg={C.red50}><T s={13} c={C.red700}>{error}</T></Card>}
    {!!token && <><View style={{ flexDirection: 'row', gap: 9 }}>
      {[['Vehicles', counts.vehicles], ['Pending', counts.requests], ['Passes', counts.passes]].map(([label, value]) => <View key={label} style={{ flex: 1 }}><Card><T s={20} w="bold" c={C.navy}>{value}</T><T s={11} c={C.slate500}>{label}</T></Card></View>)}
    </View><Card><T s={14}>Recorded visits: {counts.visits}</T></Card>
      {latest.slice(0, 3).map(request => <Card key={request.request_id}><T s={14} w="bold">Request #{request.request_id} · {request.request_status}</T><T s={12}>{request.plate_number ?? 'No plate'} · {request.purpose ?? 'Campus visit'}</T><T s={12}>{request.review_remarks ?? ''}</T></Card>)}
      {visits.length > 0 && <Card style={{ gap: 8 }}><T s={15} w="bold" c={C.navy}>Recent parking visits</T>
        {visits.slice(0, 5).map(visit => <View key={visit.transaction_id} style={{ borderTopWidth: 1, borderTopColor: C.slate100, paddingTop: 8 }}>
          <T s={13} w="semibold">{visit.plate_number ?? 'Vehicle'} · {visit.status ?? 'Recorded'}</T>
          <T s={12}>{visit.entry_datetime ?? '—'} · {visit.area_name ?? visit.slot_code ?? 'Campus parking'}</T>
          {!!visit.exit_datetime && <T s={12}>Exit: {visit.exit_datetime} · {visit.duration_minutes ?? '—'} minutes</T>}
        </View>)}
      </Card>}
    </>}
    <Btn label="New visitor request / My vehicles" onPress={() => onNavigate('guest-request')} />
    <Btn label="View my QR passes" bg={C.navy} onPress={() => onNavigate('qr')} />
    {!!token && <Btn label="Refresh dashboard" bg={C.blue50} color={C.royal} onPress={() => void load()} py={11} />}
  </View></Frame>;
}

export function GuestRequestPortal() {
  const { token } = useAuth();
  const [vehicles, setVehicles] = useState<GuestVehicle[]>([]);
  const [types, setTypes] = useState<VehicleType[]>([]);
  const [requests, setRequests] = useState<GuestRequest[]>([]);
  const [form, setForm] = useState({ vehicle_id: '', visit_date: '', arrival_time: '', departure_time: '',
    visiting: '', purpose: '', driver_is_requester: 'true', driver_name: '', driver_license_number: '', driver_license_expiry: '', passenger_count: '0' });
  const [vehicleForm, setVehicleForm] = useState({ plate_number: '', vehicle_type_id: '', make: '', model: '', color: '' });
  const [licensePhoto, setLicensePhoto] = useState<PickedFile | null>(null);
  const [vehiclePhoto, setVehiclePhoto] = useState<PickedFile | null>(null);
  const [creatingVehicle, setCreatingVehicle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const cancelRequest = (requestId: number) => {
    if (!token || busy) return;
    Alert.alert('Cancel visitor request?', 'A cancelled request cannot be used for entry. You can submit a new request later.', [
      { text: 'Keep request', style: 'cancel' },
      { text: 'Cancel request', style: 'destructive', onPress: () => { void (async () => {
        setBusy(true); setError(''); setNotice('');
        try {
          const result = await api<{ message: string }>(`/guest/requests/${requestId}/cancel`, { token, method: 'POST' });
          setNotice(result.message ?? 'Request cancelled.');
          await load();
        } catch (e) { setError(safeError(e)); }
        finally { setBusy(false); }
      })(); } },
    ]);
  };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const [vehicleResponse, requestResponse] = await Promise.all([
        api<{ data: GuestVehicle[]; vehicle_types: VehicleType[] }>('/guest/vehicles', { token }),
        api<{ data: GuestRequest[] }>('/guest/requests', { token }),
      ]);
      setVehicles(vehicleResponse.data ?? []);
      setTypes(vehicleResponse.vehicle_types ?? []);
      setRequests(requestResponse.data ?? []);
      if ((vehicleResponse.data ?? []).length === 1) setForm(previous => ({ ...previous, vehicle_id: String(vehicleResponse.data[0].vehicle_id) }));
    } catch (e) { setError(safeError(e)); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const addVehicle = async () => {
    if (!token || busy) return;
    if (!vehicleForm.plate_number.trim() || !vehicleForm.vehicle_type_id) { setError('Enter the vehicle plate and select a type.'); return; }
    setBusy(true); setError('');
    try {
      const result = await api<{ message?: string }>('/guest/vehicles', { token, method: 'POST', json: {
        ...vehicleForm, vehicle_type_id: Number(vehicleForm.vehicle_type_id), plate_number: vehicleForm.plate_number.trim().toUpperCase(),
      }});
      setNotice(result.message ?? 'Vehicle registered.');
      setVehicleForm({ plate_number: '', vehicle_type_id: '', make: '', model: '', color: '' }); setCreatingVehicle(false);
      await load();
    } catch (e) { setError(safeError(e)); }
    finally { setBusy(false); }
  };

  const submitRequest = async () => {
    if (!token || busy) return;
    if (!form.vehicle_id || !form.visit_date || form.visit_date < dateInManila(1) || !form.arrival_time || !form.departure_time || form.departure_time <= form.arrival_time || !form.purpose.trim() || !form.visiting.trim()) {
      setError('Choose a registered vehicle, a date from tomorrow onward, arrival/departure times, purpose and destination.'); return;
    }
    if (form.driver_is_requester === 'false' && !/^\S+(\s+\S+)+$/.test(form.driver_name.trim())) { setError('Enter the actual driver’s complete name.'); return; }
    if (!/^[A-Za-z0-9 -]{6,30}$/.test(form.driver_license_number.trim()) || !form.driver_license_expiry || form.driver_license_expiry < form.visit_date) {
      setError('Enter the actual driver’s valid license number and expiry date.'); return;
    }
    if (!/^\d+$/.test(form.passenger_count) || Number(form.passenger_count) > 99) { setError('Passenger count must be 0–99.'); return; }
    if (!licensePhoto || !vehiclePhoto || ![licensePhoto, vehiclePhoto].every(file => /^image\/(jpeg|png)$/.test(file.type))) {
      setError('Upload both the actual driver’s license and vehicle plate photos (JPG/PNG).'); return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      const data = new FormData();
      for (const [key, value] of Object.entries(form)) data.append(key, key === 'driver_is_requester' ? (value === 'true' ? '1' : '0') : value);
      data.append('driver_license_photo', toUploadFile(licensePhoto) as any);
      data.append('vehicle_photo', toUploadFile(vehiclePhoto) as any);
      const result = await api<{ message?: string }>('/guest/requests', { token, method: 'POST', form: data });
      setNotice(result.message || 'Your request was submitted. Wait for PASS staff approval before using a QR pass.');
      setForm(previous => ({ ...previous, purpose: '', visiting: '', visit_date: '', arrival_time: '', departure_time: '' }));
      setVehiclePhoto(null); setLicensePhoto(null);
      await load();
    } catch (e) { setError(safeError(e)); }
    finally { setBusy(false); }
  };

  if (!token) return <Frame bottomPad={96}><View style={{ padding: 20, gap: 12 }}>
    <T s={22} w="head" c={C.navy}>Visitor Parking Request</T><Card><T s={15} w="bold">Visitor registration requires verification</T><T s={13}>A browsing-only guest cannot submit a request or receive a QR pass. Create a guest account, verify your email and sign in.</T></Card>
  </View></Frame>;

  return <Frame bottomPad={96}><View style={{ padding: 20, gap: 13 }}>
    <T s={22} w="head" c={C.navy}>Visitor Parking Request</T>
    <T s={13} c={C.slate500}>Register the vehicle first, then request tomorrow or a later visit. Only PASS staff can approve it.</T>
    {loading && <ActivityIndicator color={C.royal} />}
    {!!error && <Card bg={C.red50}><T s={13} c={C.red700}>{error}</T></Card>}
    {!!notice && <Card bg={C.green50}><T s={13}>{notice}</T></Card>}
    <Card style={{ gap: 8 }}><T s={16} w="bold" c={C.navy}>My vehicles</T>
      {vehicles.map(vehicle => <T s={13} key={vehicle.vehicle_id}>{vehicle.plate_number} · {vehicle.type_name} · {vehicle.area_name ?? 'Assigned area pending'}</T>)}
      {!vehicles.length && <T s={13}>No vehicles registered yet.</T>}
      <Btn label={creatingVehicle ? 'Hide vehicle form' : 'Register a vehicle'} bg={C.navy} py={10} onPress={() => setCreatingVehicle(value => !value)} />
      {creatingVehicle && <View style={{ gap: 12 }}>
        <Field label="Plate Number" autoCapitalize="characters" value={vehicleForm.plate_number} onChangeText={value => setVehicleForm(previous => ({ ...previous, plate_number: value }))} />
        <Select label="Vehicle Type" value={vehicleForm.vehicle_type_id} options={types.map(type => ({ value: String(type.vehicle_type_id), label: type.type_name }))} onChange={value => setVehicleForm(previous => ({ ...previous, vehicle_type_id: value }))} />
        {(['make', 'model', 'color'] as const).map(field => <Field key={field} label={field.charAt(0).toUpperCase() + field.slice(1)} value={vehicleForm[field]} onChangeText={value => setVehicleForm(previous => ({ ...previous, [field]: value }))} />)}
        <Btn label="Save guest vehicle" loading={busy} onPress={() => void addVehicle()} />
      </View>}
    </Card>
    {requests.length > 0 && <Card style={{ gap: 9 }}><T s={16} w="bold" c={C.navy}>My requests</T>
      {requests.slice(0, 8).map(request => <View key={request.request_id} style={{ paddingVertical: 8, borderBottomColor: C.slate100, borderBottomWidth: 1 }}>
        <T s={13} w="semibold">#{request.request_id} · {request.request_status} · {request.plate_number || 'Vehicle'}</T>
        <T s={12}>{request.purpose ?? ''}</T><T s={12}>{request.review_remarks ?? ''}</T>
        {request.request_status === 'pending' && <Pressable accessibilityRole="button" disabled={busy}
          onPress={() => cancelRequest(request.request_id)} style={{ paddingVertical: 10, alignSelf: 'flex-start' }}>
          <T s={13} c={C.red600} w="semibold">Cancel pending request</T>
        </Pressable>}
      </View>)}
    </Card>}
    {vehicles.length > 0 && <Card style={{ gap: 13 }}>
      <T s={16} w="bold" c={C.navy}>New visit request</T>
      <Select label="Registered vehicle" value={form.vehicle_id} options={vehicles.map(vehicle => ({ value: String(vehicle.vehicle_id), label: `${vehicle.plate_number} · ${vehicle.type_name}` }))} onChange={value => setForm(previous => ({ ...previous, vehicle_id: value }))} />
      {([['visit_date', 'Visit date (YYYY-MM-DD)'], ['arrival_time', 'Arrival time (HH:MM)'], ['departure_time', 'Departure time (HH:MM)'], ['visiting', 'Person / office to visit'], ['purpose', 'Purpose of visit']] as const).map(([key, label]) =>
        <Field key={key} label={label} placeholder={key === 'visit_date' ? dateInManila(1) : key.endsWith('time') ? '09:00' : ''} value={form[key]} onChangeText={value => setForm(previous => ({ ...previous, [key]: value }))} />)}
      <T s={14} w="semibold">Actual driver</T>
      <Select label="Are you driving?" value={form.driver_is_requester} options={[{ value: 'true', label: 'Yes, I am the driver' }, { value: 'false', label: 'No, someone else is driving' }]} onChange={value => setForm(previous => ({ ...previous, driver_is_requester: value }))} />
      {form.driver_is_requester === 'false' && <Field label="Driver’s full name" value={form.driver_name} onChangeText={value => setForm(previous => ({ ...previous, driver_name: value }))} />}
      <Field label="Driver’s license number" value={form.driver_license_number} onChangeText={value => setForm(previous => ({ ...previous, driver_license_number: value }))} />
      <Field label="License expiry (YYYY-MM-DD)" value={form.driver_license_expiry} onChangeText={value => setForm(previous => ({ ...previous, driver_license_expiry: value }))} />
      <Field label="Passengers excluding driver (0–99)" keyboardType="number-pad" value={form.passenger_count} onChangeText={value => setForm(previous => ({ ...previous, passenger_count: value }))} />
      <FileUpload label="Actual driver’s license photo (JPG/PNG)" file={licensePhoto} onChange={setLicensePhoto} onError={setError} />
      <FileUpload label="Vehicle photo showing plate (JPG/PNG)" file={vehiclePhoto} onChange={setVehiclePhoto} onError={setError} />
      <T s={12} c={C.slate500}>Request submission is not approval. Staff verify documents and availability before issuing a temporary QR pass.</T>
      <Btn label="Submit for staff review" loading={busy} onPress={() => void submitRequest()} />
    </Card>}
    <Btn label="Refresh request status" bg={C.blue50} color={C.royal} py={11} onPress={() => void load()} />
  </View></Frame>;
}

export function GuestPassPortal({ user }: { user: MobileUser }) {
  const { token } = useAuth();
  const [passes, setPasses] = useState<GuestPass[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError('');
    try { const result = await api<{ data: GuestPass[] }>('/guest/passes', { token }); setPasses(result.data ?? []); }
    catch (e) { setError(safeError(e)); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  return <Frame bottomPad={96}><View style={{ padding: 20, gap: 13 }}>
    <T s={23} w="head" c={C.navy}>My Visitor QR Passes</T>
    {!token && <Card><T s={15} w="bold">Visitor QR passes</T><T s={13}>Browsing as a guest does not issue a pass. Sign in with your verified guest account and wait for PASS staff approval.</T></Card>}
    {loading && <ActivityIndicator color={C.royal} />}
    {!!error && <Card bg={C.red50}><T s={13} c={C.red700}>{error}</T></Card>}
    {!!token && passes.length === 0 && <T s={13}>No visitor QR passes have been issued yet. Your request must be approved first.</T>}
    {passes.map(pass => {
      const usable = ['active', 'scheduled'].includes(pass.status);
      return <Card key={pass.qr_pass_id} style={{ alignItems: 'center', gap: 10 }}>
        <T s={16} w="bold" c={C.navy}>PASS · {pass.plate_number ?? 'Guest vehicle'}</T>
        <T s={13} c={usable ? C.green600 : C.red600}>Status: {pass.status === 'scheduled' ? 'Scheduled — not valid yet' : pass.status}</T>
        {usable && !!pass.pass_code && <View style={{ padding: 12, backgroundColor: C.white }}><QRCode value={pass.pass_code} size={210} /></View>}
        <T s={12}>Guest: {user.name}</T>
        <T s={12}>Valid: {pass.valid_from ?? '—'} to {pass.valid_until ?? '—'}</T>
        <T s={12}>Uses: {pass.use_count ?? 0} / {pass.max_uses ?? '—'}</T>
        {usable && <T s={11} c={C.slate500} style={{ textAlign: 'center' }}>Present this server-issued QR at the entrance/exit within your approved visit window.</T>}
        {!usable && <T s={12} c={C.red600}>{pass.revoke_reason || 'This pass cannot be used for entry.'}</T>}
      </Card>;
    })}
    {!!token && <Btn label="Refresh passes" bg={C.navy} onPress={() => void load()} />}
  </View></Frame>;
}
