import test from 'node:test';
import assert from 'node:assert/strict';
import { filterThemes } from '../web/market.js';

const themes = [
  { name: 'cat', label: 'Cat', description: 'Cats at their desks', keywords: ['animals', 'cozy'] },
  { name: 'pirates', label: 'Pirates', description: 'Ship crew', keywords: ['sea'] },
];

test('filterThemes_matches_keywords_description_and_name_case_insensitively', () => {
  assert.deepEqual(filterThemes(themes, 'COZY').map((t) => t.name), ['cat']);
  assert.deepEqual(filterThemes(themes, 'crew').map((t) => t.name), ['pirates']);
  assert.deepEqual(filterThemes(themes, 'pir').map((t) => t.name), ['pirates']);
  assert.deepEqual(filterThemes(themes, 'cats sea'), []);
});

test('filterThemes_keeps_everything_for_an_empty_query', () => {
  assert.equal(filterThemes(themes, '  ').length, 2);
  assert.equal(filterThemes(themes, undefined).length, 2);
});
