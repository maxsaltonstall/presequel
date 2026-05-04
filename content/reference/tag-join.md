---
concept: tag-join
title: Tag joins
introduced_in: 11-catalog
---

# Tag Joins

Tag joins let you cross-reference telemetry sources with catalog tables by matching a tag value against a column.

```sql
SELECT timestamp, message, team
FROM logs JOIN services ON tags.service = service_name
LIMIT 10
```

`tags.service` is dot-notation shorthand for the `service` tag. The translator converts it to `logs.tags['service']` — the same map access syntax used in WHERE clauses.

## INNER JOIN vs LEFT JOIN

An INNER JOIN only returns rows that match on both sides. If a service has telemetry but no catalog entry, it disappears from the result.

A LEFT JOIN returns all rows from the left table (the telemetry source). Unregistered services show up with NULL values in the catalog columns.

```sql
FROM logs LEFT JOIN services ON tags.service = service_name
```

## Anti-join pattern

To find services present in telemetry but absent from the catalog, use LEFT JOIN + `WHERE service_name IS NULL`:

```sql
SELECT DISTINCT tags['service'] as service
FROM logs LEFT JOIN services ON tags.service = service_name
WHERE service_name IS NULL
```

## Dot-notation shorthand

`tags.<key>` in a JOIN ON clause is a DDSQL shorthand. It expands to `<table>.tags['<key>']` using the FROM table as context. Regular WHERE clauses use standard map notation: `tags['service']`.
