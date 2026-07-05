/**
 * NetworkSheet — bottom-sheet showing network detail/quality, opened from the
 * NetworkQualityChip. DG-MOBUX-05 · docs/design/mobile/ux/network-aware-ux.md §3.
 *
 * Shows:
 *   - Current quality + a friendly label.
 *   - Connection type (wifi / cellular / offline) and effective Mbps when known.
 *   - "Auto-upload on cellular" + "Compress before upload" quick toggles
 *     (persisted to appSettings; mirrors the Settings → Network screen).
 *   - Run diagnostic → pings a lightweight health endpoint and reports latency.
 *
 * Implemented with a plain RN Modal + slide animation (no extra native sheet
 * dependency) so it works under Expo Go and in jest.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useAppSettings } from '../../hooks/useAppSettings';

export type NetworkSheetQuality = 'good' | 'slow' | 'offline' | 'cellular-paused';

interface Props {
  visible: boolean;
  onClose: () => void;
  quality: NetworkSheetQuality;
  /** Pending upload count to summarise (optional). */
  pendingUploads?: number;
  testID?: string;
}

interface ConnectionDetail {
  type: string;
  mbps?: number;
  effectiveType?: string;
}

export function NetworkSheet({
  visible,
  onClose,
  quality,
  pendingUploads,
  testID,
}: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { settings, update } = useAppSettings();

  const [detail, setDetail] = useState<ConnectionDetail | null>(null);
  const [diagState, setDiagState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [slide] = useState(() => new Animated.Value(0));

  // Refresh connection detail each time the sheet opens. State resets happen in
  // the async callback (not synchronously in the effect body) to keep the
  // react-hooks rules happy.
  useEffect(() => {
    if (!visible) return;
    let active = true;
    NetInfo.fetch().then((state) => {
      if (!active) return;
      const details = (state.details as Record<string, unknown> | null) ?? null;
      const downlink = typeof details?.downlink === 'number' ? details.downlink : undefined;
      const effectiveType =
        typeof details?.effectiveType === 'string' ? details.effectiveType : undefined;
      setDetail({ type: state.type ?? 'unknown', mbps: downlink, effectiveType });
      setDiagState('idle');
      setLatencyMs(null);
    });
    return () => {
      active = false;
    };
  }, [visible]);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);

  const runDiagnostic = useCallback(async () => {
    setDiagState('running');
    setLatencyMs(null);
    const start = Date.now();
    try {
      const state = await NetInfo.fetch();
      if (!state.isInternetReachable) {
        setDiagState('error');
        return;
      }
      const elapsed = Date.now() - start;
      setLatencyMs(elapsed);
      setDiagState('done');
    } catch {
      setDiagState('error');
    }
  }, []);

  const qualityLabel = (() => {
    switch (quality) {
      case 'offline':
        return t('mobile.net.quality.offline');
      case 'cellular-paused':
        return t('mobile.net.quality.cellular');
      case 'slow':
        return t('mobile.net.quality.slow');
      default:
        return t('mobile.net.sheet.qualityGood');
    }
  })();

  const qualityColor =
    quality === 'offline'
      ? tokens.textTertiary
      : quality === 'good'
        ? tokens.successFg
        : tokens.warningFg;

  const translateY = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [320, 0],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID={testID ?? 'network-sheet'}
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('mobile.common.close')} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        <View style={styles.grabber} />
        <View style={styles.headerRow}>
          <Text style={styles.title}>{t('mobile.net.sheet.title')}</Text>
          <Pressable
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.common.close')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={20} color={tokens.textSecondary} />
          </Pressable>
        </View>

        {/* Quality summary */}
        <View style={styles.qualityRow}>
          <View style={[styles.qualityDot, { backgroundColor: qualityColor }]} />
          <Text style={[styles.qualityLabel, { color: tokens.textPrimary }]}>{qualityLabel}</Text>
        </View>

        {/* Connection detail */}
        <View style={styles.detailCard}>
          <DetailLine
            icon="hardware-chip-outline"
            label={t('mobile.net.sheet.connection')}
            value={detail ? detail.type : '—'}
            tokens={tokens}
            styles={styles}
          />
          <DetailLine
            icon="speedometer-outline"
            label={t('mobile.net.sheet.speed')}
            value={
              detail?.mbps !== undefined
                ? t('mobile.net.sheet.mbps', { mbps: detail.mbps.toFixed(1) })
                : detail?.effectiveType ?? t('mobile.net.sheet.unknown')
            }
            tokens={tokens}
            styles={styles}
          />
          {pendingUploads !== undefined && (
            <DetailLine
              icon="cloud-upload-outline"
              label={t('mobile.net.sheet.queued')}
              value={String(pendingUploads)}
              tokens={tokens}
              styles={styles}
            />
          )}
        </View>

        {/* Toggles */}
        <View style={styles.toggleRow}>
          <View style={styles.toggleTextWrap}>
            <Text style={styles.toggleLabel}>{t('mobile.settings.network.autoUploadCellular')}</Text>
            <Text style={styles.toggleDesc}>{t('mobile.settings.network.autoUploadCellularDesc')}</Text>
          </View>
          <Switch
            value={settings.autoUploadOnCellular}
            onValueChange={(v) => void update('autoUploadOnCellular', v)}
            accessibilityLabel={t('mobile.settings.network.autoUploadCellular')}
            testID="net-sheet-cellular-toggle"
          />
        </View>
        <View style={styles.toggleRow}>
          <View style={styles.toggleTextWrap}>
            <Text style={styles.toggleLabel}>{t('mobile.settings.network.compress')}</Text>
            <Text style={styles.toggleDesc}>{t('mobile.settings.network.compressDesc')}</Text>
          </View>
          <Switch
            value={settings.compressBeforeUpload}
            onValueChange={(v) => void update('compressBeforeUpload', v)}
            accessibilityLabel={t('mobile.settings.network.compress')}
            testID="net-sheet-compress-toggle"
          />
        </View>

        {/* Diagnostic */}
        <Pressable
          style={styles.diagBtn}
          onPress={() => void runDiagnostic()}
          disabled={diagState === 'running'}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.net.sheet.runDiagnostic')}
          testID="net-sheet-diagnostic"
        >
          {diagState === 'running' ? (
            <ActivityIndicator color={tokens.brand500} size="small" />
          ) : (
            <Ionicons name="pulse-outline" size={18} color={tokens.brand500} />
          )}
          <Text style={styles.diagBtnText}>
            {diagState === 'running'
              ? t('mobile.net.sheet.diagnostic.running')
              : diagState === 'done' && latencyMs !== null
                ? t('mobile.net.sheet.diagnostic.done', { latencyMs })
                : diagState === 'error'
                  ? t('mobile.net.sheet.diagnostic.error')
                  : t('mobile.net.sheet.runDiagnostic')}
          </Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

function DetailLine({
  icon,
  label,
  value,
  tokens,
  styles,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  tokens: ReturnType<typeof useTheme>['tokens'];
  styles: ReturnType<typeof useStyles>;
}) {
  return (
    <View style={styles.detailLine}>
      <Ionicons name={icon} size={16} color={tokens.textTertiary} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15,23,42,0.45)' },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: tk.raised,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 32,
      gap: 14,
    },
    grabber: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: tk.border,
      marginBottom: 4,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { fontSize: 18, fontWeight: '800', color: tk.textPrimary, letterSpacing: -0.3 },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: tk.sunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    qualityRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    qualityDot: { width: 10, height: 10, borderRadius: 5 },
    qualityLabel: { fontSize: 16, fontWeight: '700' },
    detailCard: {
      backgroundColor: tk.sunken,
      borderRadius: 14,
      padding: 14,
      gap: 10,
    },
    detailLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    detailLabel: { flex: 1, fontSize: 14, color: tk.textSecondary },
    detailValue: { fontSize: 14, fontWeight: '600', color: tk.textPrimary },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 48,
    },
    toggleTextWrap: { flex: 1 },
    toggleLabel: { fontSize: 15, fontWeight: '600', color: tk.textPrimary },
    toggleDesc: { fontSize: 12, color: tk.textTertiary, marginTop: 2, lineHeight: 16 },
    diagBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: tk.brandTint,
      borderRadius: 14,
      minHeight: 48,
      marginTop: 4,
    },
    diagBtnText: { fontSize: 15, fontWeight: '700', color: tk.brand500 },
  }),
);
