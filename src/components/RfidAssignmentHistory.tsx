import React, { useEffect, useState } from 'react';
import { Card, T } from './ui';
import { AdminInfo, AdminLoading, AdminPager } from './AdminWorkspace';
import { listMeta, listPath, type ListMeta } from '../services/listPage';
import type { InventoryAssignment } from '../services/rfidInventory';
import { formatCampusDateTime } from '../services/datetime';
import { useAdminRead } from '../services/useAdminWorkspace';
type Response = { data: InventoryAssignment[]; meta?: ListMeta };
function parse(value: Response): Response {
    if (!value || !Array.isArray(value.data) || !value.data.every(a => a && Number.isInteger(a.assignment_id))) throw new Error('PASS returned incomplete assignment history.');
    listMeta(value.meta, value.data.length); return value;
}
export default function RfidAssignmentHistory({ id }: { id: number }) {
    const [page, setPage] = useState(1), read = useAdminRead<Response>(listPath(`/rfid/inventory/${id}/history`, page), parse);
    const meta = read.data ? listMeta(read.data.meta, read.data.data.length) : null;
    useEffect(() => { if (meta && page > meta.last_page) setPage(meta.last_page); }, [meta?.last_page, page]);
    return <><AdminLoading loading={read.loading} error={read.error} retry={read.refresh}/>
        {read.data && !read.data.data.length && <T s={13}>No assignment history retained.</T>}
        {read.data?.data.map(a => <Card key={a.assignment_id} style={{ gap: 8 }}><AdminInfo label="Vehicle / owner" value={[a.plate_number, a.user_name || a.user_code].filter(Boolean).join(' · ')}/><AdminInfo label="Assignment status" value={a.assignment_status}/><AdminInfo label="Assigned" value={formatCampusDateTime(a.assigned_at)}/><AdminInfo label="Issued" value={formatCampusDateTime(a.issued_at)}/><AdminInfo label="Ended" value={formatCampusDateTime(a.unassigned_at)}/></Card>)}
        {meta && <AdminPager page={meta.current_page} last={meta.last_page} total={meta.total} disabled={read.loading} onChange={setPage} label="assignments"/>}</>;
}
