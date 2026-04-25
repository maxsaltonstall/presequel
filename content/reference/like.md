---
concept: like
title: LIKE
introduced_in: 03-speakeasy
---

# LIKE

`LIKE` matches text using patterns. It's used in a `WHERE` clause.

## Wildcards

- `%` — matches any number of characters (including zero).
- `_` — matches exactly one character.

## Syntax
```
WHERE column LIKE 'pattern'
```

## Examples

Names starting with L:
```
SELECT staff_name FROM shifts WHERE staff_name LIKE 'Louise%'
```

Names containing "Hayes" anywhere:
```
SELECT staff_name FROM shifts WHERE staff_name LIKE '%Hayes%'
```

Three-letter names exactly:
```
SELECT name FROM patrons WHERE name LIKE '___'
```
