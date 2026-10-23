import { convertFormDataAsync } from 'expo/src/winter/fetch/convertFormData';

// Runs Expo's real multipart encoder (the code `fetch` uses on SDK 57). The patched React Native FormData
// yields plain [name, value] pairs from entries(), so we feed it exactly that.
jest.mock('expo-file-system', () => ({
  File: function FakeFile(this: any, uri: string) {
    this.uri = uri;
    this.name = uri.split('/').pop();
    this.type = 'image/jpeg';
    this.bytes = async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  },
}));

import { toUploadFile } from '../src/api/upload';

const formWith = (pairs: [string, unknown][]) => ({ entries: () => pairs[Symbol.iterator]() } as unknown as FormData);
const text = (u: Uint8Array) => Buffer.from(u).toString('latin1');

describe('registration file upload encoding (expo/fetch)', () => {
  it('REJECTS the old React Native {uri,name,type} style (this was the bug)', async () => {
    const fd = formWith([
      ['full_name', 'Test User'],
      ['school_id_file', { uri: 'file:///cache/id.jpg', name: 'id.jpg', type: 'image/jpeg' }],
    ]);
    await expect(convertFormDataAsync(fd)).rejects.toThrow('Unsupported FormDataPart implementation');
  });

  it('ACCEPTS expo-file-system File parts and sends filename, type and bytes', async () => {
    const file = toUploadFile({ uri: 'file:///cache/id.jpg', name: 'x', type: 'image/jpeg', size: 4 });
    const fd = formWith([['full_name', 'Test User'], ['school_id_file', file]]);
    const { body, boundary } = await convertFormDataAsync(fd);
    const out = text(body);
    expect(out).toContain('name="full_name"');
    expect(out).toContain('name="school_id_file"; filename="id.jpg"');
    expect(out).toContain('content-type: image/jpeg');
    expect(out).toContain('\xff\xd8\xff\xd9'); // the file bytes were included
    expect(out.trim().endsWith(`--${boundary}--`)).toBe(true);
  });
});
