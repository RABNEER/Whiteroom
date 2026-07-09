import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  Alert,
  Linking,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Sparkles, CheckCircle, ShieldAlert, ArrowLeft } from "lucide-react-native";
import { api } from "@/api/client";
import { colors, spacing, font, radius } from "@/theme/tokens";

export default function BillingDashboardScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selectedPlanType, setSelectedPlanType] = useState<"tuition" | "school">("school");
  const [waltEnabled, setWaltEnabled] = useState(false);
  const [calcStudents, setCalcStudents] = useState<string>("");

  // Fetch Billing Dashboard details
  const { data: billing, isLoading, refetch } = useQuery({
    queryKey: ["billingDashboard"],
    queryFn: api.getBillingDashboard,
  });

  // Start checkout mutation
  const subscribeMutation = useMutation({
    mutationFn: (payload: { planType: "tuition" | "school"; waltAiEnabled: boolean }) =>
      api.subscribeBilling(payload),
    onSuccess: (order: any) => {
      // Direct redirect for Web to bypass pop-up blockers
      if (typeof window !== "undefined" && window.location) {
        window.location.href = order.paymentUrl;
        return;
      }

      // Fallback for native devices
      Alert.alert(
        "Payment Order Created",
        `Order ID: ${order.id}\nAmount: ₹${(order.amount / 100).toFixed(2)}`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Pay Online",
            onPress: async () => {
              if (order.paymentUrl) {
                try {
                  await Linking.openURL(order.paymentUrl);
                } catch (err) {
                  Alert.alert("Error", "Could not open payment link");
                }
              }
            }
          },
          {
            text: "Simulate Success (Dev)",
            onPress: async () => {
              try {
                // Call webhook directly or mock capture
                await api.simulatePaymentWebhook({
                  event: "payment_link.paid",
                  payload: {
                    payment_link: {
                      entity: {
                        id: order.id,
                        status: "paid"
                      }
                    },
                    payment: {
                      entity: {
                        id: `pay_${Math.random().toString(36).substring(7)}`,
                        amount: order.amount,
                      },
                    },
                  },
                });
                queryClient.invalidateQueries({ queryKey: ["billingDashboard"] });
                Alert.alert("Success", "Subscription payment simulated successfully!");
              } catch (err) {
                console.error(err);
                Alert.alert("Error", "Failed to finalize subscription");
              }
            },
          },
        ]
      );
    },
    onError: (err) => {
      console.error(err);
      Alert.alert("Error", "Failed to initialize payment gateway order");
    },
  });

  const handleSubscribe = () => {
    subscribeMutation.mutate({
      planType: selectedPlanType,
      waltAiEnabled: waltEnabled,
    });
  };

  const formatPrice = (paise: number) => {
    return `₹${(paise / 100).toFixed(0)}`;
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.navy} />
        <Text style={styles.loadingText}>Loading billing dashboard...</Text>
      </View>
    );
  }

  const isSubscribed = billing?.subscriptionActive;
  const trialActive = billing?.trialActive;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft color={colors.navy} size={24} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Billing & Subscription</Text>
          <Text style={styles.headerSub}>{billing?.tenantName || "Institution Admin Console"}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Status Card */}
        <View style={[styles.statusCard, isSubscribed ? styles.statusActive : styles.statusTrial]}>
          <View style={styles.statusRow}>
            <CreditCard color={isSubscribed ? "#059669" : "#D97706"} size={32} />
            <View style={styles.statusDetails}>
              <Text style={styles.statusTitle}>
                {isSubscribed ? "Subscription Active" : trialActive ? "Free Trial Month" : "Subscription Required"}
              </Text>
              <Text style={styles.statusSubtitle}>
                {isSubscribed
                  ? `Renews on ${new Date(billing.endDate).toLocaleDateString()}`
                  : trialActive
                    ? `Trial ends on ${new Date(billing.trialEndsAt).toLocaleDateString()}`
                    : "Upgrade to restore full capabilities"}
              </Text>
            </View>
          </View>
          {isSubscribed && (
            <View style={styles.priceTag}>
              <Text style={styles.priceText}>{formatPrice(billing.totalMonthlyPaise)}/mo</Text>
            </View>
          )}
        </View>

        {/* Configuration Setup Form */}
        <Text style={styles.sectionTitle}>Configure Plan Tier</Text>
        <View style={styles.configCard}>
          {/* Plan Type Selector */}
          <View style={styles.selectRow}>
            <TouchableOpacity
              onPress={() => setSelectedPlanType("school")}
              style={[styles.selectOption, selectedPlanType === "school" && styles.selectActive]}
            >
              <Text style={[styles.selectText, selectedPlanType === "school" && styles.selectTextActive]}>
                School / Academy
              </Text>
              <Text style={styles.selectSubText}>Dynamic student pricing</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setSelectedPlanType("tuition")}
              style={[styles.selectOption, selectedPlanType === "tuition" && styles.selectActive]}
            >
              <Text style={[styles.selectText, selectedPlanType === "tuition" && styles.selectTextActive]}>
                Tuition Center
              </Text>
              <Text style={styles.selectSubText}>Dynamic student pricing</Text>
            </TouchableOpacity>
          </View>

          {/* Walt AI Toggle */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleTextCol}>
              <View style={styles.waltHeadingRow}>
                <Sparkles size={16} color="#6366F1" style={{ marginRight: 6 }} />
                <Text style={styles.toggleHeading}>Enable Walt AI Engine</Text>
              </View>
              <Text style={styles.toggleDesc}>
                Auto-grants student doubt solving, RAG citation vectors, flashcards and notice auto-drafts. (Adds ₹400/mo)
              </Text>
            </View>
            <Switch
              trackColor={{ false: "#CBD5E1", true: "#6366F1" }}
              thumbColor={colors.white}
              value={waltEnabled}
              onValueChange={setWaltEnabled}
            />
          </View>
        </View>

        <View style={styles.calcCard}>
          <Text style={styles.calcTitle}>Pricing Calculator</Text>
          <View style={styles.calcRow}>
            <Text style={styles.calcLabel}>Number of Students:</Text>
            <TextInput
              style={styles.calcInput}
              value={calcStudents === "" ? String(billing?.breakdown?.studentsCount || 0) : calcStudents}
              onChangeText={(text) => setCalcStudents(text.replace(/[^0-9]/g, ""))}
              keyboardType="numeric"
              placeholder="e.g. 100"
              placeholderTextColor="#94A3B8"
            />
          </View>
        </View>

        {/* Dynamic Pricing Breakdown */}
        <Text style={styles.sectionTitle}>Calculated Rate Breakdown</Text>
        <View style={styles.breakdownCard}>
          {/* Dynamic Pricing Breakdown */}
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Student fee (₹5/student)</Text>
            <Text style={styles.breakdownVal}>
              {(calcStudents === "" ? (billing?.breakdown?.studentsCount || 0) : (parseInt(calcStudents) || 0))} x ₹5
            </Text>
          </View>
          {waltEnabled && (
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Walt AI Flat Addon</Text>
              <Text style={styles.breakdownVal}>₹400</Text>
            </View>
          )}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Estimated Monthly Charge:</Text>
            <Text style={styles.totalVal}>
              ₹{((calcStudents === "" ? (billing?.breakdown?.studentsCount || 0) : (parseInt(calcStudents) || 0)) * 5 + (waltEnabled ? 400 : 0))}
            </Text>
          </View>
        </View>

        {/* Subscribe Action Button */}
        <TouchableOpacity
          onPress={handleSubscribe}
          disabled={subscribeMutation.isPending}
          style={styles.subscribeBtn}
        >
          {subscribeMutation.isPending ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.subscribeBtnText}>
              {trialActive ? "Subscribe for Post-Trial Setup" : "Upgrade Plan Now"}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: spacing.md,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.navy,
  },
  headerSub: {
    fontSize: 12,
    color: colors.teal,
    marginTop: 2,
  },
  scrollContent: {
    padding: spacing.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 14,
    color: colors.teal,
  },
  statusCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  statusActive: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  statusTrial: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  statusDetails: {
    marginLeft: spacing.md,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.navy,
  },
  statusSubtitle: {
    fontSize: 13,
    color: colors.teal,
    marginTop: 2,
  },
  priceTag: {
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  priceText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.navy,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.navy,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  configCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  selectRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  selectOption: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
  },
  selectActive: {
    backgroundColor: `${colors.navy}10`,
    borderColor: colors.navy,
  },
  selectText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.teal,
  },
  selectTextActive: {
    color: colors.navy,
  },
  selectSubText: {
    fontSize: 11,
    color: colors.teal,
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: spacing.md,
  },
  toggleTextCol: {
    flex: 1,
    marginRight: spacing.md,
  },
  waltHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  toggleHeading: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.navy,
  },
  toggleDesc: {
    fontSize: 12,
    color: colors.teal,
    marginTop: 4,
    lineHeight: 16,
  },
  breakdownCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  breakdownLabel: {
    fontSize: 14,
    color: colors.navy,
  },
  breakdownVal: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.navy,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: spacing.md,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.navy,
  },
  totalVal: {
    fontSize: 18,
    fontWeight: "900",
    color: "#4F46E5",
  },
  subscribeBtn: {
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginBottom: 40,
  },
  subscribeBtnText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
  },
  calcCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    marginTop: spacing.md,
  },
  calcTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.navy,
    marginBottom: spacing.sm,
  },
  calcRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  calcLabel: {
    fontSize: 14,
    color: colors.teal,
  },
  calcInput: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    width: 100,
    textAlign: "right",
    fontSize: 14,
    color: colors.navy,
    fontWeight: "600",
  },
});
