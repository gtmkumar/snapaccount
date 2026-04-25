/**
 * ItrNoticeDetailScreen — ITR notice detail with respond capability.
 * Phase 6D — docs/design/mobile/itr/notice-inbox-and-detail-screens.md
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { DueDateChip } from '../../components/shared/DueDateChip';
import { Colors } from '../../constants/colors';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import { respondToItrNotice } from '../../api/itr';
import type { ItrNotice } from '../../api/itr';
import type { ItrStackParamList } from '../../navigation/ItrStack';
import { apiClient } from '../../lib/api';

type NavProp = NativeStackNavigationProp<ItrStackParamList, 'ItrNoticeDetail'>;
type RoutePropType = RouteProp<ItrStackParamList, 'ItrNoticeDetail'>;

interface Props {
  navigation: NavProp;
  route: RoutePropType;
}

const NOTICE_TYPE_INFO: Record<string, { name: string; desc: string }> = {
  Notice_143_1: { name: 'Section 143(1)', desc: 'Intimation of processing of return' },
  Notice_143_2: { name: 'Section 143(2)', desc: 'Notice for scrutiny assessment' },
  Notice_139_9: { name: 'Section 139(9)', desc: 'Defective return notice' },
  Notice_148: { name: 'Section 148', desc: 'Notice for income escaping assessment' },
  Notice_156: { name: 'Section 156', desc: 'Notice of demand' },
  Other: { name: 'Other Notice', desc: 'Income Tax Department notice' },
};

export function ItrNoticeDetailScreen({ navigation, route }: Props) {
  useSensitiveScreen();
  const { t } = useTranslation();
  const { noticeId, filingId } = route.params;
  const qc = useQueryClient();
  const [responseText, setResponseText] = useState('');
  const [showResponseForm, setShowResponseForm] = useState(false);

  const { data: notice, isLoading } = useQuery<ItrNotice>({
    queryKey: ['itr-notice-detail', noticeId],
    queryFn: async () => {
      const res = await apiClient.get<ItrNotice>(`/itr/notices/${noticeId}`);
      return res.data;
    },
  });

  const respondMutation = useMutation({
    mutationFn: () =>
      respondToItrNotice(noticeId, {
        respondedByUserId: '',
        responseText: responseText.trim(),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['itr-notices', filingId] });
      void qc.invalidateQueries({ queryKey: ['itr-notice-detail', noticeId] });
      Alert.alert(
        t('mobile.itr.noticeDetail.responseSuccessTitle'),
        t('mobile.itr.noticeDetail.responseSuccessBody'),
        [{ text: t('mobile.common.ok'), onPress: () => navigation.goBack() }],
      );
    },
    onError: () => {
      Alert.alert(t('mobile.itr.noticeDetail.errorTitle'), t('mobile.itr.noticeDetail.errorBody'));
    },
  });

  const noticeInfo = notice ? NOTICE_TYPE_INFO[notice.noticeType] ?? NOTICE_TYPE_INFO['Other'] : null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}
          accessibilityLabel={t('mobile.common.back')}>
          <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.itr.noticeDetail.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.itr} style={{ marginTop: 40 }} />
        ) : notice ? (
          <>
            {/* Notice type banner */}
            <View style={styles.typeBanner}>
              <View style={styles.typeIcon}>
                <Ionicons name="mail-open-outline" size={24} color={Colors.itr} />
              </View>
              <View style={styles.typeText}>
                <Text style={styles.typeName}>{noticeInfo?.name}</Text>
                <Text style={styles.typeDesc}>{noticeInfo?.desc}</Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: notice.status === 'Closed' ? Colors.success[50] : Colors.warning[50] },
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    { color: notice.status === 'Closed' ? Colors.success[700] : Colors.warning[700] },
                  ]}
                >
                  {notice.status}
                </Text>
              </View>
            </View>

            {/* Metadata */}
            <View style={styles.metaCard}>
              {[
                { label: t('mobile.itr.noticeDetail.noticeNumber'), value: notice.noticeNumber },
                { label: t('mobile.itr.noticeDetail.issuedDate'), value: notice.issuedDate },
                { label: t('mobile.itr.noticeDetail.subject'), value: notice.subject ?? '—' },
              ].map(({ label, value }) => (
                <View key={label} style={styles.metaRow}>
                  <Text style={styles.metaLabel}>{label}</Text>
                  <Text style={styles.metaValue}>{value}</Text>
                </View>
              ))}
              {notice.dueDate && (
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>{t('mobile.itr.noticeDetail.dueDate')}</Text>
                  <DueDateChip dueDate={notice.dueDate} />
                </View>
              )}
            </View>

            {/* Attachments */}
            {notice.attachmentsJson && notice.attachmentsJson.length > 0 && (
              <View style={styles.attachmentsCard}>
                <Text style={styles.attachmentsTitle}>
                  {t('mobile.itr.noticeDetail.attachments')} ({notice.attachmentsJson.length})
                </Text>
                {notice.attachmentsJson.map((att, i) => (
                  <View key={i} style={styles.attachmentRow}>
                    <Ionicons name="document-outline" size={16} color={Colors.neutral[500]} />
                    <Text style={styles.attachmentName} numberOfLines={1}>{att.fileName}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Existing response */}
            {notice.responseText && (
              <View style={styles.responseCard}>
                <View style={styles.responseHeader}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.success[600]} />
                  <Text style={styles.responseTitle}>{t('mobile.itr.noticeDetail.yourResponse')}</Text>
                  {notice.respondedAt && (
                    <Text style={styles.respondedAt}>{notice.respondedAt}</Text>
                  )}
                </View>
                <Text style={styles.responseText}>{notice.responseText}</Text>
              </View>
            )}

            {/* Respond form */}
            {(notice.status === 'Open' || notice.status === 'Overdue') && !notice.responseText && (
              <>
                {!showResponseForm ? (
                  <Pressable
                    style={styles.respondBtn}
                    onPress={() => setShowResponseForm(true)}
                    accessibilityRole="button"
                    accessibilityLabel={t('mobile.itr.noticeDetail.respondCta')}
                  >
                    <Ionicons name="create-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.respondBtnText}>{t('mobile.itr.noticeDetail.respondCta')}</Text>
                  </Pressable>
                ) : (
                  <View style={styles.responseForm}>
                    <Text style={styles.formLabel}>{t('mobile.itr.noticeDetail.responseLabel')}</Text>
                    <TextInput
                      style={styles.responseInput}
                      value={responseText}
                      onChangeText={setResponseText}
                      placeholder={t('mobile.itr.noticeDetail.responsePlaceholder')}
                      placeholderTextColor={Colors.neutral[400]}
                      multiline
                      numberOfLines={6}
                      textAlignVertical="top"
                      accessibilityLabel={t('mobile.itr.noticeDetail.responseLabel')}
                    />
                    <Text style={styles.charCount}>{responseText.length}/2000</Text>
                    <View style={styles.formActions}>
                      <Pressable
                        style={styles.cancelFormBtn}
                        onPress={() => setShowResponseForm(false)}
                      >
                        <Text style={styles.cancelFormText}>{t('mobile.common.cancel')}</Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.submitResponseBtn,
                          (responseText.trim().length < 10 || respondMutation.isPending) && styles.submitResponseBtnDisabled,
                        ]}
                        onPress={() => respondMutation.mutate()}
                        disabled={responseText.trim().length < 10 || respondMutation.isPending}
                        accessibilityRole="button"
                        accessibilityLabel={t('mobile.itr.noticeDetail.submitResponse')}
                      >
                        {respondMutation.isPending ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <Text style={styles.submitResponseText}>{t('mobile.itr.noticeDetail.submitResponse')}</Text>
                        )}
                      </Pressable>
                    </View>
                  </View>
                )}
              </>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.surface.default, borderBottomWidth: 1, borderBottomColor: Colors.neutral[100],
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.neutral[900] },
  scrollContent: { padding: 16, gap: 14 },

  typeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.itr + '0D', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.itr + '25',
  },
  typeIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.itr + '18', alignItems: 'center', justifyContent: 'center' },
  typeText: { flex: 1, gap: 3 },
  typeName: { fontSize: 16, fontWeight: '800', color: Colors.itr },
  typeDesc: { fontSize: 12, color: Colors.neutral[600], lineHeight: 17 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontSize: 12, fontWeight: '700' },

  metaCard: { backgroundColor: Colors.surface.default, borderRadius: 14, borderWidth: 1, borderColor: Colors.neutral[100], overflow: 'hidden' },
  metaRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13, minHeight: 50,
    borderBottomWidth: 1, borderBottomColor: Colors.neutral[50],
  },
  metaLabel: { fontSize: 13, color: Colors.neutral[500], flex: 1 },
  metaValue: { fontSize: 13, fontWeight: '600', color: Colors.neutral[900], flex: 1.5, textAlign: 'right' },

  attachmentsCard: { backgroundColor: Colors.surface.default, borderRadius: 14, borderWidth: 1, borderColor: Colors.neutral[100], padding: 16, gap: 10 },
  attachmentsTitle: { fontSize: 14, fontWeight: '700', color: Colors.neutral[800] },
  attachmentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  attachmentName: { flex: 1, fontSize: 13, color: Colors.neutral[700] },

  responseCard: {
    backgroundColor: Colors.success[50], borderRadius: 14, borderWidth: 1,
    borderColor: Colors.success[200], padding: 16, gap: 10,
  },
  responseHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  responseTitle: { fontSize: 14, fontWeight: '700', color: Colors.success[700], flex: 1 },
  respondedAt: { fontSize: 12, color: Colors.success[600] },
  responseText: { fontSize: 14, color: Colors.success[800], lineHeight: 21 },

  respondBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: Colors.itr, borderRadius: 14, minHeight: 52,
  },
  respondBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  responseForm: { gap: 12 },
  formLabel: { fontSize: 13, fontWeight: '600', color: Colors.neutral[700] },
  responseInput: {
    borderWidth: 1.5, borderColor: Colors.neutral[200], borderRadius: 12,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12,
    fontSize: 15, color: Colors.neutral[900], backgroundColor: Colors.surface.default,
    minHeight: 120,
  },
  charCount: { fontSize: 11, color: Colors.neutral[400], textAlign: 'right' },
  formActions: { flexDirection: 'row', gap: 12 },
  cancelFormBtn: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.neutral[100] },
  cancelFormText: { fontSize: 14, fontWeight: '600', color: Colors.neutral[700] },
  submitResponseBtn: { flex: 2, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.itr },
  submitResponseBtnDisabled: { opacity: 0.4 },
  submitResponseText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
