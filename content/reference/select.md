---
concept: select
title: SELECT
introduced_in: 01-onboarding
---

# SELECT

`SELECT` tells the database which columns to return from a table. It's the first word of nearly every query.

## Syntax
```
SELECT column_a, column_b FROM some_table
```

## Examples

Return the `name` column from `clients`:
```
SELECT name FROM clients
```

Return two columns:
```
SELECT name, era FROM clients
```

Return every column (use sparingly — it's noisy):
```
SELECT * FROM clients
```
