import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Btn, Card, Field, Frame, T } from '../components/ui';
import { AdminCheckbox, AdminDenied, AdminDialog, AdminInfo, AdminLoading, AdminNotice, AdminPager, AdminTabs } from '../components/AdminWorkspace';
import { Select } from '../components/Select';
import PrivateDocumentPreview from '../components/PrivateDocumentPreview';
import { useAuth } from '../context/AuthContext';
import { NavyHeader } from './shared';
import { C } from '../theme';
import { archiveProblem, archiveQuery, DEFAULT_HISTORY_FILTERS, documentPath, expectArchives, expectHistory, historyProblem, historyQuery, type ArchiveRow, type ArchiveState, type HistoryFilters, type HistoryResponse, type Page, type RecordEntity, type RecordRevision } from '../services/adminRecords';
import { changes, fieldLabel, readable, revisionSummary, valueText } from '../services/recordPresentation';
import { formatCampusDateTime } from '../services/datetime';
import { useAdminAction, useAdminRead } from '../services/useAdminWorkspace';
type Tab = RecordEntity | 'history';
const OPS: Record<string, string> = { baseline: 'Initial snapshot', created: 'Created', updated: 'Updated', archived: 'Archived', restored: 'Restored', deleted: 'Deleted' };
export default function RecordsHistoryScreen({ back }: {
    back: () => void;
}) {
    const { user, token } = useAuth();
    return <RecordsHistoryWorkspace key={`${user?.id ?? ''}|${user?.role ?? ''}|${token ?? ''}`} back={back}/>;
}
function RecordsHistoryWorkspace({ back }: {
    back: () => void;
}) {
    const { user } = useAuth();
    const [tab, setTab] = useState<Tab>('users'), [state, setState] = useState<ArchiveState>('active'), [page, setPage] = useState(1);
    const [search, setSearch] = useState(''), [appliedSearch, setAppliedSearch] = useState('');
    const [filters, setFilters] = useState<HistoryFilters>({ ...DEFAULT_HISTORY_FILTERS }), [appliedFilters, setAppliedFilters] = useState<HistoryFilters>({ ...DEFAULT_HISTORY_FILTERS });
    const [advanced, setAdvanced] = useState(false), [filterError, setFilterError] = useState('');
    const [target, setTarget] = useState<{
        scope: string;
        entity: RecordEntity;
        row: ArchiveRow;
    } | null>(null), [reason, setReason] = useState('');
    const [detail, setDetail] = useState<{
        scope: string;
        row: RecordRevision;
    } | null>(null), [unchanged, setUnchanged] = useState(false);
    const history = tab === 'history', path = history ? historyQuery(appliedFilters, page) : archiveQuery(tab, state, page, appliedSearch);
    const read = useAdminRead<Page<ArchiveRow> | HistoryResponse>(path, history ? expectHistory as (v: Page<ArchiveRow> | HistoryResponse) => Page<ArchiveRow> | HistoryResponse : expectArchives as (v: Page<ArchiveRow> | HistoryResponse) => Page<ArchiveRow> | HistoryResponse);
    const action = useAdminAction(read.scope, read.token, read.allowed), disabled = action.busy || read.loading || !!read.error;
    const rows = read.data && 'data' in read.data ? read.data : null, revisions = read.data && 'history' in read.data ? read.data : null, pagination = rows ?? revisions?.history;
    useEffect(() => { if (pagination && pagination.current_page > pagination.last_page)
        setPage(pagination.last_page); }, [pagination?.current_page, pagination?.last_page]);
    const selected = target?.scope === read.scope ? target : null, revision = detail?.scope === read.scope ? detail.row : null;
    const close = () => { setTarget(null); setDetail(null); setReason(''); setUnchanged(false); action.clear(); };
    const chooseTab = (value: Tab) => { close(); setTab(value); setPage(1); setFilterError(''); };
    const apply = () => {
        const problem = history ? historyProblem({ ...filters, search }) : search.trim().length > 100 ? 'Use at most 100 characters for search.' : null;
        if (problem) {
            setFilterError(problem);
            return;
        }
        close();
        setFilterError('');
        setPage(1);
        setAppliedSearch(search.trim());
        setAppliedFilters({ ...filters, search: search.trim() });
        read.refresh();
    };
    const change = async () => {
        if (!selected || disabled || archiveProblem(reason))
            return;
        const verb = selected.row.archived_at ? 'restore' : 'archive';
        if (await action.run(`/admin/record-archives/${selected.entity}/${selected.row.id}/${verb}`, { reason: reason.trim() })) {
            setTarget(null);
            setReason('');
            setPage(1);
            read.refresh();
        }
    };
    if (!read.allowed)
        return <AdminDenied back={back}/>;
    return <Frame topInset={false} bottomPad={32} refreshing={read.loading} onRefresh={() => { if (!action.busy)
        read.refresh(); }}>
        <NavyHeader><T s={12} c={C.blue200}>ADMINISTRATION</T><T s={24} w="head" c={C.white}>Records &amp; History</T></NavyHeader>
        <View style={{ padding: 16, gap: 16 }}>
            <Btn label="Back to workspace" bg={C.blue50} color={C.royal} onPress={back}/>
            <AdminTabs options={[{ value: 'users', label: 'Accounts' }, { value: 'vehicles', label: 'Vehicles' }, { value: 'history', label: 'Change history' }]} value={tab} onChange={chooseTab} disabled={action.busy}/>
            <AdminNotice message={action.message} error={selected ? undefined : action.error}/>
            <Card style={{ gap: 12 }}><T s={17} w="bold" c={C.navy}>{history ? 'Saved record changes' : tab === 'users' ? 'Account records' : 'Vehicle records'}</T><T s={12} c={C.slate500}>{history ? 'Review what changed, who changed it and when it was saved.' : 'Archiving retains the original identifiers, documents and history.'}</T>
                {!history && <AdminTabs options={[{ value: 'active', label: `Active${rows?.summary ? ` (${rows.summary.active})` : ''}` }, { value: 'archived', label: `Archived${rows?.summary ? ` (${rows.summary.archived})` : ''}` }]} value={state} onChange={value => { close(); setState(value); setPage(1); }} disabled={action.busy}/>}
                <Field label="Search records" accessibilityLabel="Search records" value={search} onChangeText={setSearch} editable={!action.busy} maxLength={100} placeholder={history ? 'Name, plate, account or actor' : 'Name, plate, ID or email'} onSubmitEditing={apply}/>
                {history && <><Btn label={advanced ? 'Hide history filters' : 'More history filters'} bg={C.blue50} color={C.royal} onPress={() => setAdvanced(v => !v)} disabled={action.busy}/>{advanced && <View style={{ gap: 12 }}>
                    <Select label="Record type" value={filters.record_type} options={[{ value: '', label: 'All record types' }, ...Object.entries(revisions?.entities ?? {}).map(([value, label]) => ({ value, label: String(label) }))]} onChange={record_type => setFilters(f => ({ ...f, record_type, scope: ['login_attempts', 'audit_logs', 'audit_alert_reviews'].includes(record_type) ? 'all' : f.scope }))}/>
                    <Select label="Change type" value={filters.operation} options={[{ value: '', label: 'All change types' }, ...Object.entries(OPS).map(([value, label]) => ({ value, label }))]} onChange={operation => setFilters(f => ({ ...f, operation }))}/>
                    <Field label="Record reference (optional)" accessibilityLabel="Record reference" value={filters.record_id} onChangeText={record_id => setFilters(f => ({ ...f, record_id }))} maxLength={128}/>
                    <Field label="From date (PHT)" accessibilityLabel="History from date" value={filters.date_from} onChangeText={date_from => setFilters(f => ({ ...f, date_from }))} maxLength={10} placeholder="YYYY-MM-DD"/>
                    <Field label="To date (PHT)" accessibilityLabel="History to date" value={filters.date_to} onChangeText={date_to => setFilters(f => ({ ...f, date_to }))} maxLength={10} placeholder="YYYY-MM-DD"/>
                    <AdminCheckbox label="Include initial snapshots" checked={filters.include_baseline} onChange={include_baseline => setFilters(f => ({ ...f, include_baseline }))}/>
                    <AdminCheckbox label="Include system activity" checked={filters.scope === 'all'} onChange={all => setFilters(f => ({ ...f, scope: all ? 'all' : 'business' }))}/>
                </View>}</>}
                {!!filterError && <T accessibilityRole="alert" s={12} c={C.red700}>{filterError}</T>}
                <Btn label="Apply record filters" onPress={apply} disabled={action.busy}/>
                <Btn label="Refresh records" onPress={read.refresh} disabled={action.busy || read.loading} bg={C.blue50} color={C.royal}/>
            </Card>
            <AdminLoading loading={read.loading} error={read.error} retry={read.refresh}/>
            {pagination && !pagination.data.length && <Card><T s={14}>No matching records. Try another search or filter.</T></Card>}
            {rows?.data.map(row => <Card key={row.id} style={{ gap: 12 }}><T s={17} w="bold" c={C.navy}>{row.identifier}</T><AdminInfo label="Name" value={row.name}/>{row.email && <AdminInfo label="Email" value={row.email}/>}<AdminInfo label={tab === 'vehicles' ? 'Owner' : 'Account status'} value={tab === 'vehicles' ? [row.owner, row.owner_code].filter(Boolean).join(' · ') : readable(row.status)}/>{tab === 'vehicles' && <AdminInfo label="Vehicle status" value={readable(row.status)}/>}<AdminInfo label="Archived on" value={row.archived_at ? formatCampusDateTime(row.archived_at) : 'Active record'}/>
                {tab === 'users' && String(row.id) === user?.id && !row.archived_at && <T s={12} c={C.slate500}>You cannot archive your own administrator account.</T>}
                <Btn label={`${row.archived_at ? 'Restore' : 'Archive'} ${row.identifier}`} disabled={disabled || tab === 'users' && String(row.id) === user?.id && !row.archived_at} onPress={() => { action.clear(); setReason(''); setTarget({ scope: read.scope, entity: tab as RecordEntity, row }); }} bg={row.archived_at ? C.blue50 : C.red50} color={row.archived_at ? C.royal : C.red700}/>
            </Card>)}
            {revisions?.history.data.map(row => <Card key={row.revision_id} style={{ gap: 10 }}><T s={16} w="bold" c={C.navy}>{row.record_label || `${row.record_type_label || readable(row.record_type)} #${row.record_id}`}</T><T s={13} c={C.royal}>{OPS[row.operation] || readable(row.operation)}</T><T s={12}>{revisionSummary(row.operation, row.before_values, row.after_values)}</T><AdminInfo label="Performed by" value={row.actor_label || 'System / no actor recorded'}/><AdminInfo label="Saved on" value={formatCampusDateTime(row.recorded_at)}/><Btn label={`View change ${row.revision_id}`} onPress={() => { setUnchanged(false); setDetail({ scope: read.scope, row }); }} bg={C.blue50} color={C.royal}/></Card>)}
            {pagination && <AdminPager page={pagination.current_page} last={pagination.last_page} total={pagination.total} disabled={action.busy || read.loading} onChange={value => { close(); setPage(value); }}/>}
        </View>
        {selected && <AdminDialog title={`${selected.row.archived_at ? 'Restore' : 'Archive'} ${selected.row.identifier}`} onClose={close} busy={action.busy}><AdminInfo label="Record" value={selected.row.name || selected.row.identifier}/><T s={13}>{selected.row.archived_at ? 'Restore this record with its original identifier. Account access remains subject to its status and approval rules; restored vehicles need a fresh automatic OR/CR check. Previous RFID and QR credentials stay revoked.' : 'Remove this record from active use while retaining identifiers, documents and history. Access credentials will be revoked. A vehicle still inside must exit first.'}</T><Field label="Reason" accessibilityLabel="Archive or restore reason" multiline value={reason} onChangeText={setReason} maxLength={500} editable={!action.busy} placeholder="Explain why this record is being archived or restored."/><T s={11} c={C.slate500}>5–500 characters · {reason.trim().length}/500</T><AdminNotice error={action.error}/><Btn label={selected.row.archived_at ? 'Restore record' : 'Archive record'} onPress={() => void change()} disabled={disabled || !!archiveProblem(reason)} loading={action.busy}/></AdminDialog>}
        {revision && <AdminDialog title={revision.record_label || 'Saved change'} onClose={close}><AdminInfo label="Record type" value={revision.record_type_label || readable(revision.record_type)}/><AdminInfo label="Performed by" value={revision.actor_label || 'System / no actor recorded'}/><AdminInfo label="Saved on" value={formatCampusDateTime(revision.recorded_at)}/>{revision.operation === 'baseline' && <T s={13}>This is the initial retained version, rather than a new change made by a user.</T>}<T s={17} w="bold">What changed</T><AdminCheckbox label="Include unchanged fields" checked={unchanged} onChange={setUnchanged}/>
            {!changes(revision.before_values, revision.after_values, unchanged).length && <T s={13}>No visible field changes were retained.</T>}
            {changes(revision.before_values, revision.after_values, unchanged).map(row => <Card key={row.key} style={{ gap: 10 }}><T s={14} w="bold" c={C.navy}>{row.label}</T><AdminInfo label="Previous value" value={valueText(row.key, row.before)}/><AdminInfo label="Updated value" value={valueText(row.key, row.after)}/></Card>)}
            {!!revision.documents?.length && <><T s={16} w="bold">Retained documents</T>{revision.documents.map((doc, index) => {
                    try {
                        return <PrivateDocumentPreview key={`${doc.side}:${doc.field}`} path={documentPath(revision.revision_id, doc)} label={`${doc.side === 'before' ? 'Previous' : 'Updated'} ${fieldLabel(doc.field.replace(/_path$/, ''))}`}/>;
                    }
                    catch {
                        return <T key={index} s={12} c={C.red700}>A historical document reference is unavailable. Refresh the history.</T>;
                    }
                })}</>}
            <AdminInfo label="Revision reference" value={`#${revision.revision_id} · ${revision.record_type} #${revision.record_id}`}/>
        </AdminDialog>}
    </Frame>;
}
