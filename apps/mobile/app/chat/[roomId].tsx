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
  Clock,
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
  Smile,
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

  // Auto-scroll to bottom on message list update (including optimistic inserts)
  useEffect(() => {
    if (messages.length > 0) {
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [messages.length]);

  // Send Message Mutation
  const sendMessageMutation = useMutation({
    mutationFn: (input: { content: string; attachments?: any[]; mentions?: string[] }) =>
      api.chatSendMessage(roomId, {
        roomType,
        content: input.content,
        attachments: input.attachments,
        mentions: input.mentions,
      }),
    onMutate: async (newMsgInput) => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ["chatMessages", roomId] });

      // Snapshot the previous messages
      const previousMessages = queryClient.getQueryData<any[]>(["chatMessages", roomId]) || [];

      // Create a temporary optimistic message
      const optimisticMsg = {
        id: `temp-${Date.now()}`,
        content: newMsgInput.content,
        senderId: user?.id,
        senderName: (user as any)?.name || "Me",
        sender: {
          id: user?.id,
          name: (user as any)?.name || "Me",
          role: user?.role || "user",
        },
        createdAt: new Date().toISOString(),
        isOptimistic: true,
        attachments: newMsgInput.attachments || [],
        mentions: newMsgInput.mentions || [],
      };

      // Optimistically update to the new list
      queryClient.setQueryData(["chatMessages", roomId], [...previousMessages, optimisticMsg]);

      // Return context with previous messages for rollback
      return { previousMessages };
    },
    onError: (err: any, newMsgInput, context: any) => {
      // Rollback to snapshotted messages
      if (context?.previousMessages) {
        queryClient.setQueryData(["chatMessages", roomId], context.previousMessages);
      }
      Alert.alert("Error", err instanceof ApiError ? err.message : "Failed to send message");
    },
    onSettled: () => {
      // Refetch from server to sync actual states
      queryClient.invalidateQueries({ queryKey: ["chatMessages", roomId] });
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

    const textToSend = inputText;
    setInputText(""); // Clear input field instantly

    // Scroll to bottom instantly
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 60);

    // Parse mentions
    const mentions: string[] = [];
    const parts = textToSend.split("@");
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

    sendMessageMutation.mutate({ content: textToSend, mentions });
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
        {!isMe && (
          <View style={styles.avatarContainer}>
            <AvatarBadge label={item.senderName || "User"} size={32} />
          </View>
        )}
        <View style={[
          styles.bubble,
          isMe ? styles.bubbleRight : styles.bubbleLeft,
          item.attachments && item.attachments.length > 0 && styles.bubbleWithAttachment
        ]}>
          {/* Sender Name in group chats */}
          {!isMe && roomType !== "direct_message" && (
            <Text style={styles.senderName}>{item.senderName || "User"}</Text>
          )}

          {/* Attachments */}
          {item.attachments && item.attachments.map((att: any, idx: number) => (
            <View key={idx} style={[styles.attachmentBox, isMe && styles.attachmentBoxRight]}>
              {att.type === "image" ? (
                <ImageIcon size={18} color={isMe ? colors.white : "#3B82F6"} style={{ marginRight: 8 }} />
              ) : att.type === "video" ? (
                <VideoIcon size={18} color={isMe ? colors.white : "#3B82F6"} style={{ marginRight: 8 }} />
              ) : (
                <FileText size={18} color={isMe ? colors.white : "#3B82F6"} style={{ marginRight: 8 }} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.attachmentName, isMe && styles.attachmentNameRight]} numberOfLines={1}>
                  {att.name}
                </Text>
                <Text style={[styles.attachmentSize, isMe && styles.attachmentSizeRight]}>
                  {(att.size / 1024).toFixed(1)} KB
                </Text>
              </View>
            </View>
          ))}

          <Text style={[styles.messageText, isMe ? styles.messageTextRight : styles.messageTextLeft]}>
            {item.content}
          </Text>

          <View style={styles.bubbleMeta}>
            {item.isPinned && (
              <Pin size={10} color={isMe ? "rgba(255, 255, 255, 0.8)" : "#64748B"} style={{ marginRight: 4 }} />
            )}
            <Text style={[styles.messageTime, isMe ? styles.messageTimeRight : styles.messageTimeLeft]}>
              {formatMessageTime(item.createdAt)}
            </Text>
            {isMe && (
              <View style={{ marginLeft: 4 }}>
                {item.isOptimistic ? (
                  <Clock size={12} color="rgba(255, 255, 255, 0.6)" />
                ) : (
                  <CheckCheck size={14} color="rgba(255, 255, 255, 0.9)" />
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
      {/* Abstract Background Glows for Premium Aesthetic */}
      <View style={styles.bgGlow1} pointerEvents="none" />
      <View style={styles.bgGlow2} pointerEvents="none" />
      <View style={styles.bgGlow3} pointerEvents="none" />

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
          initialNumToRender={20}
          maxToRenderPerBatch={10}
          windowSize={10}
          removeClippedSubviews={Platform.OS === "android"}
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
            {/* WhatsApp-style Input Pill */}
            <View style={styles.inputPill}>
              <Pressable
                style={styles.emojiBtn}
                onPress={() => {}}
              >
                <Smile color="#64748B" size={22} />
              </Pressable>

              <TextInput
                style={styles.input}
                placeholder={roomType === "direct_message" ? "Message" : "Message group"}
                placeholderTextColor="#94A3B8"
                value={inputText}
                onChangeText={handleInputChange}
                multiline
              />

              <Pressable
                onPress={() => setShowAttachmentMenu(true)}
                style={styles.attachBtn}
              >
                <Paperclip color="#64748B" size={20} />
              </Pressable>
            </View>

            {/* Separate Circle Send Button */}
            <Pressable
              onPress={handleSend}
              disabled={!inputText.trim()}
              style={[
                styles.sendBtn,
                !inputText.trim() && styles.sendBtnDisabled,
              ]}
            >
              <Send color={colors.white} size={18} style={{ marginLeft: 2 }} />
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
    backgroundColor: "#F1F5F9", 
  },
  bgGlow1: {
    position: "absolute",
    top: 100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "#6366F1",
    opacity: 0.04,
  },
  bgGlow2: {
    position: "absolute",
    bottom: 150,
    left: -100,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "#10B981",
    opacity: 0.05,
  },
  bgGlow3: {
    position: "absolute",
    top: "50%",
    left: "30%",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "#EC4899",
    opacity: 0.03,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: colors.paper,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  iconBtn: {
    padding: spacing.xs,
  },
  headerText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  headerSub: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 1,
  },
  pinnedBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF", 
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#DBEAFE",
  },
  pinnedTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1E40AF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pinnedText: {
    fontSize: 13,
    color: "#1E3A8A",
    marginTop: 1,
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
    marginBottom: 10,
    width: "100%",
  },
  messageRowLeft: {
    justifyContent: "flex-start",
  },
  messageRowRight: {
    justifyContent: "flex-end",
  },
  avatarContainer: {
    marginRight: 6,
    alignSelf: "flex-end", 
    marginBottom: 1,
  },
  bubble: {
    maxWidth: "78%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  bubbleLeft: {
    backgroundColor: colors.white,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 18,
  },
  bubbleRight: {
    backgroundColor: "#059669", 
    borderBottomRightRadius: 2,
    borderBottomLeftRadius: 18,
  },
  bubbleWithAttachment: {
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  senderName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#059669",
    marginBottom: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  messageTextLeft: {
    color: "#1E293B",
  },
  messageTextRight: {
    color: colors.white,
  },
  bubbleMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 6,
  },
  messageTime: {
    fontSize: 10,
    fontWeight: "500",
  },
  messageTimeLeft: {
    color: "#64748B",
  },
  messageTimeRight: {
    color: "rgba(255, 255, 255, 0.75)",
  },
  attachmentBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.03)",
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: 6,
  },
  attachmentBoxRight: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  attachmentName: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.navy,
  },
  attachmentNameRight: {
    color: colors.white,
  },
  attachmentSize: {
    fontSize: 10,
    color: colors.teal,
  },
  attachmentSizeRight: {
    color: "rgba(255, 255, 255, 0.7)",
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
    alignItems: "flex-end", // Aligns to bottom when input grows multiline
    marginHorizontal: 8,
    marginBottom: Platform.OS === "ios" ? 28 : 12,
    marginTop: 4,
    backgroundColor: "transparent",
  },
  inputPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end", // Align icons to bottom when text grows
    backgroundColor: "#FFFFFF",
    borderRadius: 25,
    paddingHorizontal: 8,
    paddingVertical: 5,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    minHeight: 48,
  },
  emojiBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 0,
  },
  attachBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 0,
  },
  input: {
    flex: 1,
    backgroundColor: "transparent",
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 16,
    maxHeight: 120,
    color: "#0F172A",
    textAlignVertical: "center",
  },
  sendBtn: {
    backgroundColor: "#00A884", // WhatsApp's modern green color
    borderRadius: 24,
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sendBtnDisabled: {
    backgroundColor: "#A0AEC0", // Matches the grayed out send button/mic look
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
