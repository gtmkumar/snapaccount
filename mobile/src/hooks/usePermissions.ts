/**
 * usePermissions hook — Camera, notifications, storage
 */

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    const [camera, gallery, notifs] = await Promise.all([
      ImagePicker.getCameraPermissionsAsync(),
      ImagePicker.getMediaLibraryPermissionsAsync(),
      Notifications.getPermissionsAsync(),
    ]);

    setPermissions({
      camera: camera.granted,
      gallery: gallery.granted,
      notifications: notifs.granted,
    });
  };

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
