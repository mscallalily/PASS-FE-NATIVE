/** Web/Backend-aligned RFID contracts. Neither client nor Expo simulates gate scans. */
export type AccessMethod = 'rfid' | 'qr' | 'manual';
export type Direction = 'in' | 'out';
export type AccessResult = 'granted' | 'denied';
export interface RfidCredential {
  rfid_id: number;
  tag_uid: string;
  tag_type: string;
  tag_status: string;
  assignment_id: number | null;
  assignment_status: string | null;
  assigned_at: string | null;
  valid_until: string | null;
  expired: boolean;
  user_code: string | null;
  user_type: string | null;
  user_name: string | null;
  plate_number: string | null;
  last_used: string | null;
}
export interface GateEvent {
  event_id: number;
  event_datetime: string | null;
  direction: Direction;
  access_method: AccessMethod;
  auth_result: AccessResult;
  denial_reason: string | null;
  gate_name: string | null;
  plate_number: string | null;
  vehicle_type: string | null;
  party_type: 'user' | 'visitor' | null;
  party_name: string | null;
  user_code: string | null;
  user_type: string | null;
  rfid_tag: string | null;
  rfid_assignment_id: number | null;
  rfid_assignment_status: string | null;
  rfid_holder_code: string | null;
  qr_pass_code: string | null;
  presented_credential: string | null;
  staff_override: boolean;
  source: 'staff_gate' | 'reader' | 'simulator' | null;
  processed_by: string | null;
  transaction_id: number | null;
}
export interface TodayGateSummary { entries: number; exits: number; denied: number; rfid: number; qr: number; staff_override: number }
export interface GateFilters { method: AccessMethod | ''; direction: Direction | ''; result: AccessResult | ''; date: 'today' | ''; search: string }
export const DEFAULT_GATE_FILTERS: GateFilters = { method:'rfid', direction:'', result:'', date:'', search:'' };
export function accessEventQuery(filters: GateFilters): string {
  const params: string[] = [];
  (['method','direction','result','date','search'] as const).forEach(key => {
    const value = filters[key].trim();
    if (value) params.push(`${key}=${encodeURIComponent(key === 'search' ? value.slice(0,100) : value)}`);
  });
  return `/access-events${params.length ? `?${params.join('&')}` : ''}`;
}
export function filterCredentials(credentials: RfidCredential[], query: string): RfidCredential[] {
  const q=query.trim().toLowerCase();
  return credentials.filter(r=>!q || [r.tag_uid,r.user_code,r.user_name,r.plate_number].some(value=>value?.toLowerCase().includes(q)));
}
export interface AssignableVehicle { id: string; plate: string; owner: string; authorizationStatus?: string; rfid?: string | null }
export function eligibleVehicles(vehicles: AssignableVehicle[]): AssignableVehicle[] {
  return vehicles.filter(v=>v.authorizationStatus==='approved' && !v.rfid);
}
/** Mirrors Laravel's tag UID, vehicle ID, date shape checks; Laravel owns final eligibility. */
export function assignmentIssue(tagUid: string, vehicleId: string, validUntil: string, today: string): string | null {
  if (!vehicleId || !/^\d+$/.test(vehicleId) || Number(vehicleId)<=0) return 'Select an approved vehicle.';
  if (!tagUid.trim() || tagUid.trim().length>50 || !/^[A-Za-z0-9:_-]+$/.test(tagUid.trim())) return 'RFID UID must be 1–50 letters, numbers, colon, underscore or hyphen.';
  if (validUntil && (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil) || Number.isNaN(Date.parse(`${validUntil}T00:00:00Z`)) || new Date(`${validUntil}T00:00:00Z`).toISOString().slice(0,10) !== validUntil || validUntil<today)) return 'Enter a valid expiration date today or later (YYYY-MM-DD).';
  return null;
}
/** YYYY-MM-DD in Manila. Avoid locale-dependent ordering/US date strings. */
export function campusToday(now: Date = new Date()): string {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const pick=(field:string)=>parts.find(part=>part.type===field)?.value??'';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}
export function manilaDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-PH', {timeZone:'Asia/Manila',year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
}
