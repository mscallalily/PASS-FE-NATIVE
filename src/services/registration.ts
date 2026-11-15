/** Contracts shared by PASS web registration and the native client.
 * The server, never this client, decides whether OCR evidence qualifies for activation.
 */
export type RegistrationCategory = 'college' | 'employee' | 'shs';
export type IdentityKey = 'first_name' | 'last_name' | 'middle_initial' | 'suffix' | 'user_code';

export interface RegistrationValues {
  category: RegistrationCategory;
  department: string;
  year_level: string;
  section: string;
  contact: string;
  first_name: string;
  last_name: string;
  middle_initial: string;
  suffix: string;
  user_code: string;
  email: string;
  password: string;
  password_confirmation: string;
  agree: boolean;
  request_manual_review: boolean;
}

export const INITIAL_REGISTRATION: RegistrationValues = {
  category: 'college', department: '', year_level: '', section: '', contact: '', first_name: '', last_name: '',
  middle_initial: '', suffix: '', user_code: '', email: '', password: '',
  password_confirmation: '', agree: false, request_manual_review: false,
};

export type IdentityStatus = 'matched' | 'manual_review' | 'unavailable' | 'needs_correction';
export interface IdCheck {
  status: IdentityStatus;
  receipt: string;
  fields: Partial<Pick<RegistrationValues, IdentityKey>>;
  field_confidence: Record<string, number>;
  checks: Record<string, { result: string; detail: string; advisory?: boolean }>;
  reasons: string[];
  current_year: number;
  note: string;
}

export interface Department {
  department_id: number;
  department_code: string;
  department_name: string;
}

export const IDENTITY_KEYS: IdentityKey[] = ['first_name', 'last_name', 'middle_initial', 'suffix', 'user_code'];
export const ID_LABELS: Record<IdentityStatus, string> = {
  matched: 'Details matched', manual_review: 'Staff review needed',
  unavailable: 'Automatic reader unavailable', needs_correction: 'Needs correction',
};
export const CHECK_LABELS: Record<string, string> = {
  id_format: 'ID format', image_quality: 'Image quality', school: 'DYCI school text',
  registration_category: 'Senior High School text',
  user_code: 'ID number', first_name: 'First name', last_name: 'Surname',
  middle_initial: 'Middle initial', suffix: 'Suffix',
};

export function manilaYear(): number {
  return Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', year: 'numeric' }).format(new Date()));
}

export function institutionIdError(category: RegistrationCategory, value: string, currentYear: number): string {
  if (category === 'shs') {
    return /^\d{12}$/.test(value.replace(/[\s-]/g, '')) ? '' : 'Enter exactly 12 digits for your Learner Reference Number (LRN), keeping any leading zero.';
  }
  const normalized = value.replace(/[\s-]/g, '');
  const length = category === 'employee' ? 7 : 9;
  if (!new RegExp(`^\\d{${length}}$`).test(normalized)) return `Enter exactly ${length} digits, keeping any leading zero.`;
  const year = category === 'employee' ? 2000 + Number(normalized.slice(1, 3)) : Number(normalized.slice(0, 4));
  return year < 1000 || year > currentYear ? `The ID year cannot be later than ${currentYear}.` : '';
}

export function validateRegistrationStep(
  step: number, form: RegistrationValues, year: number, hasFile: boolean, check: IdCheck | null,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (step === 0) {
    if (!form.department.trim()) errors.department = 'Enter your department or office.';
    if (!form.contact.trim()) errors.contact = 'Contact number is required.';
    if (form.category === 'shs') {
      if (!['11', '12'].includes(form.year_level)) errors.year_level = 'Select Grade 11 or Grade 12.';
      if (!form.section.trim()) errors.section = 'Enter your SHS section.';
      else if (form.section.length > 60 || /[<>\x00-\x1f\x7f]/.test(form.section)) errors.section = 'Enter a valid section (up to 60 characters).';
    }
  }
  if (step === 1) {
    if (!hasFile) errors.school_id_file = 'Upload the front of your institutional ID.';
    if (!form.first_name.trim()) errors.first_name = 'First name is required.';
    if (!form.last_name.trim()) errors.last_name = 'Surname is required.';
    if (form.middle_initial && !/^\p{L}\.?$/u.test(form.middle_initial.trim())) errors.middle_initial = 'Enter one initial, optionally followed by a period.';
    if (form.suffix && !/^(?:Jr\.?|Sr\.?|I|II|III|IV|V|VI|VII|VIII|IX|X)$/i.test(form.suffix)) errors.suffix = 'Choose a supported suffix.';
    const idError = institutionIdError(form.category, form.user_code, year);
    if (idError) errors.user_code = idError;
    if (!check?.receipt) errors.id_check_receipt = 'Read your ID using the server check first.';
  }
  if (step === 2) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address.';
    if (form.password.length < 8) errors.password = 'Password must be at least eight characters.';
    if (form.password_confirmation !== form.password) errors.password_confirmation = 'Passwords do not match.';
  }
  return errors;
}
