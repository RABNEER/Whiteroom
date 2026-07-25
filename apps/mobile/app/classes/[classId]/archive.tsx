import { platformAlert } from "@/src/utils/alert";
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
  Modal,
  TextInput,
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
import { colors, spacing, radius } from "@/theme/tokens";
import { uploadFileInChunks } from "@/utils/chunkedUpload";
import * as DocumentPicker from "expo-document-picker";

export default function ClassroomArchiveScreen() {
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useSession((state) => state.user);

  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [pickedFile, setPickedFile] = useState<any | null>(null);

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
      platformAlert("Success", "File deleted successfully");
    },
    onError: (err) => {
      console.error(err);
      platformAlert("Error", "Failed to delete file");
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
      platformAlert("Success", "Original quality file uploaded, chunked, and verified!");
    },
    onError: (err: any) => {
      setUploadProgress(null);
      console.error(err);
      platformAlert("Upload Failed", err.message || "Failed to upload file");
    },
  });

  const handleFileUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const file = result.assets[0];
      setPickedFile(file);
      setNewCategory("General");
      setModalVisible(true);
    } catch (err) {
      console.error(err);
      platformAlert("Error", "Failed to select document");
    }
  };

  const executeUpload = async (categoryName: string) => {
    if (!pickedFile) return;

    try {
      setUploadProgress(0);

      // Read picked file as Data URI using standard fetch & FileReader
      const response = await fetch(pickedFile.uri);
      const blob = await response.blob();

      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUri = reader.result as string;

        uploadMutation.mutate({
          file: {
            uri: dataUri,
            name: pickedFile.name,
            type: pickedFile.mimeType || "application/octet-stream",
          },
          category: categoryName || "General",
        });
      };

      reader.onerror = () => {
        platformAlert("Error", "Failed to read file");
        setUploadProgress(null);
      };

      reader.readAsDataURL(blob);
    } catch (err: any) {
      console.error(err);
      platformAlert("Error", err.message || "Failed to process file");
      setUploadProgress(null);
    }
  };

  const handleDelete = (fileId: string) => {
    platformAlert("Delete File", "Are you sure you want to permanently delete this file?", [
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
    Linking.openURL(url).catch(() => platformAlert("Error", "Cannot open URL"));
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
          <TouchableOpacity onPress={handleFileUpload} style={styles.uploadBtn}>
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
            <TouchableOpacity onPress={handleFileUpload} style={styles.emptyUploadBtn}>
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
      {/* Upload Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Upload Study File</Text>
            <Text style={styles.modalLabel}>Enter a category/folder name (e.g. Chapter 4, Homework):</Text>
            <TextInput
              style={styles.modalInput}
              value={newCategory}
              onChangeText={setNewCategory}
              placeholder="e.g. General"
              placeholderTextColor="#94A3B8"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnSubmit]}
                onPress={() => {
                  setModalVisible(false);
                  executeUpload(newCategory);
                }}
              >
                <Text style={styles.modalBtnSubmitText}>Upload</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: "100%",
    maxWidth: 400,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.navy,
    marginBottom: spacing.xs,
  },
  modalLabel: {
    fontSize: 13,
    color: colors.teal,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: 15,
    color: colors.navy,
    marginBottom: spacing.lg,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  modalBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  modalBtnCancel: {
    backgroundColor: "#F1F5F9",
  },
  modalBtnCancelText: {
    color: colors.navy,
    fontWeight: "600",
    fontSize: 14,
  },
  modalBtnSubmit: {
    backgroundColor: colors.navy,
  },
  modalBtnSubmitText: {
    color: colors.white,
    fontWeight: "600",
    fontSize: 14,
  },
});
