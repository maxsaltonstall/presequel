---
concept: comparison-operators
title: Comparison operators
introduced_in: 02-pharaoh
---

# Comparison operators

Inside a `WHERE` condition, six operators compare values:

| Operator | Meaning | Example |
|---|---|---|
| `=`  | equals | `year = 9` |
| `!=` | not equal | `overseer != 'Hemiunu'` |
| `>`  | greater than | `amount > 2000` |
| `<`  | less than | `amount < 500` |
| `>=` | greater or equal | `year >= 5` |
| `<=` | less or equal | `amount <= 1000` |

## With text

All six operators work on strings using alphabetical order — but you'll almost always use `=` or `!=` with text.

```
SELECT * FROM granary WHERE overseer = 'Weni'
SELECT * FROM granary WHERE overseer != 'Weni'
```

## With numbers

Numeric comparisons are what you expect:

```
SELECT * FROM granary WHERE amount > 3000    -- big shipments
SELECT * FROM granary WHERE year <= 3        -- Menkaure's first 3 years
```
