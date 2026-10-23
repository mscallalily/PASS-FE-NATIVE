import { api } from '../api/client';

export interface ParkingHistoryItem {
  transaction_id: number;
  ticket_number: string;
  entry_datetime: string;
  exit_datetime: string | null;
  transaction_status: string;
  duration_minutes: number | null;
  area_name: string | null;
  zone_name: string | null;
  zone_code: string | null;
  slot_code: string | null;
  plate_number: string | null;
}

interface ParkingHistoryResponse {
  success?: boolean;
  data: ParkingHistoryItem[];
}

export async function getParkingHistory(
  token: string,
): Promise<ParkingHistoryItem[]> {
  const response = await api<ParkingHistoryResponse>('/parking/history', {
    token,
  });

  if (!Array.isArray(response.data)) {
    throw new Error('The server returned an invalid parking history response.');
  }

  return response.data;
}
