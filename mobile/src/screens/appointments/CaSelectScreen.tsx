/**
 * CaSelectScreen — choose a CA for video consultation (Wave 7A / GAP-031).
 * Skips itself (replace → SlotPicker) when exactly one CA is assigned.
 */

import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { ListSkeleton, EmptyState, ErrorState } from '../../components/shared/ListStates';
import { listCaProfiles, type CaProfile } from '../../api/appointments';
import type { ChatStackParamList } from '../../navigation/ChatStack';

type NavProp = NativeStackNavigationProp<ChatStackParamList, 'CaSelect'>;
interface Props { navigation: NavProp }

export function CaSelectScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();

  const { data: cas, isLoading, error, refetch } = useQuery({
    queryKey: ['ca-profiles'],
    queryFn: listCaProfiles,
  });

  // Single assigned CA → straight to slots (spec §1.1).
  useEffect(() => {
    if (cas && cas.length === 1) {
      navigation.replace('SlotPicker', {
        caProfileId: cas[0].caProfileId,
        caName: cas[0].displayName,
      });
    }
  }, [cas, navigation]);

  const renderCa = (ca: CaProfile) => (
    <Pressable
      key={ca.caProfileId}
      style={styles.caCard}
      onPress={() =>
        navigation.navigate('SlotPicker', {
          caProfileId: ca.caProfileId,
          caName: ca.displayName,
        })
      }
      accessibilityRole="button"
      accessibilityLabel={t('mobile.ca.select.caA11y', { caName: ca.displayName })}
      testID={`ca-select-${ca.caProfileId}`}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{ca.displayName.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.caInfo}>
        <Text style={styles.caName}>{ca.displayName}</Text>
        {ca.specialisations ? (
          <Text style={styles.caSpec} numberOfLines={1}>
            {Array.isArray(ca.specialisations)
              ? ca.specialisations.join(' \u00b7 ')
              : ca.specialisations}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={tokens.textTertiary} />
    </Pressable>
  );

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
        <Text style={styles.headerTitle}>{t('mobile.ca.select.title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      {isLoading ? (
        <View style={styles.body}>
          <ListSkeleton variant="row" count={4} testID="ca-select-skeleton" />
        </View>
      ) : error ? (
        <ErrorState
          message={t('mobile.ca.select.error')}
          retryLabel={t('mobile.common.retry')}
          onRetry={() => void refetch()}
          secondaryLabel={t('mobile.common.goBack')}
          onSecondaryPress={() => navigation.goBack()}
          testID="ca-select-error"
        />
      ) : !cas || cas.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={t('mobile.ca.select.emptyTitle')}
          body={t('mobile.ca.select.emptyBody')}
          testID="ca-select-empty"
        />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>{cas.map(renderCa)}</ScrollView>
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
    headerTitle: { fontSize: 18, fontWeight: '700', color: tk.textPrimary },
    body: { padding: 16, gap: 10 },
    caCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: tk.raised,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: tk.border,
      padding: 14,
      minHeight: 56,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: tk.brand500,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: tk.textOnBrand, fontSize: 17, fontWeight: '700' },
    caInfo: { flex: 1, gap: 2 },
    caName: { fontSize: 15, fontWeight: '700', color: tk.textPrimary },
    caSpec: { fontSize: 12, color: tk.textSecondary },
  }),
);
