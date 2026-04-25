/**
 * ChatStack — Phase 6F Track F2
 * Routes: ChatList → ChatDetail
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ChatListScreen } from '../screens/chat/ChatListScreen';
import { ChatDetailScreen } from '../screens/chat/ChatDetailScreen';

export type ChatStackParamList = {
  ChatList: undefined;
  ChatDetail: { threadId: string; source?: 'push' | 'url' | 'list' };
};

const Stack = createNativeStackNavigator<ChatStackParamList>();

export function ChatStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ChatList" component={ChatListScreen} />
      <Stack.Screen name="ChatDetail" component={ChatDetailScreen} />
    </Stack.Navigator>
  );
}
