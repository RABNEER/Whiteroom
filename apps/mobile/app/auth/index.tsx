import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  AppState,
  Linking,
  Alert,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { router, useLocalSearchParams } from 'expo-router';
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
type Role = 'school_admin' | 'teacher' | 'parent';

export default function AuthScreen() {
  const setSession = useSession((s) => s.setSession);
  const params = useLocalSearchParams<{ inviteCode?: string; role?: Role }>();

  // State Machine
  const [step, setStep] = useState<Step>('SPLASH');
  const [phone, setPhone] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role>('school_admin');
  const [inviteCode, setInviteCode] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [designation, setDesignation] = useState('');
  const [studentName, setStudentName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [name, setName] = useState('');
  const [currentSlide, setCurrentSlide] = useState(0);
  const [loading, setLoading] = useState(false);
  const [registrationToken, setRegistrationToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolvedTenant, setResolvedTenant] = useState<string | null>(null);

  // WhatsApp verification state
  const [whatsappSessionId, setWhatsappSessionId] = useState<string | null>(null);
  const [whatsappToken, setWhatsappToken] = useState<string | null>(null);
  const [whatsappTimer, setWhatsappTimer] = useState(300);
  const [whatsappExpiresAt, setWhatsappExpiresAt] = useState<number | null>(null);
  const verifyingRef = useRef(false);

  // Pending WhatsApp session persistence keys
  const PENDING_WHATSAPP_SESSION_ID_KEY = 'whiteroom.pendingWhatsappSessionId';
  const PENDING_WHATSAPP_SESSION_TOKEN_KEY = 'whiteroom.pendingWhatsappSessionToken';
  const PENDING_WHATSAPP_SESSION_EXPIRES_AT_KEY = 'whiteroom.pendingWhatsappSessionExpiresAt';

  const secureStorage = {
    async getItem(key: string) {
      if (Platform.OS !== 'web') {
        return SecureStore.getItemAsync(key);
      }
      return globalThis.localStorage?.getItem(key) ?? null;
    },
    async setItem(key: string, value: string) {
      if (Platform.OS !== 'web') {
        await SecureStore.setItemAsync(key, value);
        return;
      }
      globalThis.localStorage?.setItem(key, value);
    },
    async deleteItem(key: string) {
      if (Platform.OS !== 'web') {
        await SecureStore.deleteItemAsync(key);
        return;
      }
      globalThis.localStorage?.removeItem(key);
    },
  };

  const clearPendingSession = async () => {
    setWhatsappExpiresAt(null);
    try {
      await Promise.all([
        secureStorage.deleteItem(PENDING_WHATSAPP_SESSION_ID_KEY),
        secureStorage.deleteItem(PENDING_WHATSAPP_SESSION_TOKEN_KEY),
        secureStorage.deleteItem(PENDING_WHATSAPP_SESSION_EXPIRES_AT_KEY),
      ]);
    } catch (err) {
      console.error("Failed to clear pending WhatsApp session:", err);
    }
  };

  // Splash dot animations (plain state  no reanimated needed)
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

  // Load pending WhatsApp session on mount
  useEffect(() => {
    const loadPendingSession = async () => {
      try {
        const id = await secureStorage.getItem(PENDING_WHATSAPP_SESSION_ID_KEY);
        const token = await secureStorage.getItem(PENDING_WHATSAPP_SESSION_TOKEN_KEY);
        const expiresAtStr = await secureStorage.getItem(PENDING_WHATSAPP_SESSION_EXPIRES_AT_KEY);

        if (id && token && expiresAtStr) {
          const expiresAt = parseInt(expiresAtStr, 10);
          const now = Date.now();
          if (expiresAt > now) {
            const remaining = Math.floor((expiresAt - now) / 1000);
            setWhatsappSessionId(id);
            setWhatsappToken(token);
            setWhatsappTimer(remaining);
            setWhatsappExpiresAt(expiresAt);
            setStep('WHATSAPP_POLL');
          } else {
            await clearPendingSession();
          }
        }
      } catch (err) {
        console.error("Failed to load pending WhatsApp session:", err);
      }
    };

    loadPendingSession();
  }, []);

  // WhatsApp countdown timer (handles background app pauses gracefully using absolute expiresAt)
  useEffect(() => {
    if (step !== 'WHATSAPP_POLL' || !whatsappExpiresAt) return;

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((whatsappExpiresAt - now) / 1000));
      setWhatsappTimer(remaining);

      if (remaining <= 0) {
        setError('Verification session expired. Please try again.');
        clearPendingSession();
        setStep('PHONE');
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [step, whatsappExpiresAt]);

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

  const handleRoleTabChange = (role: Role) => {
    setSelectedRole(role);
    setInviteCode('');
    setResolvedTenant(null);
    resolveInviteMutation.reset();
  };

  // Handle incoming deep links and route parameters to auto-fill invite code & role
  useEffect(() => {
    function handleDeepLink(url: string | null) {
      if (!url) return;
      // Parse role from query params (e.g. ?role=teacher)
      const roleMatch = url.match(/[?&]role=(teacher|parent|school_admin)/);
      if (roleMatch) {
        setSelectedRole(roleMatch[1] as Role);
      }
      const match =
        // Universal Link: https://apps.whiteroom.co.in/invite/CODE or https://whiteroom.co.in/invite/CODE
        url.match(/apps\.whiteroom\.co\.in\/invite\/([A-Za-z0-9]{6})/) ||
        url.match(/whiteroom\.co\.in\/invite\/([A-Za-z0-9]{6})/) ||
        // Custom scheme fallback: whiteroom://auth?inviteCode=CODE or whiteroom://invite/CODE
        url.match(/whiteroom:\/\/invite\/([A-Za-z0-9]{6})/) ||
        url.match(/[?&]inviteCode=([A-Za-z0-9]{6})/);
      if (match) {
        const upper = match[1].toUpperCase();
        setInviteCode(upper);
        if (upper.length === 6) {
          const { accessToken } = useSession.getState();
          if (accessToken) {
            api.inviteJoin({ inviteCode: upper, role: selectedRole })
              .then(data => {
                setSession(data);
                router.replace('/');
              })
              .catch(err => {
                console.error("Auto join error:", err);
                resolveInviteMutation.mutate(upper);
              });
          } else {
            resolveInviteMutation.mutate(upper);
          }
        }
      }
    }

    if (params.inviteCode || params.role) {
      if (params.role && (params.role === 'teacher' || params.role === 'parent' || params.role === 'school_admin')) {
        setSelectedRole(params.role);
      }
      if (params.inviteCode) {
        const upper = params.inviteCode.toUpperCase();
        setInviteCode(upper);
        if (upper.length === 6) {
          const { accessToken } = useSession.getState();
          if (accessToken) {
            api.inviteJoin({ inviteCode: upper, role: params.role || selectedRole })
              .then(data => {
                setSession(data);
                router.replace('/');
              })
              .catch(err => {
                console.error("Auto join error:", err);
                resolveInviteMutation.mutate(upper);
              });
          } else {
            resolveInviteMutation.mutate(upper);
          }
        }
      }
    } else {
      Linking.getInitialURL().then(handleDeepLink);
    }

    const sub = Linking.addEventListener('url', (e) => handleDeepLink(e.url));
    return () => sub.remove();
  }, [params.inviteCode, params.role, selectedRole, setSession]);


  const handleVerifyWhatsApp = useCallback(async () => {
    if (!whatsappSessionId || !whatsappToken) return;
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    try {
      setLoading(true);
      setError(null);

      const response = await api.whatsappVerify({
        id: whatsappSessionId,
        token: whatsappToken,
        inviteCode: inviteCode || undefined,
        role: inviteCode ? selectedRole : undefined,
      });

      await clearPendingSession();

      if (response.type === 'existing_user') {
        await setSession(response as any);
        router.replace('/');
      } else if (response.type === 'new_user') {
        setRegistrationToken(response.registrationToken);
        setStep('CONSENT');
      }
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'WhatsApp verification failed. Please try again.');
      await clearPendingSession();
      setStep('PHONE');
    } finally {
      setLoading(false);
      verifyingRef.current = false;
    }
  }, [whatsappSessionId, whatsappToken, inviteCode, selectedRole, setSession]);

  // Check active session status once
  const checkActiveSession = useCallback(async () => {
    if (!whatsappSessionId || !whatsappToken) return false;
    try {
      const response = await api.whatsappSessionGet(whatsappSessionId);
      if (response.verified) {
        setError(null);
        await handleVerifyWhatsApp();
        return true;
      } else if (response.isExpired) {
        setError("Verification session expired. Please try again.");
        await clearPendingSession();
        setStep('PHONE');
        return true;
      }
    } catch (err) {
      console.error("[WHATSAPP CHECK ERROR]", err);
      setError("Connection error. Checking status again soon...");
    }
    return false;
  }, [whatsappSessionId, whatsappToken, handleVerifyWhatsApp]);

  // AppState listener to check status immediately when returning to foreground
  useEffect(() => {
    if (step !== 'WHATSAPP_POLL' || !whatsappSessionId) return;

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        checkActiveSession();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [step, whatsappSessionId, checkActiveSession]);

  // WhatsApp verification polling — skip when app is backgrounded (Bug 4 fix)
  useEffect(() => {
    if (step !== 'WHATSAPP_POLL' || !whatsappSessionId || !whatsappToken) return;

    let active = true;
    const pollInterval = setInterval(async () => {
      if (!active) return;
      // Don't poll while the app is in the background — the AppState listener handles foreground checks
      if (AppState.currentState !== 'active') return;
      const finished = await checkActiveSession();
      if (finished) {
        clearInterval(pollInterval);
      }
    }, 2000);

    return () => {
      active = false;
      clearInterval(pollInterval);
    };
  }, [step, whatsappSessionId, whatsappToken, checkActiveSession]);

  // Mutations
  const registerMutation = useMutation({
    mutationFn: (params: {
      registrationToken: string;
      role: Role;
      name?: string;
      consentAccepted: boolean;
      inviteCode?: string;
      schoolName?: string;
      designation?: string;
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
      const expiresAt = Date.now() + (session.expiresIn || 300) * 1000;
      setWhatsappExpiresAt(expiresAt);

      // Persist pending session
      await Promise.all([
        secureStorage.setItem(PENDING_WHATSAPP_SESSION_ID_KEY, session.id),
        secureStorage.setItem(PENDING_WHATSAPP_SESSION_TOKEN_KEY, session.token),
        secureStorage.setItem(PENDING_WHATSAPP_SESSION_EXPIRES_AT_KEY, expiresAt.toString()),
      ]).catch(err => console.error("Failed to save pending WhatsApp session:", err));

      // Redirect to WhatsApp bot (with hardcoded fallback to prevent build-time inlining issues)
      const botNumber = process.env.EXPO_PUBLIC_WHATSAPP_BOT_NUMBER || '+917667217247';
      const cleanBotNumber = botNumber.replace(/\D/g, '');
      const verificationMessage = `Verify ${session.id}`;
      const whatsappUrl = `whatsapp://send?phone=${cleanBotNumber}&text=${encodeURIComponent(verificationMessage)}`;
      const fallbackUrl = `https://wa.me/${cleanBotNumber}?text=${encodeURIComponent(verificationMessage)}`;

      console.log("[WHATSAPP REDIRECT] Launching WhatsApp URL:", whatsappUrl);
      
      Linking.openURL(whatsappUrl).catch(async (err) => {
        console.warn("[WHATSAPP REDIRECT] Failed to open native app protocol, attempting web fallback:", err);
        await Linking.openURL(fallbackUrl).catch((webErr) => {
          console.error("[WHATSAPP REDIRECT] Failed to open fallback link:", webErr);
        });
      });

      setStep('WHATSAPP_POLL');
    } catch (err: any) {
      console.error('[WHATSAPP FLOW ERROR]', {
        name: err?.name,
        message: err?.message,
        code: err?.code,
        status: err?.status,
        stack: err?.stack?.substring(0, 300),
      });

      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err?.message?.includes('Network request failed') || err?.message?.includes('Failed to fetch')) {
        setError('Network error — check your internet connection and try again.');
      } else if (err?.message?.includes('timeout') || err?.message?.includes('Timeout')) {
        setError('Server is taking too long to respond. Please try again in a moment.');
      } else {
        setError(`Failed to start WhatsApp verification: ${err?.message || 'Unknown error'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReopenWhatsApp = async () => {
    try {
      setLoading(true);
      setError(null);
      const verified = await checkActiveSession();
      if (!verified) {
        setError("Not verified yet. Please tap the confirmation button sent to your WhatsApp.");
      }
    } finally {
      setLoading(false);
    }
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
            tenantName: resolvedTenant || (selectedRole === 'school_admin' ? schoolName : 'Mock Institute'),
          }],
        },
        isNewUser: true,
      };
      setSession(mockSession).then(() => {
        router.replace(selectedRole === 'parent' ? '/parent' : '/teacher');
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
      name: name.trim() || undefined,
      consentAccepted: agreed,
      inviteCode: selectedRole !== 'school_admin' ? inviteCode : undefined,
      schoolName: selectedRole === 'school_admin' ? schoolName : undefined,
      designation: selectedRole === 'school_admin' ? designation : undefined,
      studentName: selectedRole === 'parent' ? studentName : undefined,
      rollNumber: selectedRole === 'parent' ? rollNumber : undefined,
    });
  };

  //  S1: Splash 
  if (step === 'SPLASH') {
    return (
      <View style={[styles.container, styles.splashContainer]}>
        <View style={styles.splashLogo}>
          <Image source={LogoImage} style={{ width: 32, height: 32 }} resizeMode="contain" />
        </View>
        <Text style={styles.splashWordmark}>WHITEROOM</Text>
        <Text style={styles.splashTagline}>SCHOOL / TUITION / COACHING</Text>
        <View style={styles.splashDotRow}>
          <View style={[styles.splashDot, { opacity: activeDot === 0 ? 1 : 0.2 }]} />
          <View style={[styles.splashDot, { opacity: activeDot === 1 ? 1 : 0.2 }]} />
          <View style={[styles.splashDot, { opacity: activeDot === 2 ? 1 : 0.2 }]} />
        </View>
      </View>
    );
  }

  //  S2: Welcome Carousel 
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

  //  S3S6: Form Screens 
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
          {/* Back button  hidden on Consent */}
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

          {/*  S3: Phone  */}
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
                  <Text style={styles.chipText}>+91</Text>
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
                    <Text style={styles.buttonText}>VERIFY PHONE</Text>
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

          {/*  WhatsApp Poll Step  */}
          {step === 'WHATSAPP_POLL' && (
            <>
              <View style={styles.whatsappPollCard}>
                <View style={styles.whatsappIconCircle}>
                  <MessageCircle color="#FFF" size={36} />
                </View>
                <Text style={styles.pollTitle}>Verifying your number...</Text>
                <Text style={styles.pollSub}>
                  Keep this screen open while we verify the session.
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
                    Checking verification status...
                  </Text>
                </View>

                <Text style={styles.pollTimerText}>
                  Valid for: {Math.floor(whatsappTimer / 60)}:{(whatsappTimer % 60).toString().padStart(2, '0')}
                </Text>

                <Pressable
                  accessibilityRole="button"
                  style={[
                    styles.primaryButton,
                    {
                      backgroundColor: '#25D366',
                      marginTop: spacing.lg,
                      flexDirection: 'row',
                      gap: 8,
                      opacity: loading ? 0.7 : 1,
                    },
                  ]}
                  onPress={handleReopenWhatsApp}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <ActivityIndicator color="#FFF" size="small" />
                      <Text style={styles.buttonText}>CHECKING...</Text>
                    </>
                  ) : (
                    <>
                      <MessageCircle color="#FFF" size={20} />
                      <Text style={styles.buttonText}>CHECK AGAIN</Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  style={[styles.skipLink, { marginTop: spacing.md }]}
                  onPress={async () => {
                    setError(null);
                    await clearPendingSession();
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



          {/*  S5: Consent  */}
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

              <View style={styles.consentCard}>
                <View style={styles.consentIconCircle}>
                  <Shield color={colors.teal} size={18} />
                </View>
                <Text style={styles.consentText}>
                  For compliance under FERPA/GDPR/DPDP, school admins have full visibility over all classroom discussions and DMs.
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
                onPress={() => {
                  if (inviteCode && inviteCode.length === 6 && registrationToken) {
                    registerMutation.mutate({
                      registrationToken,
                      role: selectedRole,
                      consentAccepted: true,
                      inviteCode,
                    });
                  } else {
                    setStep('ROLE_SELECT');
                  }
                }}
              >
                <Text style={styles.buttonText}>I AGREE & CONTINUE</Text>
              </Pressable>
            </>
          )}

          {/*  S6: Role Select  */}
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

              {/* School Admin card */}
              <Pressable
                accessibilityRole="button"
                style={[
                  styles.roleCard,
                  selectedRole === 'school_admin' && styles.roleCardSelected,
                ]}
                onPress={() => handleRoleTabChange('school_admin')}
              >
                <View style={[styles.roleIconBox, { backgroundColor: colors.navy }]}>
                  <Text style={styles.roleIconText}>A</Text>
                </View>
                <View style={styles.roleContent}>
                  <Text style={styles.roleName}>Institution Owner / Admin</Text>
                  <Text style={styles.roleDesc}>
                    Set up your school, invite staff/teachers, view classrooms & compliance audits.
                  </Text>
                </View>
              </Pressable>

              {/* Teacher card */}
              <Pressable
                accessibilityRole="button"
                style={[
                  styles.roleCard,
                  selectedRole === 'teacher' && styles.roleCardSelected,
                ]}
                onPress={() => handleRoleTabChange('teacher')}
              >
                <View style={[styles.roleIconBox, { backgroundColor: colors.teal }]}>
                  <Text style={styles.roleIconText}>T</Text>
                </View>
                <View style={styles.roleContent}>
                  <Text style={styles.roleName}>Teacher / Educator</Text>
                  <Text style={styles.roleDesc}>
                    Join your school, create classrooms, mark attendance, post announcements.
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
                onPress={() => handleRoleTabChange('parent')}
              >
                <View style={[styles.roleIconBox, { backgroundColor: colors.sky }]}>
                  <Text style={styles.roleIconText}>P</Text>
                </View>
                <View style={styles.roleContent}>
                  <Text style={styles.roleName}>Parent / Guardian</Text>
                  <Text style={styles.roleDesc}>
                    Join your child's classes, receive absent alerts, read notices.
                  </Text>
                </View>
              </Pressable>

              {/* Role-specific section */}
              {selectedRole === 'school_admin' && (
                <View style={styles.roleMetaSection}>
                  <View style={styles.roleInfoBox}>
                    <Text style={styles.roleInfoText}>
                      Set up your institution workspace. You will receive a school-wide invite code after setup.
                    </Text>
                  </View>

                  <Text style={[styles.fieldLabel, { marginBottom: spacing.sm }]}>
                    YOUR FULL NAME
                  </Text>
                  <TextInput
                    style={styles.plainInput}
                    placeholder="e.g. Ramesh Sharma"
                    placeholderTextColor={colors.teal}
                    value={name}
                    onChangeText={setName}
                  />

                  <Text style={[styles.fieldLabel, { marginTop: spacing.md, marginBottom: spacing.sm }]}>
                    SCHOOL / INSTITUTION NAME
                  </Text>
                  <TextInput
                    style={styles.plainInput}
                    placeholder="e.g. Greenfield High School"
                    placeholderTextColor={colors.teal}
                    value={schoolName}
                    onChangeText={setSchoolName}
                  />

                  <Text style={[styles.fieldLabel, { marginTop: spacing.md, marginBottom: spacing.sm }]}>
                    YOUR DESIGNATION (OPTIONAL)
                  </Text>
                  <TextInput
                    style={styles.plainInput}
                    placeholder="e.g. Principal / Administrator"
                    placeholderTextColor={colors.teal}
                    value={designation}
                    onChangeText={setDesignation}
                  />
                </View>
              )}

              {selectedRole === 'teacher' && (
                <View style={styles.roleMetaSection}>
                  <View style={styles.roleInfoBox}>
                    <Text style={styles.roleInfoText}>
                      Teachers join an existing school using the school-wide invite code provided by your administrator.
                    </Text>
                  </View>

                  <Text style={[styles.fieldLabel, { marginBottom: spacing.sm }]}>
                    YOUR FULL NAME
                  </Text>
                  <TextInput
                    style={styles.plainInput}
                    placeholder="e.g. Priya Nair"
                    placeholderTextColor={colors.teal}
                    value={name}
                    onChangeText={setName}
                  />

                  <Text style={[styles.fieldLabel, { marginTop: spacing.md, marginBottom: spacing.sm }]}>
                    SCHOOL INVITE CODE
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
                      <Text style={styles.resolvedVerified}>Verified School</Text>
                    </View>
                  )}
                </View>
              )}

              {selectedRole === 'parent' && (
                <View style={styles.roleMetaSection}>
                  <View style={styles.roleInfoBox}>
                    <Text style={styles.roleInfoText}>
                      Parents join their child's school using the invite code.
                    </Text>
                  </View>

                  <Text style={[styles.fieldLabel, { marginBottom: spacing.sm }]}>
                    SCHOOL INVITE CODE
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
                      <Text style={styles.resolvedVerified}>Verified School</Text>
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
              )}

              <Pressable
                accessibilityRole="button"
                style={[
                  styles.primaryButton,
                  { marginTop: spacing.md },
                  (selectedRole !== 'school_admin' && !resolvedTenant) ||
                    (selectedRole === 'school_admin' && schoolName.trim().length < 2) ||
                    (['school_admin', 'teacher'].includes(selectedRole) && name.trim().length < 2) ||
                    registerMutation.isPending
                    ? { opacity: 0.5 }
                    : {},
                ]}
                disabled={
                  (selectedRole !== 'school_admin' && !resolvedTenant) ||
                  (selectedRole === 'school_admin' && schoolName.trim().length < 2) ||
                  (['school_admin', 'teacher'].includes(selectedRole) && name.trim().length < 2) ||
                  registerMutation.isPending
                }
                onPress={handleFinalSubmit}
              >
                {registerMutation.isPending ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.buttonText}>
                    {selectedRole === 'school_admin'
                      ? 'CREATE INSTITUTION'
                      : selectedRole === 'teacher'
                      ? 'CONTINUE AS TEACHER'
                      : 'CONTINUE AS PARENT'}
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
  //  Base 
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },

  //  S1 Splash 
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

  //  S2 Welcome 
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

  //  S3S6 Form Shared 
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

  //  S3 Phone 
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

  //  S4 OTP 
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

  //  S5 Consent 
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

  //  S6 Role Select 
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

  //  DEV bypass hint (only rendered in __DEV__ builds) 
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
  //  WhatsApp verification UI styles 
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

