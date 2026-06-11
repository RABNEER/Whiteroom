import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Image,
  Linking,
} from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowLeft,
  Shield,
  School,
  Users,
  Check,
  EyeOff,
  Trash2,
  MessageCircle,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { OTPVerifyResponse } from '@whiteroom/shared';

import { api, ApiError } from '@/api/client';
import { useSession } from '@/auth/session-store';
import { colors, spacing } from '@/theme/tokens';
import LogoImage from '../../src/assets/logo.png';

type Step = 'SPLASH' | 'WELCOME' | 'PHONE' | 'CONSENT' | 'ROLE_SELECT' | 'WHATSAPP_POLL';
type Role = 'teacher' | 'parent';

export default function AuthScreen() {
  const setSession = useSession((s) => s.setSession);

  // State Machine
  const [step, setStep] = useState<Step>('SPLASH');
  const [phone, setPhone] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role>('teacher');
  const [inviteCode, setInviteCode] = useState('');
  const [studentName, setStudentName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [currentSlide, setCurrentSlide] = useState(0);
  const [loading, setLoading] = useState(false);
  const [registrationToken, setRegistrationToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolvedTenant, setResolvedTenant] = useState<string | null>(null);

  // WhatsApp verification state
  const [whatsappSessionId, setWhatsappSessionId] = useState<string | null>(null);
  const [whatsappToken, setWhatsappToken] = useState<string | null>(null);
  const [whatsappTimer, setWhatsappTimer] = useState(300);

  // Splash dot animations (plain state — no reanimated needed)
  const [activeDot, setActiveDot] = useState(0);

  useEffect(() => {
    if (step !== 'SPLASH') return;
    const dotInterval = setInterval(() => {
      setActiveDot((d) => (d + 1) % 3);
    }, 400);
    const timer = setTimeout(() => setStep('WELCOME'), 2000);
    return () => {
      clearInterval(dotInterval);
      clearTimeout(timer);
    };
  }, [step]);

  // WhatsApp countdown timer
  useEffect(() => {
    if (step !== 'WHATSAPP_POLL' || whatsappTimer <= 0) {
      if (step === 'WHATSAPP_POLL' && whatsappTimer <= 0) {
        setError('Verification session expired. Please try again.');
        setStep('PHONE');
      }
      return;
    }
    const interval = setInterval(() => setWhatsappTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [step, whatsappTimer]);

  // WhatsApp verification polling
  useEffect(() => {
    if (step !== 'WHATSAPP_POLL' || !whatsappSessionId || !whatsappToken || whatsappTimer <= 0) return;

    let active = true;
    const pollInterval = setInterval(async () => {
      try {
        const response = await api.whatsappSessionGet(whatsappSessionId);
        if (!active) return;

        if (response.verified) {
          clearInterval(pollInterval);
          handleVerifyWhatsApp();
        } else if (response.isExpired) {
          clearInterval(pollInterval);
          setError("Verification session expired. Please try again.");
          setStep('PHONE');
        }
      } catch (err) {
        console.error("[WHATSAPP POLL ERROR]", err);
      }
    }, 2000);

    return () => {
      active = false;
      clearInterval(pollInterval);
    };
  }, [step, whatsappSessionId, whatsappToken, whatsappTimer]);

  // Mutations
  const registerMutation = useMutation({
    mutationFn: (params: {
      registrationToken: string;
      role: Role;
      consentAccepted: boolean;
      inviteCode?: string;
      studentName?: string;
      rollNumber?: string;
    }) => api.register(params),
    onSuccess: async (data) => {
      setError(null);
      await setSession(data);
      router.replace(selectedRole === 'parent' ? '/parent' : '/teacher');
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : 'Registration failed');
      if (err instanceof ApiError && err.code === 'OTP_EXPIRED') {
        setRegistrationToken(null);
        setStep('PHONE');
        setError('Session expired. Please verify again.');
      }
    },
  });

  const resolveInviteMutation = useMutation({
    mutationFn: (code: string) => api.inviteResolve(code),
    onSuccess: (data) => {
      setResolvedTenant(data.tenantName);
      setError(null);
    },
    onError: (err: unknown) => {
      setResolvedTenant(null);
      setError(err instanceof ApiError ? err.message : 'Invalid invite code');
    },
  });

  const handleStartWhatsAppFlow = async () => {
    const rawPhone = phone.replace(/\D/g, '');
    if (rawPhone.length !== 10) {
      setError('Please enter a valid 10-digit mobile number first.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const formattedPhone = `+91${rawPhone}`;
      const session = await api.whatsappSessionCreate(formattedPhone);
      setWhatsappSessionId(session.id);
      setWhatsappToken(session.token);
      setWhatsappTimer(session.expiresIn || 300);
      setStep('WHATSAPP_POLL');

      const botNumber = process.env.EXPO_PUBLIC_WHATSAPP_BOT_NUMBER || "+919999999999";
      const cleanBotNumber = botNumber.replace(/\+/g, '');
      const messageText = `Verify my device: ${session.id}`;
      const url = `https://wa.me/${cleanBotNumber}?text=${encodeURIComponent(messageText)}`;

      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        // Fallback if Linking fails (like on some Web / simulator environments)
        await Linking.openURL(url);
      }
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to start WhatsApp verification.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyWhatsApp = async () => {
    if (!whatsappSessionId || !whatsappToken) return;
    try {
      setLoading(true);
      setError(null);

      const response = await api.whatsappVerify({
        id: whatsappSessionId,
        token: whatsappToken,
        inviteCode: inviteCode || undefined,
      });

      if (response.type === 'existing_user') {
        await setSession(response as any);
        router.replace('/');
      } else if (response.type === 'new_user') {
        setRegistrationToken(response.registrationToken);
        setStep('CONSENT');
      }
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'WhatsApp verification failed. Please try again.');
      setStep('PHONE');
    } finally {
      setLoading(false);
    }
  };

  const handleReopenWhatsApp = async () => {
    if (!whatsappSessionId) return;
    const botNumber = process.env.EXPO_PUBLIC_WHATSAPP_BOT_NUMBER || "+919999999999";
    const cleanBotNumber = botNumber.replace(/\+/g, '');
    const url = `https://wa.me/${cleanBotNumber}?text=${encodeURIComponent(`Verify my device: ${whatsappSessionId}`)}`;
    await Linking.openURL(url);
  };

  // Handlers
  const handleInviteCodeChange = (code: string) => {
    const upper = code.toUpperCase();
    setInviteCode(upper);
    if (upper.length === 6) {
      resolveInviteMutation.mutate(upper);
    } else {
      setResolvedTenant(null);
    }
  };

  const handleFinalSubmit = () => {
    if (registrationToken === 'dev-bypass-token') {
      const mockSession: OTPVerifyResponse = {
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        user: {
          id: 'mock-user-id',
          role: selectedRole,
          tenantId: 'mock-tenant-id',
          tenants: [{
            tenantId: 'mock-tenant-id',
            role: selectedRole,
            status: 'active',
            tenantName: resolvedTenant || 'Mock Institute',
          }],
        },
        isNewUser: true,
      };
      setSession(mockSession).then(() => {
        router.replace(selectedRole === 'parent' ? '/parent' : '/tenant-init');
      });
      return;
    }

    if (!registrationToken) {
      setError('Registration session not found. Please restart.');
      return;
    }

    registerMutation.mutate({
      registrationToken,
      role: selectedRole,
      consentAccepted: agreed,
      inviteCode: selectedRole === 'parent' ? inviteCode : undefined,
      studentName: selectedRole === 'parent' ? studentName : undefined,
      rollNumber: selectedRole === 'parent' ? rollNumber : undefined,
    });
  };

  // ─── S1: Splash ──────────────────────────────────────────────────────────────
  if (step === 'SPLASH') {
    return (
      <View style={[styles.container, styles.splashContainer]}>
        <View style={styles.splashLogo}>
          <Image source={LogoImage} style={{ width: 32, height: 32 }} resizeMode="contain" />
        </View>
        <Text style={styles.splashWordmark}>WHITEROOM</Text>
        <Text style={styles.splashTagline}>SCHOOL · TUITION · COACHING</Text>
        <View style={styles.splashDotRow}>
          <View style={[styles.splashDot, { opacity: activeDot === 0 ? 1 : 0.2 }]} />
          <View style={[styles.splashDot, { opacity: activeDot === 1 ? 1 : 0.2 }]} />
          <View style={[styles.splashDot, { opacity: activeDot === 2 ? 1 : 0.2 }]} />
        </View>
      </View>
    );
  }

  // ─── S2: Welcome Carousel ────────────────────────────────────────────────────
  if (step === 'WELCOME') {
    const slides = [
      {
        icon: School,
        title: 'One app for all\nyour classes',
        body: 'No more juggling WhatsApp groups for every class your child attends.',
      },
      {
        icon: Shield,
        title: 'Instant absent\nalerts',
        body: 'Know the moment your child is marked absent. Real-time, every time.',
      },
      {
        icon: Users,
        title: 'Mark attendance\nin seconds',
        body: 'Teachers: take attendance for 30 students in under a minute. Default present, tap to mark absent.',
      },
    ];
    const current = slides[currentSlide];
    const SlideIcon = current.icon;

    return (
      <View style={styles.container}>
        <View style={styles.welcomeTop}>
          <Text style={styles.slideCounter}>SLIDE {currentSlide + 1} OF 3</Text>
          <View style={styles.welcomeIconCard}>
            <SlideIcon color={colors.teal} size={32} />
          </View>
          <Text style={styles.welcomeTitle}>{current.title}</Text>
        </View>
        <View style={styles.welcomeBottom}>
          <Text style={styles.welcomeBody}>{current.body}</Text>
          <View style={styles.carouselDots}>
            {slides.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.carouselDot,
                  i === currentSlide
                    ? styles.carouselDotActive
                    : { backgroundColor: colors.sky, width: 8 },
                ]}
              />
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            style={styles.primaryButton}
            onPress={() => {
              if (currentSlide < 2) setCurrentSlide((s) => s + 1);
              else setStep('PHONE');
            }}
          >
            <Text style={styles.buttonText}>
              {currentSlide === 2 ? 'GET STARTED' : 'NEXT'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setStep('PHONE')}
            style={styles.skipLink}
          >
            <Text style={styles.skipText}>SKIP</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ─── S3–S6: Form Screens ─────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back button — hidden on Consent */}
          {step !== 'CONSENT' && (
            <Pressable
              accessibilityRole="button"
              style={styles.backButton}
              onPress={() => {
                if (step === 'PHONE') setStep('WELCOME');
                else if (step === 'WHATSAPP_POLL') setStep('PHONE');
                else if (step === 'ROLE_SELECT') setStep('CONSENT');
              }}
            >
              <ArrowLeft color={colors.teal} size={20} />
            </Pressable>
          )}

          {/* ─── S3: Phone ─────────────────────────────────────────────────── */}
          {step === 'PHONE' && (
            <>
              <Text style={styles.eyebrow}>STEP 1 OF 2</Text>
              <Text style={styles.pageTitle}>Verify your identity</Text>
              <Text style={styles.pageSub}>
                Enter your mobile number to get started.
              </Text>

              <Text style={[styles.fieldLabel, { marginTop: spacing.sm }]}>
                MOBILE NUMBER
              </Text>
              <View style={styles.phoneRow}>
                <View style={styles.countryChip}>
                  <Text style={styles.chipText}>🇮🇳 +91</Text>
                </View>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="98765 43210"
                  placeholderTextColor={colors.teal}
                  keyboardType="number-pad"
                  maxLength={10}
                  value={phone}
                  onChangeText={setPhone}
                />
              </View>
              <Text style={styles.hintText}>10-digit Indian mobile number</Text>

              {error && (
                <View style={styles.errorStrip}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {/* WhatsApp Verification Option */}
              <Pressable
                accessibilityRole="button"
                style={[
                  styles.primaryButton,
                  { backgroundColor: '#25D366', flexDirection: 'row', gap: 8, marginTop: spacing.lg },
                  phone.replace(/\D/g, '').length !== 10 && { opacity: 0.5 },
                ]}
                disabled={phone.replace(/\D/g, '').length !== 10 || loading}
                onPress={handleStartWhatsAppFlow}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <MessageCircle color="#FFF" size={20} />
                    <Text style={styles.buttonText}>VERIFY VIA WHATSAPP (1-TAP)</Text>
                  </>
                )}
              </Pressable>

              <Text style={styles.footerText}>
                By continuing you agree to our{' '}
                <Text style={styles.linkText}>Terms</Text> &{' '}
                <Text style={styles.linkText}>Privacy Policy</Text>
              </Text>
              <View style={styles.trustStrip}>
                <Shield color={colors.teal} size={14} />
                <Text style={styles.trustText}>DPDP Act 2023 Compliant</Text>
              </View>
            </>
          )}

          {/* ─── WhatsApp Poll Step ─── */}
          {step === 'WHATSAPP_POLL' && (
            <>
              <View style={styles.whatsappPollCard}>
                <View style={styles.whatsappIconCircle}>
                  <MessageCircle color="#FFF" size={36} />
                </View>
                <Text style={styles.pollTitle}>Verifying your number...</Text>
                <Text style={styles.pollSub}>
                  We opened WhatsApp. Send the pre-filled verification code message from your phone.
                </Text>
                
                <View style={styles.codeBanner}>
                  <Text style={styles.codeText}>Code: {whatsappSessionId}</Text>
                </View>

                {error && (
                  <View style={[styles.errorStrip, { marginTop: spacing.md, width: '100%' }]}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                <View style={styles.pollLoaderRow}>
                  <ActivityIndicator color={colors.navy} size="small" />
                  <Text style={styles.pollLoaderText}>
                    Waiting for you to send the message...
                  </Text>
                </View>

                <Text style={styles.pollTimerText}>
                  Valid for: {Math.floor(whatsappTimer / 60)}:{(whatsappTimer % 60).toString().padStart(2, '0')}
                </Text>

                <Pressable
                  accessibilityRole="button"
                  style={[styles.primaryButton, { backgroundColor: '#25D366', marginTop: spacing.lg, flexDirection: 'row', gap: 8 }]}
                  onPress={handleReopenWhatsApp}
                >
                  <MessageCircle color="#FFF" size={20} />
                  <Text style={styles.buttonText}>REOPEN WHATSAPP 📱</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  style={[styles.skipLink, { marginTop: spacing.md }]}
                  onPress={() => {
                    setError(null);
                    setStep('PHONE');
                  }}
                >
                  <Text style={[styles.skipText, { color: colors.danger, fontWeight: '600' }]}>
                    CANCEL
                  </Text>
                </Pressable>
              </View>
            </>
          )}



          {/* ─── S5: Consent ───────────────────────────────────────────────── */}
          {step === 'CONSENT' && (
            <>
              <View style={styles.consentIconBox}>
                <Shield color={colors.navy} size={28} />
              </View>
              <Text style={styles.consentEyebrow}>PRIVACY FIRST</Text>
              <Text style={styles.consentTitle}>Your data, your rights</Text>
              <Text style={styles.consentSub}>
                Here's exactly what we collect and why.
              </Text>

              <View style={styles.consentCard}>
                <View style={styles.consentIconCircle}>
                  <Users color={colors.teal} size={18} />
                </View>
                <Text style={styles.consentText}>
                  Your name and phone number are stored on secure Indian servers
                  (Mumbai).
                </Text>
              </View>

              <View style={styles.consentCard}>
                <View style={styles.consentIconCircle}>
                  <EyeOff color={colors.teal} size={18} />
                </View>
                <Text style={styles.consentText}>
                  Your child's attendance is visible only to you and their
                  teacher. Never public.
                </Text>
              </View>

              <View style={styles.consentCard}>
                <View style={styles.consentIconCircle}>
                  <Trash2 color={colors.teal} size={18} />
                </View>
                <Text style={styles.consentText}>
                  You can delete all your data anytime from Settings.
                </Text>
              </View>

              <View style={styles.consentDivider} />

              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: agreed }}
                style={styles.checkboxRow}
                onPress={() => setAgreed((a) => !a)}
              >
                <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
                  {agreed && <Check color="#FFF" size={12} strokeWidth={3} />}
                </View>
                <Text style={styles.checkboxLabel}>
                  I understand and agree to Whiteroom's data practices under the
                  DPDP Act 2023.
                </Text>
              </Pressable>

              {error && (
                <View style={styles.errorStrip}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <Pressable
                accessibilityRole="button"
                style={[styles.primaryButton, !agreed && { opacity: 0.4 }]}
                disabled={!agreed}
                onPress={() => setStep('ROLE_SELECT')}
              >
                <Text style={styles.buttonText}>I AGREE & CONTINUE →</Text>
              </Pressable>
            </>
          )}

          {/* ─── S6: Role Select ───────────────────────────────────────────── */}
          {step === 'ROLE_SELECT' && (
            <>
              <Text style={styles.eyebrow}>ALMOST THERE</Text>
              <Text style={styles.pageTitle}>How will you use Whiteroom?</Text>
              <Text style={styles.pageSub}>Choose your role to get started.</Text>

              {error && (
                <View style={styles.errorStrip}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {/* Teacher card */}
              <Pressable
                accessibilityRole="button"
                style={[
                  styles.roleCard,
                  selectedRole === 'teacher' && styles.roleCardSelected,
                ]}
                onPress={() => setSelectedRole('teacher')}
              >
                <View style={[styles.roleIconBox, { backgroundColor: colors.navy }]}>
                  <Text style={styles.roleIconText}>T</Text>
                </View>
                <View style={styles.roleContent}>
                  <Text style={styles.roleName}>Teacher / Institute</Text>
                  <Text style={styles.roleDesc}>
                    Create classrooms, mark attendance, post announcements.
                  </Text>
                </View>
              </Pressable>

              {/* Parent card */}
              <Pressable
                accessibilityRole="button"
                style={[
                  styles.roleCard,
                  selectedRole === 'parent' && styles.roleCardSelected,
                ]}
                onPress={() => setSelectedRole('parent')}
              >
                <View style={[styles.roleIconBox, { backgroundColor: colors.teal }]}>
                  <Text style={styles.roleIconText}>P</Text>
                </View>
                <View style={styles.roleContent}>
                  <Text style={styles.roleName}>Parent / Guardian</Text>
                  <Text style={styles.roleDesc}>
                    Join your child's class, get absent alerts, see announcements.
                  </Text>
                </View>
              </Pressable>

              {/* Role-specific section */}
              {selectedRole === 'parent' ? (
                <View style={styles.roleMetaSection}>
                  <View style={styles.roleInfoBox}>
                    <Text style={styles.roleInfoText}>
                      Parents join via an invite link from their teacher. Enter
                      the 6-character invite code below.
                    </Text>
                  </View>

                  <Text style={[styles.fieldLabel, { marginBottom: spacing.sm }]}>
                    INVITE CODE
                  </Text>
                  <TextInput
                    style={styles.plainInput}
                    placeholder="ABC123"
                    placeholderTextColor={colors.teal}
                    autoCapitalize="characters"
                    maxLength={6}
                    value={inviteCode}
                    onChangeText={handleInviteCodeChange}
                  />

                  {resolveInviteMutation.isPending && (
                    <ActivityIndicator
                      color={colors.teal}
                      style={{ marginTop: 8 }}
                    />
                  )}

                  {resolvedTenant && (
                    <View style={styles.resolvedStrip}>
                      <Text style={styles.resolvedTenantName}>
                        {resolvedTenant}
                      </Text>
                      <Text style={styles.resolvedVerified}>✓ Verified</Text>
                    </View>
                  )}

                  <Text style={[styles.fieldLabel, { marginTop: spacing.md, marginBottom: spacing.sm }]}>
                    STUDENT NAME (OPTIONAL)
                  </Text>
                  <TextInput
                    style={styles.plainInput}
                    placeholder="Rahul Kumar"
                    placeholderTextColor={colors.teal}
                    value={studentName}
                    onChangeText={setStudentName}
                  />

                  <Text style={[styles.fieldLabel, { marginTop: spacing.md, marginBottom: spacing.sm }]}>
                    ROLL NUMBER (OPTIONAL)
                  </Text>
                  <TextInput
                    style={styles.plainInput}
                    placeholder="e.g. 07"
                    placeholderTextColor={colors.teal}
                    value={rollNumber}
                    onChangeText={setRollNumber}
                  />
                </View>
              ) : (
                <View style={styles.roleInfoBox}>
                  <Text style={styles.roleInfoText}>
                    You'll set up your institution on the next screen.
                  </Text>
                </View>
              )}

              <Pressable
                accessibilityRole="button"
                style={[
                  styles.primaryButton,
                  { marginTop: spacing.md },
                  (selectedRole === 'parent' && !resolvedTenant) ||
                    registerMutation.isPending
                    ? { opacity: 0.5 }
                    : {},
                ]}
                disabled={
                  (selectedRole === 'parent' && !resolvedTenant) ||
                  registerMutation.isPending
                }
                onPress={handleFinalSubmit}
              >
                {registerMutation.isPending ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.buttonText}>
                    {selectedRole === 'teacher'
                      ? 'CONTINUE AS TEACHER →'
                      : 'CONTINUE AS PARENT →'}
                  </Text>
                )}
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ─── Base ──────────────────────────────────────────────────────────────────
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },

  // ─── S1 Splash ─────────────────────────────────────────────────────────────
  splashContainer: {
    backgroundColor: colors.navy,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashLogo: {
    width: 40,
    height: 40,
    backgroundColor: '#FFF',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashLogoText: {
    color: colors.navy,
    fontWeight: '700',
    fontSize: 18,
  },
  splashWordmark: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 16,
  },
  splashTagline: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 9,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  splashDotRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 32,
  },
  splashDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.sky,
  },

  // ─── S2 Welcome ────────────────────────────────────────────────────────────
  welcomeTop: {
    flex: 0.55,
    backgroundColor: colors.navy,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  slideCounter: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
    position: 'absolute',
    top: 60,
  },
  welcomeIconCard: {
    width: 72,
    height: 72,
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.sky,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  welcomeTitle: {
    color: '#FFF',
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 34,
  },
  welcomeBottom: {
    flex: 0.45,
    paddingHorizontal: 40,
    paddingTop: 32,
    alignItems: 'center',
  },
  welcomeBody: {
    color: colors.teal,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
  carouselDots: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 32,
  },
  carouselDot: {
    height: 8,
    borderRadius: 4,
  },
  carouselDotActive: {
    width: 18,
    backgroundColor: colors.navy,
  },
  skipLink: {
    marginTop: 16,
  },
  skipText: {
    color: colors.teal,
    fontSize: 10,
    letterSpacing: 1,
  },

  // ─── S3–S6 Form Shared ─────────────────────────────────────────────────────
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 48,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: colors.sky,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  eyebrow: {
    color: colors.teal,
    fontSize: 9,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  pageTitle: {
    color: colors.navy,
    fontSize: 24,
    fontWeight: '700',
    marginTop: 4,
  },
  pageSub: {
    color: colors.teal,
    fontSize: 13,
    marginTop: 4,
    marginBottom: 32,
  },
  fieldLabel: {
    color: colors.teal,
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  primaryButton: {
    backgroundColor: colors.navy,
    borderRadius: 12,
    height: 48,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1,
  },
  errorStrip: {
    backgroundColor: colors.danger,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#FFF',
    fontSize: 12,
    textAlign: 'center',
  },

  // ─── S3 Phone ──────────────────────────────────────────────────────────────
  phoneRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  countryChip: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: colors.sky,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  chipText: {
    color: colors.navy,
    fontSize: 14,
    fontWeight: '600',
  },
  phoneInput: {
    flex: 1,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: colors.sky,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.navy,
    height: 48,
  },
  hintText: {
    color: colors.teal,
    fontSize: 11,
    marginBottom: 8,
  },
  footerText: {
    color: colors.teal,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 24,
  },
  linkText: {
    textDecorationLine: 'underline',
    color: colors.teal,
  },
  trustStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 8,
  },
  trustText: {
    color: colors.teal,
    fontSize: 10,
  },

  // ─── S4 OTP ────────────────────────────────────────────────────────────────
  otpGrid: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  otpBox: {
    width: 44,
    height: 52,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: colors.sky,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpBoxActive: {
    borderColor: colors.navy,
    borderWidth: 2,
  },
  otpBoxFilled: {
    backgroundColor: colors.sky,
    borderColor: colors.teal,
  },
  otpDigit: {
    color: colors.navy,
    fontSize: 20,
    fontWeight: '700',
  },
  hiddenInput: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    opacity: 0,
    height: 52,
  },
  timerRow: {
    alignItems: 'center',
    marginBottom: 24,
  },
  timerText: {
    color: colors.teal,
    fontSize: 12,
  },
  resendLink: {
    fontWeight: '600',
  },
  attemptsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 32,
  },
  attemptDots: {
    flexDirection: 'row',
    gap: 4,
  },
  attemptDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  attemptDotEmpty: {
    borderColor: colors.sky,
    borderWidth: 1,
  },
  attemptsLabel: {
    color: colors.teal,
    fontSize: 10,
  },

  // ─── S5 Consent ────────────────────────────────────────────────────────────
  consentIconBox: {
    width: 52,
    height: 52,
    backgroundColor: colors.sky,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  consentEyebrow: {
    color: colors.teal,
    fontSize: 9,
    letterSpacing: 3,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  consentTitle: {
    color: colors.navy,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
  },
  consentSub: {
    color: colors.teal,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 32,
  },
  consentCard: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: colors.sky,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  consentIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.sky,
    justifyContent: 'center',
    alignItems: 'center',
  },
  consentText: {
    color: colors.navy,
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  consentDivider: {
    height: 1,
    backgroundColor: colors.sky,
    marginVertical: 20,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 32,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 1,
    borderColor: colors.sky,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  checkboxLabel: {
    color: colors.navy,
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },

  // ─── S6 Role Select ────────────────────────────────────────────────────────
  roleCard: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: colors.sky,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 12,
  },
  roleCardSelected: {
    borderWidth: 2,
    borderColor: colors.navy,
    backgroundColor: colors.sky,
  },
  roleIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleIconText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 18,
  },
  roleContent: {
    flex: 1,
  },
  roleName: {
    color: colors.navy,
    fontSize: 15,
    fontWeight: '700',
  },
  roleDesc: {
    color: colors.teal,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  roleMetaSection: {
    marginTop: 8,
  },
  roleInfoBox: {
    backgroundColor: colors.sky,
    borderRadius: 10,
    padding: 12,
    marginBottom: 24,
    marginTop: 8,
  },
  roleInfoText: {
    color: colors.teal,
    fontSize: 12,
    lineHeight: 17,
  },
  plainInput: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: colors.sky,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 16,
    color: colors.navy,
    marginBottom: 4,
  },
  resolvedStrip: {
    backgroundColor: '#FFF',
    borderLeftWidth: 3,
    borderLeftColor: colors.navy,
    padding: 12,
    borderRadius: 4,
    marginTop: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.sky,
  },
  resolvedTenantName: {
    fontWeight: '700',
    color: colors.navy,
    fontSize: 14,
  },
  resolvedVerified: {
    color: colors.teal,
    fontSize: 12,
  },

  // ── DEV bypass hint (only rendered in __DEV__ builds) ──────────────────────
  devBypassHint: {
    backgroundColor: '#FFF3CD',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  devBypassText: {
    color: '#92400E',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  // ─── WhatsApp verification UI styles ───
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.sky,
  },
  orText: {
    color: colors.teal,
    fontSize: 10,
    fontWeight: '600',
    paddingHorizontal: 10,
    letterSpacing: 1,
  },
  whatsappPollCard: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: colors.sky,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 2,
  },
  whatsappIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#25D366',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  pollTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.navy,
    marginBottom: 8,
  },
  pollSub: {
    fontSize: 13,
    color: colors.teal,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  codeBanner: {
    backgroundColor: colors.sky,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 20,
  },
  codeText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy,
    letterSpacing: 1,
  },
  pollLoaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  pollLoaderText: {
    fontSize: 12,
    color: colors.teal,
  },
  pollTimerText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.navy,
    marginBottom: 16,
  },
});
