/**
 * Profile Screen — Redesign 2026
 * Clean profile with premium menu styling
 */

import React, { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card } from '../../components/ui/Card';
import {
  useTheme,
  createThemedStyles,
  type ThemePreference,
  type ThemeTokens,
} from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { FirebaseAuth } from '../../lib/firebase';
import { deleteAccount } from '../../lib/api';
import { useBiometricGate } from '../../hooks/useBiometricGate';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'Profile'>;
interface Props { navigation: NavProp }

function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/^\+/, '');
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return phone;
}

// DG-MOBUX-02: Profile quick-toggle cycles System → Light → Dark → System.
const THEME_CYCLE: ThemePreference[] = ['system', 'light', 'dark'];
const THEME_ICON: Record<ThemePreference, React.ComponentProps<typeof Ionicons>['name']> = {
  system: 'phone-portrait-outline',
  light: 'sunny-outline',
  dark: 'moon-outline',
};

export function ProfileScreen({ navigation }: Props) {
  const { tokens, preference, setTheme } = useTheme();
  const styles = useStyles();
  const { user, currentOrganization, signOut } = useAuthStore();
  const { t } = useTranslation();
  const { trigger: triggerBiometric } = useBiometricGate();
  const [deletingAccount, setDeletingAccount] = useState(false);

  const currentThemeLabel = t(`mobile.appearance.options.${preference}.label`);
  const cycleTheme = () => {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(preference) + 1) % THEME_CYCLE.length];
    setTheme(next);
  };

  const handleSignOut = () => {
    Alert.alert(
      t('mobile.profile.signOut.title'),
      t('mobile.profile.signOut.body'),
      [
        { text: t('mobile.common.cancel'), style: 'cancel' },
        {
          text: t('mobile.profile.signOut.confirm'),
          style: 'destructive',
          onPress: async () => {
            await FirebaseAuth.signOut();
            signOut();
          },
        },
      ],
    );
  };

  const handleDeleteAccount = async () => {
    // GAP-063 / M4: Biometric step-up before account deletion (destructive action).
    // DG-MOBUX-07: forcePrompt — destructive flows always re-verify (no grace).
    const passed = await triggerBiometric({
      promptMessage: t('mobile.biometric.prompt'),
      flowKey: 'account.delete',
      forcePrompt: true,
    });
    if (!passed) return;

    Alert.alert(
      t('mobile.profile.deleteAccount.confirmTitle'),
      t('mobile.profile.deleteAccount.confirmBody'),
      [
        { text: t('mobile.common.cancel'), style: 'cancel' },
        {
          text: t('mobile.profile.deleteAccount.confirmCta'),
          style: 'destructive',
          onPress: async () => {
            setDeletingAccount(true);
            try {
              await deleteAccount();
              await FirebaseAuth.signOut();
              signOut();
            } catch {
              setDeletingAccount(false);
              Alert.alert(
                t('mobile.profile.deleteAccount.errorTitle'),
                t('mobile.profile.deleteAccount.errorBody'),
              );
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.title}>{t('mobile.profile.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Avatar + name */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.name ?? user?.phone ?? 'U').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.userName}>{user?.name ?? t('mobile.more.defaultUserName')}</Text>
          <Text style={styles.userPhone}>{normalizePhone(user?.phone)}</Text>
          {user?.userType && (
            <View style={styles.userTypePill}>
              <Text style={styles.userTypeText}>
                {user.userType === 'business_owner'
                  ? t('mobile.profile.org.businessOwner')
                  : t('mobile.profile.org.employee')}
              </Text>
            </View>
          )}
        </View>

        {/* Organization info */}
        {currentOrganization && (
          <Card shadow="sm" style={styles.orgCard}>
            <View style={styles.orgHeader}>
              <View style={styles.orgIconWrap}>
                <Ionicons name="business" size={18} color={tokens.brand500} />
              </View>
              <View style={styles.orgInfo}>
                <Text style={styles.orgCardTitle}>{t('mobile.profile.org.currentOrg')}</Text>
                <Text style={styles.orgName}>{currentOrganization.name}</Text>
              </View>
            </View>
            {currentOrganization.gstin && (
              <View style={styles.gstinRow}>
                <Text style={styles.gstinLabel}>GSTIN</Text>
                <Text style={styles.orgGstin}>{currentOrganization.gstin}</Text>
              </View>
            )}
          </Card>
        )}

        {/* Menu items */}
        <Card shadow="sm" padding="none" style={styles.menuCard}>
          {([
            // Task #18 (GAP-060rem): Edit Business / Billing / Help now route to real screens
            { label: t('mobile.profile.menu.editBusiness'), icon: 'business-outline', color: tokens.brandCta, route: 'EditBusiness' },
            { label: t('mobile.profile.menu.identityDocuments'), icon: 'document-attach-outline', color: tokens.loanAccent, route: 'IdentityDocuments' },
            // DG-MOBUX-02: full Appearance picker (radio cards). The quick cycle-toggle below is a faster shortcut.
            { label: t('mobile.profile.menu.appearance'), icon: 'contrast-outline', color: tokens.gstAccent, route: 'Appearance' },
            { label: t('mobile.profile.menu.manageDevices'), icon: 'phone-portrait-outline', color: tokens.infoFg, route: 'Devices' },
            // AND-11: both entries intentionally open the combined
            // language + notification preferences screen (now titled
            // "Language & Notifications"); distinct testIDs since the route
            // is shared.
            { label: t('mobile.profile.menu.language'), icon: 'language-outline', color: tokens.loanAccent, route: 'NotificationPreferences', testID: 'profile-menu-language' },
            { label: t('mobile.profile.menu.notifications'), icon: 'notifications-outline', color: tokens.warningFg, route: 'NotificationPreferences', testID: 'profile-menu-notifications' },
            { label: t('mobile.profile.menu.billing'), icon: 'card-outline', color: tokens.successFg, route: 'Billing' },
            { label: t('mobile.profile.menu.help'), icon: 'help-circle-outline', color: tokens.textSecondary, route: 'Help' },
            { label: t('mobile.profile.menu.about'), icon: 'information-circle-outline', color: tokens.textSecondary },
          ] as { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string; route?: keyof MoreStackParamList; disabled?: boolean; testID?: string }[]).map((item, idx, arr) => (
            <Pressable
              key={item.label}
              style={[
                styles.menuItem,
                idx === arr.length - 1 && { borderBottomWidth: 0 },
                item.disabled && styles.menuItemDisabled,
              ]}
              disabled={item.disabled}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ disabled: !!item.disabled }}
              onPress={() => {
                if (item.disabled || !item.route) return;
                navigation.navigate(item.route as 'Devices');
              }}
              testID={item.testID ?? `profile-menu-${item.route ?? 'about'}`}
            >
              <View style={[styles.menuItemIconWrap, { backgroundColor: item.color + '12' }]}>
                <Ionicons name={item.icon} size={18} color={item.color} />
              </View>
              <Text style={styles.menuItemLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={tokens.textTertiary} />
            </Pressable>
          ))}
        </Card>

        {/* DG-MOBUX-02: quick theme cycle-toggle (System → Light → Dark). The
            full radio-card picker lives in the AppearanceScreen menu entry above. */}
        <Pressable
          style={styles.themeToggleRow}
          onPress={cycleTheme}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.appearance.quickToggle.a11y', {
            current: currentThemeLabel,
          })}
          testID="profile-theme-toggle"
        >
          <View style={[styles.menuItemIconWrap, { backgroundColor: tokens.gstAccent + '12' }]}>
            <Ionicons name={THEME_ICON[preference]} size={18} color={tokens.gstAccent} />
          </View>
          <Text style={styles.themeToggleLabel}>{t('mobile.appearance.quickToggle.label')}</Text>
          <View style={styles.themeToggleValueWrap}>
            <Text style={styles.themeToggleValue}>{currentThemeLabel}</Text>
            <Ionicons name="sync-outline" size={15} color={tokens.textTertiary} />
          </View>
        </Pressable>

        {/* Sign out */}
        <Pressable style={styles.signOutRow} onPress={handleSignOut}>
          <View style={[styles.menuItemIconWrap, { backgroundColor: tokens.errorTint }]}>
            <Ionicons name="log-out-outline" size={18} color={tokens.errorFg} />
          </View>
          <Text style={styles.signOutLabel}>{t('mobile.profile.signOut.label')}</Text>
          <Ionicons name="chevron-forward" size={16} color={tokens.textTertiary} />
        </Pressable>

        {/* Delete account — DPDP Act 2023 Right to Erasure */}
        <Pressable
          style={[styles.signOutRow, styles.deleteAccountRow]}
          onPress={handleDeleteAccount}
          disabled={deletingAccount}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.profile.deleteAccount.accessibilityLabel')}
        >
          <View style={[styles.menuItemIconWrap, { backgroundColor: tokens.errorTintBorder }]}>
            <Ionicons name="trash-outline" size={18} color={tokens.errorFg} />
          </View>
          <Text style={[styles.signOutLabel, styles.deleteAccountLabel]}>
            {deletingAccount
              ? t('mobile.profile.deleteAccount.deleting')
              : t('mobile.profile.deleteAccount.label')}
          </Text>
          {!deletingAccount && (
            <Ionicons name="chevron-forward" size={16} color={tokens.textTertiary} />
          )}
        </Pressable>

        <Text style={styles.version}>{t('mobile.profile.version')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: tk.canvas },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: tk.raised, borderBottomWidth: 1, borderBottomColor: tk.border },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: tk.sunken, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: tk.textPrimary, letterSpacing: -0.2 },
  // paddingBottom clears the bottom tab bar so the last items (Sign Out / Delete
  // account) are reachable — without it the ScrollView ends behind the tab bar.
  scrollContent: { padding: 16, gap: 16, paddingBottom: 120 },

  // Avatar section
  avatarSection: { alignItems: 'center', paddingVertical: 20 },
  avatar: { width: 80, height: 80, borderRadius: 24, backgroundColor: tk.brand500, alignItems: 'center', justifyContent: 'center', marginBottom: 14, shadowColor: tk.brand500, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  avatarText: { fontSize: 32, fontWeight: '800', color: tk.textOnBrand },
  userName: { fontSize: 22, fontWeight: '700', color: tk.textPrimary, marginBottom: 4, letterSpacing: -0.3 },
  userPhone: { fontSize: 14, color: tk.textSecondary, marginBottom: 8 },
  userTypePill: { backgroundColor: tk.brandTint, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
  userTypeText: { fontSize: 12, color: tk.brandCta, fontWeight: '600' },

  // Org card
  orgCard: { padding: 16 },
  orgHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  orgIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: tk.brandTint, alignItems: 'center', justifyContent: 'center' },
  orgInfo: { flex: 1 },
  // X-1 (a11y): meaningful labels must be ≥ neutral[500] on light surfaces.
  orgCardTitle: { fontSize: 11, color: tk.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  orgName: { fontSize: 16, fontWeight: '700', color: tk.textPrimary },
  gstinRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: tk.border },
  gstinLabel: { fontSize: 12, color: tk.textSecondary },
  orgGstin: { fontSize: 13, color: tk.textSecondary, fontFamily: Platform.OS === 'ios' ? 'SF Mono' : 'monospace', fontWeight: '500' },

  // Menu
  menuCard: { overflow: 'hidden', borderRadius: 18 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: tk.border, gap: 12 },
  menuItemDisabled: { opacity: 0.4 },
  menuItemIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menuItemLabel: { flex: 1, fontSize: 15, color: tk.textPrimary, letterSpacing: -0.1 },

  // DG-MOBUX-02: quick theme cycle-toggle
  themeToggleRow: { flexDirection: 'row', alignItems: 'center', padding: 16, minHeight: 56, backgroundColor: tk.raised, borderRadius: 18, gap: 12, shadowColor: tk.shadowColor, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  themeToggleLabel: { flex: 1, fontSize: 15, color: tk.textPrimary, letterSpacing: -0.1 },
  themeToggleValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  themeToggleValue: { fontSize: 14, fontWeight: '600', color: tk.textSecondary },

  // Sign out
  signOutRow: { flexDirection: 'row', alignItems: 'center', padding: 16, minHeight: 44, backgroundColor: tk.raised, borderRadius: 18, gap: 12, shadowColor: tk.shadowColor, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  signOutLabel: { flex: 1, fontSize: 15, color: tk.errorFg, fontWeight: '600' },
  // Delete account row — more prominent danger styling per DPDP Act 2023 UX guidance
  deleteAccountRow: { borderWidth: 1, borderColor: tk.errorTintBorder, backgroundColor: tk.errorTint },
  deleteAccountLabel: { color: tk.errorFg },
  version: { fontSize: 12, color: tk.textTertiary, textAlign: 'center', paddingVertical: 4 },
  }),
);
