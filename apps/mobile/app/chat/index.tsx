import { useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  MessageSquare,
  Users,
  Lock,
  Megaphone,
  ArrowLeft,
  LogOut,
  ChevronRight,
  Shield,
} from "lucide-react-native";
import { api } from "@/api/client";
import { useSession } from "@/auth/session-store";
import { colors, spacing, font, radius } from "@/theme/tokens";
import { AvatarBadge } from "@/components/ui";

export default function ChatInboxScreen() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const user = useSession((state) => state.user);
  const clearSession = useSession((state) => state.clear);

  // Fetch Rooms
  const { data: rooms = [], isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["chatRooms"],
    queryFn: api.chatRooms,
    refetchInterval: 10000, // Auto-poll every 10 seconds for new messages
  });

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (err) {
      console.warn("Logout failed, clearing locally", err);
    }
    await clearSession();
    router.replace("/auth");
  };

  const filteredRooms = useMemo(() => {
    const safeRooms = Array.isArray(rooms) ? rooms : [];
    if (!search.trim()) return safeRooms;
    const query = search.toLowerCase();
    return safeRooms.filter(
      (room) =>
        (room?.name || "").toLowerCase().includes(query) ||
        (room?.subtitle || "").toLowerCase().includes(query)
    );
  }, [rooms, search]);

  const formatTime = (dateStr: string | Date) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  const renderRoomItem = ({ item }: { item: any }) => {
    const isDM = item.type === "direct_message";
    const isStaff = item.type === "teacher_channel";
    const isAnnouncement = item.type === "classroom" && item.chatMode === "announcement";

    // Room Icon / Theme Color
    let IconComponent = MessageSquare;
    let iconColor: string = colors.teal;
    let badgeBg = `${colors.teal}12`;

    if (isStaff) {
      IconComponent = Lock;
      iconColor = "#B45309"; // Muted Amber
      badgeBg = "#FEF3C7";
    } else if (isAnnouncement) {
      IconComponent = Megaphone;
      iconColor = colors.navy;
      badgeBg = `${colors.navy}12`;
    } else if (item.type === "classroom") {
      IconComponent = Users;
      iconColor = colors.sky;
      badgeBg = `${colors.sky}12`;
    }

    return (
      <Pressable
        onPress={() => {
          router.push(
            `/chat/${item.id}?roomType=${item.type}&name=${encodeURIComponent(
              item.name
            )}&chatMode=${item.chatMode || ""}` as any
          );
        }}
        style={({ pressed }) => [
          styles.roomItem,
          pressed && styles.roomItemPressed,
        ]}
      >
        <View style={styles.avatarContainer}>
          <AvatarBadge label={item.name} />
          <View style={[styles.typeBadge, { backgroundColor: iconColor }]}>
            <IconComponent color={colors.white} size={10} />
          </View>
        </View>

        <View style={styles.roomContent}>
          <View style={styles.roomHeader}>
            <Text style={styles.roomName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.roomTime}>{formatTime(item.updatedAt)}</Text>
          </View>

          <View style={styles.roomFooter}>
            <Text style={styles.roomSubtitle} numberOfLines={1}>
              {item.subtitle}
            </Text>
            {item.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unreadCount}</Text>
              </View>
            )}
          </View>
          
          <View style={styles.tagRow}>
            {isAnnouncement && (
              <View style={styles.noticeTag}>
                <Megaphone size={10} color={colors.navy} style={{ marginRight: 2 }} />
                <Text style={styles.noticeTagText}>Notice Board</Text>
              </View>
            )}
            {isStaff && (
              <View style={[styles.noticeTag, { backgroundColor: "#FEF3C7" }]}>
                <Lock size={10} color="#B45309" style={{ marginRight: 2 }} />
                <Text style={[styles.noticeTagText, { color: "#B45309" }]}>Staff Only</Text>
              </View>
            )}
            {isDM && (
              <View style={[styles.noticeTag, { backgroundColor: `${colors.teal}12` }]}>
                <MessageSquare size={10} color={colors.teal} style={{ marginRight: 2 }} />
                <Text style={[styles.noticeTagText, { color: colors.teal }]}>
                  {item.otherParticipant?.role === "teacher" ? "Teacher DM" : "Parent DM"}
                </Text>
              </View>
            )}
          </View>
        </View>
        
        <ChevronRight size={16} color={colors.teal} style={styles.chevron} />
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        {user?.role !== "school_admin" ? (
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
          >
            <ArrowLeft color={colors.navy} size={24} />
          </Pressable>
        ) : (
          <View style={styles.adminBadge}>
            <Shield color={colors.navy} size={18} style={{ marginRight: 4 }} />
            <Text style={styles.adminBadgeText}>Audit Console</Text>
          </View>
        )}

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Chats</Text>
          <Text style={styles.headerSub}>
            {user?.role === "school_admin" ? "Institutional Oversight" : "Classroom Discussions"}
          </Text>
        </View>

        {user?.role === "school_admin" && (
          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => [styles.logoutButton, pressed && { opacity: 0.7 }]}
          >
            <LogOut color={colors.danger} size={20} />
          </Pressable>
        )}
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Search color={colors.teal} size={18} style={styles.searchIcon} />
          <TextInput
            placeholder="Search conversations..."
            placeholderTextColor={colors.teal}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
        </View>
      </View>

      {/* Conversations List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.navy} />
          <Text style={styles.loadingText}>Loading conversations...</Text>
        </View>
      ) : filteredRooms.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MessageSquare size={48} color={colors.teal} style={{ marginBottom: 12 }} />
          <Text style={styles.emptyTitle}>No chats found</Text>
          <Text style={styles.emptyDesc}>
            {search ? "Try adjusting your search query." : "No active classroom chats or direct messages."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredRooms}
          keyExtractor={(item) => item.id}
          renderItem={renderRoomItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              colors={[colors.navy]}
              tintColor={colors.navy}
            />
          }
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
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backButton: {
    padding: spacing.xs,
    marginRight: spacing.xs,
  },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${colors.teal}12`,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  adminBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.navy,
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: spacing.xs,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.navy,
  },
  headerSub: {
    fontSize: 12,
    color: colors.teal,
    marginTop: 2,
  },
  logoutButton: {
    padding: spacing.sm,
  },
  searchContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.paper,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.navy,
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
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: 14,
    color: colors.teal,
    textAlign: "center",
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  roomItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  roomItemPressed: {
    backgroundColor: "#F8FAFC",
  },
  avatarContainer: {
    position: "relative",
  },
  typeBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.paper,
  },
  roomContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  roomHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  roomName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.navy,
    flex: 1,
    marginRight: spacing.sm,
  },
  roomTime: {
    fontSize: 11,
    color: colors.teal,
  },
  roomFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  roomSubtitle: {
    fontSize: 13,
    color: colors.teal,
    flex: 1,
    marginRight: spacing.sm,
  },
  unreadBadge: {
    backgroundColor: colors.teal,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 5,
  },
  unreadText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: "700",
  },
  tagRow: {
    flexDirection: "row",
    marginTop: 6,
  },
  noticeTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${colors.navy}08`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  noticeTagText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.navy,
  },
  chevron: {
    marginLeft: spacing.sm,
  },
});
