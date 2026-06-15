import { jest } from '@jest/globals';

/** Mock for expo-haptics in Jest */
export const NotificationFeedbackType = {
  Success: 'success',
  Warning: 'warning',
  Error: 'error',
};
export const ImpactFeedbackStyle = {
  Light: 'light',
  Medium: 'medium',
  Heavy: 'heavy',
};
export const notificationAsync = jest.fn(async () => undefined);
export const impactAsync = jest.fn(async () => undefined);
export const selectionAsync = jest.fn(async () => undefined);
