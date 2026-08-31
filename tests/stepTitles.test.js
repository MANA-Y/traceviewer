import test from 'node:test';
import assert from 'node:assert/strict';
import { stripStepOrdinal } from '../src/rendering/stepTitles.js';

test('drops an ordinal the badge already shows', () => {
  assert.equal(stripStepOrdinal('01. Контекст и проблема'), 'Контекст и проблема');
  assert.equal(stripStepOrdinal('1) Profile APK'), 'Profile APK');
  assert.equal(stripStepOrdinal('12: Итоги'), 'Итоги');
  assert.equal(stripStepOrdinal('  03.  Где уходит время'), 'Где уходит время');
});

test('keeps numbers that carry meaning', () => {
  assert.equal(stripStepOrdinal('16.6 мс на кадр'), '16.6 мс на кадр');
  assert.equal(stripStepOrdinal('P50 против Avg'), 'P50 против Avg');
  assert.equal(stripStepOrdinal('01.'), '01.');
  assert.equal(stripStepOrdinal('2G/3G канал'), '2G/3G канал');
  assert.equal(stripStepOrdinal(''), '');
  assert.equal(stripStepOrdinal(undefined), '');
});
