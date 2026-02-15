import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const APP_URL = process.env.EXPO_PUBLIC_APP_URL || '';

export default function App() {
  if (!APP_URL) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.center}>
          <StatusBar style="light" />
          <Text style={styles.title}>Missing App URL</Text>
          <Text style={styles.message}>Set EXPO_PUBLIC_APP_URL in mobile-app/.env</Text>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <WebView
          source={{ uri: APP_URL }}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#16a34a" />
            </View>
          )}
          renderError={() => (
            <View style={styles.center}>
              <Text style={styles.title}>Cannot Load App</Text>
              <Text style={styles.message}>Check EXPO_PUBLIC_APP_URL and internet connection.</Text>
            </View>
          )}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#020617',
    paddingHorizontal: 24,
  },
  title: {
    color: '#e5e7eb',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  message: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
  },
});
