import { useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Linking,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Folder,
  FileText,
  FileImage,
  Video,
  File,
  ArrowLeft,
  Upload,
  Plus,
  Trash2,
} from "lucide-react-native";
import { api } from "@/api/client";
import { useSession } from "@/auth/session-store";
import { colors, spacing, font, radius } from "@/theme/tokens";
import { uploadFileInChunks } from "@/utils/chunkedUpload";

export default function ClassroomArchiveScreen() {
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useSession((state) => state.user);

  const [activeFolder, setActiveFolder] = useState<string | null>(null);

  // Fetch Archive Files
  const { data: files = [], isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["classroomArchive", classId],
    queryFn: () => api.getClassArchive(classId),
    enabled: !!classId,
  });

  const isTeacherOrAdmin = user?.role === "teacher" || user?.role === "school_admin";

  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Delete File Mutation
  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => api.deleteArchiveFile(classId, fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classroomArchive", classId] });
      Alert.alert("Success", "File deleted successfully");
    },
    onError: (err) => {
      console.error(err);
      Alert.alert("Error", "Failed to delete file");
    },
  });

  // Upload Mutation using chunked upload helper
  const uploadMutation = useMutation({
    mutationFn: (variables: { file: { uri: string; name: string; type: string }; category: string }) =>
      new Promise((resolve, reject) => {
        uploadFileInChunks({
          classId,
          file: variables.file,
          category: variables.category,
          onProgress: (progress) => {
            setUploadProgress(progress);
          },
          onSuccess: (fileRecord) => {
            resolve(fileRecord);
          },
          onError: (err) => {
            reject(err);
          },
        });
      }),
    onSuccess: () => {
      setUploadProgress(null);
      queryClient.invalidateQueries({ queryKey: ["classroomArchive", classId] });
      Alert.alert("Success", "Original quality file uploaded, chunked, and verified!");
    },
    onError: (err: any) => {
      setUploadProgress(null);
      console.error(err);
      Alert.alert("Upload Failed", err.message || "Failed to upload file");
    },
  });

  const handleMockUpload = () => {
    Alert.prompt(
      "Upload Study File",
      "Enter a category/folder name (e.g. Chapter 4, Homework):",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Upload",
          onPress: (categoryName) => {
            const randomId = Math.random().toString(36).substring(7);
            // Statically encoded base64 matching a mock PDF content (Original quality)
            const dataUri = "data:application/pdf;base64,VGhpcyBpcyBhIG1vY2sgc3R1ZHkgbm90ZSBkb2N1bWVudCB3aXRoIG9yaWdpbmFsIHF1YWxpdHkgcHJlc2VydmVkLg==";
            
            uploadMutation.mutate({
              file: {
                uri: dataUri,
                name: `StudyNotes_${randomId}.pdf`,
                type: "application/pdf",
              },
              category: categoryName || "General",
            });
          },
        },
      ]
    );
  };

  const handleDelete = (fileId: string) => {
    Alert.alert("Delete File", "Are you sure you want to permanently delete this file?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteMutation.mutate(fileId),
      },
    ]);
  };

  // Group files by category (folder structure)
  const folders = Array.from(new Set(files.map((f: any) => f.category || "General"))) as string[];

  const currentFolderFiles = files.filter(
    (f: any) => (f.category || "General") === (activeFolder || "General")
  );

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "pdf":
        return <FileText color="#EF4444" size={24} />;
      case "image":
        return <FileImage color="#10B981" size={24} />;
      case "video":
        return <Video color="#6366F1" size={24} />;
      default:
        return <File color={colors.teal} size={24} />;
    }
  };

  const handleOpenFile = (url: string) => {
    Linking.openURL(url).catch(() => Alert.alert("Error", "Cannot open URL"));
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft color={colors.navy} size={24} />
        </Pressable>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Study Archive</Text>
          <Text style={styles.headerSub}>Classroom Files & Reference Materials</Text>
        </View>
        {isTeacherOrAdmin && (
          <TouchableOpacity onPress={handleMockUpload} style={styles.uploadBtn}>
            <Plus color={colors.white} size={20} />
          </TouchableOpacity>
        )}
      </View>

      {uploadProgress !== null && (
        <View style={styles.progressContainer}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={styles.progressText}>Uploading Study File...</Text>
            <Text style={styles.progressText}>{uploadProgress}%</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${uploadProgress}%` }]} />
          </View>
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.navy} />
          <Text style={styles.loadingText}>Fetching classroom archive...</Text>
        </View>
      ) : files.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Folder size={64} color={colors.teal} style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>Archive is Empty</Text>
          <Text style={styles.emptyDesc}>
            Teachers have not uploaded study guides, notes, or worksheets yet.
          </Text>
          {isTeacherOrAdmin && (
            <TouchableOpacity onPress={handleMockUpload} style={styles.emptyUploadBtn}>
              <Upload size={16} color={colors.white} style={{ marginRight: 8 }} />
              <Text style={styles.emptyUploadText}>Upload First File</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Folders Navigation Bar (Horizontal Carousel) */}
          <View style={styles.folderContainer}>
            <Text style={styles.sectionTitle}>Folders</Text>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={folders}
              keyExtractor={(item) => item}
              contentContainerStyle={styles.folderList}
              renderItem={({ item }) => {
                const isActive = activeFolder === item || (!activeFolder && item === "General");
                return (
                  <Pressable
                    onPress={() => setActiveFolder(item)}
                    style={[styles.folderCard, isActive && styles.folderCardActive]}
                  >
                    <Folder color={isActive ? colors.white : colors.teal} size={24} style={{ marginBottom: 8 }} />
                    <Text style={[styles.folderName, isActive && styles.folderNameActive]} numberOfLines={1}>
                      {item}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </View>

          {/* Files List */}
          <Text style={styles.sectionTitle}>Files in {activeFolder || "General"}</Text>
          {currentFolderFiles.length === 0 ? (
            <View style={styles.emptyFolderContainer}>
              <Text style={styles.emptyFolderText}>No files in this folder.</Text>
            </View>
          ) : (
            <FlatList
              data={currentFolderFiles}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.fileList}
              refreshControl={
                <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.navy} />
              }
              renderItem={({ item }) => (
                <Pressable onPress={() => handleOpenFile(item.url)} style={styles.fileItem}>
                  <View style={styles.fileIconContainer}>{getFileIcon(item.type)}</View>
                  <View style={styles.fileDetails}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                      <Text style={styles.fileMeta}>
                        {formatBytes(item.originalSize || item.size)} • {new Date(item.createdAt).toLocaleDateString()}
                      </Text>
                      {item.checksum && (
                        <View style={styles.verifiedBadge}>
                          <Text style={styles.verifiedText}>Verified</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  {isTeacherOrAdmin && (
                    <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
                      <Trash2 color={colors.danger} size={18} />
                    </TouchableOpacity>
                  )}
                </Pressable>
              )}
            />
          )}
        </View>
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
  uploadBtn: {
    backgroundColor: colors.navy,
    width: 38,
    height: 38,
    borderRadius: radius.md,
    justifyContent: "center",
    alignItems: "center",
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
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyUploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  emptyUploadText: {
    color: colors.white,
    fontWeight: "600",
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.navy,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  folderContainer: {
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  folderList: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  folderCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: radius.md,
    padding: spacing.md,
    width: 120,
    marginRight: spacing.sm,
  },
  folderCardActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  folderName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.navy,
  },
  folderNameActive: {
    color: colors.white,
  },
  emptyFolderContainer: {
    padding: spacing.xl,
    alignItems: "center",
  },
  emptyFolderText: {
    color: colors.teal,
    fontSize: 14,
  },
  fileList: {
    paddingHorizontal: spacing.md,
  },
  fileItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  fileIconContainer: {
    marginRight: spacing.md,
  },
  fileDetails: {
    flex: 1,
  },
  fileName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.navy,
  },
  fileMeta: {
    fontSize: 12,
    color: colors.teal,
    marginTop: 4,
  },
  deleteBtn: {
    padding: spacing.sm,
  },
  progressContainer: {
    backgroundColor: colors.white,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  progressText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.navy,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: "#E2E8F0",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: colors.teal,
  },
  verifiedBadge: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  verifiedText: {
    color: "#059669",
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },
});
