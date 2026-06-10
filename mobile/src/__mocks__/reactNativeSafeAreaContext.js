'use strict';

/**
 * Mock for react-native-safe-area-context.
 * Prevents native-module invariant failures in jest test environment.
 */
const React = require('react');

const SafeAreaProvider = ({ children }) => children;
const SafeAreaView = ({ children, style, ...props }) =>
  React.createElement('View', { testID: 'safe-area-view', style, ...props }, children);
const SafeAreaConsumer = ({ children }) => children({ insets: { top: 0, right: 0, bottom: 0, left: 0 } });
const useSafeAreaInsets = () => ({ top: 0, right: 0, bottom: 0, left: 0 });
const useSafeAreaFrame = () => ({ x: 0, y: 0, width: 375, height: 812 });
const SafeAreaInsetsContext = React.createContext({ top: 0, right: 0, bottom: 0, left: 0 });
const initialWindowMetrics = {
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
  frame: { x: 0, y: 0, width: 375, height: 812 },
};

module.exports = {
  SafeAreaProvider,
  SafeAreaView,
  SafeAreaConsumer,
  useSafeAreaInsets,
  useSafeAreaFrame,
  SafeAreaInsetsContext,
  initialWindowMetrics,
};
