/**
 * usePermissions hook — Camera, notifications, storage
 */

import { useCallback, useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';

export interface PermissionsState {
  camera: boolean | null;
  gallery: boolean | null;
  notifications: boolean | null;
}

export function usePermissions() {
  const [permissions, setPermissions] = useState<PermissionsState>({
    camera: null,
    gallery: null,
    notifications: null,
  });

  const checkPermissions = useCallback(
    () =>
      Promise.all([
        ImagePicker.getCameraPermissionsAsync(),
        ImagePicker.getMediaLibraryPermissionsAsync(),
        Notifications.getPermissionsAsync(),
      ]).then(([camera, gallery, notifs]) => {
        // setState runs in an async callback (external-system response), not
        // synchronously inside the effect body.
        setPermissions({
          camera: camera.granted,
          gallery: gallery.granted,
          notifications: notifs.granted,
        });
      }),
    [],
  );

  useEffect(() => {
    void checkPermissions();
  }, [checkPermissions]);

  const requestCamera = async (): Promise<boolean> => {
    const result = await ImagePicker.requestCameraPermissionsAsync();
    setPermissions((prev) => ({ ...prev, camera: result.granted }));
    return result.granted;
  };

  const requestGallery = async (): Promise<boolean> => {
    const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
    setPermissions((prev) => ({ ...prev, gallery: result.granted }));
    return result.granted;
  };

  const requestNotifications = async (): Promise<boolean> => {
    const result = await Notifications.requestPermissionsAsync();
    setPermissions((prev) => ({ ...prev, notifications: result.granted }));
    return result.granted;
  };

  return {
    permissions,
    requestCamera,
    requestGallery,
    requestNotifications,
    refresh: checkPermissions,
  };
}
