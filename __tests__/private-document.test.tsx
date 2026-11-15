import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { apiBlob } from '../src/api/client';
import PrivateDocumentPreview from '../src/components/PrivateDocumentPreview';
jest.mock('../src/api/client', () => ({
    apiBlob: jest.fn()
}));
jest.mock('../src/context/AuthContext', () => ({
    useAuth: () => ({
        token: 'authorized-token'
    })
}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-document-picker', () => ({}));
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({
        top: 0, left: 0, right: 0, bottom: 0
    })
}));
const previousReader = global.FileReader;
let mockStall = false;
beforeEach(() => {
    jest.clearAllMocks();
    mockStall = false;
    global.FileReader = class {
        result = 'data:image/png;base64,iVBORw==';
        onload: any;
        onerror: any;
        onabort: any;
        readAsDataURL() {
            if (!mockStall)
                Promise.resolve().then(() => this.onload?.());
        }
        abort() {
            this.onabort?.();
        }
    } as any;
    (apiBlob as jest.Mock).mockResolvedValue(new Blob(['synthetic'], {
        type: 'image/png'
    }));
});
afterEach(() => {
    global.FileReader = previousReader;
    jest.useRealTimers();
});
describe('private evidence preview', () => {
    it('loads on demand and confirms inspection only after image rendering', async () => {
        const inspected = jest.fn();
        await render(<PrivateDocumentPreview path="/licenses/1/file" label="license" onInspected={inspected}/>);
        expect(apiBlob).not.toHaveBeenCalled();
        await fireEvent.press(screen.getByLabelText('Inspect license'));
        const image = await screen.findByLabelText('Private license');
        expect(inspected).not.toHaveBeenCalledWith(true);
        await fireEvent(image, 'load');
        expect(inspected).toHaveBeenLastCalledWith(true);
        expect(apiBlob).toHaveBeenCalledWith('/licenses/1/file', expect.objectContaining({
            token: 'authorized-token', signal: expect.anything()
        }));
        await fireEvent.press(screen.getByLabelText('Close license'));
        expect(inspected).toHaveBeenLastCalledWith(false);
    });
    it('does not mark unseen PDF pages reviewed', async () => {
        (apiBlob as jest.Mock).mockResolvedValue(new Blob(['pdf'], {
            type: 'application/pdf'
        }));
        const inspected = jest.fn();
        await render(<PrivateDocumentPreview path="/licenses/1/file" label="license" onInspected={inspected}/>);
        await fireEvent.press(screen.getByLabelText('Inspect license'));
        expect(await screen.findByText(/Use the authorized web review/)).toBeTruthy();
        expect(inspected).not.toHaveBeenCalledWith(true);
    });
    it('hides stale images after changing the document', async () => {
        const inspected = jest.fn(), ui = await render(<PrivateDocumentPreview path="/licenses/1/file" label="license" onInspected={inspected}/>);
        await fireEvent.press(screen.getByLabelText('Inspect license'));
        const oldLoad = (await screen.findByLabelText('Private license')).props.onLoad;
        (apiBlob as jest.Mock).mockImplementation(() => new Promise(() => {
        }));
        await ui.rerender(<PrivateDocumentPreview path="/licenses/2/file" label="license" onInspected={inspected}/>);
        expect(screen.queryByLabelText('Private license')).toBeNull();
        await act(async () => {
            oldLoad();
        });
        expect(inspected).not.toHaveBeenCalledWith(true);
    });
    it('bounds a stalled FileReader', async () => {
        jest.useFakeTimers();
        mockStall = true;
        const inspected = jest.fn();
        await render(<PrivateDocumentPreview path="/licenses/1/file" label="license" onInspected={inspected}/>);
        await fireEvent.press(screen.getByLabelText('Inspect license'));
        await act(async () => {
            await jest.advanceTimersByTimeAsync(10001);
        });
        expect(screen.getByText(/image preview timed out/)).toBeTruthy();
        expect(inspected).not.toHaveBeenCalledWith(true);
    });
    it('shows access failures without displaying evidence', async () => {
        (apiBlob as jest.Mock).mockRejectedValue(new Error('Only the document owner or authorized staff may view this file.'));
        await render(<PrivateDocumentPreview path="/licenses/99/file" label="license"/>);
        await fireEvent.press(screen.getByLabelText('Inspect license'));
        expect(await screen.findByText(/Only the document owner/)).toBeTruthy();
        expect(screen.queryByLabelText('Private license')).toBeNull();
    });
});
