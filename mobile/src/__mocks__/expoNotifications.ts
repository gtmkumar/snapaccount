import { jest } from '@jest/globals';

export const getPermissionsAsync = jest.fn(() => Promise.resolve({ status: 'granted' }));
export const requestPermissionsAsync = jest.fn(() => Promise.resolve({ status: 'granted' }));
export const getDevicePushTokenAsync = jest.fn(() => Promise.resolve({ data: 'mock-fcm-token', type: 'fcm' }));
export const addPushTokenListener = jest.fn(() => ({ remove: jest.fn() }));
export const addNotificationResponseReceivedListener = jest.fn(() => ({ remove: jest.fn() }));
export const setNotificationHandler = jest.fn();
export const scheduleNotificationAsync = jest.fn(() => Promise.resolve('mock-id'));
