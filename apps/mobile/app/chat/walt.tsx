import { platformAlert } from "@/src/utils/alert";
import { useState, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
  Linking,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Sparkles, AlertCircle, FileText, Upload, RefreshCw } from "lucide-react-native";
import * as DocumentPicker from "expo-document-picker";
import { api, ApiError } from "@/api/client";
import { colors, spacing, radius } from "@/theme/tokens";
import { sessionStore } from "@/auth/session-store";

interface Message {
  id: string;
  sender: "user" | "walt";
  text: string;
  citations?: Array<{
    fileName: string;
    fileUrl: string;
    pageNumber: number;
  }>;
}

export default function WaltChatScreen() {
  const { roomId, roomName = "Classroom doubt solver" } = useLocalSearchParams<{
    roomId: string;
    roomName: string;
  }>();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);

  const { user } = sessionStore();
  const isTeacher = user?.role === "teacher" || user?.role === "school_admin";
  
  const [isUploading, setIsUploading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const [input, setInput] = useState("");

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      setIsUploading(true);

      setMessages((prev) => [
        ...prev,
        {
          id: `sys_upload_start_${Date.now()}`,
          sender: "walt",
          text: `⏳ Uploading and analyzing "${asset.name}" to ground my knowledge base...`,
        },
      ]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

      const uploadedFile = await api.uploadArchiveFile(
        roomId,
        {
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || "application/octet-stream",
        },
        "Walt Grounding"
      );

      setMessages((prev) => [
        ...prev,
        {
          id: `sys_upload_success_${Date.now()}`,
          sender: "walt",
          text: `📚 Added and vectorized "${uploadedFile.name}" successfully! I am now fully grounded in this document's content.`,
        },
      ]);

      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: any) {
      console.error("[WALT_UPLOAD_ERROR]", err);
      platformAlert("Upload Failed", err.message || "Failed to upload selected file.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSyncChat = async () => {
    try {
      setIsSyncing(true);

      setMessages((prev) => [
        ...prev,
        {
          id: `sys_sync_start_${Date.now()}`,
          sender: "walt",
          text: "⏳ Scanning classroom chat history for study materials, guides, and images to ground my knowledge base...",
        },
      ]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

      const res = await api.syncChatAttachments(roomId);

      if (res.syncedCount === 0) {
        setMessages((prev) => [
          ...prev,
          {
            id: `sys_sync_done_${Date.now()}`,
            sender: "walt",
            text: "ℹ️ No new chat attachments found to import. Make sure documents or images have been posted in the class chat!",
          },
        ]);
      } else {
        const fileNames = res.files.map((f: any) => `"${f.name}"`).join(", ");
        setMessages((prev) => [
          ...prev,
          {
            id: `sys_sync_done_${Date.now()}`,
            sender: "walt",
            text: `🔄 Vectorized and imported ${res.syncedCount} study materials from the chat history: ${fileNames}. I am now fully grounded in their contents!`,
          },
        ]);
      }
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: any) {
      console.error("[WALT_SYNC_ERROR]", err);
      platformAlert("Sync Failed", err.message || "Failed to sync attachments from chat.");
    } finally {
      setIsSyncing(false);
    }
  };
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "walt",
      text: "Hi! I am Walt, your AI study assistant. Ask me any doubt about the uploaded classroom materials, guides, or worksheets, and I will help you with detailed references!",
    },
  ]);

  // Doubt solver mutation
  const waltMutation = useMutation({
    mutationFn: (question: string) => api.askWalt(roomId, question),
    onSuccess: (data: any) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `walt_${Date.now()}`,
          sender: "walt",
          text: data.answer,
          citations: data.citations || [],
        },
      ]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    },
    onError: (err: any) => {
      console.error(err);
      const errorMsg =
        err instanceof ApiError && err.message
          ? err.message
          : err?.message || "I'm sorry, I encountered an issue connecting to the AI helper. Please check your network and try again.";
      setMessages((prev) => [
        ...prev,
        {
          id: `walt_error_${Date.now()}`,
          sender: "walt",
          text: `⚠️ ${errorMsg}`,
        },
      ]);
    },
  });

  const handleSend = () => {
    if (!input.trim()) return;
    const userText = input.trim();
    setInput("");

    setMessages((prev) => [
      ...prev,
      {
        id: `user_${Date.now()}`,
        sender: "user",
        text: userText,
      },
    ]);

    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    waltMutation.mutate(userText);
  };

  const handleOpenCitation = (url: string) => {
    if (url) {
      Linking.openURL(url).catch(() => platformAlert("Error", "Unable to open source file."));
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
          <View style={styles.waltTitleRow}>
            <Sparkles color="#6366F1" size={18} style={{ marginRight: 4 }} />
            <Text style={styles.headerTitle}>Walt AI</Text>
          </View>
          <Text style={styles.headerSub}>{roomName}</Text>
        </View>
      </View>

      {/* Grounding Info Banner */}
      <View style={styles.infoBanner}>
        <AlertCircle size={16} color="#6366F1" style={{ marginRight: 8, marginTop: 2 }} />
        <Text style={styles.infoBannerText}>
          Walt is fully grounded in materials uploaded for this class. Responses are PII-filtered for safety.
        </Text>
      </View>

      {/* Teacher Actions Bar */}
      {isTeacher && (
        <View style={styles.teacherBar}>
          <Text style={styles.teacherBarTitle}>Teacher Study Materials Helper</Text>
          <View style={styles.teacherButtonsRow}>
            <TouchableOpacity
              onPress={handleUpload}
              disabled={isUploading || isSyncing}
              style={[styles.teacherButton, isUploading && styles.teacherButtonActive]}
            >
              {isUploading ? (
                <ActivityIndicator size="small" color="#4F46E5" style={{ marginRight: 6 }} />
              ) : (
                <Upload size={14} color="#4F46E5" style={{ marginRight: 6 }} />
              )}
              <Text style={styles.teacherButtonText}>Upload Study Doc</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSyncChat}
              disabled={isUploading || isSyncing}
              style={[styles.teacherButton, styles.teacherButtonSync, isSyncing && styles.teacherButtonActive]}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="#0D9488" style={{ marginRight: 6 }} />
              ) : (
                <RefreshCw size={14} color="#0D9488" style={{ marginRight: 6 }} />
              )}
              <Text style={[styles.teacherButtonText, { color: "#0D9488" }]}>Sync Chat Files</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={{ flex: 1 }}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const isWalt = item.sender === "walt";
            const isOutOfScope =
              isWalt &&
              item.text.includes("outside the scope of the materials uploaded");

            return (
              <View style={[styles.messageRow, isWalt ? styles.rowLeft : styles.rowRight]}>
                <View
                  style={[
                    styles.bubble,
                    isWalt ? styles.bubbleLeft : styles.bubbleRight,
                    isOutOfScope && styles.bubbleOutOfScope,
                  ]}
                >
                  <Text style={[styles.messageText, isWalt ? styles.textLeft : styles.textRight]}>
                    {item.text}
                  </Text>

                  {/* Citations / Grounding reference cards */}
                  {item.citations && item.citations.length > 0 && (
                    <View style={styles.citationContainer}>
                      <Text style={styles.citationTitle}>SOURCES CITED:</Text>
                      {item.citations.map((c, i) => (
                        <TouchableOpacity
                          key={i}
                          onPress={() => handleOpenCitation(c.fileUrl)}
                          style={styles.citationCard}
                        >
                          <FileText size={14} color={colors.teal} style={{ marginRight: 6 }} />
                          <Text style={styles.citationText} numberOfLines={1}>
                            {c.fileName} (Page {c.pageNumber})
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            );
          }}
        />
      </View>

      {/* Input Bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        style={styles.keyboardContainer}
      >
        <View style={styles.newInputContainer}>
          <View style={styles.newInputWrapper}>
            <TextInput
              style={styles.newInput}
              placeholder="Ask Walt a doubt..."
              placeholderTextColor="#94A3B8"
              value={input}
              onChangeText={setInput}
              multiline={true}
              autoCapitalize="sentences"
            />
          </View>
          <TouchableOpacity
            onPress={handleSend}
            disabled={waltMutation.isPending || !input.trim()}
            activeOpacity={0.8}
            style={[
              styles.newSendButton,
              (!input.trim() || waltMutation.isPending) && styles.newSendButtonDisabled,
            ]}
          >
            {waltMutation.isPending ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Image
                source={require("@/assets/send-icon.png")}
                style={{ width: 20, height: 20, tintColor: colors.white }}
              />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  waltTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.navy,
  },
  headerSub: {
    fontSize: 12,
    color: colors.teal,
    marginTop: 2,
  },
  infoBanner: {
    flexDirection: "row",
    backgroundColor: "rgba(99, 102, 241, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.15)",
    margin: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 12,
    color: "#4F46E5",
    lineHeight: 16,
    fontWeight: "500",
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  messageRow: {
    flexDirection: "row",
    marginBottom: spacing.md,
    width: "100%",
  },
  rowLeft: {
    justifyContent: "flex-start",
  },
  rowRight: {
    justifyContent: "flex-end",
  },
  bubble: {
    maxWidth: "80%",
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  bubbleLeft: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 0,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  bubbleRight: {
    backgroundColor: colors.navy,
    borderTopRightRadius: 0,
  },
  bubbleOutOfScope: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FEE2E2",
    borderWidth: 1,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  textLeft: {
    color: colors.navy,
  },
  textRight: {
    color: colors.white,
  },
  citationContainer: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: spacing.sm,
  },
  citationTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.teal,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  citationCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: 4,
  },
  citationText: {
    fontSize: 12,
    color: colors.navy,
    fontWeight: "500",
    flex: 1,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: "rgba(226, 232, 240, 0.6)",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 8,
  },
  inputContainerFocused: {
    borderTopColor: "rgba(99, 102, 241, 0.15)",
  },
  inputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  inputWrapperFocused: {
    borderColor: "#4F46E5",
    backgroundColor: colors.white,
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    width: "100%",
    fontSize: 15,
    color: colors.navy,
    minHeight: 40,
    maxHeight: 120,
    paddingVertical: 8,
    textAlignVertical: "top",
  },
  sendButton: {
    backgroundColor: "#4F46E5",
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: spacing.sm,
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  sendButtonDisabled: {
    backgroundColor: "#CBD5E1",
    shadowOpacity: 0,
    elevation: 0,
  },
  sendIcon: {
    marginLeft: 2,
  },
  keyboardContainer: {
    width: "100%",
  },
  newInputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  newInputWrapper: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 40,
    maxHeight: 100,
  },
  newInput: {
    fontSize: 15,
    color: colors.navy,
    padding: 0,
    margin: 0,
    textAlignVertical: "bottom",
  },
  newSendButton: {
    backgroundColor: "#4F46E5",
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  newSendButtonDisabled: {
    backgroundColor: "#CBD5E1",
  },
  teacherBar: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  teacherBarTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.teal,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  teacherButtonsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  teacherButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(99, 102, 241, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.15)",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  teacherButtonSync: {
    backgroundColor: "rgba(13, 148, 136, 0.08)",
    borderColor: "rgba(13, 148, 136, 0.15)",
  },
  teacherButtonActive: {
    opacity: 0.6,
  },
  teacherButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4F46E5",
  },
});
