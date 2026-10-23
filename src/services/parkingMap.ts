import { api, ApiError } from '../api/client';
import type { MobileRole } from '../context/AuthContext';

export type Point = [number, number];
export type SlotStatus = 'available' | 'occupied' | 'maintenance';
export interface MapSlot {
  slot_id: number; slot_code: string; parking_area_id: number;
  area_code: string; area_name: string; slot_status: string;
  status: SlotStatus; placed: boolean;
  x: number | null; y: number | null; w: number | null; h: number | null;
  rotation: number; accessible?: boolean;
  occupant?: null | {
    transaction_id: number; plate_number: string; vehicle_type: string | null;
    party_type: string | null; party_name: string | null; owner_code: string | null;
    access_method: string; entry_datetime: string | null;
    confirmed: boolean; confirmed_at: string | null;
  };
  incident?: null | {
    violation_id: number; plate_number: string | null; assigned_slot: string | null;
    observed_slot: string | null; violation_status: string; role: string;
  };
}
export interface MapGeometry {
  areas: { area: string; polygon: Point[]; label: string; label_at: Point; label_angle: number; sign_at?: Point }[];
  connector?: { polygon: Point[] };
  site?: { polygon: Point[] };
  islands?: { polygon: Point[] }[];
  road: { polygon: Point[]; label: string; label_at: Point; label_angle: number };
  gate: { at: Point; angle: number; label: string; sublabel: string; label_at: Point };
  lanes: { points: Point[]; kind: string; reverse?: boolean; label?: string; label_at?: Point; label_angle?: number }[];
  circulation?: { polygon: Point[]; kind: string }[];
  circulation_labels?: { text: string; at: Point; angle: number }[];
  proposed_slot_codes?: string[];
  measurement_basis?: { units_per_metre?: number; note?: string; survey_verified?: boolean;
    inventory?: { motorcycle_configured: number; motorcycle_drawn: number; car_configured: number; car_drawn: number };
    scale?: string };
}
export interface ParkingMapData {
  view_box: [number, number, number, number];
  geometry: MapGeometry;
  slots: MapSlot[];
  extra_bays: { area: string; x: number; y: number; w: number; h: number; rotation: number; label: string; kind: string; note?: string | null }[];
  measured_layout?: { geometry: MapGeometry; positions: Record<string, { x: number; y: number; w: number; h: number; rotation: number }> };
  areas?: { parking_area_id: number; area_code: string; area_name: string; capacity: number; occupied: number; available: number; maintenance?: number }[];
  overall?: { capacity: number; occupied: number; available: number };
  gate?: { gate_code: string; gate_name: string; gate_status: string };
  ambiguities?: string[];
  corrections?: string[];
  generated_at?: string;
  /** True only when Laravel allowed the privileged /parking/map contract. */
  hasStaffDetails?: boolean;
}

/**
 * This is an invariant taken from the web backend's measured proposal, not a
 * second set of mobile coordinates. A partial API response must never be
 * rendered as a complete parking facility.
 */
export const WEB_BAY_COUNTS = { MC: 84, CAR: 45 } as const;

export type WebLayoutParity = { MC: number; CAR: number; unmappedCars: number };

export function verifyWebMeasuredLayout(data: ParkingMapData): WebLayoutParity {
  const measured = data.measured_layout;
  if (!measured?.positions || !measured.geometry) {
    throw new Error('The PASS server did not return its web measured_layout. Use the same current Laravel backend as PASS Web; the mobile app will not substitute a different parking layout.');
  }
  const keys = Object.keys(measured.positions);
  const real = new Map(data.slots.map(s => [s.slot_code, s]));
  if (real.size !== data.slots.length) throw new Error('PASS parking API returned duplicate slot codes; the layout cannot be trusted.');
  for (const [area, count] of Object.entries(WEB_BAY_COUNTS) as [keyof typeof WEB_BAY_COUNTS, number][]) {
    const prefix = area === 'MC' ? 'M' : 'C';
    const areaKeys = keys.filter(k => k.startsWith(`${prefix}-`));
    if (areaKeys.length !== count) {
      throw new Error(`PASS Web layout must contain ${count} ${area === 'MC' ? 'motorcycle' : 'car'} bays, but Laravel supplied ${areaKeys.length}. Check the server version before displaying the map.`);
    }
    for (let n = 1; n <= count; n++) {
      const code = `${prefix}-${String(n).padStart(2, '0')}`;
      const pos = measured.positions[code];
      if (!pos || ![pos.x,pos.y,pos.w,pos.h,pos.rotation].every(v => typeof v === 'number' && Number.isFinite(v)) || pos.w <= 0 || pos.h <= 0) {
        throw new Error(`The web measured layout is missing a valid position for ${code}.`);
      }
      if (!real.has(code)) {
        throw new Error(`${code} exists in the PASS Web layout but not in the parking_slots API data. Restore the missing record in Laravel/MySQL; mobile must not invent a slot.`);
      }
      if (real.get(code)!.area_code !== area) {
        throw new Error(`${code} belongs to the wrong parking area in MySQL; the mobile app will not rearrange it.`);
      }
    }
  }
  if (keys.length !== WEB_BAY_COUNTS.MC + WEB_BAY_COUNTS.CAR) {
    throw new Error('The backend measured layout includes unexpected bay positions. Compare ParkingMapLayout.php with the web version.');
  }
  return {MC:WEB_BAY_COUNTS.MC,CAR:WEB_BAY_COUNTS.CAR,
    unmappedCars:data.slots.filter(s => s.area_code === 'CAR' && !measured.positions[s.slot_code]).length};
}

const STAFF_ROLES: MobileRole[] = ['admin', 'parking_admin', 'parking_staff', 'security'];
export const canOperateSlots = (role: MobileRole) => role === 'parking_staff' || role === 'security';

/** Same proposed placement as the React web map. It never fabricates physical bays. */
export function withMeasuredLayout(raw: ParkingMapData): ParkingMapData {
  if (!raw.measured_layout) return raw;
  const { geometry, positions } = raw.measured_layout;
  return {
    ...raw, geometry,
    slots: raw.slots.map(slot => {
      const pos = positions[slot.slot_code];
      return { ...slot, placed: !!pos, x: pos?.x ?? null, y: pos?.y ?? null,
        w: pos?.w ?? null, h: pos?.h ?? null, rotation: pos?.rotation ?? 0 };
    }),
  };
}

export function slotColors(slot: MapSlot) {
  if (slot.status === 'maintenance') return { fill: '#9CA3AF', outline: '#6B7280', label: '#FFFFFF' };
  if (slot.status === 'occupied') return { fill: '#EF4444', outline: slot.occupant?.confirmed === false ? '#FFFFFF' : '#B91C1C', label: '#FFFFFF' };
  return { fill: '#22C55E', outline: '#15803D', label: '#FFFFFF' };
}

/** Privileged records include identities; the general map deliberately does not. */
export async function getParkingMap(token: string, role: MobileRole): Promise<ParkingMapData> {
  if (STAFF_ROLES.includes(role)) {
    try {
      const privileged = await api<ParkingMapData>('/parking/map', { token });
      if (!Array.isArray(privileged.slots)) throw new Error('Invalid parking map response.');
      verifyWebMeasuredLayout(privileged);
      return withMeasuredLayout({ ...privileged, hasStaffDetails: true });
    } catch (error) {
      // Role assignments can differ between frontend and Laravel; a 403
      // must degrade to the public availability map, never bypass access.
      if (!(error instanceof ApiError) || error.status !== 403) throw error;
    }
  }
  const availability = await api<ParkingMapData>('/parking/availability-map', { token });
  if (!Array.isArray(availability.slots) || !availability.geometry) throw new Error('Invalid parking layout response.');
  verifyWebMeasuredLayout(availability);
  return withMeasuredLayout({ ...availability, hasStaffDetails: false });
}
