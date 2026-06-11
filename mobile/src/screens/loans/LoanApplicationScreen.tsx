/**
 * LoanApplicationScreen — Form + doc checklist for loan application.
 * Phase 6C — docs/design/mobile/loans/loan-application-screen.md
 *
 * Security: useSensitiveScreen — shows PAN/GSTIN/financials
 * Telemetry: loan.app.opened, loan.app.docUploaded, loan.app.draftSaved, loan.app.previewUnlocked
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
import { useQuery, useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import {
  getLoanApplication,
  listLoanDocuments,
  submitLoanApplication,
  type LoanDocumentType,
} from '../../api/loans';
import { ProgressRing } from '../../components/shared/ProgressRing';
import type { LoanStackParamList } from '../../navigation/LoanStack';

type NavProp = NativeStackNavigationProp<LoanStackParamList, 'LoanApplication'>;
type RoutePropType = RouteProp<LoanStackParamList, 'LoanApplication'>;
interface Props { navigation: NavProp; route: RoutePropType }

type DocRowState = 'pending' | 'uploading' | 'uploaded' | 'auto-ready' | 'auto-pending' | 'error';

interface DocRow {
  type: LoanDocumentType;
  labelKey: string;
  isAuto: boolean;
  state: DocRowState;
}

const INITIAL_ROWS: DocRow[] = [
  { type: 'PAN_CARD', labelKey: 'mobile.loan.application.checklist.row.pan', isAuto: false, state: 'pending' },
  { type: 'AADHAAR', labelKey: 'mobile.loan.application.checklist.row.aadhaar', isAuto: false, state: 'pending' },
  { type: 'GSTR_3B', labelKey: 'mobile.loan.application.checklist.row.gstr3b', isAuto: true, state: 'auto-pending' },
  { type: 'PROFIT_LOSS', labelKey: 'mobile.loan.application.checklist.row.pl', isAuto: true, state: 'auto-ready' },
  { type: 'BALANCE_SHEET', labelKey: 'mobile.loan.application.checklist.row.bs', isAuto: true, state: 'auto-ready' },
  { type: 'BANK_STATEMENT', labelKey: 'mobile.loan.application.checklist.row.bankStmt', isAuto: false, state: 'pending' },
  { type: 'TRADE_LICENSE', labelKey: 'mobile.loan.application.checklist.row.tradeLicense', isAuto: false, state: 'pending' },
  { type: 'ITR', labelKey: 'mobile.loan.application.checklist.row.itr', isAuto: true, state: 'auto-pending' },
];

function docStateColor(state: DocRowState, tk: ThemeTokens): string {
  switch (state) {
    case 'uploaded': case 'auto-ready': return tk.successFg;
    case 'uploading': case 'auto-pending': return tk.warningFg;
    case 'error': return tk.errorFg;
    default: return tk.textTertiary;
  }
}

function docStateIcon(state: DocRowState): React.ComponentProps<typeof Ionicons>['name'] {
  switch (state) {
    case 'uploaded': case 'auto-ready': return 'checkmark-circle';
    case 'uploading': return 'cloud-upload-outline';
    case 'auto-pending': return 'time-outline';
    case 'error': return 'alert-circle';
    default: return 'document-outline';
  }
}

export function LoanApplicationScreen({ navigation, route }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  useSensitiveScreen();
  const { t } = useTranslation();
  const { applicationId, productName } = route.params;

  const [rows, setRows] = useState<DocRow[]>(INITIAL_ROWS);

  const appQuery = useQuery({
    queryKey: ['loan-application', applicationId],
    queryFn: () => (applicationId ? getLoanApplication(applicationId) : Promise.resolve(null)),
    enabled: !!applicationId,
  });

  const docsQuery = useQuery({
    queryKey: ['loan-documents', applicationId],
    queryFn: () => (applicationId ? listLoanDocuments(applicationId) : Promise.resolve({ items: [] })),
    enabled: !!applicationId,
  });

  // Sync uploaded doc types from backend into local row state — adjust state
  // during render (react.dev "you might not need an effect") instead of an
  // effect, avoiding a cascading re-render.
  const [prevDocsData, setPrevDocsData] = useState<typeof docsQuery.data>(undefined);
  if (docsQuery.data !== prevDocsData) {
    setPrevDocsData(docsQuery.data);
    if (docsQuery.data) {
      const uploadedTypes = new Set(docsQuery.data.items.map((d) => d.documentType));
      setRows((prev) =>
        prev.map((r) =>
          uploadedTypes.has(r.type) && !r.isAuto ? { ...r, state: 'uploaded' } : r,
        ),
      );
    }
  }

  const submitMutation = useMutation({
    mutationFn: () => submitLoanApplication(applicationId!),
    onSuccess: () => {
      navigation.navigate('LoanStatus', { applicationId: applicationId! });
    },
    onError: () => {
      Alert.alert(t('mobile.common.retry'), t('mobile.loan.application.error.uploadFailed'));
    },
  });

  const uploadedCount = rows.filter(
    (r) => r.state === 'uploaded' || r.state === 'auto-ready',
  ).length;
  const allReady = uploadedCount === rows.length;

  const handleUploadRow = (row: DocRow) => {
    // In production: navigate to CameraScreen with params.
    // For now: simulate upload with Alert confirmation.
    Alert.alert(
      `Upload ${t(row.labelKey)}`,
      'In production, this opens the camera/file picker. Simulate upload?',
      [
        { text: t('mobile.common.cancel'), style: 'cancel' },
        {
          text: 'Simulate upload',
          onPress: () => {
            setRows((prev) =>
              prev.map((r) =>
                r.type === row.type ? { ...r, state: 'uploaded' } : r,
              ),
            );
          },
        },
      ],
    );
  };

  const handlePreview = () => {
    if (!applicationId) return;
    navigation.navigate('LoanPackagePreview', { applicationId });
  };

  const handleSaveDraft = () => {
    Alert.alert('', t('mobile.loan.application.toast.draftSaved'));
  };

  if (appQuery.isLoading || docsQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={tokens.loanAccent} />
        </View>
      </SafeAreaView>
    );
  }

  const app = appQuery.data;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityLabel={t('mobile.common.back')}
        >
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {t('mobile.loan.application.title', {
            bank: app?.bankName ?? 'Bank',
            product: productName || app?.productName || 'Loan',
          })}
        </Text>
        <Pressable
          style={styles.saveDraftBtn}
          onPress={handleSaveDraft}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Ionicons name="save-outline" size={20} color={tokens.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Application summary strip */}
        <View style={styles.summaryStrip}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>{t('mobile.loan.application.summary.amount')}</Text>
            <Text style={styles.summaryValue}>
              {app ? `₹${(app.requestedAmount / 100_000).toFixed(0)}L` : '—'}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>{t('mobile.loan.application.summary.tenure')}</Text>
            <Text style={styles.summaryValue}>{app?.tenureMonths ?? '—'} mo</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>{t('mobile.loan.application.summary.purpose')}</Text>
            <Text style={styles.summaryValue} numberOfLines={1}>
              {app?.purpose?.replace('_', ' ') ?? '—'}
            </Text>
          </View>
        </View>

        {/* Checklist section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {t('mobile.loan.application.section.checklist')}
            </Text>
            <ProgressRing
              progress={uploadedCount / rows.length}
              size={40}
              strokeWidth={4}
              color={tokens.loanAccent}
              centerText={`${uploadedCount}/${rows.length}`}
            />
          </View>

          {rows.map((row) => (
            <View
              key={row.type}
              style={styles.docRow}
              accessibilityRole={row.isAuto && row.state === 'auto-ready' ? 'text' : 'button'}
              accessibilityLabel={`${t(row.labelKey)}, ${row.state}`}
            >
              <Ionicons
                name={docStateIcon(row.state)}
                size={20}
                color={docStateColor(row.state, tokens)}
              />
              <View style={styles.docRowInfo}>
                <Text style={styles.docRowLabel}>{t(row.labelKey)}</Text>
                <Text style={[styles.docRowBadge, { color: docStateColor(row.state, tokens) }]}>
                  {row.isAuto
                    ? row.state === 'auto-ready'
                      ? t('mobile.loan.application.checklist.badge.auto') + ' ✓'
                      : t('mobile.loan.application.checklist.badge.autoPending')
                    : row.state === 'uploaded'
                    ? t('mobile.loan.application.checklist.badge.uploaded')
                    : t('mobile.loan.application.checklist.badge.error')}
                </Text>
              </View>
              {!row.isAuto && row.state !== 'uploaded' && (
                <Pressable
                  style={styles.uploadCta}
                  onPress={() => handleUploadRow(row)}
                  accessibilityRole="button"
                  accessibilityLabel={`Upload ${t(row.labelKey)}`}
                  hitSlop={8}
                >
                  <Ionicons name="cloud-upload-outline" size={16} color={tokens.loanAccent} />
                  <Text style={styles.uploadCtaText}>Upload</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>

        {/* Package preview teaser — unlocked once all docs ready */}
        {allReady && (
          <Pressable
            style={styles.previewTeaser}
            onPress={handlePreview}
            accessibilityRole="button"
          >
            <Ionicons name="document-text" size={18} color={tokens.loanAccent} />
            <Text style={styles.previewTeaserText}>
              {t('mobile.loan.application.preview.teaser', { pages: 47 })}
            </Text>
            <Ionicons name="arrow-forward" size={16} color={tokens.loanAccent} />
          </Pressable>
        )}
      </ScrollView>

      {/* Sticky footer */}
      <View style={styles.footer}>
        <Pressable
          style={styles.secondaryBtn}
          onPress={handleSaveDraft}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryBtnText}>
            {t('mobile.loan.application.cta.saveExit')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.primaryBtn, !allReady && styles.primaryBtnDisabled]}
          onPress={allReady ? handlePreview : undefined}
          disabled={!allReady || submitMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel={
            allReady
              ? t('mobile.loan.application.cta.preview')
              : t('mobile.loan.application.gate.signConsents')
          }
        >
          {submitMutation.isPending ? (
            <ActivityIndicator color={tokens.textOnBrand} />
          ) : (
            <>
              <Text style={[styles.primaryBtnText, !allReady && styles.primaryBtnTextDisabled]}>
                {allReady
                  ? t('mobile.loan.application.cta.preview')
                  : t('mobile.loan.application.gate.signConsents')}
              </Text>
              <Ionicons
                name="arrow-forward"
                size={16}
                color={allReady ? tokens.textOnBrand : tokens.textTertiary}
              />
            </>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: tk.canvas },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: tk.raised,
    borderBottomWidth: 1,
    borderBottomColor: tk.border,
    gap: 8,
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
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: tk.textPrimary },
  saveDraftBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  scrollContent: { padding: 16, gap: 14, paddingBottom: 24 },

  summaryStrip: {
    flexDirection: 'row',
    backgroundColor: tk.raised,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    shadowColor: tk.shadowColor,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryLabel: { fontSize: 11, color: tk.textSecondary, fontWeight: '500' },
  summaryValue: { fontSize: 14, fontWeight: '700', color: tk.textPrimary },
  summaryDivider: { width: 1, height: 32, backgroundColor: tk.border },

  section: {
    backgroundColor: tk.raised,
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: tk.textPrimary },

  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    borderBottomWidth: 1,
    borderBottomColor: tk.border,
    paddingVertical: 10,
  },
  docRowInfo: { flex: 1 },
  docRowLabel: { fontSize: 14, fontWeight: '600', color: tk.textPrimary },
  docRowBadge: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  uploadCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: tk.warningTint,
    // P6-QA-MOBILE-08: 44pt minimum touch target (was 36).
    minHeight: 44,
  },
  uploadCtaText: { fontSize: 12, fontWeight: '700', color: tk.loanAccent },

  previewTeaser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tk.warningTint,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: tk.warningTintBorder,
  },
  previewTeaserText: { flex: 1, fontSize: 14, fontWeight: '600', color: tk.loanAccent },

  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    backgroundColor: tk.raised,
    borderTopWidth: 1,
    borderTopColor: tk.border,
  },
  secondaryBtn: {
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: tk.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: tk.textSecondary },
  primaryBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: tk.loanAccent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: tk.textOnBrand },
  primaryBtnTextDisabled: { color: tk.textTertiary },
  }),
);
