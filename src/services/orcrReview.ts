/**
 * OR/CR review for vehicle registration: the two readings are combined field
 * by field, then one review status is decided. OCR certainty ("check this
 * value") is kept apart from real problems (documents that disagree, a
 * missing detail, a document that must be retaken).
 *
 * Pure functions, tested by __tests__/document-contracts.test.ts.
 */
export type VehicleDetails = {
    plate_number: string;
    vehicle_type: string;
    year_model: string;
    make: string;
    model: string;
    color: string;
};
export type DetailKey = keyof VehicleDetails;
export const EMPTY_DETAILS: VehicleDetails = {
    plate_number: '', vehicle_type: '', year_model: '', make: '', model: '', color: ''
};
/** Details the existing registration rules require (vehicle type decides the parking lot). */
export const REQUIRED_DETAILS: DetailKey[] = ['plate_number', 'make', 'model', 'color', 'vehicle_type'];
export const DOCUMENT_DETAILS: DetailKey[] = ['plate_number', 'make', 'model', 'color', 'year_model', 'vehicle_type'];
export const DETAIL_LABEL: Record<DetailKey, string> = {
    plate_number: 'Plate number', make: 'Make', model: 'Model / series', color: 'Color', year_model: 'Year model', vehicle_type: 'Vehicle type',
};
/** What was read from one OR/CR photo ("reading" until the server answers). */
export type Reading = {
    status: string;
    fields: Record<string, string | number>;
    flags: Record<string, string>;
    notes?: Record<string, string>;
};
/**
 * One detail combined from both documents:
 *  confirmed  read on both documents and the values agree
 *  read       read reliably on one document
 *  uncertain  read on one document only, with limited OCR certainty
 *  conflict   the two documents show different values (never chosen silently)
 *  missing    not read on either document
 */
export type DetailState = 'confirmed' | 'read' | 'uncertain' | 'conflict' | 'missing';
export type CombinedDetail = {
    value: string;
    state: DetailState;
    sources: ('OR' | 'CR')[];
    or: string;
    cr: string;
    notes: string[];
};
const alnum = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
const words = (value: string) => value.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
// Look-alike characters in series codes, as the server compares them ("FU1SOMFZ" = "FU150MFZ").
const codeKey = (value: string) => alnum(value).replace(/[OQD]/g, '0').replace(/S/g, '5').replace(/[IL]/g, '1').replace(/B/g, '8').replace(/Z/g, '2').replace(/G/g, '6');
/** At most one inserted, deleted or replaced character. */
function oneEdit(a: string, b: string) {
    if (Math.abs(a.length - b.length) > 1)
        return false;
    let i = 0;
    while (i < a.length && a[i] === b[i])
        i++;
    return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i);
}
/** Same value apart from harmless OCR differences (spacing, punctuation, an extra word, look-alike code characters). */
export function sameDetail(key: DetailKey, a: string, b: string) {
    if (alnum(a) === alnum(b))
        return true;
    if (key === 'plate_number' || key === 'year_model')
        return false;
    const [wa, wb] = [words(a), words(b)];
    if (wa.every(w => wb.includes(w)) || wb.every(w => wa.includes(w)))
        return true;
    // A brand with one misread letter ("UZUKI" / "SUZUKI") is the same make, as on the server.
    if (key === 'make') {
        const near = (x: string, y: string) => x === y || (Math.min(x.length, y.length) >= 5 && oneEdit(x, y));
        return wa.every(w => wb.some(v => near(w, v))) || wb.every(w => wa.some(v => near(w, v)));
    }
    if (key !== 'model')
        return false;
    const [ka, kb] = [codeKey(a), codeKey(b)];
    return ka === kb || (kb.length >= 3 && ka.includes(kb)) || (ka.length >= 3 && kb.includes(ka));
}
export function combineDetail(key: DetailKey, or: Reading | null, cr: Reading | null): CombinedDetail {
    const docs = [['OR', or], ['CR', cr]] as const;
    const read = docs.flatMap(([name, reading]) => {
        const value = reading?.fields[key];
        return value !== undefined && String(value).trim() ? [{
                name, value: String(value), sure: reading!.flags[key] !== 'low_confidence'
            }] : [];
    });
    const notes = docs.flatMap(([, reading]) => reading?.notes?.[key] ? [reading.notes[key]] : []);
    const byName = (name: 'OR' | 'CR') => read.find(r => r.name === name)?.value ?? '';
    const base = {
        sources: read.map(r => r.name), or: byName('OR'), cr: byName('CR'), notes
    };
    if (!read.length)
        return {
            ...base, value: '', state: 'missing'
        };
    if (read.length === 2 && !sameDetail(key, read[0].value, read[1].value))
        return {
            ...base, value: '', state: 'conflict'
        };
    // Show the most certain reading; the CR is the fuller source for the description.
    const best = read.find(r => r.sure && r.name === 'CR') ?? read.find(r => r.sure) ?? read.find(r => r.name === 'CR') ?? read[0];
    return {
        ...base, value: best.value, state: read.length === 2 ? 'confirmed' : best.sure ? 'read' : 'uncertain'
    };
}
export function combineReadings(or: Reading | null, cr: Reading | null): Record<DetailKey, CombinedDetail> {
    return Object.fromEntries(DOCUMENT_DETAILS.map(key => [key, combineDetail(key, or, cr)])) as Record<DetailKey, CombinedDetail>;
}
export type ReviewInput = {
    or: Reading | null;
    cr: Reading | null;
    /** Whether an OR / CR photo is selected. */
    hasOr: boolean;
    hasCr: boolean;
    combined: Record<DetailKey, CombinedDetail>;
    /** The values shown and submitted. */
    details: VehicleDetails;
    /** Values the owner typed (corrections). */
    edits: Partial<VehicleDetails>;
    /** Uncertain values the owner confirmed against the document, by value (a new reading needs a new check). */
    checked: Partial<VehicleDetails>;
};
export type ReviewTone = 'reading' | 'problem' | 'check' | 'success';
export type ReviewStatus = {
    tone: ReviewTone;
    /** Short label for the status row. */
    title: string;
    /** What happened and what to do. */
    message: string;
    plateConflict: boolean;
    plateTaken: boolean;
    documentProblems: ('OR' | 'CR')[];
    conflicts: DetailKey[];
    missing: DetailKey[];
    /** Read with limited OCR certainty and not yet checked or corrected by the owner. */
    toCheck: DetailKey[];
    /** Server explanations, only for details that are missing. */
    missingNotes: string[];
    /** Where the plate and description came from (never "both" unless both documents agree). */
    basis: string[];
};
const list = (keys: DetailKey[]) => {
    const names = keys.map(key => DETAIL_LABEL[key].toLowerCase());
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? '';
};
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** Where a shown value came from, so the owner knows what to compare it with. */
export function sourceOf(key: DetailKey, input: Pick<ReviewInput, 'combined' | 'edits' | 'checked' | 'details'>): string {
    if (input.edits[key] !== undefined)
        return 'entered by you';
    const d = input.combined[key];
    if (d.state === 'confirmed')
        return 'OR and CR agree';
    if (!d.sources.length)
        return '';
    if (d.state !== 'uncertain')
        return `from the ${d.sources[0]}`;
    return input.checked[key] === input.details[key] ? `from the ${d.sources[0]}, checked by you` : `from the ${d.sources[0]}, check this value`;
}
export function reviewStatus(input: ReviewInput): ReviewStatus {
    const { or, cr, hasOr, hasCr, combined, details, edits, checked } = input;
    const unedited = (key: DetailKey) => edits[key] === undefined;
    const plateConflict = combined.plate_number.state === 'conflict';
    const plateTaken = unedited('plate_number') && [or, cr].some(r => r?.flags.plate_number === 'conflict');
    const documentProblems = ([['OR', or], ['CR', cr]] as const).filter(([, r]) => r && !['reading', 'ok', 'partial'].includes(r.status)).map(([name]) => name);
    const conflicts = DOCUMENT_DETAILS.filter(key => key !== 'plate_number' && unedited(key) && combined[key].state === 'conflict');
    const missing = REQUIRED_DETAILS.filter(key => !details[key].trim() && !conflicts.includes(key));
    const toCheck = REQUIRED_DETAILS.filter(key => unedited(key) && combined[key].state === 'uncertain' && checked[key] !== details[key]);
    const missingNotes = Array.from(new Set(missing.filter(key => unedited(key)).flatMap(key => combined[key].notes)));
    const reading = (hasOr && (!or || or.status === 'reading')) || (hasCr && (!cr || cr.status === 'reading'));
    // Basis: what each key detail rests on.
    const basis: string[] = [];
    const plate = combined.plate_number;
    if (!unedited('plate_number'))
        basis.push('Plate number entered by you.');
    else if (plate.state === 'confirmed')
        basis.push('Plate number matches on the OR and CR.');
    else if (plate.sources.length === 1 && plate.state !== 'conflict')
        basis.push(`Plate number read from the ${plate.sources[0]} only.`);
    const description = (['make', 'model'] as const).filter(key => details[key].trim());
    const bySource = new Map<string, DetailKey[]>();
    for (const key of description) {
        const d = combined[key];
        const where = !unedited(key) ? 'entered by you' : d.state === 'confirmed' ? 'match on the OR and CR' : d.sources.length ? `read from the ${d.sources[0]}` : '';
        if (where)
            bySource.set(where, [...(bySource.get(where) ?? []), key]);
    }
    for (const [where, keys] of bySource)
        basis.push(`${capital(list(keys))} ${where}.`);
    const base = {
        plateConflict, plateTaken, documentProblems, conflicts, missing, toCheck, missingNotes, basis
    };
    if (reading)
        return {
            ...base, tone: 'reading', title: 'Reading', message: 'Reading your documents…'
        };
    if (documentProblems.length)
        return {
            ...base, tone: 'problem', title: 'Retake needed', message: `Retake or re-upload the ${documentProblems.join(' and ')} (see the message above).`
        };
    if (!hasOr || !hasCr)
        return {
            ...base, tone: 'problem', title: 'Document missing', message: `Upload the ${!hasOr ? 'OR' : 'CR'} to continue.`
        };
    if (plateConflict)
        return {
            ...base, tone: 'problem', title: 'Plate mismatch', message: `The OR shows plate ${plate.or} but the CR shows ${plate.cr}. Upload the OR and CR of the same vehicle, or retake the photo that was misread.`
        };
    if (plateTaken)
        return {
            ...base, tone: 'problem', title: 'Plate already registered', message: 'This plate number is already registered to another account. Correct it if it was misread, or contact PASS staff.'
        };
    if (conflicts.length) {
        const shown = conflicts.map(key => `${DETAIL_LABEL[key].toLowerCase()} (OR: ${combined[key].or} · CR: ${combined[key].cr})`).join(', ');
        return {
            ...base, tone: 'problem', title: 'Mismatch', message: `The OR and CR show different ${shown}. Enter the value printed on your documents below, or retake the photo that was misread.`
        };
    }
    if (missing.length)
        return {
            ...base, tone: 'problem', title: 'Missing detail', message: `${capital(list(missing))} could not be read on the OR or CR. Retake the photo or enter ${missing.length > 1 ? 'them' : 'it'} below.`
        };
    if (toCheck.length) {
        const from = Array.from(new Set(toCheck.flatMap(key => combined[key].sources))).join(' and ');
        return {
            ...base, tone: 'check', title: 'Check needed', message: `${capital(list(toCheck))} ${toCheck.length > 1 ? 'were' : 'was'} read from the ${from} with limited certainty. Compare ${toCheck.length > 1 ? 'them' : 'it'} with your ${from}, then confirm or correct ${toCheck.length > 1 ? 'them' : 'it'}.`
        };
    }
    return {
        ...base, tone: 'success', title: 'OR/CR Match Successful', message: 'The required details were read and no document disagrees. Final approval happens when you register.'
    };
}
