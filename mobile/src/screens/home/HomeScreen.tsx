/**
 * Home Screen — Redesign 2026
 * Premium financial dashboard with refined cards, better hierarchy, modern styling
 */

import React, { useCallback, useMemo } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { AmountDisplay } from '../../components/ui/AmountDisplay';
import { Card } from '../../components/ui/Card';
import { Colors } from '../../constants/colors';
import { formatINR, formatINRCompact, getCurrentFinancialYear, timeAgo } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';
import apiClient from '../../lib/api';
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

export function HomeScreen({ navigation }: Props) {
  const { user, currentOrganization } = useAuthStore();
  const fy = getCurrentFinancialYear();
  const gstr3bLabel = useMemo(() => getGstr3bDeadlineLabel(), []);

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

  const handleRefresh = useCallback(async () => {
    await Promise.all([refetchMetrics(), refetchActivities()]);
  }, [refetchMetrics, refetchActivities]);

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
            tintColor={Colors.brand[400]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Header */}
        <View style={styles.heroSection}>
          <LinearGradient
            colors={[Colors.brand[900], Colors.brand[700]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
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
              style={{ color: Colors.neutral[0] }}
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
              iconColor={Colors.success[500]}
              iconBg={Colors.success[50]}
              onPress={() => navigation.navigate('FinancialReportsList')}
            />
            <MetricCard
              title="Expenses"
              amount={metrics?.totalExpenses ?? 0}
              trend={metrics?.expensesTrend ?? 0}
              loading={metricsLoading}
              iconName="trending-down"
              iconColor={Colors.error[500]}
              iconBg={Colors.error[50]}
              onPress={() => navigation.navigate('FinancialReportsList')}
            />
            <MetricCard
              title="GST Payable"
              amount={metrics?.gstPayable ?? 0}
              trend={0}
              loading={metricsLoading}
              iconName="receipt"
              iconColor={Colors.gst}
              iconBg={Colors.gst + '15'}
              onPress={() => {}}
            />
          </ScrollView>
        </View>

        {/* Quick Actions */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActions}>
            <QuickActionBtn
              iconName="camera-outline"
              label="Upload Bill"
              onPress={() => navigation.navigate('DocumentsTab')}
              gradient={[Colors.brand[500], Colors.brand[600]] as const}
            />
            <QuickActionBtn
              iconName="receipt-outline"
              label="File GST"
              onPress={() => navigation.navigate('GstTab')}
              gradient={[Colors.gst, '#6D28D9'] as const}
            />
            <QuickActionBtn
              iconName="wallet-outline"
              label="Get Loan"
              onPress={() => navigation.navigate('LoanTab')}
              gradient={[Colors.accent[500], Colors.accent[600]] as const}
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
                  <Ionicons name="time-outline" size={20} color={Colors.warning[600]} />
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
                <Ionicons name="arrow-forward" size={14} color={Colors.neutral[0]} />
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
        <Ionicons name="camera" size={24} color={Colors.neutral[0]} />
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
            <View style={[styles.trendPill, { backgroundColor: trendPositive ? Colors.success[50] : Colors.error[50] }]}>
              <Ionicons
                name={trendPositive ? 'arrow-up' : 'arrow-down'}
                size={10}
                color={trendPositive ? Colors.success[600] : Colors.error[600]}
              />
              <Text
                style={[styles.metricTrend, { color: trendPositive ? Colors.success[600] : Colors.error[600] }]}
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
  return (
    <Pressable
      style={styles.quickActionBtn}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.quickActionIconWrap}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.quickActionGradient}
        />
        <View style={styles.quickActionIconInner}>
          <Ionicons name={iconName} size={22} color={Colors.neutral[0]} />
        </View>
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </Pressable>
  );
}

function ActivityRow({ item, isLast }: { item: ActivityItem; isLast: boolean }) {
  const typeConfig: Record<ActivityItem['type'], { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; bg: string }> = {
    document: { icon: 'document-outline', color: Colors.brand[500], bg: Colors.brand[50] },
    gst: { icon: 'receipt-outline', color: Colors.gst, bg: Colors.gst + '15' },
    itr: { icon: 'document-text-outline', color: Colors.itr, bg: Colors.itr + '15' },
    loan: { icon: 'wallet-outline', color: Colors.loan, bg: Colors.loan + '15' },
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
  return (
    <Card shadow="sm" padding="lg">
      <View style={styles.emptyActivity}>
        <View style={styles.emptyIconWrap}>
          <Ionicons name="document-outline" size={32} color={Colors.neutral[300]} />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.base,
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
    color: Colors.neutral[0],
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
    backgroundColor: Colors.accent[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.neutral[0],
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
    backgroundColor: Colors.surface.default,
    borderRadius: 18,
    padding: 16,
    shadowColor: '#0F172A',
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
    color: Colors.neutral[500],
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  metricAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.neutral[900],
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
    backgroundColor: Colors.neutral[100],
    borderRadius: 6,
    width: 80,
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
    color: Colors.neutral[800],
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  viewAll: {
    fontSize: 14,
    color: Colors.brand[500],
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
    position: 'relative',
  },
  quickActionGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  quickActionIconInner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.neutral[700],
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
    backgroundColor: Colors.warning[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  deadlineTextBlock: {
    flex: 1,
  },
  deadlineBannerTitle: {
    fontSize: 14,
    color: Colors.neutral[800],
    fontWeight: '600',
  },
  deadlineBannerSubtitle: {
    fontSize: 12,
    color: Colors.warning[600],
    fontWeight: '500',
    marginTop: 1,
  },
  deadlineBtn: {
    backgroundColor: Colors.warning[600],
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
    color: Colors.neutral[0],
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
    borderBottomColor: Colors.neutral[100],
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
    color: Colors.neutral[800],
  },
  activityTime: {
    fontSize: 12,
    color: Colors.neutral[400],
    marginTop: 2,
  },
  activityAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.neutral[700],
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
    backgroundColor: Colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyActivityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.neutral[700],
    marginBottom: 4,
  },
  emptyActivityText: {
    fontSize: 14,
    color: Colors.neutral[400],
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
    backgroundColor: Colors.brand[500],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.brand[500],
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  bottomSpacing: {
    height: 120,
  },
});
