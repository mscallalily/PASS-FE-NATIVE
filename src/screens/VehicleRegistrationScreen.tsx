import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { CheckCircle, RefreshCw } from 'lucide-react-native';
import { api, ApiError } from '../api/client';
import { toUploadFile } from '../api/upload';
import { Select } from '../components/Select';
import { Btn, Card, Field, FileUpload, Frame, type PickedFile, T } from '../components/ui';
import VehicleDocumentReview from '../components/VehicleDocumentReview';
import { useAuth } from '../context/AuthContext';
import { useLicense } from '../context/LicenseContext';
import { combineReadings, DOCUMENT_DETAILS, DETAIL_LABEL, EMPTY_DETAILS, reviewStatus, sourceOf, type Reading, type VehicleDetails } from '../services/orcrReview';
import { photoProblem, vehicleBody } from '../services/vehicleRegistration';
import { campusToday } from '../services/rfid';
import { C } from '../theme';
import { NavyHeader } from './shared';
import { AdminPager } from '../components/AdminWorkspace';
import { listMeta, listPath, type ListMeta } from '../services/listPage';
type Vehicle = {
    id?: number | string;
    vehicle_id?: number;
    plate?: string;
    plate_number?: string;
    make?: string;
    model?: string;
    color?: string;
    rfid?: string | null;
    rfidStatus?: string | null;
    status?: string;
    authorization_status?: string | null;
    registrationStatus?: string;
    selectedForUse?: boolean;
    switchLocked?: boolean;
    canResubmit?: boolean;
    rejectionReason?: string | null;
    documentCheck?: {
        status: string;
        reasons?: string[];
    } | null;
};
const TYPES = ['Sedan', 'SUV', 'Hatchback', 'Pickup', 'Motorcycle', 'Van'];
export default function VehicleRegistrationScreen() {
    const { token } = useAuth(), { status: licenseStatus, submission } = useLicense();
    const licenseEligible = licenseStatus === 'verified' && !!submission?.expiry_date && submission.expiry_date.slice(0, 10) >= campusToday();
    const [vehicles, setVehicles] = useState<Vehicle[]>([]), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [showForm, setShowForm] = useState(false);
    const [page, setPage] = useState(1), [meta, setMeta] = useState<ListMeta | null>(null), [search, setSearch] = useState(''), [appliedSearch, setAppliedSearch] = useState(''), [selectedPlate, setSelectedPlate] = useState('');
    const [photo, setPhoto] = useState<PickedFile | null>(null), [orFile, setOrFile] = useState<PickedFile | null>(null), [crFile, setCrFile] = useState<PickedFile | null>(null), [or, setOr] = useState<Reading | null>(null), [cr, setCr] = useState<Reading | null>(null);
    const [edits, setEdits] = useState<Partial<VehicleDetails>>({}), [checked, setChecked] = useState<Partial<VehicleDetails>>({}), [resubmittingId, setResubmittingId] = useState<string | null>(null), [replacementId, setReplacementId] = useState<string | null>(null), [replacementPhoto, setReplacementPhoto] = useState<PickedFile | null>(null);
    const lock = useRef(false), loadRequest = useRef<AbortController | null>(null), alive = useRef(true);
    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
            loadRequest.current?.abort();
        };
    }, []);
    const combined = useMemo(() => combineReadings(or, cr), [or, cr]);
    const form = Object.fromEntries(DOCUMENT_DETAILS.map(key => [key, edits[key] ?? combined[key].value ?? EMPTY_DETAILS[key]])) as VehicleDetails;
    const reviewInput = {
        or, cr, hasOr: !!orFile, hasCr: !!crFile, combined, details: form, edits, checked
    }, review = reviewStatus(reviewInput);
    const load = useCallback(async () => {
        if (!token)
            return;
        loadRequest.current?.abort();
        const request = new AbortController();
        loadRequest.current = request;
        setLoading(true);
        try {
            const result = await api<{
                vehicles: Vehicle[];
                meta?: ListMeta; selected_vehicle?: { plate_number: string } | null;
            }>(listPath('/vehicles', page, { search: appliedSearch }), {
                token, signal: request.signal
            });
            if (!Array.isArray(result.vehicles))
                throw new Error('PASS returned an invalid vehicle list. Refresh and try again.');
            if (!request.signal.aborted && alive.current) {
                const info = listMeta(result.meta, result.vehicles.length); setMeta(info);
                setVehicles(result.vehicles);
                setSelectedPlate(result.selected_vehicle?.plate_number ?? result.vehicles.find(v => v.selectedForUse)?.plate ?? '');
                if (page > info.last_page) setPage(info.last_page);
            }
        }
        catch (e) {
            if (!request.signal.aborted && alive.current)
                setError(e instanceof ApiError && e.status === 404 ? 'This server needs the current PASS vehicle registration API.' : e instanceof Error ? e.message : 'Unable to load vehicles.');
        }
        finally {
            if (!request.signal.aborted && alive.current)
                setLoading(false);
        }
    }, [token, page, appliedSearch]);
    useEffect(() => {
        void load();
        return () => loadRequest.current?.abort();
    }, [load]);
    const processing = vehicles.some(v => v.documentCheck?.status === 'processing');
    useEffect(() => {
        if (!processing)
            return;
        const timer = setInterval(() => {
            if (!lock.current)
                void load();
        }, 5000);
        return () => clearInterval(timer);
    }, [processing, load]);
    const reset = () => {
        setOrFile(null);
        setCrFile(null);
        setOr(null);
        setCr(null);
        setPhoto(null);
        setEdits({});
        setChecked({});
        setError('');
    };
    const choose = (kind: 'OR' | 'CR', file: PickedFile | null) => {
        if (lock.current)
            return;
        const problem = file && photoProblem(file, kind);
        if (problem) {
            setError(problem);
            return;
        }
        setEdits({});
        setChecked({});
        setError('');
        if (kind === 'OR') {
            setOrFile(file);
            setOr(null);
        }
        else {
            setCrFile(file);
            setCr(null);
        }
    };
    async function write(work: () => Promise<void>) {
        if (lock.current || !token)
            return;
        lock.current = true;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await work();
        }
        catch (e) {
            if (alive.current)
                setError(e instanceof Error ? e.message : 'The change could not be completed.');
        }
        finally {
            lock.current = false;
            if (alive.current)
                setBusy(false);
        }
    }
    const register = () => write(async () => {
        if (!licenseEligible)
            throw new Error('Check your verified, unexpired driver’s license before submitting.');
        if (review.tone !== 'success')
            throw new Error(review.message);
        const result = await api<{
            vehicle_id: number;
            message: string;
        }>(resubmittingId ? `/vehicles/${resubmittingId}/resubmit` : '/vehicles', {
            token, method: 'POST', form: vehicleBody(form, orFile, crFile, photo), timeoutMs: 120000
        });
        if (!result.vehicle_id || typeof result.message !== 'string')
            throw new Error('PASS returned an incomplete registration response. Refresh your vehicles before submitting again.');
        if (alive.current) {
            setNotice(result.message);
            setShowForm(false);
            setResubmittingId(null);
            reset();
            await load();
        }
    });
    const select = (vehicle: Vehicle) => write(async () => {
        const result = await api<{
            message: string;
        }>(`/vehicles/${vehicle.id ?? vehicle.vehicle_id}/select-for-use`, {
            token, method: 'POST'
        });
        if (alive.current) {
            setNotice(result.message);
            await load();
        }
    });
    const replacePhoto = () => write(async () => {
        const problem = photoProblem(replacementPhoto, 'vehicle photo');
        if (problem)
            throw new Error(problem);
        const body = new FormData();
        body.append('vehicle_photo', toUploadFile(replacementPhoto!) as unknown as Blob, replacementPhoto!.name);
        const result = await api<{
            message: string;
        }>(`/vehicles/${replacementId}/photo`, {
            token, method: 'POST', form: body
        });
        if (alive.current) {
            setNotice(result.message);
            setReplacementId(null);
            setReplacementPhoto(null);
            await load();
        }
    });
    return <Frame topInset={false} bottomPad={96}><NavyHeader pb={28}><T s={22} w="head" c={C.white}>My Vehicles &amp; RFID</T><T s={12} c={C.blue300}>OR/CR registration, status and entry selection</T></NavyHeader>
  <View style={{
        padding: 20, gap: 14
    }}>
    {!licenseEligible && <Card bg={C.amber50}><T s={13}>A verified, unexpired driver’s license is required before registering a vehicle. Check your license status first.</T></Card>}
    {!!error && <Card border={C.red200} bg={C.red50}><T s={13} c={C.red700} accessibilityRole="alert">{error}</T></Card>}{!!notice && <Card bg={C.blue50}><T s={13} c={C.navy} accessibilityLiveRegion="polite">{notice}</T></Card>}
    <Btn label="Refresh vehicles" icon={<RefreshCw color={C.white} size={16}/>} py={11} disabled={loading || busy} onPress={() => {
        setError('');
        void load();
    }}/>{loading && <ActivityIndicator color={C.royal}/>}
    <Field label="Find my vehicle" value={search} onChangeText={setSearch} maxLength={100} placeholder="Vehicle plate"/>
    <Btn label="Search my vehicles" disabled={busy || loading} onPress={() => { setError(''); setPage(1); setAppliedSearch(search.trim()); }}/>
    {!!selectedPlate && <T s={13} c={C.navy}>Selected for use: {selectedPlate}</T>}
    {!loading && !error && !vehicles.length && <T s={13} c={C.slate500}>No vehicles registered under your account yet.</T>}
    {vehicles.map((vehicle, index) => {
            const id = String(vehicle.id ?? vehicle.vehicle_id ?? ''), approved = (vehicle.status ?? vehicle.authorization_status) === 'approved';
            const eligible = !vehicle.selectedForUse && !vehicle.switchLocked && !!vehicle.rfid && vehicle.rfidStatus !== 'assigned' && approved && (!vehicle.registrationStatus || vehicle.registrationStatus === 'registered');
            return <Card key={id || index} style={{
                gap: 8
            }}><T s={18} w="bold" c={C.navy}>{vehicle.plate ?? vehicle.plate_number ?? 'Vehicle'}</T><T s={13}>{[vehicle.make, vehicle.model, vehicle.color].filter(Boolean).join(' · ')}</T>
        <T s={12}>Authorization: {vehicle.status ?? vehicle.authorization_status ?? 'Not requested'}</T>{!!vehicle.documentCheck && <T s={12}>Document check: {vehicle.documentCheck.status.replace(/_/g, ' ')}</T>}{vehicle.documentCheck?.reasons?.map((reason, i) => <T key={i} s={12} c={C.red700}>{reason}</T>)}{!!vehicle.rejectionReason && <T s={12} c={C.red700}>{vehicle.rejectionReason}</T>}
        <T s={12}>RFID tag: {vehicle.rfid || 'Not assigned'}</T>{vehicle.rfidStatus === 'assigned' && <T s={12} c={C.amber800}>Collect your assigned sticker from PASS staff. It must be issued before entry.</T>}{vehicle.rfidStatus === 'pending_assignment' && <T s={12} c={C.amber800}>Approved; waiting for an available RFID sticker.</T>}
        {vehicle.selectedForUse && <View style={{
                flexDirection: 'row', gap: 6
            }}><CheckCircle size={16} color={C.green600}/><T s={13} c={C.green600}>Selected vehicle</T></View>}{vehicle.switchLocked && <T s={12} c={C.amber800}>Record your parking exit before switching vehicles.</T>}
        {!vehicle.selectedForUse && <Btn label="Use this vehicle" py={10} disabled={!eligible || busy} onPress={() => {
                void select(vehicle);
            }}/>}
        {vehicle.canResubmit && <Btn label="Correct and resubmit OR/CR" py={10} bg={C.blue50} color={C.royal} disabled={busy || !licenseEligible} onPress={() => {
                reset();
                setResubmittingId(id);
                setShowForm(true);
            }}/>}
        {['pending', 'rejected'].includes(vehicle.status ?? vehicle.authorization_status ?? '') && <><Btn label={replacementId === id ? 'Hide photo replacement' : 'Replace optional vehicle photo'} py={10} bg={C.blue50} color={C.royal} disabled={busy} onPress={() => {
                    setReplacementId(replacementId === id ? null : id);
                    setReplacementPhoto(null);
                }}/>
          {replacementId === id && <View style={{
                    gap: 9
                }}><T s={12}>The vehicle photo is for reference. Updating it does not approve a vehicle or issue RFID.</T><FileUpload label="New vehicle photo" file={replacementPhoto} onChange={setReplacementPhoto} onError={setError} imagesOnly disabled={busy}/><Btn label="Update vehicle photo" loading={busy} disabled={!replacementPhoto} onPress={() => {
                    void replacePhoto();
                }}/></View>}</>}
      </Card>;
        })}
    {meta && <AdminPager page={meta.current_page} last={meta.last_page} total={meta.total} disabled={loading || busy} onChange={setPage}/>}
    <Btn label={showForm ? 'Close registration form' : 'Register a vehicle'} py={12} disabled={busy || !showForm && !licenseEligible} bg={C.navy} onPress={() => {
        reset();
        setResubmittingId(null);
        setShowForm(v => !v);
    }}/>
    {showForm && <Card style={{
            gap: 14
        }}><T s={17} w="bold" c={C.navy}>{resubmittingId ? 'Correct vehicle registration' : 'Register with your OR and CR'}</T><T s={12} c={C.slate600}>Photograph both documents. PASS fills the vehicle details; compare them with the originals. The server checks both photos again before automatic approval.</T>
      <VehicleDocumentReview kind="OR" file={orFile} disabled={busy} onChange={file => choose('OR', file)} onReading={setOr} onError={setError}/><VehicleDocumentReview kind="CR" file={crFile} disabled={busy} onChange={file => choose('CR', file)} onReading={setCr} onError={setError}/>
      <Card bg={review.tone === 'success' ? C.green50 : C.blue50}><T s={14} w="semibold">{review.title}</T><T s={12}>{review.message}</T>{review.basis.map((basis, i) => <T key={i} s={11} c={C.slate600}>{basis}</T>)}</Card>
      <View pointerEvents={busy ? 'none' : 'auto'} style={{
            gap: 11
        }}>{DOCUMENT_DETAILS.map(key => <View key={key} style={{
                gap: 5
            }}>
        {key === 'vehicle_type' ? <Select label={DETAIL_LABEL[key]} value={form[key]} options={TYPES.map(type => ({
                label: type, value: type
            }))} onChange={value => setEdits(v => ({
                ...v, [key]: value
            }))}/> : <Field label={DETAIL_LABEL[key]} accessibilityLabel={DETAIL_LABEL[key]} value={form[key]} editable={!busy} maxLength={key === 'plate_number' ? 20 : key === 'year_model' ? 4 : key === 'color' ? 50 : 100} keyboardType={key === 'year_model' ? 'number-pad' : 'default'} autoCapitalize="characters" onChangeText={value => setEdits(v => ({
                ...v, [key]: value.toUpperCase()
            }))}/>}
        {!!sourceOf(key, reviewInput) && <T s={11} c={C.slate500}>{sourceOf(key, reviewInput)}</T>}{review.toCheck.includes(key) && <Pressable accessibilityRole="checkbox" accessibilityLabel={`Confirm ${DETAIL_LABEL[key]}`} accessibilityState={{
                checked: checked[key] === form[key]
            }} disabled={busy} onPress={() => setChecked(v => ({
                ...v, [key]: form[key]
            }))} style={{
                paddingVertical: 9
            }}><T s={12} c={C.royal}>□ I checked this value against the document.</T></Pressable>}
      </View>)}</View>
      <FileUpload label="Vehicle photo (optional)" file={photo} onChange={setPhoto} onError={setError} imagesOnly disabled={busy}/><Btn label={resubmittingId ? 'Submit corrected OR/CR' : 'Register vehicle'} disabled={busy || !licenseEligible || review.tone !== 'success'} loading={busy} onPress={() => {
            void register();
        }}/>
    </Card>}
  </View></Frame>;
}
