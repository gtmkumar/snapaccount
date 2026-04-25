/**
 * Mock for react-native/Libraries/BatchedBridge/NativeModules
 * Required for jest-expo 55 + react-native 0.76.9 compatibility.
 * jest-expo/src/preset/setup.js calls Object.defineProperty on .default,
 * which fails when .default is not a plain object (as with RN 0.76.9 ESM exports).
 */
'use strict';

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
  ImageLoader: {
    prefetchImage: jest.fn(),
    getSize: jest.fn((uri, success) => process.nextTick(() => success(320, 240))),
  },
  ImageViewManager: {
    prefetchImage: jest.fn(),
    getSize: jest.fn((uri, success) => process.nextTick(() => success(320, 240))),
  },
  LinkingManager: null,
};

module.exports = {
  __esModule: true,
  default: mockNativeModules,
  ...mockNativeModules,
};
