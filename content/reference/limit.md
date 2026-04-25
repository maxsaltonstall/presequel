---
concept: limit
title: LIMIT
introduced_in: 01-onboarding
---

# LIMIT

`LIMIT` caps how many rows come back. Put it at the end of the query.

## Syntax
```
SELECT columns FROM table LIMIT n
```

## Example

Just the first 3 clients:
```
SELECT name FROM clients LIMIT 3
```

Without `LIMIT`, the database returns every matching row.
