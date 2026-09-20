// Run with: node --test tests/time-grid.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const moment = require('moment');
moment.now = () => Date.UTC(2026, 8, 20, 12);

const sandbox = {
  module: { exports: {} }, window: {}, console, setTimeout: () => {},
  require: (name) => name === 'obsidian'
    ? { moment, setIcon: () => {}, Plugin: class {}, PluginSettingTab: class {}, Modal: class {} } : {},
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8') +
  '\nthis.api = { normalizeCal, serializeCal, configuredHours, normalizeZoom, parseAddTitle, timeScrollOffset, parseTimeRange, timeInputValidator, expandInstances, CalendarRenderer };', sandbox);
const { normalizeCal, serializeCal, configuredHours, normalizeZoom, parseAddTitle, timeScrollOffset, parseTimeRange, timeInputValidator, expandInstances, CalendarRenderer } = sandbox.api;
const defaults = { firstView: 'month', dayStart: 7, dayEnd: 22 };

test('block hours survive saving, including midnight and end of day', () => {
  for (const dayEnd of [20, 24]) {
    const model = normalizeCal({ settings: { dayStart: 0, dayEnd }, events: [] }, defaults);
    const saved = JSON.parse(serializeCal(model));
    assert.equal(saved.settings.dayStart, 0);
    assert.equal(saved.settings.dayEnd, dayEnd);
    assert.equal(configuredHours(model.settings, defaults).dayStart, 0);
  }
});

test('missing/invalid hours inherit global values; reversed range remains usable', () => {
  for (const value of [undefined, null, '0', -1, 25, 1.5, Infinity]) {
    const model = normalizeCal({ settings: { dayStart: value, dayEnd: value } }, defaults);
    const range = configuredHours(model.settings, defaults);
    assert.equal(range.dayStart, 7);
    assert.equal(range.dayEnd, 22);
    assert.equal(Object.hasOwn(model.settings, 'dayStart'), false);
  }
  assert.equal(configuredHours({ dayStart: 23, dayEnd: 10 }, defaults).dayEnd, 24);
  assert.equal(configuredHours({ dayEnd: 18 }, defaults).dayStart, 7);
  assert.equal(configuredHours({ dayStart: 0 }, defaults).dayEnd, 22);
});

test('zoom validates persisted state and clamps supported range', () => {
  for (const value of [undefined, null, '2', NaN, Infinity]) assert.equal(normalizeZoom(value), 1);
  assert.equal(normalizeZoom(0.1), 0.5);
  assert.equal(normalizeZoom(10), 3);
  assert.equal(normalizeZoom(1.26), 1.25);
});

test('zoom anchors pointer time, persists only UI state, and blocks changes during drag', () => {
  const state = { zoom: 1 };
  const patches = [];
  const scroll = { scrollTop: 200, clientHeight: 400, getBoundingClientRect: () => ({ top: 100 }) };
  const inner = {
    get clientHeight() { return 1000 * state.zoom; },
    style: { setProperty(name, value) { assert.equal(name, '--dn-time-zoom'); assert.equal(Number(value), state.zoom); } },
  };
  const renderer = Object.create(CalendarRenderer.prototype);
  Object.assign(renderer, {
    _activeDrags: new Set(), view: () => state, stateKey: () => 'note::cal',
    el: { querySelector: (selector) => ({ '.dn-tg-scroll': scroll, '.dn-tg-inner': inner }[selector]) },
    plugin: { rememberViewState: (key, patch) => patches.push([key, patch.zoom]) },
  });
  renderer.setZoom(2, 250);
  assert.equal(scroll.scrollTop, 550); // (200 + 150) * 2 - 150
  assert.deepEqual(patches, [['note::cal', 2]]);
  renderer.setZoom(1); // center: (550 + 200) / 2 - 200
  assert.equal(scroll.scrollTop, 175);
  renderer._activeDrags.add(() => {});
  renderer.setZoom(3);
  assert.equal(state.zoom, 1);
  assert.equal(patches.length, 2);
});

test('fit uses available viewport, permits a compact scale, and is stable on repeat', () => {
  const state = { zoom: 1 };
  const patches = [];
  const scroll = {
    scrollTop: 200, clientHeight: 400,
    getBoundingClientRect: () => ({ top: 100 }),
    ownerDocument: { defaultView: {
      innerHeight: 900, getComputedStyle: () => ({ maxHeight: '400px' }),
    } },
  };
  const inner = { get clientHeight() { return 1056 * state.zoom; }, style: { setProperty() {} } };
  const renderer = Object.create(CalendarRenderer.prototype);
  Object.assign(renderer, {
    _activeDrags: new Set(), view: () => state, stateKey: () => 'note::fit',
    el: { querySelector: (selector) => ({ '.dn-tg-scroll': scroll, '.dn-tg-inner': inner }[selector]) },
    plugin: { rememberViewState: (key, patch) => patches.push(patch) },
  });
  renderer.fitDay();
  assert.ok(inner.clientHeight <= 400);
  assert.ok(state.zoom < 0.5);
  assert.equal(scroll.scrollTop, 0);
  assert.equal(patches[0].zoomFit, true);
  assert.equal(normalizeZoom(patches[0].zoom, true), state.zoom);
  const fittedZoom = state.zoom;
  scroll.clientHeight = inner.clientHeight;
  renderer.fitDay();
  assert.equal(state.zoom, fittedZoom);
  scroll.ownerDocument.defaultView.getComputedStyle = () => ({ maxHeight: 'none', flexGrow: '0' });
  scroll.ownerDocument.defaultView.innerHeight = 700;
  renderer.fitDay();
  assert.ok(Math.abs(inner.clientHeight - 583) < 1e-8);
  scroll.clientHeight = inner.clientHeight;
  renderer.fitDay();
  assert.ok(Math.abs(inner.clientHeight - 583) < 1e-8);
  renderer.setZoom(1);
  assert.equal(state.zoomFit, false);
});


test('explicit time prefixes parse without guessing numbers, dates or malformed times', () => {
  for (const text of ['15:00–16:00 Созвон', '15:00 - 16:00 Созвон']) {
    const result = parseAddTitle(text);
    assert.equal(result.title, 'Созвон');
    assert.equal(result.start, '15:00');
    assert.equal(result.end, '16:00');
  }
  assert.equal(parseAddTitle('9:05 Встреча').start, '09:05');
  assert.equal(parseAddTitle('23:00–02:00 Поезд').end, '02:00');
  for (const text of ['2026 планы', '15-16 главы', '20.09.2026 Встреча', '25:00 Ошибка',
    '15:00–99:00 Ошибка', '15:00–15:00 Ошибка', '15:00']) {
    assert.equal(parseAddTitle(text).title, text);
    assert.equal(parseAddTitle(text).start, null);
  }
  assert.equal(parseAddTitle('15:00 Позвонить', true).title, '15:00 Позвонить');
  assert.equal(parseAddTitle('15:00 Позвонить', true).start, null);
});

test('scroll restoration keeps clock time through range/zoom changes, but not navigation', () => {
  const saved = { context: 'day|2026-09-20|', minute: 18 * 60 };
  assert.ok(Math.abs(timeScrollOffset(saved, saved.context, 7 * 60, 22 * 60, 660) - 484) < 1e-8);
  assert.equal(timeScrollOffset(saved, saved.context, 0, 24 * 60, 1056), 792);
  assert.equal(timeScrollOffset(saved, 'day|2026-09-21|', 0, 1440, 1056), null);
  assert.equal(timeScrollOffset(saved, 'day|2026-09-20|19', 0, 1440, 1056), null);
  assert.equal(timeScrollOffset(null, '', 0, 1440, 1056), null);
});

test('placing an explicit time keeps the typed range even when clicking an hour slot', () => {
  const state = { pending: { title: 'Call', start: '15:00', end: '16:00', explicitTime: true } };
  const renderer = Object.create(CalendarRenderer.prototype);
  let committed;
  renderer.view = () => state;
  renderer.commitPlace = (start, end) => { committed = { start, end }; };
  renderer.placePending('2026-09-20', '09:00');
  assert.deepEqual(committed, { start: '15:00', end: '16:00' });
  assert.equal(state.pending.cursor, '2026-09-20');
  committed = null;
  renderer.pickPlaceDay();
  assert.deepEqual(committed, { start: '15:00', end: '16:00' });
});

test('Auto toggles off without rounding the fitted scale and persists that state', () => {
  const state = { zoom: 0.378, zoomFit: true };
  const patches = [];
  let updates = 0;
  const renderer = Object.create(CalendarRenderer.prototype);
  Object.assign(renderer, {
    _activeDrags: new Set(), view: () => state, stateKey: () => 'note::auto',
    plugin: { rememberViewState: (key, patch) => patches.push(patch) },
    updateZoomControls: () => updates++,
    fitDay: () => { state.zoomFit = true; },
  });
  renderer.toggleAutoZoom();
  assert.equal(state.zoomFit, false);
  assert.equal(state.zoom, 0.378);
  assert.equal(patches[0].zoomFit, false);
  assert.equal(normalizeZoom(patches[0].zoom, true), 0.378);
  assert.equal(updates, 1);
  renderer.toggleAutoZoom();
  assert.equal(state.zoomFit, true);
  renderer._activeDrags.add(() => {});
  renderer.toggleAutoZoom();
  assert.equal(state.zoomFit, true);
});

test('cancel restores the original draft from either placement phase without creating an event', () => {
  for (const sourceText of [' 15:00–16:00 Созвон ', '- Купить молоко', 'Обычное событие']) {
    for (const timing of [false, true]) {
      const state = { pending: { sourceText, title: 'Parsed title', timing }, addDraft: '' };
      let renders = 0;
      const renderer = Object.create(CalendarRenderer.prototype);
      renderer.view = () => state;
      renderer.render = () => renders++;
      renderer.cancelPlace();
      assert.equal(state.pending, null);
      assert.equal(state.addDraft, sourceText);
      assert.ok(state.focusAddUntil > Date.now());
      assert.equal(renders, 1);
      renderer.cancelPlace();
      assert.equal(renders, 1);
    }
  }
});

test('switching calendars restores a draft without stealing focus or replacing newer text', () => {
  const state = { pending: { sourceText: 'Original' }, addDraft: '' };
  const renderer = Object.create(CalendarRenderer.prototype);
  renderer.view = () => state;
  renderer.render = () => {};
  renderer.cancelPlace(false);
  assert.equal(state.addDraft, 'Original');
  assert.equal(state.focusAddUntil, 0);
  state.pending = { sourceText: 'Original' };
  state.addDraft = 'New draft';
  renderer.cancelPlace();
  assert.equal(state.addDraft, 'New draft');
});


test('time parsing rejects invalid ranges and preserves colon notation and overnight events', () => {
  for (const [input, start, end] of [['1:05','01:05',null], ['09:30','09:30',null],
    ['1530','15:30',null], ['15-18','15:00','18:00'], ['23:00–02:00','23:00','02:00']]) {
    const result = parseTimeRange(input);
    assert.equal(result.start, start);
    assert.equal(result.end, end);
  }
  for (const input of ['abc09:30', '12345', '09:90', '25:00', '15-99', '15-', '-18', '15-15', '1-2-3']) {
    assert.equal(parseTimeRange(input), null, input);
  }
});

function fakeElement(options = {}, all = []) {
  const el = { value: options.attr?.value || '', cls: options.cls, handlers: {}, attrs: {}, text: options.text || '',
    addEventListener(name, fn) { (this.handlers[name] ||= []).push(fn); },
    fire(name, data = {}) { for (const fn of this.handlers[name] || []) fn({ preventDefault() {}, stopPropagation() {}, ...data }); },
    setAttribute(k,v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
    setText(value) { this.text = value; }, addClass() {}, removeClass() {}, toggleClass() {},
    createDiv(opts) { return fakeElement(opts, all); }, createSpan(opts) { return fakeElement(opts, all); },
    createEl(tag, opts) { return fakeElement(opts, all); },
  };
  all.push(el); return el;
}

test('invalid time shows inline feedback; editing clears it; empty means all-day', () => {
  const all = [], input = fakeElement({}, all), parent = fakeElement({}, all);
  const validate = timeInputValidator(input, parent);
  input.value = '15-99';
  assert.equal(validate(), null);
  assert.equal(input.attrs['aria-invalid'], 'true');
  assert.ok(all.at(-1).text.includes('09:30'));
  input.value = '09:30'; input.fire('input');
  assert.equal(input.attrs['aria-invalid'], undefined);
  assert.equal(validate().start, '09:30');
  input.value = '';
  assert.equal(validate().start, null);
});

test('typed time survives redraw, cancel and resubmission of the same title', () => {
  const all = [], root = fakeElement({}, all);
  const state = { anchor: '2026-09-20', addDraft: 'Call' };
  const renderer = Object.create(CalendarRenderer.prototype);
  renderer.view = () => state;
  renderer.render = () => renderer.buildAddBar(root);
  renderer.render();
  renderer.addInput.fire('keydown', { key: 'Enter' });
  renderer.placePending('2026-09-20');
  let time = all.filter(e => e.cls === 'dn-in dn-place-time').at(-1);
  time.value = '09:30–10:45'; time.fire('input');
  renderer.render();
  time = all.filter(e => e.cls === 'dn-in dn-place-time').at(-1);
  assert.equal(time.value, '09:30–10:45');
  renderer.cancelPlace();
  assert.equal(renderer.addInput.value, 'Call');
  renderer.addInput.fire('keydown', { key: 'Enter' });
  renderer.placePending('2026-09-20');
  time = all.filter(e => e.cls === 'dn-in dn-place-time').at(-1);
  assert.equal(time.value, '09:30–10:45');
});

test('optimized expansion retains overdue tasks and ordinary/multi-day date boundaries', () => {
  const task = {id:'task',date:'2026-09-01',task:true,done:false};
  assert.equal(expandInstances(task,'2026-09-20','2026-09-20')[0].overdue, true);
  assert.equal(expandInstances({...task,done:true},'2026-09-20','2026-09-20').length, 0);
  assert.equal(expandInstances({...task,task:false},'2026-09-20','2026-09-20').length, 0);
  assert.equal(expandInstances({id:'span',date:'2026-09-19',endDate:'2026-09-21'},'2026-09-20','2026-09-20').length, 1);
});
