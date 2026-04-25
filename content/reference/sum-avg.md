---
concept: sum-avg
title: SUM / AVG
introduced_in: 04-census
---

# SUM and AVG

Two more aggregates: `SUM` adds up numbers, `AVG` averages them.

## Syntax

```sql
SELECT SUM(column) FROM table
SELECT AVG(column) FROM table
```

Both skip NULL values automatically.

## Examples

Total wages paid across the whole census:

```sql
SELECT SUM(annual_wage_cents) FROM census_1890
```

Average age:

```sql
SELECT AVG(age) FROM census_1890
```

## Combining aggregates

You can compute multiple aggregates in one `SELECT`:

```sql
SELECT SUM(annual_wage_cents), AVG(age), COUNT(*) FROM census_1890
```
