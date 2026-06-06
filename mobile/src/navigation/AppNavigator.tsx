/**
 * App Navigator (Bottom Tab Navigator)
 *
 * The tab set is persona-conditional (see docs/design/user-hierarchy-gap-analysis.md):
 *   Business Owner (userType = business_owner / default):
 *     Home · Documents · GST · Loans · More
 *   Salaried Individual (userType = employee):
 *     Taxes (ITR) · Documents · Support · More
 *
 * A salaried individual never sees the GST/Loan/financial-dashboard tabs that are
 * meaningless to them; their primary job (ITR) is promoted to the first tab instead
 * of being buried under More.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { useAuthStore } from '../store/authStore';

// Stack navigators
import { HomeStack } from './HomeStack';
import { DocumentStack } from './DocumentStack';
import { GstStack } from './GstStack';
import { LoanStack } from './LoanStack';
import { ItrStack } from './ItrStack';
import { ChatStack } from './ChatStack';
import { MoreStack } from './MoreStack';

export type AppTabParamList = {
  HomeTab: undefined;
  DocumentsTab: undefined;
  GstTab: undefined;
  LoanTab: undefined;
  ItrTab: undefined;
  SupportTab: undefined;
  MoreTab: undefined;
};

const Tab = createBottomTabNavigator<AppTabParamList>();

interface TabIconProps {
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  iconNameFocused: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  focused: boolean;
  badge?: number;
}

function TabIcon({ iconName, iconNameFocused, label, focused, badge }: TabIconProps) {
  return (
    <View style={styles.tabIconContainer}>
      <View>
        <Ionicons
          name={focused ? iconNameFocused : iconName}
          size={24}
          color={focused ? Colors.brand[500] : Colors.neutral[400]}
        />
        {badge !== undefined && badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.tabLabel, focused && styles.tabLabelFocused]}>
        {label}
      </Text>
    </View>
  );
}

export function AppNavigator() {
  // Salaried individuals (UserType=employee) get the ITR-centric tab set; everyone
  // else (business owners, and any pre-persona/default account) gets the SME set.
  const isIndividual = useAuthStore((s) => s.user?.userType === 'employee');

  const documentsTab = (
    <Tab.Screen
      name="DocumentsTab"
      component={DocumentStack}
      options={{
        tabBarIcon: ({ focused }) => (
          <TabIcon
            iconName="folder-outline"
            iconNameFocused="folder"
            label="Documents"
            focused={focused}
          />
        ),
      }}
    />
  );

  const moreTab = (
    <Tab.Screen
      name="MoreTab"
      component={MoreStack}
      options={{
        tabBarIcon: ({ focused }) => (
          <TabIcon
            iconName="menu-outline"
            iconNameFocused="menu"
            label="More"
            focused={focused}
          />
        ),
      }}
    />
  );

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      {isIndividual ? (
        <>
          <Tab.Screen
            name="ItrTab"
            component={ItrStack}
            options={{
              tabBarIcon: ({ focused }) => (
                <TabIcon
                  iconName="document-text-outline"
                  iconNameFocused="document-text"
                  label="Taxes"
                  focused={focused}
                />
              ),
            }}
          />
          {documentsTab}
          <Tab.Screen
            name="SupportTab"
            component={ChatStack}
            options={{
              tabBarIcon: ({ focused }) => (
                <TabIcon
                  iconName="chatbubble-ellipses-outline"
                  iconNameFocused="chatbubble-ellipses"
                  label="Support"
                  focused={focused}
                />
              ),
            }}
          />
          {moreTab}
        </>
      ) : (
        <>
          <Tab.Screen
            name="HomeTab"
            component={HomeStack}
            options={{
              tabBarIcon: ({ focused }) => (
                <TabIcon
                  iconName="home-outline"
                  iconNameFocused="home"
                  label="Home"
                  focused={focused}
                />
              ),
            }}
          />
          {documentsTab}
          <Tab.Screen
            name="GstTab"
            component={GstStack}
            options={{
              tabBarIcon: ({ focused }) => (
                <TabIcon
                  iconName="bar-chart-outline"
                  iconNameFocused="bar-chart"
                  label="GST"
                  focused={focused}
                />
              ),
            }}
          />
          <Tab.Screen
            name="LoanTab"
            component={LoanStack}
            options={{
              tabBarIcon: ({ focused }) => (
                <TabIcon
                  iconName="business-outline"
                  iconNameFocused="business"
                  label="Loans"
                  focused={focused}
                />
              ),
            }}
          />
          {moreTab}
        </>
      )}
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 56,
    backgroundColor: Colors.neutral[0],
    borderTopWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
    paddingBottom: 0,
  },
  tabIconContainer: {
    alignItems: 'center',
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 10,
    color: Colors.neutral[400],
    marginTop: 2,
    fontWeight: '500',
  },
  tabLabelFocused: {
    color: Colors.brand[500],
    fontWeight: '600',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: Colors.error[600],
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: Colors.neutral[0],
    fontSize: 9,
    fontWeight: '700',
  },
});
