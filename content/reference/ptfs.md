---
concept: ptfs
title: PTFs
introduced_in: 10-reach
---

# Polymorphic Table Functions (PTFs)

PTFs let you query a telemetry source as if it were a function call. Pass tag filters as arguments inside the parentheses.

```sql
SELECT timestamp, message FROM logs(service:auth-svc) LIMIT 10
SELECT trace_id, duration_ms, called_service FROM spans(service:auth-svc) LIMIT 10
```

The tag filter syntax inside PTF parens is the same as DDSQL tag filters — `key:value`, space-separated for multiple filters, `-key:value` for negation.

## Available sources

| PTF | Columns | Use for |
|-----|---------|---------|
| `logs()` | `timestamp`, `message`, `tags` | Log lines — what a service said |
| `spans()` | `trace_id`, `timestamp`, `tags`, `operation`, `duration_ms`, `called_service` | Spans — what a service called |

## No-arg form

`FROM logs()` with empty parens returns all rows from that source (no filter applied). Useful for schema inspection.

## Multiple filters

Filters are space-separated inside the parens — same as the `WHERE` tag syntax:

```sql
FROM logs(service:auth-svc level:error)
```
