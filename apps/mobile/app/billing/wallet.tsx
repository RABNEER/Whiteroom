import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  TextInput,
  RefreshControl,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wallet,
  PlusCircle,
  ArrowLeft,
  History,
  TrendingDown,
  TrendingUp,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  Settings,
} from "lucide-react-native";
import { api } from "@/api/client";
import { colors, spacing, font, radius } from "@/theme/tokens";
import type { RechargeOrderResponse } from "@whiteroom/shared";

export default function WalletScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [customCredits, setCustomCredits] = useState<string>("");
  const [selectedPreset, setSelectedPreset] = useState<number | null>(100); // Default 100 credits (₹500)
  const [refreshing, setRefreshing] = useState(false);

  // 1. Fetch Wallet Status
  const {
    data: walletStatus,
    isLoading: isWalletLoading,
    refetch: refetchWallet,
  } = useQuery({
    queryKey: ["walletStatus"],
    queryFn: api.getWalletStatus,
  });

  // 2. Fetch Transaction History
  const {
    data: transactions = [],
    isLoading: isTxLoading,
    refetch: refetchTx,
  } = useQuery({
    queryKey: ["walletTransactions"],
    queryFn: () => api.getTransactions(50),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchWallet(), refetchTx()]);
    setRefreshing(false);
  };

  // Recharge Mutation
  const rechargeMutation = useMutation({
    mutationFn: (credits: number) => api.createRechargeOrder({ credits }),
    onSuccess: (order: RechargeOrderResponse) => {
      queryClient.invalidateQueries({ queryKey: ["walletStatus"] });
      queryClient.invalidateQueries({ queryKey: ["walletTransactions"] });

      if (typeof window !== "undefined" && window.location && order.paymentUrl && !order.paymentUrl.includes("example.com")) {
        window.location.href = order.paymentUrl;
        return;
      }

      const isMockOrder = !order.paymentUrl || order.paymentUrl.includes("example.com") || order.id?.startsWith("order_mock") || order.id?.startsWith("recharge_");

      if (isMockOrder) {
        const msg = `Recharge order ${order.id} initiated for ${order.credits} credits (₹${(order.amountPaise / 100).toFixed(0)}).\n\nIn live mode, you will be redirected to Razorpay checkout.`;
        if (Platform.OS === "web") {
          window.alert(`Recharge Initiated\n\n${msg}`);
        } else {
          Alert.alert("Recharge Initiated", msg, [{ text: "OK" }]);
        }
        return;
      }

      Alert.alert(
        "Complete Your Recharge",
        `Order created! Tap below to complete payment of ₹${(order.amountPaise / 100).toFixed(0)} for ${order.credits} student credits via Razorpay.\n\nOrder ID: ${order.id}`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Pay Now",
            onPress: async () => {
              try {
                await Linking.openURL(order.paymentUrl);
              } catch (err) {
                Alert.alert("Error", "Could not open payment gateway link.");
              }
            },
          },
        ]
      );
    },
    onError: (err: any) => {
      console.error("Recharge mutation error:", err);
      const msg = err?.message || "Could not initiate recharge order. Please verify credits amount.";
      if (Platform.OS === "web") {
        window.alert(`Error: ${msg}`);
      } else {
        Alert.alert("Recharge Error", msg);
      }
    },
  });

  const handleRecharge = () => {
    const creditsToBuy = selectedPreset !== null ? selectedPreset : parseInt(customCredits, 10);
    if (!creditsToBuy || isNaN(creditsToBuy) || creditsToBuy <= 0) {
      if (Platform.OS === "web") {
        window.alert("Invalid Amount: Please select or enter a valid number of credits to buy.");
      } else {
        Alert.alert("Invalid Amount", "Please select or enter a valid number of credits to buy.");
      }
      return;
    }
    rechargeMutation.mutate(creditsToBuy);
  };

  const getCreditsToBuy = () => {
    return selectedPreset !== null ? selectedPreset : (parseInt(customCredits, 10) || 0);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "N/A";
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderTxIcon = (type: string) => {
    switch (type) {
      case "recharge":
        return <TrendingUp size={20} color="#059669" />;
      case "deduction":
        return <TrendingDown size={20} color="#DC2626" />;
      case "bonus":
        return <Sparkles size={20} color="#6366F1" />;
      default:
        return <Clock size={20} color="#64748B" />;
    }
  };

  if (isWalletLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.navy} />
        <Text style={styles.loadingText}>Loading credits wallet...</Text>
      </View>
    );
  }

  const balance = walletStatus?.creditsBalance ?? 0;
  const status = walletStatus?.status || "ACTIVE";
  const monthlyFee = walletStatus?.estimatedMonthlyCreditsFee ?? 0;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft color={colors.navy} size={24} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Prepaid Credits Wallet</Text>
          <Text style={styles.headerSub}>₹5 per student/month • Pay as you grow</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/billing/dashboard" as any)}
          style={styles.settingsButton}
        >
          <Settings color={colors.navy} size={22} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Balance Card */}
        <View style={[styles.balanceCard, status === "EXHAUSTED" ? styles.balanceExhausted : styles.balanceActive]}>
          <View style={styles.balanceHeader}>
            <View style={styles.walletIconBox}>
              <Wallet size={28} color={colors.white} />
            </View>
            <View style={styles.statusBadgeBox}>
              {status === "EXHAUSTED" ? (
                <View style={[styles.statusBadge, { backgroundColor: "#FEE2E2" }]}>
                  <AlertCircle size={14} color="#DC2626" style={{ marginRight: 4 }} />
                  <Text style={[styles.statusBadgeText, { color: "#DC2626" }]}>EXHAUSTED</Text>
                </View>
              ) : (
                <View style={[styles.statusBadge, { backgroundColor: "#D1FAE5" }]}>
                  <CheckCircle2 size={14} color="#059669" style={{ marginRight: 4 }} />
                  <Text style={[styles.statusBadgeText, { color: "#059669" }]}>ACTIVE</Text>
                </View>
              )}
            </View>
          </View>

          <Text style={styles.balanceLabel}>Available Student Credits</Text>
          <View style={styles.balanceNumberRow}>
            <Text style={styles.balanceAmount}>{balance}</Text>
            <Text style={styles.balanceUnit}>credits</Text>
          </View>

          <View style={styles.balanceFooter}>
            <Text style={styles.balanceFooterText}>
              Value: ₹{balance * 5} • Est. monthly deduction: {monthlyFee} credits (₹{monthlyFee * 5})
            </Text>
          </View>
        </View>

        {/* Recharge Section */}
        <View style={styles.sectionHeader}>
          <PlusCircle size={18} color={colors.navy} style={{ marginRight: 6 }} />
          <Text style={styles.sectionTitle}>Buy Prepaid Credits</Text>
        </View>

        <View style={styles.rechargeCard}>
          <Text style={styles.rechargeSubtitle}>
            Select a recharge pack or enter exact credits needed:
          </Text>

          <View style={styles.presetGrid}>
            {[
              { credits: 50, label: "50 Credits", price: "₹250" },
              { credits: 100, label: "100 Credits", price: "₹500", popular: true },
              { credits: 200, label: "200 Credits", price: "₹1,000" },
              { credits: 500, label: "500 Credits", price: "₹2,500" },
            ].map((preset) => (
              <TouchableOpacity
                key={preset.credits}
                style={[
                  styles.presetBtn,
                  selectedPreset === preset.credits && styles.presetBtnActive,
                ]}
                onPress={() => {
                  setSelectedPreset(preset.credits);
                  setCustomCredits("");
                }}
              >
                {preset.popular && (
                  <View style={styles.popularTag}>
                    <Text style={styles.popularTagText}>POPULAR</Text>
                  </View>
                )}
                <Text
                  style={[
                    styles.presetCreditsText,
                    selectedPreset === preset.credits && styles.presetCreditsTextActive,
                  ]}
                >
                  {preset.label}
                </Text>
                <Text
                  style={[
                    styles.presetPriceText,
                    selectedPreset === preset.credits && styles.presetPriceTextActive,
                  ]}
                >
                  {preset.price}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Custom Input */}
          <View style={styles.customInputRow}>
            <Text style={styles.customInputLabel}>Or Custom Credits:</Text>
            <TextInput
              style={styles.customInput}
              placeholder="e.g. 150"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={customCredits}
              onChangeText={(txt) => {
                const cleaned = txt.replace(/[^0-9]/g, "");
                setCustomCredits(cleaned);
                if (cleaned.length > 0) {
                  setSelectedPreset(null);
                } else {
                  setSelectedPreset(100);
                }
              }}
            />
          </View>

          {/* Summary Box & Button */}
          <View style={styles.rechargeSummaryBox}>
            <View style={styles.rechargeSummaryRow}>
              <Text style={styles.rechargeSummaryLabel}>Credits to Add:</Text>
              <Text style={styles.rechargeSummaryVal}>{getCreditsToBuy()} credits</Text>
            </View>
            <View style={styles.rechargeSummaryRow}>
              <Text style={styles.rechargeSummaryLabel}>Total Amount (₹5/credit):</Text>
              <Text style={styles.rechargeSummaryPriceVal}>₹{getCreditsToBuy() * 5}</Text>
            </View>

            <TouchableOpacity
              style={[
                styles.rechargeActionBtn,
                rechargeMutation.isPending && { opacity: 0.7 },
              ]}
              onPress={handleRecharge}
              disabled={rechargeMutation.isPending}
            >
              {rechargeMutation.isPending ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.rechargeActionBtnText}>
                  Proceed to Razorpay Checkout (₹{getCreditsToBuy() * 5})
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Transaction History Section */}
        <View style={styles.sectionHeader}>
          <History size={18} color={colors.navy} style={{ marginRight: 6 }} />
          <Text style={styles.sectionTitle}>Transaction History</Text>
        </View>

        <View style={styles.txCard}>
          {isTxLoading ? (
            <ActivityIndicator size="small" color={colors.navy} style={{ marginVertical: spacing.md }} />
          ) : transactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>No transactions found</Text>
              <Text style={styles.emptyStateDesc}>
                When you recharge credits or monthly deductions run, details will appear here.
              </Text>
            </View>
          ) : (
            transactions.map((tx, idx) => (
              <View
                key={tx.id || idx}
                style={[
                  styles.txRow,
                  idx === transactions.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <View style={styles.txIconBox}>{renderTxIcon(tx.type)}</View>
                <View style={styles.txDetails}>
                  <Text style={styles.txDescription}>{tx.description}</Text>
                  <Text style={styles.txDate}>{formatDate(tx.createdAt)}</Text>
                </View>
                <View style={styles.txAmountContainer}>
                  <Text
                    style={[
                      styles.txAmountText,
                      tx.type === "recharge" || tx.type === "bonus"
                        ? styles.txAmountPositive
                        : styles.txAmountNegative,
                    ]}
                  >
                    {tx.type === "recharge" || tx.type === "bonus" ? "+" : "-"}
                    {Math.abs(tx.amountCredits)} credits
                  </Text>
                  {tx.amountPaise != null && tx.amountPaise > 0 && (
                    <Text style={styles.txPriceText}>₹{(tx.amountPaise / 100).toFixed(0)}</Text>
                  )}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.paper,
  },
  loadingText: {
    marginTop: spacing.sm,
    color: "#64748B",
    fontSize: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: colors.white,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: spacing.md,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: colors.navy,
  },
  headerSub: {
    fontSize: 12,
    color: "#64748B",
  },
  settingsButton: {
    padding: spacing.xs,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  balanceCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  balanceActive: {
    backgroundColor: colors.navy,
  },
  balanceExhausted: {
    backgroundColor: "#7F1D1D",
  },
  balanceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  walletIconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  statusBadgeBox: {},
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  balanceLabel: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  balanceNumberRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 4,
  },
  balanceAmount: {
    fontSize: 38,
    fontWeight: "800",
    color: colors.white,
  },
  balanceUnit: {
    fontSize: 16,
    color: "#E2E8F0",
    marginLeft: 6,
    fontWeight: "600",
  },
  balanceFooter: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.15)",
  },
  balanceFooterText: {
    fontSize: 12,
    color: "#CBD5E1",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.navy,
  },
  rechargeCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: spacing.lg,
  },
  rechargeSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: spacing.md,
  },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  presetBtn: {
    flex: 1,
    minWidth: "46%",
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    position: "relative",
  },
  presetBtnActive: {
    borderColor: colors.navy,
    backgroundColor: "#EFF6FF",
  },
  popularTag: {
    position: "absolute",
    top: -9,
    right: 8,
    backgroundColor: colors.navy,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  popularTagText: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.white,
  },
  presetCreditsText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.navy,
  },
  presetCreditsTextActive: {
    color: colors.navy,
  },
  presetPriceText: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  presetPriceTextActive: {
    color: colors.navy,
    fontWeight: "600",
  },
  customInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: spacing.md,
  },
  customInputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.navy,
  },
  customInput: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.navy,
    paddingVertical: spacing.xs,
    width: 100,
    textAlign: "right",
  },
  rechargeSummaryBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: radius.md,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  rechargeSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  rechargeSummaryLabel: {
    fontSize: 13,
    color: "#64748B",
  },
  rechargeSummaryVal: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.navy,
  },
  rechargeSummaryPriceVal: {
    fontSize: 15,
    fontWeight: "800",
    color: "#059669",
  },
  rechargeActionBtn: {
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  rechargeActionBtnText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "700",
  },
  txCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  emptyState: {
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.navy,
    marginBottom: 4,
  },
  emptyStateDesc: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    paddingHorizontal: spacing.md,
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  txIconBox: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.sm,
  },
  txDetails: {
    flex: 1,
    paddingRight: spacing.xs,
  },
  txDescription: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.navy,
  },
  txDate: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 2,
  },
  txAmountContainer: {
    alignItems: "flex-end",
  },
  txAmountText: {
    fontSize: 14,
    fontWeight: "700",
  },
  txAmountPositive: {
    color: "#059669",
  },
  txAmountNegative: {
    color: "#DC2626",
  },
  txPriceText: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
});
