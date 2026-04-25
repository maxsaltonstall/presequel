# INNER JOIN

`INNER JOIN` combines rows from two tables that share a matching value in a column. Rows that don't match on both sides are excluded.

## Form

```sql
SELECT a.col, b.col
FROM table_a a
INNER JOIN table_b b ON a.shared_col = b.shared_col;
```

The `ON` clause specifies the matching condition. Rows in `table_a` without a partner in `table_b` are dropped — and vice versa.

## Notes

- "Inner" is the intersection — rows present in both sides of the match.
- Other join types (`LEFT JOIN`, `RIGHT JOIN`, `OUTER JOIN`) keep unmatched rows from one or both sides. Phase 1 covers `INNER JOIN` only.
- The `ON` clause can use any condition, not just equality. `INNER JOIN ... ON a.x > b.y` is valid; equality is just the most common.
- You can chain joins: `FROM a INNER JOIN b ON ... INNER JOIN c ON ...`. Each `ON` matches against the running result.
