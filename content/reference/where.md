---
concept: where
title: WHERE
introduced_in: 02-pharaoh
---

# WHERE

`WHERE` filters which rows are returned. It goes after `FROM`, and it takes a condition — a true/false expression evaluated per row. Only rows where the condition is true come back.

## Syntax
```
SELECT columns FROM table WHERE condition
```

## Example

Return only clients whose era is Old Kingdom Egypt:
```
SELECT name FROM clients WHERE era = 'Old Kingdom Egypt'
```

Return granary entries from year 9 or later:
```
SELECT overseer, amount FROM granary WHERE year >= 9
```

## Gotchas

- Text values go in single quotes: `WHERE name = 'Menkaure'`.
- Integer values do NOT: `WHERE year = 9`, not `WHERE year = '9'`.
- `WHERE` comes before `LIMIT`.
