'use strict';
// Mock expo/virtual/streams to prevent ReadableStream conflicts in jest.
// The real file patches the global ReadableStream with an Expo-specific
// implementation that is incompatible with the Node.js streams used by
// axios/lib/adapters/fetch.js at module load time.
// We replace it with a no-op so the stream polyfill does not run in jest.
module.exports = {};
