/**
 * AcceptInviteScreen — invitee-side org-join flow (Phase 2 org invite/join).
 *
 * Reachable two ways:
 *   (a) deep link  snapaccount://invite/{token}     → route param `token`
 *   (b) manual entry: the user pastes a code/token  → route param empty, an input
 *       is shown so they can enter it.
 *
 * Flow:
 *   1. validateInviteToken(token) → preview org name + role + invited email.
 *   2. If NOT authenticated → prompt to sign in; navigate to PhoneEntry, preserving
 *      the token so the user returns here after auth (best-effort: re-paste).
 *   3. If authenticated → "Accept" → acceptInvite(token):
 *        - on success: force token refresh (new org claims) → refetch orgs →
 *          setOrganizations + setCurrentOrganization(joined org) → enter app with
 *          a success alert.
 *        - 403 IdentityMismatch / 409 already-* / 410 invalid → localized message.
 */
import React from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import {
  refreshContextAndSwap,
  fetchOrganizations,
  getApiError,
  type ServerOrganization,
} from '../../lib/api';
import {
  acceptInvite,
  validateInviteToken,
  type InvitePreview,
} from '../../lib/team';
import {
  storePendingInviteToken,
  clearPendingInviteToken,
} from '../../lib/pendingInvite';

// This screen is registered in BOTH the Auth stack and the authenticated
// MoreStack. Both declare an identical `AcceptInvite: { token?: string } | undefined`
// param, so a single local ParamList types the props for either registration.
type InviteParamList = {
  AcceptInvite: { token?: string } | undefined;
  // Sibling route used for the "sign in to accept" path (Auth stack only); typed
  // here so navigate('PhoneEntry') is well-formed without coupling to a full stack.
  PhoneEntry: undefined;
};

type Props = NativeStackScreenProps<InviteParamList, 'AcceptInvite'>;

type AcceptErrorKind =
  | 'identityMismatch'
  | 'alreadyMember'
  | 'alreadyAccepted'
  | 'expired'
  | 'revoked'
  | 'invalid'
  | 'notFound'
  | 'generic';

/** Map an accept() axios error to a localized message key kind. */
function classifyAcceptError(err: unknown): AcceptErrorKind {
  const { statusCode, message } = getApiError(err);
  const code = message?.toLowerCase() ?? '';
  if (statusCode === 403 || code.includes('identitymismatch') || code.includes('identity'))
    return 'identityMismatch';
  if (statusCode === 404) return 'notFound';
  if (statusCode === 409) {
    if (code.includes('alreadymember') || code.includes('member')) return 'alreadyMember';
    if (code.includes('accepted')) return 'alreadyAccepted';
    if (code.includes('expired')) return 'expired';
    if (code.includes('revoked')) return 'revoked';
    return 'alreadyMember';
  }
  if (statusCode === 410) return 'invalid';
  return 'generic';
}

function mapServerOrg(o: ServerOrganization) {
  return {
    id: o.id,
    name: o.name,
    gstin: o.gstin ?? undefined,
    panNumber: o.panNumber ?? undefined,
    businessType: o.businessType ?? undefined,
    address: o.address ?? undefined,
    state: o.state ?? undefined,
    pinCode: o.pinCode ?? undefined,
    industry: o.industry ?? undefined,
    annualTurnover: o.annualTurnover ?? undefined,
  };
}

export function AcceptInviteScreen({ navigation, route }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setOrganizations = useAuthStore((s) => s.setOrganizations);
  const setCurrentOrganization = useAuthStore((s) => s.setCurrentOrganization);

  const initialToken = route.params?.token ?? '';
  const [token, setToken] = React.useState(initialToken);
  const [manualEntry, setManualEntry] = React.useState(initialToken);
  const [preview, setPreview] = React.useState<InvitePreview | null>(null);
  const [validating, setValidating] = React.useState(false);
  const [accepting, setAccepting] = React.useState(false);
  const [errorKind, setErrorKind] = React.useState<AcceptErrorKind | null>(null);

  const runValidation = React.useCallback(async (rawToken: string) => {
    const trimmed = rawToken.trim();
    if (!trimmed) return;
    setValidating(true);
    setErrorKind(null);
    setPreview(null);
    setToken(trimmed);
    try {
      const result = await validateInviteToken(trimmed);
      setPreview(result);
    } catch {
      setErrorKind('generic');
    } finally {
      setValidating(false);
    }
  }, []);

  // Auto-validate when arriving via deep link with a token. Defer to a microtask
  // so the initial setState happens after the effect commits (not synchronously
  // inside the effect body, which would trigger cascading renders).
  React.useEffect(() => {
    if (!initialToken) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void runValidation(initialToken);
    });
    return () => {
      active = false;
    };
  }, [initialToken, runValidation]);

  // GAP-065: a deep-link token tapped while logged OUT must survive the auth
  // flow (RootNavigator remounts the tree on sign-in, dropping route params).
  // Persist it immediately; RootNavigator auto-resumes AcceptInvite post-auth.
  React.useEffect(() => {
    if (!isAuthenticated && initialToken) {
      void storePendingInviteToken(initialToken);
    }
  }, [isAuthenticated, initialToken]);

  const handleAccept = async () => {
    setAccepting(true);
    setErrorKind(null);
    try {
      const result = await acceptInvite(token);

      // GAP-065: the invite is consumed — drop any persisted pending token so
      // the post-auth resume path can never replay it.
      void clearPendingInviteToken();

      // GAP-007 / BUG-5: The current access token predates this membership and
      // lacks the new organizationId / RBAC claims. Re-mint the JWT so subsequent
      // calls are authorized for the joined org. refreshContextAndSwap() is
      // non-fatal — failure is logged but the accept result still stands.
      await refreshContextAndSwap();
      const orgs = await fetchOrganizations();
      if (orgs.length > 0) {
        const mapped = orgs.map(mapServerOrg);
        setOrganizations(mapped);
        const joined = mapped.find((o) => o.id === result.organizationId);
        if (joined) setCurrentOrganization(joined);
      } else {
        // Fallback: at least seat the joined org from the accept response.
        setOrganizations([{ id: result.organizationId, name: result.organizationName }]);
      }

      Alert.alert(
        t('mobile.auth.invite.successTitle'),
        t('mobile.auth.invite.successBody', { org: result.organizationName }),
        [
          {
            text: t('mobile.common.ok'),
            onPress: () => {
              // Enter the app. When authenticated, RootNavigator already renders
              // AppNavigator; popping this screen returns the user to the app
              // (or to the More hub it was launched from).
              if (navigation.canGoBack()) navigation.goBack();
            },
          },
        ],
      );
    } catch (err) {
      setErrorKind(classifyAcceptError(err));
    } finally {
      setAccepting(false);
    }
  };

  const handleSignIn = () => {
    // GAP-065: persist the (validated or pasted) token so the post-auth resume
    // path in RootNavigator reopens AcceptInvite with it after sign-in completes.
    // PhoneEntry only exists in the Auth stack — guarded so an authenticated
    // caller is a no-op.
    if (token) void storePendingInviteToken(token);
    navigation.navigate('PhoneEntry');
  };

  const handleDecline = () => {
    // GAP-065: declining abandons the invite — clear any persisted token so it
    // is not auto-resumed after a later sign-in.
    void clearPendingInviteToken();
    navigation.goBack();
  };

  const errorMessage = errorKind ? t(`mobile.auth.invite.errors.${errorKind}`) : null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityLabel={t('mobile.common.back')}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.auth.invite.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.iconCircle}>
          <Ionicons name="people-circle-outline" size={36} color={tokens.brand500} />
        </View>

        {/* Manual entry (shown when no valid preview yet) */}
        {!preview?.isValid && (
          <>
            <Text style={styles.heading}>{t('mobile.auth.invite.manualTitle')}</Text>
            <Text style={styles.subtext}>{t('mobile.auth.invite.manualSubtitle')}</Text>
            <Input
              label={t('mobile.auth.invite.codeLabel')}
              placeholder={t('mobile.auth.invite.codePlaceholder')}
              value={manualEntry}
              onChangeText={setManualEntry}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button
              label={t('mobile.auth.invite.validateCta')}
              onPress={() => void runValidation(manualEntry)}
              loading={validating}
              disabled={!manualEntry.trim()}
              fullWidth
              size="lg"
            />
          </>
        )}

        {validating && (
          <View style={styles.statusRow}>
            <ActivityIndicator color={tokens.brand500} />
            <Text style={styles.statusText}>{t('mobile.auth.invite.validating')}</Text>
          </View>
        )}

        {/* Invalid invite */}
        {preview && !preview.isValid && !validating && (
          <View style={styles.errorBanner}>
            <Ionicons name="close-circle-outline" size={20} color={tokens.errorFg} />
            <Text style={styles.errorBannerText}>
              {preview.message ?? t('mobile.auth.invite.errors.invalid')}
            </Text>
          </View>
        )}

        {/* Valid preview */}
        {preview?.isValid && (
          <View style={styles.previewCard}>
            <Text style={styles.heading}>{t('mobile.auth.invite.invitedHeading')}</Text>
            <View style={styles.previewRow}>
              <Ionicons name="business-outline" size={18} color={tokens.textSecondary} />
              <View style={styles.previewBody}>
                <Text style={styles.previewLabel}>{t('mobile.auth.invite.orgLabel')}</Text>
                <Text style={styles.previewValue}>{preview.organizationName}</Text>
              </View>
            </View>
            <View style={styles.previewRow}>
              <Ionicons name="ribbon-outline" size={18} color={tokens.textSecondary} />
              <View style={styles.previewBody}>
                <Text style={styles.previewLabel}>{t('mobile.auth.invite.roleLabel')}</Text>
                <Text style={styles.previewValue}>
                  {preview.roleDisplayName || preview.roleName}
                </Text>
              </View>
            </View>
            <View style={styles.previewRow}>
              <Ionicons name="mail-outline" size={18} color={tokens.textSecondary} />
              <View style={styles.previewBody}>
                <Text style={styles.previewLabel}>{t('mobile.auth.invite.emailLabel')}</Text>
                <Text style={styles.previewValue}>{preview.email}</Text>
              </View>
            </View>

            {errorMessage && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={18} color={tokens.errorFg} />
                <Text style={styles.errorBannerText}>{errorMessage}</Text>
              </View>
            )}

            {isAuthenticated ? (
              <Button
                label={t('mobile.auth.invite.acceptCta')}
                onPress={handleAccept}
                loading={accepting}
                fullWidth
                size="lg"
                style={styles.topGap}
              />
            ) : (
              <>
                <View style={styles.signInNotice}>
                  <Ionicons name="information-circle-outline" size={16} color={tokens.infoFg} />
                  <Text style={styles.signInNoticeText}>
                    {t('mobile.auth.invite.signInRequired')}
                  </Text>
                </View>
                <Button
                  label={t('mobile.auth.invite.signInCta')}
                  onPress={handleSignIn}
                  fullWidth
                  size="lg"
                  style={styles.topGap}
                />
              </>
            )}

            <Button
              label={t('mobile.auth.invite.declineCta')}
              variant="ghost"
              onPress={handleDecline}
              fullWidth
              style={styles.topGapSm}
            />
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: tk.raised,
    borderBottomWidth: 1,
    borderBottomColor: tk.border,
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
  headerTitle: { fontSize: 18, fontWeight: '700', color: tk.textPrimary, letterSpacing: -0.2 },
  headerSpacer: { width: 44 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: tk.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 24,
  },
  heading: {
    fontSize: 22,
    fontWeight: '800',
    color: tk.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  subtext: {
    fontSize: 14,
    color: tk.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
  },
  statusText: { fontSize: 14, color: tk.textSecondary },
  previewCard: {
    backgroundColor: tk.raised,
    borderRadius: 20,
    padding: 20,
    gap: 16,
    shadowColor: tk.shadowColor,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  previewBody: { flex: 1 },
  previewLabel: {
    fontSize: 12,
    color: tk.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  previewValue: { fontSize: 16, fontWeight: '600', color: tk.textPrimary, marginTop: 2 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tk.errorTint,
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  errorBannerText: { flex: 1, fontSize: 13, color: tk.errorFg, lineHeight: 18 },
  signInNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tk.infoTint,
    borderRadius: 12,
    padding: 12,
  },
  signInNoticeText: { flex: 1, fontSize: 13, color: tk.infoFg, lineHeight: 18 },
  topGap: { marginTop: 8 },
  topGapSm: { marginTop: 4 },
  }),
);
