/**
 * Profile Screen — Redesign 2026
 * Clean profile with premium menu styling
 */

import React from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Colors } from '../../constants/colors';
import { useAuthStore } from '../../store/authStore';
import { FirebaseAuth } from '../../lib/firebase';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'Profile'>;
interface Props { navigation: NavProp }

function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/^\+/, '');
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return phone;
}

export function ProfileScreen({ navigation }: Props) {
  const { user, currentOrganization, signOut } = useAuthStore();

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await FirebaseAuth.signOut();
            signOut();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
        </Pressable>
        <Text style={styles.title}>Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Avatar + name */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.name ?? user?.phone ?? 'U').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.userName}>{user?.name ?? 'SnapAccount User'}</Text>
          <Text style={styles.userPhone}>{normalizePhone(user?.phone)}</Text>
          {user?.userType && (
            <View style={styles.userTypePill}>
              <Text style={styles.userTypeText}>
                {user.userType === 'business_owner' ? 'Business Owner' : 'Employee'}
              </Text>
            </View>
          )}
        </View>

        {/* Organization info */}
        {currentOrganization && (
          <Card shadow="sm" style={styles.orgCard}>
            <View style={styles.orgHeader}>
              <View style={styles.orgIconWrap}>
                <Ionicons name="business" size={18} color={Colors.brand[500]} />
              </View>
              <View style={styles.orgInfo}>
                <Text style={styles.orgCardTitle}>Current Organization</Text>
                <Text style={styles.orgName}>{currentOrganization.name}</Text>
              </View>
            </View>
            {currentOrganization.gstin && (
              <View style={styles.gstinRow}>
                <Text style={styles.gstinLabel}>GSTIN</Text>
                <Text style={styles.orgGstin}>{currentOrganization.gstin}</Text>
              </View>
            )}
          </Card>
        )}

        {/* Menu items */}
        <Card shadow="sm" padding="none" style={styles.menuCard}>
          {([
            { label: 'Edit Business Details', icon: 'business-outline', color: Colors.brand[500] },
            { label: 'Manage Devices', icon: 'phone-portrait-outline', color: Colors.info[500] },
            { label: 'Language Settings', icon: 'language-outline', color: Colors.accent[500] },
            { label: 'Notification Preferences', icon: 'notifications-outline', color: Colors.warning[500] },
            { label: 'Subscription & Billing', icon: 'card-outline', color: Colors.success[500] },
            { label: 'Help & Support', icon: 'help-circle-outline', color: Colors.neutral[500] },
            { label: 'About SnapAccount', icon: 'information-circle-outline', color: Colors.neutral[500] },
          ] as { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string }[]).map((item, idx, arr) => (
            <Pressable
              key={item.label}
              style={[styles.menuItem, idx === arr.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => Alert.alert('Coming Soon', `${item.label} coming soon.`)}
            >
              <View style={[styles.menuItemIconWrap, { backgroundColor: item.color + '12' }]}>
                <Ionicons name={item.icon} size={18} color={item.color} />
              </View>
              <Text style={styles.menuItemLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.neutral[300]} />
            </Pressable>
          ))}
        </Card>

        {/* Sign out */}
        <Pressable style={styles.signOutRow} onPress={handleSignOut}>
          <View style={[styles.menuItemIconWrap, { backgroundColor: Colors.error[50] }]}>
            <Ionicons name="log-out-outline" size={18} color={Colors.error[500]} />
          </View>
          <Text style={styles.signOutLabel}>Sign Out</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.neutral[300]} />
        </Pressable>

        <Text style={styles.version}>SnapAccount v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.surface.default, borderBottomWidth: 1, borderBottomColor: Colors.neutral[100] },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: Colors.neutral[900], letterSpacing: -0.2 },
  scrollContent: { padding: 16, gap: 16 },

  // Avatar section
  avatarSection: { alignItems: 'center', paddingVertical: 20 },
  avatar: { width: 80, height: 80, borderRadius: 24, backgroundColor: Colors.brand[500], alignItems: 'center', justifyContent: 'center', marginBottom: 14, shadowColor: Colors.brand[500], shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  avatarText: { fontSize: 32, fontWeight: '800', color: Colors.neutral[0] },
  userName: { fontSize: 22, fontWeight: '700', color: Colors.neutral[900], marginBottom: 4, letterSpacing: -0.3 },
  userPhone: { fontSize: 14, color: Colors.neutral[500], marginBottom: 8 },
  userTypePill: { backgroundColor: Colors.brand[50], paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
  userTypeText: { fontSize: 12, color: Colors.brand[600], fontWeight: '600' },

  // Org card
  orgCard: { padding: 16 },
  orgHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  orgIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.brand[50], alignItems: 'center', justifyContent: 'center' },
  orgInfo: { flex: 1 },
  orgCardTitle: { fontSize: 11, color: Colors.neutral[400], textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  orgName: { fontSize: 16, fontWeight: '700', color: Colors.neutral[900] },
  gstinRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.neutral[100] },
  gstinLabel: { fontSize: 12, color: Colors.neutral[400] },
  orgGstin: { fontSize: 13, color: Colors.neutral[600], fontFamily: Platform.OS === 'ios' ? 'SF Mono' : 'monospace', fontWeight: '500' },

  // Menu
  menuCard: { overflow: 'hidden', borderRadius: 18 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.neutral[100], gap: 12 },
  menuItemIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menuItemLabel: { flex: 1, fontSize: 15, color: Colors.neutral[800], letterSpacing: -0.1 },

  // Sign out
  signOutRow: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: Colors.surface.default, borderRadius: 18, gap: 12, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  signOutLabel: { flex: 1, fontSize: 15, color: Colors.error[500], fontWeight: '600' },
  version: { fontSize: 12, color: Colors.neutral[400], textAlign: 'center', paddingVertical: 4 },
});
