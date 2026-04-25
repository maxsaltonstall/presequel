# HAVING

`HAVING` filters groups produced by `GROUP BY`. Where `WHERE` filters individual rows before grouping, `HAVING` filters aggregated results after.

## Form

```sql
SELECT patron_id, COUNT(*) AS visits
FROM visits
GROUP BY patron_id
HAVING COUNT(*) >= 20;
```

## Notes

- `WHERE` happens first (per-row), then `GROUP BY`, then `HAVING` (per-group), then `SELECT`, then `ORDER BY`, then `LIMIT`.
- The expression in `HAVING` typically references an aggregate (`COUNT(*)`, `SUM(amount)`, `AVG(price)`, etc.) or a column listed in the `GROUP BY`. Anything else won't make sense.
- A common confusion: trying to filter aggregates with `WHERE`. `WHERE COUNT(*) > 5` is an error — at the moment `WHERE` runs, no count exists yet. Use `HAVING` for that.
- You can use a column alias from the SELECT list in `HAVING` in some SQL dialects, but not all. Safe to repeat the aggregate expression: `HAVING COUNT(*) >= 20` instead of `HAVING visits >= 20`.
