/**
 * Report PDF Preview & Share — Screen 11 (D3.1 PDF Export, D3.2 Share Options).
 * docs/design/screens/mobile/dashboard-reports.md lines 210-252.
 *
 * Generates a report PDF (POST /reports/generate, format=Pdf), resolves a signed
 * download URL (GET /reports/{id}/download-url), and renders it via the shared
 * PdfViewerMobile. The share action bar offers:
 *   - WhatsApp-prioritised share (D3.2: WhatsApp is the primary Indian channel)
 *   - System share sheet (Email / other apps)
 *   - "Share with Bank/CA" → a 15-min signed share link (POST /reports/{id}/share-link)
 *
 * Security:
 *   - useSensitiveScreen (SEC-015): financial figures visible — screenshot block.
 *   - Signed URLs are never cached; share links are 15-min TTL (SEC-046).
 */

import React from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import { Button } from '../../components/ui/Button';
import { PdfViewerMobile } from '../../components/loans/PdfViewerMobile';
import { getCurrentFinancialYear } from '../../lib/utils';
import {
  generateAndResolvePdf,
  createReportShareLink,
  reportTypeForSlug,
} from '../../api/reports';
import type { HomeStackParamList } from '../../navigation/HomeStack';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'ReportPdfPreview'>;
type RoutePropType = RouteProp<HomeStackParamList, 'ReportPdfPreview'>;
interface Props { navigation: NavProp; route: RoutePropType }

export function ReportPdfPreviewScreen({ navigation, route }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  // SEC-015: financial report PDF — block screenshots like the other report screens.
  useSensitiveScreen();

  const { reportType, title } = route.params;
  const fy = getCurrentFinancialYear();
  const backendType = reportTypeForSlug(reportType);

  // ── Generate PDF + resolve signed download URL ─────────────────────────────
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['report-pdf', reportType, fy.startYear],
    queryFn: () =>
      generateAndResolvePdf({
        reportType: backendType!,
        format: 'Pdf',
        financialYear: String(fy.startYear),
      }),
    enabled: backendType !== null,
    // Signed URLs expire; never serve a stale one from cache.
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  });

  const signedUrl = data?.signedUrl;

  // ── Share-with-bank/CA: 15-min signed share link ───────────────────────────
  const shareLinkMutation = useMutation({
    mutationFn: () => createReportShareLink(data!.jobId),
  });

  const shareText = t('mobile.reports.preview.shareMessage', {
    report: title,
    fy: fy.label,
  });

  /** WhatsApp-first share (D3.2). Falls back to the system share sheet. */
  const handleShareWhatsApp = async () => {
    if (!signedUrl) return;
    const message = `${shareText}\n${signedUrl}`;
    const waUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
    try {
      const canOpen = await Linking.canOpenURL(waUrl);
      if (canOpen) {
        await Linking.openURL(waUrl);
        return;
      }
    } catch {
      // fall through to the system share sheet
    }
    await handleShareSystem();
  };

  /** System share sheet (Email and any other installed app). */
  const handleShareSystem = async () => {
    if (!signedUrl) return;
    const message = `${shareText}\n${signedUrl}`;
    // iOS prefers `url`; Android only honours `message` (matches ChatDetailScreen).
    await Share.share(
      Platform.OS === 'ios'
        ? { url: signedUrl, message: shareText }
        : { message },
    );
  };

  /** Share-with-bank/CA: mint a 15-min link, then open the share sheet. */
  const handleShareWithBank = async () => {
    if (!data) return;
    try {
      const link = await shareLinkMutation.mutateAsync();
      const message = `${shareText}\n${link.signedUrl}`;
      await Share.share(
        Platform.OS === 'ios'
          ? { url: link.signedUrl, message: shareText }
          : { message },
      );
    } catch {
      // Mutation error surfaces via shareLinkMutation.isError below.
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.common.back')}
        >
          <Ionicons name="arrow-back" size={22} color={tokens.brand500} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.subtitle}>
          {t('mobile.reports.preview.subtitle', { fy: fy.label })}
        </Text>

        {/* PDF area */}
        <View style={styles.pdfArea}>
          {backendType === null ? (
            <View style={styles.stateBox}>
              <Ionicons name="document-outline" size={40} color={tokens.textTertiary} />
              <Text style={styles.stateText}>
                {t('mobile.reports.detail.notAvailable')}
              </Text>
            </View>
          ) : isLoading ? (
            <View style={styles.stateBox}>
              <ActivityIndicator size="large" color={tokens.brand500} />
              <Text style={styles.stateText}>
                {t('mobile.reports.preview.generating')}
              </Text>
            </View>
          ) : isError || !signedUrl ? (
            <View
              style={styles.stateBox}
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
            >
              <Ionicons name="alert-circle-outline" size={40} color={tokens.errorFg} />
              <Text style={styles.stateText}>
                {t('mobile.reports.preview.error')}
              </Text>
              <Button
                label={t('mobile.reports.retry')}
                size="sm"
                onPress={() => void refetch()}
                loading={isRefetching}
              />
            </View>
          ) : (
            <PdfViewerMobile
              signedUrl={signedUrl}
              pageCount={data?.pageCount ?? undefined}
              testID="report-pdf-viewer"
            />
          )}
        </View>

        {/* Share action bar (D3.2) */}
        {signedUrl && (
          <View style={styles.shareBar}>
            <Text style={styles.shareTitle}>{t('mobile.reports.preview.shareTitle')}</Text>

            <Pressable
              style={[styles.shareBtn, styles.shareBtnWhatsApp]}
              onPress={handleShareWhatsApp}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.reports.preview.shareWhatsApp')}
            >
              <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
              <Text style={styles.shareBtnText}>
                {t('mobile.reports.preview.shareWhatsApp')}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.shareBtn, styles.shareBtnBank]}
              onPress={handleShareWithBank}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.reports.preview.shareBank')}
            >
              {shareLinkMutation.isPending ? (
                <ActivityIndicator size="small" color={tokens.textOnBrand} />
              ) : (
                <Ionicons name="business-outline" size={20} color={tokens.textOnBrand} />
              )}
              <Text style={styles.shareBtnText}>
                {t('mobile.reports.preview.shareBank')}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.shareBtn, styles.shareBtnSystem]}
              onPress={handleShareSystem}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.reports.preview.shareOther')}
            >
              <Ionicons name="share-outline" size={20} color={tokens.brand500} />
              <Text style={[styles.shareBtnText, { color: tokens.brand500 }]}>
                {t('mobile.reports.preview.shareOther')}
              </Text>
            </Pressable>

            {shareLinkMutation.isError && (
              <Text style={styles.shareError} accessibilityLiveRegion="polite">
                {t('mobile.reports.preview.shareLinkError')}
              </Text>
            )}

            <Text style={styles.shareNote}>{t('mobile.reports.preview.shareNote')}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: tk.canvas },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: tk.raised,
      borderBottomWidth: 1,
      borderBottomColor: tk.border,
    },
    backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 17,
      fontWeight: '700',
      color: tk.textPrimary,
    },
    scrollContent: { padding: 16, gap: 16 },
    subtitle: { fontSize: 13, color: tk.textSecondary },
    pdfArea: {
      minHeight: 320,
      borderRadius: 12,
      overflow: 'hidden',
    },
    stateBox: {
      flex: 1,
      minHeight: 320,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      padding: 24,
      backgroundColor: tk.sunken,
      borderRadius: 12,
    },
    stateText: {
      fontSize: 14,
      color: tk.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },

    // Share bar
    shareBar: { gap: 10 },
    shareTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: tk.textPrimary,
      marginBottom: 2,
    },
    shareBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      minHeight: 48,
      borderRadius: 12,
      paddingHorizontal: 16,
    },
    shareBtnWhatsApp: { backgroundColor: '#25D366' },
    shareBtnBank: { backgroundColor: tk.brandCta },
    shareBtnSystem: {
      backgroundColor: tk.raised,
      borderWidth: 1,
      borderColor: tk.brand500,
    },
    shareBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
    shareError: { fontSize: 13, color: tk.errorFg, textAlign: 'center' },
    shareNote: {
      fontSize: 12,
      color: tk.textTertiary,
      textAlign: 'center',
      marginTop: 4,
      lineHeight: 16,
    },
  }),
);
