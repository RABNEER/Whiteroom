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
  Alert,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Send, Sparkles, AlertCircle, FileText } from "lucide-react-native";
import { api } from "@/api/client";
import { colors, spacing, font, radius } from "@/theme/tokens";

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

  const [input, setInput] = useState("");
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
    onError: (err) => {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `walt_error_${Date.now()}`,
          sender: "walt",
          text: "I'm sorry, I encountered an issue connecting to the AI helper. Please check your network and try again.",
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
      Linking.openURL(url).catch(() => Alert.alert("Error", "Unable to open source file."));
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

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
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

        {/* Input Bar */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Ask Walt a doubt..."
            placeholderTextColor={colors.teal}
            value={input}
            onChangeText={setInput}
            multiline
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={waltMutation.isPending || !input.trim()}
            style={[
              styles.sendButton,
              (!input.trim() || waltMutation.isPending) && styles.sendButtonDisabled,
            ]}
          >
            {waltMutation.isPending ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Send color={colors.white} size={18} />
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
    padding: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: colors.white,
  },
  input: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 100,
    fontSize: 15,
    color: colors.navy,
  },
  sendButton: {
    backgroundColor: colors.navy,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: spacing.sm,
  },
  sendButtonDisabled: {
    backgroundColor: colors.sky,
  },
});
