import { router } from 'expo-router';

export function goHome() {
  if (router.canDismiss()) router.dismissAll();
  else router.replace('/');
}
