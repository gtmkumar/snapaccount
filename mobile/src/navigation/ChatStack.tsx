/**
 * ChatStack — Phase 6F Track F2 · Wave 7 (GAP-031 CA booking, GAP-043 bookmarks)
 * Routes: ChatList → ChatDetail / ChatBookmarks
 *         ChatList → NewChat → (replace) ChatDetail   [BUG-W7-002]
 *         ChatList → CaSelect → SlotPicker → BookingConfirm → AppointmentConfirmed
 *         ChatList → MyAppointments → AppointmentDetail
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ChatListScreen } from '../screens/chat/ChatListScreen';
import { ChatDetailScreen } from '../screens/chat/ChatDetailScreen';
import { ChatBookmarksScreen } from '../screens/chat/ChatBookmarksScreen';
import { NewChatScreen } from '../screens/chat/NewChatScreen';
import { CaSelectScreen } from '../screens/appointments/CaSelectScreen';
import { SlotPickerScreen } from '../screens/appointments/SlotPickerScreen';
import { BookingConfirmScreen } from '../screens/appointments/BookingConfirmScreen';
import { AppointmentConfirmedScreen } from '../screens/appointments/AppointmentConfirmedScreen';
import { MyAppointmentsScreen } from '../screens/appointments/MyAppointmentsScreen';
import { AppointmentDetailScreen } from '../screens/appointments/AppointmentDetailScreen';

export type ChatStackParamList = {
  ChatList: undefined;
  ChatDetail: {
    threadId: string;
    source?: 'push' | 'url' | 'list' | 'bookmark';
    /** GAP-043 jump-to-message: scroll to + briefly highlight this message. */
    highlightMessageId?: string;
  };
  /** GAP-043: bookmarked messages list. */
  ChatBookmarks: undefined;
  /** BUG-W7-002: new-conversation compose sheet (category → first message). */
  NewChat: undefined;
  // ── GAP-031 CA booking (modal flow) ────────────────────────────────────────
  CaSelect: undefined;
  SlotPicker: {
    caProfileId: string;
    caName: string;
    /** Present when rescheduling an existing appointment (reuses the picker). */
    rescheduleAppointmentId?: string;
  };
  BookingConfirm: {
    caProfileId: string;
    caName: string;
    slotId: string;
    startsAt: string;
    durationMinutes: number;
  };
  AppointmentConfirmed: { appointmentId: string; scheduledAt: string };
  MyAppointments: undefined;
  AppointmentDetail: { appointmentId: string };
};

const Stack = createNativeStackNavigator<ChatStackParamList>();

export function ChatStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ChatList" component={ChatListScreen} />
      <Stack.Screen name="ChatDetail" component={ChatDetailScreen} />
      <Stack.Screen name="ChatBookmarks" component={ChatBookmarksScreen} />
      <Stack.Screen name="NewChat" component={NewChatScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="CaSelect" component={CaSelectScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="SlotPicker" component={SlotPickerScreen} />
      <Stack.Screen name="BookingConfirm" component={BookingConfirmScreen} />
      <Stack.Screen name="AppointmentConfirmed" component={AppointmentConfirmedScreen} />
      <Stack.Screen name="MyAppointments" component={MyAppointmentsScreen} />
      <Stack.Screen name="AppointmentDetail" component={AppointmentDetailScreen} />
    </Stack.Navigator>
  );
}
