import { platformAlert } from "@/src/utils/alert";
import { useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Megaphone,
  CreditCard,
  Calendar,
  Award,
  Eye,
  Check,
  ArrowLeft,
} from "lucide-react-native";
import type { BulletinResponse } from "@whiteroom/shared";
import { api } from "@/api/client";
import { useSession } from "@/auth/session-store";
import { colors, spacing, radius } from "@/theme/tokens";

export default function BulletinsFeedScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useSession((state) => state.user);
  const { classId } = useLocalSearchParams<{ classId?: string }>();

  const [activeTab, setActiveTab] = useState<string>("ALL");

  // Fetch bulletins
  const { data: bulletinsList = [], isLoading, refetch } = useQuery({
    queryKey: ["bulletins", classId],
    queryFn: () => api.getBulletins({ classId }),
  });

  // Mark read mutation
  const readMutation = useMutation({
    mutationFn: (bulletinId: string) => api.markBulletinRead(bulletinId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bulletins", classId] });
    },
  });

  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "school_admin";

  const handleMarkRead = (bulletinId: string) => {
    readMutation.mutate(bulletinId);
  };

  const handleShowReceipts = async (bulletinId: string) => {
    try {
      const data = await api.getBulletinReceipts(bulletinId);
      platformAlert(
        "Notice Seen Receipts",
        `This notice has been seen by ${data.seenCount} users.\n\nSeen list is visible to school staff and administrators.`,
        [{ text: "OK" }]
      );
    } catch (err) {
      console.error(err);
      platformAlert("Error", "Unable to fetch read receipts");
    }
  };

  const filteredBulletins = bulletinsList.filter((b: BulletinResponse) => {
    if (activeTab === "ALL") return true;
    return b.category === activeTab;
  });

  const getCategoryStyles = (category: string) => {
    switch (category) {
      case "FEES":
        return {
          bg: "#FEF2F2",
          border: "#FEE2E2",
          text: "#EF4444",
          Icon: CreditCard,
        };
      case "EXAM":
        return {
          bg: "#EFF6FF",
          border: "#DBEAFE",
          text: "#3B82F6",
          Icon: Award,
        };
      case "HOLIDAY":
        return {
          bg: "#FEF3C7",
          border: "#FDE68A",
          text: "#D97706",
          Icon: Calendar,
        };
      default:
        return {
          bg: "#ECFDF5",
          border: "#D1FAE5",
          text: "#10B981",
          Icon: Megaphone,
        };
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft color={colors.navy} size={24} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Bulletins & Notices</Text>
          <Text style={styles.headerSub}>Important broadcasts and announcements</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        {["ALL", "FEES", "EXAM", "HOLIDAY", "GENERAL"].map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.navy} />
          <Text style={styles.loadingText}>Fetching bulletins...</Text>
        </View>
      ) : filteredBulletins.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Megaphone size={64} color={colors.teal} style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>No Notices Published</Text>
          <Text style={styles.emptyDesc}>There are no bulletins currently active in this category.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredBulletins}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.navy} />}
          renderItem={({ item }) => {
            const catStyles = getCategoryStyles(item.category);
            const CatIcon = catStyles.Icon;

            return (
              <View style={[styles.bulletinCard, { borderColor: catStyles.border }]}>
                {/* Top Badge Row */}
                <View style={styles.cardHeader}>
                  <View style={[styles.badge, { backgroundColor: catStyles.bg, borderColor: catStyles.border }]}>
                    <CatIcon size={12} color={catStyles.text} style={{ marginRight: 4 }} />
                    <Text style={[styles.badgeText, { color: catStyles.text }]}>{item.category}</Text>
                  </View>
                  <Text style={styles.cardTime}>
                    {new Date(item.createdAt).toLocaleDateString()}
                  </Text>
                </View>

                {/* Content */}
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardBody}>{item.body}</Text>

                {/* Footer Controls */}
                <View style={styles.cardFooter}>
                  {!item.isRead ? (
                    <TouchableOpacity onPress={() => handleMarkRead(item.id)} style={styles.markReadBtn}>
                      <Check size={14} color={colors.white} style={{ marginRight: 4 }} />
                      <Text style={styles.markReadText}>Mark Read</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.readIndicator}>
                      <Check size={14} color="#10B981" style={{ marginRight: 4 }} />
                      <Text style={styles.readText}>Seen</Text>
                    </View>
                  )}

                  {isTeacherOrAdmin && (
                    <TouchableOpacity onPress={() => handleShowReceipts(item.id)} style={styles.receiptsBtn}>
                      <Eye size={14} color={colors.teal} style={{ marginRight: 4 }} />
                      <Text style={styles.receiptsText}>Receipts</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}
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
  tabsRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    marginRight: 6,
  },
  tabActive: {
    backgroundColor: colors.navy,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.teal,
  },
  tabTextActive: {
    color: colors.white,
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
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.navy,
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 14,
    color: colors.teal,
    textAlign: "center",
  },
  listContent: {
    padding: spacing.md,
  },
  bulletinCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  cardTime: {
    fontSize: 11,
    color: colors.teal,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.navy,
    marginBottom: 6,
  },
  cardBody: {
    fontSize: 14,
    color: colors.navy,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: spacing.sm,
  },
  markReadBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.teal,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  markReadText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "600",
  },
  readIndicator: {
    flexDirection: "row",
    alignItems: "center",
  },
  readText: {
    fontSize: 12,
    color: colors.teal,
    fontWeight: "500",
  },
  receiptsBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.xs,
  },
  receiptsText: {
    color: colors.teal,
    fontSize: 12,
    fontWeight: "600",
  },
});
