/**
 * Permission Requests Screen
 * Camera, Notifications, Storage permissions with rationale
 * Matches docs/design/screens/mobile/auth-onboarding.md §Screen 7
 */

import React, { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { usePreferencesStore } from '../../store/preferencesStore';
import type { AuthStackParamList } from '../../navigation/AuthNavigator';

type PermNavProp = NativeStackNavigationProp<AuthStackParamList, 'PermissionRequests'>;
interface Props { navigation: PermNavProp }

type PermStatus = 'idle' | 'granted' | 'denied';

interface PermissionItem {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  reason: string;
  required: boolean;
}

const PERMISSIONS: PermissionItem[] = [
  {
    id: 'camera',
    icon: 'camera-outline',
    title: 'Camera Access',
    reason: 'To photograph bills and documents. Required for core functionality.',
    required: true,
  },
  {
    id: 'notifications',
    icon: 'notifications-outline',
    title: 'Push Notifications',
    reason: 'For GST filing deadlines, ITR reminders, and expert chat messages.',
    required: false,
  },
  ...(Platform.OS === 'android'
    ? [
        {
          id: 'storage',
          icon: 'folder-outline' as keyof typeof Ionicons.glyphMap,
          title: 'Storage Access',
          reason: 'To save downloaded reports and upload documents from gallery.',
          required: false,
        },
      ]
    : []),
];

export function PermissionRequestsScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { setPermissionsGranted } = usePreferencesStore();
  const [statuses, setStatuses] = useState<Record<string, PermStatus>>(
    Object.fromEntries(PERMISSIONS.map((p) => [p.id, 'idle'])),
  );
  const [allAddressed, setAllAddressed] = useState(false);

  const setStatus = (id: string, status: PermStatus) => {
    setStatuses((prev) => {
      const updated = { ...prev, [id]: status };
      const addressed = PERMISSIONS.every((p) => updated[p.id] !== 'idle');
      setAllAddressed(addressed);
      return updated;
    });
  };

  const handleAllow = async (id: string) => {
    try {
      if (id === 'camera') {
        const result = await ImagePicker.requestCameraPermissionsAsync();
        setStatus(id, result.granted ? 'granted' : 'denied');
        if (!result.granted) {
          Alert.alert(
            'Camera Required',
            'You won\'t be able to photograph documents. You can enable this in Settings later.',
          );
        }
      } else if (id === 'notifications') {
        const result = await Notifications.requestPermissionsAsync();
        setStatus(id, result.granted ? 'granted' : 'denied');
      } else if (id === 'storage') {
        const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
        setStatus(id, result.granted ? 'granted' : 'denied');
      }
    } catch {
      setStatus(id, 'denied');
    }
  };

  const handleSkip = (id: string) => {
    if (id === 'camera') {
      Alert.alert(
        'Camera Access',
        'You won\'t be able to photograph documents. You can enable this in Settings later.',
        [{ text: 'OK', onPress: () => setStatus(id, 'denied') }],
      );
    } else {
      setStatus(id, 'denied');
    }
  };

  const handleContinue = () => {
    setPermissionsGranted();
    navigation.replace('App');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.heading}>App Permissions</Text>
        <Text style={styles.subtext}>
          We need these permissions to work effectively for you
        </Text>

        {PERMISSIONS.map((permission) => {
          const status = statuses[permission.id];
          return (
            <Card key={permission.id} style={styles.permCard}>
              <View style={styles.permHeader}>
                <View
                  style={[
                    styles.iconCircle,
                    status === 'granted' && styles.iconCircleGranted,
                    status === 'denied' && styles.iconCircleDenied,
                  ]}
                >
                  <Ionicons name={permission.icon} size={24} color={tokens.brand500} />
                </View>
                <View style={styles.permTextArea}>
                  <Text style={styles.permTitle}>{permission.title}</Text>
                  {permission.required && (
                    <Text style={styles.requiredBadge}>Required</Text>
                  )}
                </View>
                {status === 'granted' && (
                  <Text style={styles.grantedCheck}>✓</Text>
                )}
              </View>

              <Text style={styles.permReason}>{permission.reason}</Text>

              {status === 'idle' && (
                <View style={styles.permActions}>
                  <Button
                    label={`Allow ${permission.title.split(' ')[0]}`}
                    onPress={() => handleAllow(permission.id)}
                    fullWidth
                    size="md"
                  />
                  <Button
                    label="Not Now"
                    variant="ghost"
                    onPress={() => handleSkip(permission.id)}
                    fullWidth
                    size="md"
                  />
                </View>
              )}

              {status === 'granted' && (
                <Text style={styles.grantedText}>✓ Permission granted</Text>
              )}

              {status === 'denied' && (
                <Text style={styles.deniedText}>
                  Not granted — enable in device Settings if needed
                </Text>
              )}
            </Card>
          );
        })}

        {allAddressed && (
          <View style={styles.continueArea}>
            <Button
              label="Continue to SnapAccount"
              onPress={handleContinue}
              fullWidth
              size="lg"
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: tk.canvas },
  scrollContent: { padding: 24, paddingBottom: 40 },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: tk.textPrimary,
    marginBottom: 8,
  },
  subtext: {
    fontSize: 14,
    color: tk.textSecondary,
    marginBottom: 24,
    lineHeight: 20,
  },
  permCard: {
    marginBottom: 16,
    padding: 16,
  },
  permHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: tk.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleGranted: {
    backgroundColor: tk.successTintBorder,
  },
  iconCircleDenied: {
    backgroundColor: tk.sunken,
  },
  permTextArea: {
    flex: 1,
  },
  permTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: tk.textPrimary,
  },
  requiredBadge: {
    fontSize: 11,
    color: tk.errorFg,
    fontWeight: '600',
    marginTop: 2,
  },
  grantedCheck: {
    fontSize: 20,
    color: tk.successFg,
    fontWeight: '700',
  },
  permReason: {
    fontSize: 14,
    color: tk.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  permActions: {
    gap: 8,
  },
  grantedText: {
    fontSize: 13,
    color: tk.successFg,
    fontWeight: '500',
    textAlign: 'center',
  },
  deniedText: {
    fontSize: 12,
    color: tk.textTertiary,
    textAlign: 'center',
  },
  continueArea: {
    marginTop: 8,
  },
  }),
);
