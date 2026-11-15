// Test-only stub: every icon renders nothing (the real package ships ESM .mjs that Jest can't parse).
module.exports = new Proxy({}, { get: (_t, name) => (name === '__esModule' ? false : () => null) });
