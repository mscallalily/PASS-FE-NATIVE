import { api } from '../api/client';

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
  zones?: ParkingZone[];
}

interface ParkingAvailabilityResponse {
  areas: ParkingArea[];
  overall?: { capacity: number; available: number; occupied: number };
}

export async function getParkingAvailability(token: string) {
  const response = await api<ParkingAvailabilityResponse>(
    '/parking/availability',
    { token },
  );

  if (!Array.isArray(response.areas)) {
    throw new Error('The server returned an invalid parking availability response.');
  }

  return response.areas;
}
