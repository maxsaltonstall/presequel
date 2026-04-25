# DISTINCT

`DISTINCT` removes duplicate rows from a result set. It applies to the entire row produced by the SELECT list, not to a single column.

## Forms

```sql
-- Unique values of one column:
SELECT DISTINCT occupation FROM patrons;

-- Unique combinations across multiple columns:
SELECT DISTINCT name, home_village FROM patrons;

-- Inside an aggregate, count only unique values:
SELECT COUNT(DISTINCT patron_id) FROM visits;
```

## Notes

- `DISTINCT` looks at every column in the SELECT list. `SELECT DISTINCT name, age` and `SELECT DISTINCT name` are different — the first keeps a row for each (name, age) pair.
- `COUNT(DISTINCT col)` is by far the most common shape in real queries — counting unique customers, unique sessions, unique error codes, etc.
- `DISTINCT` is computed after `WHERE` but before `ORDER BY` and `LIMIT`.
