/**
 * useCamera hook — Document capture helpers
 */

import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MediaTypeOptions } from 'expo-image-picker';

export function useCamera() {
  const captureFromCamera = async (): Promise<string | null> => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Camera Permission Required',
        'Please enable camera access in Settings to capture documents.',
      );
      return null;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
    });

    if (result.canceled || !result.assets[0]) return null;
    return result.assets[0].uri;
  };

  const selectFromGallery = async (multiple = false): Promise<string[]> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Gallery Permission Required',
        'Please enable photo library access in Settings.',
      );
      return [];
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: MediaTypeOptions.Images,
      quality: 0.9,
      allowsMultipleSelection: multiple,
      selectionLimit: multiple ? 10 : 1,
    });

    if (result.canceled) return [];
    return result.assets.map((asset) => asset.uri);
  };

  return { captureFromCamera, selectFromGallery };
}
