/**
 * Persona Selection Screen — the onboarding fork.
 * Shown to every NEW user after auth (OTP / social / password) before any profile
 * is collected. The choice decides which onboarding wizard runs and, ultimately,
 * the UserType stamped on the profile:
 *
 *   "I run a business"        → BusinessProfileWizard  → UserType = business_owner (+ org)
 *   "I'm a salaried individual" → IndividualProfileWizard → UserType = employee (no org)
 *
 * See docs/design/user-hierarchy-gap-analysis.md §Issue 1.
 */
import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import type { AuthStackParamList } from '../../navigation/AuthNavigator';

type NavProp = NativeStackNavigationProp<AuthStackParamList, 'PersonaSelection'>;

interface Props {
  navigation: NavProp;
}

interface PersonaCardProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
  onPress: () => void;
  accentBg: string;
  accentFg: string;
}

function PersonaCard({ icon, title, description, onPress, accentBg, accentFg }: PersonaCardProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={[styles.cardIcon, { backgroundColor: accentBg }]}>
        <Ionicons name={icon} size={26} color={accentFg} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDesc}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={tokens.textTertiary} />
    </TouchableOpacity>
  );
}

export function PersonaSelectionScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.iconCircle}>
          <Ionicons name="people-outline" size={32} color={tokens.brand500} />
        </View>

        <Text style={styles.heading}>How will you use SnapAccount?</Text>
        <Text style={styles.subtext}>
          This personalises your app. You can change it later from Settings.
        </Text>

        <View style={styles.cards}>
          <PersonaCard
            icon="storefront-outline"
            title="I run a business"
            description="GST filing, accounting, loans, document vault & expert CA chat"
            accentBg={tokens.brandTint}
            accentFg={tokens.brand500}
            onPress={() => navigation.navigate('BusinessProfileWizard')}
          />
          <PersonaCard
            icon="person-outline"
            title="I'm a salaried individual"
            description="File your personal ITR, upload Form 16 & get tax support"
            accentBg={tokens.successTint}
            accentFg={tokens.successFg}
            onPress={() => navigation.navigate('IndividualProfileWizard')}
          />
        </View>

        <Text style={styles.note}>
          Both options keep your documents in a secure, encrypted vault.
        </Text>

        {/* Phase 2: invitees who already have an org invite can join directly. */}
        <TouchableOpacity
          style={styles.joinLink}
          onPress={() => navigation.navigate('AcceptInvite')}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.auth.invite.joinEntry')}
        >
          <Ionicons name="link-outline" size={16} color={tokens.brand500} />
          <Text style={styles.joinLinkText}>{t('mobile.auth.invite.joinEntry')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tk.raised,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 32,
  },
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
    fontSize: 26,
    fontWeight: '800',
    color: tk.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  subtext: {
    fontSize: 15,
    color: tk.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  cards: {
    gap: 14,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tk.border,
    backgroundColor: tk.raised,
  },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: tk.textPrimary,
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    color: tk.textSecondary,
    lineHeight: 18,
  },
  note: {
    fontSize: 12,
    color: tk.textTertiary,
    textAlign: 'center',
    marginTop: 28,
  },
  joinLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
    paddingVertical: 12,
    minHeight: 44,
  },
  joinLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: tk.brand500,
  },
  }),
);
