/**
 * Camera Screen — Phase 6A
 * Document capture with upload queue state machine.
 * On capture: enqueues locally, shows toast, transitions QUEUED → UPLOADING → PROCESSING → READY.
 * Matches docs/design/mobile/camera-screen-deltas.md
 */

import React, { useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, CameraType, FlashMode, useCameraPermissions } from 'expo-camera';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import NetInfo from '@react-native-community/netinfo';
import { Button } from '../../components/ui/Button';
import { Colors } from '../../constants/colors';
import type { DocumentStackParamList } from '../../navigation/DocumentStack';
import { useDocumentQueue } from '../../hooks/useDocumentQueue';

type NavProp = NativeStackNavigationProp<DocumentStackParamList, 'Camera'>;
interface Props { navigation: NavProp }

export function CameraScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('auto');
  const [showPreview, setShowPreview] = useState(false);
  const [previewUri, setPreviewUri] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { enqueue, pendingCount } = useDocumentQueue();

  // Check network on mount
  React.useEffect(() => {
    NetInfo.fetch().then((s) => setIsOffline(!s.isConnected));
    const unsub = NetInfo.addEventListener((s) => setIsOffline(!s.isConnected));
    return () => { unsub(); };
  }, []);

  const showToast = () => {
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 3000);
  };

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permContainer}>
        <Text style={styles.permText}>Camera access is required to capture documents</Text>
        <Button label="Grant Camera Permission" onPress={requestPermission} />
        <Button label="Go Back" variant="ghost" onPress={() => navigation.goBack()} />
      </SafeAreaView>
    );
  }

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        base64: false,
      });
      if (photo) {
        setPreviewUri(photo.uri);
        setShowPreview(true);
      }
    } catch {
      Alert.alert('Error', 'Could not capture photo. Please try again.');
    }
  };

  const handleEnqueueAndContinue = async () => {
    if (!previewUri) return;
    setShowPreview(false);
    const filename = `document_${Date.now()}.jpg`;
    await enqueue({ localUri: previewUri, filename });
    setPreviewUri('');
    showToast();
  };

  const flashIconName: Record<FlashMode, keyof typeof Ionicons.glyphMap> = {
    auto: 'flash-outline',
    on: 'flash',
    off: 'flash-off-outline',
  };

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        flash={flash}
      >
        {/* Toast */}
        {toastVisible && (
          <View style={styles.toast} pointerEvents="none">
            <Text style={styles.toastText}>
              {t('mobile.camera.toast.savedToQueue')}
            </Text>
            <Pressable
              onPress={() => {
                setToastVisible(false);
                navigation.navigate('DocumentList' as never);
              }}
            >
              <Text style={styles.toastCta}>{t('mobile.camera.toast.savedViewCta')}</Text>
            </Pressable>
          </View>
        )}

        {/* Offline banner */}
        {isOffline && (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={16} color={Colors.warning[700]} />
            <View style={styles.offlineBannerText}>
              <Text style={styles.offlineBannerTitle}>
                {t('mobile.camera.offlineBannerTitle')}
              </Text>
              <Text style={styles.offlineBannerBody}>
                {t('mobile.camera.offlineBannerBody')}
              </Text>
            </View>
          </View>
        )}

        {/* Top bar */}
        <SafeAreaView style={styles.topBar}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.topBarBtn}
            accessibilityLabel="Close camera"
            hitSlop={8}
          >
            <Text style={styles.topBarIcon}>✕</Text>
          </Pressable>

          <View style={styles.topBarRight}>
            <Pressable
              onPress={() => {
                const modes: FlashMode[] = ['auto', 'on', 'off'];
                const next = modes[(modes.indexOf(flash) + 1) % modes.length];
                setFlash(next);
              }}
              style={styles.topBarBtn}
              hitSlop={8}
            >
              <Ionicons name={flashIconName[flash]} size={20} color="#fff" />
            </Pressable>
          </View>
        </SafeAreaView>

        {/* Edge detection overlay */}
        <View style={styles.edgeOverlay}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
          <View style={styles.hintBanner}>
            <Text style={styles.hintText}>
              Hold steady — position document within frame
            </Text>
          </View>
        </View>

        {/* Bottom controls */}
        <View style={styles.bottomControls}>
          {/* Pending upload chip */}
          {pendingCount > 0 && (
            <Pressable
              style={styles.pendingChip}
              onPress={() => navigation.navigate('DocumentList' as never)}
              accessibilityLabel={t('mobile.camera.pendingChip', { count: pendingCount })}
            >
              <Ionicons name="cloud-upload-outline" size={14} color={Colors.brand[600]} />
              <Text style={styles.pendingChipText}>
                {t('mobile.camera.pendingChip', { count: pendingCount })}
              </Text>
            </Pressable>
          )}

          <View style={styles.bottomRow}>
            {/* Gallery shortcut */}
            <Pressable
              style={styles.sideBtn}
              accessibilityLabel="Open gallery"
              hitSlop={8}
            >
              <Ionicons name="images-outline" size={22} color="#fff" />
            </Pressable>

            {/* Capture button */}
            <Pressable
              style={styles.captureBtn}
              onPress={handleCapture}
              accessibilityLabel="Capture photo"
              accessibilityRole="button"
            >
              <View style={styles.captureBtnInner} />
            </Pressable>

            {/* Flip camera */}
            <Pressable
              style={styles.sideBtn}
              onPress={() => setFacing(facing === 'back' ? 'front' : 'back')}
              accessibilityLabel="Flip camera"
              hitSlop={8}
            >
              <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
            </Pressable>
          </View>
        </View>
      </CameraView>

      {/* Preview overlay */}
      {showPreview && (
        <View style={styles.previewOverlay}>
          <SafeAreaView style={styles.previewContent}>
            <Text style={styles.previewTitle}>Photo captured</Text>
            <View style={styles.previewActions}>
              <Button
                label="Retake"
                variant="secondary"
                onPress={() => { setShowPreview(false); setPreviewUri(''); }}
              />
              <Button
                label="Use Photo"
                onPress={handleEnqueueAndContinue}
              />
            </View>
          </SafeAreaView>
        </View>
      )}
    </View>
  );
}

const CORNER_SIZE = 24;
const CORNER_THICKNESS = 3;
const OVERLAY_PADDING = 40;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  permContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 24, backgroundColor: Colors.bg.base, gap: 16,
  },
  permText: { fontSize: 16, textAlign: 'center', color: Colors.neutral[700], marginBottom: 16 },

  // Toast
  toast: {
    position: 'absolute', top: 60, left: 16, right: 16, zIndex: 100,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.neutral[900] + 'EE',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
  },
  toastText: { fontSize: 13, color: '#fff', flex: 1 },
  toastCta: { fontSize: 13, color: Colors.brand[300], fontWeight: '700', marginLeft: 12 },

  // Offline banner
  offlineBanner: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 99,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.warning[50] + 'F0',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  offlineBannerText: { flex: 1 },
  offlineBannerTitle: { fontSize: 13, fontWeight: '700', color: Colors.warning[800] },
  offlineBannerBody: { fontSize: 12, color: Colors.warning[700] },

  // Top bar
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8,
  },
  topBarBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  topBarIcon: { color: '#fff', fontSize: 16 },
  topBarRight: { flexDirection: 'row', gap: 12 },

  // Edge overlay
  edgeOverlay: {
    position: 'absolute',
    top: OVERLAY_PADDING + 60, left: OVERLAY_PADDING,
    right: OVERLAY_PADDING, bottom: OVERLAY_PADDING + 140,
    justifyContent: 'flex-end',
  },
  corner: {
    position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE,
    borderColor: Colors.brand[400],
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS, borderTopLeftRadius: 4 },
  cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS, borderTopRightRadius: 4 },
  cornerBL: { bottom: 40, left: 0, borderBottomWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 40, right: 0, borderBottomWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS, borderBottomRightRadius: 4 },
  hintBanner: { alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  hintText: { fontSize: 12, color: '#fff' },

  // Bottom controls
  bottomControls: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 40, alignItems: 'center', gap: 12 },
  pendingChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.brand[50], borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.brand[200],
    minHeight: 44,
  },
  pendingChipText: { fontSize: 12, color: Colors.brand[600], fontWeight: '600' },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 40 },
  sideBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  captureBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: 'rgba(255,255,255,0.4)',
  },
  captureBtnInner: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff',
  },

  // Preview
  previewOverlay: {
    position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center', justifyContent: 'flex-end',
  },
  previewContent: { width: '100%', padding: 24, gap: 16 },
  previewTitle: { fontSize: 20, fontWeight: '700', color: '#fff', textAlign: 'center' },
  previewActions: { flexDirection: 'row', gap: 12 },
});
