import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { router } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { api, ApiError, API_BASE_URL } from "@/api/client";
import { useSession } from "@/auth/session-store";
import {
  Banner,
  Button,
  Card,
  Eyebrow,
  Field,
  HeroPanel,
  Muted,
  Screen,
  Segmented,
  SectionTitle,
} from "@/components/ui";
import { colors, font, spacing } from "@/theme/tokens";

type Mode = "teacher" | "parent";

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>("teacher");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [studentName, setStudentName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setSession = useSession((state) => state.setSession);

  const sendOtp = useMutation({
    mutationFn: () => api.otpSend(phone),
    onSuccess: () => {
      setError(null);
      setSent(true);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not send OTP"),
  });

  const resolveInvite = useMutation({
    mutationFn: () => api.inviteResolve(inviteCode.trim().toUpperCase()),
  });

  const verifyOtp = useMutation({
    mutationFn: () =>
      api.otpVerify({
        phone,
        otp,
        inviteCode: mode === "parent" ? inviteCode.trim().toUpperCase() : undefined,
        studentName: mode === "parent" && studentName ? studentName : undefined,
        rollNumber: mode === "parent" && rollNumber ? rollNumber : undefined,
      }),
    onSuccess: async (session) => {
      await setSession(session);
      router.replace(session.user.role === "parent" ? "/parent" : "/teacher");
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "OTP verification failed"),
  });

  const inviteInfo = useMemo(() => resolveInvite.data, [resolveInvite.data]);

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ gap: spacing.lg }}>
          <HeroPanel>
            <View style={{ gap: spacing.sm }}>
              <Text style={{ color: colors.sky, fontWeight: "800" }}>Whiteroom mobile</Text>
              <Text style={{ color: colors.white, fontSize: 34, fontWeight: "900", lineHeight: 40 }}>
                {mode === "teacher" ? "Run school work without noise." : "Stay close to class updates."}
              </Text>
              <Muted style={{ color: colors.sky }}>Backend: {API_BASE_URL}</Muted>
            </View>
          </HeroPanel>

          <Segmented
            value={mode}
            options={[
              { value: "teacher", label: "Teacher" },
              { value: "parent", label: "Parent" },
            ]}
            onChange={(next) => {
              setMode(next);
              setSent(false);
              setError(null);
            }}
          />

          {error ? <Banner tone="danger">{error}</Banner> : null}
          {sent ? <Banner tone="success">OTP sent. In dev mode, check API logs.</Banner> : null}

          <Card>
            <View style={{ gap: spacing.xs }}>
              <Eyebrow>{mode === "teacher" ? "Secure login" : "Invite based access"}</Eyebrow>
              <SectionTitle>{mode === "teacher" ? "Teacher login" : "Parent join"}</SectionTitle>
            </View>

            <Field
              label="Phone"
              keyboardType="phone-pad"
              placeholder="+91 98765 43210"
              value={phone}
              onChangeText={setPhone}
            />

            {mode === "parent" ? (
              <>
                <Field
                  label="Invite code"
                  autoCapitalize="characters"
                  placeholder="ABC123"
                  value={inviteCode}
                  onChangeText={setInviteCode}
                  onBlur={() => {
                    if (inviteCode.trim().length === 6) resolveInvite.mutate();
                  }}
                />
                {inviteInfo ? (
                  <View
                    style={{
                      borderColor: inviteInfo.brandColor || colors.primary,
                      borderLeftWidth: 3,
                      gap: spacing.xs,
                      paddingLeft: spacing.md,
                    }}
                  >
                    <Text style={{ color: colors.ink, fontFamily: font.display, fontSize: 24 }}>
                      {inviteInfo.tenantName}
                    </Text>
                    <Muted mono>Invite verified</Muted>
                  </View>
                ) : null}
                <Field
                  label="Student name optional"
                  placeholder="Rahul Kumar"
                  value={studentName}
                  onChangeText={setStudentName}
                />
                <Field
                  label="Roll number optional"
                  placeholder="07"
                  value={rollNumber}
                  onChangeText={setRollNumber}
                />
              </>
            ) : null}

            {sent ? (
              <Field
                label="OTP"
                keyboardType="number-pad"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChangeText={setOtp}
              />
            ) : null}

            <Button
              loading={sent ? verifyOtp.isPending : sendOtp.isPending}
              disabled={mode === "parent" && inviteCode.trim().length !== 6}
              onPress={() => (sent ? verifyOtp.mutate() : sendOtp.mutate())}
            >
              {sent ? "Verify OTP" : "Send OTP"}
            </Button>
          </Card>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
