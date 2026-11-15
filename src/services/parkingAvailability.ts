import type { MapSlot, ParkingFigures, ParkingMapData, SlotSensor, SlotStatus } from './parkingMap';

const STATES: SlotStatus[] = ['available', 'occupied', 'maintenance', 'unknown'];
const SENSOR_TTL_MS = 12000;
const invalid = (): never => { throw new Error('The parking response is incomplete or inconsistent. Refresh before relying on availability.'); };
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : invalid();
const text = (value: unknown): string => typeof value === 'string' && value.trim() ? value : invalid();
const nullableText = (value: unknown): string | null => value === null || value === undefined ? null : text(value);
function number(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
  return Number.isFinite(n) ? n : invalid();
}
const nullableNumber = (value: unknown): number | null => value === null ? null : number(value);
function count(value: unknown): number { const n = number(value); return Number.isSafeInteger(n) && n >= 0 ? n : invalid(); }
function id(value: unknown): number { const n = count(value); return n > 0 ? n : invalid(); }
function flag(value: unknown): boolean {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  return invalid();
}
function timestamp(value: unknown): string | null {
  return value === null ? null : typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : invalid();
}
function list<T>(value: unknown, parse: (v: Record<string, unknown>) => T): T[] {
  return Array.isArray(value) ? value.map(v => parse(record(v))) : invalid();
}

export function monotonicNow(): number { return performance.now(); }

/** Legacy public maps used occupied exclusively for a transaction hold. */
export function hasRecordedHold(slot: MapSlot): boolean {
  if (slot.recorded_occupied !== undefined) return slot.recorded_occupied;
  if (slot.occupant) return true;
  return !slot.sensor && slot.status === 'occupied';
}

function sensor(value: unknown): SlotSensor | null {
  if (value === null) return null;
  const s = record(value), online = flag(s.online), at = timestamp(s.last_seen_at);
  if (!['available', 'occupied', 'unknown', 'offline'].includes(String(s.state)) || online && (at === null || s.state === 'offline')) invalid();
  const distance = nullableNumber(s.distance_cm);
  if (distance !== null && (distance < 2 || distance > 400)) invalid();
  if (online && (s.state === 'available' && (distance === null || distance < 20) || s.state === 'occupied' && (distance === null || distance > 15))) invalid();
  return { online, state: online ? s.state as SlotSensor['state'] : 'offline', distance_cm: online ? distance : null, last_seen_at: at };
}

function parseSlot(s: Record<string, unknown>, staff: boolean): MapSlot {
  if (!STATES.includes(s.status as SlotStatus)) invalid();
  const placed = flag(s.placed), x = nullableNumber(s.x), y = nullableNumber(s.y), w = nullableNumber(s.w), h = nullableNumber(s.h);
  if (placed && (x === null || y === null || w === null || h === null || w <= 0 || h <= 0)) invalid();
  const slot: MapSlot = {
    slot_id: id(s.slot_id), slot_code: text(s.slot_code), parking_area_id: id(s.parking_area_id), area_code: text(s.area_code), area_name: text(s.area_name),
    slot_status: text(s.slot_status), status: s.status as SlotStatus, placed, x, y, w, h, rotation: number(s.rotation),
  };
  if (s.accessible !== undefined) slot.accessible = flag(s.accessible);
  if (s.recorded_occupied !== undefined) slot.recorded_occupied = flag(s.recorded_occupied);
  if (s.sensor !== undefined) {
    slot.sensor = sensor(s.sensor);
    // New sensor payloads must distinguish a recorded hold from an unverified object.
    if (slot.sensor && slot.recorded_occupied === undefined) invalid();
  }
  if (staff && s.occupant !== undefined) {
    if (s.occupant === null) slot.occupant = null;
    else {
      const o = record(s.occupant);
      slot.occupant = { transaction_id: id(o.transaction_id), plate_number: text(o.plate_number), vehicle_type: nullableText(o.vehicle_type),
        party_type: nullableText(o.party_type), party_name: nullableText(o.party_name), owner_code: nullableText(o.owner_code), access_method: text(o.access_method),
        entry_datetime: timestamp(o.entry_datetime), confirmed: flag(o.confirmed), confirmed_at: timestamp(o.confirmed_at) };
      if (slot.recorded_occupied === false) invalid();
    }
  }
  if (staff && s.incident !== undefined) {
    if (s.incident === null) slot.incident = null;
    else {
      const i = record(s.incident);
      slot.incident = { violation_id: id(i.violation_id), plate_number: nullableText(i.plate_number), assigned_slot: nullableText(i.assigned_slot),
        observed_slot: nullableText(i.observed_slot), violation_status: text(i.violation_status), role: text(i.role) };
    }
  }
  if (hasRecordedHold(slot) && slot.status !== 'occupied') invalid();
  if (slot.sensor?.online && !hasRecordedHold(slot) && slot.status !== 'maintenance') {
    if (slot.sensor.state === 'occupied' && slot.status === 'available' || slot.sensor.state === 'available' && slot.status === 'occupied') invalid();
  }
  return slot;
}

/** Missing supplemental legacy counts are derived from slots, never invented as healthy. */
export function parseParkingFigures(value: unknown, slots: MapSlot[] = []): ParkingFigures {
  const f = record(value), capacity = count(f.capacity), occupied = count(f.occupied), available = count(f.available);
  const maintenance = f.maintenance === undefined ? slots.filter(s => s.status === 'maintenance').length : count(f.maintenance);
  const unknown = f.sensor_unavailable === undefined ? slots.filter(s => s.status === 'unknown').length : count(f.sensor_unavailable);
  const unverified = f.unverified_occupied === undefined ? slots.filter(s => s.status === 'occupied' && !hasRecordedHold(s)).length : count(f.unverified_occupied);
  const recorded = f.recorded_occupied === undefined ? occupied - unverified : count(f.recorded_occupied);
  if (recorded < 0 || occupied !== recorded + unverified || capacity !== available + occupied + maintenance + unknown) invalid();
  const percentage = f.occupancy_percent === undefined ? capacity ? Math.round(occupied / capacity * 1000) / 10 : 0 : number(f.occupancy_percent);
  if (percentage < 0 || percentage > 100) invalid();
  const result: ParkingFigures = { capacity, occupied, available, maintenance, sensor_unavailable: unknown, unverified_occupied: unverified, recorded_occupied: recorded, occupancy_percent: percentage };
  if (f.confirmed !== undefined) result.confirmed = count(f.confirmed);
  if (f.awaiting_confirmation !== undefined) result.awaiting_confirmation = count(f.awaiting_confirmation);
  return result;
}

export function parseParkingMapResponse(value: unknown, staff: boolean): ParkingMapData {
  const input = record(value), slots = list(input.slots, s => parseSlot(s, staff));
  if (new Set(slots.map(s => s.slot_id)).size !== slots.length || new Set(slots.map(s => s.slot_code)).size !== slots.length) invalid();
  const geometry = record(input.geometry), view = Array.isArray(input.view_box) ? input.view_box : invalid();
  if (view.length !== 4 || !Array.isArray(geometry.areas) || !geometry.road || !geometry.gate || !Array.isArray(geometry.lanes)) invalid();
  const viewBox = view.map(number) as ParkingMapData['view_box'];
  if (viewBox[2] <= 0 || viewBox[3] <= 0) invalid();
  const data: ParkingMapData = { view_box: viewBox, geometry: geometry as unknown as ParkingMapData['geometry'], slots,
    extra_bays: list(input.extra_bays, b => ({ area: text(b.area), x: number(b.x), y: number(b.y), w: number(b.w), h: number(b.h), rotation: number(b.rotation), label: text(b.label), kind: text(b.kind), note: nullableText(b.note) })), hasStaffDetails: staff };
  if (input.measured_layout !== undefined) {
    const measured = record(input.measured_layout); record(measured.geometry); record(measured.positions);
    data.measured_layout = measured as unknown as ParkingMapData['measured_layout'];
  }
  if (input.generated_at !== undefined) data.generated_at = timestamp(input.generated_at) ?? invalid();
  if (slots.some(s => s.sensor) && !data.generated_at) invalid();
  if (input.areas !== undefined) data.areas = list(input.areas, a => {
    const code = text(a.area_code);
    return { ...parseParkingFigures(a, slots.filter(s => s.area_code === code)), parking_area_id: id(a.parking_area_id), area_code: code, area_name: text(a.area_name) };
  });
  if (input.overall !== undefined) data.overall = parseParkingFigures(input.overall, slots);
  // A mixed snapshot must fail instead of producing negative/double-counted totals when it ages.
  const consistent = (f: ParkingFigures, rows: MapSlot[]) => {
    const occupied = rows.filter(s => s.status === 'occupied');
    if (f.capacity !== rows.length || f.available !== rows.filter(s => s.status === 'available').length
      || f.occupied !== occupied.length || f.maintenance !== rows.filter(s => s.status === 'maintenance').length
      || f.sensor_unavailable !== rows.filter(s => s.status === 'unknown').length
      || f.unverified_occupied !== occupied.filter(s => !hasRecordedHold(s)).length) invalid();
  };
  if (data.overall) consistent(data.overall, slots);
  if (data.areas) {
    if (new Set(data.areas.map(a => a.area_code)).size !== data.areas.length || new Set(data.areas.map(a => a.parking_area_id)).size !== data.areas.length) invalid();
    for (const area of data.areas) consistent(area, slots.filter(s => s.area_code === area.area_code));
  }

  if (staff && input.gate !== undefined && input.gate !== null) {
    const g = record(input.gate); data.gate = { gate_code: text(g.gate_code), gate_name: text(g.gate_name), gate_status: text(g.gate_status) };
  }
  if (staff && input.ambiguities !== undefined) data.ambiguities = Array.isArray(input.ambiguities) ? input.ambiguities.map(text) : invalid();
  if (staff && input.corrections !== undefined) data.corrections = Array.isArray(input.corrections) ? input.corrections.map(text) : invalid();
  return data;
}

/** Server time plus monotonic time since request start conservatively includes transport delay. */
export function ageParkingMap(data: ParkingMapData, now: number = monotonicNow()): ParkingMapData {
  const requested = data.clientRequestedAt, generated = data.generated_at ? Date.parse(data.generated_at) : NaN;
  const elapsed = requested !== undefined && Number.isFinite(requested) && Number.isFinite(now) && now >= requested ? now - requested : NaN;
  const serverNow = generated + elapsed;
  const changes = new Map<string, { available: number; occupied: number; unknown: number }>();
  const slots = data.slots.map(slot => {
    if (!slot.sensor) return slot;
    const at = slot.sensor.last_seen_at ? Date.parse(slot.sensor.last_seen_at) : NaN, age = serverNow - at;
    if (slot.sensor.online && Number.isFinite(age) && age >= 0 && age <= SENSOR_TTL_MS) return slot;
    const next = { ...slot, sensor: { ...slot.sensor, online: false, state: 'offline' as const, distance_cm: null } };
    if (hasRecordedHold(slot) || slot.status === 'maintenance' || slot.status === 'unknown') return next;
    const d = changes.get(slot.area_code) ?? { available: 0, occupied: 0, unknown: 0 };
    if (slot.status === 'available') d.available--;
    if (slot.status === 'occupied') d.occupied--;
    d.unknown++; changes.set(slot.area_code, d);
    return { ...next, status: 'unknown' as const };
  });
  function adjust(f: ParkingFigures, all = false, area?: string): ParkingFigures {
    const one = changes.get(area ?? ''), deltas = all ? [...changes.values()] : one ? [one] : [];
    const delta = deltas.reduce((a, b) => ({ available: a.available + b.available, occupied: a.occupied + b.occupied, unknown: a.unknown + b.unknown }), { available: 0, occupied: 0, unknown: 0 });
    const occupied = f.occupied + delta.occupied;
    return { ...f, occupied, available: f.available + delta.available, sensor_unavailable: (f.sensor_unavailable ?? 0) + delta.unknown,
      unverified_occupied: Math.max(0, (f.unverified_occupied ?? 0) + delta.occupied), occupancy_percent: f.capacity ? Math.round(occupied / f.capacity * 1000) / 10 : 0 };
  }
  return { ...data, slots, ...(data.areas ? { areas: data.areas.map(a => ({ ...a, ...adjust(a, false, a.area_code) })) } : {}), ...(data.overall ? { overall: adjust(data.overall, true) } : {}) };
}
