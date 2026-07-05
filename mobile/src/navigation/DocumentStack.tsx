import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DocumentListScreen } from '../screens/documents/DocumentListScreen';
import { CameraScreen } from '../screens/documents/CameraScreen';
import { DocumentDetailScreen } from '../screens/documents/DocumentDetailScreen';
import { DocumentCategoryScreen } from '../screens/documents/DocumentCategoryScreen';

export type DocumentStackParamList = {
  DocumentList: undefined;
  Camera: undefined;
  DocumentDetail: { documentId: string };
  /**
   * DG-DOC-05: Category selection after capture/gallery. `documentUri` is the
   * local file:// of the captured image; `filename` is carried so the upload
   * queue keeps a stable name (and the auto-classify heuristic can read it).
   */
  DocumentCategory: { documentUri: string; filename: string; source?: 'camera' | 'gallery'; isMultiple?: boolean };
};

const Stack = createNativeStackNavigator<DocumentStackParamList>();

export function DocumentStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DocumentList" component={DocumentListScreen} />
      <Stack.Screen
        name="Camera"
        component={CameraScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="DocumentDetail" component={DocumentDetailScreen} />
      <Stack.Screen name="DocumentCategory" component={DocumentCategoryScreen} />
    </Stack.Navigator>
  );
}
