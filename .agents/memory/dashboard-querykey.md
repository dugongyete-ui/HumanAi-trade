---
name: Dashboard TanStack Query v5 hook pattern
description: Orval-generated hooks require explicit queryKey in UseQueryOptions for TanStack Query v5
---

## Rule
When calling Orval-generated hooks, always pass `queryKey` explicitly in the `query` option:

```typescript
useGetBotStatus({ query: { queryKey: getGetBotStatusQueryKey(), refetchInterval: 5000 } })
```

**Why:** Orval generates `options?.query` typed as `UseQueryOptions<...>` (not partial). In TanStack Query v5, `UseQueryOptions.queryKey` is required. Passing just `{ refetchInterval: N }` without `queryKey` causes TS2741 typecheck error.

**How to apply:** Every `useGet*` hook call with a `query` option must include the matching `getGet*QueryKey()` call. Import the key getters alongside the hooks.
