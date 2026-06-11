/**
 * ITR Dashboard Screen — Redesign 2026
 *
 * Entry point for all ITR filing flows. Displayed as the first screen of
 * ItrStack, which is nested inside MoreStack under the "ITRDashboard" route.
 * Quick-action buttons navigate directly into the implemented ItrStack routes.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/Badge';
import {
  createThemedStyles,
  useTheme,
  type ThemeTokens,
} from '../../contexts/ThemeContext';
import apiClient from '../../lib/api';
import type { ItrStackParamList } from '../../navigation/ItrStack';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import { RequestCallbackCta } from '../../components/callbacks/RequestCallbackCta';
import { useAuthStore } from '../../store/authStore';

type NavProp = NativeStackNavigationProp<ItrStackParamList, 'ItrDashboard'>;
interface Props { navigation: NavProp }

interface ITRReturn {
  id: string;
  financialYear: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'USER_APPROVED' | 'FILING_IN_PROGRESS' | 'FILED' | 'E_VERIFIED' | 'COMPLETED';
  regime?: 'old' | 'new';
  taxPayable?: number;
  refundAmount?: number;
}

function getCurrentFY(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  return `FY ${startYear}-${String(startYear + 1).slice(-2)}`;
}

export function ITRDashboardScreen({ navigation }: Props) {
  useSensitiveScreen();
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const styles = useStyles();
  const user = useAuthStore((s) => s.user);

  const currentFY = getCurrentFY();
  const { data: returns = [], isLoading } = useQuery({
    queryKey: ['itr-returns'],
    queryFn: async () => {
      const res = await apiClient.get<ITRReturn[]>('/itr/returns');
      return res.data;
    },
    placeholderData: [],
  });

  const handleStartFiling = () => {
    navigation.navigate('EmployeeProfileWizard', { userId: user?.id ?? '' });
  };

  const handleDocChecklist = () => {
    navigation.navigate('DocChecklist', { assesseeId: user?.id ?? '' });
  };

  const handleCompareRegime = () => {
    if (returns.length > 0) {
      navigation.navigate('RegimeComparison', { filingId: returns[0].id });
    } else {
      navigation.navigate('EmployeeProfileWizard', { userId: user?.id ?? '' });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.title}>{t('mobile.itr.dashboard.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Quick actions */}
        <View style={styles.actionsRow}>
          <Pressable
            style={styles.actionBtn}
            onPress={handleStartFiling}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.itr.dashboard.action.startFiling')}
          >
            <View style={styles.actionIconWrap}>
              <Ionicons name="clipboard-outline" size={24} color={tokens.itrAccent} />
            </View>
            <Text style={styles.actionLabel}>{t('mobile.itr.dashboard.action.startFiling')}</Text>
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={handleDocChecklist}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.itr.dashboard.action.docChecklist')}
          >
            <View style={styles.actionIconWrap}>
              <Ionicons name="document-outline" size={24} color={tokens.itrAccent} />
            </View>
            <Text style={styles.actionLabel}>{t('mobile.itr.dashboard.action.docChecklist')}</Text>
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={handleCompareRegime}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.itr.dashboard.action.compareRegime')}
          >
            <View style={styles.actionIconWrap}>
              <Ionicons name="scale-outline" size={24} color={tokens.itrAccent} />
            </View>
            <Text style={styles.actionLabel}>{t('mobile.itr.dashboard.action.compareRegime')}</Text>
          </Pressable>
        </View>

        {/* Returns list */}
        <Text style={styles.sectionTitle}>{t('mobile.itr.dashboard.returnsTitle')}</Text>

        {isLoading ? (
          <View style={styles.skeleton} />
        ) : returns.length === 0 ? (
          <Card shadow="sm" padding="lg">
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="document-text-outline" size={36} color={tokens.itrAccent} />
              </View>
              <Text style={styles.emptyTitle}>{t('mobile.itr.dashboard.empty.title')}</Text>
              <Text style={styles.emptyText}>
                {t('mobile.itr.dashboard.empty.body', { fy: currentFY })}
              </Text>
            </View>
          </Card>
        ) : (
          returns.map((ret) => (
            <Card key={ret.id} shadow="sm" style={styles.returnCard}>
              <View style={styles.returnHeader}>
                <Text style={styles.returnFY}>FY {ret.financialYear}</Text>
                <StatusBadge status={ret.status} />
              </View>
              {ret.regime && (
                <View style={styles.regimePill}>
                  <Text style={styles.returnRegime}>
                    {ret.regime === 'new'
                      ? t('mobile.itr.dashboard.regime.new')
                      : t('mobile.itr.dashboard.regime.old')}
                  </Text>
                </View>
              )}
            </Card>
          ))
        )}

        {/* Callback CTA */}
        <RequestCallbackCta
          variant="card"
          category="ITR"
          onNavigateToModal={(params) =>
            navigation.navigate('RequestCallbackModal', params)
          }
          onNavigateToStatus={(callbackId) =>
            navigation.navigate('CallbackStatus', { callbackId })
          }
        />

        {/* Info banner */}
        <Card shadow="sm" style={styles.infoBanner}>
          <Text style={styles.infoTitle}>{t('mobile.itr.dashboard.features.title')}</Text>
          {(t('mobile.itr.dashboard.features.items', { returnObjects: true }) as string[]).map((item, i) => (
            <View key={i} style={styles.infoItemRow}>
              <Ionicons name="checkmark-circle" size={14} color={tokens.itrAccent} />
              <Text style={styles.infoItem}>{item}</Text>
            </View>
          ))}
        </Card>
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
    scrollContent: { padding: 16, gap: 16 },

    actionsRow: { flexDirection: 'row', gap: 12 },
    actionBtn: { flex: 1, backgroundColor: tk.raised, borderRadius: 16, padding: 16, alignItems: 'center', gap: 10, ...tk.elevation1 },
    actionIconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: tk.itrAccent + '12', alignItems: 'center', justifyContent: 'center' },
    actionLabel: { fontSize: 12, fontWeight: '600', color: tk.textSecondary, textAlign: 'center' },

    sectionTitle: { fontSize: 18, fontWeight: '700', color: tk.textPrimary, letterSpacing: -0.3 },
    skeleton: { height: 100, backgroundColor: tk.skeleton1, borderRadius: 16 },

    emptyCard: { alignItems: 'center', gap: 10 },
    emptyIconWrap: { width: 64, height: 64, borderRadius: 18, backgroundColor: tk.itrAccent + '12', alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: tk.textPrimary },
    emptyText: { fontSize: 14, color: tk.textSecondary, textAlign: 'center', lineHeight: 22 },

    returnCard: { padding: 16 },
    returnHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    returnFY: { fontSize: 16, fontWeight: '700', color: tk.textPrimary },
    regimePill: { alignSelf: 'flex-start', marginTop: 8, backgroundColor: tk.itrAccent + '12', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    returnRegime: { fontSize: 12, color: tk.itrAccent, fontWeight: '600' },

    infoBanner: { padding: 18, borderLeftWidth: 3, borderLeftColor: tk.itrAccent },
    infoTitle: { fontSize: 16, fontWeight: '700', color: tk.textPrimary, marginBottom: 12, letterSpacing: -0.2 },
    infoItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    infoItem: { fontSize: 13, color: tk.textSecondary, flex: 1, lineHeight: 18 },
  }),
);
