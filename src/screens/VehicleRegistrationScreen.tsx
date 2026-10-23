import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';
import { CheckCircle, RefreshCw } from 'lucide-react-native';
import { api, ApiError } from '../api/client';
import { toUploadFile } from '../api/upload';
import { Select } from '../components/Select';
import { Btn, Card, Field, FileUpload, Frame, PickedFile, T } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useLicense } from '../context/LicenseContext';
import { C } from '../theme';
import { NavyHeader } from './shared';

type Vehicle = {
  id?: number | string; vehicle_id?: number; plate?: string; plate_number?: string;
  type?: string; vehicle_type?: string; make?: string; model?: string; color?: string;
  rfid?: string | null; status?: string; authorization_status?: string | null;
  registrationStatus?: string; selectedForUse?: boolean; switchLocked?: boolean; hasPhoto?: boolean;
  canResubmit?: boolean; year?: number | string; rejectionReason?: string | null;
};
const VEHICLE_TYPES = ['Sedan', 'SUV', 'Hatchback', 'Pickup', 'Motorcycle', 'Van'];
const EMPTY = { plate_number: '', vehicle_type: '', year_model: '', make: '', model: '', color: '' };

export default function VehicleRegistrationScreen() {
  const { token } = useAuth();
  const { status: licenseStatus } = useLicense();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [photo, setPhoto] = useState<PickedFile | null>(null);
  const [resubmittingId, setResubmittingId] = useState<string | null>(null);
  const [replacementId, setReplacementId] = useState<string | null>(null);
  const [replacementPhoto, setReplacementPhoto] = useState<PickedFile | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const result = await api<{ vehicles?: Vehicle[] }>('/vehicles', { token });
      if (!Array.isArray(result.vehicles)) throw new Error('The server returned an invalid vehicle list.');
      setVehicles(result.vehicles);
    } catch (e) {
      // Older deployments expose the authorization list but not the current owner's vehicle list.
      if (e instanceof ApiError && e.status === 404) {
        try {
          const fallback = await api<{ data: Vehicle[] }>('/vehicles/my-authorizations', { token });
          setVehicles(fallback.data ?? []);
          setNotice('This server uses the older vehicle API. Uploading, selecting, and registering vehicles requires the updated PASS backend.');
        } catch (fallbackError) { setError(fallbackError instanceof Error ? fallbackError.message : 'Unable to load vehicles.'); }
      } else setError(e instanceof Error ? e.message : 'Unable to load vehicles.');
    } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const register = async () => {
    if (!token || busy) return;
    if (!photo || !/^image\/(jpeg|png)$/.test(photo.type)) { setError('A JPG/PNG photo showing the vehicle plate is required.'); return; }
    if (!form.plate_number.trim() || !form.vehicle_type || !form.make.trim() || !form.model.trim() || !form.color.trim()) {
      setError('Complete the plate, type, make, model, and color.'); return;
    }
    if (form.year_model && (!/^\d{4}$/.test(form.year_model) || Number(form.year_model) > new Date().getFullYear() + 1)) {
      setError('Enter a valid model year.'); return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      const body = new FormData();
      for (const [key, value] of Object.entries(form)) if (value) body.append(key, key === 'plate_number' ? value.trim().toUpperCase() : value.trim());
      body.append('vehicle_photo', toUploadFile(photo) as any);
      const result = await api<{ message?: string }>(resubmittingId ? `/vehicles/${resubmittingId}/resubmit` : '/vehicles', { token, method: 'POST', form: body, timeoutMs: 65000 });
      setNotice(result.message || 'Vehicle registration submitted for staff review.');
      setShowForm(false); setResubmittingId(null); setForm(EMPTY); setPhoto(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not register vehicle.'); }
    finally { setBusy(false); }
  };

  const selectForUse = async (vehicle: Vehicle) => {
    if (!token || busy) return;
    const id = vehicle.id ?? vehicle.vehicle_id;
    if (!id) return;
    setBusy(true); setError('');
    try {
      const result = await api<{ message?: string }>(`/vehicles/${id}/select-for-use`, { token, method: 'POST' });
      setNotice(result.message || 'Your selected vehicle was updated.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not switch vehicles.'); await load(); }
    finally { setBusy(false); }
  };

  const replacePhoto = async () => {
    if (!token || !replacementId || !replacementPhoto || busy) return;
    if (!/^image\/(jpeg|png)$/.test(replacementPhoto.type)) {
      setError('Select a JPG or PNG photo.'); return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      const data = new FormData();
      data.append('vehicle_photo', toUploadFile(replacementPhoto) as any);
      const result = await api<{ message: string }>(`/vehicles/${replacementId}/photo`, { token, method: 'POST', form: data });
      setNotice(result.message || 'Photo updated and sent for authorization review.');
      setReplacementId(null); setReplacementPhoto(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not replace the photo.'); }
    finally { setBusy(false); }
  };

  return <Frame topInset={false} bottomPad={96}>
    <NavyHeader pb={28}><T s={22} w="head" c={C.white}>My Vehicles & RFID</T><T s={12} c={C.blue300}>Registration, authorizations and entry selection</T></NavyHeader>
    <View style={{ padding: 20, gap: 14 }}>
      {licenseStatus === 'not_submitted' && <Card bg={C.amber50}><T s={13}>Submit your driver's license before registering a vehicle. A pending license does not authorize parking access.</T></Card>}
      {!!error && <Card border={C.red200} bg={C.red50}><T s={13} c={C.red700}>{error}</T></Card>}
      {!!notice && <Card bg={C.blue50}><T s={13} c={C.navy}>{notice}</T></Card>}
      <Btn label="Refresh vehicles" icon={<RefreshCw color={C.white} size={16}/>} py={11} onPress={() => void load()} disabled={loading} />
      {loading && <ActivityIndicator color={C.royal} />}
      {!loading && vehicles.length === 0 && <T s={13} c={C.slate500}>No vehicles registered under your account yet.</T>}
      {vehicles.map((vehicle, index) => {
        const id = String(vehicle.id ?? vehicle.vehicle_id ?? '');
        const approved = (vehicle.status ?? vehicle.authorization_status) === 'approved';
        const eligible = !vehicle.selectedForUse && !vehicle.switchLocked && !!vehicle.rfid && approved && (!vehicle.registrationStatus || vehicle.registrationStatus === 'registered');
        return <Card key={String(vehicle.id ?? vehicle.vehicle_id ?? index)} style={{ gap: 7 }}>
          <T s={18} w="bold" c={C.navy}>{vehicle.plate ?? vehicle.plate_number ?? 'Vehicle'}</T>
          <T s={13}>{[vehicle.make, vehicle.model, vehicle.color].filter(Boolean).join(' · ') || 'Vehicle details unavailable'}</T>
          <T s={12}>Authorization: {vehicle.status ?? vehicle.authorization_status ?? 'Not requested'}</T>
          {!!vehicle.rejectionReason && <T s={12} c={C.red700}>Correction requested: {vehicle.rejectionReason}</T>}
          <T s={12}>RFID tag: {vehicle.rfid || 'Not assigned'}</T>
          {vehicle.selectedForUse && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><CheckCircle size={16} color={C.green600}/><T s={13} c={C.green600}>Selected for entry</T></View>}
          {vehicle.switchLocked && <T s={12} c={C.amber600}>Exit the parking area before switching vehicles.</T>}
          {!vehicle.selectedForUse && <Btn label="Use this vehicle" py={10} disabled={!eligible || busy} onPress={() => void selectForUse(vehicle)} />}
          {!vehicle.rfid && <T s={12} c={C.slate500}>PASS staff must assign an active RFID before vehicle selection.</T>}
          {vehicle.canResubmit && <Btn label="Correct and resubmit vehicle details" py={10} bg={C.blue50} color={C.royal} disabled={busy}
            onPress={() => { setResubmittingId(id);setForm({plate_number:vehicle.plate??vehicle.plate_number??'',vehicle_type:vehicle.type??vehicle.vehicle_type??'',year_model:String(vehicle.year??''),make:vehicle.make??'',model:vehicle.model??'',color:vehicle.color??''});setPhoto(null);setShowForm(true);setError(''); }} />}
          {['pending', 'rejected'].includes(vehicle.status ?? vehicle.authorization_status ?? '') && <>
            <Btn label={replacementId === id ? 'Hide photo replacement' : 'Replace vehicle photo'} py={10}
              bg={C.blue50} color={C.royal} disabled={busy}
              onPress={() => { setReplacementId(current => current === id ? null : id); setReplacementPhoto(null); setError(''); }} />
            {replacementId === id && <View style={{ gap: 9 }}>
              <T s={12}>Replacing a photo resets the authorization to pending staff review. This does not activate RFID.</T>
              <FileUpload label="New vehicle photo (JPG/PNG)" file={replacementPhoto} onChange={setReplacementPhoto} onError={setError} />
              <Btn label="Submit replacement for review" py={10} loading={busy} disabled={!replacementPhoto}
                onPress={() => void replacePhoto()} />
            </View>}
          </>}
        </Card>;
      })}
      <Btn label={showForm ? 'Hide registration form' : 'Register a vehicle'} py={12} disabled={licenseStatus === 'not_submitted'}
        onPress={() => { setShowForm(value => !value); setResubmittingId(null);setForm(EMPTY);setPhoto(null);setError(''); }} bg={C.navy} />
      {showForm && <Card style={{ gap: 13 }}>
        <T s={17} w="bold" c={C.navy}>{resubmittingId?'Correct vehicle registration':'New vehicle'}</T>
        <T s={12} c={C.slate500}>A clear photo showing the vehicle plate is required. Staff review—not automatic plate recognition—decides authorization. RFID assignment is separate.</T>
        <FileUpload label="Vehicle photo (JPG/PNG)" file={photo} onChange={setPhoto} onError={setError} />
        {!!photo && <Image source={{ uri: photo.uri }} resizeMode="contain" style={{ height: 170, backgroundColor: C.slate50, borderRadius: 10 }} />}
        <T s={12} c={C.slate500}>Enter the plate exactly as printed and check every field. This Laravel version no longer exposes the old photo-reading endpoint.</T>
        <Field label="Plate Number" autoCapitalize="characters" value={form.plate_number} onChangeText={value => setForm(previous => ({ ...previous, plate_number: value.toUpperCase() }))} placeholder="ABC-1234" />
        <Select label="Vehicle Type" value={form.vehicle_type} placeholder="Select type" options={VEHICLE_TYPES.map(type => ({ label: type, value: type }))} onChange={value => setForm(previous => ({ ...previous, vehicle_type: value }))} />
        <Field label="Model Year (optional)" value={form.year_model} onChangeText={value => setForm(previous => ({ ...previous, year_model: value }))} keyboardType="number-pad" placeholder="2024" />
        <Field label="Make" value={form.make} onChangeText={value => setForm(previous => ({ ...previous, make: value }))} placeholder="Toyota" />
        <Field label="Model" value={form.model} onChangeText={value => setForm(previous => ({ ...previous, model: value }))} placeholder="Vios" />
        <Field label="Color" value={form.color} onChangeText={value => setForm(previous => ({ ...previous, color: value }))} placeholder="White" />
        <Btn label={resubmittingId?'Submit corrections for staff review':'Submit vehicle registration'} disabled={busy} loading={busy} onPress={() => void register()} />
      </Card>}
    </View>
  </Frame>;
}
