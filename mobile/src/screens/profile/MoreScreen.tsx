/**
 * More Screen — Redesign 2026
 * Clean hub with premium card styling
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card } from '../../components/ui/Card';
import { Colors } from '../../constants/colors';
import { useAuthStore } from '../../store/authStore';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'More'>;
interface Props { navigation: NavProp }

function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/^\+/, '');
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return phone;
}

export function MoreScreen({ navigation }: Props) {
  const { user } = useAuthStore();

  const menuItems: {
    label: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    route: keyof MoreStackParamList;
    color: string;
    desc: string;
  }[] = [
    { label: 'Expert Chat', icon: 'chatbubble-ellipses-outline', route: 'Chat', color: Colors.brand[500], desc: 'Chat with CA experts' },
    { label: 'ITR Filing', icon: 'document-text-outline', route: 'ITRDashboard', color: Colors.itr, desc: 'File income tax return' },
    { label: 'Notifications', icon: 'notifications-outline', route: 'NotificationCenter', color: Colors.accent[500], desc: 'Alerts & updates' },
    { label: 'Profile & Settings', icon: 'person-circle-outline', route: 'Profile', color: Colors.neutral[600], desc: 'Account settings' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>More</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* User summary */}
        <Card shadow="sm" style={styles.userCard}>
          <View style={styles.userRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(user?.name ?? 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{user?.name ?? 'SnapAccount User'}</Text>
              <Text style={styles.userPhone}>{normalizePhone(user?.phone)}</Text>
            </View>
            <Pressable
              style={styles.editBtn}
              onPress={() => navigation.navigate('Profile')}
            >
              <Ionicons name="chevron-forward" size={20} color={Colors.neutral[400]} />
            </Pressable>
          </View>
        </Card>

        {/* Menu grid */}
        <View style={styles.grid}>
          {menuItems.map((item) => (
            <Pressable
              key={item.label}
              style={styles.gridItem}
              onPress={() => (navigation.navigate as (route: string) => void)(item.route)}
            >
              <View style={[styles.gridIcon, { backgroundColor: item.color + '12' }]}>
                <Ionicons name={item.icon} size={24} color={item.color} />
              </View>
              <Text style={styles.gridLabel}>{item.label}</Text>
              <Text style={styles.gridDesc} numberOfLines={1}>{item.desc}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
  header: { paddingHorizontal: 20, paddingVertical: 14, backgroundColor: Colors.surface.default, borderBottomWidth: 1, borderBottomColor: Colors.neutral[100] },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.neutral[900], letterSpacing: -0.3 },
  scrollContent: { padding: 16, gap: 16 },
  userCard: { padding: 16 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 16, backgroundColor: Colors.brand[500], alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '700', color: Colors.neutral[0] },
  userInfo: { flex: 1 },
  userName: { fontSize: 17, fontWeight: '700', color: Colors.neutral[900], letterSpacing: -0.2 },
  userPhone: { fontSize: 13, color: Colors.neutral[500], marginTop: 2 },
  editBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridItem: {
    width: '47%',
    backgroundColor: Colors.surface.default,
    borderRadius: 18,
    padding: 18,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  gridIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  gridLabel: { fontSize: 15, fontWeight: '700', color: Colors.neutral[900], marginBottom: 4, letterSpacing: -0.2 },
  gridDesc: { fontSize: 12, color: Colors.neutral[500] },
});
