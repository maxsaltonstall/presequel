---
concept: count
title: COUNT
introduced_in: 04-census
---

# COUNT

`COUNT` returns the number of rows. It's an **aggregate** — it collapses many rows into one answer.

## Syntax

```sql
SELECT COUNT(*) FROM table
SELECT COUNT(column) FROM table                 -- counts non-null values in column
SELECT COUNT(DISTINCT column) FROM table        -- counts distinct non-null values
```

## Examples

How many residents total?

```sql
SELECT COUNT(*) FROM census_1890
```

How many residents had a borough recorded (non-null)?

```sql
SELECT COUNT(borough) FROM census_1890
```

How many distinct occupations appear?

```sql
SELECT COUNT(DISTINCT occupation) FROM census_1890
```

## Gotchas

- `COUNT(*)` counts every row, even if every column is NULL.
- `COUNT(column)` skips NULL values in that column.
