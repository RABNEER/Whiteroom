import { useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  Switch,
  ActivityIndicator,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Users,
  Megaphone,
  VolumeX,
  Volume2,
  UserX,
  Shield,
  BookOpen,
} from "lucide-react-native";
import { api, ApiError } from "@/api/client";
import { useSession } from "@/auth/session-store";
import { colors, spacing, font, radius } from "@/theme/tokens";
import { AvatarBadge, Card } from "@/components/ui";

export default function ChatInfoScreen() {
  const { roomId, roomType, name } = useLocalSearchParams<{
    roomId: string;
    roomType: "classroom" | "teacher_channel" | "direct_message";
    name: string;
  }>();

  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useSession((state) => state.user);

  // States
  const [muted, setMuted] = useState(false);

  // ─── Queries ───

  // Fetch Class details (including chatMode) if classroom
  const { data: classDetail, isLoading: isLoadingClass, refetch: refetchClass } = useQuery({
    queryKey: ["classDetail", roomId],
    queryFn: async () => {
      if (roomType !== "classroom") return null;
      // Fetch all classes and find the current one
      const res = await api.classes();
      return res.data.find((c: any) => c.id === roomId) || null;
    },
    enabled: roomType === "classroom",
  });

  // Fetch Classroom Students
  const { data: members = [], isLoading: isLoadingMembers } = useQuery({
    queryKey: ["classMembers", roomId],
    queryFn: async () => {
      if (roomType !== "classroom") return [];
      const res = await api.classStudents(roomId);
      return res.data;
    },
    enabled: roomType === "classroom",
  });

  // Fetch Blocked list if DM to check if blocked
  const { data: blockedUsers = [], refetch: refetchBlocked } = useQuery({
    queryKey: ["blockedUsers"],
    queryFn: api.chatListBlocked,
    enabled: roomType === "direct_message",
  });

  // ─── Mutations ───

  // Toggle Announcement Mode Mutation
  const updateClassMutation = useMutation({
    mutationFn: (chatMode: "announcement" | "open") =>
      api.classUpdate(roomId, { chatMode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classDetail", roomId] });
      queryClient.invalidateQueries({ queryKey: ["chatMessages", roomId] });
      queryClient.invalidateQueries({ queryKey: ["chatRooms"] });
      refetchClass();
    },
    onError: (err: any) => {
      Alert.alert("Error", err instanceof ApiError ? err.message : "Failed to update classroom settings");
    },
  });

  // Block User Mutation
  const blockMutation = useMutation({
    mutationFn: (blockedUserId: string) => api.chatBlockUser(blockedUserId),
    onSuccess: () => {
      refetchBlocked();
      Alert.alert("Blocked", "User has been blocked successfully.");
    },
    onError: (err: any) => {
      Alert.alert("Error", err instanceof ApiError ? err.message : "Failed to block user");
    },
  });

  // Unblock User Mutation
  const unblockMutation = useMutation({
    mutationFn: (blockedUserId: string) => api.chatUnblockUser(blockedUserId),
    onSuccess: () => {
      refetchBlocked();
      Alert.alert("Unblocked", "User has been unblocked.");
    },
    onError: (err: any) => {
      Alert.alert("Error", err instanceof ApiError ? err.message : "Failed to unblock user");
    },
  });

  // ─── Helper Computations ───

  const isTeacherOrAdmin = useMemo(() => {
    return user?.role === "teacher" || user?.role === "school_admin";
  }, [user]);

  const isBlocked = useMemo(() => {
    if (roomType !== "direct_message" || !roomId) return false;
    // For direct message, find if the other participant is blocked
    // The other participant's ID is retrieved from classDetail or we can find it in blockedUsers
    // Wait, in DMs, the other user ID is participant1 or participant2. 
    // In our chatRooms response we have item.otherParticipant.id. Let's find it.
    // If the roomId itself is listed as blocked or other user id is blocked:
    // Let's check blockedUsers list.
    return blockedUsers.some((b: any) => b.blockedUserId === roomId || b.id === roomId);
  }, [blockedUsers, roomType, roomId]);

  const otherParticipantId = useMemo(() => {
    if (roomType !== "direct_message") return null;
    // Let's assume roomId is the DM room ID. The other participant is blocked/unblocked by passing their user ID.
    // Let's look up active chatRooms to retrieve other participant ID.
    const rooms = queryClient.getQueryData<any[]>(["chatRooms"]) || [];
    const currentRoom = rooms.find((r: any) => r.id === roomId);
    return currentRoom?.otherParticipant?.id || null;
  }, [roomId, roomType, queryClient]);

  const otherParticipantBlocked = useMemo(() => {
    if (!otherParticipantId) return false;
    return blockedUsers.some((b: any) => b.blockedUserId === otherParticipantId);
  }, [blockedUsers, otherParticipantId]);

  // ─── Handlers ───

  const handleToggleAnnouncementMode = (value: boolean) => {
    const chatMode = value ? "announcement" : "open";
    updateClassMutation.mutate(chatMode);
  };

  const handleToggleMute = () => {
    setMuted(!muted);
    Alert.alert("Notifications", muted ? "Unmuted group notifications" : "Notifications muted for 8 hours");
  };

  const handleBlockToggle = () => {
    if (!otherParticipantId) return;

    if (otherParticipantBlocked) {
      unblockMutation.mutate(otherParticipantId);
    } else {
      Alert.alert(
        "Block User",
        "Blocking this user will prevent them from sending direct messages to you. Block this user?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Block",
            style: "destructive",
            onPress: () => blockMutation.mutate(otherParticipantId),
          },
        ]
      );
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
        >
          <ArrowLeft color={colors.navy} size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>Details & Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <AvatarBadge label={name || "Class"} />
          <Text style={styles.roomName}>{name}</Text>
          <Text style={styles.roomType}>
            {roomType === "classroom"
              ? "Classroom Group"
              : roomType === "teacher_channel"
              ? "Staff Private Room"
              : "Direct Message"}
          </Text>
        </View>

        {/* Group Controls (Mute / Notifications) */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Preferences</Text>
          <Card style={styles.card}>
            <Pressable onPress={handleToggleMute} style={styles.row}>
              <View style={styles.rowLeft}>
                {muted ? (
                  <Volume2 size={20} color={colors.teal} style={{ marginRight: 12 }} />
                ) : (
                  <VolumeX size={20} color={colors.teal} style={{ marginRight: 12 }} />
                )}
                <Text style={styles.rowText}>Mute Notifications</Text>
              </View>
              <Switch value={muted} onValueChange={handleToggleMute} />
            </Pressable>
          </Card>
        </View>

        {/* Classroom specific settings (Announcement Mode) */}
        {roomType === "classroom" && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Classroom Management</Text>
            <Card style={styles.card}>
              <View style={styles.row}>
                <View style={styles.rowLeft}>
                  <Megaphone size={20} color={colors.teal} style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowText}>Announcement Mode Only</Text>
                    <Text style={styles.rowDescription}>
                      Only teachers can post updates. Students and parents can only read.
                    </Text>
                  </View>
                </View>
                <Switch
                  value={classDetail?.chatMode === "announcement"}
                  disabled={!isTeacherOrAdmin}
                  onValueChange={handleToggleAnnouncementMode}
                />
              </View>
            </Card>
          </View>
        )}

        {/* Direct Message specific settings (Block/Unblock) */}
        {roomType === "direct_message" && otherParticipantId && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Security</Text>
            <Card style={styles.card}>
              <Pressable onPress={handleBlockToggle} style={styles.row}>
                <View style={styles.rowLeft}>
                  <UserX size={20} color={colors.danger} style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowText, { color: colors.danger }]}>
                      {otherParticipantBlocked ? "Unblock User" : "Block User"}
                    </Text>
                    <Text style={styles.rowDescription}>
                      Prevent this user from messaging you directly.
                    </Text>
                  </View>
                </View>
              </Pressable>
            </Card>
          </View>
        )}

        {/* Roster / Members list for classroom */}
        {roomType === "classroom" && (
          <View style={styles.section}>
            <View style={styles.membersHeaderRow}>
              <Text style={styles.sectionHeader}>Classroom Members</Text>
              <View style={styles.countBadge}>
                <Users size={12} color={colors.teal} style={{ marginRight: 4 }} />
                <Text style={styles.countBadgeText}>{members.length} Members</Text>
              </View>
            </View>

            {isLoadingMembers ? (
              <ActivityIndicator size="small" color={colors.navy} style={{ margin: 20 }} />
            ) : members.length === 0 ? (
              <Text style={styles.emptyMembersText}>No members enrolled in this classroom.</Text>
            ) : (
              <Card style={[styles.card, { paddingVertical: 0 }]}>
                {members.map((member: any, idx: number) => (
                  <View
                    key={member.id}
                    style={[
                      styles.memberRow,
                      idx < members.length - 1 && styles.memberRowBorder,
                    ]}
                  >
                    <AvatarBadge label={member.name} small />
                    <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                      <Text style={styles.memberName}>{member.name}</Text>
                      {member.rollNumber ? (
                        <Text style={styles.memberRoll}>Roll No: {member.rollNumber}</Text>
                      ) : (
                        <Text style={styles.memberRoll}>Student</Text>
                      )}
                    </View>
                    {isTeacherOrAdmin && (
                      <View style={styles.studentRoleBadge}>
                        <Text style={styles.studentRoleBadgeText}>Student</Text>
                      </View>
                    )}
                  </View>
                ))}
              </Card>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.paper,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.navy,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  profileCard: {
    alignItems: "center",
    backgroundColor: colors.paper,
    paddingVertical: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    marginBottom: spacing.md,
  },
  roomName: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.navy,
    marginTop: spacing.md,
  },
  roomType: {
    fontSize: 13,
    color: colors.teal,
    marginTop: 4,
  },
  section: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.teal,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    padding: spacing.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  rowText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.navy,
  },
  rowDescription: {
    fontSize: 12,
    color: colors.teal,
    marginTop: 2,
  },
  membersHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  countBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${colors.teal}12`,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.teal,
  },
  emptyMembersText: {
    fontSize: 14,
    color: colors.teal,
    textAlign: "center",
    marginVertical: spacing.md,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  memberRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  memberName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.navy,
  },
  memberRoll: {
    fontSize: 12,
    color: colors.teal,
    marginTop: 2,
  },
  studentRoleBadge: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  studentRoleBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.teal,
  },
});
