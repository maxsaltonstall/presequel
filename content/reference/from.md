---
concept: from
title: FROM
introduced_in: 01-onboarding
---

# FROM

`FROM` names the table you're reading from. It always follows `SELECT` (in the simple form).

## Syntax
```
SELECT columns FROM table_name
```

## Example
```
SELECT id, name FROM clients
```

Reads rows from the `clients` table and returns their `id` and `name`.
