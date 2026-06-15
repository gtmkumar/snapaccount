/**
 * Document Detail Screen
 * Full document view with OCR results, status timeline, metadata
 * Matches docs/design/screens/mobile/document-vault.md §Screen 15
 */

import React from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { StatusBadge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { AmountDisplay } from '../../components/ui/AmountDisplay';
import { StatusTimeline } from '../../components/shared/StatusTimeline';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { formatDateIN } from '../../lib/utils';
import apiClient from '../../lib/api';
import type { DocumentStackParamList } from '../../navigation/DocumentStack';
import type { DocumentStatus } from '../../components/ui/Badge';

type NavProp = NativeStackNavigationProp<DocumentStackParamList, 'DocumentDetail'>;
type RoutePropType = RouteProp<DocumentStackParamList, 'DocumentDetail'>;
interface Props { navigation: NavProp; route: RoutePropType }

interface OcrField {
  label: string;
  value: string;
  confidence: number; // 0-100
}

interface DocumentDetail {
  id: string;
  filename: string;
  category: string;
  status: DocumentStatus;
  imageUrl: string;
  thumbnailUrl?: string;
  date?: string;
  vendor?: string;
  amount?: number;
  ocrConfidence: number;
  ocrFields: OcrField[];
  tags: string[];
  fileSize: number;
  uploadedAt: string;
  processedAt?: string;
}

// Shape returned by GET /documents/{id} (DocumentService GetDocumentQuery.DocumentDto).
interface BackendOcrField { name: string; value?: string | null; confidence?: number | null }
interface BackendDocumentDto {
  id: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes?: number | null;
  status: string;
  storageUrl?: string | null;
  amount?: number | null;
  vendorName?: string | null;
  documentDate?: string | null;
  uploadedAt: string;
  ocrConfidence?: number | null;       // 0..1
  ocrConfidenceLevel?: string | null;  // GREEN | YELLOW | RED
  fields?: BackendOcrField[] | null;
}

// Translated labels for the well-known extracted field keys.
const FIELD_LABEL_KEYS: Record<string, string> = {
  vendor_name: 'mobile.docs.detail.fields.vendor',
  amount: 'mobile.docs.detail.fields.amount',
  document_date: 'mobile.docs.detail.fields.date',
  gstin: 'mobile.docs.detail.fields.gstin',
  invoice_number: 'mobile.docs.detail.fields.invoiceNo',
  gst_rate: 'mobile.docs.detail.fields.gstRate',
  tax_amount: 'mobile.docs.detail.fields.tax',
  total_amount: 'mobile.docs.detail.fields.total',
};

function prettyLabel(key: string, t: TFunction): string {
  const labelKey = FIELD_LABEL_KEYS[key];
  if (labelKey) return t(labelKey);
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function mapDocument(d: BackendDocumentDto, t: TFunction): DocumentDetail {
  const conf = Math.round((d.ocrConfidence ?? 0) * 100);
  return {
    id: d.id,
    filename: d.fileName,
    category: t('mobile.docs.detail.categoryFallback'),
    status: d.status as DocumentStatus,
    imageUrl: d.storageUrl ?? '',
    date: d.documentDate ?? undefined,
    vendor: d.vendorName ?? undefined,
    amount: d.amount ?? undefined,
    ocrConfidence: conf,
    ocrFields: (d.fields ?? [])
      .filter((f) => f.value != null && f.value !== '')
      .map((f) => ({
        label: prettyLabel(f.name, t),
        value: String(f.value),
        confidence: Math.round((f.confidence ?? d.ocrConfidence ?? 0) * 100),
      })),
    tags: [],
    fileSize: d.fileSizeBytes ?? 0,
    uploadedAt: d.uploadedAt,
  };
}

const DOCUMENT_STATUS_STEPS = [
  { id: 'uploaded', labelKey: 'mobile.docs.detail.steps.uploaded' },
  { id: 'ocr_complete', labelKey: 'mobile.docs.detail.steps.ocrComplete' },
  { id: 'in_review', labelKey: 'mobile.docs.detail.steps.inReview' },
  { id: 'processed', labelKey: 'mobile.docs.detail.steps.processed' },
];

function getTimelineSteps(status: DocumentStatus, t: TFunction) {
  const statusOrder: Record<DocumentStatus, number> = {
    UPLOADED: 0,
    OCR_COMPLETE: 1,
    IN_REVIEW: 2,
    PROCESSED: 3,
    REJECTED: 3,
  };
  const currentIndex = statusOrder[status];

  return DOCUMENT_STATUS_STEPS.map((step, index) => ({
    id: step.id,
    label: t(step.labelKey),
    status: index < currentIndex
      ? 'completed' as const
      : index === currentIndex
        ? (status === 'REJECTED' ? 'error' as const : 'active' as const)
        : 'pending' as const,
  }));
}

function getOcrConfidenceConfig(confidence: number, tk: ThemeTokens, t: TFunction) {
  if (confidence >= 80) return {
    color: tk.successFg,
    bg: tk.successTint,
    label: t('mobile.docs.detail.confidence.high'),
  };
  if (confidence >= 50) return {
    color: tk.warningFg,
    bg: tk.warningTint,
    label: t('mobile.docs.detail.confidence.medium'),
  };
  return {
    color: tk.errorFg,
    bg: tk.errorTint,
    label: t('mobile.docs.detail.confidence.low'),
  };
}

function getFieldConfidenceColor(confidence: number, tk: ThemeTokens): string {
  if (confidence >= 80) return 'transparent';
  if (confidence >= 50) return tk.warningTint;
  return tk.errorTint;
}

export function DocumentDetailScreen({ navigation, route }: Props) {
  const styles = useStyles();
  const { tokens } = useTheme();
  const { t } = useTranslation();
  const { documentId } = route.params;

  const { data: document, isLoading } = useQuery({
    queryKey: ['document', documentId],
    // Re-fetch while the doc is still being processed so extracted fields appear when ready.
    refetchInterval: (q) => {
      const s = (q.state.data as DocumentDetail | undefined)?.status;
      return s && s !== 'UPLOADED' && s !== 'OCR_COMPLETE' ? false : 2500;
    },
    queryFn: async () => {
      const res = await apiClient.get<BackendDocumentDto>(`/documents/${documentId}`);
      return mapDocument(res.data, t);
    },
  });

  const handleDelete = () => {
    Alert.alert(
      t('mobile.docs.detail.action.delete'),
      t('mobile.docs.detail.delete.body'),
      [
        { text: t('mobile.common.cancel'), style: 'cancel' },
        {
          text: t('mobile.docs.detail.delete.confirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.delete(`/documents/${documentId}`);
              navigation.goBack();
            } catch {
              Alert.alert(t('mobile.common.error'), t('mobile.docs.detail.delete.error'));
            }
          },
        },
      ],
    );
  };

  if (isLoading || !document) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>{t('mobile.docs.detail.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const ocrConfig = getOcrConfidenceConfig(document.ocrConfidence, tokens, t);
  const timelineSteps = getTimelineSteps(document.status, t);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {document.category}
        </Text>
        <Pressable
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.docs.detail.share')}
        >
          <Text>⬆️</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Document image */}
        <View style={styles.imageContainer}>
          {document.imageUrl ? (
            <Image
              source={{ uri: document.imageUrl }}
              style={styles.documentImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.imagePlaceholderText}>📄</Text>
            </View>
          )}
        </View>

        {/* OCR Confidence banner */}
        <View style={[styles.ocrBanner, { backgroundColor: ocrConfig.bg }]}>
          <Text style={[styles.ocrBannerText, { color: ocrConfig.color }]}>
            {ocrConfig.label}
          </Text>
        </View>

        {/* Status + Timeline */}
        <Card style={styles.section}>
          <View style={styles.statusRow}>
            <Text style={styles.sectionTitle}>{t('mobile.docs.detail.section.status')}</Text>
            <StatusBadge status={document.status} />
          </View>
          <StatusTimeline steps={timelineSteps} />
        </Card>

        {/* OCR Fields */}
        {document.ocrFields.length > 0 && (
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>{t('mobile.docs.detail.section.extracted')}</Text>
            {document.ocrFields.map((field, index) => (
              <View
                key={index}
                style={[
                  styles.ocrFieldRow,
                  { backgroundColor: getFieldConfidenceColor(field.confidence, tokens) },
                ]}
              >
                <Text style={styles.ocrFieldLabel}>{field.label}</Text>
                <Text style={styles.ocrFieldValue}>{field.value}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* Metadata */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>{t('mobile.docs.detail.section.details')}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{t('mobile.docs.detail.meta.category')}</Text>
            <Text style={styles.metaValue}>{document.category}</Text>
          </View>
          {document.date && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{t('mobile.docs.detail.fields.date')}</Text>
              <Text style={styles.metaValue}>{formatDateIN(new Date(document.date))}</Text>
            </View>
          )}
          {document.amount !== undefined && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{t('mobile.docs.detail.fields.amount')}</Text>
              <AmountDisplay amount={document.amount} size="sm" />
            </View>
          )}
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{t('mobile.docs.detail.meta.uploaded')}</Text>
            <Text style={styles.metaValue}>{formatDateIN(new Date(document.uploadedAt))}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{t('mobile.docs.detail.meta.fileSize')}</Text>
            <Text style={styles.metaValue}>{(document.fileSize / 1024).toFixed(1)} KB</Text>
          </View>
        </Card>

        {/* Actions */}
        <View style={styles.actionsSection}>
          <Button
            label={t('mobile.docs.detail.action.share')}
            variant="secondary"
            fullWidth
            onPress={() => {}}
          />
          <Button
            label={t('mobile.docs.detail.action.download')}
            variant="secondary"
            fullWidth
            onPress={() => {}}
          />
          <Button
            label={t('mobile.docs.detail.action.delete')}
            variant="ghost"
            fullWidth
            onPress={handleDelete}
            style={styles.deleteBtn}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: tk.canvas },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 16, color: tk.textSecondary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: tk.raised,
    borderBottomWidth: 1,
    borderBottomColor: tk.border,
  },
  backBtn: { padding: 4, marginRight: 8 },
  backText: { fontSize: 20, color: tk.brand500 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: tk.textPrimary },
  headerBtn: { padding: 8 },
  scrollContent: { padding: 16, gap: 16 },
  imageContainer: {
    height: 240,
    backgroundColor: tk.textPrimary,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentImage: { width: '100%', height: '100%' },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  imagePlaceholderText: { fontSize: 64 },
  ocrBanner: {
    padding: 12,
    borderRadius: 8,
  },
  ocrBannerText: { fontSize: 13, fontWeight: '500', textAlign: 'center' },
  section: { padding: 16 },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: tk.textPrimary,
    marginBottom: 12,
  },
  ocrFieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 4,
  },
  ocrFieldLabel: { fontSize: 13, color: tk.textSecondary },
  ocrFieldValue: { fontSize: 13, fontWeight: '500', color: tk.textPrimary },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: tk.border,
  },
  metaLabel: { fontSize: 13, color: tk.textSecondary },
  metaValue: { fontSize: 13, fontWeight: '500', color: tk.textPrimary },
  actionsSection: { gap: 10 },
  deleteBtn: {},
  }),
);
