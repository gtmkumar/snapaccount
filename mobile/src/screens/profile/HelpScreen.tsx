/**
 * HelpScreen — Help & Support hub.
 * Task #18 (GAP-060rem): replaces the ProfileScreen "Help" stub.
 *
 * Routes to the two existing support surfaces:
 *   1. Expert Chat (ChatStack — already mounted under MoreStack as 'Chat')
 *   2. Request Callback (RequestCallbackCta → RequestCallbackModalScreen)
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '../../constants/colors';
import { RequestCallbackCta } from '../../components/callbacks/RequestCallbackCta';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'Help'>;
interface Props { navigation: NavProp }

export function HelpScreen({ navigation }: Props) {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityLabel={t('mobile.common.back')}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.help.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>{t('mobile.help.intro')}</Text>

        {/* Expert chat */}
        <Pressable
          style={styles.chatCard}
          onPress={() => navigation.navigate('Chat')}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.help.chatCta')}
          testID="help-chat-cta"
        >
          <View style={styles.chatIconWrap}>
            <Ionicons name="chatbubbles-outline" size={22} color={Colors.brand[600]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.chatTitle}>{t('mobile.help.chatCta')}</Text>
            <Text style={styles.chatBody}>{t('mobile.help.chatBody')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.neutral[400]} />
        </Pressable>

        {/* Request a callback */}
        <Text style={styles.sectionTitle}>{t('mobile.help.callbackTitle')}</Text>
        <RequestCallbackCta
          variant="card"
          category="OTHER"
          onNavigateToModal={(params) => navigation.navigate('RequestCallbackModal', params)}
          onNavigateToStatus={(callbackId) => navigation.navigate('CallbackStatus', { callbackId })}
          onNavigateToChat={() => navigation.navigate('Chat')}
          testID="help-callback-cta"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.surface.default, borderBottomWidth: 1, borderBottomColor: Colors.neutral[100],
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.neutral[900] },

  scrollContent: { padding: 16, gap: 14, paddingBottom: 32 },
  intro: { fontSize: 14, color: Colors.neutral[600], lineHeight: 21 },

  chatCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.surface.default, borderRadius: 16, padding: 16, minHeight: 64,
    borderWidth: 1, borderColor: Colors.neutral[100],
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  chatIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.brand[50], alignItems: 'center', justifyContent: 'center' },
  chatTitle: { fontSize: 15, fontWeight: '700', color: Colors.neutral[900] },
  chatBody: { fontSize: 12, color: Colors.neutral[500], marginTop: 2, lineHeight: 18 },

  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.neutral[900], marginTop: 6 },
});
