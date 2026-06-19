import { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Info,
  Send,
  Plus,
  Pin,
  Trash2,
  Check,
  CheckCheck,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Video as VideoIcon,
  X,
  Eye,
  Megaphone,
} from "lucide-react-native";
import { api, ApiError } from "@/api/client";
import { useSession } from "@/auth/session-store";
import { colors, spacing, font, radius } from "@/theme/tokens";
import { AvatarBadge } from "@/components/ui";

export default function ChatRoomScreen() {
  const { roomId, roomType, name: initialName, chatMode: initialChatMode } = useLocalSearchParams<{
    roomId: string;
    roomType: "classroom" | "teacher_channel" | "direct_message";
    name: string;
    chatMode?: "announcement" | "open";
  }>();

  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useSession((state) => state.user);

  const [inputText, setInputText] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<any | null>(null);
  const [showMessageInfo, setShowMessageInfo] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  
  // List of receipts for the selected message info modal
  const [messageReceipts, setMessageReceipts] = useState<any[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  // ─── Queries ───
  
  // Fetch messages in this room
  const { data: messages = [], isLoading, refetch } = useQuery({
    queryKey: ["chatMessages", roomId],
    queryFn: () => api.chatMessages(roomId, roomType),
    refetchInterval: 5000, // Poll every 5 seconds for new messages
  });

  // Fetch classroom students for mentions (if classroom)
  const { data: classStudents = [] } = useQuery({
    queryKey: ["classStudents", roomId],
    queryFn: async () => {
      if (roomType !== "classroom") return [];
      const res = await api.classStudents(roomId);
      return res.data;
    },
    enabled: roomType === "classroom",
  });

  // Mark room as read on load
  const markReadMutation = useMutation({
    mutationFn: () => api.chatMarkRead(roomId),
    onSuccess: () => {
      // Invalidate rooms to clear unread badges in inbox
      queryClient.invalidateQueries({ queryKey: ["chatRooms"] });
    },
  });

  useEffect(() => {
    markReadMutation.mutate();
  }, [roomId]);

  // Send Message Mutation
  const sendMessageMutation = useMutation({
    mutationFn: (input: { content: string; attachments?: any[]; mentions?: string[] }) =>
      api.chatSendMessage(roomId, {
        roomType,
        content: input.content,
        attachments: input.attachments,
        mentions: input.mentions,
      }),
    onSuccess: () => {
      setInputText("");
      refetch();
      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 200);
    },
    onError: (err: any) => {
      Alert.alert("Error", err instanceof ApiError ? err.message : "Failed to send message");
    },
  });

  // Pin Message Mutation
  const pinMutation = useMutation({
    mutationFn: (messageId: string) => api.chatPinMessage(messageId),
    onSuccess: () => {
      refetch();
      setSelectedMessage(null);
    },
  });

  // Unpin Message Mutation
  const unpinMutation = useMutation({
    mutationFn: (messageId: string) => api.chatUnpinMessage(messageId),
    onSuccess: () => {
      refetch();
      setSelectedMessage(null);
    },
  });

  // Delete Message Mutation
  const deleteMutation = useMutation({
    mutationFn: (messageId: string) => api.chatDeleteMessage(messageId),
    onSuccess: () => {
      refetch();
      setSelectedMessage(null);
    },
  });

  // ─── Helper Computations ───

  const isTeacherOrAdmin = useMemo(() => {
    return user?.role === "teacher" || user?.role === "school_admin";
  }, [user]);

  const isDisabled = useMemo(() => {
    if (roomType === "classroom" && initialChatMode === "announcement" && !isTeacherOrAdmin) {
      return true;
    }
    return false;
  }, [roomType, initialChatMode, isTeacherOrAdmin]);

  const pinnedMessage = useMemo(() => {
    return messages.find((m: any) => m.isPinned);
  }, [messages]);

  const mentionSuggestions = useMemo(() => {
    if (!showMentions) return [];
    const parts = inputText.split("@");
    const lastPart = parts[parts.length - 1];
    if (!lastPart) return classStudents; // Show all if empty @
    return classStudents.filter((student: any) =>
      student.name.toLowerCase().includes(lastPart.toLowerCase())
    );
  }, [inputText, showMentions, classStudents]);

  // ─── Handlers ───

  const handleSend = () => {
    if (!inputText.trim()) return;

    // Parse mentions
    const mentions: string[] = [];
    const parts = inputText.split("@");
    if (parts.length > 1) {
      parts.slice(1).forEach((part) => {
        const studentName = part.trim().split(" ")[0];
        const match = classStudents.find(
          (s: any) => s.name.toLowerCase().replace(/\s+/g, "") === studentName.toLowerCase()
        );
        if (match) {
          mentions.push(match.id);
        }
      });
    }

    sendMessageMutation.mutate({ content: inputText, mentions });
  };

  const handleInputChange = (text: string) => {
    setInputText(text);
    if (roomType === "classroom" && text.includes("@")) {
      const parts = text.split("@");
      const lastPart = parts[parts.length - 1];
      // Only show suggestions if there is no space after the last @
      if (!lastPart.includes(" ")) {
        setShowMentions(true);
      } else {
        setShowMentions(false);
      }
    } else {
      setShowMentions(false);
    }
  };

  const handleSelectMention = (student: any) => {
    const parts = inputText.split("@");
    parts.pop(); // Remove last partial mention query
    const newText = parts.join("@") + `@${student.name.replace(/\s+/g, "")} `;
    setInputText(newText);
    setShowMentions(false);
  };

  const handleSimulateAttachment = (type: "image" | "video" | "document") => {
    setShowAttachmentMenu(false);
    
    // Simulate uploading a file by calling API with mock attachments
    const mockFileNames = {
      image: "photo_receipt.png",
      video: "class_activity.mp4",
      document: "syllabus_2026.pdf",
    };

    const mockSizes = {
      image: 1024 * 350,
      video: 1024 * 1024 * 8,
      document: 1024 * 120,
    };

    Alert.alert(
      `Attach ${type.toUpperCase()}`,
      `Simulate uploading ${mockFileNames[type]}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Upload",
          onPress: () => {
            sendMessageMutation.mutate({
              content: `📎 Sent attachment: ${mockFileNames[type]}`,
              attachments: [
                {
                  type,
                  url: `https://storage.whiteroom.in/${type}s/${Date.now()}_${mockFileNames[type]}`,
                  name: mockFileNames[type],
                  size: mockSizes[type],
                },
              ],
            });
          },
        },
      ]
    );
  };

  const handleOpenMessageInfo = async (msg: any) => {
    setSelectedMessage(null);
    setShowMessageInfo(true);
    setLoadingReceipts(true);
    try {
      const receipts = await api.chatGetReceipts(msg.id);
      setMessageReceipts(receipts);
    } catch (err) {
      console.error("Failed to load receipts", err);
      setMessageReceipts([]);
    } finally {
      setLoadingReceipts(false);
    }
  };

  const formatMessageTime = (dateStr: string | Date) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  // ─── Rendering Message Bubbles ───

  const renderMessageItem = ({ item }: { item: any }) => {
    const isMe = item.senderId === user?.id;

    return (
      <Pressable
        onLongPress={() => {
          setSelectedMessage(item);
        }}
        style={[
          styles.messageRow,
          isMe ? styles.messageRowRight : styles.messageRowLeft,
        ]}
      >
        <View style={[styles.bubble, isMe ? styles.bubbleRight : styles.bubbleLeft]}>
          {/* Sender Name in group chats */}
          {!isMe && roomType !== "direct_message" && (
            <Text style={styles.senderName}>{item.senderName || "User"}</Text>
          )}

          {/* Attachments */}
          {item.attachments && item.attachments.map((att: any, idx: number) => (
            <View key={idx} style={styles.attachmentBox}>
              {att.type === "image" ? (
                <ImageIcon size={20} color={colors.teal} style={{ marginRight: 8 }} />
              ) : att.type === "video" ? (
                <VideoIcon size={20} color={colors.teal} style={{ marginRight: 8 }} />
              ) : (
                <FileText size={20} color={colors.teal} style={{ marginRight: 8 }} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.attachmentName} numberOfLines={1}>{att.name}</Text>
                <Text style={styles.attachmentSize}>
                  {(att.size / 1024).toFixed(1)} KB
                </Text>
              </View>
            </View>
          ))}

          <Text style={styles.messageText}>{item.content}</Text>

          <View style={styles.bubbleMeta}>
            {item.isPinned && (
              <Pin size={10} color={colors.teal} style={{ marginRight: 4 }} />
            )}
            <Text style={styles.messageTime}>{formatMessageTime(item.createdAt)}</Text>
            {isMe && (
              <View style={{ marginLeft: 4 }}>
                {roomType === "direct_message" ? (
                  // Double blue ticks if read, else double grey ticks
                  <CheckCheck size={14} color={colors.teal} />
                ) : (
                  <CheckCheck size={14} color={colors.teal} />
                )}
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
        >
          <ArrowLeft color={colors.navy} size={24} />
        </Pressable>

        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {initialName}
          </Text>
          <Text style={styles.headerSub}>
            {roomType === "direct_message"
              ? "1-on-1 discussion"
              : roomType === "teacher_channel"
              ? "Staff private coordination"
              : initialChatMode === "announcement"
              ? "Notice Board (Teachers post only)"
              : "Open Discussion"}
          </Text>
        </View>

        <Pressable
          onPress={() => {
            router.push(`/chat/info?roomId=${roomId}&roomType=${roomType}&name=${encodeURIComponent(initialName)}` as any);
          }}
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
        >
          <Info color={colors.teal} size={22} />
        </Pressable>
      </View>

      {/* Pinned Message Banner */}
      {pinnedMessage && (
        <View style={styles.pinnedBanner}>
          <Pin size={14} color={colors.teal} style={{ marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.pinnedTitle}>Pinned Message</Text>
            <Text style={styles.pinnedText} numberOfLines={1}>
              {pinnedMessage.content}
            </Text>
          </View>
          {isTeacherOrAdmin && (
            <Pressable
              onPress={() => unpinMutation.mutate(pinnedMessage.id)}
              style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            >
              <X size={16} color={colors.teal} />
            </Pressable>
          )}
        </View>
      )}

      {/* Messages Thread */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessageItem}
          contentContainerStyle={styles.listContent}
          onLayout={() => {
            // Scroll to end when messages are loaded
            if (messages.length > 0) {
              flatListRef.current?.scrollToEnd({ animated: false });
            }
          }}
        />
      )}

      {/* Mention Dropdown Suggestions */}
      {showMentions && mentionSuggestions.length > 0 && (
        <View style={styles.mentionsContainer}>
          <Text style={styles.mentionsHeader}>Classroom Members</Text>
          <ScrollView style={{ maxHeight: 150 }}>
            {mentionSuggestions.map((student: any) => (
              <Pressable
                key={student.id}
                onPress={() => handleSelectMention(student)}
                style={styles.mentionRow}
              >
                <AvatarBadge label={student.name} small />
                <Text style={styles.mentionName}>{student.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Input / Post Control */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={80}
      >
        {isDisabled ? (
          <View style={styles.disabledInputBar}>
            <Megaphone size={18} color={colors.navy} style={{ marginRight: 8 }} />
            <Text style={styles.disabledInputText}>
              Only teachers can post in this notice board.
            </Text>
          </View>
        ) : (
          <View style={styles.inputContainer}>
            <Pressable
              onPress={() => setShowAttachmentMenu(true)}
              style={styles.attachBtn}
            >
              <Plus color={colors.teal} size={22} />
            </Pressable>

            <TextInput
              style={styles.input}
              placeholder={roomType === "direct_message" ? "Message..." : "Message group..."}
              value={inputText}
              onChangeText={handleInputChange}
              multiline
            />

            <Pressable
              onPress={handleSend}
              disabled={!inputText.trim()}
              style={[
                styles.sendBtn,
                !inputText.trim() && styles.sendBtnDisabled,
              ]}
            >
              <Send color={colors.white} size={18} />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* ─── Message Options Bottom Sheet/Modal ─── */}
      <Modal
        visible={selectedMessage !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMessage(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setSelectedMessage(null)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalHeader}>Message Options</Text>
            
            {/* Pin Message Option */}
            {isTeacherOrAdmin && (
              <Pressable
                onPress={() => {
                  if (selectedMessage.isPinned) {
                    unpinMutation.mutate(selectedMessage.id);
                  } else {
                    pinMutation.mutate(selectedMessage.id);
                  }
                }}
                style={styles.modalOption}
              >
                <Pin size={18} color={colors.navy} style={{ marginRight: 12 }} />
                <Text style={styles.modalOptionText}>
                  {selectedMessage?.isPinned ? "Unpin Message" : "Pin Message"}
                </Text>
              </Pressable>
            )}

            {/* Read Receipts Info (seen count) Option */}
            {isTeacherOrAdmin && (
              <Pressable
                onPress={() => handleOpenMessageInfo(selectedMessage)}
                style={styles.modalOption}
              >
                <Eye size={18} color={colors.navy} style={{ marginRight: 12 }} />
                <Text style={styles.modalOptionText}>Message Info (Seen Count)</Text>
              </Pressable>
            )}

            {/* Delete Message Option */}
            {(selectedMessage?.senderId === user?.id || isTeacherOrAdmin) && (
              <Pressable
                onPress={() => {
                  Alert.alert(
                    "Delete Message",
                    "Are you sure you want to delete this message?",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => deleteMutation.mutate(selectedMessage.id),
                      },
                    ]
                  );
                }}
                style={styles.modalOption}
              >
                <Trash2 size={18} color={colors.danger} style={{ marginRight: 12 }} />
                <Text style={[styles.modalOptionText, { color: colors.danger }]}>
                  Delete Message
                </Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* ─── Seen Receipts Modal ─── */}
      <Modal
        visible={showMessageInfo}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMessageInfo(false)}
      >
        <View style={styles.receiptsModalOverlay}>
          <View style={styles.receiptsModalContent}>
            <View style={styles.receiptsHeader}>
              <Text style={styles.receiptsTitle}>Seen Receipts</Text>
              <Pressable onPress={() => setShowMessageInfo(false)}>
                <X size={24} color={colors.navy} />
              </Pressable>
            </View>

            {loadingReceipts ? (
              <ActivityIndicator size="large" color={colors.navy} style={{ margin: 40 }} />
            ) : messageReceipts.length === 0 ? (
              <View style={styles.emptyReceipts}>
                <Check size={36} color={colors.teal} style={{ marginBottom: 8 }} />
                <Text style={styles.emptyReceiptsText}>No one has read this message yet.</Text>
              </View>
            ) : (
              <FlatList
                data={messageReceipts}
                keyExtractor={(item) => item.userId}
                contentContainerStyle={{ paddingBottom: spacing.lg }}
                renderItem={({ item }) => (
                  <View style={styles.receiptRow}>
                    <AvatarBadge label={item.userName || "User"} small />
                    <View style={{ flex: 1, marginLeft: spacing.sm }}>
                      <Text style={styles.receiptName}>{item.userName || "User"}</Text>
                      <Text style={styles.receiptRole}>{item.userRole}</Text>
                    </View>
                    <Text style={styles.receiptTime}>
                      {new Date(item.readAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ─── Attachment Menu Modal ─── */}
      <Modal
        visible={showAttachmentMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAttachmentMenu(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowAttachmentMenu(false)}
        >
          <View style={styles.attachmentSheet}>
            <Text style={styles.attachmentSheetHeader}>Send Attachment</Text>
            
            <View style={styles.attachmentGrid}>
              <Pressable
                onPress={() => handleSimulateAttachment("image")}
                style={styles.attachmentGridItem}
              >
                <View style={[styles.attachmentIconBox, { backgroundColor: "#ECFDF5" }]}>
                  <ImageIcon size={24} color="#10B981" />
                </View>
                <Text style={styles.attachmentLabel}>Photo / Gallery</Text>
              </Pressable>

              <Pressable
                onPress={() => handleSimulateAttachment("video")}
                style={styles.attachmentGridItem}
              >
                <View style={[styles.attachmentIconBox, { backgroundColor: "#EFF6FF" }]}>
                  <VideoIcon size={24} color="#3B82F6" />
                </View>
                <Text style={styles.attachmentLabel}>Video</Text>
              </Pressable>

              <Pressable
                onPress={() => handleSimulateAttachment("document")}
                style={styles.attachmentGridItem}
              >
                <View style={[styles.attachmentIconBox, { backgroundColor: "#FEF3C7" }]}>
                  <FileText size={24} color="#D97706" />
                </View>
                <Text style={styles.attachmentLabel}>Document</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#E5DDD5", // Traditional WhatsApp Chat Background colour
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
  iconBtn: {
    padding: spacing.xs,
  },
  headerText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.navy,
  },
  headerSub: {
    fontSize: 11,
    color: colors.teal,
    marginTop: 2,
  },
  pinnedBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  pinnedTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.navy,
  },
  pinnedText: {
    fontSize: 12,
    color: colors.teal,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  messageRow: {
    flexDirection: "row",
    marginBottom: 8,
    width: "100%",
  },
  messageRowLeft: {
    justifyContent: "flex-start",
  },
  messageRowRight: {
    justifyContent: "flex-end",
  },
  bubble: {
    maxWidth: "80%",
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  bubbleLeft: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 0,
  },
  bubbleRight: {
    backgroundColor: "#D9FDD3", // WhatsApp green bubble color
    borderTopRightRadius: 0,
  },
  senderName: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.navy,
    marginBottom: 2,
  },
  messageText: {
    fontSize: 15,
    color: colors.navy,
    lineHeight: 20,
  },
  bubbleMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 4,
  },
  messageTime: {
    fontSize: 10,
    color: colors.teal,
  },
  attachmentBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: 4,
  },
  attachmentName: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.navy,
  },
  attachmentSize: {
    fontSize: 10,
    color: colors.teal,
  },
  disabledInputBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  disabledInputText: {
    fontSize: 13,
    color: colors.navy,
    fontWeight: "600",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.paper,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  attachBtn: {
    padding: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    marginHorizontal: spacing.xs,
    fontSize: 15,
    maxHeight: 100,
    color: colors.navy,
  },
  sendBtn: {
    backgroundColor: colors.teal,
    borderRadius: 22,
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtnDisabled: {
    backgroundColor: `${colors.teal}50`,
  },
  mentionsContainer: {
    backgroundColor: colors.paper,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  mentionsHeader: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.teal,
    marginBottom: spacing.xs,
  },
  mentionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  mentionName: {
    fontSize: 14,
    color: colors.navy,
    marginLeft: spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  modalHeader: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.navy,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  modalOptionText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.navy,
  },
  receiptsModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  receiptsModalContent: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    maxHeight: "80%",
  },
  receiptsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  receiptsTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.navy,
  },
  emptyReceipts: {
    alignItems: "center",
    padding: spacing.xl,
  },
  emptyReceiptsText: {
    fontSize: 14,
    color: colors.teal,
    textAlign: "center",
  },
  receiptRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  receiptName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.navy,
  },
  receiptRole: {
    fontSize: 12,
    color: colors.teal,
  },
  receiptTime: {
    fontSize: 12,
    color: colors.teal,
  },
  attachmentSheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  attachmentSheetHeader: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.navy,
    marginBottom: spacing.lg,
    textAlign: "center",
  },
  attachmentGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingBottom: spacing.md,
  },
  attachmentGridItem: {
    alignItems: "center",
    width: 90,
  },
  attachmentIconBox: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  attachmentLabel: {
    fontSize: 12,
    color: colors.navy,
    textAlign: "center",
  },
});
