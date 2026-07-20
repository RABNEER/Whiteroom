import React, { useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useSession } from '@/auth/session-store';
import { colors } from '@/theme/tokens';
import { Card, Button, Banner, DisplayTitle, Muted } from '@/components/ui';

export default function InviteScreen() {
  const { code, role } = useLocalSearchParams<{ code: string; role?: string }>();
  const cleanCode = (code || '').trim().toUpperCase();
  const targetRole = role === 'teacher' ? 'teacher' : 'parent';
  const { accessToken, setSession } = useSession();
  const [joining, setJoining] = useState(false);

  const resolveQuery = useQuery({
    queryKey: ['inviteResolve', cleanCode],
    queryFn: () => api.inviteResolve(cleanCode),
    enabled: Boolean(cleanCode && cleanCode.length >= 6),
    retry: false,
  });

  const handleContinue = async () => {
    if (accessToken && cleanCode.length === 6) {
      try {
        setJoining(true);
        const data = await api.inviteJoin({
          inviteCode: cleanCode,
          role: targetRole,
        });
        await setSession(data);
        router.replace('/');
        return;
      } catch (err: any) {
        setJoining(false);
        Alert.alert('Join Error', err.message || 'Failed to join classroom.');
        return;
      }
    }
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
                  {accessToken
                    ? `Click below to immediately join ${resolveQuery.data.tenantName || 'this school'} as a ${targetRole === 'teacher' ? 'Teacher' : 'Parent'}.`
                    : `Click below to continue signing in or creating your account as a ${targetRole === 'teacher' ? 'Teacher' : 'Parent'} for this school.`}
                </Banner>
              </View>

              <Button onPress={handleContinue} loading={joining} style={{ width: '100%' }}>
                {accessToken
                  ? `Join Now as ${targetRole === 'teacher' ? 'Teacher' : 'Parent'}`
                  : `Join ${resolveQuery.data.tenantName || 'School'} as ${targetRole === 'teacher' ? 'Teacher' : 'Parent'}`}
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
