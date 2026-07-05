/**
 * SettingsScreen — Haptics / Network / Security preference surface (DG-MOBUX-03).
 * docs/design/mobile/ux/haptics-and-celebrations.md §3 (Accessibility → Haptics),
 * network-aware-ux.md §9 (Settings → Network + Settings → Security incl. the
 * biometric grace window).
 *
 * Persistence:
 *   - Haptics → useHaptics' own AsyncStorage key (setHapticsEnabled).
 *   - Network + Security → appSettings (AsyncStorage). These are UX preferences,
 *     NOT secrets — SecureStore is reserved for tokens/KYC per the project rule.
 */

import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useAppSettings } from '../../hooks/useAppSettings';
import { setHapticsEnabled, useHaptics } from '../../hooks/useHaptics';
import type { BiometricGraceWindow } from '../../lib/appSettings';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'Settings'>;
interface Props { navigation: NavProp }

const GRACE_OPTIONS: BiometricGraceWindow[] = ['5min', '1min', 'never'];

export function SettingsScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { settings, update } = useAppSettings();
  const haptics = useHaptics();

  // Haptics is owned by useHaptics (its own AsyncStorage key). useHaptics loads
  // the persisted value asynchronously and re-renders, so we read haptics.enabled
  // as the source of truth and keep a local override only for the brief window
  // before the toggle's write round-trips.
  const [hapticsOverride, setHapticsOverride] = useState<boolean | null>(null);
  const hapticsOn = hapticsOverride ?? haptics.enabled;

  const toggleHaptics = (v: boolean) => {
    setHapticsOverride(v);
    void setHapticsEnabled(v);
    if (v) haptics.lightTap(); // give immediate feedback when enabling
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.common.back')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.title}>{t('mobile.settings.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ── Accessibility / Haptics ───────────────────────────────────────── */}
        <Section title={t('mobile.settings.section.accessibility')} styles={styles}>
          <ToggleRow
            icon="pulse-outline"
            label={t('mobile.settings.haptics.label')}
            desc={t('mobile.settings.haptics.desc')}
            value={hapticsOn}
            onValueChange={toggleHaptics}
            tokens={tokens}
            styles={styles}
            testID="settings-haptics-toggle"
          />
        </Section>

        {/* ── Network ───────────────────────────────────────────────────────── */}
        <Section title={t('mobile.settings.section.network')} styles={styles}>
          <ToggleRow
            icon="cellular-outline"
            label={t('mobile.settings.network.autoUploadCellular')}
            desc={t('mobile.settings.network.autoUploadCellularDesc')}
            value={settings.autoUploadOnCellular}
            onValueChange={(v) => void update('autoUploadOnCellular', v)}
            tokens={tokens}
            styles={styles}
            testID="settings-cellular-toggle"
          />
          <ToggleRow
            icon="contract-outline"
            label={t('mobile.settings.network.compress')}
            desc={t('mobile.settings.network.compressDesc')}
            value={settings.compressBeforeUpload}
            onValueChange={(v) => void update('compressBeforeUpload', v)}
            tokens={tokens}
            styles={styles}
            testID="settings-compress-toggle"
          />
          <ToggleRow
            icon="wifi-outline"
            label={t('mobile.settings.network.showChip')}
            desc={t('mobile.settings.network.showChipDesc')}
            value={settings.showNetworkChip}
            onValueChange={(v) => void update('showNetworkChip', v)}
            tokens={tokens}
            styles={styles}
            testID="settings-chip-toggle"
          />
        </Section>

        {/* ── Security ──────────────────────────────────────────────────────── */}
        <Section title={t('mobile.settings.section.security')} styles={styles}>
          <ToggleRow
            icon="finger-print-outline"
            label={t('mobile.settings.security.requireBiometric')}
            desc={t('mobile.settings.security.requireBiometricDesc')}
            value={settings.requireBiometricSensitive}
            onValueChange={(v) => void update('requireBiometricSensitive', v)}
            tokens={tokens}
            styles={styles}
            testID="settings-biometric-toggle"
          />

          {/* Grace window radio group — disabled when biometric gate is off. */}
          <View
            style={[styles.graceWrap, !settings.requireBiometricSensitive && styles.graceDisabled]}
            accessibilityRole="radiogroup"
          >
            <Text style={styles.graceLabel}>{t('mobile.settings.security.graceWindow')}</Text>
            <View style={styles.graceOptions}>
              {GRACE_OPTIONS.map((opt) => {
                const selected = settings.biometricGraceWindow === opt;
                return (
                  <Pressable
                    key={opt}
                    style={[
                      styles.graceChip,
                      selected
                        ? { backgroundColor: tokens.brand500, borderColor: tokens.brand500 }
                        : { backgroundColor: tokens.sunken, borderColor: tokens.border },
                    ]}
                    onPress={() => void update('biometricGraceWindow', opt)}
                    disabled={!settings.requireBiometricSensitive}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, checked: selected }}
                    accessibilityLabel={t(`mobile.settings.security.grace.${opt}`)}
                    testID={`settings-grace-${opt}`}
                  >
                    <Text
                      style={[
                        styles.graceChipText,
                        { color: selected ? tokens.textOnBrand : tokens.textSecondary },
                      ]}
                    >
                      {t(`mobile.settings.security.grace.${opt}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.graceDesc}>{t('mobile.settings.security.graceWindowDesc')}</Text>
          </View>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────────

function Section({
  title,
  children,
  styles,
}: {
  title: string;
  children: React.ReactNode;
  styles: ReturnType<typeof useStyles>;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function ToggleRow({
  icon,
  label,
  desc,
  value,
  onValueChange,
  tokens,
  styles,
  testID,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  desc: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  tokens: ReturnType<typeof useTheme>['tokens'];
  styles: ReturnType<typeof useStyles>;
  testID?: string;
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: tokens.brandTint }]}>
        <Ionicons name={icon} size={18} color={tokens.brand500} />
      </View>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDesc}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={label}
        testID={testID}
      />
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: tk.canvas },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: tk.raised,
      borderBottomWidth: 1,
      borderBottomColor: tk.border,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: tk.sunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { fontSize: 18, fontWeight: '700', color: tk.textPrimary, letterSpacing: -0.2 },
    scrollContent: { padding: 16, gap: 20 },
    section: { gap: 8 },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: tk.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: 4,
    },
    sectionCard: {
      backgroundColor: tk.raised,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: tk.border,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      minHeight: 60,
    },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowTextWrap: { flex: 1 },
    rowLabel: { fontSize: 15, fontWeight: '600', color: tk.textPrimary },
    rowDesc: { fontSize: 12, color: tk.textTertiary, marginTop: 2, lineHeight: 16 },
    graceWrap: {
      paddingHorizontal: 14,
      paddingTop: 4,
      paddingBottom: 14,
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: tk.border,
    },
    graceDisabled: { opacity: 0.45 },
    graceLabel: { fontSize: 14, fontWeight: '600', color: tk.textPrimary },
    graceOptions: { flexDirection: 'row', gap: 8 },
    graceChip: {
      flex: 1,
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    graceChipText: { fontSize: 14, fontWeight: '700' },
    graceDesc: { fontSize: 12, color: tk.textTertiary, lineHeight: 16 },
  }),
);
