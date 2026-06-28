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
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import NetInfo from '@react-native-community/netinfo';
import { Button } from '../../components/ui/Button';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import type { DocumentStackParamList } from '../../navigation/DocumentStack';
import { useDocumentQueue } from '../../hooks/useDocumentQueue';
import { useHaptics } from '../../hooks/useHaptics';

type NavProp = NativeStackNavigationProp<DocumentStackParamList, 'Camera'>;
interface Props { navigation: NavProp }

export function CameraScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const haptics = useHaptics();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('auto');
  const [showPreview, setShowPreview] = useState(false);
  const [previewUri, setPreviewUri] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  // DG-DOC-05: capture/gallery now route through DocumentCategoryScreen, which
  // owns the enqueue (after the user picks a category). We only read pendingCount
  // here for the upload chip.
  const { pendingCount } = useDocumentQueue();

  // Check network on mount
  React.useEffect(() => {
    NetInfo.fetch().then((s) => setIsOffline(!s.isConnected));
    const unsub = NetInfo.addEventListener((s) => setIsOffline(!s.isConnected));
    return () => { unsub(); };
  }, []);

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
    // DG-MOBUX-08 / haptics §3: medium impact the instant the shutter fires.
    haptics.mediumTap();
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        base64: false,
      });
      if (photo) {
        // offline §12: light impact confirming a successful capture.
        haptics.lightTap();
        setPreviewUri(photo.uri);
        setShowPreview(true);
      }
    } catch {
      Alert.alert('Error', 'Could not capture photo. Please try again.');
    }
  };

  // DG-DOC-05: after "Use Photo" we no longer enqueue blindly — we push the
  // category-selection screen so the user (assisted by the AI suggestion banner)
  // assigns a category before the document is enqueued/uploaded.
  const handleContinueToCategory = () => {
    if (!previewUri) return;
    const uri = previewUri;
    setShowPreview(false);
    setPreviewUri('');
    const filename = `document_${Date.now()}.jpg`;
    navigation.navigate('DocumentCategory', {
      documentUri: uri,
      filename,
      source: 'camera',
    });
  };

  const handlePickFromGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo library access to upload from gallery.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsMultipleSelection: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const ext = asset.fileName?.split('.').pop()?.toLowerCase() ?? 'jpg';
      const filename = asset.fileName ?? `gallery_${Date.now()}.${ext}`;
      // DG-DOC-05: gallery uploads also flow through category selection.
      navigation.navigate('DocumentCategory', {
        documentUri: asset.uri,
        filename,
        source: 'gallery',
      });
    } catch {
      Alert.alert('Error', 'Could not pick image from gallery.');
    }
  };

  const flashIconName: Record<FlashMode, keyof typeof Ionicons.glyphMap> = {
    auto: 'flash-outline',
    on: 'flash',
    off: 'flash-off-outline',
    screen: 'sunny-outline',
  };

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        flash={flash}
      />

      {/* Overlays are SIBLINGS of CameraView, not children: nesting views inside
          CameraView crashes the Fabric renderer (new architecture) with
          "Attempt to unmount a view which has [the wrong index]" when those
          children mount/unmount (e.g. a banner appearing as the preview closes).
          box-none lets touches fall through to the camera between controls. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {/* Offline banner */}
        {isOffline && (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={16} color={tokens.warningFg} />
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
              <Ionicons name="cloud-upload-outline" size={14} color={tokens.brandCta} />
              <Text style={styles.pendingChipText}>
                {t('mobile.camera.pendingChip', { count: pendingCount })}
              </Text>
            </Pressable>
          )}

          <View style={styles.bottomRow}>
            {/* Gallery shortcut */}
            <Pressable
              style={styles.sideBtn}
              onPress={handlePickFromGallery}
              accessibilityLabel="Open gallery"
              accessibilityRole="button"
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
      </View>

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
                onPress={handleContinueToCategory}
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

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  permContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 24, backgroundColor: tk.canvas, gap: 16,
  },
  permText: { fontSize: 16, textAlign: 'center', color: tk.textSecondary, marginBottom: 16 },

  // Offline banner
  offlineBanner: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 99,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: tk.warningTint + 'F0',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  offlineBannerText: { flex: 1 },
  offlineBannerTitle: { fontSize: 13, fontWeight: '700', color: tk.warningFg },
  offlineBannerBody: { fontSize: 12, color: tk.warningFg },

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
  topBarIcon: { color: '#FFFFFF', fontSize: 16 }, // on black scrim, both modes
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
    borderColor: tk.brand400,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS, borderTopLeftRadius: 4 },
  cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS, borderTopRightRadius: 4 },
  cornerBL: { bottom: 40, left: 0, borderBottomWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 40, right: 0, borderBottomWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS, borderBottomRightRadius: 4 },
  hintBanner: { alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  hintText: { fontSize: 12, color: '#FFFFFF' }, // on black scrim, both modes

  // Bottom controls
  bottomControls: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 40, alignItems: 'center', gap: 12 },
  pendingChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: tk.brandTint, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6,
    borderWidth: 1, borderColor: tk.brandTintBorder,
    minHeight: 44,
  },
  pendingChipText: { fontSize: 12, color: tk.brandCta, fontWeight: '600' },
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
  previewTitle: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' }, // on rgba(0,0,0,0.8)
  previewActions: { flexDirection: 'row', gap: 12 },
  }),
);
