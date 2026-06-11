/**
 * PrivacyCenterScreen — DPDP Act 2023 self-service hub
 * Phase 7 Wave 2 | M3b (GAP-020)
 * spec: docs/design/mobile/privacy/privacy-center.md
 *
 * Entry: More tab → Privacy & Data
 * Exit: MyConsents, DataExport, CorrectionRequest, DpoContact, existing deletion flow
 */

import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  createThemedStyles,
  useTheme,
  type ThemeTokens,
} from '../../contexts/ThemeContext';
import { getMyConsents, listMyDataCorrections } from '../../api/privacy';
import { PRIVACY_CONTACT } from '../../config/privacyContact';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'PrivacyCenter'>;
interface Props { navigation: NavProp }

// IOS-03: bottom tab bar height (AppNavigator tabBar height = 56) plus a small
// breathing margin, added on top of the home-indicator safe-area inset so the
// last scroll section is fully reachable above the tab bar.
const TAB_BAR_CLEARANCE = 56 + 24;

export function PrivacyCenterScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  const { data: consentsData, isError: consentsError } = useQuery({
    queryKey: ['privacy-consents'],
    queryFn: getMyConsents,
    staleTime: 2 * 60 * 1000,
    retry: false,
  });

  const { data: correctionsData, isError: correctionsError } = useQuery({
    queryKey: ['privacy-corrections'],
    queryFn: listMyDataCorrections,
    staleTime: 2 * 60 * 1000,
    retry: false,
  });

  // AND-08: the API may return an unexpected shape (e.g. `{ items: undefined }`).
  // Never assume `items` is an array — a malformed payload must degrade to an
  // empty/unavailable summary, not a render crash.
  const consentItems = Array.isArray(consentsData?.items) ? consentsData.items : null;
  const correctionItems = Array.isArray(correctionsData?.items) ? correctionsData.items : [];

  const activeConsents = consentItems?.filter((c) => c.status === 'GRANTED').length ?? 0;
  const withdrawnConsents = consentItems?.filter((c) => c.status === 'WITHDRAWN').length ?? 0;
  const pendingCorrections = correctionItems.filter(
    (r) => r.status === 'SUBMITTED' || r.status === 'UNDER_REVIEW',
  ).length;

  // Summary is unavailable when the call failed OR returned a malformed body.
  const summaryUnavailable =
    consentsError ||
    correctionsError ||
    (consentsData !== undefined && consentItems === null);

  const navigate = (screen: keyof MoreStackParamList) => {
    (navigation.navigate as (s: string) => void)(screen);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityLabel={t('mobile.common.back')}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.privacy.center.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* IOS-03: clear the bottom tab bar (~56pt) + home-indicator inset so the
          DPO section and footer links are never clipped behind the tab bar. */}
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Intro block */}
        <View style={styles.introBlock}>
          <Text style={styles.introTitle}>{t('mobile.privacy.center.intro.title')}</Text>
          <Text style={styles.introBody}>{t('mobile.privacy.center.intro.body')}</Text>
        </View>

        {/* AND-08: graceful degradation — summary failed/malformed, but every
            privacy action below remains fully usable. */}
        {summaryUnavailable && (
          <View style={styles.summaryUnavailableBanner} testID="privacy-summary-unavailable">
            <Ionicons name="information-circle-outline" size={16} color={tokens.textSecondary} />
            <Text style={styles.summaryUnavailableText}>
              {t('mobile.privacy.center.loadError')}
            </Text>
          </View>
        )}

        {/* Nav cards */}
        <View style={styles.navList}>
          {/* My Consents */}
          <NavCard
            icon="shield-checkmark-outline"
            iconColor={tokens.brandFg}
            title={t('mobile.privacy.center.nav.consents')}
            badge={
              consentItems
                ? t('mobile.privacy.center.nav.consentsCount', { active: activeConsents, withdrawn: withdrawnConsents })
                : undefined
            }
            onPress={() => navigate('MyConsents')}
            accessibilityLabel={t('mobile.privacy.center.nav.consents')}
          />

          {/* Data Export */}
          <NavCard
            icon="cloud-download-outline"
            iconColor={tokens.successFg}
            title={t('mobile.privacy.center.nav.export')}
            onPress={() => navigate('DataExport')}
            accessibilityLabel={t('mobile.privacy.center.nav.export')}
          />

          {/* Correction Request */}
          <NavCard
            icon="create-outline"
            iconColor={tokens.loanAccent}
            title={t('mobile.privacy.center.nav.correction')}
            badge={
              pendingCorrections > 0
                ? t('mobile.privacy.center.nav.correctionPending', { count: pendingCorrections })
                : undefined
            }
            onPress={() => navigate('MyCorrections')}
            accessibilityLabel={t('mobile.privacy.center.nav.correction')}
          />

          {/* Delete my account — error tinted, routes to existing flow */}
          <NavCard
            icon="trash-outline"
            iconColor={tokens.errorFg}
            title={t('mobile.privacy.center.nav.deletion')}
            description={t('mobile.privacy.center.nav.deletionContext')}
            destructive
            onPress={() => navigate('Profile')}
            accessibilityLabel={t('mobile.privacy.center.nav.deletion')}
          />
        </View>

        {/* DPO Contact block */}
        <View style={styles.dpoCard}>
          <Text style={styles.dpoTitle}>{t('mobile.privacy.dpo.title')}</Text>
          {PRIVACY_CONTACT.isPlaceholder ? (
            // NEW-W2-007 / TL-10: DPO not appointed yet — show an honest
            // pending state instead of dead/fake contact details.
            <View style={styles.dpoPendingBanner} accessibilityRole="text">
              <Ionicons name="hourglass-outline" size={16} color={tokens.warningFg} />
              <View style={{ flex: 1 }}>
                <Text style={styles.dpoPendingTitle}>{t('mobile.privacy.dpo.pendingTitle')}</Text>
                <Text style={styles.dpoPendingBody}>{t('mobile.privacy.dpo.pendingBody')}</Text>
              </View>
            </View>
          ) : (
            <>
              <Text style={styles.dpoName}>{PRIVACY_CONTACT.dpoName}</Text>
              <Text style={styles.dpoEmail}>{PRIVACY_CONTACT.dpoEmail}</Text>
            </>
          )}
          <Text style={styles.dpoSla}>
            {t('mobile.privacy.dpo.sla', {
              ackDays: PRIVACY_CONTACT.ackDays,
              slaDays: PRIVACY_CONTACT.slaDays,
            })}
          </Text>
          <View style={styles.dpoActions}>
            {/* DPDP-4: while pending, the email CTA is disabled and exposed
                as such to AT — not a silently-broken button. */}
            <Pressable
              style={[styles.dpoBtn, PRIVACY_CONTACT.isPlaceholder && styles.dpoBtnDisabled]}
              onPress={
                PRIVACY_CONTACT.isPlaceholder
                  ? undefined
                  : () => void Linking.openURL(`mailto:${PRIVACY_CONTACT.dpoEmail}`)
              }
              disabled={PRIVACY_CONTACT.isPlaceholder}
              accessibilityRole="button"
              accessibilityState={{ disabled: PRIVACY_CONTACT.isPlaceholder }}
              accessibilityLabel={
                PRIVACY_CONTACT.isPlaceholder
                  ? t('mobile.privacy.dpo.pendingShort')
                  : t('mobile.privacy.dpo.cta.email')
              }
            >
              <Ionicons
                name="mail-outline"
                size={14}
                color={PRIVACY_CONTACT.isPlaceholder ? tokens.textDisabled : tokens.brandFg}
              />
              <Text
                style={[styles.dpoBtnText, PRIVACY_CONTACT.isPlaceholder && styles.dpoBtnTextDisabled]}
              >
                {t('mobile.privacy.dpo.cta.email')}
              </Text>
            </Pressable>
            <Pressable
              style={styles.dpoViewFull}
              onPress={() => navigate('DpoContact')}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.privacy.dpo.cta.viewFull')}
            >
              {/* DPDP-3: label via t(); chevron is decorative (not read aloud). */}
              <Text style={styles.dpoViewFullText}>{t('mobile.privacy.dpo.cta.viewFull')}</Text>
              <Ionicons name="chevron-forward" size={14} color={tokens.brandFg} />
            </Pressable>
          </View>
        </View>

        {/* Footer links */}
        <View style={styles.footerLinks}>
          <Pressable
            onPress={() => void Linking.openURL('https://snapaccount.in/privacy')}
            accessibilityRole="link"
          >
            <Text style={styles.footerLink}>{t('mobile.privacy.center.footer.policy')}</Text>
          </Pressable>
          <Text style={styles.footerSep}>·</Text>
          <Pressable
            onPress={() => void Linking.openURL('https://snapaccount.in/dpdp-rights')}
            accessibilityRole="link"
          >
            <Text style={styles.footerLink}>{t('mobile.privacy.center.footer.rights')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function NavCard({
  icon,
  iconColor,
  title,
  description,
  badge,
  destructive,
  onPress,
  accessibilityLabel,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  title: string;
  description?: string;
  badge?: string;
  destructive?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const { tokens } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      style={[styles.navCard, destructive && styles.navCardDestructive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={[styles.navCardIcon, { backgroundColor: iconColor + '15' }]}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <View style={styles.navCardContent}>
        <Text style={[styles.navCardTitle, destructive && styles.navCardTitleDestructive]}>
          {title}
        </Text>
        {description && <Text style={styles.navCardDescription} numberOfLines={2}>{description}</Text>}
        {badge && <Text style={styles.navCardBadge}>{badge}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={tokens.textTertiary} />
    </Pressable>
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
      width: 40, height: 40, borderRadius: 12,
      backgroundColor: tk.sunken,
      alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: tk.textPrimary },

    scrollContent: { padding: 16, gap: 16, paddingBottom: 32 },

    // Regulated tint card (privacy intro) — brandTint/brandFg pair, both modes.
    introBlock: {
      backgroundColor: tk.brandTint,
      borderRadius: 16,
      padding: 16,
      gap: 6,
      borderWidth: 1,
      borderColor: tk.brandTintBorder,
    },
    introTitle: { fontSize: 16, fontWeight: '800', color: tk.brandFg },
    introBody: { fontSize: 13, color: tk.brandFg, lineHeight: 20 },

    // AND-08: inline notice when the consents/corrections summary is unavailable
    summaryUnavailableBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: tk.sunken,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: tk.border,
    },
    summaryUnavailableText: { flex: 1, fontSize: 12, color: tk.textSecondary, lineHeight: 18 },

    navList: { gap: 10 },
    navCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: tk.raised,
      borderRadius: 16,
      padding: 16,
      minHeight: 64,
      borderWidth: 1,
      borderColor: tk.border,
      ...tk.elevation0,
    },
    navCardDestructive: { borderColor: tk.errorTintBorder, backgroundColor: tk.errorTint },
    navCardIcon: {
      width: 44, height: 44, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center',
    },
    navCardContent: { flex: 1, gap: 2 },
    navCardTitle: { fontSize: 15, fontWeight: '700', color: tk.textPrimary },
    navCardTitleDestructive: { color: tk.errorFg },
    navCardDescription: { fontSize: 12, color: tk.textSecondary, lineHeight: 18 },
    navCardBadge: { fontSize: 12, color: tk.textSecondary },

    dpoCard: {
      backgroundColor: tk.raised,
      borderRadius: 16,
      padding: 16,
      gap: 8,
      borderWidth: 1,
      borderColor: tk.border,
    },
    dpoTitle: { fontSize: 14, fontWeight: '700', color: tk.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
    dpoName: { fontSize: 15, fontWeight: '700', color: tk.textPrimary },
    dpoEmail: { fontSize: 14, color: tk.brandFg },
    dpoSla: { fontSize: 13, color: tk.textSecondary, lineHeight: 20 },
    dpoActions: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
    dpoBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: tk.brandTint,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 44,
    },
    dpoBtnText: { fontSize: 14, fontWeight: '600', color: tk.brandFg },
    dpoBtnDisabled: { backgroundColor: tk.sunken },
    dpoBtnTextDisabled: { color: tk.textDisabled },
    dpoViewFull: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2 },
    dpoViewFullText: { fontSize: 14, color: tk.brandFg, fontWeight: '600' },

    // NEW-W2-007: DPO appointment pending banner
    dpoPendingBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: tk.warningTint,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: tk.warningTintBorder,
    },
    dpoPendingTitle: { fontSize: 13, fontWeight: '700', color: tk.warningFg, marginBottom: 2 },
    dpoPendingBody: { fontSize: 12, color: tk.warningFg, lineHeight: 18 },

    footerLinks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    footerLink: { fontSize: 13, color: tk.brandFg },
    footerSep: { fontSize: 13, color: tk.textTertiary },
  }),
);
