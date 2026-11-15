import type { PickedFile } from '../components/ui';
import { toUploadFile } from '../api/upload';
import { campusToday } from './rfid';
import { photoProblem } from './vehicleRegistration';
export const EMPTY_VISITOR = {
    visitor_id: '', first_name: '', last_name: '', contact_number: '', plate_number: '', vehicle_type_id: '', purpose: '', visiting: '', valid_from: '', valid_until: '', driver_name: '', driver_license_number: '', driver_license_expiry: '', passenger_count: '0'
};
export type VisitorDraft = typeof EMPTY_VISITOR;
function localStamp(value: string): number {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
        return NaN;
    const date = new Date(value + ':00+08:00');
    if (!Number.isFinite(date.getTime()))
        return NaN;
    return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 16) === value ? date.getTime() : NaN;
}
export function visitorBody(draft: VisitorDraft, license: PickedFile | null, photo: PickedFile | null, maxDays = 7): FormData {
    const required: (keyof VisitorDraft)[] = ['plate_number', 'vehicle_type_id', 'purpose', 'visiting', 'valid_from', 'valid_until', 'driver_name', 'driver_license_number', 'driver_license_expiry', 'passenger_count'];
    if (!draft.visitor_id)
        required.push('first_name', 'last_name', 'contact_number');
    if (required.some(key => !draft[key].trim()))
        throw new Error('Complete the visitor, vehicle, visit and actual driver details.');
    if (!/^\S+(\s+\S+)+$/u.test(draft.driver_name.trim()))
        throw new Error('Enter the actual driver’s full name.');
    if (!/^[A-Za-z0-9 -]{6,30}$/.test(draft.driver_license_number.trim()))
        throw new Error('Enter the driver’s license number as printed.');
    if (!/^\d+$/.test(draft.passenger_count) || Number(draft.passenger_count) > 99)
        throw new Error('Passenger count must be between 0 and 99, excluding the driver.');
    const from = localStamp(draft.valid_from), until = localStamp(draft.valid_until);
    if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from)
        throw new Error('Enter valid arrival and departure times in YYYY-MM-DDTHH:MM format; departure must be later.');
    if (draft.valid_from.slice(0, 10) <= campusToday())
        throw new Error('Same-day visits are not allowed. Choose tomorrow or later in Philippine time.');
    if (!Number.isFinite(maxDays) || maxDays <= 0)
        throw new Error('The visitor scheduling limit could not be loaded. Refresh and try again.');
    if (until - from > maxDays * 86400000)
        throw new Error(`A visitor request can cover up to ${maxDays} days.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.driver_license_expiry) || !Number.isFinite(localStamp(draft.driver_license_expiry + 'T00:00')) || draft.driver_license_expiry < draft.valid_until.slice(0, 10))
        throw new Error('The license must be valid through the end of the visit.');
    const issue = photoProblem(license, 'driver’s license photo') || photoProblem(photo, 'vehicle and visible plate photo');
    if (issue)
        throw new Error(issue);
    const body = new FormData();
    for (const [key, value] of Object.entries(draft))
        if (value.trim())
            body.append(key, ['plate_number', 'driver_license_number'].includes(key) ? value.trim().toUpperCase() : value.trim());
    body.append('driver_license_photo', toUploadFile(license!) as unknown as Blob, license!.name);
    body.append('vehicle_photo', toUploadFile(photo!) as unknown as Blob, photo!.name);
    return body;
}
