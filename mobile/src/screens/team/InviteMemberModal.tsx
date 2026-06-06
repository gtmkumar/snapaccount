/**
 * InviteMemberModal — the "Invite team member" form used by the owner Team screen.
 *
 * Collects: email (required), phone (optional, recommended), role (picker,
 * defaults to Team Member) and an optional custom message. On submit it creates
 * the invite, then surfaces the one-time invite link + code so the owner can
 * Share it (the raw token is only available at create time).
 */
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Colors } from '../../constants/colors';
import {
  INVITE_ROLE_OPTIONS,
  inviteMember,
  type InviteCreatedResult,
  type InviteRoleName,
} from '../../lib/team';
import { getApiError } from '../../lib/api';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called after a successful invite so the parent can refetch the invite list. */
  onInvited: () => void;
}

const schema = z.object({
  email: z.string().trim().email(),
  phone: z.string().trim().optional(),
  customMessage: z.string().trim().optional(),
});

type FormData = z.infer<typeof schema>;

/** Build the deep link the invitee opens to land on the Accept screen. */
function buildInviteLink(token: string): string {
  return `snapaccount://invite/${token}`;
}

export function InviteMemberModal({ visible, onClose, onInvited }: Props) {
  const { t } = useTranslation();
  const [role, setRole] = React.useState<InviteRoleName>('ORG_MEMBER');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<InviteCreatedResult | null>(null);

  const form = useForm<FormData>({ resolver: zodResolver(schema) });

  const reset = React.useCallback(() => {
    form.reset({ email: '', phone: '', customMessage: '' });
    setRole('ORG_MEMBER');
    setError(null);
    setCreated(null);
    setSubmitting(false);
  }, [form]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const onSubmit = form.handleSubmit(async (data) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await inviteMember({
        email: data.email,
        role,
        phone: data.phone || undefined,
        customMessage: data.customMessage || undefined,
      });
      setCreated(result);
      onInvited();
    } catch (err) {
      setError(getApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  });

  const handleShare = async () => {
    if (!created) return;
    const link = buildInviteLink(created.token);
    try {
      await Share.share({
        message: t('mobile.team.invite.shareMessage', { link }),
      });
    } catch {
      // user dismissed the share sheet — no-op
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>
              {created ? t('mobile.team.invite.sentTitle') : t('mobile.team.invite.title')}
            </Text>
            <Pressable
              onPress={handleClose}
              style={styles.closeBtn}
              accessibilityLabel={t('mobile.common.close')}
              hitSlop={8}
            >
              <Ionicons name="close" size={22} color={Colors.neutral[600]} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {created ? (
              // ── Success state: show the one-time link + code to Share ──
              <View>
                <View style={styles.successIcon}>
                  <Ionicons name="mail-open-outline" size={28} color={Colors.success[600]} />
                </View>
                <Text style={styles.successBody}>{t('mobile.team.invite.sentBody')}</Text>

                <Text style={styles.fieldLabel}>{t('mobile.team.invite.linkLabel')}</Text>
                <View style={styles.codeBox}>
                  <Text style={styles.codeText} selectable numberOfLines={2}>
                    {buildInviteLink(created.token)}
                  </Text>
                </View>

                <Text style={styles.fieldLabel}>{t('mobile.team.invite.codeLabel')}</Text>
                <View style={styles.codeBox}>
                  <Text style={styles.codeText} selectable>
                    {created.token}
                  </Text>
                </View>

                <Text style={styles.helperOnce}>{t('mobile.team.invite.onceWarning')}</Text>

                <Button
                  label={t('mobile.team.invite.shareCta')}
                  onPress={handleShare}
                  fullWidth
                  size="lg"
                  leftIcon={<Ionicons name="share-outline" size={18} color={Colors.neutral[0]} />}
                  style={styles.topGap}
                />
                <Button
                  label={t('mobile.common.close')}
                  variant="ghost"
                  onPress={handleClose}
                  fullWidth
                  style={styles.topGapSm}
                />
              </View>
            ) : (
              // ── Form state ──
              <View>
                <Controller
                  control={form.control}
                  name="email"
                  render={({ field, fieldState }) => (
                    <Input
                      label={t('mobile.team.invite.emailLabel')}
                      placeholder={t('mobile.team.invite.emailPlaceholder')}
                      value={field.value ?? ''}
                      onChangeText={field.onChange}
                      error={fieldState.error ? t('mobile.team.invite.emailError') : undefined}
                      required
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoComplete="email"
                    />
                  )}
                />

                <Controller
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <Input
                      label={t('mobile.team.invite.phoneLabel')}
                      placeholder={t('mobile.team.invite.phonePlaceholder')}
                      value={field.value ?? ''}
                      onChangeText={field.onChange}
                      hint={t('mobile.team.invite.phoneHint')}
                      keyboardType="phone-pad"
                      autoComplete="tel"
                    />
                  )}
                />

                <Text style={styles.fieldLabel}>{t('mobile.team.invite.roleLabel')}</Text>
                <View style={styles.roleRow}>
                  {INVITE_ROLE_OPTIONS.map((opt) => {
                    const active = role === opt.name;
                    return (
                      <Pressable
                        key={opt.name}
                        style={[styles.roleChip, active && styles.roleChipActive]}
                        onPress={() => setRole(opt.name)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={t(opt.labelKey, opt.fallbackLabel)}
                      >
                        <Text style={[styles.roleChipText, active && styles.roleChipTextActive]}>
                          {t(opt.labelKey, opt.fallbackLabel)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Controller
                  control={form.control}
                  name="customMessage"
                  render={({ field }) => (
                    <Input
                      label={t('mobile.team.invite.messageLabel')}
                      placeholder={t('mobile.team.invite.messagePlaceholder')}
                      value={field.value ?? ''}
                      onChangeText={field.onChange}
                      multiline
                      style={styles.messageInput}
                    />
                  )}
                />

                {error && (
                  <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle-outline" size={16} color={Colors.error[600]} />
                    <Text style={styles.errorBannerText}>{error}</Text>
                  </View>
                )}

                <Button
                  label={t('mobile.team.invite.submitCta')}
                  onPress={onSubmit}
                  loading={submitting}
                  fullWidth
                  size="lg"
                  style={styles.topGap}
                />
              </View>
            )}

            {submitting && !created && (
              <ActivityIndicator style={styles.topGapSm} color={Colors.brand[500]} />
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface.default,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    maxHeight: '90%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.neutral[200],
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.neutral[900],
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.neutral[700],
    marginBottom: 8,
    marginTop: 4,
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  roleChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.neutral[100],
    minHeight: 44,
    justifyContent: 'center',
  },
  roleChipActive: {
    backgroundColor: Colors.brand[500],
  },
  roleChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.neutral[700],
  },
  roleChipTextActive: {
    color: Colors.neutral[0],
  },
  messageInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.error[50],
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
    marginBottom: 4,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: Colors.error[600],
    lineHeight: 18,
  },
  successIcon: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: Colors.success[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  successBody: {
    fontSize: 14,
    color: Colors.neutral[600],
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  codeBox: {
    backgroundColor: Colors.neutral[50],
    borderWidth: 1,
    borderColor: Colors.neutral[200],
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  codeText: {
    fontSize: 13,
    color: Colors.neutral[800],
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
  helperOnce: {
    fontSize: 12,
    color: Colors.warning[600],
    marginBottom: 8,
    lineHeight: 16,
  },
  topGap: {
    marginTop: 12,
  },
  topGapSm: {
    marginTop: 8,
  },
});
