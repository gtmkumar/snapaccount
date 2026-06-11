---
name: Jest Mock Patterns for Expo/RN hooks and modules
description: Proven and broken Jest mock patterns discovered writing Phase 6A/6E/6C/6F tests — covers NetInfo, expo-device, expo-camera, SignalR, useFocusEffect, ThemeContext, async hooks, sort-chip accessibilityState, 2-stage biometric Alert
type: feedback
---

## NetInfo default-export mock

The source uses `import NetInfo from '@react-native-community/netinfo'` then `NetInfo.fetch()` and `NetInfo.addEventListener()`. The `moduleNameMapper` in `package.json` points to `src/__mocks__/netinfo.ts` which exports `{ fetch, addEventListener }` as `export default`. In Jest test files the override must match:

```ts
jest.mock('@react-native-community/netinfo', () => {
  const mock = {
    fetch: jest.fn(() => Promise.resolve({ isConnected: true })),
    addEventListener: jest.fn(() => jest.fn()),
  };
  return { __esModule: true, default: mock };
});
```

**Why:** Without `__esModule: true`, the CJS interop wraps the object and `NetInfo.fetch` resolves to `undefined`.

**How to apply:** Always use this pattern when mocking NetInfo in test files that override the moduleNameMapper mock.

---

## expo-device isDevice — cannot mutate CJS const export at runtime

`export const isDevice = false` in `src/__mocks__/expoDevice.ts` creates a non-writable getter on the CJS namespace object. Even if `jest.mock('expo-device', factory)` returns a mutable `mockDevice` object, Jest's CJS transform may freeze the `isDevice` export.

**Broken approach:** `deviceFlags.isDevice = false` then calling the module under test.
**Broken approach:** `Object.defineProperty(Device, 'isDevice', { value: false })`.

**Working approach:** Test the same code path indirectly (e.g. test permission-denied path instead of simulator path). For source fix, extract `isPhysicalDevice(): boolean { return Device.isDevice; }` so tests can mock the function.

**Why:** Jest CJS namespace objects created from `const` exports are non-configurable in some transform versions.

---

## expo-camera CameraView ref forwarding in tests

To test capture flow, use `React.forwardRef` in the mock with `useImperativeHandle`:

```ts
const mockTakePicture = jest.fn(() => Promise.resolve({ uri: 'file:///photos/test.jpg' }));
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const CameraView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ takePictureAsync: mockTakePicture }));
    const { children, style } = props;
    return React.createElement(View, { testID: 'camera-view', style }, children);
  });
  // ...
});
```

**Why:** The component uses `useRef<CameraView>` and attaches `ref={cameraRef}` to CameraView. The forwardRef mock wires the ref correctly. Do NOT use TypeScript index signatures (`[key: string]: unknown`) inside jest.mock factory — hoisting rules forbid it.

---

## useDocumentQueue async state machine — fake timers limitation

The hook's `uploadItem` uses a dual-`setQueue` pattern (second `setQueue` as a state reader). Under React 18 concurrent batching, the FAILED state transition from the catch handler's `setQueue` does not reliably flush within `act()` + `waitFor()` even with real timers and 4+ second timeout.

**Working approach:** Test FAILED state by seeding via AsyncStorage pre-populated with a FAILED item. Test `retry()` by seeding a FAILED item then calling `result.current.retry(id)`.

**Do not attempt:** Testing FAILED via live upload rejection chain in Jest — the state simply does not flush observably.

**Root cause (suspected):** The `setQueue(prev => { currentItem = prev.find(...); return prev })` anti-pattern causes React to coalesce the FAILED update with prior pending updates in a way that drops the observable render.

**Source fix recommended (P6-QA-MOBILE-03):** Replace dual-setQueue reader with a `queueRef` that mirrors state synchronously.

---

## useRealTimers vs useFakeTimers for async hooks

For hooks that mix `setTimeout` + `async/await` in the same code path (like `useDocumentQueue`):
- Use `jest.useRealTimers()` — fake timers interact poorly with Promise microtask chains inside `act()`.
- Use a `delay(ms)` helper (`new Promise(r => setTimeout(r, ms))`) inside `act(async () => { await delay(N) })` to let async chains settle.
- Set individual test timeouts (`}, 5000)`) for tests with real network mock delays.

---

## react-query refetchInterval + fake timers — infinite loop

`jest.runAllTimers()` inside `act()` causes an infinite loop abort ("Aborting after running 100000 timers") when a react-query `useQuery` with `refetchInterval` is mounted. React-query schedules its own internal GC and refetch timers that never terminate under `runAllTimers`.

**Broken approach:** `await act(async () => { jest.runAllTimers(); })` — hits sinonjs 100k-timer guard.

**Working approach:** Use `jest.advanceTimersByTime(30_000)` to advance exactly the interval, or skip fake timers entirely and verify polling via pull-to-refresh (fireEvent 'refresh') which is observable and equivalent for test purposes.

**How to apply:** Any screen using `useQuery({ refetchInterval: N })` — use `advanceTimersByTime` or real-timer + manual refetch approach.

---

## jest.mock() factory variable hoisting — apiClient pattern

When mocking `src/lib/api` in a test file, declaring `const mockGet = jest.fn()` BEFORE `jest.mock(...)` and referencing it inside the factory does NOT work — the factory is hoisted above all variable declarations by Babel/Jest, so the variables are `undefined` inside the factory.

**Broken approach:**
```ts
const mockGet = jest.fn();
jest.mock('../../src/lib/api', () => ({ apiClient: { get: mockGet } })); // mockGet is undefined
```

**Working approach:** Declare `jest.fn()` inline inside the factory, then get a reference via `import` after:
```ts
jest.mock('../../src/lib/api', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn() },
}));
import { apiClient } from '../../src/lib/api';
const mockGet = apiClient.get as jest.Mock;
```

**How to apply:** All API client unit tests (`__tests__/api/*.test.ts`).

---

## Alert.mockImplementation leaking between tests

When `jest.spyOn(Alert, 'alert').mockImplementation(...)` is set in one test and `mockRestore()` is not called, subsequent tests that trigger a *different* Alert code path receive the same `mockImplementation` — `buttons` argument may be `undefined` for the new path, causing `.find()` to throw `TypeError: Cannot read properties of undefined`.

**Fix:** Always call `alertSpy.mockRestore()` at the end of any test that uses `mockImplementation` on Alert, OR scope it to that test's `beforeEach`/`afterEach`. If multiple tests in a describe use different Alert paths, give each its own `mockImplementation` + `mockRestore`.

**How to apply:** Any test for screens with multiple Alert paths (e.g. UserApprovalScreen has scrollFirst, verifyFirst, and biometric Alerts — each needs an isolated spy).

---

## RNTL chip/button accessibilityState — never traverse via chip.parent?.props

In RNTL, `findByText('chip label')` returns the `Text` node inside a `Pressable`. The `Pressable`'s `accessibilityState` is on the PARENT of the text node, but `chip.parent?.props.accessibilityState` is `undefined` because RNTL renders a host component wrapper between the React element tree and the queried node.

**Broken approach:**
```ts
const chip = await findByText('Lowest rate');
expect(chip.parent?.props.accessibilityState?.selected).toBe(true); // undefined
```

**Working approach:** Use `findAllByRole('button')` then `.find()` to locate the one with `selected: true`:
```ts
const buttons = await findAllByRole('button');
const selected = buttons.find(b => b.props.accessibilityState?.selected === true);
expect(selected).toBeTruthy();
```

**Why:** RNTL fiber traversal does not guarantee `.parent` maps to the immediate React element — it maps to the host component tree which may include intermediate wrappers.

**How to apply:** Sort chip tests, tab bar tests, any test asserting `accessibilityState.selected` on a Pressable whose label text is queried.

---

## SignalR subscribeChatHub handler capture + useFocusEffect mock (Phase 6F)

To test SignalR event handlers in `ChatDetailScreen`, capture handlers via `subscribeChatHub` mock and restore after `jest.clearAllMocks()`.

**Key insight:** `jest.clearAllMocks()` removes ALL mock implementations including `useFocusEffect`. If `useFocusEffect` loses its implementation, its callback never fires, so `subscribeChatHub` is never called, and handler capture fails silently.

**Pattern:**
```ts
const capturedHandlers: HubHandlers = {};

jest.mock('../../src/api/chat', () => ({
  subscribeChatHub: jest.fn().mockImplementation((_hub, handlers) => {
    Object.assign(capturedHandlers, handlers);
    return jest.fn();
  }),
  // ...
}));

jest.mock('@react-navigation/native', () => ({
  ...actual,
  useFocusEffect: jest.fn((cb) => { cb(); }),
}));

import { subscribeChatHub } from '../../src/api/chat';

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(capturedHandlers).forEach(k => delete capturedHandlers[k]);
  // Re-apply both implementations after clearAllMocks
  const nav = require('@react-navigation/native');
  (nav.useFocusEffect as jest.Mock).mockImplementation((cb) => { cb(); });
  (subscribeChatHub as jest.Mock).mockImplementation((_hub, handlers) => {
    Object.assign(capturedHandlers, handlers);
    return jest.fn();
  });
});
```

**Why:** `jest.mock()` factory-level `mockImplementation` is applied once at module evaluation time. `clearAllMocks()` resets it. Using `require('@react-navigation/native')` inside `beforeEach` gives the live mock reference so re-application works.

**FlatList / ListFooterComponent timing:** Typing indicator is a `ListFooterComponent` of the FlatList. The FlatList only renders when `messages.length > 0`. Tests that check the typing indicator must fire a `messageReceived` event first to populate the list, THEN fire `typingStarted`.

**Loading state timing:** `isLoading = threadLoading || messagesLoading`. Always wait for both queries to resolve before firing SignalR events:
```ts
await waitFor(() => { expect(queryByText('Say hello')).toBeTruthy(); }); // empty state = loaded
```

**How to apply:** Any screen using SignalR + useFocusEffect callback pattern.

---

## ThemeContext setTheme toggle — AsyncStorage race on mount

`ThemeProvider` calls `loadPreference().then(setPreference)` on mount. If you call `setTheme('dark')` before this async load resolves, the `then(setPreference)` call with `'system'` will override your toggle.

**Fix:** Wait for mount settle (async load → isDark renders) BEFORE pressing toggleDark:
```ts
await waitFor(() => { expect(getByTestId('isDark').props.children).toBe('false'); });
// then press toggleDark
```

**Why:** `AsyncStorage.getItem` mock returns `Promise.resolve(null)` — resolves asynchronously (next microtask tick), after `render()` but before `waitFor` timeout. A `fireEvent.press` called immediately in `act()` after `render()` races the mount effect.

**How to apply:** Any context test that mutates state which is also loaded from AsyncStorage on mount.

---

## RNTL 13 — getByLabelText not getByAccessibilityLabel

RNTL v13 uses `getByLabelText` / `queryByLabelText`. The old `getByAccessibilityLabel` / `queryByAccessibilityLabel` do NOT exist and throw `TypeError: ... is not a function`.

**How to apply:** All Phase 6F+ test files. Use `getByLabelText`, `getAllByRole`, `getByRole`, `getByText` — not `getByAccessibilityLabel`.

---

## ES module default export mocking — __esModule: true is REQUIRED

When mocking a module that uses `export default someObject` (ES module default), you MUST include `__esModule: true` in the factory return. Without it, Babel's `_interopRequireDefault` wraps the object in an extra `{ default: ... }` layer, causing `_api.default.X is not a function` errors inside the component.

**Root cause:** The mock factory returns `{ default: { get: fn } }`. Without `__esModule: true`, Babel's interop sees a CJS module and wraps it: `{ default: { default: { get: fn } } }`. The component's `import apiClient from '...'` resolves to `{ default: { get: fn } }` (the outer wrapper's `.default`) instead of `{ get: fn }`.

**Broken approach:**
```ts
jest.mock('../../src/lib/api', () => ({
  default: { get: (...args) => mockApiGet(...args) },
  apiClient: { get: (...args) => mockApiGet(...args) },
}));
```
The queryFn throws `_api.default.get is not a function`. TanStack Query catches it silently. `returns` stays `[]`. Wrong navigation target.

**Working approach:**
```ts
jest.mock('../../src/lib/api', () => {
  const mockClient = { get: (...args: unknown[]) => mockApiGet(...args) };
  return {
    __esModule: true,
    default: mockClient,
    apiClient: mockClient,
  };
});
```

**Why:** `__esModule: true` tells Babel NOT to double-wrap. The default export resolves directly.

**Symptom pattern to watch for:** If a TanStack Query `queryFn` calls `apiClient.get(...)` and `mockApiGet` shows 0 calls despite mock setup + the query enters `error` state with `error: {}` (empty error object deserialized from `TypeError`) — this is the `__esModule: true` bug.

**How to apply:** All mocks for `src/lib/api` and any ES module default export mock in test files.

---

## TanStack Query v5 + notifyManager — synchronous scheduler for tests

In TQ v5, the default scheduler is `setTimeout(cb, 0)` (`defaultScheduler`). In Jest (no fake timers), this means `act(async () => { await Promise.resolve(); })` is NOT sufficient to flush query result notifications — the setTimeout fires after the microtask queue but within the same event loop tick, which doesn't happen inside a single `act()`.

**Symptom:** `findByText('loaded content')` times out even though `mockApiGet.mockResolvedValue(data)` is set correctly.

**Working approach for "data loads → interaction" tests:**
```ts
import { notifyManager } from '@tanstack/react-query';

beforeEach(() => {
  notifyManager.setScheduler((cb) => cb()); // synchronous — notifications fire immediately
});
afterEach(() => {
  notifyManager.setScheduler((cb) => setTimeout(cb, 0)); // restore default
});

// In the test:
await act(async () => { /* intentionally empty — drains microtask queue */ });
// Component now has real data; proceed with interactions
```

**Why:** With synchronous scheduler, TQ fires state notifications in the same synchronous call stack as the queryFn resolution. One `act(async () => {})` is then sufficient to drain the chain.

**Do NOT use** `findByText(...)` to wait for data from a query with `placeholderData: []` — in TQ v5 `placeholderData` sets `status: 'success'` immediately so `isLoading = false` from the first render, and the empty-state renders instead of skeleton. The real data only appears AFTER the queryFn resolves.

**How to apply:** All tests that need to verify component behavior AFTER async query data loads (not just the loading state).

---

## 2-stage biometric Alert (view-time + submit-time) — counting call order

For screens with two separate biometric Alert challenges (LoanPackagePreviewScreen pattern), use a `callCount` array that pushes the title of each Alert call. Assert `alertCalls[0]` === view-time key and `alertCalls[1]` === submit-time key. Do NOT assert `callCount >= 2` without driving the submit flow — the second Alert only fires after user presses "Submit" then confirms the modal.

**Pattern:**
```ts
const alertCalls: string[] = [];
alertSpy.mockImplementation((title, _msg, buttons) => {
  alertCalls.push(title);
  if (Array.isArray(buttons) && buttons[1]) buttons[1].onPress?.();
});
// Verify order:
expect(alertCalls[0]).toBe('mobile.loan.preview.bio.gate.prompt');   // view-time
expect(alertCalls[1]).toBe('mobile.loan.preview.bio.submitPrompt');  // submit-time
```

**How to apply:** LoanPackagePreviewScreen tests and any future screen with multi-stage auth prompts.
