import { File } from 'expo-file-system';
import type { PickedFile } from '../components/ui';

/**
 * Turn a picked photo/PDF into something FormData can send.
 *
 * Expo SDK 53+ replaces the global `fetch` with `expo/fetch`, which does NOT understand React Native's
 * classic `{ uri, name, type }` file objects (it throws "Unsupported FormDataPart implementation").
 * It does accept `File` objects from `expo-file-system`, which read the bytes from the local file.
 */
export function toUploadFile(picked: PickedFile): File {
  return new File(picked.uri);
}
