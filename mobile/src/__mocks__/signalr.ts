import { jest } from '@jest/globals';

/** Mock for @microsoft/signalr in Jest */
export const HubConnectionState = {
  Disconnected: 'Disconnected',
  Connecting: 'Connecting',
  Connected: 'Connected',
  Disconnecting: 'Disconnecting',
  Reconnecting: 'Reconnecting',
};

export const HubConnectionBuilder = jest.fn().mockImplementation(() => ({
  withUrl: jest.fn().mockReturnThis(),
  withAutomaticReconnect: jest.fn().mockReturnThis(),
  build: jest.fn().mockReturnValue({
    state: HubConnectionState.Disconnected,
    start: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    on: jest.fn(),
    off: jest.fn(),
    invoke: jest.fn(async () => undefined),
    onreconnecting: jest.fn(),
    onreconnected: jest.fn(),
    onclose: jest.fn(),
  }),
}));
