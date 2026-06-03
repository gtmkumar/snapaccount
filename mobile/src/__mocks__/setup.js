/**
 * Jest setup file that runs BEFORE jest-expo's preset/setup.js.
 * Fixes: TypeError: Object.defineProperty called on non-object
 * Root cause: react-native 0.76.9 NativeModules.js is ESM, so
 * require(...).default returns undefined in the jest environment.
 * jest-expo/src/preset/setup.js line 47 then calls Object.defineProperty
 * on undefined, which throws.
 *
 * Solution: Mock the entire BatchedBridge/NativeModules module so that
 * .default is always a plain object that accepts property descriptors.
 */
'use strict';

// Provide a plain object so jest-expo can Object.defineProperty on it.
// Note: the factory must be self-contained (no out-of-scope variables)
// because babel-jest hoists jest.mock() calls.
jest.mock('react-native/Libraries/BatchedBridge/NativeModules', () => {
  const mockNativeModules = {
    Linking: {
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
      removeEventListener: jest.fn(),
      openURL: jest.fn(() => Promise.resolve()),
      canOpenURL: jest.fn(() => Promise.resolve(true)),
      getInitialURL: jest.fn(() => Promise.resolve(null)),
    },
    AsyncStorage: {
      getItem: jest.fn(() => Promise.resolve(null)),
      setItem: jest.fn(() => Promise.resolve()),
      removeItem: jest.fn(() => Promise.resolve()),
      multiGet: jest.fn(() => Promise.resolve([])),
      multiSet: jest.fn(() => Promise.resolve()),
      multiRemove: jest.fn(() => Promise.resolve()),
      getAllKeys: jest.fn(() => Promise.resolve([])),
    },
    PlatformConstants: {
      forceTouchAvailable: false,
      interfaceIdiom: 'phone',
      isTesting: true,
      reactNativeVersion: { major: 0, minor: 76, patch: 9 },
      osVersion: '17.0',
      systemName: 'iOS',
    },
    UIManager: {
      measure: jest.fn(),
      measureInWindow: jest.fn(),
      measureLayout: jest.fn(),
      dispatchViewManagerCommand: jest.fn(),
      setJSResponder: jest.fn(),
      clearJSResponder: jest.fn(),
      configureNextLayoutAnimation: jest.fn(),
      createView: jest.fn(),
      updateView: jest.fn(),
      focus: jest.fn(),
      blur: jest.fn(),
      findSubviewIn: jest.fn(),
    },
    AccessibilityManager: {
      isReduceMotionEnabled: jest.fn(),
      isTouchExplorationEnabled: jest.fn(),
    },
    DevSettings: {
      addMenuItem: jest.fn(),
      reload: jest.fn(),
    },
    SourceCode: {
      scriptURL: null,
    },
    Timing: {
      createTimer: jest.fn(),
      deleteTimer: jest.fn(),
    },
  };
  return {
    __esModule: true,
    default: mockNativeModules,
    ...mockNativeModules,
  };
});
