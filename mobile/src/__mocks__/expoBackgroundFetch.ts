import { jest } from '@jest/globals';

/** Mock for expo-background-fetch in Jest */
export const BackgroundFetchResult = {
  NewData: 1,
  NoData: 2,
  Failed: 3,
};
export const BackgroundFetchStatus = {
  Restricted: 1,
  Denied: 2,
  Available: 3,
};
export const registerTaskAsync = jest.fn(async () => undefined);
export const unregisterTaskAsync = jest.fn(async () => undefined);
export const getStatusAsync = jest.fn(async () => BackgroundFetchStatus.Available);
