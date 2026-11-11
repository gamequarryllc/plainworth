import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FEEDBACK_EMAIL, feedbackMailto, feedbackSignature } from '../feedback';

test('signature names the app version, build, device and system', () => {
  assert.equal(
    feedbackSignature({ version: '1.2.0', build: '14', device: 'iPhone 15 Pro', system: 'iOS 18.1' }),
    'Plainworth 1.2.0 (14) · iPhone 15 Pro · iOS 18.1',
  );
});

test('signature leaves out what is not known', () => {
  assert.equal(feedbackSignature({ version: '1.2.0' }), 'Plainworth 1.2.0');
  assert.equal(feedbackSignature({}), 'Plainworth');
  assert.equal(feedbackSignature({ version: '1.2.0', build: null, system: 'iOS 18.1' }), 'Plainworth 1.2.0 · iOS 18.1');
});

test('mailto goes to the support address with subject and version filled in', () => {
  const url = feedbackMailto({ version: '1.2.0', build: '14', device: 'iPhone 15 Pro', system: 'iOS 18.1' });
  assert.ok(url.startsWith(`mailto:${FEEDBACK_EMAIL}?`));
  const params = new URLSearchParams(url.slice(url.indexOf('?') + 1).replace(/\+/g, '%2B'));
  assert.equal(params.get('subject'), 'Plainworth feedback');
  assert.equal(params.get('body'), '\n\n\nPlainworth 1.2.0 (14) · iPhone 15 Pro · iOS 18.1');
  assert.ok(!url.includes(' '));
});
