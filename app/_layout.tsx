import { useColorScheme } from '@/hooks/useColorScheme';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import 'react-native-reanimated';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({ SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf') });
  const isWeb = Platform.OS === 'web';

  // Fonts load asynchronously on all platforms - app renders immediately with system fonts
  // Custom fonts will apply automatically once loaded

  // Development-only, web-only: end total startup timer once RootLayout is ready.
  if (isWeb && __DEV__ && typeof window !== 'undefined') {
    const w = window as any;
    if (w.__WEB_TOTAL_STARTUP_TIMER_STARTED__ && !w.__WEB_TOTAL_STARTUP_TIMER_ENDED__) {
      w.__WEB_TOTAL_STARTUP_TIMER_ENDED__ = true;
      console.timeEnd('WEB_TOTAL_STARTUP');
      console.log('[PERF] WEB_TOTAL_STARTUP ended in RootLayout');
    }
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {/* Hide every native header globally */}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="account_confirm" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="register_two" />
        <Stack.Screen name="id" />
        <Stack.Screen name="agree_terms" />
        <Stack.Screen name="verify" />
        {/* keep buddyrunner if you want at root */}
        <Stack.Screen name="buddyrunner/home" />
        <Stack.Screen name="buddyrunner/notification" />
        {/* Do NOT list buddycaller screens here */}
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
