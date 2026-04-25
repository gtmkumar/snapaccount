/**
 * RequestCallbackModalScreen
 * Modal form: category, preferred time window, reason, priority, language.
 * On submit → POST /callbacks → navigate to CallbackStatusScreen.
 * Phase 6E — docs/design/mobile/callbacks/request-callback-modal.md
 */

import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import { createCallback, type CallbackCategory, type CallbackPriority } from '../../api/callbacks';
import type { CtaCategory } from '../../components/callbacks/RequestCallbackCta';
import { useAuthStore } from '../../store/authStore';
import type { MoreStackParamList } from '../../navigation/MoreStack';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'RequestCallbackModal'>;
type RouteProps = RouteProp<MoreStackParamList, 'RequestCallbackModal'>;
interface Props { navigation: NavProp; route: RouteProps }

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type TimeOption = 'asap' | 'today' | 'tomorrow' | 'another';
type Priority = 'Low' | 'Normal' | 'High' | 'Urgent';

const CATEGORY_MAP: Record<CtaCategory, CallbackCategory> = {
  GST: 'Gst', ITR: 'Itr', LOAN: 'Loan',
  DOC: 'Accounting', BILLING: 'Subscription', OTHER: 'General',
};

const CATEGORIES: CtaCategory[] = ['GST', 'ITR', 'LOAN', 'DOC', 'BILLING', 'OTHER'];
const PRIMARY_CATEGORIES: CtaCategory[] = ['GST', 'ITR', 'LOAN', 'DOC'];
const PRIORITIES: Priority[] = ['Low', 'Normal', 'High', 'Urgent'];
const MAX_REASON = 500;
const MIN_REASON = 20;

// Business hours IST
const BIZ_HOUR_START = 9;
const BIZ_HOUR_END = 20;

function buildWindow(timeOption: TimeOption, hour: number): { start: string; end: string } | null {
  if (timeOption === 'asap') return null;
  const now = new Date();
  const d = new Date(now);
  if (timeOption === 'tomorrow') d.setDate(d.getDate() + 1);
  const start = new Date(d);
  start.setHours(hour, 0, 0, 0);
  const end = new Date(start);
  end.setHours(hour + 2, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export function RequestCallbackModalScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  // SEC-033: prevent screenshot on sensitive modal
  useSensitiveScreen();

  const {
    category: paramCategory = 'OTHER',
    linkedEntity,
    prefillReason = '',
  } = route.params ?? {};

  const [category, setCategory] = useState<CtaCategory>(paramCategory);
  const [showMoreCategories, setShowMoreCategories] = useState(false);
  const [timeOption, setTimeOption] = useState<TimeOption>('asap');
  const [windowHour, setWindowHour] = useState(10);
  const [reason, setReason] = useState(prefillReason);
  const [priority, setPriority] = useState<Priority>('Normal');
  const [showPriority, setShowPriority] = useState(false);
  const [language, setLanguage] = useState<'en' | 'hi' | 'bn'>('en');
  const [error, setError] = useState<string | null>(null);
  const [conflictId, setConflictId] = useState<string | null>(null);

  const phone = user?.phone ?? '+919876543210';

  // ── Validation ───────────────────────────────────────────────────────────

  const reasonValid =
    reason.length >= MIN_REASON || linkedEntity !== undefined;
  const reasonTooLong = reason.length > MAX_REASON;
  const canSubmit = category && reasonValid && !reasonTooLong;

  // ── Submit ───────────────────────────────────────────────────────────────

  const { mutate: submit, isPending } = useMutation({
    mutationFn: async () => {
      const window = buildWindow(timeOption, windowHour);
      return createCallback({
        phoneNumber: phone,
        category: CATEGORY_MAP[category],
        priority: priority as CallbackPriority,
        issueDescription: reason || undefined,
        preferredWindowStart: window?.start,
        preferredWindowEnd: window?.end,
      });
    },
    onSuccess: (data) => {
      navigation.replace('CallbackStatus', { callbackId: data.callbackId });
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { status?: number; data?: { callbackId?: string; message?: string } } };
      const status = axErr?.response?.status;
      if (status === 409) {
        const existingId = axErr?.response?.data?.callbackId;
        if (existingId) {
          setConflictId(existingId);
          setError(null);
        } else {
          setError('You already have an open callback for this category.');
        }
      } else if (status === 429) {
        setError(t('mobile.callback.modal.errorRateLimit', { time: '1 hour' }));
      } else {
        setError(t('mobile.callback.modal.errorTitle'));
      }
    },
  });

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (priority === 'Urgent') {
      Alert.alert(
        t('mobile.callback.modal.urgentConfirmTitle'),
        t('mobile.callback.modal.urgentConfirmBody'),
        [
          { text: t('mobile.callback.modal.urgentConfirmCancel'), style: 'cancel' },
          { text: t('mobile.callback.modal.urgentConfirmOk'), onPress: () => submit() },
        ],
      );
      return;
    }
    submit();
  };

  const reasonPlaceholderKey = ({
    GST: 'mobile.callback.modal.reasonPlaceholderGst',
    ITR: 'mobile.callback.modal.reasonPlaceholderItr',
    LOAN: 'mobile.callback.modal.reasonPlaceholderLoan',
  } as Record<string, string>)[category] ?? 'mobile.callback.modal.reasonPlaceholder';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            style={styles.closeBtn}
            onPress={() => navigation.goBack()}
            accessibilityLabel={t('mobile.callback.modal.close')}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Ionicons name="close" size={22} color={Colors.neutral[700]} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('mobile.callback.modal.title')}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Error banner */}
          {error && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={16} color={Colors.error[600]} />
              <Text style={styles.errorBannerText}>{error}</Text>
              <Pressable onPress={() => submit()} hitSlop={8}>
                <Text style={styles.errorBannerCta}>{t('mobile.callback.modal.errorRetry')}</Text>
              </Pressable>
            </View>
          )}

          {/* Conflict banner */}
          {conflictId && (
            <View style={styles.conflictBanner}>
              <Text style={styles.conflictBannerText}>
                You already have an open callback for this category.
              </Text>
              <Pressable
                onPress={() => navigation.replace('CallbackStatus', { callbackId: conflictId })}
                hitSlop={8}
              >
                <Text style={styles.conflictBannerCta}>{t('mobile.callback.modal.errorConflict')}</Text>
              </Pressable>
            </View>
          )}

          {/* Linked entity context card */}
          {linkedEntity && (
            <View style={styles.contextCard}>
              <Text style={styles.contextLabel}>{t('mobile.callback.modal.aboutLabel')}</Text>
              <Text style={styles.contextValue}>{linkedEntity.label}</Text>
            </View>
          )}

          {/* Category */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('mobile.callback.modal.categoryLabel')}</Text>
            <View style={styles.categoryRow}>
              {PRIMARY_CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  style={[styles.categoryChip, category === cat && styles.categoryChipActive]}
                  onPress={() => setCategory(cat)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: category === cat }}
                >
                  <Text style={[styles.categoryChipText, category === cat && styles.categoryChipTextActive]}>
                    {t(`mobile.callback.modal.categories.${cat.toLowerCase()}`)}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                style={styles.categoryChip}
                onPress={() => setShowMoreCategories(!showMoreCategories)}
              >
                <Text style={styles.categoryChipText}>More ▾</Text>
              </Pressable>
            </View>
            {showMoreCategories && (
              <View style={styles.categoryRow}>
                {(['BILLING', 'OTHER'] as CtaCategory[]).map((cat) => (
                  <Pressable
                    key={cat}
                    style={[styles.categoryChip, category === cat && styles.categoryChipActive]}
                    onPress={() => { setCategory(cat); setShowMoreCategories(false); }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: category === cat }}
                  >
                    <Text style={[styles.categoryChipText, category === cat && styles.categoryChipTextActive]}>
                      {t(`mobile.callback.modal.categories.${cat.toLowerCase()}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Preferred time */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('mobile.callback.modal.timeLabel')}</Text>
            {(['asap', 'today', 'tomorrow', 'another'] as TimeOption[]).map((opt) => (
              <Pressable
                key={opt}
                style={styles.radioRow}
                onPress={() => setTimeOption(opt)}
                accessibilityRole="radio"
                accessibilityState={{ selected: timeOption === opt }}
              >
                <View style={[styles.radio, timeOption === opt && styles.radioSelected]}>
                  {timeOption === opt && <View style={styles.radioDot} />}
                </View>
                <Text style={styles.radioLabel}>
                  {t(`mobile.callback.modal.time${opt.charAt(0).toUpperCase() + opt.slice(1)}`)}
                </Text>
              </Pressable>
            ))}

            {/* Hour picker for today/tomorrow/another */}
            {timeOption !== 'asap' && (
              <View style={styles.hourPicker}>
                <Text style={styles.hourPickerLabel}>Start hour:</Text>
                <View style={styles.hourRow}>
                  {[9, 10, 11, 12, 14, 15, 16, 17, 18].map((h) => (
                    <Pressable
                      key={h}
                      style={[styles.hourChip, windowHour === h && styles.hourChipActive]}
                      onPress={() => setWindowHour(h)}
                    >
                      <Text style={[styles.hourChipText, windowHour === h && styles.hourChipTextActive]}>
                        {h}:00
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {windowHour < BIZ_HOUR_START || windowHour >= BIZ_HOUR_END - 1 ? (
                  <Text style={styles.fieldError}>{t('mobile.callback.modal.timeWindowError')}</Text>
                ) : null}
              </View>
            )}
          </View>

          {/* Reason */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('mobile.callback.modal.reasonLabel')}</Text>
            <TextInput
              style={styles.textarea}
              value={reason}
              onChangeText={setReason}
              placeholder={t(reasonPlaceholderKey)}
              placeholderTextColor={Colors.neutral[400]}
              multiline
              numberOfLines={4}
              maxLength={MAX_REASON + 10}
              accessibilityLabel={t('mobile.callback.modal.reasonLabel')}
            />
            <View style={styles.charCountRow}>
              {!reasonValid && reason.length > 0 && (
                <Text style={styles.fieldError}>{t('mobile.callback.modal.reasonMinError')}</Text>
              )}
              {reasonTooLong && (
                <Text style={styles.fieldError}>{t('mobile.callback.modal.reasonMaxError')}</Text>
              )}
              <Text style={[styles.charCount, reasonTooLong && styles.charCountError]}>
                {reason.length} / {MAX_REASON}
              </Text>
            </View>
          </View>

          {/* Priority (collapsible) */}
          <View style={styles.section}>
            <Pressable
              style={styles.accordionHeader}
              onPress={() => setShowPriority(!showPriority)}
            >
              <Text style={styles.sectionLabel}>{t('mobile.callback.modal.priorityLabel')}</Text>
              <Ionicons
                name={showPriority ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={Colors.neutral[500]}
              />
            </Pressable>
            {showPriority && (
              <View style={styles.categoryRow}>
                {PRIORITIES.map((p) => (
                  <Pressable
                    key={p}
                    style={[styles.categoryChip, priority === p && styles.categoryChipActive]}
                    onPress={() => setPriority(p)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: priority === p }}
                  >
                    <Text style={[styles.categoryChipText, priority === p && styles.categoryChipTextActive]}>
                      {t(`mobile.callback.modal.priority${p}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Language */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('mobile.callback.modal.languageLabel')}</Text>
            <View style={styles.categoryRow}>
              {(['en', 'hi', 'bn'] as const).map((lang) => (
                <Pressable
                  key={lang}
                  style={[styles.categoryChip, language === lang && styles.categoryChipActive]}
                  onPress={() => setLanguage(lang)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: language === lang }}
                >
                  <Text style={[styles.categoryChipText, language === lang && styles.categoryChipTextActive]}>
                    {t(`mobile.callback.modal.lang${lang.charAt(0).toUpperCase() + lang.slice(1)}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <Pressable
            style={styles.cancelBtn}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
          >
            <Text style={styles.cancelBtnText}>{t('mobile.callback.modal.cancel')}</Text>
          </Pressable>
          <Pressable
            style={[styles.submitBtn, (!canSubmit || isPending) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit || isPending}
            accessibilityRole="button"
          >
            <Text style={styles.submitBtnText}>
              {isPending ? t('mobile.callback.modal.submitting') : t('mobile.callback.modal.submit')}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: Colors.surface.default },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 4, paddingBottom: 20 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.neutral[100],
  },
  closeBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: Colors.neutral[900] },
  headerSpacer: { width: 44 },

  // Error/conflict banners
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.error[50], borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: Colors.error[200], marginBottom: 12,
  },
  errorBannerText: { flex: 1, fontSize: 13, color: Colors.error[700] },
  errorBannerCta: { fontSize: 13, color: Colors.error[600], fontWeight: '700' },
  conflictBanner: {
    backgroundColor: Colors.warning[50], borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: Colors.warning[200], marginBottom: 12, gap: 8,
  },
  conflictBannerText: { fontSize: 13, color: Colors.warning[800] },
  conflictBannerCta: { fontSize: 13, color: Colors.brand[600], fontWeight: '700' },

  // Context card
  contextCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.neutral[50], borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: Colors.neutral[200], marginBottom: 12,
  },
  contextLabel: { fontSize: 12, color: Colors.neutral[500] },
  contextValue: { fontSize: 13, fontWeight: '600', color: Colors.neutral[800], flex: 1 },

  // Section
  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: Colors.neutral[800], marginBottom: 10 },

  // Category chips
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22,
    backgroundColor: Colors.neutral[100], borderWidth: 1, borderColor: Colors.neutral[200],
    minHeight: 44, alignItems: 'center', justifyContent: 'center',
  },
  categoryChipActive: { backgroundColor: Colors.brand[500], borderColor: Colors.brand[500] },
  categoryChipText: { fontSize: 13, fontWeight: '500', color: Colors.neutral[700] },
  categoryChipTextActive: { color: Colors.neutral[0], fontWeight: '600' },

  // Radio
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 44 },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: Colors.neutral[300],
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: Colors.brand[500] },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.brand[500] },
  radioLabel: { fontSize: 14, color: Colors.neutral[800], flex: 1 },

  // Hour picker
  hourPicker: { marginTop: 12, gap: 8 },
  hourPickerLabel: { fontSize: 13, color: Colors.neutral[600] },
  hourRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hourChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: Colors.neutral[100], borderWidth: 1, borderColor: Colors.neutral[200],
    minHeight: 44, alignItems: 'center', justifyContent: 'center',
  },
  hourChipActive: { backgroundColor: Colors.brand[50], borderColor: Colors.brand[400] },
  hourChipText: { fontSize: 13, color: Colors.neutral[700] },
  hourChipTextActive: { color: Colors.brand[700], fontWeight: '600' },

  // Textarea
  textarea: {
    borderWidth: 1, borderColor: Colors.neutral[200],
    borderRadius: 12, padding: 14,
    fontSize: 14, color: Colors.neutral[900],
    minHeight: 100, textAlignVertical: 'top',
    backgroundColor: Colors.neutral[50],
  },
  charCountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  charCount: { fontSize: 12, color: Colors.neutral[400] },
  charCountError: { color: Colors.error[600] },
  fieldError: { fontSize: 12, color: Colors.error[600], flex: 1 },

  // Priority accordion
  accordionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 4,
  },

  // Footer
  footer: {
    flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: Colors.neutral[100],
    backgroundColor: Colors.surface.default,
  },
  cancelBtn: {
    flex: 0.4, borderRadius: 12, borderWidth: 1, borderColor: Colors.neutral[200],
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center', minHeight: 52,
  },
  cancelBtnText: { fontSize: 15, color: Colors.neutral[600], fontWeight: '600' },
  submitBtn: {
    flex: 0.6, backgroundColor: Colors.brand[500], borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center', minHeight: 52,
  },
  submitBtnDisabled: { backgroundColor: Colors.neutral[200] },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: Colors.neutral[0] },
});
