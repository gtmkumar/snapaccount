---
name: jest-expo version compatibility rule
description: jest-expo version must match the expo SDK version — use jest-expo@52.x for expo 52, not jest-expo@55.x
type: feedback
---

Always install jest-expo at the same major version as the expo SDK in package.json.

**Why:** jest-expo 55 requires expo 53+ internals (expo/src/async-require/messageSocket, expo-modules-core/src/polyfill/dangerous-internal) that don't exist in expo 52. It also uses react-native/Libraries/BatchedBridge/NativeModules in a way that breaks with RN 0.76.9 (ESM module, .default is undefined). These cause "Cannot find module" or "Object.defineProperty called on non-object" errors that cascade through the entire test suite.

**How to apply:** Before adding jest-expo to devDependencies, check `expo` version in package.json. For expo ~52.0.0, use jest-expo@52.0.6 (latest 52.x stable). Additionally:
- Add `moduleNameMapper` for `react-native/Libraries/BatchedBridge/NativeModules` → a plain JS object mock (src/__mocks__/nativeModules.js)
- Add `moduleNameMapper` for `@expo/vector-icons` → a React Text stub (src/__mocks__/vectorIcons.js) to prevent ExponentConstants native module errors
- Use `setupFilesAfterEnv` (not `setupFilesAfterFramework` which is invalid, and not `setupFiles` which runs before jest globals are available)
- Downgrade jest itself to ^29.x when using jest-expo 52 (jest 30 is incompatible)
