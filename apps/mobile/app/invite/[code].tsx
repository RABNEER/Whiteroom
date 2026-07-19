import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { colors } from '@/theme/tokens';
import { Card, Button, Banner, DisplayTitle, Muted } from '@/components/ui';

export default function InviteScreen() {
  const { code, role } = useLocalSearchParams<{ code: string; role?: string }>();
  const cleanCode = (code || '').trim().toUpperCase();
  const targetRole = role === 'teacher' ? 'teacher' : 'parent';

  const resolveQuery = useQuery({
    queryKey: ['inviteResolve', cleanCode],
    queryFn: () => api.inviteResolve(cleanCode),
    enabled: Boolean(cleanCode && cleanCode.length >= 6),
    retry: false,
  });

  const handleContinue = () => {
    router.replace({
      pathname: '/auth',
      params: { inviteCode: cleanCode, role: targetRole },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <DisplayTitle style={{ textAlign: 'center', marginBottom: 8 }}>School Invitation</DisplayTitle>
        <Muted style={{ textAlign: 'center', marginBottom: 24 }}>
          You have been invited to join a school workspace on Whiteroom as a {targetRole === 'teacher' ? 'Teacher' : 'Parent'}.
        </Muted>

        <Card style={styles.card}>
          {resolveQuery.isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.teal} size="large" />
              <Text style={styles.loadingText}>Verifying invite code {cleanCode}...</Text>
            </View>
          ) : resolveQuery.isError || !resolveQuery.data ? (
            <View style={styles.errorBox}>
              <Banner tone="danger">
                We could not resolve invite code "{cleanCode}". It may be invalid or expired.
              </Banner>
              <Button onPress={handleContinue} style={{ marginTop: 16 }}>
                Continue to Login / Enter Code Manually
              </Button>
            </View>
          ) : (
            <View style={styles.successBox}>
              <Text style={styles.label}>INVITED AS {targetRole.toUpperCase()} TO</Text>
              <Text style={[styles.schoolName, { color: resolveQuery.data.brandColor || colors.navy }]}>
                {resolveQuery.data.tenantName || 'School Workspace'}
              </Text>
              <Text style={styles.codeBadge}>Code: {cleanCode}</Text>

              <View style={{ width: '100%', marginVertical: 16 }}>
                <Banner tone="info">
                  Click below to continue signing in or creating your account as a {targetRole === 'teacher' ? 'Teacher' : 'Parent'} for this school.
                </Banner>
              </View>

              <Button onPress={handleContinue} style={{ width: '100%' }}>
                Join {resolveQuery.data.tenantName || 'School'} as {targetRole === 'teacher' ? 'Teacher' : 'Parent'}
              </Button>
            </View>
          )}
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
  },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 16,
  },
  loadingText: {
    color: '#64748B',
    fontSize: 14,
  },
  errorBox: {
    gap: 12,
  },
  successBox: {
    alignItems: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.teal,
    letterSpacing: 1,
    marginBottom: 4,
  },
  schoolName: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  codeBadge: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
});
