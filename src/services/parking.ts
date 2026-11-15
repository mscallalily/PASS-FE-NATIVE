import { api } from '../api/client';
import { getPublicParkingMap, type ParkingMapData } from './parkingMap';

export interface ParkingZone {
  zone_id: number;
  zone_code: string;
  zone_name: string;
  capacity: number;
  occupied: number;
  available: number;
  reserved: number;
  maintenance: number;
  disabled: number;
}

export interface ParkingArea {
  parking_area_id: number;
  area_code: string;
  area_name: string;
  capacity: number;
  occupied: number;
  available: number;
  maintenance?: number;
  recorded_occupied?: number;
  unverified_occupied?: number;
  sensor_unavailable?: number;
  occupancy_percent?: number;
  zones?: ParkingZone[];
}

const invalid = (): never => { throw new Error('The server returned an invalid parking availability response.'); };
function record(value: unknown): Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : invalid(); }
function text(value: unknown): string { return typeof value === 'string' && value.trim() ? value : invalid(); }
function count(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : invalid();
}
function id(value: unknown): number { const n = count(value); return n > 0 ? n : invalid(); }

/** Preserve the existing aggregate-array return contract for older callers. */
export async function getParkingAvailability(token: string): Promise<ParkingArea[]> {
  const response = record(await api<unknown>('/parking/availability', { token }));
  const areas = Array.isArray(response.areas) ? response.areas : invalid();
  return areas.map(value => {
    const area = record(value);
    const parsed: ParkingArea = { parking_area_id: id(area.parking_area_id), area_code: text(area.area_code), area_name: text(area.area_name),
      capacity: count(area.capacity), occupied: count(area.occupied), available: count(area.available) };
    if (parsed.available + parsed.occupied > parsed.capacity) invalid();
    for (const key of ['maintenance', 'recorded_occupied', 'unverified_occupied', 'sensor_unavailable'] as const) {
      if (area[key] !== undefined) parsed[key] = count(area[key]);
    }
    if (area.occupancy_percent !== undefined) {
      const percentage = typeof area.occupancy_percent === 'number' ? area.occupancy_percent
        : typeof area.occupancy_percent === 'string' && /^\d+(?:\.\d+)?$/.test(area.occupancy_percent) ? Number(area.occupancy_percent) : NaN;
      if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) invalid();
      parsed.occupancy_percent = percentage;
    }
    if (area.zones !== undefined) {
      const zones = Array.isArray(area.zones) ? area.zones : invalid();
      parsed.zones = zones.map(value => {
        const zone = record(value);
        return { zone_id: id(zone.zone_id), zone_code: text(zone.zone_code), zone_name: text(zone.zone_name), capacity: count(zone.capacity),
          occupied: count(zone.occupied), available: count(zone.available), reserved: count(zone.reserved), maintenance: count(zone.maintenance), disabled: count(zone.disabled) };
      });
    }
    return parsed;
  });
}

/** The public per-slot snapshot supports local sensor expiry; aggregate totals alone do not. */
export async function getParkingAvailabilitySnapshot(token: string, signal?: AbortSignal): Promise<ParkingMapData> {
  const snapshot = await getPublicParkingMap(token, signal);
  if (!snapshot.areas || !snapshot.overall || !snapshot.generated_at) invalid();
  return snapshot;
}
