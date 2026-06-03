'use strict';
// Mock NativeSourceCode to prevent __fbBatchedBridgeConfig errors in jest
module.exports = {
  getConstants: () => ({ scriptURL: null }),
};
