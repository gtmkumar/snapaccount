/**
 * PdfViewerMobile — PDF preview wrapper for LoanPackagePreviewScreen.
 * Phase 6C — docs/design/component-library.md addendum
 *
 * react-native-pdf is not currently installed. Falls back to a WebView / expo-web-browser
 * approach: taps "Open PDF" to view in the system browser with the signed URL.
 *
 * TODO (Phase 6F): install react-native-pdf for inline rendering with pinch-zoom.
 * The component interface is stable so screens don't need to change.
 *
 * Watermark visibility check: we surface the watermark text in the fallback UI;
 * full PDF text-layer scan is only possible with react-native-pdf.
 */

import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';

interface PdfViewerMobileProps {
  /** Signed GCS URL — expires per backend TTL. Never cache. */
  signedUrl: string;
  pageCount?: number;
  packageId?: string;
  watermarkText?: string;
  testID?: string;
}

export function PdfViewerMobile({
  signedUrl,
  pageCount,
  packageId,
  watermarkText,
  testID,
}: PdfViewerMobileProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();

  const handleOpen = async () => {
    try {
      await Linking.openURL(signedUrl);
    } catch {
      // URL open failed — silently ignore; parent screen handles error state
    }
  };

  return (
    <View testID={testID} style={styles.container}>
      {/* Watermark visibility indicator (for integrity check) */}
      {watermarkText && (
        <View style={styles.watermarkBanner} testID="pdf-watermark-text">
          <Ionicons name="shield-checkmark-outline" size={14} color={tokens.successFg} />
          <Text style={styles.watermarkText} numberOfLines={2}>
            {watermarkText}
          </Text>
        </View>
      )}

      {/* PDF preview placeholder — replace with react-native-pdf in Phase 6F */}
      <View style={styles.previewArea}>
        <Ionicons name="document-text" size={48} color={tokens.textTertiary} />
        {pageCount !== undefined && (
          <Text style={styles.pageCount}>
            {t('mobile.loan.preview.meta.pages', { count: pageCount })}
          </Text>
        )}
        {packageId && (
          <Text style={styles.packageIdText}>
            {t('mobile.loan.preview.meta.packageId', { id: packageId })}
          </Text>
        )}
        <Text style={styles.fallbackNote}>
          Inline PDF viewer will be available in a future update.
        </Text>
        <Pressable
          style={styles.openBtn}
          onPress={handleOpen}
          accessibilityRole="button"
          accessibilityLabel="Open PDF in browser"
        >
          <Ionicons name="open-outline" size={16} color="#FFFFFF" />
          <Text style={styles.openBtnText}>Open PDF</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tk.sunken,
    borderRadius: 12,
    overflow: 'hidden',
  },
  watermarkBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: tk.successTint,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: tk.successTintBorder,
  },
  watermarkText: {
    flex: 1,
    fontSize: 11,
    color: tk.successFg,
    fontWeight: '600',
    lineHeight: 16,
  },
  previewArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  pageCount: {
    fontSize: 15,
    fontWeight: '600',
    color: tk.textSecondary,
  },
  packageIdText: {
    fontSize: 12,
    color: tk.textSecondary,
    fontFamily: 'monospace',
  },
  fallbackNote: {
    fontSize: 13,
    color: tk.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tk.loanAccent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    minHeight: 44,
  },
  openBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: tk.textOnBrand,
  },
  }),
);
