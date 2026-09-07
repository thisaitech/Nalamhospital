export type TabPictureKey = 'home' | 'time' | 'leave' | 'calendar' | 'chat' | 'pay';

type TabNavIconSet = {
  active: string;
  inactive: string;
  label: string;
};

export type TabColorSet = {
  gradientStart: string;
  gradientEnd: string;
  icon: string;
  iconBg: string;
  iconBgDark: string;
};

export const TAB_COLORS: Record<TabPictureKey, TabColorSet> = {
  home: {
    gradientStart: '#4F46E5',
    gradientEnd: '#7C3AED',
    icon: '#4F46E5',
    iconBg: '#EEF2FF',
    iconBgDark: 'rgba(99, 102, 241, 0.2)',
  },
  time: {
    gradientStart: '#0891B2',
    gradientEnd: '#06B6D4',
    icon: '#0891B2',
    iconBg: '#ECFEFF',
    iconBgDark: 'rgba(6, 182, 212, 0.2)',
  },
  leave: {
    gradientStart: '#EA580C',
    gradientEnd: '#F59E0B',
    icon: '#EA580C',
    iconBg: '#FFF7ED',
    iconBgDark: 'rgba(245, 158, 11, 0.2)',
  },
  calendar: {
    gradientStart: '#0F766E',
    gradientEnd: '#14B8A6',
    icon: '#0F766E',
    iconBg: '#F0FDFA',
    iconBgDark: 'rgba(20, 184, 166, 0.2)',
  },
  chat: {
    gradientStart: '#059669',
    gradientEnd: '#10B981',
    icon: '#059669',
    iconBg: '#ECFDF5',
    iconBgDark: 'rgba(16, 185, 129, 0.2)',
  },
  pay: {
    gradientStart: '#DB2777',
    gradientEnd: '#EC4899',
    icon: '#DB2777',
    iconBg: '#FDF2F8',
    iconBgDark: 'rgba(236, 72, 153, 0.2)',
  },
};

export const TAB_NAV_ICONS: Record<TabPictureKey, TabNavIconSet> = {
  home: { active: 'home', inactive: 'home-outline', label: 'Home' },
  time: { active: 'time', inactive: 'time-outline', label: 'Time' },
  leave: { active: 'calendar', inactive: 'calendar-outline', label: 'Leave' },
  calendar: { active: 'calendar-number', inactive: 'calendar-number-outline', label: 'Calendar' },
  chat: { active: 'chatbubbles', inactive: 'chatbubbles-outline', label: 'Chat' },
  pay: { active: 'wallet', inactive: 'wallet-outline', label: 'Pay' },
};

export const TAB_PICTURES: Record<
  TabPictureKey,
  { emoji: string; icon: { ios: string; android: string; web: string }; label: string }
> = {
  home: { emoji: '🏠', icon: { ios: 'house.fill', android: 'home', web: 'home' }, label: 'Home' },
  time: { emoji: '⏱️', icon: { ios: 'clock.fill', android: 'schedule', web: 'schedule' }, label: 'Time' },
  leave: { emoji: '📅', icon: { ios: 'calendar', android: 'event', web: 'event' }, label: 'Leave' },
  calendar: {
    emoji: '🗓️',
    icon: { ios: 'calendar.badge.clock', android: 'calendar_month', web: 'calendar_month' },
    label: 'Calendar',
  },
  chat: { emoji: '💬', icon: { ios: 'bubble.left.and.bubble.right.fill', android: 'chat', web: 'chat' }, label: 'Chat' },
  pay: { emoji: '💰', icon: { ios: 'dollarsign.circle.fill', android: 'payments', web: 'payments' }, label: 'Pay' },
};

export type QuickActionKey = 'leave' | 'time' | 'pay' | 'chat';

export const QUICK_ACTION_PICTURES: Record<
  QuickActionKey,
  { emoji: string; icon: { ios: string; android: string; web: string } }
> = {
  leave: { emoji: TAB_PICTURES.leave.emoji, icon: { ios: 'calendar.badge.plus', android: 'event_available', web: 'event_available' } },
  time: { emoji: TAB_PICTURES.time.emoji, icon: TAB_PICTURES.time.icon },
  pay: { emoji: TAB_PICTURES.pay.emoji, icon: TAB_PICTURES.pay.icon },
  chat: { emoji: TAB_PICTURES.chat.emoji, icon: TAB_PICTURES.chat.icon },
};

export const CHAT_CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  update: 'Update',
  'sick-leave': 'Sick Leave',
  leave: 'Leave',
};
