---
concept: ddsql-tags
title: DDSQL tags
introduced_in: 07-static
---

# DDSQL tags

DDSQL is SQL-shaped, but it filters on tags using a colon shorthand. Where regular SQL says `WHERE tags['service'] = 'auth-svc'`, DDSQL says `WHERE service:auth-svc` — same meaning, half the typing, no quotes around values that don't contain spaces.

## Forms

Single tag:
```ddsql
WHERE service:auth-svc
```

Multiple tags — implicit AND, no keyword needed:
```ddsql
WHERE service:auth-svc env:prod
```

Negation — leading hyphen excludes:
```ddsql
WHERE service:auth-svc env:prod -level:info
```

## Notes

- The key is whatever's left of the colon; the value is whatever's right.
- Spaces between tag conditions mean AND. There is no OR in this chapter.
- The hyphen is the negation operator. `-level:info` excludes rows where level equals info. It does not mean a key called `-level`.
- Quoted values work for spaces: `service:'my service with spaces'`.
- Tags you haven't seen before still work — DDSQL doesn't validate that the key exists. If no rows match, you get an empty result, not an error.
