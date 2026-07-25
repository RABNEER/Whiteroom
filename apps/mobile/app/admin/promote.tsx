import { platformAlert } from "@/src/utils/alert";
import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Modal,
  FlatList,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  GraduationCap,
  ChevronRight,
  CheckCircle,
  Info,
  X,
} from "lucide-react-native";
import { api, ApiError } from "@/api/client";
import { colors, spacing, radius } from "@/theme/tokens";
import { Card, Muted } from "@/components/ui";

function showAlert(title: string, message: string) {
  if (Platform.OS === "web") {
    window.alert(`${title}\n\n${message}`);
  } else {
    platformAlert(title, message);
  }
}

interface PromotionMapping {
  type: "promote" | "graduate" | "none";
  toClassId?: string;
}

export default function ClassPromotionsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [academicYear, setAcademicYear] = useState("2026-2027");
  const [mappings, setMappings] = useState<Record<string, PromotionMapping>>({});
  
  // Modal state for selecting target class
  const [selectingForClassId, setSelectingForClassId] = useState<string | null>(null);

  // Queries
  const { data: classesData, isLoading: classesLoading } = useQuery({
    queryKey: ["classes"],
    queryFn: () => api.classes(),
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["promotionHistory"],
    queryFn: api.promotionHistory,
  });

  const promoteMutation = useMutation({
    mutationFn: (payload: {
      academicYear: string;
      promotionRules: { fromClassId: string; toClassId: string }[];
      graduatingClassIds: string[];
    }) => api.promoteAll(payload),
    onSuccess: () => {
      showAlert(
        "Promotions Executed Successfully",
        "All students have been promoted or graduated. Database updated successfully."
      );
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      queryClient.invalidateQueries({ queryKey: ["promotionHistory"] });
      setMappings({});
    },
    onError: (err: any) => {
      console.error(err);
      const msg = err instanceof ApiError ? err.message : "Promotion transaction failed.";
      showAlert("Promotion Error", msg);
    },
  });

  const classesList = classesData?.data ?? [];

  const handleSelectRuleType = (classId: string, type: "promote" | "graduate" | "none") => {
    if (type === "promote") {
      setSelectingForClassId(classId);
    } else {
      setMappings((prev) => ({
        ...prev,
        [classId]: { type },
      }));
    }
  };

  const handleConfirmPromotionTarget = (targetClassId: string) => {
    if (selectingForClassId) {
      setMappings((prev) => ({
        ...prev,
        [selectingForClassId]: { type: "promote", toClassId: targetClassId },
      }));
      setSelectingForClassId(null);
    }
  };

  const getMappingDisplay = (classId: string) => {
    const mapVal = mappings[classId];
    if (!mapVal || mapVal.type === "none") return "Keep Students";
    if (mapVal.type === "graduate") return "Graduate & Archive";
    
    const targetClass = classesList.find((c) => c.id === mapVal.toClassId);
    return `Promote to ${targetClass?.name || "Select Class"}`;
  };

  const handleExecutePromotions = () => {
    // Collect active rules and graduations
    const promotionRules: { fromClassId: string; toClassId: string }[] = [];
    const graduatingClassIds: string[] = [];

    let totalStudentsAffected = 0;

    for (const cls of classesList) {
      const map = mappings[cls.id];
      if (!map) continue;

      const studentCount = cls.studentCount || 0;

      if (map.type === "promote" && map.toClassId) {
        promotionRules.push({
          fromClassId: cls.id,
          toClassId: map.toClassId,
        });
        totalStudentsAffected += studentCount;
      } else if (map.type === "graduate") {
        graduatingClassIds.push(cls.id);
        totalStudentsAffected += studentCount;
      }
    }

    if (promotionRules.length === 0 && graduatingClassIds.length === 0) {
      showAlert("No Actions Scheduled", "Please schedule promotions or graduations for at least one classroom.");
      return;
    }

    if (!academicYear.trim()) {
      showAlert("Academic Year Required", "Please enter the target academic year (e.g. 2026-2027).");
      return;
    }

    const confirmMessage = `You are about to promote/graduate ${totalStudentsAffected} students for the academic year ${academicYear}.\n\nThis will:
- Set previous class enrollments status to 'promoted' or 'graduated'
- Create active enrollments in target classrooms
- Set new academic year on promoted classrooms

This process is irreversible. Would you like to proceed?`;

    if (Platform.OS === "web") {
      if (window.confirm(confirmMessage)) {
        promoteMutation.mutate({
          academicYear,
          promotionRules,
          graduatingClassIds,
        });
      }
    } else {
      platformAlert("Confirm Annual Promotions", confirmMessage, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Promote Students",
          style: "destructive",
          onPress: () => {
            promoteMutation.mutate({
              academicYear,
              promotionRules,
              graduatingClassIds,
            });
          },
        },
      ]);
    }
  };

  // Filter classes available for promotion target (prevent promoting to self)
  const getAvailableTargetClasses = () => {
    if (!selectingForClassId) return [];
    return classesList.filter((c) => c.id !== selectingForClassId);
  };

  if (classesLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.navy} />
        <Muted style={{ marginTop: spacing.md }}>Loading class information...</Muted>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft color={colors.navy} size={24} />
        </Pressable>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Class Promotions</Text>
          <Text style={styles.headerSub}>End of Academic Year Advancement</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Banner Alert */}
        <View style={styles.bannerAlert}>
          <Info color="#2563EB" size={20} style={{ marginRight: spacing.sm }} />
          <Text style={styles.bannerText}>
            Promotions execute inside a transaction. If any classroom or enrollment update fails, all changes roll back to prevent half-promoted states.
          </Text>
        </View>

        {/* Academic Year Selector */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Target Academic Year</Text>
          <Muted style={{ marginBottom: spacing.sm }}>
            Specify the incoming year. This will log history and tag promoted classes.
          </Muted>
          <TextInput
            style={styles.textInput}
            value={academicYear}
            onChangeText={setAcademicYear}
            placeholder="e.g. 2026-2027"
          />
        </Card>

        {/* Class Mapping List */}
        <Text style={styles.sectionTitle}>Map Classrooms</Text>
        <View style={styles.mappingListContainer}>
          {classesList.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Muted>No classrooms found in this school. Please create classes first.</Muted>
            </Card>
          ) : (
            classesList.map((cls) => {
              const currentMap = mappings[cls.id]?.type ?? "none";
              return (
                <Card key={cls.id} style={styles.classCard}>
                  <View style={styles.classCardHeader}>
                    <View>
                      <Text style={styles.className}>{cls.name}</Text>
                      <Muted>{cls.studentCount || 0} enrolled students</Muted>
                    </View>
                    <View style={styles.badgeContainer}>
                      <Text
                        style={[
                          styles.badge,
                          currentMap === "promote" && styles.badgePromote,
                          currentMap === "graduate" && styles.badgeGraduate,
                        ]}
                      >
                        {getMappingDisplay(cls.id)}
                      </Text>
                    </View>
                  </View>

                  {/* Actions Row */}
                  <View style={styles.actionRow}>
                    <Pressable
                      onPress={() => handleSelectRuleType(cls.id, "promote")}
                      style={[styles.actionBtn, currentMap === "promote" && styles.actionBtnActive]}
                    >
                      <Text style={[styles.actionBtnText, currentMap === "promote" && styles.actionBtnTextActive]}>
                        Promote
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => handleSelectRuleType(cls.id, "graduate")}
                      style={[styles.actionBtn, currentMap === "graduate" && styles.actionBtnActive]}
                    >
                      <Text style={[styles.actionBtnText, currentMap === "graduate" && styles.actionBtnTextActive]}>
                        Graduate
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => handleSelectRuleType(cls.id, "none")}
                      style={[styles.actionBtn, currentMap === "none" && styles.actionBtnActive]}
                    >
                      <Text style={[styles.actionBtnText, currentMap === "none" && styles.actionBtnTextActive]}>
                        Keep
                      </Text>
                    </Pressable>
                  </View>
                </Card>
              );
            })
          )}
        </View>

        {/* Submit Promotions */}
        {classesList.length > 0 && (
          <TouchableOpacity
            style={[styles.submitBtn, promoteMutation.isPending && styles.submitBtnDisabled]}
            disabled={promoteMutation.isPending}
            onPress={handleExecutePromotions}
          >
            {promoteMutation.isPending ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <GraduationCap color={colors.white} size={20} style={{ marginRight: spacing.sm }} />
                <Text style={styles.submitBtnText}>Execute Student Promotions</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Historical Logs */}
        <Text style={styles.sectionTitle}>Promotion History</Text>
        {historyLoading ? (
          <ActivityIndicator color={colors.navy} style={{ marginVertical: spacing.md }} />
        ) : !historyData || historyData.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Muted>No promotion history logged for this institution.</Muted>
          </Card>
        ) : (
          <View style={styles.historyList}>
            {historyData.map((log: any) => (
              <Card key={log.id} style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <View style={styles.historyIconBox}>
                    <CheckCircle color="#10B981" size={18} />
                  </View>
                  <View>
                    <Text style={styles.historyTitle}>Year {log.academicYear}</Text>
                    <Muted>{new Date(log.promotionDate).toLocaleDateString()}</Muted>
                  </View>
                </View>
                <View style={styles.historyStats}>
                  <Text style={styles.statLabel}>
                    Promoted: <Text style={styles.statVal}>{log.studentsPromoted}</Text>
                  </Text>
                  <Text style={styles.statLabel}>
                    Graduated: <Text style={styles.statVal}>{log.studentsGraduated}</Text>
                  </Text>
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Target Class Selection Modal */}
      <Modal
        visible={selectingForClassId !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectingForClassId(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Target Classroom</Text>
              <Pressable onPress={() => setSelectingForClassId(null)}>
                <X color={colors.navy} size={24} />
              </Pressable>
            </View>

            <Muted style={{ marginBottom: spacing.md }}>
              Choose the classroom where promoted students should be enrolled.
            </Muted>

            <FlatList
              data={getAvailableTargetClasses()}
              keyExtractor={(item) => item.id}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => handleConfirmPromotionTarget(item.id)}
                  style={({ pressed }) => [styles.targetClassItem, pressed && { backgroundColor: "#F1F5F9" }]}
                >
                  <Text style={styles.targetClassName}>{item.name}</Text>
                  <ChevronRight color={colors.teal} size={20} />
                </Pressable>
              )}
              ListEmptyComponent={() => (
                <View style={{ paddingVertical: spacing.xl, alignItems: "center" }}>
                  <Muted>No other active classrooms found.</Muted>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Wrapping custom touchable opacity fallback
import { TouchableOpacity } from "react-native";

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
  scrollContent: {
    padding: spacing.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  bannerAlert: {
    flexDirection: "row",
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  bannerText: {
    fontSize: 12,
    color: "#1E3A8A",
    flex: 1,
    lineHeight: 16,
  },
  sectionCard: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.navy,
    marginBottom: 4,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: 14,
    color: colors.navy,
    backgroundColor: "#F8FAFC",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.navy,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  mappingListContainer: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  emptyCard: {
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  classCard: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  classCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  className: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.navy,
    marginBottom: 2,
  },
  badgeContainer: {
    alignItems: "flex-end",
  },
  badge: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.teal,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  badgePromote: {
    color: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  badgeGraduate: {
    color: "#059669",
    backgroundColor: "#ECFDF5",
  },
  actionRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: colors.white,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    alignItems: "center",
  },
  actionBtnActive: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.navy,
  },
  actionBtnTextActive: {
    color: colors.white,
  },
  submitBtn: {
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: spacing.xl,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
  },
  historyList: {
    gap: spacing.sm,
    marginBottom: 40,
  },
  historyCard: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  historyIconBox: {
    marginRight: spacing.sm,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.navy,
  },
  historyStats: {
    alignItems: "flex-end",
  },
  statLabel: {
    fontSize: 12,
    color: colors.teal,
  },
  statVal: {
    fontWeight: "700",
    color: colors.navy,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.md,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.navy,
  },
  separator: {
    height: 1,
    backgroundColor: "#F1F5F9",
  },
  targetClassItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  targetClassName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.navy,
  },
});
