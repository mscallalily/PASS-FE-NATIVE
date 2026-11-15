import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { canManageParking, isAdmin } from '../permissions';
import { Btn, Card, Field, FileUpload, Frame, type PickedFile, T } from '../components/ui';
import { Select } from '../components/Select';
import PrivateDocumentPreview from '../components/PrivateDocumentPreview';
import { EMPTY_VISITOR, visitorBody, type VisitorDraft } from '../services/visitorRequests';
import { manilaDateTime } from '../services/rfid';
import { C } from '../theme';
import { NavyHeader } from './shared';
type Visitor = {
    visitor_id: number;
    first_name: string;
    last_name: string;
    contact_number: string;
    is_blacklisted: boolean;
    plates: string[];
};
type Options = {
    visitors: Visitor[];
    vehicle_types: {
        vehicle_type_id: number;
        type_name: string;
        area_name: string;
    }[];
    max_visit_days: number;
};
type Row = {
    request_id: number;
    request_status: string;
    purpose: string;
    valid_from: string;
    valid_until: string;
    window_ended: boolean;
    visitor: {
        name: string;
        contact_number: string;
        is_blacklisted: boolean;
    };
    vehicle: {
        plate_number: string;
        vehicle_type: string;
        area_name: string;
    };
    driver?: {
        name: string;
        license_reference: string;
        license_expiry: string;
        passenger_count: number;
    } | null;
    documents: {
        license_available: boolean;
        vehicle_available: boolean;
    };
    review_remarks?: string | null;
};
export default function VisitorManagementScreen({ back }: {
    back: () => void;
}) {
    const { token, user } = useAuth(), allowed = canManageParking(user?.role ?? null), administrator = isAdmin(user?.role ?? null);
    const [rows, setRows] = useState<Row[]>([]), [options, setOptions] = useState<Options | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const [showForm, setShowForm] = useState(false), [draft, setDraft] = useState<VisitorDraft>({
        ...EMPTY_VISITOR
    }), [license, setLicense] = useState<PickedFile | null>(null), [photo, setPhoto] = useState<PickedFile | null>(null), [selected, setSelected] = useState<number | null>(null), [remarks, setRemarks] = useState(''), [reviewed, setReviewed] = useState(false), [loaded, setLoaded] = useState({
        license: false, vehicle: false
    }), [search, setSearch] = useState('');
    const lock = useRef(false), requestRef = useRef<AbortController | null>(null), alive = useRef(true);
    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
            requestRef.current?.abort();
        };
    }, []);
    const load = useCallback(async () => {
        if (!token || !allowed)
            return;
        requestRef.current?.abort();
        const request = new AbortController();
        requestRef.current = request;
        setLoading(true);
        try {
            const [list, reference] = await Promise.all([api<{
                    data: Row[];
                }>('/visitors/requests', {
                    token, signal: request.signal
                }), api<Options>('/visitors/options', {
                    token, signal: request.signal
                })]);
            if (!Array.isArray(list.data) || !Array.isArray(reference.visitors) || !Array.isArray(reference.vehicle_types))
                throw new Error('PASS returned an incomplete visitor list. Refresh to try again.');
            if (alive.current && !request.signal.aborted) {
                setRows(list.data);
                setOptions(reference);
            }
        }
        catch (e) {
            if (alive.current && !request.signal.aborted)
                setError(e instanceof Error ? e.message : 'Could not load visitor requests.');
        }
        finally {
            if (alive.current && !request.signal.aborted)
                setLoading(false);
        }
    }, [token, allowed]);
    useEffect(() => {
        void load();
        return () => requestRef.current?.abort();
    }, [load]);
    const edit = (key: keyof VisitorDraft, value: string) => setDraft(previous => ({
        ...previous, [key]: value
    }));
    const write = async (work: () => Promise<void>) => {
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
                setError(e instanceof Error ? e.message : 'The operation could not be completed.');
        }
        finally {
            lock.current = false;
            if (alive.current)
                setBusy(false);
        }
    };
    const create = () => write(async () => {
        if (!options)
            throw new Error('Wait for the visitor options to load.');
        if (options.visitors.find(v => String(v.visitor_id) === draft.visitor_id)?.is_blacklisted)
            throw new Error('This visitor is blacklisted and cannot request access.');
        const result = await api<{
            request_id: number;
            message: string;
        }>('/visitors/requests', {
            token, method: 'POST', form: visitorBody(draft, license, photo, options.max_visit_days)
        });
        if (!result.request_id || typeof result.message !== 'string')
            throw new Error('PASS returned an incomplete response. Refresh and check whether the request was saved before submitting again.');
        if (alive.current) {
            setNotice(result.message);
            setDraft({
                ...EMPTY_VISITOR
            });
            setLicense(null);
            setPhoto(null);
            setShowForm(false);
            await load();
        }
    });
    const choose = (id: number) => {
        setSelected(selected === id ? null : id);
        setRemarks('');
        setReviewed(false);
        setLoaded({
            license: false, vehicle: false
        });
        setError('');
    };
    const inspect = useCallback((kind: 'license' | 'vehicle', ready: boolean) => {
        setLoaded(previous => previous[kind] === ready ? previous : {
            ...previous, [kind]: ready
        });
        if (!ready)
            setReviewed(false);
    }, []);
    const decide = (row: Row, decision: 'approve' | 'reject') => {
        if (!administrator || busy)
            return;
        if (decision === 'approve' && (!reviewed || !loaded.license || !loaded.vehicle || row.window_ended || row.visitor.is_blacklisted)) {
            setError('Inspect both original photos and confirm they match before approval.');
            return;
        }
        if (decision === 'reject' && !remarks.trim()) {
            setError('Enter the reason for rejecting this visitor request.');
            return;
        }
        const reason = remarks.trim();
        Alert.alert(decision === 'approve' ? 'Approve visitor request?' : 'Reject visitor request?', decision === 'approve' ? 'This issues one visitor QR pass. Gate staff must match the arriving driver and vehicle.' : 'The visitor will receive the recorded rejection reason.', [{
                text: 'Cancel', style: 'cancel'
            }, {
                text: 'Confirm', onPress: () => {
                    void write(async () => {
                        const result = await api<{
                            message: string;
                        }>(`/visitors/requests/${row.request_id}/${decision}`, {
                            token, method: 'POST', json: {
                                remarks: reason || null, documents_reviewed: decision === 'approve'
                            }
                        });
                        if (alive.current) {
                            setNotice(result.message);
                            setSelected(null);
                            setReviewed(false);
                            setLoaded({
                                license: false, vehicle: false
                            });
                            await load();
                        }
                    });
                }
            }]);
    };
    if (!token || !allowed)
        return <Frame><Card><T s={14} c={C.red700}>Your account cannot manage visitor requests.</T></Card></Frame>;
    const active = rows.filter(row => !search.trim() || JSON.stringify([row.visitor.name, row.vehicle.plate_number, row.request_status, row.purpose]).toLowerCase().includes(search.trim().toLowerCase()));
    const field = (key: keyof VisitorDraft, label: string, extra: React.ComponentProps<typeof Field> = {}) => <Field key={key} label={label} accessibilityLabel={label} value={draft[key]} editable={!busy} onChangeText={value => edit(key, value)} {...extra}/>;
    return <Frame topInset={false} bottomPad={60}><NavyHeader pb={26}><Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back to workspace" style={{
        flexDirection: 'row', gap: 8, paddingVertical: 10
    }}><ArrowLeft size={16} color={C.blue200}/><T s={13} c={C.blue200}>Back to workspace</T></Pressable><T s={22} w="head" c={C.white}>Visitor Requests</T><T s={12} c={C.blue200}>Visitor evidence, administrator decisions and QR passes</T></NavyHeader>
  <View style={{
        padding: 16, gap: 14
    }}>{!!error && <Card bg={C.red50}><T s={13} c={C.red700} accessibilityRole="alert">{error}</T></Card>}{!!notice && <Card bg={C.green50}><T s={13} c={C.green700}>{notice}</T></Card>}
    <Btn label="Refresh visitor requests" disabled={busy || loading} onPress={() => {
        setError('');
        void load();
    }} py={10}/>{loading && <ActivityIndicator color={C.royal}/>}
    {!administrator && <T s={12} c={C.slate600}>Staff may file and inspect requests. Only an administrator approves or rejects a visit.</T>}
    <Btn label={showForm ? 'Close visitor form' : 'Register a visitor'} bg={C.navy} disabled={busy || !options} onPress={() => {
        setShowForm(v => !v);
        setError('');
    }}/>
    {showForm && options && <Card style={{
            gap: 12
        }}><T s={16} w="bold">File a visitor request</T>
      <View pointerEvents={busy ? 'none' : 'auto'}><Select label="Visitor record" value={draft.visitor_id} options={[{
                value: '', label: 'New visitor'
            }, ...options.visitors.map(v => ({
                value: String(v.visitor_id), label: `${v.first_name} ${v.last_name}${v.is_blacklisted ? ' (blacklisted)' : ''}`
            }))]} onChange={value => {
            const v = options.visitors.find(v => String(v.visitor_id) === value);
            setDraft(previous => ({
                ...previous, visitor_id: value, first_name: v?.first_name ?? '', last_name: v?.last_name ?? '', contact_number: v?.contact_number ?? '', plate_number: '', driver_name: v ? `${v.first_name} ${v.last_name}` : ''
            }));
        }}/></View>
      {!draft.visitor_id && <>{field('first_name', 'Visitor first name', {
            maxLength: 100
        })}{field('last_name', 'Visitor surname', {
            maxLength: 100
        })}{field('contact_number', 'Visitor contact number', {
            keyboardType: 'phone-pad', maxLength: 30
        })}</>}
      {field('plate_number', 'Vehicle plate number', {
            autoCapitalize: 'characters', maxLength: 20
        })}
      <View pointerEvents={busy ? 'none' : 'auto'}><Select label="Vehicle type" value={draft.vehicle_type_id} options={options.vehicle_types.map(t => ({
            value: String(t.vehicle_type_id), label: `${t.type_name} → ${t.area_name}`
        }))} onChange={value => edit('vehicle_type_id', value)}/></View>
      {field('purpose', 'Purpose of visit', {
            maxLength: 150
        })}{field('visiting', 'Person or office visited', {
            maxLength: 90
        })}
      {field('valid_from', 'Arrival (Philippine time)', {
            placeholder: 'YYYY-MM-DDTHH:MM', autoCapitalize: 'none', maxLength: 16
        })}{field('valid_until', 'Departure (Philippine time)', {
            placeholder: 'YYYY-MM-DDTHH:MM', autoCapitalize: 'none', maxLength: 16
        })}
      <T s={12} c={C.slate600}>Choose tomorrow or later. The visit can cover up to {options.max_visit_days} days.</T>
      {field('driver_name', 'Actual driver’s full name', {
            maxLength: 200
        })}{field('driver_license_number', 'Driver’s license number', {
            autoCapitalize: 'characters', maxLength: 30
        })}{field('driver_license_expiry', 'License expiry', {
            placeholder: 'YYYY-MM-DD', maxLength: 10
        })}{field('passenger_count', 'Passengers excluding driver', {
            keyboardType: 'number-pad', maxLength: 2
        })}
      <FileUpload label="Actual driver’s license photo" file={license} onChange={setLicense} onError={setError} imagesOnly disabled={busy}/><FileUpload label="Vehicle and visible plate photo" file={photo} onChange={setPhoto} onError={setError} imagesOnly disabled={busy}/>
      <T s={12} c={C.slate600}>Both original photos are required. Submitting this request does not approve access or issue a pass.</T><Btn label="Create pending visitor request" loading={busy} onPress={() => {
            void create();
        }}/>
    </Card>}
    <Field label="Find visitor requests" accessibilityLabel="Find visitor requests" value={search} onChangeText={setSearch} placeholder="Name, plate or status"/>
    {!loading && !error && !active.length && <Card><T s={13}>No matching visitor requests.</T></Card>}
    {active.map(row => <Card key={row.request_id} style={{
            gap: 9
        }}><T s={17} w="bold" c={C.navy}>{row.vehicle.plate_number} · {row.visitor.name}</T><T s={12}>Request #{row.request_id} · {row.request_status}</T><T s={12}>{row.purpose}</T><T s={12}>{manilaDateTime(row.valid_from)} → {manilaDateTime(row.valid_until)}</T>{!!row.review_remarks && <T s={12}>{row.review_remarks}</T>}
      <Btn label={selected === row.request_id ? 'Close request details' : `Inspect request #${row.request_id}`} py={10} bg={C.blue50} color={C.royal} disabled={busy} onPress={() => choose(row.request_id)}/>
      {selected === row.request_id && <View style={{
                gap: 11
            }}><T s={13}>Actual driver: {row.driver?.name ?? 'Not supplied'}</T><T s={12}>License: {row.driver?.license_reference ?? 'Not supplied'} · expires {row.driver?.license_expiry ?? '—'}</T><T s={12}>Passengers: {row.driver?.passenger_count ?? '—'}</T>
        {row.documents.license_available ? <PrivateDocumentPreview path={`/visitors/requests/${row.request_id}/documents/license`} label="actual driver’s license" onInspected={ready => inspect('license', ready)}/> : <T s={12} c={C.red700}>The driver’s license photo is missing. This request cannot be approved.</T>}
        {row.documents.vehicle_available ? <PrivateDocumentPreview path={`/visitors/requests/${row.request_id}/documents/vehicle`} label="vehicle and visible plate" onInspected={ready => inspect('vehicle', ready)}/> : <T s={12} c={C.red700}>The vehicle photo is missing. This request cannot be approved.</T>}
        {administrator && row.request_status === 'pending' && <>{(row.window_ended || row.visitor.is_blacklisted) && <T s={12} c={C.red700}>This request cannot be approved: its visit has ended or the visitor is blacklisted.</T>}
          <Pressable accessibilityRole="checkbox" accessibilityLabel="I reviewed both visitor photos" accessibilityState={{
                    checked: reviewed, disabled: busy || !loaded.license || !loaded.vehicle
                }} disabled={busy || !loaded.license || !loaded.vehicle} onPress={() => setReviewed(v => !v)} style={{
                    paddingVertical: 12, opacity: loaded.license && loaded.vehicle ? 1 : 0.5
                }}><T s={12} c={C.navy}>{reviewed ? '☑' : '☐'} I reviewed both original photos and matched the driver, license details and visible plate. Gate staff must still verify the arriving driver.</T></Pressable>
          <Field label="Review remarks / rejection reason" accessibilityLabel="Review remarks / rejection reason" value={remarks} maxLength={255} editable={!busy} onChangeText={setRemarks}/><Btn label="Approve visitor" disabled={busy || !reviewed || !loaded.license || !loaded.vehicle || row.window_ended || row.visitor.is_blacklisted} onPress={() => decide(row, 'approve')}/><Btn label="Reject visitor" bg={C.red600} disabled={busy || !remarks.trim()} onPress={() => decide(row, 'reject')}/>
        </>}
      </View>}
    </Card>)}
  </View></Frame>;
}
