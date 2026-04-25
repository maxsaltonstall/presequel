# Table aliases

A table alias is a short name you give a table inside a single query. Aliases reduce typing and make multi-table joins readable.

## Form

```sql
SELECT e.era, c.name
FROM chrono_engagements e
INNER JOIN chrono_clients c ON e.client_id = c.client_id;
```

`e` is now an alias for `chrono_engagements` and `c` for `chrono_clients`. Use the aliases everywhere else in the query.

## Notes

- Aliases are required when joining a table to itself (a self-join), and when two tables share column names that would otherwise be ambiguous.
- The optional `AS` keyword (`FROM chrono_engagements AS e`) is purely stylistic. Most SQL writers omit it for tables.
- Once an alias is defined, the original table name can no longer be used in that query — `e.era`, not `chrono_engagements.era`.
- Pick aliases that are short but mnemonic: `e` for engagements, `c` for clients, `r` for records.
