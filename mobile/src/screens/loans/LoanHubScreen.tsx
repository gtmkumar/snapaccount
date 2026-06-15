/**
 * LoanHubScreen — Loan product catalog with filter, eligibility teaser, per-product badges.
 * Phase 6C — docs/design/mobile/loans/loan-hub-screen.md
 *
 * Telemetry: loan.hub.viewed, loan.hub.product.tapped, loan.hub.filter.changed
 */

import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  createThemedStyles,
  useTheme,
  type ThemeTokens,
} from '../../contexts/ThemeContext';
import { ListSkeleton, ErrorState } from '../../components/shared/ListStates';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import { listLoanProducts, type LoanProduct } from '../../api/loans';
import { LoanProductCard } from '../../components/loans/LoanProductCard';
import type { LoanStackParamList } from '../../navigation/LoanStack';

type NavProp = NativeStackNavigationProp<LoanStackParamList, 'LoanHub'>;
interface Props { navigation: NavProp }

type SortOption = 'LOWEST_INTEREST' | 'HIGHEST_AMOUNT' | 'SHORTEST_TENURE';

export function LoanHubScreen({ navigation }: Props) {
  useSensitiveScreen();
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const styles = useStyles();

  const [sortBy, setSortBy] = useState<SortOption>('LOWEST_INTEREST');
  const [eligibilityChecked] = useState(false);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['loan-products'],
    queryFn: () => listLoanProducts({ pageSize: 50 }),
  });

  const sortedProducts = useCallback((): LoanProduct[] => {
    const products = data?.items ?? [];
    const copy = [...products];
    switch (sortBy) {
      case 'LOWEST_INTEREST':
        return copy.sort((a, b) => a.interestRate - b.interestRate);
      case 'HIGHEST_AMOUNT':
        return copy.sort((a, b) => b.maxAmount - a.maxAmount);
      case 'SHORTEST_TENURE':
        return copy.sort((a, b) => a.tenureMonths - b.tenureMonths);
      default:
        return copy;
    }
  }, [data, sortBy])();

  const handleProductApply = (product: LoanProduct) => {
    navigation.navigate('LoanApplication', {
      productId: product.productId,
      productName: product.productName,
    });
  };

  const handleProductViewDetails = (product: LoanProduct) => {
    navigation.navigate('LoanApplication', {
      productId: product.productId,
      productName: product.productName,
    });
  };

  if (isLoading && !isRefetching) {
    return (
      <SafeAreaView style={styles.container}>
        {renderHeader()}
        {/* §3.1: shaped skeleton matching loan product cards */}
        <View style={styles.skeletonWrap}>
          <ListSkeleton variant="card" count={4} cardHeight={148} testID="loan-hub-skeleton" />
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container}>
        {renderHeader()}
        <ErrorState
          message={t('mobile.loan.hub.error')}
          retryLabel={t('mobile.common.retry')}
          onRetry={() => void refetch()}
          secondaryLabel={t('mobile.common.goBack')}
          onSecondaryPress={() => navigation.goBack()}
          testID="loan-hub-error-state"
        />
      </SafeAreaView>
    );
  }

  function renderHeader() {
    return (
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityLabel={t('mobile.common.back')}
        >
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.loan.hub.title')}</Text>
        <Pressable style={styles.helpBtn} hitSlop={8} accessibilityLabel="Help">
          <Ionicons name="help-circle-outline" size={22} color={tokens.textSecondary} />
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}

      <FlatList
        data={sortedProducts}
        keyExtractor={(item) => item.productId}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={tokens.loanAccent}
          />
        }
        ListHeaderComponent={
          <>
            {/* Hero */}
            <View style={styles.hero}>
              <View style={styles.heroIconWrap}>
                <Ionicons name="business" size={22} color={tokens.loanAccent} />
              </View>
              <Text style={styles.heroTitle}>{t('mobile.loan.hub.hero.title')}</Text>
              <Text style={styles.heroBody}>{t('mobile.loan.hub.hero.body')}</Text>
            </View>

            {/* Eligibility teaser */}
            {!eligibilityChecked && (
              <Pressable
                style={styles.eligibilityTeaser}
                onPress={() => navigation.navigate('LoanEligibility', { loanType: '' })}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.loan.hub.eligibilityTeaser.title')}
              >
                <Ionicons name="sparkles" size={18} color={tokens.loanAccent} />
                <View style={styles.teaserTextWrap}>
                  <Text style={styles.teaserTitle}>
                    {t('mobile.loan.hub.eligibilityTeaser.title')}
                  </Text>
                </View>
                <View style={styles.teaserCta}>
                  <Text style={styles.teaserCtaText}>
                    {t('mobile.loan.hub.eligibilityTeaser.cta')}
                  </Text>
                  <Ionicons name="arrow-forward" size={14} color={tokens.loanAccent} />
                </View>
              </Pressable>
            )}

            {/* Sort bar */}
            <View style={styles.sortBar}>
              {(['LOWEST_INTEREST', 'HIGHEST_AMOUNT', 'SHORTEST_TENURE'] as SortOption[]).map(
                (opt) => (
                  <Pressable
                    key={opt}
                    style={[styles.sortChip, sortBy === opt && styles.sortChipActive]}
                    onPress={() => setSortBy(opt)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: sortBy === opt }}
                  >
                    <Text style={[styles.sortChipText, sortBy === opt && styles.sortChipTextActive]}>
                      {opt === 'LOWEST_INTEREST'
                        ? 'Lowest rate'
                        : opt === 'HIGHEST_AMOUNT'
                        ? 'Highest amount'
                        : 'Shortest tenure'}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Ionicons name="business-outline" size={40} color={tokens.textTertiary} />
            <Text style={styles.emptyTitle}>{t('mobile.loan.hub.empty.title')}</Text>
            <Text style={styles.emptyBody}>{t('mobile.loan.hub.empty.body')}</Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <Ionicons name="information-circle-outline" size={14} color={tokens.textTertiary} />
            <Text style={styles.footerText}>
              {t('mobile.loan.hub.disclaimer.indicativeRates')}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <LoanProductCard
            product={item}
            qualLevel={eligibilityChecked ? 'UNCHECKED' : 'UNCHECKED'}
            hintText={
              eligibilityChecked
                ? undefined
                : 'Check eligibility to see your match.'
            }
            onViewDetails={() => handleProductViewDetails(item)}
            onApply={() => handleProductApply(item)}
            testID={`loan-product-card-${item.productId}`}
          />
        )}
      />
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
    // P6-QA-MOBILE-09: 44×44pt minimum touch target (was 40×40).
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: tk.sunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: tk.textPrimary,
      letterSpacing: -0.2,
    },
    helpBtn: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    listContent: { padding: 16, gap: 0, paddingBottom: 32 },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      gap: 12,
    },
    errorText: { fontSize: 14, color: tk.textSecondary, textAlign: 'center' },
    skeletonWrap: { padding: 16 },
    retryBtn: {
      backgroundColor: tk.loanAccent,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 10,
    },
    retryText: { fontSize: 14, fontWeight: '700', color: tk.textOnBrand },

    // Hero
    hero: {
      backgroundColor: tk.raised,
      borderRadius: 16,
      padding: 20,
      marginBottom: 12,
      gap: 8,
      borderWidth: 1,
      borderColor: tk.border,
    },
    heroIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: tk.loanAccent + '15',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    heroTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: tk.textPrimary,
      letterSpacing: -0.3,
    },
    heroBody: {
      fontSize: 13,
      color: tk.textSecondary,
      lineHeight: 19,
    },

    // Eligibility teaser — warm loan-module tint, legible in both modes
    eligibilityTeaser: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: tk.loanAccent + '15',
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: tk.loanAccent + '33',
    },
    teaserTextWrap: { flex: 1 },
    teaserTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: tk.loanAccent,
    },
    teaserCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    teaserCtaText: {
      fontSize: 13,
      fontWeight: '600',
      color: tk.loanAccent,
    },

    // Sort bar
    sortBar: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 14,
      flexWrap: 'wrap',
    },
    sortChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: tk.sunken,
      // P6-QA-MOBILE-08: 44pt minimum touch target (was 36).
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sortChipActive: {
      backgroundColor: tk.loanAccent,
    },
    sortChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: tk.textSecondary,
    },
    sortChipTextActive: {
      color: tk.textOnBrand,
    },

    // Empty
    emptyTitle: { fontSize: 17, fontWeight: '700', color: tk.textPrimary },
    emptyBody: { fontSize: 14, color: tk.textSecondary, textAlign: 'center' },

    // Footer
    footer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      paddingTop: 8,
      paddingHorizontal: 4,
    },
    // Disclaimer carries legal meaning — textSecondary keeps ≥4.5:1 (a11y §4).
    footerText: {
      flex: 1,
      fontSize: 11,
      color: tk.textSecondary,
      lineHeight: 16,
    },
  }),
);
