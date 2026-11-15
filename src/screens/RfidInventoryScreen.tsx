import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Btn, Card, Field, Frame, T } from '../components/ui';
import { AdminCheckbox, AdminDenied, AdminDialog, AdminInfo, AdminLoading, AdminNotice, AdminPager, AdminTabs } from '../components/AdminWorkspace';
import { C } from '../theme';
import { NavyHeader } from './shared';
import { useAdminAction, useAdminRead } from '../services/useAdminWorkspace';
import { assignmentExpectation, expectInventory, INVENTORY_LABELS, inventoryUidProblem, normalizeInventoryUid, type InventoryItem, type InventoryResponse } from '../services/rfidInventory';
import { formatCampusDateTime } from '../services/datetime';
import { useAuth } from '../context/AuthContext';
import { listMeta, listPath } from '../services/listPage';
import RfidAssignmentHistory from '../components/RfidAssignmentHistory';
type Dialog = {
    scope: string;
    kind: 'register';
    uid: string;
    source: 'reader' | 'manual';
} | {
    scope: string;
    kind: 'issue' | 'lost' | 'damaged' | 'history';
    item: InventoryItem;
};
export default function RfidInventoryScreen({ back }: {
    back: () => void;
}) {
    const { user, token } = useAuth();
    return <RfidInventoryWorkspace key={`${user?.id ?? ''}|${user?.role ?? ''}|${token ?? ''}`} back={back}/>;
}
function RfidInventoryWorkspace({ back }: {
    back: () => void;
}) {
    const [source, setSource] = useState<'reader' | 'manual'>('manual'), [uid, setUid] = useState(''), [inputError, setInputError] = useState('');
    const [dialog, setDialog] = useState<Dialog | null>(null), [physical, setPhysical] = useState(false), [replace, setReplace] = useState(false);
    const [search, setSearch] = useState(''), [appliedSearch, setAppliedSearch] = useState(''), [status, setStatus] = useState(''), [page, setPage] = useState(1), [pendingPage, setPendingPage] = useState(1);
    useEffect(() => { const timer = setTimeout(() => setAppliedSearch(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
    const read = useAdminRead<InventoryResponse>(listPath('/rfid/inventory', page, { search: appliedSearch, status, ...(pendingPage > 1 ? { pending_page: pendingPage } : {}) }), expectInventory), action = useAdminAction(read.scope, read.token, read.allowed);
    const seen = useRef<{
        scope: string;
        uid: string;
        at: number;
    } | null>(null);
    const active = dialog?.scope === read.scope ? dialog : null;
    const items = read.data?.data ?? [], shown = items;
    const meta = read.data ? listMeta(read.data.meta, items.length) : null, pendingMeta = read.data ? listMeta(read.data.pending_meta, read.data.pending.length) : null;
    useEffect(() => { if (meta && page > meta.last_page) setPage(meta.last_page); if (pendingMeta && pendingPage > pendingMeta.last_page) setPendingPage(pendingMeta.last_page); }, [meta?.last_page, pendingMeta?.last_page, page, pendingPage]);
    const disabled = action.busy || read.loading || !!read.error;
    const close = () => { setDialog(null); setPhysical(false); setReplace(false); action.clear(); };
    const review = (raw = uid, from = source) => {
        if (disabled || active)
            return;
        const value = normalizeInventoryUid(raw), problem = inventoryUidProblem(raw, from);
        if (problem) {
            setInputError(problem);
            return;
        }
        if (items.some(item => item.tag_uid === value)) {
            setInputError('This UID is already in the inventory. It was not changed.');
            return;
        }
        if (from === 'reader') {
            const now = Date.now(), last = seen.current;
            seen.current = { scope: read.scope, uid: value, at: now };
            if (last?.scope === read.scope && last.uid === value && now - last.at < 3000)
                return;
        }
        setInputError('');
        action.clear();
        setPhysical(false);
        setDialog({ scope: read.scope, kind: 'register', uid: value, source: from });
    };
    const choose = (kind: 'issue' | 'lost' | 'damaged' | 'history', item: InventoryItem) => { action.clear(); setReplace(false); setDialog({ scope: read.scope, kind, item }); };
    const confirm = async () => {
        if (!active || disabled || active.kind === 'history')
            return;
        let ok = false;
        if (active.kind === 'register') {
            if (active.source === 'manual' && !physical)
                return;
            ok = await action.run('/rfid/inventory', { tag_uid: active.uid, source: active.source });
            if (ok)
                setUid('');
        }
        else {
            ok = await action.run(`/rfid/inventory/${active.item.rfid_id}/${active.kind === 'issue' ? 'issue' : 'retire'}`, {
                ...assignmentExpectation(active.item), ...(active.kind === 'issue' ? {} : { status: active.kind, replace: !!active.item.current && replace }),
            });
        }
        if (ok) {
            setDialog(null);
            read.refresh();
        }
    };
    if (!read.allowed)
        return <AdminDenied back={back}/>;
    return <Frame topInset={false} bottomPad={32} refreshing={read.loading} onRefresh={() => { if (!action.busy)
        read.refresh(); }}>
        <NavyHeader><T s={12} c={C.blue200}>ADMINISTRATION</T><T s={24} w="head" c={C.white}>RFID Inventory</T></NavyHeader>
        <View style={{ padding: 16, gap: 16 }}>
            <Btn label="Back to workspace" bg={C.blue50} color={C.royal} onPress={back}/>
            <AdminNotice error={active ? undefined : action.error} message={action.message}/>
            {read.data && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{(['available', 'assigned', 'issued', 'pending_vehicles'] as const).map(key => <Card key={key} style={{ width: '47%', flexGrow: 1, gap: 5 }}><T s={24} w="bold" c={C.navy}>{read.data!.summary[key] ?? 0}</T><T s={12}>{key === 'pending_vehicles' ? 'Waiting for a sticker' : INVENTORY_LABELS[key]}</T></Card>)}</View>}
            <Card style={{ gap: 12 }}><T s={17} w="bold" c={C.navy}>Register a physical sticker</T>
                <AdminTabs options={[{ label: 'Enter UID', value: 'manual' }, { label: 'External reader', value: 'reader' }]} value={source} onChange={value => { setSource(value); setUid(''); setInputError(''); }} disabled={action.busy}/>
                <T s={12} c={C.slate500}>{source === 'manual' ? 'Copy the UID of a real sticker. This registration will be marked as manually entered.' : 'Focus the field, then present one sticker to a compatible connected reader that types its EPC followed by Enter. Pause the gate reader page first.'}</T>
                <Field label="Sticker UID" accessibilityLabel="Sticker UID" value={uid} onChangeText={setUid} editable={!disabled} maxLength={80} autoCapitalize="characters" autoCorrect={false} onSubmitEditing={event => { if (source === 'reader')
        review(event.nativeEvent.text, 'reader');
    else
        review(); }} error={inputError} placeholder={source === 'reader' ? 'Complete 24-character EPC' : 'Real hexadecimal sticker UID'}/>
                <Btn label="Review sticker" onPress={() => review()} disabled={disabled || !uid.trim()}/>
            </Card>
            <AdminLoading loading={read.loading} error={read.error} retry={read.refresh}/>
            {!!pendingMeta?.total && <Card style={{ gap: 12 }}><T s={17} w="bold" c={C.navy}>Pending RFID Assignment</T><T s={12}>The backend assigns the next available sticker to the earliest eligible registration waiting for one.</T>{read.data?.pending.map(v => <View key={v.vehicle_id} style={{ gap: 4, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.slate100 }}><T s={14} w="bold">{v.plate_number}</T><T s={12}>{v.owner_name || v.user_code} · {v.user_type}</T><T s={11} c={C.slate500}>{formatCampusDateTime(v.rfid_requested_at)}</T></View>)}<AdminPager page={pendingMeta.current_page} last={pendingMeta.last_page} total={pendingMeta.total} onChange={setPendingPage} disabled={disabled} label="waiting vehicles"/></Card>}
            <Card style={{ gap: 12 }}><Field label="Search inventory" accessibilityLabel="Search inventory" value={search} onChangeText={v => { setSearch(v); setPage(1); }} placeholder="UID, vehicle plate or owner" maxLength={100}/>
                <AdminTabs options={[{ label: 'All stickers', value: '' }, ...Object.entries(INVENTORY_LABELS).map(([value, label]) => ({ value, label }))]} value={status} onChange={value => { setStatus(value); setPage(1); }}/>
                <T s={12} c={C.slate500}>Available → Assigned → Issued. Hand-over confirmation is required before an inventory sticker can pass the gate.</T>
                <Btn label="Refresh inventory" onPress={read.refresh} disabled={action.busy || read.loading} bg={C.blue50} color={C.royal}/>
            </Card>
            {read.data && !items.length && <Card><T s={14}>{appliedSearch || status ? 'No stickers match these filters.' : 'No physical stickers registered yet.'}</T></Card>}
            {shown.map(item => <Card key={item.rfid_id} style={{ gap: 12 }}><T s={15} w="bold" c={C.navy}>{item.tag_uid}</T><T s={13} c={C.royal}>{INVENTORY_LABELS[item.status] ?? item.status}</T><AdminInfo label="Source" value={item.inventory_source === 'manual' ? 'Entered by hand' : item.inventory_source === 'reader' ? 'Read by external reader' : 'Source not recorded'}/><AdminInfo label="Vehicle / owner" value={item.current ? [item.current.plate_number, item.current.user_name || item.current.user_code].filter(Boolean).join(' · ') : 'No current assignment'}/><AdminInfo label="Registered" value={formatCampusDateTime(item.inventory_registered_at)}/>{item.current && <AdminInfo label={item.current.issued_at ? 'Issued' : 'Assigned'} value={formatCampusDateTime(item.current.issued_at || item.current.assigned_at)}/>}
                {item.status === 'assigned' && item.current && !item.current.issued_at && <Btn label={`Confirm hand-over ${item.tag_uid}`} onPress={() => choose('issue', item)} disabled={disabled}/>}
                {['available', 'assigned', 'issued'].includes(item.status) && <View style={{ gap: 8 }}><Btn label={`Mark lost ${item.tag_uid}`} onPress={() => choose('lost', item)} disabled={disabled} bg={C.red50} color={C.red700}/><Btn label={`Mark damaged ${item.tag_uid}`} onPress={() => choose('damaged', item)} disabled={disabled} bg={C.red50} color={C.red700}/></View>}
                <Btn label={`Assignment history ${item.tag_uid}`} onPress={() => choose('history', item)} disabled={action.busy} bg={C.blue50} color={C.royal}/>
            </Card>)}
            {meta && <AdminPager page={meta.current_page} last={meta.last_page} total={meta.total} disabled={action.busy || read.loading} onChange={setPage}/>}
        </View>
        {active && <AdminDialog title={active.kind === 'register' ? 'Register physical sticker' : active.kind === 'history' ? 'Sticker assignment history' : active.kind === 'issue' ? 'Confirm physical hand-over' : `Mark sticker ${active.kind}`} onClose={close} busy={action.busy}>
            {active.kind === 'register' ? <><AdminInfo label="Sticker UID" value={active.uid}/><AdminInfo label="Source" value={active.source === 'reader' ? 'External reader' : 'Entered by hand'}/><T s={13}>This adds the sticker to the real inventory. An eligible vehicle waiting for a sticker may receive it automatically.</T>{active.source === 'manual' && <AdminCheckbox label="I copied this UID from a real sticker" checked={physical} onChange={setPhysical} disabled={action.busy}/>}</> : <><AdminInfo label="Sticker UID" value={active.item.tag_uid}/><AdminInfo label="Vehicle" value={active.item.current?.plate_number}/><AdminInfo label="Owner" value={active.item.current?.user_name || active.item.current?.user_code}/>
                {active.kind === 'issue' && <T s={13}>Confirm only after this exact sticker has been physically handed to the owner shown above.</T>}
                {(active.kind === 'lost' || active.kind === 'damaged') && <><T s={13}>Future scans of this sticker will be denied. Its current assignment ends and history is retained. A vehicle still inside must exit first.</T>{!!active.item.current && <AdminCheckbox label="Request a replacement sticker for this vehicle" checked={replace} onChange={setReplace} disabled={action.busy}/>}</>}
                {active.kind === 'history' && <RfidAssignmentHistory key={active.item.rfid_id} id={active.item.rfid_id}/>}
            </>}
            <AdminNotice error={action.error}/>
            {!!action.error && <Btn label="Reload current inventory" onPress={() => { close(); read.refresh(); }} disabled={action.busy} bg={C.blue50} color={C.royal}/>}
            {active.kind !== 'history' && <Btn label={active.kind === 'register' ? 'Register sticker' : active.kind === 'issue' ? 'Confirm hand-over' : `Confirm ${active.kind}`} onPress={() => void confirm()} loading={action.busy} disabled={disabled || (active.kind === 'register' && active.source === 'manual' && !physical)}/>} 
        </AdminDialog>}
    </Frame>;
}
