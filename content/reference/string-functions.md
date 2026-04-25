---
concept: string-functions
title: String functions
introduced_in: 03-speakeasy
---

# String functions

SQL has a handful of functions that operate on text. A few common ones:

| Function | Returns | Example |
|---|---|---|
| `UPPER(s)` | string in uppercase | `UPPER('weni')` → `'WENI'` |
| `LOWER(s)` | string in lowercase | `LOWER('WENI')` → `'weni'` |
| `LENGTH(s)` | number of characters | `LENGTH('Weni')` → `4` |
| `SUBSTRING(s, start, n)` | n characters starting at `start` (1-indexed) | `SUBSTRING('Hayes', 2, 3)` → `'aye'` |
| `LEFT(s, n)` | first n characters | `LEFT('Hayes', 3)` → `'Hay'` |
| `RIGHT(s, n)` | last n characters | `RIGHT('Hayes', 3)` → `'yes'` |

## Use inside SELECT

```
SELECT UPPER(staff_name) FROM shifts
SELECT LENGTH(name), name FROM patrons WHERE name IS NOT NULL
```

## Use inside WHERE

```
SELECT * FROM patrons WHERE LENGTH(name) > 10
```
