/**
 * GstNilReturnConfirmScreen — Single-action nil return confirm + file flow.
 * Phase 6B — docs/design/mobile/gst/nil-return-confirm-screen.md
 * Shows return period, GSTIN, warning about nil filing implications, then files.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { ResultScreen } from '../../components/shared/ResultScreen';
import { Colors } from '../../constants/colors';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import { fileNilReturn, getGstReturn } from '../../api/gst';
import type { GstStackParamList } from '../../navigation/GstStack';

type NavProp = NativeStackNavigationProp<GstStackParamList, 'GstNilReturnConfirm'>;
type RoutePropType = RouteProp<GstStackParamList, 'GstNilReturnConfirm'>;

interface Props {
  navigation: NavProp;
  route: RoutePropType;
}

export function GstNilReturnConfirmScreen({ navigation, route }: Props) {
  useSensitiveScreen();
  const { t } = useTranslation();
  const { returnId, period, gstin } = route.params;
  const [filed, setFiled] = useState<{ ackNumber: string; filedAt: string } | null>(null);
  const [hasAcknowledged, setHasAcknowledged] = useState(false);

  const { data: returnData, isLoading } = useQuery({
    queryKey: ['gst-return', returnId],
    queryFn: () => getGstReturn(returnId),
  });

  const fileMutation = useMutation({
    mutationFn: () => fileNilReturn(returnId),
    onSuccess: (result) => {
      setFiled(result);
    },
    onError: () => {
      Alert.alert(
        t('mobile.gst.nilReturn.errorTitle'),
        t('mobile.gst.nilReturn.errorBody'),
        [{ text: t('mobile.common.ok') }],
      );
    },
  });

  const handleFile = () => {
    Alert.alert(
      t('mobile.gst.nilReturn.confirmTitle'),
      t('mobile.gst.nilReturn.confirmBody'),
      [
        { text: t('mobile.common.cancel'), style: 'cancel' },
        {
          text: t('mobile.gst.nilReturn.confirmCta'),
          style: 'destructive',
          onPress: () => fileMutation.mutate(),
        },
      ],
    );
  };

  // Success state
  if (filed) {
    return (
      <ResultScreen
        variant="success"
        title={t('mobile.gst.nilReturn.successTitle')}
        subtitle={t('mobile.gst.nilReturn.successSubtitle', { ackNumber: filed.ackNumber })}
        detail={t('mobile.gst.nilReturn.successDetail', { filedAt: filed.filedAt })}
        primaryLabel={t('mobile.gst.nilReturn.backToDashboard')}
        onPrimary={() => navigation.popToTop()}
        testID="nil-return-success"
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityLabel={t('mobile.common.back')}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.gst.nilReturn.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.gst} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Return info card */}
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Ionicons name="document-text" size={22} color={Colors.gst} />
                </View>
                <View>
                  <Text style={styles.infoLabel}>{t('mobile.gst.nilReturn.returnType')}</Text>
                  <Text style={styles.infoValue}>
                    {returnData?.returnType ?? 'GSTR-3B'}
                  </Text>
                </View>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Ionicons name="calendar-outline" size={22} color={Colors.gst} />
                </View>
                <View>
                  <Text style={styles.infoLabel}>{t('mobile.gst.nilReturn.period')}</Text>
                  <Text style={styles.infoValue}>{period}</Text>
                </View>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Ionicons name="business-outline" size={22} color={Colors.gst} />
                </View>
                <View>
                  <Text style={styles.infoLabel}>{t('mobile.gst.nilReturn.gstin')}</Text>
                  <Text style={[styles.infoValue, styles.gstinMono]}>{gstin}</Text>
                </View>
              </View>
            </View>

            {/* Warning banner */}
            <View style={styles.warningBanner}>
              <Ionicons name="warning" size={20} color={Colors.warning[700]} />
              <Text style={styles.warningText}>
                {t('mobile.gst.nilReturn.warningText')}
              </Text>
            </View>

            {/* Implications list */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>
                {t('mobile.gst.nilReturn.impliesTitle')}
              </Text>
              {[
                'mobile.gst.nilReturn.implies1',
                'mobile.gst.nilReturn.implies2',
                'mobile.gst.nilReturn.implies3',
              ].map((key) => (
                <View key={key} style={styles.impliesRow}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={16}
                    color={Colors.neutral[500]}
                  />
                  <Text style={styles.impliesText}>{t(key)}</Text>
                </View>
              ))}
            </View>

            {/* Acknowledgement checkbox */}
            <Pressable
              style={styles.ackRow}
              onPress={() => setHasAcknowledged(!hasAcknowledged)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: hasAcknowledged }}
            >
              <View
                style={[
                  styles.checkbox,
                  hasAcknowledged && styles.checkboxChecked,
                ]}
              >
                {hasAcknowledged && (
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                )}
              </View>
              <Text style={styles.ackText}>{t('mobile.gst.nilReturn.ackText')}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      {/* File button */}
      <View style={styles.footer}>
        <Pressable
          style={[
            styles.fileBtn,
            (!hasAcknowledged || fileMutation.isPending) && styles.fileBtnDisabled,
          ]}
          onPress={handleFile}
          disabled={!hasAcknowledged || fileMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.gst.nilReturn.fileCta')}
        >
          {fileMutation.isPending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.fileBtnText}>{t('mobile.gst.nilReturn.fileCta')}</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
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
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.neutral[900],
    letterSpacing: -0.2,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  infoCard: {
    backgroundColor: Colors.surface.default,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.neutral[100],
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.gst + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: {
    fontSize: 12,
    color: Colors.neutral[500],
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.neutral[900],
  },
  gstinMono: {
    letterSpacing: 1.5,
    fontVariant: ['tabular-nums'],
  },
  infoDivider: {
    height: 1,
    backgroundColor: Colors.neutral[100],
    marginHorizontal: 16,
  },
  warningBanner: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: Colors.warning[50],
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.warning[200],
    alignItems: 'flex-start',
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: Colors.warning[800],
    lineHeight: 19,
  },
  sectionCard: {
    backgroundColor: Colors.surface.default,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.neutral[100],
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.neutral[800],
  },
  impliesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  impliesText: {
    flex: 1,
    fontSize: 13,
    color: Colors.neutral[600],
    lineHeight: 18,
  },
  ackRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: Colors.surface.default,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: Colors.neutral[200],
    minHeight: 52,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.neutral[300],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: Colors.gst,
    borderColor: Colors.gst,
  },
  ackText: {
    flex: 1,
    fontSize: 13,
    color: Colors.neutral[700],
    lineHeight: 19,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.neutral[100],
    backgroundColor: Colors.surface.default,
  },
  fileBtn: {
    backgroundColor: Colors.gst,
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileBtnDisabled: {
    opacity: 0.4,
  },
  fileBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
