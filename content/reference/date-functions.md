# Date functions

DuckDB ships with rich date and time functions. Two are introduced here.

## EXTRACT — pull a piece out of a date

```sql
EXTRACT(YEAR  FROM visit_date)   -- 1347
EXTRACT(MONTH FROM visit_date)   -- 1..12
EXTRACT(DAY   FROM visit_date)   -- 1..31
EXTRACT(DOW   FROM visit_date)   -- day of week, 0=Sunday
```

Use it when you want to group or filter by a piece of a date — "visits per month", "all entries on Wednesdays", etc.

## DATE_TRUNC — round a date down to a unit

```sql
DATE_TRUNC('week',  visit_date)   -- Monday of that week (DuckDB's default)
DATE_TRUNC('month', visit_date)   -- first of the month
DATE_TRUNC('year',  visit_date)   -- January 1 of the year
```

Use it when you want to bucket dates into time windows — "visits per week", "revenue per month". The result is itself a date, so you can `GROUP BY` it directly.

## EXTRACT vs DATE_TRUNC

```sql
EXTRACT(MONTH FROM '2025-04-15')   -- returns 4 (an integer)
DATE_TRUNC('month', '2025-04-15')  -- returns 2025-04-01 (a date)
```

`EXTRACT` strips the date down to one number. `DATE_TRUNC` keeps it as a date but rounds it. Pick by what you want to do with the result.
