/**
 * Document List Screen — Phase 6A
 * Integrates processing-state machine badges from upload queue.
 * Optimistic cards for queued/uploading/processing items appear at top.
 * Matches docs/design/mobile/camera-screen-deltas.md §2
 */

import React, { useState } from 'react';
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
import { useQuery } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { DocumentCard, DocumentDto } from '../../components/shared/DocumentCard';
import { Colors } from '../../constants/colors';
import apiClient from '../../lib/api';
import type { DocumentStackParamList } from '../../navigation/DocumentStack';
import { useDocumentQueue, type QueueItem } from '../../hooks/useDocumentQueue';

type NavProp = NativeStackNavigationProp<DocumentStackParamList, 'DocumentList'>;
interface Props { navigation: NavProp }

const CATEGORIES = ['All', 'Sales Bills', 'Purchase Bills', 'Expenses', 'Bank Statements', 'Salary Slips', 'Other'];

// ─────────────────────────────────────────────────────────────────────────────
// Processing badge
// ─────────────────────────────────────────────────────────────────────────────

function ProcessingBadge({ item }: { item: QueueItem }) {
  const { t } = useTranslation();

  const configs: Record<string, { bg: string; text: string; icon: keyof typeof Ionicons.glyphMap }> = {
    QUEUED: { bg: Colors.neutral[100], text: Colors.neutral[700], icon: 'time-outline' },
    UPLOADING: { bg: Colors.info[100], text: Colors.info[700], icon: 'arrow-up-circle-outline' },
    PROCESSING: { bg: Colors.brand[100], text: Colors.brand[700], icon: 'sparkles-outline' },
    READY: { bg: Colors.success[100], text: Colors.success[700], icon: 'checkmark-circle-outline' },
    FAILED: { bg: Colors.error[100], text: Colors.error[700], icon: 'alert-circle-outline' },
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
          <Ionicons name="document-outline" size={24} color={Colors.neutral[400]} />
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
              <Ionicons name="refresh-outline" size={14} color={Colors.neutral[0]} />
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
            <Ionicons name="trash-outline" size={14} color={Colors.error[600]} />
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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showSearch, setShowSearch] = useState(false);

  const { queue, retry, remove } = useDocumentQueue();

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
      const res = await apiClient.get<DocumentDto[]>(`/documents?${params}`);
      return res.data;
    },
    placeholderData: [],
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {showSearch ? (
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={Colors.neutral[400]} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search documents..."
              placeholderTextColor={Colors.neutral[400]}
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
                <Ionicons name="search" size={20} color={Colors.neutral[600]} />
              </Pressable>
              <Pressable
                style={styles.headerBtn}
                onPress={() => Alert.alert('Coming Soon', 'Document settings coming soon.')}
              >
                <Ionicons name="options-outline" size={20} color={Colors.neutral[600]} />
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
          <Ionicons name="chevron-down" size={14} color={Colors.neutral[500]} />
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
                <Ionicons name="folder-open-outline" size={40} color={Colors.neutral[300]} />
              </View>
              <Text style={styles.emptyTitle}>No documents yet</Text>
              <Text style={styles.emptySubtext}>
                Photograph a bill or upload from gallery to get started
              </Text>
              <Pressable
                style={styles.emptyBtn}
                onPress={() => navigation.navigate('Camera')}
              >
                <Ionicons name="camera-outline" size={18} color={Colors.neutral[0]} style={{ marginRight: 6 }} />
                <Text style={styles.emptyBtnText}>Capture First Document</Text>
              </Pressable>
            </View>
          )
        }
      />

      {/* FAB */}
      <Pressable
        style={styles.fab}
        onPress={() => navigation.navigate('Camera')}
        accessibilityLabel="Add document"
        accessibilityRole="button"
      >
        <Ionicons name="add" size={28} color={Colors.neutral[0]} />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: Colors.surface.default,
    borderBottomWidth: 1, borderBottomColor: Colors.neutral[100],
  },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: '800', color: Colors.neutral[900], letterSpacing: -0.3 },
  headerActions: { flexDirection: 'row', gap: 6 },
  headerBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.neutral[100], borderRadius: 12,
    paddingHorizontal: 12, height: 44, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: Colors.neutral[900] },
  cancelSearch: { fontSize: 14, color: Colors.brand[500], fontWeight: '600' },
  filterRow: { maxHeight: 52, backgroundColor: Colors.surface.default },
  filterScroll: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.neutral[100] },
  filterChipActive: { backgroundColor: Colors.brand[500] },
  filterChipText: { fontSize: 13, color: Colors.neutral[600], fontWeight: '500' },
  filterChipTextActive: { color: Colors.neutral[0], fontWeight: '600' },
  sortBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.neutral[100],
  },
  sortText: { fontSize: 13, color: Colors.neutral[400] },
  sortAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortActionText: { fontSize: 13, color: Colors.neutral[500], fontWeight: '500' },
  listContent: { padding: 16, paddingBottom: 100 },

  // Queue section
  queueSection: { marginBottom: 8 },
  queueCard: {
    backgroundColor: Colors.neutral[0],
    borderRadius: 12, borderWidth: 1,
    borderColor: Colors.neutral[200], marginBottom: 8, overflow: 'hidden',
  },
  queueCardTop: { flexDirection: 'row', padding: 12, gap: 12, alignItems: 'flex-start' },
  queueThumb: {
    width: 56, height: 56, borderRadius: 6,
    backgroundColor: Colors.neutral[100],
    alignItems: 'center', justifyContent: 'center',
  },
  queueCardContent: { flex: 1, gap: 6 },
  queueCardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  queueCardFilename: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.neutral[800] },

  // Processing badge
  procBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  procBadgeText: { fontSize: 11, fontWeight: '600' },

  // Progress bar
  progressTrack: { height: 3, backgroundColor: Colors.brand[100], borderRadius: 2 },
  progressFill: { height: 3, backgroundColor: Colors.brand[500], borderRadius: 2 },

  // Fail reason
  failReasonText: { fontSize: 12, color: Colors.neutral[500] },

  // Queue card footer
  queueCardFooter: {
    flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingBottom: 12,
  },
  retryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: Colors.brand[500],
    borderRadius: 8, paddingVertical: 10, minHeight: 44,
  },
  retryBtnText: { fontSize: 13, fontWeight: '700', color: Colors.neutral[0] },
  removeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: 8, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.error[200], minHeight: 44,
  },
  removeBtnText: { fontSize: 13, fontWeight: '600', color: Colors.error[600] },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 20, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.neutral[800], marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: Colors.neutral[500], textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.brand[500], paddingHorizontal: 24, paddingVertical: 14,
    borderRadius: 14, shadowColor: Colors.brand[500],
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  emptyBtnText: { color: Colors.neutral[0], fontSize: 15, fontWeight: '700' },
  fab: {
    position: 'absolute', bottom: 88, right: 20,
    width: 56, height: 56, borderRadius: 18,
    backgroundColor: Colors.brand[500], alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.brand[500], shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 12,
  },
});
