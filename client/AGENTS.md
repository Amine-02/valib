# Client instructions

Before making any change in the client, always check `src/utils` and existing shared helpers first.

Do not duplicate:
- fetch/request helpers
- DOM helpers
- formatting helpers
- filtering/search helpers
- state helpers
- rendering helpers

If similar logic already exists, reuse or extend it instead of rewriting it.

Prefer shared utilities over page-local duplication.