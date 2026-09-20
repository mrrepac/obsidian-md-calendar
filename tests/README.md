# Development checks

From the plugin directory:

```sh
npm ci --prefix tests
node --test tests/time-grid.cjs
node tests/benchmark.cjs
```

The tests exercise production helpers and renderer methods with a minimal Obsidian
mock. They do not replace visual testing in Obsidian.

The benchmark measures production data processing with 100, 1,000 and 10,000 events
spread over five years, with 2% weekly recurring events. It uses three warmups and
25 samples per operation, reporting median and p95. The clock is fixed for repeatability.
It excludes browser DOM, layout, paint, and vault reads/writes.

`benchmark-before.json` and `benchmark-after.json` record the local runs around
removing an unnecessary current-date conversion for ordinary/completed events.
Month preparation medians changed from 0.25 / 1.67 / 39.54 ms to
0.13 / 0.56 / 14.90 ms respectively. This is not a whole-UI speedup claim.
The after run had a 408.97 ms p95 outlier at 10,000 events, so these results do
not establish an improvement in worst-case latency. Timings vary by host and run.
