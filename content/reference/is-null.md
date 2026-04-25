---
concept: is-null
title: IS NULL
introduced_in: 03-speakeasy
---

# IS NULL

`NULL` represents an unknown or missing value in SQL. You can't compare `NULL` with `=` — the result of `NULL = NULL` is not `true`, it's also `NULL`. Use `IS NULL` and `IS NOT NULL` instead.

## Syntax
```
WHERE column IS NULL
WHERE column IS NOT NULL
```

## Examples

Patrons with no name logged (illegible in the guestbook):
```
SELECT visit_date, tab_cents FROM patrons WHERE name IS NULL
```

Patrons who did leave a legible name:
```
SELECT name FROM patrons WHERE name IS NOT NULL
```

## Why not `= NULL`?

Because `NULL = NULL` is `NULL`, which is not `true` — so rows wouldn't match. `IS NULL` is the only way to test for missingness.
