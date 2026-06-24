import { useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Alert, ActivityIndicator } from "react-native";
import { Screen, Card, DisplayTitle, Eyebrow, Muted, Button } from "@/components/ui";
import { useSession } from "@/auth/session-store";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { router } from "expo-router";
import { colors, spacing, radius, font } from "@/theme/tokens";
import { LogOut, GraduationCap, CreditCard, MessageSquare, Shield, BookOpen } from "lucide-react-native";

function showAlert(title: string, message: string) {
  if (Platform.OS === "web") {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

export default function AdminDashboardScreen() {
  const user = useSession((state) => state.user);
  const clear = useSession((state) => state.clear);
  const tenant = useQuery({ queryKey: ["tenant"], queryFn: api.tenantMe });

  const logout = useMutation({
    mutationFn: async () => {
      let fcmToken: string | undefined;
      try {
        const Notifications = require("expo-notifications");
        const token = await Notifications.getDevicePushTokenAsync();
        fcmToken = token.data;
      } catch {
        // FCM token might not be available or enabled
      }
      await api.logout(fcmToken);
      await clear();
      router.replace("/auth");
    },
    onError: (err) => {
      console.error(err);
      showAlert("Error", "Logout failed. Please try again.");
    },
  });

  return (
    <Screen scroll={true}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Shield color={colors.navy} size={24} style={styles.shieldIcon} />
          <View>
            <Eyebrow>WHITEROOM ADMIN</Eyebrow>
            <DisplayTitle size="md">{tenant.data?.name || "Institution Admin"}</DisplayTitle>
          </View>
        </View>
        <Pressable
          onPress={() => logout.mutate()}
          style={({ pressed }) => [styles.logoutButton, pressed && { opacity: 0.7 }]}
        >
          {logout.isPending ? (
            <ActivityIndicator size="small" color={colors.navy} />
          ) : (
            <LogOut color={colors.navy} size={20} />
          )}
        </Pressable>
      </View>

      <Muted style={styles.subTitle}>
        Manage classrooms, annual student promotions, and institutional subscriptions.
      </Muted>

      <View style={styles.cardContainer}>
        {/* Classroom Operations Console Card */}
        <Card style={styles.dashboardCard}>
          <Pressable
            onPress={() => router.push("/teacher" as any)}
            style={({ pressed }) => [styles.cardPressable, pressed && { opacity: 0.9 }]}
          >
            <View style={styles.cardIconContainer}>
              <BookOpen color={colors.white} size={24} />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>Classroom Operations Console</Text>
              <Text style={styles.cardDescription}>
                View and manage classrooms, attendance sheets, schedules, and study archives.
              </Text>
            </View>
          </Pressable>
        </Card>

        {/* Class Promotion Flow Card */}
        <Card style={styles.dashboardCard}>
          <Pressable
            onPress={() => router.push("/admin/promote" as any)}
            style={({ pressed }) => [styles.cardPressable, pressed && { opacity: 0.9 }]}
          >
            <View style={styles.cardIconContainer}>
              <GraduationCap color={colors.white} size={24} />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>Annual Class Promotions</Text>
              <Text style={styles.cardDescription}>
                Promote students to next year's classes or archive graduating classes.
              </Text>
            </View>
          </Pressable>
        </Card>

        {/* Billing & Subscription Card */}
        <Card style={styles.dashboardCard}>
          <Pressable
            onPress={() => router.push("/billing/dashboard" as any)}
            style={({ pressed }) => [styles.cardPressable, pressed && { opacity: 0.9 }]}
          >
            <View style={styles.cardIconContainer}>
              <CreditCard color={colors.white} size={24} />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>Billing & Plan Subscription</Text>
              <Text style={styles.cardDescription}>
                Upgrade, view monthly pricing estimates, or modify Walt AI addons.
              </Text>
            </View>
          </Pressable>
        </Card>

        {/* Open Chat Interface Card */}
        <Card style={styles.dashboardCard}>
          <Pressable
            onPress={() => router.push("/chat" as any)}
            style={({ pressed }) => [styles.cardPressable, pressed && { opacity: 0.9 }]}
          >
            <View style={styles.cardIconContainer}>
              <MessageSquare color={colors.white} size={24} />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>Administrative Chat</Text>
              <Text style={styles.cardDescription}>
                Open classrooms and teacher broadcast channels to communicate.
              </Text>
            </View>
          </Pressable>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  shieldIcon: {
    marginRight: 2,
  },
  subTitle: {
    fontSize: 14,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  logoutButton: {
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: colors.white,
  },
  cardContainer: {
    gap: spacing.md,
  },
  dashboardCard: {
    padding: 0,
    overflow: "hidden",
  },
  cardPressable: {
    flexDirection: "row",
    padding: spacing.md,
    alignItems: "center",
  },
  cardIconContainer: {
    backgroundColor: colors.navy,
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.navy,
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 12,
    color: colors.teal,
    lineHeight: 16,
  },
});
