/**
 * GstNoticeDetailScreen — GST notice detail + respond capability.
 * Phase 6B stub — full implementation in future phase when backend notice
 * detail response shape is confirmed.
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
import { getGstNotice, respondToGstNotice } from '../../api/gst';
import type { GstStackParamList } from '../../navigation/GstStack';

type NavProp = NativeStackNavigationProp<GstStackParamList, 'GstNoticeDetail'>;
type RoutePropType = RouteProp<GstStackParamList, 'GstNoticeDetail'>;

interface Props {
  navigation: NavProp;
  route: RoutePropType;
}

export function GstNoticeDetailScreen({ navigation, route }: Props) {
  useSensitiveScreen();
  const { t } = useTranslation();
  const { noticeId } = route.params;
  const qc = useQueryClient();
  const [responseText, setResponseText] = useState('');
  const [showForm, setShowForm] = useState(false);

  const { data: notice, isLoading } = useQuery({
    queryKey: ['gst-notice-detail', noticeId],
    queryFn: () => getGstNotice(noticeId),
  });

  const respondMutation = useMutation({
    mutationFn: () =>
      respondToGstNotice(noticeId, {
        noticeId,
        respondedByUserId: '',
        responseText: responseText.trim(),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['gst-notices'] });
      Alert.alert(
        t('mobile.gst.noticeDetail.successTitle'),
        t('mobile.gst.noticeDetail.successBody'),
        [{ text: t('mobile.common.ok'), onPress: () => navigation.goBack() }],
      );
    },
    onError: () => {
      Alert.alert(t('mobile.gst.noticeDetail.errorTitle'), t('mobile.gst.noticeDetail.errorBody'));
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}
          accessibilityLabel={t('mobile.common.back')}>
          <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.gst.noticeDetail.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.gst} style={{ marginTop: 40 }} />
        ) : notice ? (
          <>
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
              {notice.dueDate && (
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>{t('mobile.gst.noticeDetail.dueDate')}</Text>
                  <DueDateChip dueDate={notice.dueDate} />
                </View>
              )}
            </View>

            {notice.description && (
              <View style={styles.descCard}>
                <Text style={styles.descTitle}>{t('mobile.gst.noticeDetail.description')}</Text>
                <Text style={styles.descText}>{notice.description}</Text>
              </View>
            )}

            {(notice.status === 'Open' || notice.status === 'Overdue') && !notice.responseText && (
              <>
                {!showForm ? (
                  <Pressable style={styles.respondBtn} onPress={() => setShowForm(true)}
                    accessibilityRole="button">
                    <Ionicons name="create-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.respondBtnText}>{t('mobile.gst.noticeDetail.respondCta')}</Text>
                  </Pressable>
                ) : (
                  <View style={styles.form}>
                    <TextInput
                      style={styles.responseInput}
                      value={responseText}
                      onChangeText={setResponseText}
                      placeholder={t('mobile.gst.noticeDetail.responsePlaceholder')}
                      placeholderTextColor={Colors.neutral[400]}
                      multiline
                      numberOfLines={5}
                      textAlignVertical="top"
                    />
                    <Pressable
                      style={[styles.submitBtn, (responseText.trim().length < 10 || respondMutation.isPending) && styles.submitBtnDisabled]}
                      onPress={() => respondMutation.mutate()}
                      disabled={responseText.trim().length < 10 || respondMutation.isPending}
                    >
                      {respondMutation.isPending ? <ActivityIndicator color="#FFFFFF" size="small" /> : (
                        <Text style={styles.submitBtnText}>{t('mobile.gst.noticeDetail.submitResponse')}</Text>
                      )}
                    </Pressable>
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
  card: { backgroundColor: Colors.surface.default, borderRadius: 14, borderWidth: 1, borderColor: Colors.neutral[100], overflow: 'hidden' },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13, minHeight: 50,
    borderBottomWidth: 1, borderBottomColor: Colors.neutral[50],
  },
  rowLabel: { fontSize: 13, color: Colors.neutral[500], flex: 1 },
  rowValue: { fontSize: 13, fontWeight: '600', color: Colors.neutral[900], flex: 1.5, textAlign: 'right' },
  descCard: { backgroundColor: Colors.surface.default, borderRadius: 14, borderWidth: 1, borderColor: Colors.neutral[100], padding: 16, gap: 8 },
  descTitle: { fontSize: 14, fontWeight: '700', color: Colors.neutral[800] },
  descText: { fontSize: 14, color: Colors.neutral[700], lineHeight: 21 },
  respondBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.gst, borderRadius: 14, minHeight: 52 },
  respondBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  form: { gap: 12 },
  responseInput: {
    borderWidth: 1.5, borderColor: Colors.neutral[200], borderRadius: 12,
    paddingHorizontal: 14, paddingTop: 12, fontSize: 15, color: Colors.neutral[900],
    backgroundColor: Colors.surface.default, minHeight: 120,
  },
  submitBtn: { backgroundColor: Colors.gst, borderRadius: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
