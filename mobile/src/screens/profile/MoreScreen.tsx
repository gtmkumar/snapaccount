/**
 * More Screen — Redesign 2026
 * Clean hub with premium card styling
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card } from '../../components/ui/Card';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'More'>;
interface Props { navigation: NavProp }

function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/^\+/, '');
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return phone;
}

export function MoreScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const isOwner = user?.userType === 'business_owner';

  const menuItems: {
    label: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    route: keyof MoreStackParamList;
    color: string;
    desc: string;
  }[] = [
    { label: t('mobile.more.expertChat'), icon: 'chatbubble-ellipses-outline', route: 'Chat', color: tokens.brand500, desc: t('mobile.more.expertChatDesc') },
    { label: t('mobile.more.itrFiling'), icon: 'document-text-outline', route: 'ITRDashboard', color: tokens.itrAccent, desc: t('mobile.more.itrFilingDesc') },
    // Phase 2: business owners can manage their team (members + invites).
    ...(isOwner
      ? [{
          label: t('mobile.team.menuLabel'),
          icon: 'people-outline' as React.ComponentProps<typeof Ionicons>['name'],
          route: 'Team' as keyof MoreStackParamList,
          color: tokens.brandCta,
          desc: t('mobile.team.menuDesc'),
        }]
      : []),
    { label: t('mobile.more.notifications'), icon: 'notifications-outline', route: 'NotificationCenter', color: tokens.loanAccent, desc: t('mobile.more.notificationsDesc') },
    { label: t('mobile.more.privacyData'), icon: 'shield-outline', route: 'PrivacyCenter', color: tokens.brandFg, desc: t('mobile.more.privacyDataDesc') },
    { label: t('mobile.more.profileSettings'), icon: 'person-circle-outline', route: 'Profile', color: tokens.textSecondary, desc: t('mobile.more.profileSettingsDesc') },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('mobile.more.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* User summary — AND-14: the whole card is one ≥44pt touch target
            (previously only the small chevron Pressable navigated). */}
        <Card shadow="sm" padding="none" style={styles.userCard}>
          <Pressable
            style={styles.userRow}
            onPress={() => navigation.navigate('Profile')}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.more.profileSettings')}
            testID="more-profile-card"
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(user?.name ?? 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{user?.name ?? t('mobile.more.defaultUserName')}</Text>
              <Text style={styles.userPhone}>{normalizePhone(user?.phone)}</Text>
            </View>
            {/* Decorative affordance only — the row itself is the button */}
            <View style={styles.editBtn}>
              <Ionicons name="chevron-forward" size={20} color={tokens.textTertiary} />
            </View>
          </Pressable>
        </Card>

        {/* Menu grid */}
        <View style={styles.grid}>
          {menuItems.map((item) => (
            <Pressable
              key={item.label}
              style={styles.gridItem}
              onPress={() => (navigation.navigate as (route: string) => void)(item.route)}
            >
              <View style={[styles.gridIcon, { backgroundColor: item.color + '12' }]}>
                <Ionicons name={item.icon} size={24} color={item.color} />
              </View>
              <Text style={styles.gridLabel}>{item.label}</Text>
              {/* AND-13: allow the subtitle to wrap to 2 lines instead of
                  truncating mid-word (hi/bn strings are longer than en). */}
              <Text style={styles.gridDesc} numberOfLines={2}>{item.desc}</Text>
            </Pressable>
          ))}
        </View>

        {/* Phase 2: anyone can join an org they've been invited to via a code/link. */}
        <Pressable
          style={styles.joinRow}
          onPress={() => (navigation.navigate as (route: string) => void)('AcceptInvite')}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.auth.invite.joinEntry')}
        >
          <Ionicons name="link-outline" size={18} color={tokens.brand500} />
          <Text style={styles.joinRowText}>{t('mobile.auth.invite.joinEntry')}</Text>
          <Ionicons name="chevron-forward" size={18} color={tokens.textTertiary} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: tk.canvas },
  header: { paddingHorizontal: 20, paddingVertical: 14, backgroundColor: tk.raised, borderBottomWidth: 1, borderBottomColor: tk.border },
  headerTitle: { fontSize: 22, fontWeight: '800', color: tk.textPrimary, letterSpacing: -0.3 },
  scrollContent: { padding: 16, gap: 16 },
  userCard: { overflow: 'hidden' },
  // AND-14: padding lives on the Pressable so the full card area is tappable
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, minHeight: 56 },
  avatar: { width: 52, height: 52, borderRadius: 16, backgroundColor: tk.brand500, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '700', color: tk.textOnBrand },
  userInfo: { flex: 1 },
  userName: { fontSize: 17, fontWeight: '700', color: tk.textPrimary, letterSpacing: -0.2 },
  userPhone: { fontSize: 13, color: tk.textSecondary, marginTop: 2 },
  editBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: tk.sunken, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridItem: {
    width: '47%',
    backgroundColor: tk.raised,
    borderRadius: 18,
    padding: 18,
    shadowColor: tk.shadowColor,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  gridIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  gridLabel: { fontSize: 15, fontWeight: '700', color: tk.textPrimary, marginBottom: 4, letterSpacing: -0.2 },
  gridDesc: { fontSize: 12, color: tk.textSecondary, lineHeight: 16 },
  joinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: tk.raised,
    borderRadius: 16,
    padding: 16,
    minHeight: 56,
  },
  joinRowText: { flex: 1, fontSize: 15, fontWeight: '600', color: tk.textPrimary },
  }),
);
