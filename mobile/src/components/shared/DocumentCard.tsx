/**
 * DocumentCard Component
 * Document list item with thumbnail, status, OCR confidence
 * Matches component-library.md §6.4
 */

import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { formatDateIN, formatINR } from '../../lib/utils';
import { StatusBadge, DocumentStatus } from '../ui/Badge';

export interface DocumentDto {
  id: string;
  filename: string;
  category: string;
  status: DocumentStatus;
  thumbnailUrl?: string;
  date?: string;
  vendor?: string;
  amount?: number;
  ocrConfidence?: number; // 0-100
  tags?: string[];
}

interface DocumentCardProps {
  document: DocumentDto;
  view?: 'list' | 'grid';
  onPress?: () => void;
  onShare?: () => void;
  showOcrConfidence?: boolean;
}

export function DocumentCard({
  document,
  view = 'list',
  onPress,
  showOcrConfidence = true,
}: DocumentCardProps) {
  const styles = useStyles();
  const { tokens } = useTheme();
  const ocrColor = getOcrColor(tokens, document.ocrConfidence);

  if (view === 'grid') {
    return (
      <Pressable style={styles.gridCard} onPress={onPress}>
        <View style={styles.gridThumbnail}>
          {document.thumbnailUrl ? (
            <Image
              source={{ uri: document.thumbnailUrl }}
              style={styles.gridImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.placeholderBg}>
              <Text style={styles.placeholderText}>📄</Text>
            </View>
          )}
        </View>
        <View style={styles.gridMeta}>
          <Text style={styles.gridCategory} numberOfLines={1}>
            {document.category}
          </Text>
          <Text style={styles.gridDate} numberOfLines={1}>
            {document.date ? formatDateIN(new Date(document.date)) : '—'}
          </Text>
        </View>
      </Pressable>
    );
  }

  // List view
  return (
    <Pressable style={styles.listCard} onPress={onPress}>
      {/* Thumbnail */}
      <View style={styles.thumbnail}>
        {document.thumbnailUrl ? (
          <Image
            source={{ uri: document.thumbnailUrl }}
            style={styles.thumbnailImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.placeholderBg}>
            <Text style={styles.placeholderText}>📄</Text>
          </View>
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Category + OCR confidence */}
        <View style={styles.topRow}>
          <View style={[styles.categoryBadge]}>
            <Text style={styles.categoryText}>{document.category}</Text>
          </View>
          {showOcrConfidence && document.ocrConfidence !== undefined && (
            <View style={[styles.ocrDot, { backgroundColor: ocrColor }]} />
          )}
        </View>

        {/* Filename */}
        <Text style={styles.filename} numberOfLines={1}>
          {document.filename}
        </Text>

        {/* Date, Vendor, Amount */}
        <Text style={styles.meta} numberOfLines={1}>
          {[
            document.date ? formatDateIN(new Date(document.date)) : null,
            document.vendor,
            document.amount ? formatINR(document.amount) : null,
          ]
            .filter(Boolean)
            .join(' • ')}
        </Text>

        {/* Status badge */}
        <StatusBadge status={document.status} size="sm" />
      </View>
    </Pressable>
  );
}

function getOcrColor(tk: ThemeTokens, confidence?: number): string {
  if (confidence === undefined) return tk.textTertiary;
  if (confidence >= 80) return tk.successFg;
  if (confidence >= 50) return tk.warningFg;
  return tk.errorFg;
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  // List view
  listCard: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: tk.raised,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: tk.border,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: 6,
    overflow: 'hidden',
    marginRight: 12,
    backgroundColor: tk.sunken,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  placeholderBg: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tk.sunken,
  },
  placeholderText: {
    fontSize: 20,
  },
  content: {
    flex: 1,
    gap: 3,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryBadge: {
    backgroundColor: tk.brandTint,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '600',
    color: tk.brandCta,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ocrDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  filename: {
    fontSize: 14,
    fontWeight: '600',
    color: tk.textPrimary,
  },
  meta: {
    fontSize: 12,
    color: tk.textSecondary,
  },

  // Grid view
  gridCard: {
    flex: 1,
    margin: 4,
    backgroundColor: tk.raised,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tk.border,
  },
  gridThumbnail: {
    height: 80,
    backgroundColor: tk.sunken,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridMeta: {
    padding: 8,
  },
  gridCategory: {
    fontSize: 11,
    fontWeight: '600',
    color: tk.brandCta,
    textTransform: 'uppercase',
  },
  gridDate: {
    fontSize: 11,
    color: tk.textSecondary,
    marginTop: 2,
  },
  }),
);
