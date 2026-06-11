/**
 * PackageMetaStrip — Top strip on LoanPackagePreviewScreen.
 * Shows: pages, size, generated time, package ID with copy button.
 * Phase 6C — docs/design/component-library.md addendum
 */

import React from 'react';
import { Clipboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';

interface PackageMetaStripProps {
  pageCount: number;
  sizeMb: number;
  generatedAt: string;
  packageId: string;
  onCopyId?: () => void;
  testID?: string;
}

export function PackageMetaStrip({
  pageCount,
  sizeMb,
  generatedAt,
  packageId,
  onCopyId,
  testID,
}: PackageMetaStripProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();

  const handleCopy = () => {
    Clipboard.setString(packageId);
    onCopyId?.();
  };

  return (
    <View testID={testID} style={styles.strip}>
      <View style={styles.row}>
        <Text style={styles.meta}>
          {t('mobile.loan.preview.meta.pages', { count: pageCount })}
          {'  ·  '}
          {t('mobile.loan.preview.meta.size', { size: sizeMb.toFixed(1) })}
          {'  ·  '}
          {t('mobile.loan.preview.meta.generatedAt', { date: generatedAt })}
        </Text>
      </View>
      <View style={styles.idRow}>
        <Text style={styles.idLabel}>
          {t('mobile.loan.preview.meta.packageId', { id: packageId })}
        </Text>
        <Pressable
          style={styles.copyBtn}
          onPress={handleCopy}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.loan.preview.meta.copyId')}
          hitSlop={8}
        >
          <Ionicons name="copy-outline" size={14} color={tokens.brand500} />
          <Text style={styles.copyText}>{t('mobile.loan.preview.meta.copyId')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  strip: {
    backgroundColor: tk.canvas,
    borderBottomWidth: 1,
    borderBottomColor: tk.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  meta: {
    fontSize: 12,
    color: tk.textSecondary,
    fontWeight: '500',
  },
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  idLabel: {
    fontSize: 11,
    color: tk.textSecondary,
    fontFamily: 'monospace',
    flex: 1,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 32,
  },
  copyText: {
    fontSize: 11,
    color: tk.brand500,
    fontWeight: '600',
  },
  }),
);
