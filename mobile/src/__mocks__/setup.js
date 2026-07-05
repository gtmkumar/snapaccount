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

// ─────────────────────────────────────────────────────────────────────────────
// TurboModuleRegistry mock (Task #25 test enablement)
// RN 0.76 resolves PlatformConstants / DeviceInfo / feature-flag specs through
// TurboModuleRegistry at import time; without a bridge config the invariant in
// TurboModuleRegistry.js throws and every suite that imports a component file
// fails to even load ("__fbBatchedBridgeConfig is not set").
// `get()` returns null (callers all have JS fallbacks — feature flags use
// defaults, Appearance no-ops); `getEnforcing()` returns a permissive proxy
// whose getConstants() supplies the minimal shapes RN reads during render.
jest.mock('react-native/Libraries/TurboModule/TurboModuleRegistry', () => {
  const constantsFor = (name) => {
    switch (name) {
      case 'PlatformConstants':
        return {
          forceTouchAvailable: false,
          interfaceIdiom: 'phone',
          isTesting: true,
          reactNativeVersion: { major: 0, minor: 76, patch: 9 },
          osVersion: '17.0',
          systemName: 'iOS',
        };
      case 'DeviceInfo':
        return {
          Dimensions: {
            window: { width: 390, height: 844, scale: 3, fontScale: 1 },
            screen: { width: 390, height: 844, scale: 3, fontScale: 1 },
            windowPhysicalPixels: { width: 1170, height: 2532, scale: 3, fontScale: 1 },
            screenPhysicalPixels: { width: 1170, height: 2532, scale: 3, fontScale: 1 },
          },
        };
      case 'SourceCode':
        return { scriptURL: 'http://localhost/index.bundle' };
      default:
        return {};
    }
  };
  const makeModule = (name) =>
    new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (prop === 'getConstants') return () => constantsFor(name);
          if (prop === 'addListener' || prop === 'removeListeners') return () => {};
          return () => null;
        },
      },
    );
  return {
    __esModule: true,
    // Animated (useNativeDriver) hard-asserts that the native animated module
    // exists, so return a permissive stub for those; everything else falls
    // back to the JS default path via null.
    get: (name) => (/Animated/.test(String(name)) ? makeModule(name) : null),
    getEnforcing: (name) => makeModule(name),
  };
});

// NativeEventEmitter asserts a non-null native module on iOS; with the
// TurboModuleRegistry mock above returning null from get(), Keyboard /
// Appearance / etc. would throw at construction. Replace with a no-op emitter.
jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter', () => {
  class MockNativeEventEmitter {
    addListener() {
      return { remove: () => {} };
    }
    removeListener() {}
    removeAllListeners() {}
    removeSubscription() {}
    listenerCount() {
      return 0;
    }
    emit() {}
  }
  return { __esModule: true, default: MockNativeEventEmitter };
});

// DG-CHAT-04 (Wave 2): screens that import expo-image-picker (e.g. ChatDetailScreen attachment
// sending) would otherwise invoke the native bridge under jsdom. Provide a default global mock;
// individual tests can still override with their own jest.mock('expo-image-picker', ...).
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true, status: 'granted' })),
  requestMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true, status: 'granted' })),
  launchCameraAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: [] })),
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: [] })),
  MediaTypeOptions: { Images: 'Images', Videos: 'Videos', All: 'All' },
}));

// DG-MOBUX-06 / DG-DOC-08: the document upload queue strips EXIF + downscales
// captured photos via expo-image-manipulator and stages them under
// expo-file-system/legacy's documentDirectory before upload. Both are native
// modules; provide deterministic, bridge-free stubs so the queue logic (and any
// screen that imports useDocumentQueue) runs under jsdom. manipulateAsync echoes
// a deterministic processed uri; the legacy FileSystem stub no-ops directory
// creation/copy and reports a fixed file size for the manifest.
jest.mock('expo-image-manipulator', () => ({
  __esModule: true,
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
  FlipType: { Vertical: 'vertical', Horizontal: 'horizontal' },
  manipulateAsync: jest.fn((uri) =>
    Promise.resolve({ uri: `${uri}.processed.jpg`, width: 1024, height: 1365 }),
  ),
}));

jest.mock(
  'expo-file-system/legacy',
  () => ({
    __esModule: true,
    documentDirectory: 'file:///mock-documents/',
    makeDirectoryAsync: jest.fn(() => Promise.resolve()),
    getInfoAsync: jest.fn(() =>
      Promise.resolve({ exists: true, isDirectory: false, size: 204800, uri: 'file:///mock' }),
    ),
    copyAsync: jest.fn(() => Promise.resolve()),
    deleteAsync: jest.fn(() => Promise.resolve()),
    EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  }),
  { virtual: true },
);

// DG-AUTH-03 (B1.2): the Android SMS Retriever package is a native module
// (Google SMS Retriever API). Screens/services that import smsRetriever.ts
// lazy-require it, but the OTP-verify component test still needs a stub so the
// require resolves under jsdom. Tests can drive auto-read via the service's
// __testing.simulateMessage / globalThis.__SNAP_SIMULATE_OTP_SMS__ dev hook.
jest.mock(
  '@pushpendersingh/react-native-otp-verify',
  () => ({
    getHash: jest.fn(() => Promise.resolve(['mockAppHash1'])),
    startOtpListener: jest.fn(),
    removeListener: jest.fn(),
  }),
  { virtual: true },
);

// DG-NOTIF-05 (Phase 6E): NotificationCenterScreen's NotificationRow wraps each
// row in react-native-gesture-handler's <Swipeable>, which reaches the native
// RNGestureHandlerModule (importing the real module throws the __fbBatchedBridge
// invariant under jsdom). Provide a fully synthetic, bridge-free module exposing
// the exports the app uses. renderRightActions/renderLeftActions are not
// exercised in unit tests (they need a real pan gesture).
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View, ScrollView, FlatList, TouchableOpacity, Text } = require('react-native');
  const Swipeable = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      close: () => {},
      openLeft: () => {},
      openRight: () => {},
    }));
    return React.createElement(View, null, props.children);
  });
  const passthrough = (Comp) =>
    React.forwardRef((props, ref) => React.createElement(Comp, { ...props, ref }));
  return {
    __esModule: true,
    Swipeable,
    GestureHandlerRootView: View,
    ScrollView,
    FlatList,
    Switch: View,
    TextInput: View,
    DrawerLayoutAndroid: View,
    TouchableOpacity,
    TouchableHighlight: TouchableOpacity,
    TouchableWithoutFeedback: TouchableOpacity,
    TouchableNativeFeedback: TouchableOpacity,
    RectButton: passthrough(View),
    BaseButton: passthrough(View),
    BorderlessButton: passthrough(View),
    RawButton: passthrough(View),
    Text,
    State: {},
    Directions: {},
    gestureHandlerRootHOC: (C) => C,
    GestureDetector: ({ children }) => children,
    Gesture: new Proxy({}, { get: () => () => ({}) }),
  };
});
