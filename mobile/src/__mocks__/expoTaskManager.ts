import { jest } from '@jest/globals';

/** Mock for expo-task-manager in Jest */
export const defineTask = jest.fn();
export const isTaskDefined = jest.fn().mockReturnValue(false);
export const isTaskRegisteredAsync = jest.fn(async () => false);
export const unregisterAllTasksAsync = jest.fn(async () => undefined);
export const getRegisteredTasksAsync = jest.fn(async () => []);
