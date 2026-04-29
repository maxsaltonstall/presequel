---
concept: rate
title: rate()
introduced_in: 09-heat
---

# rate()

`rate(field, 1m)` converts a per-minute count into events per second.

```sql
SELECT minute, service, rate(n, 1m) AS rps
FROM metrics
ORDER BY rps DESC
```

The `1m` interval matches the bucket size of the data. Divides by 60 and rounds to two decimal places.

Use it anywhere a column appears: SELECT, WHERE, ORDER BY, inside aggregates like MAX or AVG.

| DDSQL | Equivalent |
|-------|------------|
| `rate(n, 1m)` | `ROUND(n / 60.0, 2)` |
| `rate(errors, 1m)` | `ROUND(errors / 60.0, 2)` |
