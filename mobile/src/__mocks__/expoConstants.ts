/** Mock for expo-constants in Jest */
const Constants = {
  expoConfig: {
    extra: {
      apiBaseUrl: 'http://localhost:5000',
    },
    name: 'SnapAccount',
    version: '1.0.0',
  },
  manifest: null,
  appOwnership: null,
  isDevice: false,
  platform: { ios: { bundleIdentifier: 'com.snapaccount.app' } },
  sessionId: 'test-session',
  statusBarHeight: 0,
  deviceName: 'Jest Simulator',
};

export default Constants;
