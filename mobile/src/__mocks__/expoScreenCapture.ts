/** Mock for expo-screen-capture in Jest */
export const usePreventScreenCapture = jest.fn();
export const preventScreenCaptureAsync = jest.fn().mockResolvedValue(undefined);
export const allowScreenCaptureAsync = jest.fn().mockResolvedValue(undefined);
export const addScreenshotListener = jest.fn().mockReturnValue({ remove: jest.fn() });
