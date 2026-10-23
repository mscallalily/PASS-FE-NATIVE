import { api } from '../api/client';
export interface AccessEvent {
  event_id: number; event_datetime: string; plate_number: string | null;
  direction: string; access_method: string; auth_result: string;
  denial_reason: string | null; gate_name: string | null; party_name: string | null;
}
export async function getAccessRecords(token: string): Promise<AccessEvent[]> {
  const response = await api<{ data: AccessEvent[] }>('/access-events', { token });
  if (!Array.isArray(response.data)) throw new Error('Invalid access events response.');
  return response.data;
}
