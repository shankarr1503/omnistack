# duration

`parseDuration(text)` converts a human duration into a whole number of seconds.

- Units: `h` (hours), `m` (minutes), `s` (seconds). Units may be combined in any order but each unit at most once: `1h30m`, `45s`, `2m10s`, `10s1h`.
- Whitespace between parts is allowed: `1h 30m`.
- Numbers may be decimal: `1.5h` is 5400. The result is rounded to the nearest whole second.
- A bare number means seconds: `90` is 90.
- Uppercase units are accepted: `2H`.
- Throw a `RangeError` for: an empty or whitespace-only string, unknown units (`5d`), a repeated unit (`1h2h`), negative numbers, or any other malformed input (`h`, `1hh`, `abc`).
