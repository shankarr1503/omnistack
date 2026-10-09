# cfg

Parses `key=value;key=value` configuration strings.

- Keys are case-insensitive: `Timeout=30` and `timeout=30` mean the same setting.
- Known settings: `timeout` (seconds, number), `retries` (integer).
