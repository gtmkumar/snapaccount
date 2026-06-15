import { jest } from '@jest/globals';

/** Mock for expo-store-review in Jest */
export const isAvailableAsync = jest.fn(async () => true);
export const requestReview = jest.fn(async () => undefined);
export const storeUrl = jest.fn().mockReturnValue('https://apps.apple.com/app/id0000000');
