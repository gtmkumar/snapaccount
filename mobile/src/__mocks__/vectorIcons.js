/**
 * Mock for @expo/vector-icons
 * Prevents native module resolution (ExponentConstants, etc.) during tests.
 */
'use strict';

const React = require('react');
const { Text } = require('react-native');

const IconMock = (props) => React.createElement(Text, { testID: props.testID }, props.name || '');

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
