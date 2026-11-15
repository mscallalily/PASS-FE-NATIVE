#!/usr/bin/env node
'use strict';
// Installed package metadata only; does not load application config or use the network.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const req = createRequire(path.join(root, 'package.json'));

function main() {
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const project = read(path.join(root, 'package.json'));
  const lock = read(path.join(root, 'package-lock.json'));
  const installed = name => read(path.join(root, 'node_modules', name, 'package.json'));
  const expo = installed('expo');
  const bundled = read(path.join(root, 'node_modules/expo/bundledNativeModules.json'));
  const semver = req('semver');
  let checks = 0;
  function check(label, run) {
    try { run(); checks++; }
    catch (error) { throw new Error(label + ': ' + error.message); }
  }
  check('reviewed Expo patch', () => assert.equal(expo.version, '58.0.22'));
  for (const section of ['dependencies', 'devDependencies']) {
    check('root lock matches ' + section, () => assert.deepEqual(lock.packages[''][section], project[section]));
    for (const [name, range] of Object.entries(project[section] || {})) {
      check('installed and locked ' + name, () => {
        const version = installed(name).version;
        assert.equal(version, lock.packages['node_modules/' + name]?.version);
        assert.ok(semver.satisfies(version, range), version + ' does not satisfy project range ' + range);
        if (bundled[name]) assert.ok(semver.satisfies(version, bundled[name]), version + ' does not satisfy SDK 58 range ' + bundled[name]);
      });
    }
  }
  check('reviewed React Native patch', () => assert.equal(installed('react-native').version, '0.88.1'));
  check('Jest preset matches React Native', () => assert.equal(installed('@react-native/jest-preset').version, installed('react-native').version));
  check('React renderer matches React', () => assert.equal(installed('react-test-renderer').version, installed('react').version));
  check('React DOM matches React', () => assert.equal(installed('react-dom').version, installed('react').version));
  console.log('PASS SDK 58 CHECK | Expo ' + expo.version + ' | React Native ' + installed('react-native').version + ' | ' + checks + ' checks');
  console.log('Installed runtime and test dependencies match the reviewed lock and bundled SDK ranges.');
  console.log('A09 remains open. Run the Expo tools and Forge checks separately; this check does not certify a phone build.');
}
if (require.main === module) {
  try { main(); }
  catch (error) { console.error('SDK 58 CHECK FAILED: ' + error.message); process.exitCode = 1; }
}
module.exports = { main };
