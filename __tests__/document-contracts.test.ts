import { convertFormDataAsync } from 'expo/src/winter/fetch/convertFormData';
import { vehicleBody } from '../src/services/vehicleRegistration';
import { EMPTY_VISITOR, visitorBody } from '../src/services/visitorRequests';
import { combineReadings, reviewStatus, EMPTY_DETAILS, type Reading, type ReviewInput } from '../src/services/orcrReview';
const NativeFormData = require('react-native/Libraries/Network/FormData').default;
const { installFormDataPatch } = jest.requireActual('expo/src/winter/FormData');
const mockPNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6S0AAAAAASUVORK5CYII=', 'base64');
jest.mock('expo-file-system', () => ({
    File: function (this: any, uri: string) {
        this.name = uri.split('/').pop();
        this.type = 'image/png';
        this.bytes = async () => new Uint8Array(mockPNG);
    }
}));
const previous = global.FormData;
beforeAll(() => {
    global.FormData = installFormDataPatch(NativeFormData);
});
afterAll(() => {
    global.FormData = previous;
});
beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-30T00:00:00Z'));
});
afterEach(() => {
    jest.useRealTimers();
});
const image = (name: string) => ({
    uri: `file:///cache/${name}.png`, name: `${name}.png`, type: 'image/png', size: mockPNG.length
});
const details = {
    ...EMPTY_DETAILS, plate_number: 'ABC1234', make: 'TOYOTA', model: 'VIOS', color: 'WHITE', vehicle_type: 'Sedan', year_model: '2020'
};
const draft = {
    ...EMPTY_VISITOR, first_name: 'Test', last_name: 'Visitor', contact_number: '09123456789', plate_number: 'NATIVE01', vehicle_type_id: '1', purpose: 'School meeting', visiting: 'Registrar', valid_from: '2030-05-02T09:00', valid_until: '2030-05-02T11:00', driver_name: 'Test Driver', driver_license_number: 'N01-23-123456', driver_license_expiry: '2031-01-01'
};
async function encoded(body: FormData, name?: string) {
    const result = await convertFormDataAsync(body);
    if (name && process.env.PASS_TEST_MULTIPART_DIR) {
        const fs = require('node:fs'), path = require('node:path'), folder = process.env.PASS_TEST_MULTIPART_DIR;
        fs.mkdirSync(folder, {
            recursive: true
        });
        fs.writeFileSync(path.join(folder, `multipart-${name}.bin`), result.body);
        fs.writeFileSync(path.join(folder, `multipart-${name}.json`), JSON.stringify({
            boundary: result.boundary, size: result.body.length
        }));
    }
    return Buffer.from(result.body).toString('latin1');
}
describe('native multipart vehicle and visitor contracts', () => {
    it('sends OR and CR as real files and preserves vehicle type', async () => {
        const out = await encoded(vehicleBody(details, image('or'), image('cr')), 'vehicle');
        expect(out).toContain('name="or_document"; filename="or.png"');
        expect(out).toContain('name="cr_document"; filename="cr.png"');
        expect(out).toContain('name="vehicle_type"\r\n\r\nSedan');
        expect(out).not.toContain('name="vehicle_photo"');
        expect(out).not.toContain('approved');
        expect(out).toContain('\x89PNG');
    });
    it('includes optional vehicle photos and encodes resubmission documents', async () => {
        expect(await encoded(vehicleBody(details, image('or'), image('cr'), image('car')))).toContain('name="vehicle_photo"; filename="car.png"');
        await encoded(vehicleBody({
            ...details, plate_number: 'QA1234'
        }, image('or'), image('cr')), 'resubmit');
    });
    it('rejects missing documents, wrong formats, oversized files and invalid values', () => {
        expect(() => vehicleBody(details, null, image('cr'))).toThrow('Official Receipt');
        expect(() => vehicleBody(details, image('or'), null)).toThrow('Certificate');
        expect(() => vehicleBody(details, {
            ...image('or'), type: 'application/pdf'
        }, image('cr'))).toThrow('JPG or PNG');
        expect(() => vehicleBody(details, image('or'), {
            ...image('cr'), size: 6 * 1024 * 1024
        })).toThrow('5 MB');
        expect(() => vehicleBody({
            ...details, year_model: '20'
        }, image('or'), image('cr'))).toThrow('model year');
        expect(() => vehicleBody({
            ...details, color: ''
        }, image('or'), image('cr'))).toThrow('Complete');
    });
    it('sends all actual-driver fields and both visitor photos', async () => {
        const out = await encoded(visitorBody(draft, image('license'), image('car')), 'visitor');
        for (const key of ['driver_name', 'driver_license_number', 'driver_license_expiry', 'passenger_count', 'valid_from', 'valid_until'])
            expect(out).toContain(`name="${key}"`);
        expect(out).toContain('name="driver_license_photo"; filename="license.png"');
        expect(out).toContain('name="vehicle_photo"; filename="car.png"');
        expect(out).not.toContain('documents_reviewed');
    });
    it('reuses an existing visitor without duplicate personal details', async () => {
        const out = await encoded(visitorBody({
            ...draft, visitor_id: '9', first_name: '', last_name: '', contact_number: ''
        }, image('license'), image('car')));
        expect(out).toContain('name="visitor_id"\r\n\r\n9');
        expect(out).not.toContain('name="first_name"');
    });
    it.each(['2030-02-30T09:00', '2030-13-01T09:00', '2030-05-02T25:00', 'invalid'])('rejects invalid arrival %s', valid_from => {
        expect(() => visitorBody({
            ...draft, valid_from
        }, image('license'), image('car'))).toThrow('valid arrival');
    });
    it('blocks expired licenses, missing photos, invalid drivers and excessive visit duration', () => {
        expect(() => visitorBody({
            ...draft, driver_license_expiry: '2029-01-01'
        }, image('license'), image('car'))).toThrow('valid through');
        expect(() => visitorBody({
            ...draft, driver_license_expiry: '2031-02-30'
        }, image('license'), image('car'))).toThrow('valid through');
        expect(() => visitorBody(draft, null, image('car'))).toThrow('license photo');
        expect(() => visitorBody(draft, image('license'), null)).toThrow('visible plate photo');
        expect(() => visitorBody({
            ...draft, driver_name: 'Onlyname'
        }, image('license'), image('car'))).toThrow('full name');
        expect(() => visitorBody({
            ...draft, passenger_count: '-1'
        }, image('license'), image('car'))).toThrow('Passenger count');
        expect(() => visitorBody({
            ...draft, valid_until: '2030-05-10T09:00'
        }, image('license'), image('car'))).toThrow('up to 7 days');
    });
});
const reading = (fields: Reading['fields'], flags: Reading['flags'] = {}): Reading => ({
    status: 'ok', fields, flags
});
function review(or: Reading | null, cr: Reading | null, edits: ReviewInput['edits'] = {}, checked: ReviewInput['checked'] = {}) {
    const combined = combineReadings(or, cr);
    return reviewStatus({
        or, cr, hasOr: !!or, hasCr: !!cr, combined, details: {
            ...Object.fromEntries(Object.entries(combined).map(([k, v]) => [k, v.value])), ...edits
        } as any, edits, checked
    });
}
describe('OR/CR agreement', () => {
    it('autofills matching readings', () => {
        expect(review(reading(details), reading(details)).tone).toBe('success');
    });
    it('does not allow typed details to override different plates', () => {
        expect(review(reading(details), reading({
            ...details, plate_number: 'XYZ9999'
        }), {
            plate_number: 'ABC1234'
        }).plateConflict).toBe(true);
    });
    it('requires checking uncertain values again when readings change', () => {
        const or = reading({
            plate_number: details.plate_number
        }), cr = reading(details, {
            color: 'low_confidence'
        });
        expect(review(or, cr).toCheck).toEqual(['color']);
        expect(review(or, cr, {}, {
            color: 'WHITE'
        }).tone).toBe('success');
        expect(review(or, reading({
            ...details, color: 'RED'
        }, {
            color: 'low_confidence'
        }), {}, {
            color: 'WHITE'
        }).toCheck).toEqual(['color']);
    });
    it('requires retaking wrong or unreadable documents', () => {
        expect(review({
            ...reading(details), status: 'retake'
        }, reading(details)).tone).toBe('problem');
    });
});
