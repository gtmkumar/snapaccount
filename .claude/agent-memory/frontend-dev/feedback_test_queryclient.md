---
name: Test QueryClient must use staleTime:Infinity
description: React Query tests that assert exact call counts fail due to React 19 double-mount behavior. The fix is staleTime:Infinity in the test QueryClient.
type: feedback
---

Always configure test `QueryClient` with `staleTime: Infinity` to prevent double-fetch issues in React 19.

**Why:** React 19 (and React Testing Library for React 19) can mount components twice in certain scenarios, causing React Query to issue two fetches when `staleTime: 0` (the default). Tests asserting `toHaveBeenCalledTimes(1)` will fail with "called 2 times". Adding `staleTime: Infinity` ensures the cache from the first mount is still "fresh" when the component remounts, preventing the second fetch.

**How to apply:**
```ts
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
}
```

Also: when testing call counts, prefer `toHaveBeenCalled()` over `toHaveBeenCalledTimes(1)` to be robust against strict-mode double invocations. When testing that re-fetch happens after a filter change, wait for the initial data to appear FIRST (using `waitFor(() => screen.getByText(...))`), then change the filter, then assert the new call with the new params.
