import * as Haptics from 'expo-haptics';

const ignore = () => {};

export const haptics = {
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(ignore),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(ignore),
  selection: () => Haptics.selectionAsync().catch(ignore),
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(ignore),
};
