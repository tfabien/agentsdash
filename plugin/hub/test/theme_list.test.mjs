import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeCards, filterCards, tagCounts } from '../web/theme_list.js';

const inst = (name, extra = {}) => ({ name, label: name.toUpperCase(), description: `${name} look`, keywords: [name, 'pixel'], author: 'me', version: '1.0.0', iconPack: name, colors: {}, ...extra });
const mk = (name, extra = {}) => ({ source: 'o/r', name, label: name.toUpperCase(), description: `${name} market`, keywords: ['pixel'], author: 'm', version: '1.0.0', preview: `https://x/${name}.png`, installed: false, installedVersion: '', updatable: false, ...extra });

test('mergeCards_puts_the_active_theme_first_then_installed_then_available', () => {
  const cards = mergeCards({ catalog: [inst('bravo'), inst('alpha'), inst('default')], market: { themes: [mk('zulu'), mk('charlie')], userThemes: ['alpha'] }, active: 'bravo' });
  assert.deepEqual(cards.map((c) => c.name), ['bravo', 'alpha', 'default', 'charlie', 'zulu']);
  assert.equal(cards[0].active, true);
  assert.equal(cards[1].deletable, true);
  assert.equal(cards[2].deletable, false, 'a built-in theme has no Delete');
  assert.equal(cards[3].installed, false);
});

test('a_theme_in_both_lists_is_one_installed_card_with_the_marketplace_update', () => {
  const cards = mergeCards({ catalog: [inst('cat')], market: { themes: [mk('cat', { installed: true, installedVersion: '1.0.0', updatable: true, version: '1.2.0' })], userThemes: ['cat'] }, active: 'default' });
  assert.equal(cards.length, 1);
  assert.deepEqual([cards[0].installed, cards[0].updatable, cards[0].availableVersion, cards[0].source, cards[0].preview], [true, true, '1.2.0', 'o/r', 'https://x/cat.png']);
});

test('a_hand_made_theme_with_the_name_of_a_market_theme_hides_the_market_card', () => {
  const cards = mergeCards({ catalog: [inst('cat')], market: { themes: [mk('cat')], userThemes: ['cat'] }, active: 'cat' });
  assert.equal(cards.length, 1);
  assert.equal(cards[0].updatable, false);
});

test('mergeCards_works_without_a_marketplace_answer', () => {
  const cards = mergeCards({ catalog: [inst('a')], market: null, active: 'a' });
  assert.deepEqual(cards.map((c) => [c.name, c.deletable, c.installed]), [['a', false, true]]);
});

const cards = () => mergeCards({ catalog: [inst('cat', { keywords: ['cat', 'cozy'] }), inst('dog', { keywords: ['dog'] })], market: { themes: [mk('fox', { keywords: ['fox', 'cozy'] }), mk('owl', { keywords: ['owl'], installed: false })] }, active: 'cat' });

test('filterCards_matches_words_in_label_description_and_tags_case_insensitively', () => {
  assert.deepEqual(filterCards(cards(), { query: 'COZY' }).map((c) => c.name), ['cat', 'fox']);
  assert.deepEqual(filterCards(cards(), { query: 'dog look' }).map((c) => c.name), ['dog']);
  assert.deepEqual(filterCards(cards(), { query: 'cat fox' }), []);
  assert.equal(filterCards(cards(), { query: '  ' }).length, 4);
});

test('filterCards_keeps_cards_with_every_selected_tag', () => {
  assert.deepEqual(filterCards(cards(), { tags: ['cozy'] }).map((c) => c.name), ['cat', 'fox']);
  assert.deepEqual(filterCards(cards(), { tags: ['cozy', 'fox'] }).map((c) => c.name), ['fox']);
  assert.deepEqual(filterCards(cards(), { tags: ['cozy', 'owl'] }), []);
});

test('filterCards_status_installed_available_updates', () => {
  const list = mergeCards({ catalog: [inst('cat'), inst('dog')], market: { themes: [mk('cat', { installed: true, updatable: true, version: '2.0.0' }), mk('fox')] }, active: 'dog' });
  assert.deepEqual(filterCards(list, { status: 'installed' }).map((c) => c.name), ['dog', 'cat']);
  assert.deepEqual(filterCards(list, { status: 'available' }).map((c) => c.name), ['fox']);
  assert.deepEqual(filterCards(list, { status: 'updates' }).map((c) => c.name), ['cat']);
});

test('tagCounts_orders_by_count_then_name', () => {
  assert.deepEqual(tagCounts(cards()), [['cozy', 2], ['cat', 1], ['dog', 1], ['fox', 1], ['owl', 1]]);
});
