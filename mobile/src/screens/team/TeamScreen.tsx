/**
 * TeamScreen — owner-side team management (Phase 2 org invite/join).
 *
 * Shows:
 *   - the org's active members (name / email / role / status)
 *   - pending invites with resend + revoke actions
 *   - an "Invite team member" CTA that opens InviteMemberModal
 *
 * Gated to business owners (userType === 'business_owner'); a non-owner who
 * somehow reaches this route sees an explanatory empty state instead of the
 * (forbidden) management UI.
 */
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Colors } from '../../constants/colors';
import { useAuthStore } from '../../store/authStore';
import { getApiError } from '../../lib/api';
import {
  INVITE_ROLE_OPTIONS,
  listMembers,
  listInvites,
  resendInvite,
  revokeInvite,
  type OrgInvite,
  type TeamMember,
} from '../../lib/team';
import type { MoreStackParamList } from '../../navigation/MoreStack';
import { InviteMemberModal } from './InviteMemberModal';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'Team'>;
interface Props {
  navigation: NavProp;
}

/** Resolve a role NAME to its friendly label (falls back to the raw name). */
function useRoleLabel() {
  const { t } = useTranslation();
  return React.useCallback(
    (roleName: string): string => {
      const opt = INVITE_ROLE_OPTIONS.find((o) => o.name === roleName);
      if (opt) return t(opt.labelKey, opt.fallbackLabel);
      return roleName;
    },
    [t],
  );
}

function MemberRow({ member, roleLabel }: { member: TeamMember; roleLabel: (r: string) => string }) {
  const { t } = useTranslation();
  const initial = (member.displayName ?? member.email ?? 'U').charAt(0).toUpperCase();
  const suspended = member.status === 'suspended';
  return (
    <View style={styles.row}>
      <View style={[styles.avatar, suspended && styles.avatarMuted]}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {member.displayName ?? member.email}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {member.email} · {roleLabel(member.role)}
        </Text>
      </View>
      <View style={[styles.statusPill, suspended ? styles.statusSuspended : styles.statusActive]}>
        <Text style={[styles.statusText, suspended ? styles.statusTextSuspended : styles.statusTextActive]}>
          {suspended ? t('mobile.team.status.suspended') : t('mobile.team.status.active')}
        </Text>
      </View>
    </View>
  );
}

interface InviteRowProps {
  invite: OrgInvite;
  roleLabel: (r: string) => string;
  onResend: (id: string) => void;
  onRevoke: (invite: OrgInvite) => void;
  busy: boolean;
}

function InviteRow({ invite, roleLabel, onResend, onRevoke, busy }: InviteRowProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <View style={styles.inviteIcon}>
        <Ionicons name="mail-outline" size={18} color={Colors.brand[500]} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {invite.email}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {roleLabel(invite.role)} · {t('mobile.team.invites.statusPending')}
        </Text>
      </View>
      <View style={styles.inviteActions}>
        <Pressable
          style={styles.iconBtn}
          onPress={() => onResend(invite.inviteId)}
          disabled={busy}
          accessibilityLabel={t('mobile.team.invites.resend')}
          hitSlop={8}
        >
          <Ionicons name="refresh-outline" size={18} color={Colors.brand[500]} />
        </Pressable>
        <Pressable
          style={styles.iconBtn}
          onPress={() => onRevoke(invite)}
          disabled={busy}
          accessibilityLabel={t('mobile.team.invites.revoke')}
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={18} color={Colors.error[500]} />
        </Pressable>
      </View>
    </View>
  );
}

export function TeamScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const roleLabel = useRoleLabel();
  const isOwner = useAuthStore((s) => s.user?.userType === 'business_owner');
  const [modalVisible, setModalVisible] = React.useState(false);

  const membersQuery = useQuery({
    queryKey: ['team', 'members'],
    queryFn: () => listMembers({ page: 1, pageSize: 100 }),
    enabled: isOwner,
  });

  const invitesQuery = useQuery({
    queryKey: ['team', 'invites'],
    queryFn: listInvites,
    enabled: isOwner,
  });

  const resendMutation = useMutation({
    mutationFn: (id: string) => resendInvite(id),
    onSuccess: () => {
      Alert.alert(t('mobile.team.invites.resentTitle'), t('mobile.team.invites.resentBody'));
      void qc.invalidateQueries({ queryKey: ['team', 'invites'] });
    },
    onError: (err) => Alert.alert(t('mobile.common.error'), getApiError(err).message),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeInvite(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['team', 'invites'] });
    },
    onError: (err) => Alert.alert(t('mobile.common.error'), getApiError(err).message),
  });

  const confirmRevoke = (invite: OrgInvite) => {
    Alert.alert(
      t('mobile.team.invites.revokeConfirmTitle'),
      t('mobile.team.invites.revokeConfirmBody', { email: invite.email }),
      [
        { text: t('mobile.common.cancel'), style: 'cancel' },
        {
          text: t('mobile.team.invites.revoke'),
          style: 'destructive',
          onPress: () => revokeMutation.mutate(invite.inviteId),
        },
      ],
    );
  };

  const handleInvited = () => {
    void qc.invalidateQueries({ queryKey: ['team', 'invites'] });
  };

  const members = membersQuery.data?.items ?? [];
  const pendingInvites = (invitesQuery.data ?? []).filter((i) => i.status === 'pending');
  const refreshing = membersQuery.isRefetching || invitesQuery.isRefetching;
  const mutating = resendMutation.isPending || revokeMutation.isPending;

  const onRefresh = () => {
    void membersQuery.refetch();
    void invitesQuery.refetch();
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityLabel={t('mobile.common.back')}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.team.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {!isOwner ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="lock-closed-outline" size={40} color={Colors.neutral[300]} />
          <Text style={styles.emptyTitle}>{t('mobile.team.ownerOnlyTitle')}</Text>
          <Text style={styles.emptyText}>{t('mobile.team.ownerOnlyBody')}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          <Button
            label={t('mobile.team.inviteCta')}
            onPress={() => setModalVisible(true)}
            fullWidth
            size="lg"
            leftIcon={<Ionicons name="person-add-outline" size={18} color={Colors.neutral[0]} />}
          />

          {/* Pending invites */}
          <Text style={styles.sectionTitle}>{t('mobile.team.invites.section')}</Text>
          <Card padding="none" style={styles.sectionCard}>
            {invitesQuery.isLoading ? (
              <ActivityIndicator style={styles.cardLoader} color={Colors.brand[500]} />
            ) : pendingInvites.length === 0 ? (
              <Text style={styles.cardEmpty}>{t('mobile.team.invites.empty')}</Text>
            ) : (
              pendingInvites.map((invite, idx) => (
                <View key={invite.inviteId}>
                  {idx > 0 && <View style={styles.divider} />}
                  <InviteRow
                    invite={invite}
                    roleLabel={roleLabel}
                    onResend={(id) => resendMutation.mutate(id)}
                    onRevoke={confirmRevoke}
                    busy={mutating}
                  />
                </View>
              ))
            )}
          </Card>

          {/* Members */}
          <Text style={styles.sectionTitle}>{t('mobile.team.members.section')}</Text>
          <Card padding="none" style={styles.sectionCard}>
            {membersQuery.isLoading ? (
              <ActivityIndicator style={styles.cardLoader} color={Colors.brand[500]} />
            ) : membersQuery.isError ? (
              <Text style={styles.cardEmpty}>{t('mobile.team.members.error')}</Text>
            ) : members.length === 0 ? (
              <Text style={styles.cardEmpty}>{t('mobile.team.members.empty')}</Text>
            ) : (
              members.map((member, idx) => (
                <View key={member.userId}>
                  {idx > 0 && <View style={styles.divider} />}
                  <MemberRow member={member} roleLabel={roleLabel} />
                </View>
              ))
            )}
          </Card>
        </ScrollView>
      )}

      <InviteMemberModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onInvited={handleInvited}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.neutral[900],
    letterSpacing: -0.2,
  },
  headerSpacer: { width: 40 },
  scrollContent: { padding: 16, gap: 8 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.neutral[500],
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 20,
    marginBottom: 8,
  },
  sectionCard: { overflow: 'hidden' },
  cardLoader: { paddingVertical: 24 },
  cardEmpty: {
    fontSize: 14,
    color: Colors.neutral[500],
    textAlign: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.neutral[100],
    marginLeft: 64,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.brand[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMuted: { backgroundColor: Colors.neutral[400] },
  avatarText: { fontSize: 16, fontWeight: '700', color: Colors.neutral[0] },
  inviteIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: Colors.neutral[900] },
  rowSub: { fontSize: 13, color: Colors.neutral[500], marginTop: 2 },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusActive: { backgroundColor: Colors.success[50] },
  statusSuspended: { backgroundColor: Colors.neutral[100] },
  statusText: { fontSize: 11, fontWeight: '700' },
  statusTextActive: { color: Colors.success[600] },
  statusTextSuspended: { color: Colors.neutral[500] },
  inviteActions: { flexDirection: 'row', gap: 4 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.neutral[800],
  },
  emptyText: {
    fontSize: 14,
    color: Colors.neutral[500],
    textAlign: 'center',
    lineHeight: 20,
  },
});
