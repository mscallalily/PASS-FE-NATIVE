import type { PickedFile } from '../components/ui';
import { toUploadFile } from '../api/upload';
import { REQUIRED_DETAILS, type VehicleDetails } from './orcrReview';
export function photoProblem(file: PickedFile | null, label: string): string | null {
    if (!file)
        return `Upload the ${label}.`;
    if (!['image/jpeg', 'image/png'].includes(file.type))
        return `${label} must be a JPG or PNG photo.`;
    if (file.size > 5 * 1024 * 1024)
        return `${label} must be 5 MB or smaller.`;
    return null;
}
export function vehicleBody(details: VehicleDetails, or: PickedFile | null, cr: PickedFile | null, photo: PickedFile | null = null): FormData {
    const issue = photoProblem(or, 'Official Receipt (OR)') || photoProblem(cr, 'Certificate of Registration (CR)') || (photo && photoProblem(photo, 'vehicle photo'));
    if (issue)
        throw new Error(issue);
    if (REQUIRED_DETAILS.some(key => !details[key].trim()))
        throw new Error('Complete the plate, vehicle type, make, model and color shown on your OR/CR.');
    if (details.make.trim().length > 100 || details.model.trim().length > 100 || details.color.trim().length > 50 || details.plate_number.trim().length > 20)
        throw new Error('The vehicle details exceed the allowed length. Check the printed OR/CR details.');
    const year = Number(new Intl.DateTimeFormat('en', {
        year: 'numeric', timeZone: 'Asia/Manila'
    }).format(new Date()));
    if (details.year_model && (!/^\d{4}$/.test(details.year_model) || Number(details.year_model) < 1900 || Number(details.year_model) > year + 1))
        throw new Error('Enter a valid vehicle model year.');
    const body = new FormData();
    for (const [key, value] of Object.entries(details))
        if (value.trim())
            body.append(key, key === 'vehicle_type' ? value.trim() : value.trim().toUpperCase());
    body.append('or_document', toUploadFile(or!) as unknown as Blob, or!.name);
    body.append('cr_document', toUploadFile(cr!) as unknown as Blob, cr!.name);
    if (photo)
        body.append('vehicle_photo', toUploadFile(photo) as unknown as Blob, photo.name);
    return body;
}
