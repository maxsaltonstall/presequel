---
concept: time-windows
title: Time Windows
introduced_in: 08-when
---

# Time Windows

## @timestamp filter

Filter logs to a time range using `@timestamp:[start to end]`:

```sql
SELECT * FROM logs WHERE @timestamp:[now-1h to now]
```

The `to` separator is case-insensitive. Whitespace inside the brackets is ignored.

## Relative offsets

`now` is anchored to the dataset's end time, not the wall clock.

| Token | Meaning |
|-------|---------|
| `now` | Dataset end time |
| `now-1h` | 1 hour before dataset end |
| `now-30m` | 30 minutes before dataset end |
| `now-5m` | 5 minutes before dataset end |
| `now-10s` | 10 seconds before dataset end |

Supported units: `h` (hours), `m` (minutes), `s` (seconds).

## bucket()

Group by time interval using `bucket(field, interval)`:

```sql
SELECT bucket(timestamp, 1m) AS minute, COUNT(*) AS n
FROM logs
GROUP BY minute
ORDER BY minute
```

Equivalent to `DATE_TRUNC('minute', timestamp)` in standard SQL.

| DDSQL | Interval |
|-------|----------|
| `bucket(field, 1s)` | Second |
| `bucket(field, 1m)` | Minute |
| `bucket(field, 1h)` | Hour |

`bucket()` can appear in SELECT, GROUP BY, and ORDER BY.
