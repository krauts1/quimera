import assert from 'node:assert/strict';
import test from 'node:test';

import { formatAxieSkinLabel } from '../dist/creator-api.js';

test('creator exposes authored skin-family names instead of generic numeric labels', () => {
  assert.equal(formatAxieSkinLabel(0), 'Standard');
  assert.equal(formatAxieSkinLabel(1), 'Mystic');
  assert.equal(formatAxieSkinLabel(3), 'Japanese');
  assert.equal(formatAxieSkinLabel(4), 'Xmas I');
  assert.equal(formatAxieSkinLabel(6), 'Summer S06');
  assert.equal(formatAxieSkinLabel(11), 'Summer S11');
  assert.equal(formatAxieSkinLabel(12), 'Nightmare');
  assert.equal(formatAxieSkinLabel(13), 'Nightmare Shiny');
  assert.equal(formatAxieSkinLabel(22), 'Skin S22');
});
