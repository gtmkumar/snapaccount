/** Mock for expo-store-review in Jest */
export const isAvailableAsync = jest.fn().mockResolvedValue(true);
export const requestReview = jest.fn().mockResolvedValue(undefined);
export const storeUrl = jest.fn().mockReturnValue('https://apps.apple.com/app/id0000000');
