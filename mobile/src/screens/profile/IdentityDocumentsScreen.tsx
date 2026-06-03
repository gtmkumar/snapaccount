/**
 * Identity Documents Screen
 * Collects the org's tax/identity documents (PAN, Aadhaar, GSTIN, TAN) and shows
 * each document's current status (SAVED / PENDING / VERIFIED / FAILED).
 *
 * Behaviour is gated by the organization's government-verification policy
 * (GET /auth/me/organization/verification-policy):
 *   - policy OFF → POST /auth/me/documents/{kind}  → "Saved (unverified)".
 *   - policy ON  → per-document OTP step: send → 6-digit OTP → confirm.
 *                  otpAccepted=false keeps the document PENDING for retry;
 *                  "Verify later" leaves it PENDING/saved.
 *
 * Reachable from More → Profile → Identity Documents. The PAN/Aadhaar/GSTIN
 * inputs here supersede the KYC stubs in BusinessProfileWizardScreen — these
 * endpoints are the canonical path for collecting documents.
 *
 * SECURITY: document numbers are not auth secrets; they are sent to the backend
 * via the normal API and held only in transient component state — never in
 * SecureStore (reserved for auth tokens).
 */

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { OTPInput } from '../../components/forms/OTPInput';
import { PanInput } from '../../components/shared/PanInput';
import {
  GstinInput,
  TanInput,
  AadhaarNumberInput,
} from '../../components/shared/DocumentNumberInputs';
import { Colors } from '../../constants/colors';
import { getApiError } from '../../lib/api';
import {
  isValidPAN,
  isValidGSTIN,
  isValidTAN,
  isValidAadhaar,
} from '../../lib/utils';
import {
  getVerificationPolicy,
  getDocuments,
  saveDocument,
  sendDocumentOtp,
  confirmDocumentOtp,
  type DocumentKind,
  type DocumentStatus,
  type IdentityDocument,
} from '../../api/documents';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'IdentityDocuments'>;
interface Props { navigation: NavProp }

const KINDS: DocumentKind[] = ['PAN', 'AADHAAR', 'GSTIN', 'TAN'];

/** Per-kind icon for the card header. */
function kindIcon(kind: DocumentKind): React.ComponentProps<typeof Ionicons>['name'] {
  switch (kind) {
    case 'PAN':
      return 'card-outline';
    case 'AADHAAR':
      return 'finger-print-outline';
    case 'GSTIN':
      return 'receipt-outline';
    case 'TAN':
      return 'business-outline';
  }
}

/** Local validity check per kind (number is the normalized/stored value). */
function isValidForKind(kind: DocumentKind, value: string): boolean {
  switch (kind) {
    case 'PAN':
      return isValidPAN(value);
    case 'AADHAAR':
      return isValidAadhaar(value);
    case 'GSTIN':
      return isValidGSTIN(value);
    case 'TAN':
      return isValidTAN(value);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Status chip
// ─────────────────────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: DocumentStatus }) {
  const { t } = useTranslation();
  const map: Record<
    DocumentStatus,
    { bg: string; fg: string; icon: React.ComponentProps<typeof Ionicons>['name']; key: string }
  > = {
    VERIFIED: { bg: Colors.success[50], fg: Colors.success[700], icon: 'checkmark-circle', key: 'verified' },
    SAVED: { bg: Colors.info[50], fg: Colors.info[700], icon: 'save-outline', key: 'saved' },
    PENDING: { bg: Colors.warning[50], fg: Colors.warning[700], icon: 'time-outline', key: 'pending' },
    FAILED: { bg: Colors.error[50], fg: Colors.error[700], icon: 'alert-circle', key: 'failed' },
  };
  const s = map[status];
  return (
    <View style={[chipStyles.chip, { backgroundColor: s.bg }]}>
      <Ionicons name={s.icon} size={13} color={s.fg} />
      <Text style={[chipStyles.chipText, { color: s.fg }]}>
        {t(`mobile.documents.status.${s.key}`)}
      </Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  chipText: { fontSize: 11, fontWeight: '700' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Per-kind input switch
// ─────────────────────────────────────────────────────────────────────────────

function KindInput({
  kind,
  value,
  onChangeText,
  disabled,
}: {
  kind: DocumentKind;
  value: string;
  onChangeText: (v: string) => void;
  disabled: boolean;
}) {
  const common = { value, onChangeText, disabled };
  switch (kind) {
    case 'PAN':
      return <PanInput {...common} />;
    case 'AADHAAR':
      return <AadhaarNumberInput {...common} />;
    case 'GSTIN':
      return <GstinInput {...common} />;
    case 'TAN':
      return <TanInput {...common} />;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Document card
// ─────────────────────────────────────────────────────────────────────────────

interface DocCardProps {
  kind: DocumentKind;
  existing?: IdentityDocument;
  governmentVerificationEnabled: boolean;
  /** Notify parent that a document was saved/verified so it can refresh. */
  onChanged: () => void;
}

type OtpStage = 'idle' | 'otp';

function DocumentCard({
  kind,
  existing,
  governmentVerificationEnabled,
  onChanged,
}: DocCardProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [otp, setOtp] = useState('');
  const [stage, setStage] = useState<OtpStage>('idle');
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const isVerified = existing?.status === 'VERIFIED';
  const valid = isValidForKind(kind, value);

  // ── Save (policy OFF) ──────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: () => saveDocument(kind, value),
    onSuccess: () => {
      setValue('');
      setError('');
      onChanged();
    },
    onError: (err) => setError(getApiError(err).message || t('mobile.documents.errors.save')),
  });

  // ── OTP send (policy ON) ───────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: () => sendDocumentOtp(kind, value),
    onSuccess: (res) => {
      setTransactionId(res.transactionId);
      setStage('otp');
      setOtp('');
      setError('');
    },
    onError: (err) => setError(getApiError(err).message || t('mobile.documents.errors.otpSend')),
  });

  // ── OTP confirm (policy ON) ────────────────────────────────────────────────
  const confirmMutation = useMutation({
    mutationFn: () => {
      if (!transactionId) throw new Error('missing transactionId');
      return confirmDocumentOtp(kind, transactionId, otp);
    },
    onSuccess: (res) => {
      if (!res.otpAccepted || res.status !== 'VERIFIED') {
        // Stay on the OTP step; document remains PENDING for retry.
        setOtp('');
        setError(t('mobile.documents.errors.otpRejected'));
        onChanged();
        return;
      }
      setStage('idle');
      setValue('');
      setOtp('');
      setTransactionId(null);
      setError('');
      onChanged();
    },
    onError: (err) => {
      setOtp('');
      setError(getApiError(err).message || t('mobile.documents.errors.otpConfirm'));
    },
  });

  const busy =
    saveMutation.isPending || sendMutation.isPending || confirmMutation.isPending;

  const verifyLater = () => {
    // Leave whatever the backend already recorded (PENDING/saved); just reset UI.
    setStage('idle');
    setOtp('');
    setTransactionId(null);
    setError('');
    onChanged();
  };

  const handleChangeNumber = (v: string) => {
    setValue(v);
    if (error) setError('');
  };

  return (
    <Card shadow="sm" padding="none" style={styles.docCard}>
      {/* Header: icon + name + status chip */}
      <View style={styles.docHeader}>
        <View style={styles.docIcon}>
          <Ionicons name={kindIcon(kind)} size={20} color={Colors.brand[500]} />
        </View>
        <View style={styles.docTitleWrap}>
          <Text style={styles.docTitle}>{t(`mobile.documents.kind.${kind}.label`)}</Text>
          {existing ? (
            <Text style={styles.docRef} numberOfLines={1}>
              {existing.referenceNumber}
            </Text>
          ) : (
            <Text style={styles.docHint} numberOfLines={1}>
              {t(`mobile.documents.kind.${kind}.hint`)}
            </Text>
          )}
        </View>
        {existing && <StatusChip status={existing.status} />}
      </View>

      {/* Already verified → read-only confirmation, no input. */}
      {isVerified ? null : stage === 'otp' ? (
        // ── OTP entry sub-step (policy ON) ──
        <View style={styles.otpBlock}>
          <Text style={styles.otpPrompt}>{t('mobile.documents.otp.prompt')}</Text>
          <OTPInput
            value={otp}
            onChange={(v) => {
              setOtp(v);
              if (error) setError('');
            }}
            onComplete={() => {}}
            error={Boolean(error)}
            disabled={busy}
            autoFocus
          />
          {error ? (
            <Text style={styles.errorText} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <Button
            label={t('mobile.documents.otp.confirm')}
            onPress={() => confirmMutation.mutate()}
            disabled={otp.length < 6}
            loading={confirmMutation.isPending}
            fullWidth
            size="lg"
          />
          <Button
            label={t('mobile.documents.actions.verifyLater')}
            variant="ghost"
            onPress={verifyLater}
            disabled={busy}
            fullWidth
            size="lg"
          />
        </View>
      ) : (
        // ── Number entry ──
        <View style={styles.inputBlock}>
          <KindInput
            kind={kind}
            value={value}
            onChangeText={handleChangeNumber}
            disabled={busy}
          />
          {error ? (
            <Text style={styles.errorText} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}

          {governmentVerificationEnabled ? (
            <Button
              label={
                existing
                  ? t('mobile.documents.actions.reVerify')
                  : t('mobile.documents.actions.verify')
              }
              onPress={() => sendMutation.mutate()}
              disabled={!valid}
              loading={sendMutation.isPending}
              fullWidth
              size="lg"
            />
          ) : (
            <Button
              label={
                existing
                  ? t('mobile.documents.actions.update')
                  : t('mobile.documents.actions.save')
              }
              onPress={() => saveMutation.mutate()}
              disabled={!valid}
              loading={saveMutation.isPending}
              fullWidth
              size="lg"
            />
          )}
        </View>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export function IdentityDocumentsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const policyQuery = useQuery({
    queryKey: ['documents', 'policy'],
    queryFn: getVerificationPolicy,
  });

  const docsQuery = useQuery({
    queryKey: ['documents', 'list'],
    queryFn: getDocuments,
  });

  const documentsByKind = useMemo(() => {
    const map = new Map<DocumentKind, IdentityDocument>();
    (docsQuery.data ?? []).forEach((d) => map.set(d.kind, d));
    return map;
  }, [docsQuery.data]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['documents', 'list'] });
  };

  const isLoading = policyQuery.isLoading || docsQuery.isLoading;
  const isError = policyQuery.isError || docsQuery.isError;
  const govEnabled = policyQuery.data?.governmentVerificationEnabled ?? false;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.common.back')}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
        </Pressable>
        <Text style={styles.title}>{t('mobile.documents.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.brand[500]} />
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t('mobile.documents.errors.load')}</Text>
          <Button
            label={t('mobile.common.retry')}
            variant="secondary"
            onPress={() => {
              void policyQuery.refetch();
              void docsQuery.refetch();
            }}
            style={styles.retryBtn}
          />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Policy banner */}
            <View style={[styles.banner, govEnabled ? styles.bannerVerify : styles.bannerSave]}>
              <Ionicons
                name={govEnabled ? 'shield-checkmark-outline' : 'information-circle-outline'}
                size={16}
                color={govEnabled ? Colors.success[600] : Colors.info[600]}
                style={styles.bannerIcon}
              />
              <Text
                style={[
                  styles.bannerText,
                  { color: govEnabled ? Colors.success[700] : Colors.info[700] },
                ]}
              >
                {govEnabled
                  ? t('mobile.documents.banner.verify')
                  : t('mobile.documents.banner.save')}
              </Text>
            </View>

            {KINDS.map((kind) => (
              <DocumentCard
                key={kind}
                kind={kind}
                existing={documentsByKind.get(kind)}
                governmentVerificationEnabled={govEnabled}
                onChanged={refresh}
              />
            ))}

            <Text style={styles.footnote}>{t('mobile.documents.footnote')}</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
  flex: { flex: 1 },
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
  title: { fontSize: 18, fontWeight: '700', color: Colors.neutral[900], letterSpacing: -0.2 },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyText: { fontSize: 14, color: Colors.neutral[500], textAlign: 'center' },
  retryBtn: { marginTop: 8 },

  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 12,
  },
  bannerVerify: { backgroundColor: Colors.success[50] },
  bannerSave: { backgroundColor: Colors.info[50] },
  bannerIcon: { marginRight: 8, marginTop: 1 },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18 },

  docCard: { padding: 16, gap: 14 },
  docHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  docIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  docTitleWrap: { flex: 1, gap: 2 },
  docTitle: { fontSize: 15, fontWeight: '700', color: Colors.neutral[900] },
  docRef: { fontSize: 13, color: Colors.neutral[600], fontWeight: '600', letterSpacing: 1 },
  docHint: { fontSize: 12, color: Colors.neutral[400] },

  inputBlock: { gap: 12 },
  otpBlock: { gap: 14 },
  otpPrompt: { fontSize: 13, color: Colors.neutral[600], textAlign: 'center' },

  errorText: { fontSize: 13, color: Colors.error[600], lineHeight: 18 },
  footnote: {
    fontSize: 12,
    color: Colors.neutral[400],
    textAlign: 'center',
    paddingHorizontal: 8,
    lineHeight: 16,
  },
});
