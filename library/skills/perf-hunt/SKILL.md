---
name: perf-hunt
description: Measure-first performance optimization. Use when something is slow, uses too much memory or CPU, times out, or when asked to optimize, speed up or scale code. Profiles to find the real bottleneck, fixes it, and proves the gain with numbers.
---

# Perf hunt

Intuition about performance is wrong more often than right. Measure, change one thing, measure again.

## 1. Define the target

- What is slow, for whom, under what load and data size? "Endpoint p95 is 2.1 s with 10k rows; target < 300 ms."
- Build a repeatable benchmark: a script, load test or benchmark harness that reproduces the slowness with realistic data. Run it 3–5 times and record the median and spread. Warm up first for JIT runtimes.

## 2. Profile — don't guess

Use the tool for the stack, and look at where time is _actually_ spent:

- Node: `node --cpu-prof`, `--heap-prof`, clinic.js, Chrome DevTools. Browser: Performance panel, Lighthouse.
- Python: `py-spy record`, `cProfile` + snakeviz, `scalene` for memory.
- Go: `pprof` (CPU, heap, block, mutex). Rust: `cargo flamegraph`, `perf`. JVM: async-profiler, JFR.
- Databases: `EXPLAIN (ANALYZE, BUFFERS)`, slow query log, query count per request.
- Distributed: traces/spans to see which service or call dominates.

## 3. Usual suspects (check against the profile)

- **N+1 queries** and chatty network calls inside loops → batch, join, or prefetch.
- **Missing index** or a query scanning far more rows than it returns.
- **Accidental quadratic** work: nested loops over the same data, `array.includes` / list membership inside a loop, repeated string concatenation, re-sorting.
- **Repeated work**: recomputing or re-fetching the same thing → hoist, memoise, cache with a clear invalidation rule.
- **Serial I/O** that could run concurrently (with bounded concurrency).
- **Too much data**: selecting all columns, no pagination, large payloads, unbounded result sets.
- **Allocation and GC pressure** in hot loops; synchronous blocking work on an event loop.
- Frontend: bundle size, render waterfalls, unnecessary re-renders, layout thrashing, unoptimised images.

## 4. Change one thing, re-measure

- Fix the biggest bottleneck first; Amdahl's law says shaving 5% elsewhere is noise.
- Re-run the same benchmark. Keep the change only if the gain is clearly beyond run-to-run variance.
- Run the test suite — fast and wrong is a regression.
- Stop when the target is met. Further micro-optimisation costs readability.

## Report

```
Target:     <metric and goal>
Baseline:   <median ± spread, how measured>
Bottleneck: <what the profile showed, with evidence>
Change:     <what you changed>
Result:     <new median ± spread>  (<x>× faster / <y>% less memory)
Trade-offs: <memory, complexity, staleness from caching, etc.>
```

No numbers, no claim. "Should be faster" is not a result.
