/**
 * Home Screen — Redesign 2026
 * Premium financial dashboard with refined cards, better hierarchy, modern styling
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { AmountDisplay } from '../../components/ui/AmountDisplay';
import { Card } from '../../components/ui/Card';
import { ComparativeBarChart } from '../../components/shared/ComparativeBarChart';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { formatINR, formatINRCompact, getCurrentFinancialYear, timeAgo } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';
import apiClient from '../../lib/api';
import {
  getSalesExpenseSeries,
  type OverviewGranularity,
} from '../../api/accounting';
import type { HomeStackParamList } from '../../navigation/HomeStack';
import type { AppTabParamList } from '../../navigation/AppNavigator';

type HomeNavProp = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList, 'Home'>,
  BottomTabNavigationProp<AppTabParamList>
>;
interface Props { navigation: HomeNavProp }

interface DashboardMetrics {
  totalSales: number;
  totalExpenses: number;
  netPnL: number;
  gstPayable: number;
  salesTrend: number;
  expensesTrend: number;
  period: string;
}

interface ActivityItem {
  id: string;
  type: 'document' | 'gst' | 'itr' | 'loan';
  description: string;
  amount?: number;
  timestamp: string;
}

function getGstr3bDeadlineLabel(): string {
  const now = new Date();
  const month = now.toLocaleString('default', { month: 'short' });
  const year = now.getFullYear();
  return `GSTR-3B ${month} ${year}`;
}

// Brand hero gradient — deliberately identical in light and dark mode (deep
// indigo panel, white-on-brand text stays AA in both); tokens.json brand 900→700.
const HERO_GRADIENT = ['#312E81', '#4338CA'] as const;

export function HomeScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { user, currentOrganization } = useAuthStore();
  const fy = getCurrentFinancialYear();
  const gstr3bLabel = useMemo(() => getGstr3bDeadlineLabel(), []);

  // DG-DASH-04: Financial Overview Sales-vs-Expense chart period selector (D1.2).
  const [overviewGranularity, setOverviewGranularity] =
    useState<OverviewGranularity>('month');
  const organizationId = currentOrganization?.id ?? 'default';

  const {
    data: metrics,
    isLoading: metricsLoading,
    refetch: refetchMetrics,
    isRefetching,
  } = useQuery({
    queryKey: ['dashboard-metrics', currentOrganization?.id, fy.label],
    queryFn: async () => {
      const res = await apiClient.get<DashboardMetrics>('/accounting/dashboard-metrics');
      return res.data;
    },
    placeholderData: {
      totalSales: 0,
      totalExpenses: 0,
      netPnL: 0,
      gstPayable: 0,
      salesTrend: 0,
      expensesTrend: 0,
      period: fy.label,
    },
  });

  const { data: activities = [], refetch: refetchActivities } = useQuery({
    queryKey: ['recent-activities', currentOrganization?.id],
    queryFn: async () => {
      const res = await apiClient.get<ActivityItem[]>('/accounting/recent-activities?limit=5');
      return res.data;
    },
    placeholderData: [],
  });

  // DG-DASH-04: monthly/quarterly sales-vs-expense series for the chart (D1.2).
  const {
    data: overview,
    isLoading: overviewLoading,
    refetch: refetchOverview,
  } = useQuery({
    queryKey: ['sales-expense-series', organizationId, overviewGranularity, fy.label],
    queryFn: () =>
      getSalesExpenseSeries({
        organizationId,
        granularity: overviewGranularity,
        fiscalYear: String(fy.startYear),
      }),
    staleTime: 5 * 60 * 1000,
  });

  const overviewPeriods = overview?.periods ?? [];
  const salesTrend = metrics?.salesTrend ?? 0;

  const handleRefresh = useCallback(async () => {
    await Promise.all([refetchMetrics(), refetchActivities(), refetchOverview()]);
  }, [refetchMetrics, refetchActivities, refetchOverview]);

  const isRefreshing = isRefetching;
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={tokens.brand400}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Header */}
        <View style={styles.heroSection}>
          <LinearGradient
            colors={HERO_GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroTopRow}>
            <View style={styles.heroLeftCol}>
              <Text style={styles.greeting}>{greeting}</Text>
              <Text style={styles.orgName} numberOfLines={1}>
                {user?.name ?? currentOrganization?.name ?? 'My Business'}
              </Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                style={styles.headerBtn}
                onPress={() => Alert.alert('Notifications', 'Visit the More tab to see notifications.')}
                accessibilityLabel="Notifications"
              >
                <Ionicons name="notifications-outline" size={20} color="rgba(255,255,255,0.8)" />
              </Pressable>
              <Pressable
                style={styles.avatarCircle}
                accessibilityLabel="Profile"
                onPress={() => navigation.navigate('MoreTab')}
              >
                <Text style={styles.avatarText}>
                  {(user?.name ?? 'U').charAt(0).toUpperCase()}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Net P&L hero */}
          <View style={styles.heroNetPnL}>
            <Text style={styles.heroNetLabel}>Net Profit / Loss</Text>
            <AmountDisplay
              amount={metrics?.netPnL ?? 0}
              size="xl"
              colorCode={false}
              sign="auto"
              style={{ color: '#FFFFFF' }} // fixed dark hero panel — white in both modes
            />
            <View style={styles.fyPill}>
              <Text style={styles.fyPillText}>{fy.label}</Text>
            </View>
          </View>
        </View>

        {/* Metric Cards — overlapping the hero */}
        <View style={styles.metricsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.metricsScroll}
            snapToInterval={164}
            decelerationRate="fast"
          >
            <MetricCard
              title="Total Sales"
              amount={metrics?.totalSales ?? 0}
              trend={metrics?.salesTrend ?? 0}
              loading={metricsLoading}
              iconName="trending-up"
              iconColor={tokens.successFg}
              iconBg={tokens.successTint}
              onPress={() => navigation.navigate('FinancialReportsList')}
            />
            <MetricCard
              title="Expenses"
              amount={metrics?.totalExpenses ?? 0}
              trend={metrics?.expensesTrend ?? 0}
              loading={metricsLoading}
              iconName="trending-down"
              iconColor={tokens.errorFg}
              iconBg={tokens.errorTint}
              onPress={() => navigation.navigate('FinancialReportsList')}
            />
            <MetricCard
              title="GST Payable"
              amount={metrics?.gstPayable ?? 0}
              trend={0}
              loading={metricsLoading}
              iconName="receipt"
              iconColor={tokens.gstAccent}
              iconBg={tokens.gstAccent + '15'}
              onPress={() => {}}
            />
          </ScrollView>
        </View>

        {/* Financial Overview — Sales vs Expense chart + period selector (D1.2) */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('mobile.home.overview.title')}</Text>
            <View style={styles.periodSelector}>
              {(['month', 'quarter'] as OverviewGranularity[]).map((g) => {
                const active = overviewGranularity === g;
                return (
                  <Pressable
                    key={g}
                    style={[styles.periodChip, active && styles.periodChipActive]}
                    onPress={() => setOverviewGranularity(g)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={t(`mobile.home.overview.period.${g}`)}
                    testID={`overview-period-${g}`}
                  >
                    <Text
                      style={[styles.periodChipText, active && styles.periodChipTextActive]}
                    >
                      {t(`mobile.home.overview.period.${g}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Trend label — "Sales are X% higher than last month" */}
          {!overviewLoading && overviewPeriods.length > 0 && salesTrend !== 0 && (
            <View style={styles.trendLabelRow}>
              <Ionicons
                name={salesTrend >= 0 ? 'trending-up' : 'trending-down'}
                size={16}
                color={salesTrend >= 0 ? tokens.successFg : tokens.errorFg}
              />
              <Text
                style={[
                  styles.trendLabelText,
                  { color: salesTrend >= 0 ? tokens.successFg : tokens.errorFg },
                ]}
              >
                {t(
                  salesTrend >= 0
                    ? 'mobile.home.overview.trendUp'
                    : 'mobile.home.overview.trendDown',
                  { percent: Math.abs(salesTrend).toFixed(1) },
                )}
              </Text>
            </View>
          )}

          {overviewLoading ? (
            <Card shadow="sm" padding="lg">
              <View style={styles.overviewSkeleton} />
            </Card>
          ) : overviewPeriods.length > 0 ? (
            <ComparativeBarChart periods={overviewPeriods} testID="home-overview-chart" />
          ) : (
            <Card shadow="sm" padding="lg">
              <View style={styles.overviewEmpty}>
                <Ionicons name="bar-chart-outline" size={28} color={tokens.textTertiary} />
                <Text style={styles.overviewEmptyText}>
                  {t('mobile.home.overview.empty')}
                </Text>
              </View>
            </Card>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActions}>
            <QuickActionBtn
              iconName="camera-outline"
              label="Upload Bill"
              onPress={() => navigation.navigate('DocumentsTab')}
              gradient={[tokens.brand500, tokens.brandCta] as const}
            />
            <QuickActionBtn
              iconName="receipt-outline"
              label="File GST"
              onPress={() => navigation.navigate('GstTab')}
              gradient={[tokens.gstAccent, '#6D28D9'] as const}
            />
            <QuickActionBtn
              iconName="wallet-outline"
              label="Get Loan"
              onPress={() => navigation.navigate('LoanTab')}
              gradient={[tokens.loanAccent, tokens.loanAccent] as const}
            />
            <QuickActionBtn
              iconName="document-text-outline"
              label="File ITR"
              onPress={() => navigation.navigate('MoreTab')}
              gradient={['#0891B2', '#0E7490'] as const}
            />
          </View>
        </View>

        {/* GST Deadline */}
        <View style={styles.sectionContainer}>
          <Card shadow="md">
            <View style={styles.deadlineBanner}>
              <View style={styles.deadlineLeft}>
                <View style={styles.deadlineIconWrap}>
                  <Ionicons name="time-outline" size={20} color={tokens.warningFg} />
                </View>
                <View style={styles.deadlineTextBlock}>
                  <Text style={styles.deadlineBannerTitle}>{gstr3bLabel}</Text>
                  <Text style={styles.deadlineBannerSubtitle}>Due in 20 days</Text>
                </View>
              </View>
              <Pressable
                style={styles.deadlineBtn}
                onPress={() => navigation.navigate('GstTab')}
                accessibilityRole="button"
                accessibilityLabel="File GST return now"
              >
                <Text style={styles.deadlineBtnText}>File Now</Text>
                <Ionicons name="arrow-forward" size={14} color={tokens.textOnBrand} />
              </Pressable>
            </View>
          </Card>
        </View>

        {/* Recent Activity */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate('FinancialReportsList')}
            >
              <Text style={styles.viewAll}>View All</Text>
            </Pressable>
          </View>

          {activities.length === 0 ? (
            <EmptyActivityState />
          ) : (
            <Card shadow="sm">
              {activities.map((item, idx) => (
                <ActivityRow key={item.id} item={item} isLast={idx === activities.length - 1} />
              ))}
            </Card>
          )}
        </View>

        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* FAB */}
      <Pressable
        style={styles.fab}
        accessibilityLabel="Capture document"
        accessibilityRole="button"
        onPress={() => navigation.navigate('DocumentsTab')}
      >
        <Ionicons name="camera" size={24} color={tokens.textOnBrand} />
      </Pressable>
    </SafeAreaView>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

interface MetricCardProps {
  title: string;
  amount: number;
  trend: number;
  loading: boolean;
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  iconBg: string;
  onPress: () => void;
}

function MetricCard({ title, amount, trend, loading, iconName, iconColor, iconBg, onPress }: MetricCardProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const trendPositive = trend >= 0;
  return (
    <Pressable style={styles.metricCard} onPress={onPress}>
      <View style={[styles.metricIconBg, { backgroundColor: iconBg }]}>
        <Ionicons name={iconName} size={18} color={iconColor} />
      </View>
      <Text style={styles.metricTitle}>{title}</Text>
      {loading ? (
        <View style={styles.metricSkeleton} />
      ) : (
        <>
          <Text style={styles.metricAmount}>{formatINRCompact(amount)}</Text>
          {trend !== 0 && (
            <View style={[styles.trendPill, { backgroundColor: trendPositive ? tokens.successTint : tokens.errorTint }]}>
              <Ionicons
                name={trendPositive ? 'arrow-up' : 'arrow-down'}
                size={10}
                color={trendPositive ? tokens.successFg : tokens.errorFg}
              />
              <Text
                style={[styles.metricTrend, { color: trendPositive ? tokens.successFg : tokens.errorFg }]}
              >
                {Math.abs(trend).toFixed(1)}%
              </Text>
            </View>
          )}
        </>
      )}
    </Pressable>
  );
}

function QuickActionBtn({
  iconName,
  label,
  onPress,
  gradient,
}: {
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  gradient: readonly [string, string, ...string[]];
}) {
  const { tokens } = useTheme();
  const styles = useStyles();
  // AND-02: the icon was nested in an absolute-fill sibling of the
  // LinearGradient inside an overflow:hidden wrapper — on Android the glyph
  // was not painted (empty grey box). Render the icon as a normal centered
  // child above the gradient, with a solid fallback background so the tile
  // is never blank even if the native gradient view fails to draw.
  return (
    <Pressable
      style={styles.quickActionBtn}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.quickActionIconWrap, { backgroundColor: gradient[0] }]}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.quickActionGradient}
        />
        <Ionicons name={iconName} size={22} color={tokens.textOnBrand} />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </Pressable>
  );
}

function ActivityRow({ item, isLast }: { item: ActivityItem; isLast: boolean }) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const typeConfig: Record<ActivityItem['type'], { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; bg: string }> = {
    document: { icon: 'document-outline', color: tokens.brand500, bg: tokens.brandTint },
    gst: { icon: 'receipt-outline', color: tokens.gstAccent, bg: tokens.gstAccent + '15' },
    itr: { icon: 'document-text-outline', color: tokens.itrAccent, bg: tokens.itrAccent + '15' },
    loan: { icon: 'wallet-outline', color: tokens.loanAccent, bg: tokens.loanAccent + '15' },
  };
  const cfg = typeConfig[item.type] ?? typeConfig.document;

  return (
    <View style={[styles.activityRow, !isLast && styles.activityRowBorder]}>
      <View style={[styles.activityIcon, { backgroundColor: cfg.bg }]}>
        <Ionicons name={cfg.icon} size={18} color={cfg.color} />
      </View>
      <View style={styles.activityContent}>
        <Text style={styles.activityDescription} numberOfLines={1}>
          {item.description}
        </Text>
        <Text style={styles.activityTime}>{timeAgo(item.timestamp)}</Text>
      </View>
      {item.amount !== undefined && (
        <Text style={styles.activityAmount}>{formatINR(item.amount)}</Text>
      )}
    </View>
  );
}

function EmptyActivityState() {
  const { tokens } = useTheme();
  const styles = useStyles();
  return (
    <Card shadow="sm" padding="lg">
      <View style={styles.emptyActivity}>
        <View style={styles.emptyIconWrap}>
          <Ionicons name="document-outline" size={32} color={tokens.textTertiary} />
        </View>
        <Text style={styles.emptyActivityTitle}>No activity yet</Text>
        <Text style={styles.emptyActivityText}>
          Upload your first bill to get started
        </Text>
      </View>
    </Card>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tk.canvas,
  },
  scrollView: {
    flex: 1,
  },

  // Hero section
  heroSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 48,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  heroLeftCol: {
    flex: 1,
  },
  greeting: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  orgName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF', // on fixed HERO_GRADIENT — identical in both modes
    maxWidth: 200,
    letterSpacing: -0.3,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: tk.loanAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: tk.textOnBrand,
  },
  heroNetPnL: {
    alignItems: 'flex-start',
  },
  heroNetLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 6,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  fyPill: {
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  fyPillText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },

  // Metrics — overlapping hero
  metricsContainer: {
    marginTop: -28,
    marginBottom: 8,
  },
  metricsScroll: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 4,
  },
  metricCard: {
    width: 152,
    backgroundColor: tk.raised,
    borderRadius: 18,
    padding: 16,
    shadowColor: tk.shadowColor,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  metricIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  metricTitle: {
    fontSize: 12,
    color: tk.textSecondary,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  metricAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: tk.textPrimary,
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  trendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 2,
  },
  metricTrend: {
    fontSize: 11,
    fontWeight: '600',
  },
  metricSkeleton: {
    height: 24,
    backgroundColor: tk.sunken,
    borderRadius: 6,
    width: 80,
  },

  // Financial Overview
  periodSelector: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: tk.sunken,
    borderRadius: 12,
    padding: 4,
  },
  periodChip: {
    paddingHorizontal: 14,
    minHeight: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodChipActive: {
    backgroundColor: tk.raised,
  },
  periodChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: tk.textSecondary,
  },
  periodChipTextActive: {
    color: tk.brand500,
  },
  trendLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  trendLabelText: {
    fontSize: 13,
    fontWeight: '600',
  },
  overviewSkeleton: {
    height: 160,
    backgroundColor: tk.sunken,
    borderRadius: 12,
  },
  overviewEmpty: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  overviewEmptyText: {
    fontSize: 14,
    color: tk.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Sections
  sectionContainer: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: tk.textPrimary,
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  viewAll: {
    fontSize: 14,
    color: tk.brand500,
    fontWeight: '600',
  },

  // Quick actions
  quickActions: {
    flexDirection: 'row',
    gap: 12,
  },
  quickActionBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  quickActionIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionGradient: {
    ...StyleSheet.absoluteFill,
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: tk.textSecondary,
    textAlign: 'center',
  },

  // Deadline banner
  deadlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deadlineLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  deadlineIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: tk.warningTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deadlineTextBlock: {
    flex: 1,
  },
  deadlineBannerTitle: {
    fontSize: 14,
    color: tk.textPrimary,
    fontWeight: '600',
  },
  deadlineBannerSubtitle: {
    fontSize: 12,
    color: tk.warningFg,
    fontWeight: '500',
    marginTop: 1,
  },
  deadlineBtn: {
    backgroundColor: tk.warningFg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deadlineBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: tk.textOnBrand,
  },

  // Activity
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  activityRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: tk.border,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityContent: {
    flex: 1,
  },
  activityDescription: {
    fontSize: 14,
    fontWeight: '500',
    color: tk.textPrimary,
  },
  activityTime: {
    fontSize: 12,
    color: tk.textTertiary,
    marginTop: 2,
  },
  activityAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: tk.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'SF Mono' : 'monospace',
  },
  emptyActivity: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: tk.sunken,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyActivityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: tk.textSecondary,
    marginBottom: 4,
  },
  emptyActivityText: {
    fontSize: 14,
    color: tk.textTertiary,
    textAlign: 'center',
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: tk.brand500,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: tk.brand500,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  bottomSpacing: {
    height: 120,
  },
  }),
);
