/**
 * OrganizationSwitcherScreen — GAP-045 multi-organization switching.
 *
 * Traders commonly run 2+ businesses; the session JWT carries a single
 * organizationId claim, so switching context means:
 *   1. point the auth store's currentOrganization at the chosen org
 *      (client-side scoping used across screens), then
 *   2. re-mint the session JWT via POST /auth/token/refresh-context
 *      (refreshContextAndSwap — non-fatal on failure), passing the chosen
 *      org id as a forward-compatible hint (backend org-select param is a
 *      pending backend-agent handoff — see lib/api.ts), then
 *   3. invalidate ALL react-query caches so every org-scoped list refetches
 *      under the new context.
 *
 * Reached from the More tab (current-business card). All rows are ≥56pt,
 * announced as radios with selected state for screen readers.
 */

import React from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useAuthStore, type Organization } from '../../store/authStore';
import {
  fetchOrganizations,
  refreshContextAndSwap,
  type ServerOrganization,
} from '../../lib/api';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'OrganizationSwitcher'>;
interface Props { navigation: NavProp }

function mapServerOrg(o: ServerOrganization): Organization {
  return {
    id: o.id,
    name: o.name,
    gstin: o.gstin ?? undefined,
    panNumber: o.panNumber ?? undefined,
    businessType: o.businessType ?? undefined,
    address: o.address ?? undefined,
    state: o.state ?? undefined,
    pinCode: o.pinCode ?? undefined,
    industry: o.industry ?? undefined,
    annualTurnover: o.annualTurnover ?? undefined,
  };
}

export function OrganizationSwitcherScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const currentOrganization = useAuthStore((s) => s.currentOrganization);
  const storeOrganizations = useAuthStore((s) => s.organizations);
  const setOrganizations = useAuthStore((s) => s.setOrganizations);
  const setCurrentOrganization = useAuthStore((s) => s.setCurrentOrganization);

  const [switchingId, setSwitchingId] = React.useState<string | null>(null);

  // Refetch memberships on entry — invite accepts / new orgs may post-date the
  // store snapshot. fetchOrganizations() returns [] on failure → store fallback.
  const { data: serverOrgs, isLoading } = useQuery({
    queryKey: ['organizations'],
    queryFn: fetchOrganizations,
    staleTime: 60 * 1000,
  });

  const organizations: Organization[] =
    serverOrgs && serverOrgs.length > 0
      ? serverOrgs.map(mapServerOrg)
      : storeOrganizations;

  const handleSelect = async (org: Organization) => {
    if (switchingId) return; // one switch at a time
    if (org.id === currentOrganization?.id) {
      navigation.goBack();
      return;
    }
    setSwitchingId(org.id);
    try {
      // 1. Client-side context: keep the full list, then point current at org.
      //    (setOrganizations resets current to the first entry, so set the
      //    list first and the explicit current org afterwards.)
      if (serverOrgs && serverOrgs.length > 0) {
        setOrganizations(serverOrgs.map(mapServerOrg));
      }
      setCurrentOrganization(org);

      // 2. Re-mint the session JWT (non-fatal — see refreshContextAndSwap).
      await refreshContextAndSwap(org.id);

      // 3. Drop every cached org-scoped query so screens refetch under the
      //    new context.
      await queryClient.invalidateQueries();

      AccessibilityInfo.announceForAccessibility(
        t('mobile.orgSwitcher.switched', { org: org.name }),
      );
      navigation.goBack();
    } finally {
      setSwitchingId(null);
    }
  };

  const renderItem = ({ item }: { item: Organization }) => {
    const isCurrent = item.id === currentOrganization?.id;
    const isSwitching = switchingId === item.id;
    return (
      <Pressable
        style={[styles.orgRow, isCurrent && styles.orgRowCurrent]}
        onPress={() => void handleSelect(item)}
        disabled={switchingId !== null}
        accessibilityRole="radio"
        accessibilityState={{ selected: isCurrent, disabled: switchingId !== null }}
        accessibilityLabel={
          isCurrent
            ? t('mobile.orgSwitcher.currentA11y', { org: item.name })
            : t('mobile.orgSwitcher.switchToA11y', { org: item.name })
        }
        testID={`org-row-${item.id}`}
      >
        <View style={[styles.orgIcon, isCurrent && styles.orgIconCurrent]}>
          <Ionicons
            name="business-outline"
            size={22}
            color={isCurrent ? tokens.textOnBrand : tokens.brand500}
          />
        </View>
        <View style={styles.orgInfo}>
          <Text style={styles.orgName} numberOfLines={1}>{item.name}</Text>
          {item.gstin ? (
            <Text style={styles.orgGstin} numberOfLines={1}>{item.gstin}</Text>
          ) : null}
        </View>
        {isSwitching ? (
          <ActivityIndicator size="small" color={tokens.brand500} />
        ) : isCurrent ? (
          <Ionicons name="checkmark-circle" size={24} color={tokens.successFg} />
        ) : (
          <Ionicons name="chevron-forward" size={20} color={tokens.textTertiary} />
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.common.back')}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.orgSwitcher.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {isLoading && organizations.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={tokens.brand500} />
        </View>
      ) : (
        <FlatList
          data={organizations}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          accessibilityRole="radiogroup"
          ListHeaderComponent={
            <Text style={styles.subtitle}>{t('mobile.orgSwitcher.subtitle')}</Text>
          }
          ListFooterComponent={
            organizations.length <= 1 ? (
              <View style={styles.singleOrgNote}>
                <Ionicons name="information-circle-outline" size={18} color={tokens.infoFg} />
                <Text style={styles.singleOrgNoteText}>
                  {t('mobile.orgSwitcher.singleOrgNote')}
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>{t('mobile.orgSwitcher.empty')}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
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
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: tk.sunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: tk.textPrimary, letterSpacing: -0.2 },
    headerSpacer: { width: 44 },
    listContent: { padding: 16, gap: 12 },
    subtitle: { fontSize: 14, color: tk.textSecondary, lineHeight: 20, marginBottom: 4 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emptyText: { fontSize: 14, color: tk.textSecondary, textAlign: 'center' },
    orgRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: tk.raised,
      borderRadius: 16,
      padding: 16,
      minHeight: 72,
      borderWidth: 1,
      borderColor: tk.border,
    },
    orgRowCurrent: {
      borderColor: tk.brand500,
      backgroundColor: tk.brandTint,
    },
    orgIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: tk.brandTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    orgIconCurrent: { backgroundColor: tk.brand500 },
    orgInfo: { flex: 1 },
    orgName: { fontSize: 16, fontWeight: '700', color: tk.textPrimary, letterSpacing: -0.2 },
    orgGstin: { fontSize: 12, color: tk.textSecondary, marginTop: 2, fontVariant: ['tabular-nums'] },
    singleOrgNote: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: tk.infoTint,
      borderRadius: 12,
      padding: 14,
      marginTop: 8,
    },
    singleOrgNoteText: { flex: 1, fontSize: 13, color: tk.infoFg, lineHeight: 18 },
  }),
);
