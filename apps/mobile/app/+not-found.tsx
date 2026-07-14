import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/tokens';
import { Card, Button, DisplayTitle, Muted } from '@/components/ui';

export default function NotFoundScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <DisplayTitle style={{ textAlign: 'center', marginBottom: 8 }}>Page Not Found</DisplayTitle>
        <Muted style={{ textAlign: 'center', marginBottom: 24 }}>
          This link or route is unmatched or no longer available.
        </Muted>

        <Card style={styles.card}>
          <Text style={{ fontSize: 40, textAlign: 'center', marginBottom: 12 }}>🔍</Text>
          <Text style={{ color: colors.navy, fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 20 }}>
            We couldn't find the screen you were looking for.
          </Text>
          <Button onPress={() => router.replace('/auth')} style={{ width: '100%' }}>
            Go to Home / Sign In
          </Button>
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    justifyContent: 'center',
    padding: 20,
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  card: {
    padding: 24,
    alignItems: 'center',
  },
});
