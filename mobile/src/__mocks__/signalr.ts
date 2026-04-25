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
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    off: jest.fn(),
    invoke: jest.fn().mockResolvedValue(undefined),
    onreconnecting: jest.fn(),
    onreconnected: jest.fn(),
    onclose: jest.fn(),
  }),
}));
