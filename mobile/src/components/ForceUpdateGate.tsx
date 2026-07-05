/**
 * ForceUpdateGate — GAP-116 mobile force-update / minimum-supported-version kill-switch.
 *
 * Wraps the app shell. At launch it fetches the server version policy (GET /app/min-version):
 *   - updateRequired → a NON-dismissible full-screen block with an "Update now" CTA.
 *   - updateAvailable → a dismissible top banner nudging the user to update.
 *   - otherwise (or on any error) → renders children unchanged (fail-open).
 *
 * The check is fire-and-forget and fail-open: a network/parse failure NEVER blocks the app,
 * and children render immediately while the (fast) check is in flight to avoid a launch flash.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import {
  getAppVersionPolicy,
  type AppVersionPolicy,
} from '../api/appVersion';

interface ForceUpdateGateProps {
  children: React.ReactNode;
}

export function ForceUpdateGate({ children }: ForceUpdateGateProps): React.ReactElement {
  const [policy, setPolicy] = useState<AppVersionPolicy | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    getAppVersionPolicy().then((result) => {
      if (active) setPolicy(result);
    });
    return () => {
      active = false;
    };
  }, []);

  // Hard block — takes over the whole screen and cannot be dismissed.
  if (policy?.updateRequired) {
    return <BlockingScreen storeUrl={policy.storeUrl} />;
  }

  const showNudge = !!policy?.updateAvailable && !nudgeDismissed;

  return (
    <View style={styles.fill}>
      {children}
      {showNudge && policy && (
        <UpdateBanner
          storeUrl={policy.storeUrl}
          onDismiss={() => setNudgeDismissed(true)}
        />
      )}
    </View>
  );
}

function openStore(storeUrl: string): void {
  // Linking.openURL can reject (no handler); swallow — the screen stays as-is.
  Linking.openURL(storeUrl).catch(() => undefined);
}

function BlockingScreen({ storeUrl }: { storeUrl: string }): React.ReactElement {
  const { t } = useTranslation();
  const { tokens } = useTheme();

  return (
    <View style={[styles.block, { backgroundColor: tokens.canvas }]}>
      <ActivityIndicator
        animating={false}
        color={tokens.brand500}
        style={styles.hiddenSpinner}
      />
      <Text style={[styles.blockTitle, { color: tokens.textPrimary }]}>
        {t('mobile.appUpdate.required.title')}
      </Text>
      <Text style={[styles.blockBody, { color: tokens.textSecondary }]}>
        {t('mobile.appUpdate.required.message')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('mobile.appUpdate.cta')}
        onPress={() => openStore(storeUrl)}
        style={({ pressed }) => [
          styles.ctaButton,
          { backgroundColor: pressed ? tokens.brandCtaPressed : tokens.brandCta },
        ]}
      >
        <Text style={[styles.ctaText, { color: tokens.textOnBrand }]}>
          {t('mobile.appUpdate.cta')}
        </Text>
      </Pressable>
    </View>
  );
}

function UpdateBanner({
  storeUrl,
  onDismiss,
}: {
  storeUrl: string;
  onDismiss: () => void;
}): React.ReactElement {
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.banner,
        {
          top: insets.top + 8,
          backgroundColor: tokens.infoTint,
          borderColor: tokens.brandTintBorder,
        },
      ]}
    >
      <Text style={[styles.bannerText, { color: tokens.infoFg }]} numberOfLines={2}>
        {t('mobile.appUpdate.available.message')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('mobile.appUpdate.cta')}
        onPress={() => openStore(storeUrl)}
        hitSlop={8}
      >
        <Text style={[styles.bannerAction, { color: tokens.brandFg }]}>
          {t('mobile.appUpdate.available.action')}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('mobile.appUpdate.dismiss')}
        onPress={onDismiss}
        hitSlop={8}
      >
        <Text style={[styles.bannerDismiss, { color: tokens.textSecondary }]}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  block: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  hiddenSpinner: { height: 0, width: 0, opacity: 0 },
  blockTitle: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  blockBody: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 28,
  },
  ctaButton: {
    minHeight: 48,
    minWidth: 200,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontSize: 16, fontWeight: '600' },
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18 },
  bannerAction: { fontSize: 13, fontWeight: '700' },
  bannerDismiss: { fontSize: 15, fontWeight: '600' },
});
