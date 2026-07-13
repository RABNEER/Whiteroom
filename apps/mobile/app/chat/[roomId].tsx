import { useState, useEffect, useRef, useMemo, memo } from "react";
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
  Image,
  Linking,
  PanResponder,
  Animated,
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
  Play,
  ArrowDown,
  Sparkles,
  Mic,
} from "lucide-react-native";
import { api, ApiError } from "@/api/client";
import { useSession } from "@/auth/session-store";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { colors, spacing, font, radius } from "@/theme/tokens";
import { AvatarBadge } from "@/components/ui";

const ChatImage = ({ uri, onPress }: { uri: string; onPress: () => void }) => {
  const [aspectRatio, setAspectRatio] = useState(3 / 2);

  useEffect(() => {
    if (!uri) return;
    Image.getSize(
      uri,
      (width, height) => {
        if (width && height) {
          setAspectRatio(width / height);
        }
      },
      () => {}
    );
  }, [uri]);

  const displayWidth = 240;
  const displayHeight = displayWidth / aspectRatio;
  const clampedHeight = Math.max(120, Math.min(320, displayHeight));

  return (
    <Pressable onPress={onPress}>
      <Image
        source={{ uri }}
        style={{
          width: displayWidth,
          height: clampedHeight,
          borderRadius: radius.md,
          backgroundColor: "#E2E8F0",
        }}
        resizeMode="cover"
      />
    </Pressable>
  );
};

const VoiceNotePlayer = ({ name, url, size, isMe }: { name: string; url: string; size: number; isMe: boolean }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const duration = 12; // simulated duration
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const togglePlay = () => {
    if (isPlaying) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      Linking.openURL(url).catch(() => {});
      intervalRef.current = setInterval(() => {
        setPosition((prev) => {
          if (prev >= duration) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    }
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs < 10 ? "0" : ""}${remainingSecs}`;
  };

  const progressPercent = (position / duration) * 100;

  return (
    <View style={[styles.voicePlayerContainer, isMe && styles.voicePlayerContainerRight]}>
      <Pressable onPress={togglePlay} style={styles.voicePlayButton}>
        {isPlaying ? (
          <X size={18} color={isMe ? colors.white : "#3B82F6"} />
        ) : (
          <Play size={18} color={isMe ? colors.white : "#3B82F6"} fill={isMe ? colors.white : "#3B82F6"} style={{ marginLeft: 2 }} />
        )}
      </Pressable>
      <View style={styles.voiceProgressArea}>
        <View style={styles.voiceProgressBarBg}>
          <View style={[styles.voiceProgressBarFill, { width: `${progressPercent}%` }]} />
        </View>
        <View style={styles.voiceMetaRow}>
          <Text style={[styles.voiceTimeText, isMe && styles.voiceTimeTextRight]}>
            {formatTime(position)} / {formatTime(duration)}
          </Text>
          <Text style={[styles.voiceSizeText, isMe && styles.voiceSizeTextRight]}>
            {((size || 0) / 1024).toFixed(1)} KB
          </Text>
        </View>
      </View>
    </View>
  );
};

const MessageBubble = memo(({ 
  item, 
  isMe, 
  roomType, 
  isTeacherOrAdmin, 
  onLongPress, 
  onSwipe, 
  onPlayVideo, 
  onOpenImage,
  formatMessageTime 
}: { 
  item: any; 
  isMe: boolean; 
  roomType: string; 
  isTeacherOrAdmin: boolean; 
  onLongPress: (item: any) => void; 
  onSwipe: (item: any) => void; 
  onPlayVideo: (url: string) => void; 
  onOpenImage: (url: string) => void;
  formatMessageTime: (date: string | Date) => string;
}) => {
  const swipeX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return Math.abs(gestureState.dx) > 15 && gestureState.dx > 0 && Math.abs(gestureState.dy) < 10;
      },
      onPanResponderMove: (evt, gestureState) => {
        const val = Math.min(60, Math.max(0, gestureState.dx));
        swipeX.setValue(val);
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dx > 50) {
          onSwipe(item);
        }
        Animated.spring(swipeX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  return (
    <Pressable
      onLongPress={() => onLongPress(item)}
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
      <Animated.View 
        {...panResponder.panHandlers}
        style={[
          { transform: [{ translateX: swipeX }] },
          styles.bubble,
          isMe ? styles.bubbleRight : styles.bubbleLeft,
          item.attachments && item.attachments.length > 0 && styles.bubbleWithAttachment
        ]}
      >
        {/* Sender Name in group chats */}
        {!isMe && roomType !== "direct_message" && (
          <Text style={styles.senderName}>{item.senderName || "User"}</Text>
        )}

        {/* Quoted Message Card */}
        {item.replyTo && (
          <View style={[styles.quotedBubbleCard, isMe ? styles.quotedBubbleCardRight : styles.quotedBubbleCardLeft]}>
            <View style={styles.quotedBar} />
            <View style={{ padding: 6, flex: 1 }}>
              <Text style={styles.quotedSenderName}>{item.replyTo.senderName}</Text>
              <Text style={styles.quotedText} numberOfLines={2}>{item.replyTo.text}</Text>
            </View>
          </View>
        )}

        {/* Attachments */}
        {item.attachments && item.attachments.map((att: any, idx: number) => {
          const attName = (att.name || "").toLowerCase();
          const isImage = att.type === "image" || 
            attName.endsWith(".png") || 
            attName.endsWith(".jpg") || 
            attName.endsWith(".jpeg") || 
            attName.endsWith(".gif") || 
            attName.endsWith(".webp");
          
          const isVideo = att.type === "video" || 
            attName.endsWith(".mp4") || 
            attName.endsWith(".m4v") || 
            attName.endsWith(".mov") || 
            attName.endsWith(".mkv");

          const isAudio = att.type === "audio" ||
            attName.endsWith(".mp3") ||
            attName.endsWith(".m4a") ||
            attName.endsWith(".wav") ||
            attName.endsWith(".ogg") ||
            attName.endsWith(".aac");

          const attSize = att.size || 0;

          if (isImage) {
            return (
              <View key={idx} style={styles.imageContainer}>
                <ChatImage uri={att.url} onPress={() => onOpenImage(att.url)} />
              </View>
            );
          }

          if (isVideo) {
            return (
              <View key={idx} style={styles.imageContainer}>
                <Pressable 
                  onPress={() => onPlayVideo(att.url)}
                  style={[styles.chatVideoContainer, isMe && styles.chatVideoContainerRight]}
                >
                  <View style={[styles.chatVideoPlaceholder, isMe && styles.chatVideoPlaceholderRight]}>
                    <VideoIcon size={32} color={isMe ? "rgba(255, 255, 255, 0.8)" : "#3B82F6"} />
                    <View style={styles.playOverlayButton}>
                      <Play size={16} color={colors.white} fill={colors.white} style={{ marginLeft: 2 }} />
                    </View>
                  </View>
                  <View style={styles.chatVideoMeta}>
                    <Text style={[styles.attachmentName, isMe && styles.attachmentNameRight]} numberOfLines={1}>
                      {att.name}
                    </Text>
                    <Text style={[styles.attachmentSize, isMe && styles.attachmentSizeRight]}>
                      Play Video • {(attSize / (1024 * 1024)).toFixed(1)} MB
                    </Text>
                  </View>
                </Pressable>
              </View>
            );
          }

          if (isAudio) {
            return (
              <VoiceNotePlayer key={idx} name={att.name} url={att.url} size={attSize} isMe={isMe} />
            );
          }

          return (
            <View key={idx} style={styles.imageContainer}>
              <Pressable 
                onPress={() => Linking.openURL(att.url)}
                style={[styles.attachmentBox, isMe && styles.attachmentBoxRight]}
              >
                <FileText size={18} color={isMe ? colors.white : "#3B82F6"} style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.attachmentName, isMe && styles.attachmentNameRight]} numberOfLines={1}>
                    {att.name}
                  </Text>
                  <Text style={[styles.attachmentSize, isMe && styles.attachmentSizeRight]}>
                    {(attSize / 1024).toFixed(1)} KB
                  </Text>
                </View>
              </Pressable>
            </View>
          );
        })}

        <Text style={[styles.messageText, isMe ? styles.messageTextRight : styles.messageTextLeft]}>
          {item.content}
        </Text>

        {/* Reaction badges */}
        {item.reactions && item.reactions.length > 0 && (
          <View style={[styles.reactionBadgeRow, isMe && styles.reactionBadgeRowRight]}>
            {item.reactions.slice(0, 3).map((r: string, rIdx: number) => (
              <View key={rIdx} style={styles.reactionMiniBadge}>
                <Text style={{ fontSize: 11 }}>{r}</Text>
              </View>
            ))}
            {item.reactions.length > 3 && (
              <View style={styles.reactionMiniBadge}>
                <Text style={{ fontSize: 9, fontWeight: "700", color: "#64748B" }}>+{item.reactions.length - 3}</Text>
              </View>
            )}
          </View>
        )}

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
              ) : item.readCount > 0 ? (
                <CheckCheck size={14} color="#34B7F1" /> // WhatsApp Blue ticks
              ) : (
                <CheckCheck size={14} color="rgba(255, 255, 255, 0.75)" /> // WhatsApp Grey ticks
              )}
            </View>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
});

const COMMON_EMOJIS = [
  "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", 
  "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", 
  "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🤩", 
  "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", 
  "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", 
  "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", 
  "🤔", "🤭", "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", 
  "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐", 
  "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠", "😈", 
  "👿", "👹", "👺", "🤡", "💩", "👻", "💀", "☠️", "👽", "👾", 
  "🤖", "🎃", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿", 
  "😾", "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", 
  "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", 
  "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", 
  "🤝", "🙏", "✍️", "💅", "🤳", "💪", "🦾", "🦿", "🦵", "🦶", 
  "👂", "🦻", "👃", "🧠", "🫀", "🫁", "🦷", "🦴", "👀", "👁️", 
  "👅", "👄", "💋", "🩸", "❤️", "🧡", "💛", "💚", "💙", "💜"
];

const AnimatedSendButton = ({
  onPress,
  disabled,
}: {
  onPress: () => void;
  disabled: boolean;
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const flightAnim = useRef(new Animated.Value(0)).current;

  const handlePressIn = () => {
    if (disabled) return;
    Animated.spring(scaleAnim, {
      toValue: 0.88,
      useNativeDriver: true,
      speed: 40,
      bounciness: 10,
    }).start();
  };

  const handlePressOut = () => {
    if (disabled) return;
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 14,
    }).start();
  };

  const handleSendPress = () => {
    if (disabled) return;
    flightAnim.setValue(0);
    Animated.sequence([
      Animated.timing(flightAnim, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(flightAnim, {
        toValue: 0,
        duration: 0,
        useNativeDriver: true,
      }),
    ]).start();
    onPress();
  };

  const flightTranslateX = flightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 14],
  });
  const flightTranslateY = flightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -14],
  });
  const flightOpacity = flightAnim.interpolate({
    inputRange: [0, 0.65, 1],
    outputRange: [1, 0.3, 0],
  });

  return (
    <Pressable
      onPress={handleSendPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[
        styles.sendBtnWrapper,
        !disabled ? styles.sendBtnWrapperActive : styles.sendBtnWrapperDisabled,
      ]}
    >
      <Animated.View
        style={[
          styles.sendBtnInner,
          !disabled ? styles.sendBtnInnerActive : styles.sendBtnInnerDisabled,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        {!disabled ? (
          <>
            <Animated.View
              style={{
                transform: [
                  { translateX: flightTranslateX },
                  { translateY: flightTranslateY },
                ],
                opacity: flightOpacity,
              }}
            >
              <Send
                color="#FFFFFF"
                size={20}
                style={{ marginLeft: 2, transform: [{ rotate: "-15deg" }] }}
              />
            </Animated.View>
            <View style={styles.sendSparkleBadge}>
              <Sparkles color="#FEF08A" size={10} />
            </View>
          </>
        ) : (
          <Mic color="#64748B" size={20} />
        )}
      </Animated.View>
    </Pressable>
  );
};

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
  const [isUploading, setIsUploading] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<any | null>(null);
  const [showMessageInfo, setShowMessageInfo] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<any | null>(null);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // List of receipts for the selected message info modal
  const [messageReceipts, setMessageReceipts] = useState<any[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const isCloseToBottomRef = useRef(true);

  const messagesCountRef = useRef(0);

  const handleScrollToBottom = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
    setUnreadCount(0);
    setShowScrollBottomBtn(false);
  };

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 150;
    const isClose = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
    isCloseToBottomRef.current = isClose;

    const isScrolledUp = contentOffset.y < contentSize.height - layoutMeasurement.height - 300;
    setShowScrollBottomBtn(isScrolledUp);
    if (!isScrolledUp) {
      setUnreadCount(0);
    }
  };

  // ─── Queries ───
  
  // Fetch messages in this room
  const { data: rawMessages, isLoading, refetch } = useQuery({
    queryKey: ["chatMessages", roomId],
    queryFn: () => api.chatMessages(roomId, roomType),
    refetchInterval: 5000, // Poll every 5 seconds for new messages
  });
  const messages = Array.isArray(rawMessages) ? rawMessages : [];

  useEffect(() => {
    if (!isCloseToBottomRef.current && messages.length > messagesCountRef.current && messagesCountRef.current > 0) {
      setUnreadCount((prev) => prev + (messages.length - messagesCountRef.current));
    }
    messagesCountRef.current = messages.length;
  }, [messages.length]);

  // Fetch classroom students for mentions (if classroom)
  const { data: rawClassStudents } = useQuery({
    queryKey: ["classStudents", roomId],
    queryFn: async () => {
      if (roomType !== "classroom") return [];
      const res = await api.classStudents(roomId);
      return res.data;
    },
    enabled: roomType === "classroom",
  });
  const classStudents = Array.isArray(rawClassStudents) ? rawClassStudents : [];

  // Fetch chat rooms to resolve a fallback classroom ID for DM attachment uploads
  const { data: rawRooms } = useQuery({
    queryKey: ["chatRooms"],
    queryFn: api.chatRooms,
    enabled: roomType !== "classroom",
  });
  const rooms = Array.isArray(rawRooms) ? rawRooms : [];

  const uploadClassId = useMemo(() => {
    if (roomType === "classroom") return roomId;
    const safeRooms = Array.isArray(rooms) ? rooms : [];
    const classroom = safeRooms.find((r) => r?.type === "classroom");
    return classroom ? classroom.id : null;
  }, [roomId, roomType, rooms]);

  const processedMessages = useMemo(() => {
    const safeMessages = Array.isArray(messages) ? messages : [];
    const reactions: Record<string, string[]> = {};
    const filtered = safeMessages.filter((msg: any) => {
      if (!msg || typeof msg.content !== "string") return true;
      if (msg.content.startsWith("reaction:")) {
        const parts = msg.content.split(":");
        const targetId = parts[1];
        const emoji = parts[2];
        if (targetId && emoji) {
          if (!reactions[targetId]) reactions[targetId] = [];
          reactions[targetId].push(emoji);
        }
        return false;
      }
      return true;
    });

    return filtered.map((msg: any) => {
      let content = typeof msg?.content === "string" ? msg.content : "";
      let replyTo = null;
      if (content.startsWith('{"replyTo":')) {
        try {
          const parsed = JSON.parse(content);
          content = parsed.text || "";
          replyTo = parsed.replyTo;
        } catch (e) {}
      }
      return {
        ...msg,
        content,
        replyTo,
        reactions: reactions[msg?.id] || [],
      };
    });
  }, [messages]);

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
      const lastMessage = messages[messages.length - 1];
      const sentByMe = lastMessage?.senderId === user?.id;
      if (isCloseToBottomRef.current || sentByMe) {
        const timer = setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 50);
        return () => clearTimeout(timer);
      }
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

    let textToSend = inputText;
    
    if (replyToMessage) {
      textToSend = JSON.stringify({
        replyTo: {
          senderName: replyToMessage.senderName,
          text: replyToMessage.content.startsWith('{"replyTo":') 
            ? JSON.parse(replyToMessage.content).text 
            : replyToMessage.content
        },
        text: inputText
      });
      setReplyToMessage(null);
    }

    setInputText(""); // Clear input field instantly

    // Scroll to bottom instantly
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 60);

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

  const handlePickAttachment = async (type: "image" | "video" | "document") => {
    setShowAttachmentMenu(false);
    
    if (!uploadClassId) {
      Alert.alert("Upload Error", "Could not find a valid classroom for file uploads.");
      return;
    }

    try {
      let fileUri = "";
      let fileName = "";
      let fileType = "";

      if (type === "image" || type === "video") {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert("Permission Required", "Please allow camera roll access to pick photos/videos.");
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: type === "image" ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
          allowsEditing: false,
          quality: 1.0,
        });

        if (result.canceled || !result.assets || result.assets.length === 0) {
          return;
        }

        const asset = result.assets[0];
        fileUri = asset.uri;
        fileName = asset.fileName || (type === "image" ? `photo_${Date.now()}.png` : `video_${Date.now()}.mp4`);
        fileType = asset.mimeType || (type === "image" ? "image/png" : "video/mp4");
      } else {
        const result = await DocumentPicker.getDocumentAsync({
          type: "*/*",
          copyToCacheDirectory: true,
        });

        if (result.canceled || !result.assets || result.assets.length === 0) {
          return;
        }

        const asset = result.assets[0];
        fileUri = asset.uri;
        fileName = asset.name;
        fileType = asset.mimeType || "application/octet-stream";
      }

      setIsUploading(true);

      const uploadedFile = await api.uploadArchiveFile(
        uploadClassId,
        {
          uri: fileUri,
          name: fileName,
          type: fileType,
        },
        "ChatAttachments"
      );

      sendMessageMutation.mutate({
        content: `📎 Sent attachment: ${uploadedFile.name}`,
        attachments: [
          {
            type,
            url: uploadedFile.url,
            name: uploadedFile.name,
            size: uploadedFile.size,
          },
        ],
      });

    } catch (err: any) {
      console.error("[PICK_ATTACHMENT_ERROR]", err);
      Alert.alert("Upload Failed", err.message || "Failed to upload selected file.");
    } finally {
      setIsUploading(false);
    }
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
      <MessageBubble
        item={item}
        isMe={isMe}
        roomType={roomType}
        isTeacherOrAdmin={isTeacherOrAdmin}
        onLongPress={(msg) => setSelectedMessage(msg)}
        onSwipe={(msg) => setReplyToMessage(msg)}
        onPlayVideo={(url) => Linking.openURL(url)}
        onOpenImage={(url) => setActiveImageUrl(url)}
        formatMessageTime={formatMessageTime}
      />
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

        {roomType === "classroom" && (
          <Pressable
            onPress={() => {
              router.push(`/chat/walt?roomId=${roomId}&roomName=${encodeURIComponent(initialName)}` as any);
            }}
            style={({ pressed }) => [styles.iconBtn, { marginRight: 8 }, pressed && { opacity: 0.7 }]}
          >
            <Sparkles color={colors.teal} size={22} />
          </Pressable>
        )}

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
        <View style={{ flex: 1 }}>
          <FlatList
            ref={flatListRef}
            data={processedMessages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessageItem}
            contentContainerStyle={styles.listContent}
            initialNumToRender={20}
            maxToRenderPerBatch={10}
            windowSize={10}
            removeClippedSubviews={Platform.OS === "android"}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onLayout={() => {
              if (processedMessages.length > 0) {
                flatListRef.current?.scrollToEnd({ animated: false });
              }
            }}
          />
          {showScrollBottomBtn && (
            <Pressable
              onPress={handleScrollToBottom}
              style={styles.scrollBottomBtn}
            >
              <ArrowDown size={20} color="#64748B" />
              {unreadCount > 0 && (
                <View style={styles.scrollBottomBadge}>
                  <Text style={styles.scrollBottomBadgeText}>{unreadCount}</Text>
                </View>
              )}
            </Pressable>
          )}
        </View>
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
            {/* WhatsApp Swipe to Reply Quoted Preview */}
            {replyToMessage && (
              <View style={styles.replyPreviewBar}>
                <View style={{ flex: 1, paddingLeft: 8 }}>
                  <Text style={styles.replyPreviewSender} numberOfLines={1}>
                    {replyToMessage.senderName}
                  </Text>
                  <Text style={styles.replyPreviewText} numberOfLines={1}>
                    {replyToMessage.content.startsWith('{"replyTo":') 
                      ? JSON.parse(replyToMessage.content).text 
                      : replyToMessage.content}
                  </Text>
                </View>
                <Pressable onPress={() => setReplyToMessage(null)} style={{ padding: 4 }}>
                  <X size={16} color="#64748B" />
                </Pressable>
              </View>
            )}

            <View style={styles.inputRowContainer}>
              {/* WhatsApp-style Input Pill */}
              <View style={styles.inputPill}>
                <Pressable
                  style={styles.emojiBtn}
                  onPress={() => setShowEmojiPicker(!showEmojiPicker)}
                >
                  <Smile color={showEmojiPicker ? colors.teal : "#64748B"} size={22} />
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

              {/* Dynamic Animated Premium Send Button */}
              <AnimatedSendButton
                onPress={handleSend}
                disabled={!inputText.trim()}
              />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* ─── Emoji Picker Modal Sheet ─── */}
      {showEmojiPicker && (
        <View style={styles.emojiPickerContainer}>
          <View style={styles.emojiPickerHeader}>
            <Text style={styles.emojiPickerTitle}>Emojis</Text>
            <Pressable onPress={() => setShowEmojiPicker(false)}>
              <X size={20} color="#64748B" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.emojiGrid} keyboardShouldPersistTaps="handled">
            {COMMON_EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => {
                  setInputText((prev) => prev + emoji);
                }}
                style={styles.emojiCell}
              >
                <Text style={{ fontSize: 24 }}>{emoji}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

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
            {/* WhatsApp Quick Reactions Row */}
            <View style={styles.reactionsQuickRow}>
              {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => {
                    setSelectedMessage(null);
                    sendMessageMutation.mutate({
                      content: `reaction:${selectedMessage.id}:${emoji}`,
                    });
                  }}
                  style={styles.reactionQuickBtn}
                >
                  <Text style={{ fontSize: 24 }}>{emoji}</Text>
                </Pressable>
              ))}
            </View>

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
                onPress={() => handlePickAttachment("image")}
                style={styles.attachmentGridItem}
              >
                <View style={[styles.attachmentIconBox, { backgroundColor: "#ECFDF5" }]}>
                  <ImageIcon size={24} color="#10B981" />
                </View>
                <Text style={styles.attachmentLabel}>Photo / Gallery</Text>
              </Pressable>

              <Pressable
                onPress={() => handlePickAttachment("video")}
                style={styles.attachmentGridItem}
              >
                <View style={[styles.attachmentIconBox, { backgroundColor: "#EFF6FF" }]}>
                  <VideoIcon size={24} color="#3B82F6" />
                </View>
                <Text style={styles.attachmentLabel}>Video</Text>
              </Pressable>

              <Pressable
                onPress={() => handlePickAttachment("document")}
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

      {isUploading && (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", zIndex: 9999 }]}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={{ color: "#ffffff", marginTop: 12, fontSize: 16, fontWeight: "600" }}>Uploading attachment...</Text>
        </View>
      )}

      {/* Fullscreen Image Viewer Modal */}
      <Modal
        visible={!!activeImageUrl}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setActiveImageUrl(null)}
      >
        <View style={styles.fullscreenModalContainer}>
          <Pressable style={styles.fullscreenModalCloseArea} onPress={() => setActiveImageUrl(null)}>
            <Image
              source={{ uri: activeImageUrl || "" }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          </Pressable>
          <Pressable
            onPress={() => setActiveImageUrl(null)}
            style={styles.fullscreenCloseButton}
          >
            <X color={colors.white} size={24} />
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#E5DDD5", 
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
  imageContainer: {
    marginBottom: 6,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  chatImage: {
    width: 240,
    height: 160,
    borderRadius: radius.md,
  },
  chatVideoContainer: {
    width: 240,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  chatVideoContainerRight: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  chatVideoPlaceholder: {
    width: 240,
    height: 130,
    backgroundColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
  },
  chatVideoPlaceholderRight: {
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  playOverlayButton: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.6)",
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  chatVideoMeta: {
    padding: spacing.sm,
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  fullscreenModalContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenModalCloseArea: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenImage: {
    width: "100%",
    height: "80%",
  },
  fullscreenCloseButton: {
    position: "absolute",
    top: 40,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 8,
    borderRadius: 20,
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
  sendBtnWrapper: {
    marginLeft: 8,
    borderRadius: 25,
  },
  sendBtnWrapperActive: {
    shadowColor: "#0EA5E9",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 6,
  },
  sendBtnWrapperDisabled: {
    shadowColor: "transparent",
    elevation: 0,
  },
  sendBtnInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  sendBtnInnerActive: {
    backgroundColor: "#0EA5E9",
    borderWidth: 1.5,
    borderColor: "#38BDF8",
  },
  sendBtnInnerDisabled: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sendSparkleBadge: {
    position: "absolute",
    top: 6,
    right: 8,
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
  inputRowContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  quotedBubbleCard: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: radius.sm,
    overflow: "hidden",
    marginBottom: 6,
  },
  quotedBubbleCardLeft: {
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  quotedBubbleCardRight: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  quotedBar: {
    width: 4,
    backgroundColor: "#10B981",
  },
  quotedSenderName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#10B981",
  },
  quotedText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  replyPreviewBar: {
    flexDirection: "row",
    backgroundColor: "#F8FAFC",
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    padding: spacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: "#10B981",
    alignItems: "center",
    marginBottom: 4,
  },
  replyPreviewSender: {
    fontSize: 12,
    fontWeight: "700",
    color: "#10B981",
  },
  replyPreviewText: {
    fontSize: 12,
    color: "#64748B",
  },
  reactionsQuickRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    marginBottom: spacing.sm,
  },
  reactionQuickBtn: {
    padding: 6,
  },
  reactionBadgeRow: {
    flexDirection: "row",
    position: "absolute",
    bottom: -10,
    right: 12,
    zIndex: 10,
  },
  reactionBadgeRowRight: {
    left: 12,
    right: undefined,
  },
  reactionMiniBadge: {
    backgroundColor: "#F1F5F9",
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginRight: 2,
  },
  emojiPickerContainer: {
    height: 250,
    backgroundColor: "#F8FAFC",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  emojiPickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  emojiPickerTitle: {
    fontWeight: "700",
    fontSize: 14,
    color: "#475569",
  },
  emojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 8,
  },
  emojiCell: {
    width: "12.5%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollBottomBtn: {
    position: "absolute",
    bottom: 12,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 100,
  },
  scrollBottomBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#10B981",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  scrollBottomBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  voicePlayerContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.03)",
    borderRadius: radius.sm,
    padding: spacing.sm,
    width: 240,
    marginBottom: 6,
  },
  voicePlayerContainerRight: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  voicePlayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.05)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  voiceProgressArea: {
    flex: 1,
    justifyContent: "center",
  },
  voiceProgressBarBg: {
    height: 4,
    backgroundColor: "rgba(0,0,0,0.1)",
    borderRadius: 2,
    marginBottom: 6,
    width: "100%",
  },
  voiceProgressBarFill: {
    height: 4,
    backgroundColor: "#10B981",
    borderRadius: 2,
  },
  voiceMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  voiceTimeText: {
    fontSize: 10,
    color: "#64748B",
  },
  voiceTimeTextRight: {
    color: "rgba(255, 255, 255, 0.8)",
  },
  voiceSizeText: {
    fontSize: 10,
    color: "#64748B",
  },
  voiceSizeTextRight: {
    color: "rgba(255, 255, 255, 0.8)",
  },
});
