import { api } from '../src/api/client';
import { verifyVisitorPass, visitorPassCode } from '../src/services/visitorPass';

jest.mock('../src/api/client', () => ({ api: jest.fn() }));

describe('Visitor QR camera and manual code verification', () => {
  beforeEach(() => jest.clearAllMocks());

  it('accepts the same server-issued UUID encoded in both the web and mobile QR', () => {
    expect(visitorPassCode('  45109880-5ced-457e-9982-35f4b5567635\n')).toBe('45109880-5ced-457e-9982-35f4b5567635');
  });

  it('rejects arbitrary QR URLs and JSON before contacting PASS', async () => {
    await expect(verifyVisitorPass('token', 'https://untrusted.example/visitor')).rejects.toThrow('not a valid PASS');
    await expect(verifyVisitorPass('token', '{"pass_code":"fake"}')).rejects.toThrow('not a valid PASS');
    expect(api).not.toHaveBeenCalled();
  });

  it('looks up a scanned or typed pass against the same authenticated endpoint', async () => {
    const response = { pass_code: '45109880-5ced-457e-9982-35f4b5567635', status: 'active', entry_allowed: true };
    (api as jest.Mock).mockResolvedValue(response);
    const code = '45109880-5ced-457e-9982-35f4b5567635';
    await expect(verifyVisitorPass('server-token', code)).resolves.toBe(response);
    await expect(verifyVisitorPass('server-token', ` ${code} `)).resolves.toBe(response);
    expect(api).toHaveBeenNthCalledWith(1, `/visitors/passes/lookup?code=${code}`, { token: 'server-token' });
    expect(api).toHaveBeenNthCalledWith(2, `/visitors/passes/lookup?code=${code}`, { token: 'server-token' });
  });

  it('never fabricates an approval when Laravel rejects an expired pass', async () => {
    (api as jest.Mock).mockResolvedValue({ status: 'expired', entry_allowed: false, entry_problem: 'Pass expired.' });
    await expect(verifyVisitorPass('token', '45109880-5ced-457e-9982-35f4b5567635'))
      .resolves.toMatchObject({ entry_allowed: false, entry_problem: 'Pass expired.' });
  });
});
