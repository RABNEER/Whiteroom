import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Lock, Globe, Shield, Check, ArrowRight } from 'lucide-react-native';
import { api, ApiError } from '@/api/client';
import { colors, font } from '@/theme/tokens';

// ─── S7 / S8 / S9: Tenant Initialization Screen ──────────────────────────────

export default function TenantInitScreen() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [publicSearch, setPublicSearch] = useState(false);

  const showProAlert = (featureName: string) => {
    Alert.alert(
      'PRO Feature Required',
      `Custom ${featureName} is locked to Whiteroom PRO. Upgrade to personalize your institution's theme.`,
      [{ text: 'OK' }]
    );
  };

  const initMutation = useMutation({
    mutationFn: () => api.tenantUpdate({ name: name.trim(), publicSearch }),
    onSuccess: (data) => {
      qc.setQueryData(['tenant'], data);
      qc.invalidateQueries({ queryKey: ['tenant'] });
      qc.invalidateQueries({ queryKey: ['classes'] });
      router.replace('/teacher');
    },
    onError: (err: unknown) => {
      Alert.alert(
        'Setup Failed',
        err instanceof ApiError ? err.message : 'An unexpected error occurred. Please try again.',
      );
    },
  });

  const handleComplete = () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter your institution name to continue.');
      return;
    }
    initMutation.mutate();
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── S7: HEADER BLOCK ─────────────────────────────────────────── */}
          <View style={styles.headerBlock}>
            <Text style={styles.eyebrow}>ONBOARDING</Text>
            <Text style={styles.title}>
              Initialize Your <Text style={styles.accentText}>Whiteroom.</Text>
            </Text>
            <Text style={styles.subtitle}>
              Set up your institutional identity and branding to welcome parents.
            </Text>
          </View>

          {/* ── S7 + S8: CARD 1 — INSTITUTIONAL BRANDING ─────────────────── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>INSTITUTIONAL BRANDING</Text>

            {/* Institution Name Field */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>INSTITUTION NAME</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Verma Physics Classes"
                placeholderTextColor={colors.teal}
                autoCapitalize="words"
                returnKeyType="done"
                accessibilityLabel="Institution name input"
                maxLength={100}
              />
            </View>

            {/* Custom Logo — PRO Locked */}
            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>CUSTOM LOGO</Text>
                <View style={styles.proBadge}>
                  <Text style={styles.proText}>PRO</Text>
                </View>
              </View>
              <Pressable
                onPress={() => showProAlert('Logo Upload')}
                style={({ pressed }) => [
                  styles.uploadBox,
                  { opacity: pressed ? 0.3 : 0.5 }
                ]}
              >
                <Upload size={20} color={colors.teal} />
                <Text style={styles.uploadText}>Upload logo image (.png / .jpg)</Text>
                <View style={styles.lockIcon}>
                  <Lock size={12} color={colors.teal} />
                </View>
              </Pressable>
            </View>

            {/* Primary Brand Color — PRO Locked */}
            <View style={[styles.fieldGroup, { marginBottom: 0 }]}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>PRIMARY BRAND COLOR</Text>
                <View style={styles.proBadge}>
                  <Text style={styles.proText}>PRO</Text>
                </View>
              </View>
              <View style={styles.colorRow}>
                {/* Active/selected: navy with teal border + check */}
                <Pressable
                  onPress={() => showProAlert('Brand Color')}
                  style={[styles.colorCircle, { backgroundColor: colors.navy, borderColor: colors.teal, borderWidth: 2 }]}
                >
                  <Check size={16} color={colors.white} />
                </Pressable>
                {/* Locked options */}
                <Pressable
                  onPress={() => showProAlert('Brand Color')}
                  style={({ pressed }) => [styles.colorCircle, { backgroundColor: '#4F46E5', opacity: pressed ? 0.2 : 0.4 }]}
                />
                <Pressable
                  onPress={() => showProAlert('Brand Color')}
                  style={({ pressed }) => [styles.colorCircle, { backgroundColor: '#06B6D4', opacity: pressed ? 0.2 : 0.4 }]}
                />
                <Pressable
                  onPress={() => showProAlert('Brand Color')}
                  style={({ pressed }) => [styles.colorCircle, { backgroundColor: '#10B981', opacity: pressed ? 0.2 : 0.4 }]}
                />
              </View>
            </View>
          </View>

          {/* ── S9: CARD 2 — ACCESS & COMPLIANCE ─────────────────────────── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>ACCESS & COMPLIANCE</Text>

            {/* Toggle: Enable Public Search */}
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: publicSearch }}
              style={styles.toggleRow}
              onPress={() => setPublicSearch((prev) => !prev)}
            >
              <View style={styles.toggleLeft}>
                <View style={styles.iconCircle}>
                  <Globe size={16} color={colors.navy} />
                </View>
                <View style={styles.textColumn}>
                  <Text style={styles.toggleLabel}>Enable Public Search</Text>
                  <Text style={styles.toggleSub}>
                    Allow parents to discover your institute on the web.
                  </Text>
                </View>
              </View>
              <View style={[styles.switchTrack, publicSearch ? { backgroundColor: colors.navy } : { backgroundColor: colors.sky }]}>
                <View style={[styles.switchThumb, publicSearch ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]} />
              </View>
            </Pressable>

            {/* Static: DPDP Act Compliant Storage */}
            <View style={[styles.toggleRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
              <View style={styles.toggleLeft}>
                <View style={styles.iconCircle}>
                  <Shield size={16} color={colors.navy} />
                </View>
                <View style={styles.textColumn}>
                  <Text style={styles.toggleLabel}>DPDP Act Compliant Storage</Text>
                  <Text style={styles.toggleSub}>
                    Your data is securely isolated on local Indian servers.
                  </Text>
                </View>
              </View>
              <View style={styles.activePill}>
                <Check size={12} color={colors.navy} />
                <Text style={styles.activeText}>ACTIVE</Text>
              </View>
            </View>
          </View>

          {/* ── SUBMIT BUTTON ─────────────────────────────────────────────── */}
          <Pressable
            accessibilityRole="button"
            onPress={handleComplete}
            disabled={!name.trim() || initMutation.isPending}
            style={[styles.button, (!name.trim() || initMutation.isPending) && { opacity: 0.5 }]}
          >
            {initMutation.isPending ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <View style={styles.buttonInner}>
                <Text style={styles.buttonText}>COMPLETE INITIALIZATION</Text>
                <ArrowRight size={18} color={colors.white} style={{ marginLeft: 8 }} />
              </View>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 48,
  },

  // Header
  headerBlock: {
    marginBottom: 24,
  },
  eyebrow: {
    color: colors.teal,
    fontSize: 9,
    letterSpacing: 2,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: colors.navy,
    fontSize: 28,
    fontWeight: '900',
    marginTop: 6,
    lineHeight: 34,
  },
  accentText: {
    color: colors.teal,
  },
  subtitle: {
    color: colors.teal,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },

  // Card
  card: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.sky,
    borderRadius: 14,
    padding: 18,
    marginBottom: 20,
  },
  cardTitle: {
    color: colors.navy,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 16,
  },

  // Field
  field: {
    marginBottom: 16,
  },
  fieldLabel: {
    color: colors.teal,
    fontSize: 9,
    letterSpacing: 1.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.sky,
    borderRadius: 8,
    padding: 14,
    color: colors.navy,
    fontSize: 15,
    fontWeight: '600',
    backgroundColor: colors.white,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },

  // PRO badge
  proBadge: {
    backgroundColor: colors.navy,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  proText: {
    color: colors.white,
    fontSize: 9,
    fontFamily: font.mono,
    fontWeight: '900',
  },

  // Upload box
  uploadBox: {
    height: 80,
    borderWidth: 1.5,
    borderColor: colors.sky,
    borderStyle: 'dashed',
    borderRadius: 8,
    backgroundColor: colors.paper,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  uploadText: {
    color: colors.teal,
    fontSize: 12,
    marginTop: 4,
  },
  lockIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
  },

  // Color row
  colorRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  colorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Toggle rows
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.sky,
  },
  toggleLeft: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'center',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.sky,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textColumn: {
    flex: 1,
  },
  toggleLabel: {
    color: colors.navy,
    fontSize: 14,
    fontWeight: '800',
  },
  toggleSub: {
    color: colors.teal,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },

  // Switch
  switchTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: 'center',
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.white,
  },

  // Active pill
  activePill: {
    flexDirection: 'row',
    backgroundColor: colors.sky,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    gap: 4,
  },
  activeText: {
    color: colors.navy,
    fontSize: 9,
    letterSpacing: 0.5,
    fontWeight: '900',
  },

  // Submit button
  button: {
    backgroundColor: colors.navy,
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 24,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1,
  },
});
