/**
 * Smoke + behaviour tests — CameraScreen
 * Phase 6A
 * Covers: renders with granted permission, pending-upload chip, offline banner, enqueue on capture.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: null })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
    i18n: { language: 'en' },
  }),
}));

// NetInfo: default export
jest.mock('@react-native-community/netinfo', () => {
  const mock = {
    fetch: jest.fn(() => Promise.resolve({ isConnected: true })),
    addEventListener: jest.fn(() => jest.fn()),
  };
  return { __esModule: true, default: mock };
});

// takePictureAsync mock — stored on module level so we can call it
const mockTakePicture = jest.fn(() =>
  Promise.resolve({ uri: 'file:///photos/test.jpg' }),
);

// expo-image-picker: needed by CameraScreen for gallery upload path
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: [] })),
  MediaTypeOptions: { Images: 'Images', All: 'All' },
}));

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  // CameraView: forward ref, expose takePictureAsync on the ref handle
  const CameraView = React.forwardRef(
    (props, ref) => {
      React.useImperativeHandle(ref, () => ({ takePictureAsync: mockTakePicture }));
      const { children, style, facing, flash } = props;
      return React.createElement(
        View,
        { testID: 'camera-view', style },
        children,
      );
    },
  );
  CameraView.displayName = 'CameraView';
  return {
    CameraView,
    useCameraPermissions: jest.fn(() => [{ granted: true }, jest.fn()]),
    CameraType: { back: 'back', front: 'front' },
    FlashMode: { auto: 'auto', on: 'on', off: 'off' },
  };
});

// Mock the hook — controls pendingCount independently
jest.mock('../../src/hooks/useDocumentQueue', () => ({
  useDocumentQueue: jest.fn(),
}));

import NetInfo from '@react-native-community/netinfo';
import { useDocumentQueue } from '../../src/hooks/useDocumentQueue';
import { CameraScreen } from '../../src/screens/documents/CameraScreen';

const mockEnqueue = jest.fn(() => Promise.resolve('local-id-001'));
const mockUseDocumentQueue = useDocumentQueue as jest.Mock;

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
} as never;

beforeEach(() => {
  jest.clearAllMocks();
  mockTakePicture.mockResolvedValue({ uri: 'file:///photos/test.jpg' });
  (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true });
  (NetInfo.addEventListener as jest.Mock).mockReturnValue(jest.fn());
  mockUseDocumentQueue.mockReturnValue({
    enqueue: mockEnqueue,
    pendingCount: 0,
    queue: [],
    retry: jest.fn(),
    remove: jest.fn(),
    markReady: jest.fn(),
  });
});

describe('CameraScreen', () => {
  it('renders camera view when permission is granted', () => {
    const { getByTestId } = render(<CameraScreen navigation={mockNavigation} />);
    expect(getByTestId('camera-view')).toBeTruthy();
  });

  it('shows pending-upload chip reflecting queue count', () => {
    mockUseDocumentQueue.mockReturnValue({
      enqueue: mockEnqueue,
      pendingCount: 3,
      queue: [],
      retry: jest.fn(),
      remove: jest.fn(),
      markReady: jest.fn(),
    });

    const { getByText } = render(<CameraScreen navigation={mockNavigation} />);
    // t('mobile.camera.pendingChip', { count: 3 }) via mock → 'mobile.camera.pendingChip({"count":3})'
    expect(getByText('mobile.camera.pendingChip({"count":3})')).toBeTruthy();
  });

  it('shows offline banner when NetInfo reports disconnected', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({ isConnected: false });

    const { findByText } = render(<CameraScreen navigation={mockNavigation} />);
    await findByText('mobile.camera.offlineBannerTitle');
  });

  it('calls enqueue after capture button press then "Use Photo" confirmation', async () => {
    const { getAllByRole, findByText, getByText } = render(
      <CameraScreen navigation={mockNavigation} />,
    );

    // Find the capture button by accessibilityLabel
    const buttons = getAllByRole('button');
    const captureBtn = buttons.find(
      (b) => b.props.accessibilityLabel === 'Capture photo',
    );
    expect(captureBtn).toBeTruthy();
    fireEvent.press(captureBtn!);

    // Wait for takePictureAsync to resolve and preview to appear
    const usePhotoBtn = await findByText('Use Photo');
    fireEvent.press(usePhotoBtn);

    await waitFor(() => {
      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({ localUri: 'file:///photos/test.jpg' }),
      );
    });
  });
});
