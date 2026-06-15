/**
 * GstNoticeDetailScreen — GST notice detail (read-only parity, Wave 7B / GAP-108).
 *
 * Gains: NoticeFormTypeBadge (+plain meaning), statutory-deadline chip
 * (graceful degrade to a plain date row), GSTAT appeal ladder (read-only
 * StatusTimeline vertical) + backlog-appeal banner (file by 30/06/2026).
 *
 * Per spec §5.6 mobile is READ-ONLY this wave: no reply, no simulate, and no
 * Coming-Soon stub — open notices route the user to the web admin / their CA
 * (mobile.gst.noticeDetail.actionInAdmin) instead of the old respond form.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { DueDateChip } from '../../components/shared/DueDateChip';
import { StatusTimeline } from '../../components/shared/StatusTimeline';
import { NoticeFormTypeBadge } from '../../components/gst/NoticeFormTypeBadge';
import { GSTAT_STAGE_KEYS } from '../../components/gst/GstatStageChip';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import { getGstNotice, GSTAT_STAGE_ORDER } from '../../api/gst';
import { isNoticeSettled } from '../../lib/noticeStatus';
import type { GstStackParamList } from '../../navigation/GstStack';

type NavProp = NativeStackNavigationProp<GstStackParamList, 'GstNoticeDetail'>;
type RoutePropType = RouteProp<GstStackParamList, 'GstNoticeDetail'>;

interface Props {
  navigation: NavProp;
  route: RoutePropType;
}

export function GstNoticeDetailScreen({ navigation, route }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  useSensitiveScreen();
  const { t } = useTranslation();
  const { noticeId } = route.params;

  const { data: notice, isLoading } = useQuery({
    queryKey: ['gst-notice-detail', noticeId],
    queryFn: () => getGstNotice(noticeId),
  });

  // Canonical server lifecycle enum (RECEIVED/UNDER_REVIEW/RESPONDED/CLOSED).
  // Wave 7 recon: legacy spellings are shimmed server-side on the request
  // path and responses are canonical — client legacy tolerance removed.
  const isOpen = !!notice && !isNoticeSettled(notice.status);
  const deadline = notice?.statutoryDeadline ?? notice?.dueDate;
  const inAppeal = !!notice?.appealStage && notice.appealStage !== 'NONE';

  const messageCa = () =>
    (navigation.navigate as unknown as (tab: string, opts?: object) => void)(
      'MoreTab',
      { screen: 'Chat' },
    );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}
          accessibilityLabel={t('mobile.common.back')}>
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.gst.noticeDetail.title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator size="large" color={tokens.gstAccent} style={{ marginTop: 40 }} />
        ) : notice ? (
          <>
            {/* GAP-108: backlog-appeal hard flag */}
            {notice.isGstatBacklogFlagged ? (
              <View
                style={styles.backlogBanner}
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
                testID="gstat-backlog-banner"
              >
                <Ionicons name="alert-circle" size={18} color={tokens.errorFg} />
                <Text style={styles.backlogBannerText}>
                  {t('mobile.gst.gstat.backlogFlag')}
                </Text>
              </View>
            ) : null}

            {/* GAP-108: statutory form-type badge + plain meaning (OTHER = none) */}
            {notice.formType && notice.formType !== 'OTHER' ? (
              <View style={styles.formTypeWrap}>
                <NoticeFormTypeBadge formType={notice.formType} showMeaning />
              </View>
            ) : null}

            <View style={styles.card}>
              {[
                { label: t('mobile.gst.noticeDetail.noticeNumber'), value: notice.noticeNumber },
                { label: t('mobile.gst.noticeDetail.type'), value: notice.noticeType },
                { label: t('mobile.gst.noticeDetail.issuedDate'), value: notice.issuedDate },
                { label: t('mobile.gst.noticeDetail.status'), value: notice.status },
              ].map(({ label, value }) => (
                <View key={label} style={styles.row}>
                  <Text style={styles.rowLabel}>{label}</Text>
                  <Text style={styles.rowValue}>{value}</Text>
                </View>
              ))}
              {/* GAP-108: statutory deadline — countdown chip; suppressed once
                  responded/closed (static "responded" row instead). */}
              {deadline ? (
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>
                    {t('mobile.gst.noticeDetail.statutoryDeadline')}
                  </Text>
                  {isOpen ? (
                    <DueDateChip dueDate={deadline} testID="notice-deadline-chip" />
                  ) : (
                    <Text style={styles.rowValue} testID="notice-deadline-static">
                      {notice.respondedAt
                        ? t('mobile.gst.noticeDetail.respondedOn', {
                            date: notice.respondedAt.slice(0, 10),
                          })
                        : deadline}
                    </Text>
                  )}
                </View>
              ) : null}
            </View>

            {notice.description && (
              <View style={styles.descCard}>
                <Text style={styles.descTitle}>{t('mobile.gst.noticeDetail.description')}</Text>
                <Text style={styles.descText}>{notice.description}</Text>
              </View>
            )}

            {/* GAP-108: GSTAT appeal ladder (read-only, full vertical) */}
            {inAppeal ? (
              <View style={styles.descCard} testID="gstat-ladder">
                <Text style={styles.descTitle}>{t('mobile.gst.gstat.ladderTitle')}</Text>
                <StatusTimeline
                  orientation="vertical"
                  steps={GSTAT_STAGE_ORDER.map((stage) => {
                    const currentIdx = GSTAT_STAGE_ORDER.indexOf(
                      notice.appealStage as (typeof GSTAT_STAGE_ORDER)[number],
                    );
                    const idx = GSTAT_STAGE_ORDER.indexOf(stage);
                    return {
                      id: stage,
                      label: t(GSTAT_STAGE_KEYS[stage]),
                      status:
                        idx < currentIdx
                          ? ('completed' as const)
                          : idx === currentIdx
                            ? ('active' as const)
                            : ('pending' as const),
                    };
                  })}
                />
              </View>
            ) : null}

            {/* GAP-108 §5.6: read-only — route actions to admin / CA chat.
                Replaces the old in-app respond form. No Coming-Soon stub. */}
            {isOpen && !notice.responseText ? (
              <View style={styles.actionGuidance} testID="notice-action-guidance">
                <Ionicons name="laptop-outline" size={18} color={tokens.textSecondary} />
                <Text style={styles.actionGuidanceText}>
                  {t('mobile.gst.noticeDetail.actionInAdmin')}
                </Text>
              </View>
            ) : null}
            {isOpen && !notice.responseText ? (
              <Pressable
                style={styles.messageCaBtn}
                onPress={messageCa}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.gst.noticeDetail.messageCa')}
                testID="notice-message-ca"
              >
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={tokens.textOnBrand} />
                <Text style={styles.messageCaBtnText}>
                  {t('mobile.gst.noticeDetail.messageCa')}
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: tk.canvas },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: tk.raised, borderBottomWidth: 1, borderBottomColor: tk.border,
  },
  // P6-QA-MOBILE-04/-09: 44×44pt minimum touch target (was 40×40).
  backBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: tk.sunken, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: tk.textPrimary },
  scrollContent: { padding: 16, gap: 14 },
  backlogBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: tk.errorTint,
    borderColor: tk.errorTintBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  backlogBannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: tk.errorFg, lineHeight: 19 },
  formTypeWrap: { gap: 4 },
  card: { backgroundColor: tk.raised, borderRadius: 14, borderWidth: 1, borderColor: tk.border, overflow: 'hidden' },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13, minHeight: 50,
    borderBottomWidth: 1, borderBottomColor: tk.border,
  },
  rowLabel: { fontSize: 13, color: tk.textSecondary, flex: 1 },
  rowValue: { fontSize: 13, fontWeight: '600', color: tk.textPrimary, flex: 1.5, textAlign: 'right' },
  descCard: { backgroundColor: tk.raised, borderRadius: 14, borderWidth: 1, borderColor: tk.border, padding: 16, gap: 8 },
  descTitle: { fontSize: 14, fontWeight: '700', color: tk.textPrimary },
  descText: { fontSize: 14, color: tk.textSecondary, lineHeight: 21 },
  actionGuidance: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: tk.sunken,
    borderRadius: 12,
    padding: 12,
  },
  actionGuidanceText: { flex: 1, fontSize: 13, color: tk.textSecondary, lineHeight: 19 },
  messageCaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: tk.gstAccent, borderRadius: 14, minHeight: 52,
  },
  messageCaBtnText: { fontSize: 16, fontWeight: '700', color: tk.textOnBrand },
  }),
);
