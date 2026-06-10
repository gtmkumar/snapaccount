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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '../../constants/colors';
import { getMyConsents, listMyDataCorrections } from '../../api/privacy';
import { PRIVACY_CONTACT } from '../../config/privacyContact';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'PrivacyCenter'>;
interface Props { navigation: NavProp }

export function PrivacyCenterScreen({ navigation }: Props) {
  const { t } = useTranslation();

  const { data: consentsData } = useQuery({
    queryKey: ['privacy-consents'],
    queryFn: getMyConsents,
    staleTime: 2 * 60 * 1000,
    retry: false,
  });

  const { data: correctionsData } = useQuery({
    queryKey: ['privacy-corrections'],
    queryFn: listMyDataCorrections,
    staleTime: 2 * 60 * 1000,
    retry: false,
  });

  const activeConsents = consentsData?.items.filter((c) => c.status === 'GRANTED').length ?? 0;
  const withdrawnConsents = consentsData?.items.filter((c) => c.status === 'WITHDRAWN').length ?? 0;
  const pendingCorrections = correctionsData?.items.filter(
    (r) => r.status === 'SUBMITTED' || r.status === 'UNDER_REVIEW',
  ).length ?? 0;

  const navigate = (screen: keyof MoreStackParamList) => {
    (navigation.navigate as (s: string) => void)(screen);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityLabel={t('mobile.common.back')}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.privacy.center.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Intro block */}
        <View style={styles.introBlock}>
          <Text style={styles.introTitle}>{t('mobile.privacy.center.intro.title')}</Text>
          <Text style={styles.introBody}>{t('mobile.privacy.center.intro.body')}</Text>
        </View>

        {/* Nav cards */}
        <View style={styles.navList}>
          {/* My Consents */}
          <NavCard
            icon="shield-checkmark-outline"
            iconColor={Colors.brand[600]}
            title={t('mobile.privacy.center.nav.consents')}
            badge={
              consentsData
                ? t('mobile.privacy.center.nav.consentsCount', { active: activeConsents, withdrawn: withdrawnConsents })
                : undefined
            }
            onPress={() => navigate('MyConsents')}
            accessibilityLabel={t('mobile.privacy.center.nav.consents')}
          />

          {/* Data Export */}
          <NavCard
            icon="cloud-download-outline"
            iconColor={Colors.success[600]}
            title={t('mobile.privacy.center.nav.export')}
            onPress={() => navigate('DataExport')}
            accessibilityLabel={t('mobile.privacy.center.nav.export')}
          />

          {/* Correction Request */}
          <NavCard
            icon="create-outline"
            iconColor={Colors.accent[500]}
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
            iconColor={Colors.error[600]}
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
          <Text style={styles.dpoName}>{PRIVACY_CONTACT.dpoName}</Text>
          <Text style={styles.dpoEmail}>{PRIVACY_CONTACT.dpoEmail}</Text>
          <Text style={styles.dpoSla}>
            {t('mobile.privacy.dpo.sla', {
              ackDays: PRIVACY_CONTACT.ackDays,
              slaDays: PRIVACY_CONTACT.slaDays,
            })}
          </Text>
          <View style={styles.dpoActions}>
            <Pressable
              style={styles.dpoBtn}
              onPress={() => void Linking.openURL(`mailto:${PRIVACY_CONTACT.dpoEmail}`)}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.privacy.dpo.cta.email')}
            >
              <Ionicons name="mail-outline" size={14} color={Colors.brand[700]} />
              <Text style={styles.dpoBtnText}>{t('mobile.privacy.dpo.cta.email')}</Text>
            </Pressable>
            <Pressable
              style={styles.dpoViewFull}
              onPress={() => navigate('DpoContact')}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.privacy.dpo.title')}
            >
              <Text style={styles.dpoViewFullText}>View full contact →</Text>
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
      <Ionicons name="chevron-forward" size={18} color={Colors.neutral[400]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface.default,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[100],
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.neutral[100],
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.neutral[900] },

  scrollContent: { padding: 16, gap: 16, paddingBottom: 32 },

  introBlock: {
    backgroundColor: Colors.brand[50],
    borderRadius: 16,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.brand[100],
  },
  introTitle: { fontSize: 16, fontWeight: '800', color: Colors.brand[900] },
  introBody: { fontSize: 13, color: Colors.brand[700], lineHeight: 20 },

  navList: { gap: 10 },
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.surface.default,
    borderRadius: 16,
    padding: 16,
    minHeight: 64,
    borderWidth: 1,
    borderColor: Colors.neutral[100],
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  navCardDestructive: { borderColor: Colors.error[200], backgroundColor: Colors.error[50] },
  navCardIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  navCardContent: { flex: 1, gap: 2 },
  navCardTitle: { fontSize: 15, fontWeight: '700', color: Colors.neutral[900] },
  navCardTitleDestructive: { color: Colors.error[700] },
  navCardDescription: { fontSize: 12, color: Colors.neutral[500], lineHeight: 18 },
  navCardBadge: { fontSize: 12, color: Colors.neutral[500] },

  dpoCard: {
    backgroundColor: Colors.surface.default,
    borderRadius: 16,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.neutral[100],
  },
  dpoTitle: { fontSize: 14, fontWeight: '700', color: Colors.neutral[700], textTransform: 'uppercase', letterSpacing: 0.4 },
  dpoName: { fontSize: 15, fontWeight: '700', color: Colors.neutral[900] },
  dpoEmail: { fontSize: 14, color: Colors.brand[600] },
  dpoSla: { fontSize: 13, color: Colors.neutral[600], lineHeight: 20 },
  dpoActions: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  dpoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.brand[50],
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  dpoBtnText: { fontSize: 14, fontWeight: '600', color: Colors.brand[700] },
  dpoViewFull: { minHeight: 44, justifyContent: 'center' },
  dpoViewFullText: { fontSize: 14, color: Colors.brand[600], fontWeight: '600' },

  footerLinks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  footerLink: { fontSize: 13, color: Colors.brand[500] },
  footerSep: { fontSize: 13, color: Colors.neutral[400] },
});
