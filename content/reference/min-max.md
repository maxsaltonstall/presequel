---
concept: min-max
title: MIN / MAX
introduced_in: 04-census
---

# MIN and MAX

Aggregates that find the smallest / largest value in a column. Work on numbers, strings (alphabetical), and dates.

## Syntax

```sql
SELECT MIN(column) FROM table
SELECT MAX(column) FROM table
```

Both skip NULL values.

## Examples

Youngest and oldest residents:

```sql
SELECT MIN(age), MAX(age) FROM census_1890
```

Smallest and largest wage on record:

```sql
SELECT MIN(annual_wage_cents), MAX(annual_wage_cents) FROM census_1890
```

Alphabetically first surname:

```sql
SELECT MIN(surname) FROM census_1890
```
