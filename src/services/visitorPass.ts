import { api } from '../api/client';

/** The web and guest mobile apps encode only the server-issued pass_code in QR images. */
export function visitorPassCode(value: string): string {
  const code = value.trim();
  if (!code || code.length > 64 || !/^[a-zA-Z0-9-]+$/.test(code)) {
    throw new Error('This is not a valid PASS QR pass code. Scan a PASS visitor QR or enter its pass code.');
  }
  return code;
}

export interface VerifiedVisitorPass {
  qr_pass_id: number;
  pass_code: string;
  status: string;
  stored_status: string;
  visitor_name: string | null;
  plate_number: string | null;
  vehicle_type: string | null;
  valid_from: string | null;
  valid_until: string | null;
  entry_allowed: boolean;
  entry_problem: string | null;
  inside: { transaction_id: number; slot_code: string | null; entry_datetime: string } | null;
}

/** Scanning and manual entry must always use the same authenticated Laravel policy. */
export async function verifyVisitorPass(token: string, rawCode: string) {
  const code = visitorPassCode(rawCode);
  return api<VerifiedVisitorPass>(`/visitors/passes/lookup?code=${encodeURIComponent(code)}`, { token });
}
