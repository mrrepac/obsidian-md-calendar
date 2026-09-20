// npm ci --prefix tests && node tests/benchmark.cjs
// Measures production data paths, NOT browser layout/paint or vault I/O.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const moment = require('moment');
moment.now = () => Date.UTC(2026, 8, 20, 12);
const sandbox = { module: { exports: {} }, window: {}, console,
  require: name => name === 'obsidian'
    ? { moment, Plugin: class {}, PluginSettingTab: class {}, Modal: class {} } : {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8') +
  '\nthis.api = {normalizeCal, serializeCal, CalendarRenderer, SearchModal};', sandbox);
const { normalizeCal, serializeCal, CalendarRenderer, SearchModal } = sandbox.api;
function measure(fn) {
  for (let i = 0; i < 3; i++) fn();
  const times = [];
  for (let i = 0; i < 25; i++) { const t = performance.now(); fn(); times.push(performance.now() - t); }
  times.sort((a,b) => a-b);
  return { medianMs: +times[12].toFixed(2), p95Ms: +times[23].toFixed(2) };
}
const results = [];
for (const count of [100, 1000, 10000]) {
  const events = Array.from({ length: count }, (_, i) => ({
    id: 'bench-' + i, title: 'Meeting ' + i, note: 'Project ' + (i % 10),
    date: moment('2024-01-01').add((i * 17) % 1826, 'days').format('YYYY-MM-DD'),
    start: '09:00', end: '10:00',
    ...(i % 50 === 0 ? { repeat: { unit: 'week', interval: 1 } } : {}),
  }));
  const source = JSON.stringify({ calId: 'benchmark', events });
  const model = normalizeCal(JSON.parse(source), { firstView: 'month' });
  const renderer = Object.create(CalendarRenderer.prototype);
  Object.assign(renderer, { model, showCompleted: () => true });
  const search = Object.create(SearchModal.prototype);
  search.live = () => renderer;
  const month = () => renderer.bucketByDay(renderer.itemsInRange('2026-08-31', '2026-10-11'), '2026-08-31', '2026-10-11');
  results.push({ count, sourceBytes: Buffer.byteLength(source), visibleInstances: renderer.itemsInRange('2026-08-31', '2026-10-11').length,
    openData: measure(() => normalizeCal(JSON.parse(source), { firstView: 'month' })),
    monthData: measure(month),
    searchAll: measure(() => search.search('')),
    searchFiltered: measure(() => search.search('Project 7')),
    editSnapshotAndSerialize: measure(() => { serializeCal(model); model.events[0].title = model.events[0].title === 'A' ? 'B' : 'A'; serializeCal(model); }),
  });
}
console.log(JSON.stringify({ runtime: process.version, platform: process.platform, samples: 25,
  workload: 'Events across five years, 2% weekly recurrence; warmed production data paths only', results }, null, 2));
