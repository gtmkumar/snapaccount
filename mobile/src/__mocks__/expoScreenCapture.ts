import { jest } from '@jest/globals';

/** Mock for expo-screen-capture in Jest */
export const usePreventScreenCapture = jest.fn();
export const preventScreenCaptureAsync = jest.fn(async () => undefined);
export const allowScreenCaptureAsync = jest.fn(async () => undefined);
export const addScreenshotListener = jest.fn().mockReturnValue({ remove: jest.fn() });
