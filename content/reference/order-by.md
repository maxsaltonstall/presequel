---
concept: order-by
title: ORDER BY
introduced_in: 03-speakeasy
---

# ORDER BY

`ORDER BY` sorts the rows that come back. It goes near the end of the query — after `WHERE`, before `LIMIT`.

## Syntax
```
SELECT columns FROM table ORDER BY column [ASC|DESC]
```

`ASC` is ascending (default — smallest or earliest first). `DESC` is descending. If you omit the direction, it's `ASC`.

## Examples

Shifts in chronological order:
```
SELECT staff_name, shift_date FROM shifts ORDER BY shift_date ASC
```

Most expensive tabs first:
```
SELECT name, tab_cents FROM patrons ORDER BY tab_cents DESC
```

## Combining with LIMIT

`ORDER BY` paired with `LIMIT` gives you "top N":
```
SELECT name, tab_cents FROM patrons ORDER BY tab_cents DESC LIMIT 5
```
