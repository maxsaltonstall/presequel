---
concept: group-by
title: GROUP BY
introduced_in: 04-census
---

# GROUP BY

`GROUP BY` splits rows into buckets, then lets you run aggregates (COUNT, SUM, AVG, MIN, MAX) per bucket instead of over the whole table.

## Syntax

```sql
SELECT bucket_column, AGG(other_column)
FROM table
GROUP BY bucket_column
```

## Examples

Residents per borough:

```sql
SELECT borough, COUNT(*)
FROM census_1890
GROUP BY borough
```

Returns one row per distinct borough. If any rows have `borough = NULL`, they form their own group with `NULL` as the bucket key.

Average age per borough, sorted by population:

```sql
SELECT borough, AVG(age), COUNT(*)
FROM census_1890
GROUP BY borough
ORDER BY COUNT(*) DESC
```

## Gotchas

- Every non-aggregate column in the `SELECT` must appear in `GROUP BY`.
- `NULL` becomes its own group — sometimes that's revealing.
