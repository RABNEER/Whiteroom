import { platformAlert } from "@/utils/alert";
import { BulletinResponse } from '@whiteroom/shared';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  RefreshControl,
  Modal,
} from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Calendar,
  CalendarCheck,
  ChevronRight,
  Clock,
  Megaphone,
  Shield,
  User,
  MessageSquare,
  Users,
  Lock,
  Search,
  type LucideIcon,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError } from '@/api/client';
import { useSession } from '@/auth/session-store';
import { colors, spacing, radius } from '@/theme/tokens';
import { formatDate } from '@/utils/format';
import {
  AppHeader,
  BottomNav,
  HeroPanel,
  LayeredChart,
  SiblingDrawer,
  Card,
  Banner,
  Button,
  Eyebrow,
  DisplayTitle,
  Muted,
  AvatarBadge,
  MetricCard,
  Segmented,
} from '@/components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

type ParentTab = 'ATTEND' | 'CLASSES' | 'CHAT' | 'PROFILE';
type ViewState = 'LIST' | 'ATTEND_DETAIL' | 'CLASS_DETAIL';

interface ChildItem {
  id: string;
  name: string;
  rollNumber?: string | null;
  tenantId?: string;
}

const TABS: { value: ParentTab; label: string; icon: LucideIcon }[] = [
  { value: 'ATTEND', label: 'Attend', icon: CalendarCheck },
  { value: 'CLASSES', label: 'Classes', icon: BookOpen },
  { value: 'CHAT', label: 'Chat', icon: MessageSquare },
  { value: 'PROFILE', label: 'Profile', icon: User },
];

// ─── Root Screen ──────────────────────────────────────────────────────────────

export default function ParentScreen() {
  const [activeTab, setActiveTab] = useState<ParentTab>('CLASSES');
  const [viewState, setViewState] = useState<ViewState>('LIST');
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedClassName, setSelectedClassName] = useState<string | null>(null);
  const [isSiblingDrawerOpen, setIsSiblingDrawerOpen] = useState(false);

  const clear = useSession((s) => s.clear);
  const setSession = useSession((s) => s.setSession);
  const queryClient = useQueryClient();
  const tenant = useQuery({ queryKey: ['tenant'], queryFn: api.tenantMe });
  const children = useQuery({ queryKey: ['parentChildren'], queryFn: api.parentChildren });

  const logout = useMutation({
    mutationFn: async () => {
      let fcmToken: string | undefined;
      try {
        const Notifications = require("expo-notifications");
        const token = await Notifications.getDevicePushTokenAsync();
        fcmToken = token.data;
      } catch {
        // Ignored if notifications not available
      }
      
      await api.logout(fcmToken);

      // FIX: FCM tokens not deleted on logout — notifications sent to old devices
      try {
        const messaging = require("@react-native-firebase/messaging");
        if (typeof messaging === "function") {
          await messaging().deleteToken();
        } else if (messaging && typeof messaging.default === "function") {
          await messaging.default().deleteToken();
        }
      } catch {
        // Ignored if Firebase Messaging is not installed
      }

      try {
        const AsyncStorage = require("@react-native-async-storage/async-storage");
        if (AsyncStorage && typeof AsyncStorage.clear === "function") {
          await AsyncStorage.clear();
        }
      } catch {
        // Ignored if AsyncStorage is not installed
      }

      const { Platform } = require("react-native");
      if (Platform.OS === "web") {
        try {
          globalThis.localStorage?.clear();
        } catch {}
      }
    },
    onSettled: async () => {
      await clear();
      router.replace('/auth');
    },
    onError: (err: unknown) => {
      platformAlert('Error', err instanceof ApiError ? err.message : 'Logout failed.');
    },
  });

  const deleteAccount = useMutation({
    mutationFn: async () => {
      await api.deleteAccount();
      try {
        const messaging = require("@react-native-firebase/messaging");
        if (typeof messaging === "function") {
          await messaging().deleteToken();
        } else if (messaging && typeof messaging.default === "function") {
          await messaging.default().deleteToken();
        }
      } catch {}
      try {
        const AsyncStorage = require("@react-native-async-storage/async-storage");
        if (AsyncStorage && typeof AsyncStorage.clear === "function") {
          await AsyncStorage.clear();
        }
      } catch {}
      const { Platform } = require("react-native");
      if (Platform.OS === "web") {
        try {
          globalThis.localStorage?.clear();
        } catch {}
      }
    },
    onSettled: async () => {
      await clear();
      router.replace('/auth');
    },
    onError: (err: unknown) => {
      platformAlert('Error', err instanceof ApiError ? err.message : 'Failed to delete account.');
    },
  });

  // Fall back to placeholder children while API loads (dev convenience)
  const childrenData: ChildItem[] = useMemo(() => {
    const list = children.data ?? [];
    if (list.length === 0) return [];
    return list;
  }, [children.data]);

  const selectedChild: ChildItem | undefined = useMemo(
    () => childrenData.find((c) => c.id === selectedChildId) ?? childrenData[0],
    [childrenData, selectedChildId],
  );

  const tenantName = tenant.data?.name ?? 'Whiteroom';

  const handleTabPress = (tab: ParentTab) => {
    setActiveTab(tab);
    setViewState('LIST');
    setSelectedClassId(null);
    setSelectedClassName(null);
  };

  return (
    <SafeAreaView style={s.root}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <AppHeader
        eyebrow="PARENT"
        title={selectedChild ? selectedChild.name : 'Parent View'}
        accent={selectedChild?.rollNumber ? `Roll ${selectedChild.rollNumber}` : undefined}
        avatarName={selectedChild?.name ?? 'Parent'}
        onAvatarPress={() => setIsSiblingDrawerOpen(true)}
      />

      {/* ── Content ────────────────────────────────────────────────── */}
      <View style={{ flex: 1 }}>
        {/* FeedTab removed from root tab navigation */}

        {activeTab === 'ATTEND' && viewState === 'LIST' && (
          <AttendTab
            selectedChild={selectedChild}
            onDetail={() => setViewState('ATTEND_DETAIL')}
          />
        )}
        {activeTab === 'ATTEND' && viewState === 'ATTEND_DETAIL' && (
          <ChildAttendDetail
            selectedChild={selectedChild}
            onBack={() => setViewState('LIST')}
          />
        )}

        {activeTab === 'CLASSES' && viewState === 'LIST' && (
          <ClassesTab
            selectedChild={selectedChild}
            onDetail={(classId, className) => {
              setSelectedClassId(classId);
              setSelectedClassName(className);
              setViewState('CLASS_DETAIL');
            }}
          />
        )}
        {activeTab === 'CLASSES' && viewState === 'CLASS_DETAIL' && (
          <ChildClassDetail
            selectedChild={selectedChild}
            classId={selectedClassId}
            className={selectedClassName}
            onBack={() => setViewState('LIST')}
          />
        )}

        {activeTab === 'CHAT' && <ChatsTab />}

        {activeTab === 'PROFILE' && (
          <ProfileTab
            childrenList={childrenData}
            selectedChild={selectedChild}
            onSelectChildPress={() => setIsSiblingDrawerOpen(true)}
            onLogout={() => {
              platformAlert('Log Out', 'Are you sure you want to log out?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Log Out', style: 'destructive', onPress: () => logout.mutate() },
              ]);
            }}
            onDeleteAccount={() => {
              platformAlert(
                'Delete Account',
                'Are you absolutely sure you want to delete your account? This action is permanent and your data cannot be recovered.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete Permanently', style: 'destructive', onPress: () => deleteAccount.mutate() },
                ]
              );
            }}
          />
        )}
      </View>

      {/* ── Bottom Tab Bar ─────────────────────────────────────────── */}
      <BottomNav
        value={activeTab}
        items={TABS}
        onChange={handleTabPress}
      />

      {/* Sibling Switcher bottom drawer modal */}
      <SiblingDrawer visible={isSiblingDrawerOpen} onClose={() => setIsSiblingDrawerOpen(false)}>
        {childrenData.length === 0 ? (
          <Text style={{ color: colors.teal, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>
            No children linked yet.
          </Text>
        ) : (
          childrenData.map((child) => {
            const active = selectedChild?.id === child.id;
            return (
              <Pressable
                key={child.id}
                accessibilityRole="button"
                style={[s.siblingItem, active && { borderColor: colors.navy, borderWidth: 2 }]}
                onPress={async () => {
                  setSelectedChildId(child.id);
                  setIsSiblingDrawerOpen(false);

                  // FIX: Parents cannot join multiple tenants — breaks multi-school families
                  const targetTenantId = child.tenantId;
                  const currentTenantId = tenant.data?.id;

                  if (targetTenantId && currentTenantId && targetTenantId !== currentTenantId) {
                    try {
                      const result = await api.switchTenant(targetTenantId);
                      await setSession(result);
                      await queryClient.invalidateQueries();
                    } catch (err: unknown) {
                      platformAlert(
                        'Error',
                        err instanceof ApiError ? err.message : 'Failed to switch school tenant.'
                      );
                    }
                  }
                }}
              >
                <AvatarBadge label={child.name} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={s.siblingName}>{child.name}</Text>
                  {child.rollNumber ? (
                    <Text style={s.classCardSub}>Roll {child.rollNumber}</Text>
                  ) : null}
                </View>
                {active && (
                  <View style={[s.badge, s.badgeDone]}>
                    <Text style={[s.badgeText, s.badgeTextDone]}>Active</Text>
                  </View>
                )}
              </Pressable>
            );
          })
        )}
      </SiblingDrawer>
    </SafeAreaView>
  );
}

// ─── S25/S26: Feed Tab ────────────────────────────────────────────────────────

function FeedTab({
  selectedChild,
  tenantName,
}: {
  selectedChild: ChildItem | undefined;
  tenantName: string;
}) {
  const feed = useQuery({ queryKey: ['parentFeed'], queryFn: () => api.parentFeed() });
  const announcements = feed.data?.announcements ?? [];
  const unread = feed.data?.unread ?? 0;

  return (
    <ScrollView style={s.tabContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
      {/* Welcome banner */}
      <HeroPanel compact>
        <Eyebrow style={{ color: colors.sky }}>FEED</Eyebrow>
        <DisplayTitle size="md" style={{ color: colors.white }}>{selectedChild?.name ?? 'Parent'}</DisplayTitle>
        <Muted style={{ color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>Class updates from {tenantName}</Muted>
      </HeroPanel>

      {/* Unread alert */}
      {unread > 0 && (
        <Banner tone="warning">
          You have {unread} unread announcement{unread > 1 ? 's' : ''}. Tap a card to read.
        </Banner>
      )}

      <Text style={[s.sectionTitle, { marginBottom: 12, marginTop: 16 }]}>ANNOUNCEMENTS & UPDATES</Text>

      {feed.isLoading ? (
        <ActivityIndicator color={colors.teal} style={{ marginTop: 24 }} />
      ) : announcements.length === 0 ? (
        <Card style={{ alignItems: 'center', paddingVertical: 32 }}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>📭</Text>
          <Text style={{ color: colors.teal, fontSize: 13, textAlign: 'center' }}>
            No announcements posted yet.
          </Text>
        </Card>
      ) : (
        announcements.map((ann) => (
          <Card
            key={ann.id}
            style={ann.isPinned ? { borderColor: colors.teal, borderWidth: 2 } : undefined}
          >
            {/* Institution badge row */}
            <View style={s.annInstitutionRow}>
              <View style={s.annInstitutionBadge}>
                <Text style={s.annInstitutionInitial}>
                  {tenantName.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <Text style={s.annInstitutionName}>
                {tenantName.toUpperCase()}
              </Text>
            </View>

            {ann.isPinned && <Text style={s.pinnedTag}>📌 PINNED</Text>}
            <Text style={s.cardTitle}>{ann.title}</Text>
            <Text style={{ color: colors.teal, fontSize: 13, lineHeight: 18 }}>{ann.body}</Text>

            <View style={s.annFooter}>
              <Text style={s.cardDate}>{formatDate(ann.createdAt)}</Text>
              <Button variant="ghost" style={{ paddingHorizontal: 12, paddingVertical: 4, height: 32 }}>
                View Detail
              </Button>
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

// ─── S27/S28: Attend Tab ──────────────────────────────────────────────────────

function AttendTab({
  selectedChild,
  onDetail,
}: {
  selectedChild: ChildItem | undefined;
  onDetail: () => void;
}) {
  const attendance = useQuery({
    queryKey: ['parentChildAttendance', selectedChild?.id],
    queryFn: () => api.parentChildAttendance(selectedChild!.id),
    enabled: Boolean(selectedChild?.id),
  });

  const logs = attendance.data?.data ?? (Array.isArray(attendance.data) ? attendance.data : []);
  const presentCount = logs.filter((l) => l.status === 'present').length;
  const absentCount = logs.filter((l) => l.status === 'absent').length;
  const total = logs.length;
  const percentage = total > 0 ? Math.round((presentCount / total) * 100) : 100;

  return (
    <ScrollView style={s.tabContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
      <Text style={s.pageTitle}>Attendance</Text>
      <Text style={[s.pageSub, { marginBottom: 16 }]}>Real-time session logs</Text>

      {/* Overall score banner with LayeredChart */}
      <View style={{ marginBottom: 20 }}>
        <HeroPanel compact>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <View style={{ flex: 1 }}>
              <Eyebrow style={{ color: colors.sky }}>OVERALL ATTENDANCE</Eyebrow>
              <DisplayTitle size="lg" accent="%" style={{ color: colors.white }}>{percentage}</DisplayTitle>
              <Muted style={{ color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
                {presentCount} Present · {absentCount} Absent
              </Muted>
            </View>
            <LayeredChart
              value={percentage}
              size={110}
              strokeWidth={16}
              strokeColor={colors.white}
              bgColor="rgba(255, 255, 255, 0.2)"
              textColor={colors.white}
              innerBgColor="transparent"
            />
          </View>
        </HeroPanel>
      </View>

      {/* Stats row with MetricCard */}
      <View style={{ flexDirection: 'row', gap: 14, marginBottom: 20 }}>
        <MetricCard label="Present" value={presentCount} tone="success" />
        <MetricCard label="Absent" value={absentCount} tone="danger" />
        <MetricCard label="Total" value={total} tone="primary" />
      </View>

      <Text style={[s.sectionTitle, { marginBottom: 12 }]}>ATTENDANCE RECORDS</Text>

      {attendance.isLoading ? (
        <ActivityIndicator color={colors.teal} style={{ marginTop: 24 }} />
      ) : logs.length === 0 ? (
        <Card style={{ alignItems: 'center', paddingVertical: 32 }}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>🗓️</Text>
          <Text style={{ color: colors.teal, fontSize: 13, textAlign: 'center' }}>
            No attendance sessions recorded yet.
          </Text>
        </Card>
      ) : (
        logs.map((log) => {
          const present = log.status === 'present';
          return (
            <Pressable
              key={log.id}
              accessibilityRole="button"
              style={s.classCard}
              onPress={onDetail}
            >
              <View style={s.classCardLeft}>
                <View style={s.classIconBox}>
                  <CalendarCheck color={colors.teal} size={18} />
                </View>
                <View>
                  <Text style={s.classCardName}>{formatDate(log.date)}</Text>
                  <Text style={s.classCardSub}>Session</Text>
                </View>
              </View>
              <View style={[s.badge, present ? s.badgeDone : s.badgeDanger]}>
                <Text style={[s.badgeText, present ? s.badgeTextDone : s.badgeTextDanger]}>
                  {present ? 'Present' : 'Absent'}
                </Text>
              </View>
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

// ─── S28: Child Attend Detail ─────────────────────────────────────────────────

function ChildAttendDetail({
  selectedChild,
  onBack,
}: {
  selectedChild: ChildItem | undefined;
  onBack: () => void;
}) {
  const attendance = useQuery({
    queryKey: ['parentChildAttendance', selectedChild?.id],
    queryFn: () => api.parentChildAttendance(selectedChild!.id),
    enabled: Boolean(selectedChild?.id),
  });

  const logs = attendance.data?.data ?? (Array.isArray(attendance.data) ? attendance.data : []);

  return (
    <ScrollView style={s.tabContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
      <Pressable accessibilityRole="button" style={s.backRow} onPress={onBack}>
        <ArrowLeft size={14} color={colors.teal} />
        <Text style={s.backText}>Back to Overview</Text>
      </Pressable>

      <Text style={s.detailTitle}>Attendance Detail</Text>
      <Text style={[s.detailSub, { marginBottom: 16 }]}>
        {selectedChild?.name ?? 'Student'}
      </Text>

      {/* Calendar placeholder */}
      <Card style={{ marginBottom: 16 }}>
        <Eyebrow>CALENDAR VIEW</Eyebrow>
        <View style={[s.calendarPlaceholder, { marginTop: 12 }]}>
          <Calendar size={48} color={colors.sky} />
          <Text style={{ color: colors.teal, fontSize: 13, marginTop: 12 }}>
            Visual Attendance Map
          </Text>
        </View>
      </Card>

      {/* Session logs */}
      <Card>
        <Eyebrow>SESSION LOGS</Eyebrow>
        <View style={{ marginTop: 8 }}>
          {logs.length === 0 ? (
            <Text style={{ color: colors.teal, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>
              No records found.
            </Text>
          ) : (
            logs.map((log) => {
              const present = log.status === 'present';
              return (
                <View
                  key={log.id}
                  style={[s.logRow, { borderBottomWidth: 1, borderBottomColor: colors.sky }]}
                >
                  <View>
                    <Text style={s.classCardName}>{formatDate(log.date)}</Text>
                    <Text style={s.classCardSub}>Session</Text>
                  </View>
                  <View style={[s.badge, present ? s.badgeDone : s.badgeDanger]}>
                    <Text style={[s.badgeText, present ? s.badgeTextDone : s.badgeTextDanger]}>
                      {present ? 'Present' : 'Absent'}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </Card>
    </ScrollView>
  );
}

// ─── S29/S30: Classes Tab ─────────────────────────────────────────────────────

function ClassesTab({
  selectedChild,
  onDetail,
}: {
  selectedChild: ChildItem | undefined;
  onDetail: (classId: string, className: string) => void;
}) {
  const classes = useQuery({
    queryKey: ['parentChildClasses', selectedChild?.id],
    queryFn: () => api.parentChildClasses(selectedChild!.id),
    enabled: Boolean(selectedChild?.id),
  });

  const list = classes.data ?? [];

  return (
    <ScrollView style={s.tabContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
      <Text style={s.pageTitle}>Classrooms</Text>
      <Text style={[s.pageSub, { marginBottom: 16 }]}>Enrolled classrooms and subjects</Text>

      <Text style={[s.sectionTitle, { marginBottom: 12 }]}>ENROLLED CLASSES</Text>

      {classes.isLoading ? (
        <ActivityIndicator color={colors.teal} style={{ marginTop: 24 }} />
      ) : list.length === 0 ? (
        <Card style={{ alignItems: 'center', paddingVertical: 32 }}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>🏫</Text>
          <Text style={{ color: colors.teal, fontSize: 13, textAlign: 'center' }}>
            Not enrolled in any classrooms yet.
          </Text>
        </Card>
      ) : (
        list.map((cls) => (
          <Pressable
            key={cls.id}
            accessibilityRole="button"
            style={s.classCard}
            onPress={() => onDetail(cls.id, cls.name)}
          >
            <View style={s.classCardLeft}>
              <View style={s.classIconBox}>
                <BookOpen color={colors.teal} size={18} />
              </View>
              <View>
                <Text style={s.classCardName}>{cls.name}</Text>
                {cls.subject ? <Text style={s.classCardSub}>{cls.subject}</Text> : null}
              </View>
            </View>
            <ChevronRight size={18} color={colors.teal} />
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

// ─── S30: Child Class Detail ──────────────────────────────────────────────────

function ChildClassDetail({
  selectedChild,
  classId,
  className,
  onBack,
}: {
  selectedChild: ChildItem | undefined;
  classId: string | null;
  className: string | null;
  onBack: () => void;
}) {
  const [subTab, setSubTab] = useState<'attendance' | 'info' | 'notices' | 'materials'>('attendance');

  const attendance = useQuery({
    queryKey: ['parentChildAttendance', selectedChild?.id, classId],
    queryFn: () => api.parentChildAttendance(selectedChild!.id, classId!),
    enabled: Boolean(selectedChild?.id && classId),
  });

  const schedulesQuery = useQuery({
    queryKey: ['schedules', classId],
    queryFn: () => api.schedules(classId!),
    enabled: Boolean(classId && subTab === 'info'),
  });

  const logs = attendance.data?.data ?? (Array.isArray(attendance.data) ? attendance.data : []);
  const presentCount = logs.filter((l) => l.status === 'present').length;
  const absentCount = logs.filter((l) => l.status === 'absent').length;

  return (
    <ScrollView style={s.tabContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
      <Pressable accessibilityRole="button" style={s.backRow} onPress={onBack}>
        <ArrowLeft size={14} color={colors.teal} />
        <Text style={s.backText}>Back to Classes</Text>
      </Pressable>

      <Text style={s.detailTitle}>{className ?? 'Class'}</Text>
      <Text style={[s.detailSub, { marginBottom: 16 }]}>
        {selectedChild?.name ?? 'Student'}
      </Text>

      {/* Segment tabs using standard component */}
      <Segmented
        value={subTab}
        options={[
          { value: 'attendance', label: 'Attendance' },
          { value: 'info', label: 'Info' },
          { value: 'notices', label: 'Notices' },
          { value: 'materials', label: 'Materials' },
        ]}
        onChange={(v) => setSubTab(v as any)}
      />

      {subTab === 'attendance' && (
        <View style={{ marginTop: 16 }}>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            <MetricCard label="Present" value={presentCount} tone="success" />
            <MetricCard label="Absent" value={absentCount} tone="danger" />
            <MetricCard label="Total" value={logs.length} tone="primary" />
          </View>

          {attendance.isLoading ? (
            <ActivityIndicator color={colors.teal} style={{ marginTop: 24 }} />
          ) : logs.length === 0 ? (
            <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Text style={{ color: colors.teal, fontSize: 13 }}>No records for this class.</Text>
            </Card>
          ) : (
            logs.map((log) => {
              const present = log.status === 'present';
              return (
                <View key={log.id} style={s.classCard}>
                  <View style={s.classCardLeft}>
                    <View style={s.classIconBox}>
                      <CalendarCheck color={colors.teal} size={18} />
                    </View>
                    <Text style={s.classCardName}>{formatDate(log.date)}</Text>
                  </View>
                  <View style={[s.badge, present ? s.badgeDone : s.badgeDanger]}>
                    <Text style={[s.badgeText, present ? s.badgeTextDone : s.badgeTextDanger]}>
                      {present ? 'Present' : 'Absent'}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      )}

      {subTab === 'info' && (
        <View style={{ marginTop: 16, gap: 12 }}>
          <Banner tone="info">
            Timetable schedules and classes are synchronised live with the main institution hub.
          </Banner>
          <Card>
            <Eyebrow>SCHEDULE</Eyebrow>
            {schedulesQuery.isLoading ? (
              <ActivityIndicator color={colors.teal} style={{ marginTop: 12 }} />
            ) : (schedulesQuery.data ?? []).length === 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <Clock size={14} color={colors.teal} />
                <Text style={{ color: '#64748B', fontSize: 13 }}>No schedule configured for this class yet.</Text>
              </View>
            ) : (
              <View style={{ marginTop: 8, gap: 8 }}>
                {(schedulesQuery.data ?? []).map((sch) => (
                  <View key={sch.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Clock size={14} color={colors.teal} />
                      <Text style={{ color: colors.navy, fontSize: 14, fontWeight: '600' }}>{sch.dayOfWeek}</Text>
                    </View>
                    <Text style={{ color: '#64748B', fontSize: 13, fontWeight: '500' }}>
                      {sch.startTime} - {sch.endTime}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Card>
          <View style={s.card}>
            <Text style={[s.sectionTitle, { marginBottom: 12 }]}>CLASS</Text>
            <Text style={{ color: colors.navy, fontSize: 14, fontWeight: '600' }}>
              {className}
            </Text>
          </View>
        </View>
      )}

      {subTab === 'notices' && (
        <ChildNoticesView classId={classId!} />
      )}

      {subTab === 'materials' && (
        <ChildMaterialsView classId={classId!} />
      )}
    </ScrollView>
  );
}

// ─── Classroom Notices & Materials Views ────────────────────────────────────────

function ChildNoticesView({ classId }: { classId: string }) {
  const qc = useQueryClient();
  const { data: bulletinsList = [], isLoading } = useQuery({
    queryKey: ["bulletins", classId],
    queryFn: () => api.getBulletins({ classId }),
    enabled: !!classId,
  });

  const readMutation = useMutation({
    mutationFn: (bulletinId: string) => api.markBulletinRead(bulletinId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bulletins", classId] });
    },
  });

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'FEES': return '#EF4444';
      case 'EXAM': return '#3B82F6';
      case 'HOLIDAY': return '#D97706';
      default: return '#10B981';
    }
  };

  return (
    <View style={{ marginTop: 16 }}>
      {isLoading ? (
        <ActivityIndicator color={colors.teal} style={{ marginTop: 24 }} />
      ) : bulletinsList.length === 0 ? (
        <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
          <Text style={{ color: colors.teal, fontSize: 13 }}>No notices for this class.</Text>
        </Card>
      ) : (
        bulletinsList.map((notice: BulletinResponse) => (
          <View key={notice.id} style={[s.classCard, { flexDirection: 'column', alignItems: 'stretch', gap: 6, borderLeftWidth: 4, borderLeftColor: getCategoryColor(notice.category) }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: getCategoryColor(notice.category) }}>
                {notice.category}
              </Text>
              <Text style={{ fontSize: 11, color: colors.teal }}>
                {new Date(notice.createdAt).toLocaleDateString()}
              </Text>
            </View>
            <Text style={{ color: colors.navy, fontSize: 15, fontWeight: '700' }}>{notice.title}</Text>
            <Text style={{ color: colors.teal, fontSize: 13, lineHeight: 18 }}>{notice.body}</Text>
            <View style={{ borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: 8, paddingTop: 8, flexDirection: 'row', justifyContent: 'flex-start' }}>
              {!notice.isRead ? (
                <Pressable
                  onPress={() => readMutation.mutate(notice.id)}
                  style={{ backgroundColor: colors.teal, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, flexDirection: 'row', alignItems: 'center' }}
                >
                  <Text style={{ color: colors.white, fontSize: 11, fontWeight: '600' }}>Mark Read</Text>
                </Pressable>
              ) : (
                <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '600' }}>✓ Seen</Text>
              )}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function ChildMaterialsView({ classId }: { classId: string }) {
  return (
    <Card style={{ padding: 16, alignItems: 'center', marginTop: 16 }}>
      <BookOpen size={48} color={colors.teal} style={{ marginBottom: 12 }} />
      <Text style={{ color: colors.navy, fontSize: 16, fontWeight: '700', marginBottom: 4 }}>Study Material Archive</Text>
      <Text style={{ color: colors.teal, fontSize: 13, textAlign: 'center', marginBottom: 16, lineHeight: 18 }}>
        Access reference guides, files, worksheets, and study notes shared by the classroom teacher.
      </Text>
      <Button
        onPress={() => router.push({ pathname: "/classes/[classId]/archive", params: { classId } } as any)}
        style={{ alignSelf: 'stretch' }}
      >
        Open Study Archive
      </Button>
    </Card>
  );
}

// ─── S31–S34: Profile Tab ─────────────────────────────────────────────────────

function ProfileTab({
  childrenList,
  selectedChild,
  onSelectChildPress,
  onLogout,
  onDeleteAccount,
}: {
  childrenList: ChildItem[];
  selectedChild: ChildItem | undefined;
  onSelectChildPress: () => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
}) {
  return (
    <ScrollView style={s.tabContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>

      {/* Active Child Card */}
      <Card style={{ marginBottom: 16, borderRadius: 16 }}>
        <Eyebrow style={{ color: colors.teal, marginBottom: 8 }}>Active Child</Eyebrow>
        {selectedChild ? (
          <Pressable
            accessibilityRole="button"
            style={[s.siblingItem, { marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.sky }]}
            onPress={onSelectChildPress}
          >
            <AvatarBadge label={selectedChild.name} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.siblingName}>{selectedChild.name}</Text>
              {selectedChild.rollNumber ? (
                <Text style={s.classCardSub}>Roll {selectedChild.rollNumber}</Text>
              ) : null}
            </View>
            <View style={[s.badge, s.badgeDone]}>
              <Text style={[s.badgeText, s.badgeTextDone]}>Active</Text>
            </View>
          </Pressable>
        ) : (
          <Text style={{ color: colors.teal, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>
            No children linked yet.
          </Text>
        )}
        <Text style={{ color: colors.teal, fontSize: 11, textAlign: 'center', marginTop: 12, lineHeight: 16 }}>
          Tap the child card above or use the top-right header avatar to switch between registered siblings.
        </Text>
      </Card>

      {/* Settings Card */}
      <Text style={[s.sectionTitle, { marginBottom: 8, marginLeft: 4 }]}>Settings</Text>
      <Card style={{ marginBottom: 16, borderRadius: 16, paddingVertical: 8 }}>
        <ProfileLink icon={Bell} label="Alert Notifications" />
        <ProfileLink icon={Shield} label="Privacy & Data" last />
      </Card>

      {/* Account Details Card */}
      <Text style={[s.sectionTitle, { marginBottom: 8, marginLeft: 4 }]}>Account Details</Text>
      <Card style={{ marginBottom: 20, borderRadius: 16, padding: 18 }}>
        <View style={[s.profileRow, { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.sky }]}>
          <Text style={{ color: colors.teal, fontSize: 13, fontWeight: '600' }}>Account Type</Text>
          <Text style={s.profileValue}>Family Account</Text>
        </View>

        <View style={[s.profileRow, { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.sky }]}>
          <Text style={{ color: colors.teal, fontSize: 13, fontWeight: '600' }}>Verification</Text>
          <View style={s.activePill}>
            <Text style={s.activePillText}>SECURE OTP</Text>
          </View>
        </View>

        <View style={[s.profileRow, { paddingVertical: 10 }]}>
          <Text style={{ color: colors.teal, fontSize: 13, fontWeight: '600' }}>Linked Children</Text>
          <Text style={s.profileValue}>{childrenList.length} Registered</Text>
        </View>
      </Card>

      {/* Logout button */}
      <Button variant="danger" onPress={onLogout} style={{ borderRadius: 12 }}>
        Log Out
      </Button>

      {/* Delete Account button */}
      <Button variant="ghost" onPress={onDeleteAccount} style={{ borderRadius: 12, marginTop: 12 }}>
        <Text style={{ color: colors.danger, fontWeight: '600' }}>Delete Account</Text>
      </Button>
    </ScrollView>
  );
}

// ─── Helper Components ────────────────────────────────────────────────────────

function ProfileLink({ icon: Icon, label, last }: { icon: LucideIcon; label: string; last?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      style={[
        s.profileLink,
        !last && { borderBottomWidth: 1, borderBottomColor: colors.sky },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon size={18} color={colors.teal} />
        <Text style={{ color: colors.navy, fontSize: 14, fontWeight: '600' }}>{label}</Text>
      </View>
      <ChevronRight size={16} color={colors.teal} />
    </Pressable>
  );
}

// ─── Chats Tab Component ───────────────────────────────────────────────────────

type ChatFilter = 'ALL' | 'UNREAD' | 'GROUPS' | 'PERSONAL';

function ChatsTab() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ChatFilter>('ALL');
  const [pinnedRoomIds, setPinnedRoomIds] = useState<string[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<any | null>(null);
  const [roomDrafts, setRoomDrafts] = useState<Record<string, string>>({
    "room-1": "Make sure to bring notes tomorrow...",
  });

  // Fetch Rooms
  const { data: rooms = [], isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["chatRooms"],
    queryFn: api.chatRooms,
    refetchInterval: 10000, // Auto-poll every 10 seconds for new messages
  });

  const sortedRooms = useMemo(() => {
    return [...rooms].sort((a, b) => {
      const aPinned = pinnedRoomIds.includes(a.id);
      const bPinned = pinnedRoomIds.includes(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [rooms, pinnedRoomIds]);

  const filteredRooms = useMemo(() => {
    let list = sortedRooms;

    if (search.trim()) {
      const query = search.toLowerCase();
      list = list.filter(
        (room) =>
          room.name.toLowerCase().includes(query) ||
          room.subtitle.toLowerCase().includes(query)
      );
    }

    if (filter === 'UNREAD') {
      list = list.filter((room) => room.unreadCount > 0);
    } else if (filter === 'GROUPS') {
      list = list.filter((room) => room.type === 'classroom' || room.type === 'teacher_channel');
    } else if (filter === 'PERSONAL') {
      list = list.filter((room) => room.type === 'direct_message');
    }

    return list;
  }, [sortedRooms, search, filter]);

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

  const togglePinRoom = (roomId: string) => {
    setPinnedRoomIds((prev) =>
      prev.includes(roomId) ? prev.filter((id) => id !== roomId) : [...prev, roomId]
    );
    setSelectedRoom(null);
  };

  const renderRoomItem = ({ item }: { item: any }) => {
    const isDM = item.type === "direct_message";
    const isStaff = item.type === "teacher_channel";
    const isAnnouncement = item.type === "classroom" && item.chatMode === "announcement";
    const draftText = roomDrafts[item.id];
    const isPinned = pinnedRoomIds.includes(item.id);

    // Room Icon / Theme Color
    let IconComponent = MessageSquare;
    let iconColor: string = colors.teal;

    if (isStaff) {
      IconComponent = Lock;
      iconColor = "#B45309"; // Muted Amber
    } else if (isAnnouncement) {
      IconComponent = Megaphone;
      iconColor = colors.navy;
    } else if (item.type === "classroom") {
      IconComponent = Users;
      iconColor = colors.sky;
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
        onLongPress={() => setSelectedRoom(item)}
        style={({ pressed }) => [
          chatStyles.roomItem,
          pressed && chatStyles.roomItemPressed,
        ]}
      >
        <View style={chatStyles.avatarContainer}>
          <AvatarBadge label={item.name} />
          <View style={[chatStyles.typeBadge, { backgroundColor: iconColor }]}>
            <IconComponent color={colors.white} size={10} />
          </View>
        </View>

        <View style={chatStyles.roomContent}>
          <View style={chatStyles.roomHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1, marginRight: spacing.sm }}>
              {isPinned && (
                <Text style={{ marginRight: 4, fontSize: 14 }}>📌</Text>
              )}
              <Text style={chatStyles.roomName} numberOfLines={1}>
                {item.name}
              </Text>
            </View>
            <Text style={chatStyles.roomTime}>{formatTime(item.updatedAt)}</Text>
          </View>

          <View style={chatStyles.roomFooter}>
            <Text
              style={[
                chatStyles.roomSubtitle,
                draftText && { color: "#22C55E", fontWeight: "600" }
              ]}
              numberOfLines={1}
            >
              {draftText ? `Draft: ${draftText}` : item.subtitle}
            </Text>
            {item.unreadCount > 0 && (
              <View style={chatStyles.unreadBadge}>
                <Text style={chatStyles.unreadText}>{item.unreadCount}</Text>
              </View>
            )}
          </View>
          
          <View style={chatStyles.tagRow}>
            {isAnnouncement && (
              <View style={chatStyles.noticeTag}>
                <Megaphone size={10} color={colors.navy} style={{ marginRight: 2 }} />
                <Text style={chatStyles.noticeTagText}>Notice Board</Text>
              </View>
            )}
            {isStaff && (
              <View style={[chatStyles.noticeTag, { backgroundColor: "#FEF3C7" }]}>
                <Lock size={10} color="#B45309" style={{ marginRight: 2 }} />
                <Text style={[chatStyles.noticeTagText, { color: "#B45309" }]}>Staff Only</Text>
              </View>
            )}
            {isDM && (
              <View style={[chatStyles.noticeTag, { backgroundColor: `${colors.teal}12` }]}>
                <MessageSquare size={10} color={colors.teal} style={{ marginRight: 2 }} />
                <Text style={[chatStyles.noticeTagText, { color: colors.teal }]}>
                  {item.otherParticipant?.role === "teacher" ? "Teacher DM" : "Parent DM"}
                </Text>
              </View>
            )}
          </View>
        </View>
        
        <ChevronRight size={16} color={colors.teal} style={chatStyles.chevron} />
      </Pressable>
    );
  };

  return (
    <View style={chatStyles.container}>
      {/* Search Bar */}
      <View style={chatStyles.searchContainer}>
        <View style={chatStyles.searchBar}>
          <Search color={colors.teal} size={18} style={chatStyles.searchIcon} />
          <TextInput
            placeholder="Search conversations..."
            placeholderTextColor={colors.teal}
            value={search}
            onChangeText={setSearch}
            style={chatStyles.searchInput}
          />
        </View>
      </View>

      {/* Filters Row */}
      <View style={{ height: 48 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={chatStyles.filtersContainer}
          contentContainerStyle={chatStyles.filtersContent}
        >
          {(['ALL', 'UNREAD', 'GROUPS', 'PERSONAL'] as ChatFilter[]).map((f) => {
            const active = filter === f;
            return (
              <Pressable
                key={f}
                style={[chatStyles.filterPill, active && chatStyles.filterPillActive]}
                onPress={() => setFilter(f)}
              >
                <Text style={[chatStyles.filterPillText, active && chatStyles.filterPillTextActive]}>
                  {f === 'ALL' ? 'All' : f === 'UNREAD' ? 'Unread' : f === 'GROUPS' ? 'Groups' : 'Personal'}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Conversations List */}
      {isLoading ? (
        <View style={chatStyles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.navy} />
          <Text style={chatStyles.loadingText}>Loading conversations...</Text>
        </View>
      ) : filteredRooms.length === 0 ? (
        <View style={chatStyles.emptyContainer}>
          <MessageSquare size={48} color={colors.teal} style={{ marginBottom: 12 }} />
          <Text style={chatStyles.emptyTitle}>No chats found</Text>
          <Text style={chatStyles.emptyDesc}>
            {search ? "Try adjusting your search query." : "No active classroom chats or direct messages."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredRooms}
          keyExtractor={(item) => item.id}
          renderItem={renderRoomItem}
          contentContainerStyle={chatStyles.listContent}
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

      {/* Long Press Bottom actions sheet modal */}
      <Modal
        visible={!!selectedRoom}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedRoom(null)}
      >
        <Pressable style={chatStyles.modalOverlay} onPress={() => setSelectedRoom(null)}>
          <View style={chatStyles.bottomSheetContainer}>
            <Text style={chatStyles.sheetTitle}>{selectedRoom?.name}</Text>
            
            <Pressable
              style={chatStyles.sheetItem}
              onPress={() => togglePinRoom(selectedRoom.id)}
            >
              <Text style={chatStyles.sheetItemText}>
                {pinnedRoomIds.includes(selectedRoom?.id) ? "📌 Unpin Conversation" : "📌 Pin Conversation"}
              </Text>
            </Pressable>

            <Pressable
              style={chatStyles.sheetItem}
              onPress={() => setSelectedRoom(null)}
            >
              <Text style={[chatStyles.sheetItemText, { color: colors.danger }]}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const chatStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
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
  filtersContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.paper,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    maxHeight: 50,
  },
  filtersContent: {
    gap: 8,
    paddingRight: spacing.md,
    alignItems: 'center',
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  filterPillActive: {
    backgroundColor: `${colors.teal}20`,
    borderWidth: 1,
    borderColor: colors.teal,
  },
  filterPillText: {
    fontSize: 13,
    color: colors.teal,
    fontWeight: "600",
  },
  filterPillTextActive: {
    color: colors.teal,
    fontWeight: "700",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
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
    paddingVertical: 80,
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
    paddingBottom: 110,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "flex-end",
  },
  bottomSheetContainer: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.navy,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  sheetItem: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  sheetItemText: {
    fontSize: 15,
    color: colors.navy,
    fontWeight: "600",
  },
});

// ─── StyleSheet ───────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 64,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.sky,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoBox: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: colors.navy,
    justifyContent: 'center', alignItems: 'center',
  },
  logoText: { color: colors.white, fontWeight: '900', fontSize: 14 },
  headerBrand: { color: colors.navy, fontWeight: '900', fontSize: 11, letterSpacing: 2 },
  headerSub: { color: colors.teal, fontSize: 11 },
  iconBtn: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 1.5, borderColor: colors.sky,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarCircle: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.navy,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: colors.white, fontWeight: '700', fontSize: 14 },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.sky,
    paddingVertical: 8,
  },
  tabItem: { flex: 1, alignItems: 'center', gap: 4 },
  tabIconWrap: {
    width: 40, height: 32, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  tabIconActive: { backgroundColor: colors.navy },
  tabLabel: { color: colors.teal, fontSize: 10, letterSpacing: 0.5 },
  tabLabelActive: { color: colors.navy, fontWeight: '600' },

  // Content
  tabContent: { flex: 1, padding: 16 },

  // Welcome Banner
  welcomeBanner: {
    backgroundColor: colors.navy,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  welcomeGreeting: { color: colors.sky, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  welcomeName: { color: colors.white, fontSize: 22, fontWeight: '700', marginTop: 4 },
  welcomeSub: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 4 },

  // Alert banner
  alertBanner: {
    backgroundColor: colors.navy,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  alertIconCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.teal,
    justifyContent: 'center', alignItems: 'center',
  },
  alertTitle: { color: colors.white, fontSize: 13, fontWeight: '700' },
  alertSub: { color: 'rgba(255,255,255,0.6)', fontSize: 11 },

  // Section
  sectionTitle: {
    color: colors.navy, fontSize: 11, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase',
  },

  // Card
  card: {
    backgroundColor: colors.white,
    borderWidth: 1.5, borderColor: colors.sky,
    borderRadius: 14, padding: 18, marginBottom: 12,
  },
  cardTitle: { color: colors.navy, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  cardDate: { color: colors.teal, fontSize: 11, marginTop: 8 },

  // Announcement extras
  annInstitutionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
  },
  annInstitutionBadge: {
    width: 22, height: 22, borderRadius: 6, backgroundColor: colors.navy,
    justifyContent: 'center', alignItems: 'center',
  },
  annInstitutionInitial: { color: colors.white, fontSize: 10, fontWeight: '900' },
  annInstitutionName: { color: colors.teal, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  annFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16,
  },
  outlineBtnSmall: {
    borderWidth: 1.5, borderColor: colors.sky, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 4,
  },
  outlineBtnSmallText: { color: colors.teal, fontSize: 10, fontWeight: '700' },
  pinnedTag: {
    color: colors.teal, fontSize: 9, fontWeight: '700',
    letterSpacing: 1.5, marginBottom: 4, textTransform: 'uppercase',
  },

  // Page titles
  pageTitle: { color: colors.navy, fontSize: 22, fontWeight: '700', marginBottom: 4 },
  pageSub: { color: colors.teal, fontSize: 13 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statPill: {
    backgroundColor: colors.white,
    borderWidth: 1.5, borderColor: colors.sky,
    borderRadius: 12, padding: 12, flex: 1, alignItems: 'center',
  },
  statNumber: { color: colors.navy, fontSize: 24, fontWeight: '900' },
  statLabel: {
    color: colors.teal, fontSize: 10, letterSpacing: 1,
    marginTop: 2, textTransform: 'uppercase',
  },

  // Class card
  classCard: {
    backgroundColor: colors.white,
    borderWidth: 1.5, borderColor: colors.sky,
    borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 8,
  },
  classCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  classIconBox: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.sky,
    justifyContent: 'center', alignItems: 'center',
  },
  classCardName: { color: colors.navy, fontSize: 14, fontWeight: '600' },
  classCardSub: { color: colors.teal, fontSize: 12, marginTop: 2 },

  // Badges
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeDone: { backgroundColor: '#DCFCE7' },
  badgeDanger: { backgroundColor: '#FEE2E2' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextDone: { color: '#15803D' },
  badgeTextDanger: { color: colors.danger },

  // Back navigation
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  backText: { color: colors.teal, fontSize: 13, fontWeight: '600' },
  detailTitle: { color: colors.navy, fontSize: 22, fontWeight: '900' },
  detailSub: { color: colors.teal, fontSize: 13, marginTop: 4 },

  // Segment tabs
  segmentRow: { flexDirection: 'row', gap: 6 },
  segmentPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  segmentActive: { backgroundColor: colors.navy },
  segmentInactive: { backgroundColor: colors.sky },
  segmentText: { fontSize: 12 },
  segmentTextActive: { color: colors.white, fontWeight: '700' },
  segmentTextInactive: { color: colors.teal, fontWeight: '600' },

  // Calendar placeholder
  calendarPlaceholder: {
    height: 180, backgroundColor: colors.paper, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },

  // Log row
  logRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 12,
  },

  // Profile tab
  siblingItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderRadius: 10,
    backgroundColor: colors.white,
    borderWidth: 1.5, borderColor: colors.sky,
    gap: 12, marginBottom: 8,
  },
  siblingName: { color: colors.navy, fontSize: 14, fontWeight: '700' },
  eyebrow: {
    color: colors.teal, fontSize: 9, fontWeight: '800',
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12,
  },
  profileRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  profileValue: { color: colors.navy, fontSize: 14, fontWeight: '600' },
  activePill: {
    backgroundColor: colors.sky, borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  activePillText: { color: colors.navy, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  profileLink: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingVertical: 14,
  },
  logoutBtn: {
    backgroundColor: colors.danger, borderRadius: 12, height: 48,
    flexDirection: 'row', gap: 8,
    justifyContent: 'center', alignItems: 'center', marginTop: 4,
  },
  logoutBtnText: { color: colors.white, fontSize: 14, fontWeight: '600' },
});
