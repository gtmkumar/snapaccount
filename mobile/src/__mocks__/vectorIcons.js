/**
 * Mock for @expo/vector-icons
 * Prevents native module resolution (ExponentConstants, etc.) during tests.
 * Uses a string element ('span') instead of react-native Text to avoid
 * triggering TurboModuleRegistry / __fbBatchedBridgeConfig invariant.
 */
'use strict';

const React = require('react');

// Use a plain string element to avoid importing any react-native component
const IconMock = (props) =>
  React.createElement('Text', { testID: props.testID }, props.name || '');

const handler = {
  get: (_target, prop) => IconMock,
};

const proxy = new Proxy({}, handler);

module.exports = proxy;
module.exports.default = proxy;
module.exports.Ionicons = IconMock;
module.exports.MaterialIcons = IconMock;
module.exports.FontAwesome = IconMock;
module.exports.AntDesign = IconMock;
module.exports.Feather = IconMock;
module.exports.MaterialCommunityIcons = IconMock;
