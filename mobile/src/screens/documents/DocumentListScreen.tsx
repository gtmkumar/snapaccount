/**
 * Document List Screen — Phase 6A
 * Integrates processing-state machine badges from upload queue.
 * Optimistic cards for queued/uploading/processing items appear at top.
 * Matches docs/design/mobile/camera-screen-deltas.md §2
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { DocumentCard, DocumentDto } from '../../components/shared/DocumentCard';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import apiClient from '../../lib/api';
import type { DocumentStackParamList } from '../../navigation/DocumentStack';
import { useDocumentQueue, type QueueItem } from '../../hooks/useDocumentQueue';

type NavProp = NativeStackNavigationProp<DocumentStackParamList, 'DocumentList'>;
interface Props { navigation: NavProp }

const CATEGORIES = ['All', 'Sales Bills', 'Purchase Bills', 'Expenses', 'Bank Statements', 'Salary Slips', 'Other'];

// ─────────────────────────────────────────────────────────────────────────────
// API → DocumentDto normalization (AND-04)
// ─────────────────────────────────────────────────────────────────────────────
//
// The backend list DTO (DocumentListDto) uses fileName / vendorName /
// documentDate / uploadedAt, while DocumentCard binds filename / vendor /
// date. Without this mapping, list rows render with no filename.

type RawDocumentDto = Partial<DocumentDto> & {
  id: string;
  fileName?: string;
  vendorName?: string;
  documentDate?: string;
  uploadedAt?: string;
  status: DocumentDto['status'];
};

function normalizeDocument(raw: RawDocumentDto): DocumentDto {
  return {
    ...raw,
    filename: raw.filename ?? raw.fileName ?? '',
    category: raw.category ?? '',
    vendor: raw.vendor ?? raw.vendorName,
    date: raw.date ?? raw.documentDate ?? raw.uploadedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Processing badge
// ─────────────────────────────────────────────────────────────────────────────

function ProcessingBadge({ item }: { item: QueueItem }) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();

  const configs: Record<string, { bg: string; text: string; icon: keyof typeof Ionicons.glyphMap }> = {
    QUEUED: { bg: tokens.sunken, text: tokens.textSecondary, icon: 'time-outline' },
    UPLOADING: { bg: tokens.infoTint, text: tokens.infoFg, icon: 'arrow-up-circle-outline' },
    PROCESSING: { bg: tokens.brandTintBorder, text: tokens.brandFg, icon: 'sparkles-outline' },
    READY: { bg: tokens.successTint, text: tokens.successFg, icon: 'checkmark-circle-outline' },
    FAILED: { bg: tokens.errorTint, text: tokens.errorFg, icon: 'alert-circle-outline' },
  };

  const cfg = configs[item.status] ?? configs.QUEUED;

  const labelMap: Record<string, string> = {
    QUEUED: t('mobile.docs.status.queued'),
    UPLOADING: t('mobile.docs.status.uploading', { percent: item.uploadProgress }),
    PROCESSING: t('mobile.docs.status.processing'),
    READY: t('mobile.docs.status.ready'),
    FAILED: t('mobile.docs.status.failed'),
  };

  const a11yLabel: Record<string, string> = {
    QUEUED: 'Document status: Queued, waiting to upload',
    UPLOADING: `Document status: Uploading, ${item.uploadProgress} percent`,
    PROCESSING: 'Document status: Processing, please wait',
    READY: 'Document status: Ready',
    FAILED: 'Document status: Failed. Double-tap Retry to try again.',
  };

  return (
    <View
      style={[styles.procBadge, { backgroundColor: cfg.bg }]}
      accessibilityLabel={a11yLabel[item.status]}
    >
      <Ionicons name={cfg.icon} size={12} color={cfg.text} />
      <Text style={[styles.procBadgeText, { color: cfg.text }]}>{labelMap[item.status]}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Queued item card
// ─────────────────────────────────────────────────────────────────────────────

function QueueCard({ item, onRetry, onRemove }: {
  item: QueueItem;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();

  const failReasonText: Record<string, string> = {
    NETWORK: t('mobile.docs.status.failedReason.network'),
    UPLOAD_REJECTED: t('mobile.docs.status.failedReason.uploadRejected'),
    OCR_FAILED: t('mobile.docs.status.failedReason.ocrFailed'),
    TIMEOUT: t('mobile.docs.status.failedReason.timeout'),
  };

  const canRetry = item.failReason !== 'UPLOAD_REJECTED';

  const confirmRemove = () => {
    Alert.alert(
      t('mobile.docs.action.removeConfirmTitle'),
      t('mobile.docs.action.removeConfirmBody'),
      [
        { text: 'Cancel', style: 'cancel' },
        { text: t('mobile.docs.action.remove'), style: 'destructive', onPress: () => onRemove(item.localId) },
      ],
    );
  };

  return (
    <View style={styles.queueCard}>
      <View style={styles.queueCardTop}>
        {/* Placeholder thumbnail */}
        <View style={styles.queueThumb}>
          <Ionicons name="document-outline" size={24} color={tokens.textTertiary} />
        </View>
        <View style={styles.queueCardContent}>
          <View style={styles.queueCardTitleRow}>
            <Text style={styles.queueCardFilename} numberOfLines={1}>
              {item.filename}
            </Text>
            <ProcessingBadge item={item} />
          </View>

          {/* Progress bar for UPLOADING */}
          {item.status === 'UPLOADING' && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${item.uploadProgress}%` }]} />
            </View>
          )}

          {/* Fail reason text */}
          {item.status === 'FAILED' && item.failReason && (
            <Text style={styles.failReasonText}>
              {failReasonText[item.failReason] ?? t('mobile.docs.status.failedReason.ocrFailed')}
            </Text>
          )}
        </View>
      </View>

      {/* FAILED footer CTAs */}
      {item.status === 'FAILED' && (
        <View style={styles.queueCardFooter}>
          {canRetry && (
            <Pressable
              style={styles.retryBtn}
              onPress={() => onRetry(item.localId)}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.docs.action.retry')}
              hitSlop={8}
            >
              <Ionicons name="refresh-outline" size={14} color={tokens.textOnBrand} />
              <Text style={styles.retryBtnText}>{t('mobile.docs.action.retry')}</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.removeBtn, !canRetry && { flex: 1 }]}
            onPress={confirmRemove}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.docs.action.remove')}
            hitSlop={8}
          >
            <Ionicons name="trash-outline" size={14} color={tokens.errorFg} />
            <Text style={styles.removeBtnText}>{t('mobile.docs.action.remove')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export function DocumentListScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showSearch, setShowSearch] = useState(false);

  const { queue, retry, remove, markReady, enqueue } = useDocumentQueue();

  // Show queue items that are still in-flight (not READY — those appear as server docs)
  const activeQueueItems = queue.filter(
    (i) => i.status !== 'READY' || !i.serverId,
  );

  const { data: documents = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['documents', selectedCategory, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory !== 'All') params.set('category', selectedCategory);
      if (searchQuery) params.set('q', searchQuery);
      const res = await apiClient.get<RawDocumentDto[]>(`/documents?${params}`);
      // Backend may return either a bare array or a paginated envelope.
      const data = res.data as unknown;
      const items = Array.isArray(data)
        ? (data as RawDocumentDto[])
        : ((data as { items?: RawDocumentDto[] })?.items ?? []);
      // AND-04: map backend field names (fileName/vendorName/...) onto the
      // DocumentDto shape DocumentCard binds to.
      return items.map(normalizeDocument);
    },
    placeholderData: [],
  });

  // ── Poll in-flight (uploaded but still processing) items until the server finishes OCR.
  // Tesseract OCR completes inline, so this usually resolves on the first poll. When a doc
  // reaches a terminal status we mark the optimistic card READY and refetch so the server
  // card (with extracted vendor/amount) replaces it. (SignalR push can supersede this later.)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const processingIds = queue
    .filter((i) => i.serverId && (i.status === 'PROCESSING' || i.status === 'UPLOADING'))
    .map((i) => i.serverId!)
    .join(',');

  useEffect(() => {
    if (!processingIds) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    const ids = processingIds.split(',');
    const tick = async () => {
      let anyDone = false;
      await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await apiClient.get<{ status: string }>(`/documents/${id}`);
            const s = res.data?.status;
            if (s === 'PROCESSED' || s === 'OCR_COMPLETE' || s === 'IN_REVIEW' || s === 'REJECTED') {
              markReady(id);
              anyDone = true;
            }
          } catch {
            // transient — keep polling
          }
        }),
      );
      if (anyDone) void refetch();
    };
    void tick();
    pollRef.current = setInterval(tick, 2500);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [processingIds, markReady, refetch]);

  const handlePickFromGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo library access to upload from gallery.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const filename = asset.fileName ?? `gallery_${Date.now()}.jpg`;
      await enqueue({ localUri: asset.uri, filename });
    } catch {
      Alert.alert('Error', 'Could not pick image from gallery.');
    }
  };

  const handleAddDocument = () => {
    Alert.alert('Add Document', 'Choose how to add a document', [
      { text: 'Take Photo', onPress: () => navigation.navigate('Camera') },
      { text: 'Upload from Gallery', onPress: handlePickFromGallery },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {showSearch ? (
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={tokens.textTertiary} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search documents..."
              placeholderTextColor={tokens.textTertiary}
              autoFocus
            />
            <Pressable onPress={() => { setShowSearch(false); setSearchQuery(''); }}>
              <Text style={styles.cancelSearch}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.headerTitle}>Documents</Text>
            <View style={styles.headerActions}>
              <Pressable onPress={() => setShowSearch(true)} style={styles.headerBtn}>
                <Ionicons name="search" size={20} color={tokens.textSecondary} />
              </Pressable>
              <Pressable
                style={styles.headerBtn}
                onPress={() => Alert.alert('Coming Soon', 'Document settings coming soon.')}
              >
                <Ionicons name="options-outline" size={20} color={tokens.textSecondary} />
              </Pressable>
            </View>
          </>
        )}
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
        style={styles.filterRow}
      >
        {CATEGORIES.map((cat) => (
          <Pressable
            key={cat}
            style={[styles.filterChip, selectedCategory === cat && styles.filterChipActive]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text style={[styles.filterChipText, selectedCategory === cat && styles.filterChipTextActive]}>
              {cat}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Sort info */}
      <View style={styles.sortBar}>
        <Text style={styles.sortText}>
          {activeQueueItems.length + documents.length} document{(activeQueueItems.length + documents.length) !== 1 ? 's' : ''}
        </Text>
        <Pressable style={styles.sortAction}>
          <Text style={styles.sortActionText}>Date</Text>
          <Ionicons name="chevron-down" size={14} color={tokens.textSecondary} />
        </Pressable>
      </View>

      {/* Document list — queue items at top, then server docs */}
      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          activeQueueItems.length > 0 ? (
            <View style={styles.queueSection}>
              {activeQueueItems.map((qi) => (
                <QueueCard
                  key={qi.localId}
                  item={qi}
                  onRetry={retry}
                  onRemove={remove}
                />
              ))}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <DocumentCard
            document={item}
            onPress={() => navigation.navigate('DocumentDetail', { documentId: item.id })}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        ListEmptyComponent={
          isLoading || activeQueueItems.length > 0 ? null : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="folder-open-outline" size={40} color={tokens.textTertiary} />
              </View>
              <Text style={styles.emptyTitle}>No documents yet</Text>
              <Text style={styles.emptySubtext}>
                Photograph a bill or upload from gallery to get started
              </Text>
              <Pressable
                style={styles.emptyBtn}
                onPress={handleAddDocument}
              >
                <Ionicons name="camera-outline" size={18} color={tokens.textOnBrand} style={{ marginRight: 6 }} />
                <Text style={styles.emptyBtnText}>Capture First Document</Text>
              </Pressable>
            </View>
          )
        }
      />

      {/* FAB */}
      <Pressable
        style={styles.fab}
        onPress={handleAddDocument}
        accessibilityLabel="Add document"
        accessibilityRole="button"
      >
        <Ionicons name="add" size={28} color={tokens.textOnBrand} />
      </Pressable>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: tk.canvas },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: tk.raised,
    borderBottomWidth: 1, borderBottomColor: tk.border,
  },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: '800', color: tk.textPrimary, letterSpacing: -0.3 },
  headerActions: { flexDirection: 'row', gap: 6 },
  headerBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: tk.sunken, alignItems: 'center', justifyContent: 'center' },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: tk.sunken, borderRadius: 12,
    paddingHorizontal: 12, height: 44, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: tk.textPrimary },
  cancelSearch: { fontSize: 14, color: tk.brand500, fontWeight: '600' },
  filterRow: { maxHeight: 52, backgroundColor: tk.raised },
  filterScroll: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: tk.sunken },
  filterChipActive: { backgroundColor: tk.brand500 },
  filterChipText: { fontSize: 13, color: tk.textSecondary, fontWeight: '500' },
  filterChipTextActive: { color: tk.textOnBrand, fontWeight: '600' },
  sortBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: tk.border,
  },
  sortText: { fontSize: 13, color: tk.textTertiary },
  sortAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortActionText: { fontSize: 13, color: tk.textSecondary, fontWeight: '500' },
  listContent: { padding: 16, paddingBottom: 100 },

  // Queue section
  queueSection: { marginBottom: 8 },
  queueCard: {
    backgroundColor: tk.raised,
    borderRadius: 12, borderWidth: 1,
    borderColor: tk.border, marginBottom: 8, overflow: 'hidden',
  },
  queueCardTop: { flexDirection: 'row', padding: 12, gap: 12, alignItems: 'flex-start' },
  queueThumb: {
    width: 56, height: 56, borderRadius: 6,
    backgroundColor: tk.sunken,
    alignItems: 'center', justifyContent: 'center',
  },
  queueCardContent: { flex: 1, gap: 6 },
  queueCardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  queueCardFilename: { flex: 1, fontSize: 14, fontWeight: '600', color: tk.textPrimary },

  // Processing badge
  procBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  procBadgeText: { fontSize: 11, fontWeight: '600' },

  // Progress bar
  progressTrack: { height: 3, backgroundColor: tk.brandTintBorder, borderRadius: 2 },
  progressFill: { height: 3, backgroundColor: tk.brand500, borderRadius: 2 },

  // Fail reason
  failReasonText: { fontSize: 12, color: tk.textSecondary },

  // Queue card footer
  queueCardFooter: {
    flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingBottom: 12,
  },
  retryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: tk.brand500,
    borderRadius: 8, paddingVertical: 10, minHeight: 44,
  },
  retryBtnText: { fontSize: 13, fontWeight: '700', color: tk.textOnBrand },
  removeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: 8, paddingVertical: 10,
    borderWidth: 1, borderColor: tk.errorTintBorder, minHeight: 44,
  },
  removeBtnText: { fontSize: 13, fontWeight: '600', color: tk.errorFg },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 20, backgroundColor: tk.sunken, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: tk.textPrimary, marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: tk.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: tk.brand500, paddingHorizontal: 24, paddingVertical: 14,
    borderRadius: 14, shadowColor: tk.brand500,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  emptyBtnText: { color: tk.textOnBrand, fontSize: 15, fontWeight: '700' },
  fab: {
    position: 'absolute', bottom: 88, right: 20,
    width: 56, height: 56, borderRadius: 18,
    backgroundColor: tk.brand500, alignItems: 'center', justifyContent: 'center',
    shadowColor: tk.brand500, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 12,
  },
  }),
);
