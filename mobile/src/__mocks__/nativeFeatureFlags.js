'use strict';

/**
 * Mock for react-native internal feature flags native module.
 * Prevents __fbBatchedBridgeConfig invariant failures in jest.
 */
module.exports = {
  __esModule: true,
  default: {},
  isLayoutAnimationEnabled: () => false,
  isNewArchEnabled: () => false,
  commonTestFlags: {},
  jsOnlyFlags: {},
};
