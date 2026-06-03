'use strict';
// Mock for expo/src/winter/* — these modules require native bridge access
// (NativeSourceCode → TurboModuleRegistry → __fbBatchedBridgeConfig) which
// is not available in the jest-node environment.
module.exports = {
  ImportMetaRegistry: { url: null },
  installGlobal: jest.fn(),
};
