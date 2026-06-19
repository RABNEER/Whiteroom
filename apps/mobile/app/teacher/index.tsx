import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  Home,
  BookOpen,
  Megaphone,
  User,
  LogOut,
  ChevronRight,
  Plus,
  ArrowLeft,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/api/client';
import { useSession } from '@/auth/session-store';
import { colors, spacing } from '@/theme/tokens';
import { todayIsoDate, formatDateDdmmyyyy } from '@/utils/format';
import { isOnline, offlineQueue } from '@/utils/offlineQueue';
import {
  AppHeader,
  BottomNav,
  HeroPanel,
  MetricCard,
  DonutChart3D,
  Segmented,
  Field,
  Button,
  Card,
  Banner,
  Eyebrow,
  DisplayTitle,
  Muted,
  IconButton,
} from '@/components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'HOME' | 'CLASSES' | 'ANNOUNCE' | 'PROFILE';
type DetailView = 'LIST' | 'DETAIL';
type SubTab = 'Attendance' | 'Students' | 'Schedule' | 'Invite';
type AttendanceStatus = 'present' | 'absent';

// ─── Root Screen ──────────────────────────────────────────────────────────────

export default function TeacherScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('HOME');
  const [view, setView] = useState<DetailView>('LIST');
  const [selectedClass, setSelectedClass] = useState<{ id: string; name: string; subject?: string | null } | null>(null);
  const [isCreatingClass, setIsCreatingClass] = useState(false);

  const clear = useSession((s) => s.clear);
  const qc = useQueryClient();

  const tenant = useQuery({ queryKey: ['tenant'], queryFn: api.tenantMe });
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => api.classes() });

  // Guard: redirect incomplete onboarding (only when data has loaded, not while fetching)
  useEffect(() => {
    if (!tenant.isLoading && tenant.data && tenant.data.name === 'My Institute') {
      router.replace('/tenant-init');
    }
  }, [tenant.isLoading, tenant.data]);

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
  });

  const tenantName = tenant.data?.name ?? 'My Institution';
  const classList = classes.data?.data ?? [];

  // ── Bottom Tab Bar ───────────────────────────────────────────────────────────
  const TABS: { value: Tab; label: string; icon: LucideIcon }[] = [
    { value: 'HOME', label: 'Home', icon: Home },
    { value: 'CLASSES', label: 'Classes', icon: BookOpen },
    { value: 'ANNOUNCE', label: 'Announce', icon: Megaphone },
    { value: 'PROFILE', label: 'Profile', icon: User },
  ];

  return (
    <SafeAreaView style={s.container}>
      <AppHeader
        title={tenantName}
        eyebrow="TEACHER"
        avatarName={tenantName}
        trailing={
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ marginRight: 8 }}>
              <IconButton
                icon={MessageSquare}
                onPress={() => router.push("/chat" as any)}
              />
            </View>
            <IconButton
              icon={LogOut}
              onPress={() => logout.mutate()}
              active={logout.isPending}
            />
          </View>
        }
      />

      <View style={{ flex: 1 }}>
        {activeTab === 'HOME' && (
          <HomeTab
            tenantName={tenantName}
            classList={classList}
            sessions={[]}
            onTabChange={(t) => setActiveTab(t)}
            onClassPress={(cls) => {
              setSelectedClass(cls);
              setView('DETAIL');
              setActiveTab('CLASSES');
            }}
          />
        )}
        {activeTab === 'CLASSES' && (
          <ClassroomsTab
            classList={classList}
            view={view}
            selectedClass={selectedClass}
            isCreatingClass={isCreatingClass}
            onSelectClass={(cls) => { setSelectedClass(cls); setView('DETAIL'); }}
            onBack={() => { setView('LIST'); setSelectedClass(null); }}
            onToggleCreate={(v) => setIsCreatingClass(v)}
          />
        )}
        {activeTab === 'ANNOUNCE' && (
          <AnnounceTab />
        )}
        {activeTab === 'PROFILE' && (
          <ProfileTab
            tenantName={tenantName}
            onLogout={() => logout.mutate()}
          />
        )}
      </View>

      <BottomNav
        value={activeTab}
        items={TABS}
        onChange={(val) => {
          setActiveTab(val);
          setView('LIST');
          setIsCreatingClass(false);
        }}
      />
    </SafeAreaView>
  );
}

// ─── S10: Home Tab ────────────────────────────────────────────────────────────

function HomeTab({
  tenantName,
  classList,
  sessions,
  onTabChange,
  onClassPress,
}: {
  tenantName: string;
  classList: { id: string; name: string; subject?: string | null }[];
  sessions: { classId: string; totalPresent?: number | null }[];
  onTabChange: (t: Tab) => void;
  onClassPress: (cls: { id: string; name: string; subject?: string | null }) => void;
}) {
  const students = useQuery({ queryKey: ['students'], queryFn: () => api.students() });
  const sessionsQ = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.attendanceSessions({ date: todayIsoDate() }),
  });

  const todaySessions = sessionsQ.data?.data ?? [];
  const studentCount = students.data?.data?.length ?? 0;
  const doneCount = todaySessions.filter((x) => x.totalPresent != null).length;

  return (
    <ScrollView style={s.tabContent} contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
      {/* Welcome Banner */}
      <HeroPanel compact>
        <Eyebrow style={{ color: colors.sky }}>TODAY</Eyebrow>
        <DisplayTitle size="md" style={{ color: colors.white }}>{tenantName}</DisplayTitle>
        <Muted style={{ color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>{formatDateDdmmyyyy(new Date())}</Muted>
      </HeroPanel>

      {/* Stats Row */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: spacing.md, marginTop: spacing.md }}>
        <MetricCard label="Classes" value={classList.length} tone="primary" />
        <MetricCard label="Done Today" value={doneCount} tone="success" />
      </View>

      {/* Today's Classes */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>TODAY'S CLASSES</Text>
          <Pressable onPress={() => onTabChange('CLASSES')}>
            <Text style={s.sectionLink}>See all →</Text>
          </Pressable>
        </View>

        {classList.length === 0 ? (
          <View style={[s.card, { alignItems: 'center', padding: 24 }]}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>📚</Text>
            <Text style={{ color: colors.teal, fontSize: 13, textAlign: 'center' }}>
              No classrooms yet. Create your first one.
            </Text>
          </View>
        ) : (
          classList.slice(0, 3).map((cls) => {
            const session = todaySessions.find((ss) => ss.classId === cls.id);
            const done = session?.totalPresent != null;
            return (
              <Pressable
                key={cls.id}
                accessibilityRole="button"
                style={s.classCard}
                onPress={() => onClassPress(cls)}
              >
                <View style={s.classCardLeft}>
                  <View style={s.classIconBox}>
                    <BookOpen size={18} color={colors.teal} />
                  </View>
                  <View>
                    <Text style={s.className}>{cls.name}</Text>
                    {cls.subject ? <Text style={s.classSub}>{cls.subject}</Text> : null}
                  </View>
                </View>
                <View style={[s.statusBadge, done ? s.statusSuccess : s.statusPending]}>
                  <Text style={[s.statusText, done ? { color: '#15803D' } : { color: colors.teal }]}>
                    {done ? `${session?.totalPresent} Present` : 'Pending'}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

function StatPill({ value, label }: { value: number; label: string }) {
  return (
    <View style={s.statPill}>
      <Text style={s.statNumber}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ─── S11: Classrooms Tab ──────────────────────────────────────────────────────

function ClassroomsTab({
  classList,
  view,
  selectedClass,
  isCreatingClass,
  onSelectClass,
  onBack,
  onToggleCreate,
}: {
  classList: { id: string; name: string; subject?: string | null }[];
  view: DetailView;
  selectedClass: { id: string; name: string; subject?: string | null } | null;
  isCreatingClass: boolean;
  onSelectClass: (cls: { id: string; name: string; subject?: string | null }) => void;
  onBack: () => void;
  onToggleCreate: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');

  const createClass = useMutation({
    mutationFn: () => api.classCreate({ name: name.trim(), subject: subject.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['classes'] });
      setName('');
      setSubject('');
      onToggleCreate(false);
    },
    onError: (err: unknown) => {
      Alert.alert('Error', err instanceof ApiError ? err.message : 'Failed to create classroom. Please try again.');
    },
  });

  if (view === 'DETAIL' && selectedClass) {
    return <ClassDetailView cls={selectedClass} onBack={onBack} />;
  }

  return (
    <View style={s.tabContent}>
      {/* Create button or inline form */}
      {!isCreatingClass ? (
        <Pressable
          accessibilityRole="button"
          style={s.newClassButton}
          onPress={() => onToggleCreate(true)}
        >
          <Plus size={16} color={colors.white} />
          <Text style={s.newClassText}>New Classroom</Text>
        </Pressable>
      ) : (
        <Card style={{ marginTop: 0, marginBottom: 16 }}>
          <Text style={s.formTitle}>New Classroom</Text>
          <Field
            label="CLASS NAME"
            placeholder="e.g. Class 11 – Batch B"
            value={name}
            onChangeText={setName}
          />
          <Field
            label="SUBJECT (OPTIONAL)"
            placeholder="e.g. Physics"
            value={subject}
            onChangeText={setSubject}
          />
          <View style={s.formButtons}>
            <Button
              variant="ghost"
              onPress={() => onToggleCreate(false)}
              style={{ flex: 1 }}
            >
              Cancel
            </Button>
            <Button
              onPress={() => createClass.mutate()}
              disabled={!name.trim()}
              loading={createClass.isPending}
              style={{ flex: 1 }}
            >
              Create
            </Button>
          </View>
        </Card>
      )}

      {/* Class list */}
      <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 12 }}>
        {classList.length === 0 ? (
          <View style={[s.card, { alignItems: 'center', padding: 24 }]}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>🏫</Text>
            <Text style={{ color: colors.teal, fontSize: 13, textAlign: 'center' }}>
              No classrooms yet. Create your first one above.
            </Text>
          </View>
        ) : (
          classList.map((cls) => (
            <Pressable
              key={cls.id}
              accessibilityRole="button"
              style={s.classRow}
              onPress={() => onSelectClass(cls)}
            >
              <View style={s.classCardLeft}>
                <View style={s.classIconBox}>
                  <BookOpen size={18} color={colors.teal} />
                </View>
                <View>
                  <Text style={s.className}>{cls.name}</Text>
                  {cls.subject ? <Text style={s.classSub}>{cls.subject}</Text> : null}
                </View>
              </View>
              <ChevronRight size={18} color={colors.teal} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ─── S12: Classroom Detail View ───────────────────────────────────────────────

function ClassDetailView({
  cls,
  onBack,
}: {
  cls: { id: string; name: string; subject?: string | null };
  onBack: () => void;
}) {
  const [subTab, setSubTab] = useState<SubTab>('Attendance');

  return (
    <View style={s.tabContent}>
      {/* Back navigation */}
      <Pressable accessibilityRole="button" style={s.backRow} onPress={onBack}>
        <ArrowLeft size={14} color={colors.teal} />
        <Text style={s.backText}>Classrooms</Text>
      </Pressable>

      <Text style={s.detailTitle}>{cls.name}</Text>
      {cls.subject ? <Text style={s.detailSub}>{cls.subject}</Text> : null}

      {/* Segment Tabs */}
      <Segmented
        value={subTab}
        options={[
          { value: 'Attendance', label: 'Attendance' },
          { value: 'Students', label: 'Students' },
          { value: 'Schedule', label: 'Schedule' },
          { value: 'Invite', label: 'Invite' },
        ]}
        onChange={(v) => setSubTab(v as SubTab)}
      />

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, marginTop: 16 }}>
        {subTab === 'Attendance' && <AttendanceView classId={cls.id} />}
        {subTab === 'Students' && <StudentsView classId={cls.id} />}
        {subTab === 'Schedule' && <ScheduleView classId={cls.id} />}
        {subTab === 'Invite' && <InviteView />}
      </ScrollView>
    </View>
  );
}

// ─── S13/S14: Attendance View ─────────────────────────────────────────────────

function AttendanceView({ classId }: { classId: string }) {
  const qc = useQueryClient();
  const [records, setRecords] = useState<Record<string, AttendanceStatus>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [online, setOnline] = useState(isOnline());
  const [offlineCount, setOfflineCount] = useState(0);

  // Monitor network status on web browser
  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleOnline = () => setOnline(true);
      const handleOffline = () => setOnline(false);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  // Update offline count and handle auto-flush
  const updateOfflineCount = () => {
    offlineQueue.getQueue().then((q) => setOfflineCount(q.length));
  };

  useEffect(() => {
    updateOfflineCount();
  }, [submitted]);

  useEffect(() => {
    if (online) {
      offlineQueue.flush(api.attendanceMark).then(({ success }) => {
        if (success > 0) {
          qc.invalidateQueries({ queryKey: ['sessions'] });
          updateOfflineCount();
        }
      });
    }
  }, [online]);

  const students = useQuery({
    queryKey: ['classStudents', classId],
    queryFn: () => api.classStudents(classId),
  });

  const createSession = useMutation({
    mutationFn: () => api.attendanceCreateSession({ classId, date: todayIsoDate() }),
    onSuccess: (session) => {
      setSessionId(session.id);
      const initial: Record<string, AttendanceStatus> = {};
      const studentList = students.data?.data ?? [];
      studentList.forEach((st) => { initial[st.id] = 'present'; });
      setRecords(initial);
    },
    onError: (err: unknown) => {
      Alert.alert(
        'Cannot Start Session',
        err instanceof ApiError ? err.message : 'Failed to start session. A session may already exist for today.',
      );
    },
  });

  const markAttendance = useMutation({
    mutationFn: async () => {
      const payload = {
        idempotencyKey: `${classId}-${todayIsoDate()}`,
        records: Object.entries(records).map(([studentId, status]) => ({ studentId, status })),
      };

      if (!online) {
        await offlineQueue.enqueue({
          sessionId: sessionId!,
          records: payload.records,
          idempotencyKey: payload.idempotencyKey,
          timestamp: Date.now(),
        });
        return { offline: true };
      }

      try {
        const res = await api.attendanceMark(sessionId!, payload);
        return res;
      } catch (err: unknown) {
        const isNetworkError =
          err instanceof TypeError ||
          (err instanceof ApiError && err.status === 0) ||
          (err instanceof Error && err.message.includes('fetch'));
        if (isNetworkError) {
          await offlineQueue.enqueue({
            sessionId: sessionId!,
            records: payload.records,
            idempotencyKey: payload.idempotencyKey,
            timestamp: Date.now(),
          });
          return { offline: true };
        }
        throw err;
      }
    },
    onSuccess: () => {
      setSubmitted(true);
      qc.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  const presentCount = Object.values(records).filter((v) => v === 'present').length;
  const absentCount = Object.values(records).filter((v) => v === 'absent').length;

  if (submitted) {
    const isOfflineSave = markAttendance.data && 'offline' in markAttendance.data;
    return (
      <View style={[s.card, { alignItems: 'center', padding: 32 }]}>
        <Text style={{ fontSize: 40, marginBottom: 16 }}>{isOfflineSave ? '💾' : '✅'}</Text>
        <Text style={s.successTitle}>{isOfflineSave ? 'Saved Offline' : 'Attendance Saved'}</Text>
        <Text style={[s.successSub, { marginBottom: 12 }]}>{presentCount} present · {absentCount} absent</Text>
        {isOfflineSave && (
          <Banner tone="warning">
            Saved locally. Will sync automatically when connection is restored.
          </Banner>
        )}
        <Pressable
          accessibilityRole="button"
          style={[s.outlineBtn, { marginTop: 16 }]}
          onPress={() => { setSubmitted(false); setSessionId(null); setRecords({}); }}
        >
          <Text style={s.outlineBtnText}>Start New Session</Text>
        </Pressable>
      </View>
    );
  }

  if (!sessionId) {
    return (
      <View style={s.card}>
        {offlineCount > 0 && (
          <View style={{ marginBottom: 12 }}>
            <Banner tone="warning">
              ⚠️ {offlineCount} session{offlineCount > 1 ? 's' : ''} saved offline. {online ? 'Syncing...' : 'Will sync when connection is restored.'}
            </Banner>
          </View>
        )}
        <Text style={s.subViewTitle}>Take Attendance</Text>
        <Text style={s.subViewSub}>
          {students.isLoading ? 'Loading students...' : `${(students.data?.data ?? []).length} students enrolled`}
        </Text>
        <Pressable
          accessibilityRole="button"
          style={[s.startBtn, (!(students.data?.data ?? []).length || createSession.isPending) && { opacity: 0.5 }]}
          disabled={!(students.data?.data ?? []).length || createSession.isPending}
          onPress={() => createSession.mutate()}
        >
          {createSession.isPending
            ? <ActivityIndicator color={colors.white} />
            : <Text style={s.startBtnText}>START TODAY'S SESSION →</Text>}
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      {/* Stats */}
      <View style={s.statsRow}>
        <StatPill value={presentCount} label="Present" />
        <StatPill value={absentCount} label="Absent" />
        <StatPill value={(students.data?.data ?? []).length} label="Total" />
      </View>

      {/* Donut Chart */}
      <View style={{ alignItems: 'center', marginVertical: 16 }}>
        <DonutChart3D value={(students.data?.data ?? []).length ? Math.round((presentCount / (students.data?.data ?? []).length) * 100) : 0} />
      </View>

      {/* Student rows */}
      <View style={s.studentList}>
        {(students.data?.data ?? []).map((student: any) => (
          <StudentRow
            key={student.id}
            name={student.name}
            roll={student.rollNumber ?? undefined}
            status={records[student.id] ?? 'present'}
            onToggle={(status) => setRecords((r) => ({ ...r, [student.id]: status }))}
          />
        ))}
      </View>

      {/* Save button */}
      <Pressable
        accessibilityRole="button"
        style={[s.saveBtn, (markAttendance.isPending || Object.keys(records).length === 0) && { opacity: 0.5 }]}
        disabled={markAttendance.isPending || Object.keys(records).length === 0}
        onPress={() => markAttendance.mutate()}
      >
        {markAttendance.isPending
          ? <ActivityIndicator color={colors.white} />
          : <Text style={s.saveBtnText}>SAVE ATTENDANCE →</Text>}
      </Pressable>
    </View>
  );
}

function StudentRow({
  name,
  roll,
  status,
  onToggle,
}: {
  name: string;
  roll?: string;
  status: AttendanceStatus;
  onToggle: (s: AttendanceStatus) => void;
}) {
  const isPresent = status === 'present';
  const isAbsent = status === 'absent';
  return (
    <View style={s.studentRow}>
      <View style={s.studentInfo}>
        <View style={s.studentAvatar}>
          <Text style={s.avatarInitial}>{name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View>
          <Text style={s.studentName}>{name}</Text>
          {roll ? <Text style={s.studentRoll}>Roll {roll}</Text> : null}
        </View>
      </View>
      <View style={s.togglePair}>
        <Pressable
          accessibilityRole="button"
          style={[s.toggleBtn, isPresent ? s.toggleActiveP : s.toggleInactive]}
          onPress={() => onToggle('present')}
        >
          <Text style={[s.toggleBtnText, isPresent ? { color: '#15803D' } : { color: colors.teal }]}>P</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={[s.toggleBtn, isAbsent ? s.toggleActiveA : s.toggleInactive]}
          onPress={() => onToggle('absent')}
        >
          <Text style={[s.toggleBtnText, isAbsent ? { color: '#EF4444' } : { color: colors.teal }]}>A</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── S18: Students View ───────────────────────────────────────────────────────

function StudentsView({ classId }: { classId: string }) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRoll, setNewRoll] = useState('');

  const students = useQuery({
    queryKey: ['classStudents', classId],
    queryFn: () => api.classStudents(classId),
  });

  const addStudent = useMutation({
    mutationFn: async () => {
      // Create the student globally, then enroll them into this specific class
      const student = await api.studentCreate({ name: newName.trim(), rollNumber: newRoll.trim() || undefined });
      await api.classAddStudents(classId, [student.id]);
      return student;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['classStudents', classId] });
      qc.invalidateQueries({ queryKey: ['students'] });
      setNewName('');
      setNewRoll('');
      setShowAdd(false);
    },
    onError: (err: unknown) => {
      Alert.alert('Error', err instanceof ApiError ? err.message : 'Failed to add student.');
    },
  });

  return (
    <View>
      {showAdd ? (
        <Card style={{ marginBottom: 12 }}>
          <Text style={s.formTitle}>Add Student</Text>
          <Field
            label="NAME"
            placeholder="Rahul Kumar"
            value={newName}
            onChangeText={setNewName}
          />
          <Field
            label="ROLL NUMBER (OPTIONAL)"
            placeholder="07"
            value={newRoll}
            onChangeText={setNewRoll}
          />
          <View style={s.formButtons}>
            <Button variant="ghost" onPress={() => setShowAdd(false)} style={{ flex: 1 }}>
              Cancel
            </Button>
            <Button
              onPress={() => addStudent.mutate()}
              disabled={!newName.trim()}
              loading={addStudent.isPending}
              style={{ flex: 1 }}
            >
              Add
            </Button>
          </View>
        </Card>
      ) : (
        <Pressable accessibilityRole="button" style={[s.newClassButton, { marginBottom: 12 }]} onPress={() => setShowAdd(true)}>
          <Plus size={16} color={colors.white} />
          <Text style={s.newClassText}>Add Student</Text>
        </Pressable>
      )}

      {students.isLoading ? (
        <ActivityIndicator color={colors.teal} style={{ marginTop: 24 }} />
      ) : (students.data?.data ?? []).length === 0 ? (
        <View style={[s.card, { alignItems: 'center', padding: 24 }]}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>👥</Text>
          <Text style={{ color: colors.teal, fontSize: 13, textAlign: 'center' }}>
            No students yet. Add your first student above.
          </Text>
        </View>
      ) : (
        <View style={s.studentList}>
          {(students.data?.data ?? []).map((student: any) => (
            <View key={student.id} style={s.studentRow}>
              <View style={s.studentInfo}>
                <View style={s.studentAvatar}>
                  <Text style={s.avatarInitial}>{student.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View>
                  <Text style={s.studentName}>{student.name}</Text>
                  {student.rollNumber ? <Text style={s.studentRoll}>Roll {student.rollNumber}</Text> : null}
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── S20: Invite View ─────────────────────────────────────────────────────────

function InviteView() {
  const [link, setLink] = useState<string | null>(null);

  const generateInvite = useMutation({
    mutationFn: api.inviteGenerate,
    onSuccess: (data) => setLink(data.inviteCode),
  });

  return (
    <View style={s.card}>
      <Text style={s.subViewTitle}>Invite Parents</Text>
      <Text style={s.subViewSub}>
        Generate an invite code. Share it with parents to let them join this classroom.
      </Text>
      {link ? (
        <View>
          <View style={s.codeBox}>
            <Text style={s.codeText} selectable>{link}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            style={[s.outlineBtn, { marginTop: 12 }]}
            onPress={() => setLink(null)}
          >
            <Text style={s.outlineBtnText}>Generate New Link</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          style={[s.startBtn, generateInvite.isPending && { opacity: 0.6 }]}
          disabled={generateInvite.isPending}
          onPress={() => generateInvite.mutate()}
        >
          {generateInvite.isPending
            ? <ActivityIndicator color={colors.white} />
            : <Text style={s.startBtnText}>GENERATE INVITE LINK</Text>}
        </Pressable>
      )}
    </View>
  );
}

// ─── S21: Schedule View ──────────────────────────────────────────────────────────

function ScheduleView({ classId }: { classId: string }) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [day, setDay] = useState<string>('monday');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [error, setError] = useState<string | null>(null);

  const schedules = useQuery({
    queryKey: ['classSchedules', classId],
    queryFn: () => api.schedules(classId),
  });

  const addSchedule = useMutation({
    mutationFn: () =>
      api.scheduleCreate({
        classId,
        dayOfWeek: day,
        startTime,
        endTime,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['classSchedules', classId] });
      setShowAdd(false);
      setError(null);
    },
    onError: (err: any) => {
      setError(err?.message || 'Failed to create schedule');
    },
  });

  const days = [
    { value: 'monday', label: 'M' },
    { value: 'tuesday', label: 'T' },
    { value: 'wednesday', label: 'W' },
    { value: 'thursday', label: 'T' },
    { value: 'friday', label: 'F' },
    { value: 'saturday', label: 'S' },
    { value: 'sunday', label: 'S' },
  ];

  const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

  // Simple validation
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  const isValid = timePattern.test(startTime) && timePattern.test(endTime);

  return (
    <View>
      {showAdd ? (
        <Card style={{ marginBottom: 12, padding: 18, borderRadius: 16 }}>
          <Text style={s.formTitle}>Add Schedule</Text>
          {error && <Text style={{ color: colors.danger, fontSize: 13, marginBottom: 12 }}>⚠️ {error}</Text>}
          
          <Text style={s.formLabel}>SELECT DAY</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
            {days.map((d) => {
              const active = day === d.value;
              return (
                <Pressable
                  key={d.value}
                  accessibilityRole="button"
                  onPress={() => setDay(d.value)}
                  style={[{
                    flex: 1,
                    height: 40,
                    borderRadius: 20,
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderWidth: 1.5,
                  }, active ? {
                    backgroundColor: colors.navy,
                    borderColor: colors.navy,
                  } : {
                    backgroundColor: colors.white,
                    borderColor: colors.sky,
                  }]}
                >
                  <Text style={[{ fontSize: 13, fontWeight: '700' }, active ? { color: colors.white } : { color: colors.teal }]}>
                    {d.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            <View style={{ flex: 1 }}>
              <Field
                label="START TIME"
                placeholder="09:00"
                value={startTime}
                onChangeText={(text) => {
                  setStartTime(text);
                  setError(null);
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="END TIME"
                placeholder="10:00"
                value={endTime}
                onChangeText={(text) => {
                  setEndTime(text);
                  setError(null);
                }}
              />
            </View>
          </View>

          <View style={s.formButtons}>
            <Button variant="ghost" onPress={() => setShowAdd(false)} style={{ flex: 1 }}>
              Cancel
            </Button>
            <Button
              onPress={() => {
                if (!isValid) {
                  setError('Invalid time format (use HH:MM e.g. 09:00)');
                  return;
                }
                addSchedule.mutate();
              }}
              disabled={!startTime || !endTime}
              loading={addSchedule.isPending}
              style={{ flex: 1 }}
            >
              Add Time
            </Button>
          </View>
        </Card>
      ) : (
        <Pressable accessibilityRole="button" style={[s.newClassButton, { marginBottom: 12 }]} onPress={() => setShowAdd(true)}>
          <Plus size={16} color={colors.white} />
          <Text style={s.newClassText}>Add Schedule</Text>
        </Pressable>
      )}

      {schedules.isLoading ? (
        <ActivityIndicator color={colors.teal} style={{ marginTop: 24 }} />
      ) : !schedules.data || schedules.data.length === 0 ? (
        <View style={[s.card, { alignItems: 'center', padding: 24 }]}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>📅</Text>
          <Text style={{ color: colors.teal, fontSize: 13, textAlign: 'center' }}>
            No schedules defined yet. Set up class times above.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {schedules.data.map((schedule) => (
            <View key={schedule.id} style={[s.classCard, { marginHorizontal: 0, marginBottom: 0 }]}>
              <View style={s.classCardLeft}>
                <View style={s.classIconBox}>
                  <Text style={{ fontSize: 16 }}>⏰</Text>
                </View>
                <View>
                  <Text style={s.className}>{capitalize(schedule.dayOfWeek)}</Text>
                  <Text style={s.classSub}>
                    {schedule.startTime} – {schedule.endTime}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── S16/S17: Announce Tab ────────────────────────────────────────────────────

function AnnounceTab() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);

  const announcements = useQuery({ queryKey: ['announcements'], queryFn: () => api.announcements() });

  const post = useMutation({
    mutationFn: () => api.announcementCreate({ title: title.trim(), body: body.trim(), isPinned: pinned }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      setTitle(''); setBody(''); setPinned(false); setShowCreate(false);
    },
    onError: (err: unknown) => {
      Alert.alert('Post Failed', err instanceof ApiError ? err.message : 'Failed to post announcement. Please try again.');
    },
  });

  return (
    <ScrollView style={s.tabContent} showsVerticalScrollIndicator={false}>
      {showCreate ? (
        <Card style={{ marginBottom: 16 }}>
          <Text style={s.formTitle}>New Announcement</Text>
          <Field
            label="TITLE"
            placeholder="e.g. Exam schedule updated"
            value={title}
            onChangeText={setTitle}
          />
          <Field
            label="MESSAGE"
            placeholder="Write your announcement here..."
            value={body}
            onChangeText={setBody}
            multiline={true}
            numberOfLines={4}
          />
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: pinned }}
            style={[s.pinChip, pinned && s.pinChipActive]}
            onPress={() => setPinned((p) => !p)}
          >
            <Text style={[s.pinChipText, pinned && s.pinChipTextActive]}>
              📌 Pin this announcement
            </Text>
          </Pressable>
          <View style={[s.formButtons, { marginTop: 16 }]}>
            <Button variant="ghost" onPress={() => setShowCreate(false)} style={{ flex: 1 }}>
              Cancel
            </Button>
            <Button
              onPress={() => post.mutate()}
              disabled={!title.trim() || !body.trim()}
              loading={post.isPending}
              style={{ flex: 1 }}
            >
              Post
            </Button>
          </View>
        </Card>
      ) : (
        <Pressable accessibilityRole="button" style={[s.newClassButton, { marginBottom: 16 }]} onPress={() => setShowCreate(true)}>
          <Plus size={16} color={colors.white} />
          <Text style={s.newClassText}>New Announcement</Text>
        </Pressable>
      )}

      {(announcements.data?.data ?? []).map((ann: any) => (
        <View key={ann.id} style={[s.card, { marginBottom: 12 }, ann.isPinned && { borderColor: colors.teal }]}>
          {ann.isPinned && <Text style={s.pinnedTag}>📌 PINNED</Text>}
          <Text style={s.announcementTitle}>{ann.title}</Text>
          <Text style={s.announcementBody}>{ann.body}</Text>
        </View>
      ))}
      {!(announcements.data?.data ?? []).length && !showCreate && (
        <View style={[s.card, { alignItems: 'center', padding: 24 }]}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>📣</Text>
          <Text style={{ color: colors.teal, fontSize: 13, textAlign: 'center' }}>
            No announcements yet. Post your first one above.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// ─── S23/S24: Profile Tab ─────────────────────────────────────────────────────

function ProfileTab({ tenantName, onLogout }: { tenantName: string; onLogout: () => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState(tenantName);

  const update = useMutation({
    mutationFn: () => api.tenantUpdate({ name: newName.trim() }),
    onSuccess: (data) => {
      qc.setQueryData(['tenant'], data);
      qc.invalidateQueries({ queryKey: ['tenant'] });
      setEditing(false);
    },
  });

  return (
    <ScrollView style={s.tabContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
      {/* Institution Details Card */}
      <Text style={[s.sectionTitle, { marginBottom: 8, marginLeft: 4 }]}>Institution</Text>
      <Card style={{ marginBottom: 16, borderRadius: 16, padding: 18 }}>
        {editing ? (
          <>
            <Field
              label="INSTITUTION NAME"
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />
            <View style={[s.formButtons, { marginTop: 12 }]}>
              <Button variant="ghost" onPress={() => { setEditing(false); setNewName(tenantName); }} style={{ flex: 1 }}>
                Cancel
              </Button>
              <Button
                onPress={() => update.mutate()}
                disabled={!newName.trim()}
                loading={update.isPending}
                style={{ flex: 1 }}
              >
                Save
              </Button>
            </View>
          </>
        ) : (
          <>
            <Pressable accessibilityRole="button" style={[s.profileRow, { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.sky }]} onPress={() => setEditing(true)}>
              <Text style={{ color: colors.teal, fontSize: 13, fontWeight: '600' }}>Name</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={s.profileValue}>{tenantName}</Text>
                <Text style={s.profileEdit}>Edit</Text>
              </View>
            </Pressable>

            <View style={[s.profileRow, { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.sky }]}>
              <Text style={{ color: colors.teal, fontSize: 13, fontWeight: '600' }}>Type</Text>
              <Text style={s.profileValue}>Educational Hub</Text>
            </View>

            <View style={[s.profileRow, { paddingVertical: 10 }]}>
              <Text style={{ color: colors.teal, fontSize: 13, fontWeight: '600' }}>Role</Text>
              <Text style={s.profileValue}>Teacher Account</Text>
            </View>
          </>
        )}
      </Card>

      {/* Account Details Card */}
      <Text style={[s.sectionTitle, { marginBottom: 8, marginLeft: 4 }]}>Account Details</Text>
      <Card style={{ marginBottom: 20, borderRadius: 16, padding: 18 }}>
        <View style={[s.profileRow, { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.sky }]}>
          <Text style={{ color: colors.teal, fontSize: 13, fontWeight: '600' }}>Status</Text>
          <Text style={s.profileValue}>Active Session</Text>
        </View>

        <View style={[s.profileRow, { paddingVertical: 10 }]}>
          <Text style={{ color: colors.teal, fontSize: 13, fontWeight: '600' }}>Verification</Text>
          <View style={s.statusSuccess}>
            <Text style={{ color: '#15803D', fontSize: 9, fontWeight: '900', letterSpacing: 0.5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>VERIFIED CORE</Text>
          </View>
        </View>
      </Card>

      <Button
        variant="danger"
        onPress={onLogout}
        style={{ borderRadius: 12 }}
      >
        Log Out
      </Button>
    </ScrollView>
  );
}

// ─── StyleSheet ───────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  // Header
  header: {
    height: 64,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.sky,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  logoBox: {
    width: 34, height: 34, backgroundColor: colors.navy,
    borderRadius: 8, justifyContent: 'center', alignItems: 'center',
  },
  logoText: { color: colors.white, fontWeight: '900', fontSize: 14 },
  headerTextStack: { marginLeft: 10 },
  brandText: { color: colors.navy, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  institutionName: { color: colors.teal, fontSize: 11, maxWidth: 160 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoutButton: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 1, borderColor: colors.sky,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarCircle: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.navy, justifyContent: 'center', alignItems: 'center',
  },
  avatarInitial: { color: colors.white, fontWeight: '700', fontSize: 14 },

  // Tab bar
  tabBar: {
    height: 72, backgroundColor: colors.white,
    borderTopWidth: 1, borderTopColor: colors.sky,
    flexDirection: 'row', paddingBottom: 8,
  },
  tabItem: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabIconContainer: {
    width: 40, height: 32,
    justifyContent: 'center', alignItems: 'center', marginBottom: 4,
  },
  tabActivePill: { backgroundColor: colors.navy, borderRadius: 20 },
  tabLabel: { fontSize: 10, letterSpacing: 0.5, color: colors.teal },
  tabLabelActive: { color: colors.navy, fontWeight: '600' },

  // Content
  tabContent: { flex: 1, padding: 16 },

  // Welcome banner
  welcomeBanner: {
    backgroundColor: colors.navy, borderRadius: 16, padding: 20, marginBottom: 24,
  },
  bannerEyebrow: { color: colors.sky, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  bannerTitle: { color: colors.white, fontSize: 22, fontWeight: '700', marginTop: 4 },
  bannerSub: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 4 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statPill: {
    backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.sky,
    borderRadius: 12, padding: 12, flex: 1, alignItems: 'center',
  },
  statNumber: { color: colors.navy, fontSize: 24, fontWeight: '900' },
  statLabel: {
    color: colors.teal, fontSize: 10, letterSpacing: 1,
    marginTop: 2, textTransform: 'uppercase',
  },

  // Section
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  sectionTitle: { color: colors.navy, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  sectionLink: { color: colors.teal, fontSize: 11 },

  // Card
  card: {
    backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.sky,
    borderRadius: 14, padding: 18,
  },

  // Class card (home tab)
  classCard: {
    backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.sky,
    borderRadius: 12, padding: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
  },
  classCardLeft: { flexDirection: 'row', alignItems: 'center' },
  classIconBox: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: colors.sky,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  className: { color: colors.navy, fontSize: 14, fontWeight: '600' },
  classSub: { color: colors.teal, fontSize: 12, marginTop: 2 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusPending: { backgroundColor: colors.sky },
  statusSuccess: { backgroundColor: '#DCFCE7' },
  statusText: { fontSize: 11, fontWeight: '600' },

  // Class list row
  classRow: {
    backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.sky,
    borderRadius: 12, padding: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between', marginBottom: 8,
  },

  // Create form
  newClassButton: {
    backgroundColor: colors.navy, borderRadius: 10, height: 44,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingHorizontal: 16, alignSelf: 'flex-start',
  },
  newClassText: { color: colors.white, fontSize: 13, fontWeight: '600' },
  formTitle: { color: colors.navy, fontSize: 16, fontWeight: '700', marginBottom: 16 },
  formField: { marginBottom: 16 },
  formLabel: {
    color: colors.teal, fontSize: 9, letterSpacing: 1.5,
    fontWeight: '800', textTransform: 'uppercase', marginBottom: 8,
  },
  formInput: {
    borderWidth: 1.5, borderColor: colors.sky, borderRadius: 8,
    padding: 14, color: colors.navy, fontSize: 15,
  },
  formButtons: { flexDirection: 'row', gap: 8 },
  cancelBtn: {
    flex: 1, height: 44, borderRadius: 10,
    borderWidth: 1.5, borderColor: colors.sky,
    justifyContent: 'center', alignItems: 'center',
  },
  cancelBtnText: { color: colors.navy, fontSize: 13, fontWeight: '600' },
  createBtn: {
    flex: 1, height: 44, borderRadius: 10,
    backgroundColor: colors.navy, justifyContent: 'center', alignItems: 'center',
  },
  createBtnText: { color: colors.white, fontSize: 13, fontWeight: '600' },

  // Detail view
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  backText: { color: colors.teal, fontSize: 13, fontWeight: '600' },
  detailTitle: { color: colors.navy, fontSize: 22, fontWeight: '700' },
  detailSub: { color: colors.teal, fontSize: 13, marginTop: 2, marginBottom: 16 },

  // Segment tabs
  segmentTabs: { flexDirection: 'row', gap: 6 },
  segmentPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  segmentPillActive: { backgroundColor: colors.navy },
  segmentPillInactive: { backgroundColor: colors.sky },
  segmentText: { fontSize: 12 },
  segmentTextActive: { color: colors.white, fontWeight: '700' },
  segmentTextInactive: { color: colors.teal, fontWeight: '600' },

  // Attendance
  subViewTitle: { color: colors.navy, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  subViewSub: { color: colors.teal, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  startBtn: {
    backgroundColor: colors.navy, borderRadius: 10, height: 44,
    justifyContent: 'center', alignItems: 'center',
  },
  startBtnText: { color: colors.white, fontSize: 13, fontWeight: '600' },
  successTitle: { color: colors.navy, fontSize: 18, fontWeight: '700' },
  successSub: { color: colors.teal, fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 16 },
  outlineBtn: {
    borderWidth: 1.5, borderColor: colors.navy, borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  outlineBtnText: { color: colors.navy, fontSize: 13, fontWeight: '600' },

  // Students
  studentList: { marginTop: 8 },
  studentRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: colors.sky, paddingVertical: 12,
  },
  studentInfo: { flexDirection: 'row', alignItems: 'center' },
  studentAvatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.navy,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  studentName: { color: colors.navy, fontSize: 14, fontWeight: '600' },
  studentRoll: { color: colors.teal, fontSize: 12, marginTop: 2 },
  togglePair: { flexDirection: 'row', gap: 8 },
  toggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  toggleInactive: {
    backgroundColor: '#F1F5F9',
    borderColor: 'rgba(47, 65, 86, 0.08)',
  },
  toggleActiveP: {
    backgroundColor: '#DCFCE7',
    borderColor: 'rgba(21, 128, 61, 0.15)',
  },
  toggleActiveA: {
    backgroundColor: '#FEE2E2',
    borderColor: 'rgba(239, 68, 68, 0.15)',
  },
  toggleBtnText: { fontSize: 14, fontWeight: '700' },
  saveBtn: {
    backgroundColor: colors.navy, borderRadius: 10, height: 48,
    justifyContent: 'center', alignItems: 'center', marginTop: 24, marginBottom: 40,
  },
  saveBtnText: { color: colors.white, fontSize: 14, fontWeight: '700' },

  // Invite
  codeBox: {
    backgroundColor: colors.paper, borderWidth: 1.5, borderColor: colors.sky,
    borderRadius: 8, padding: 14, alignItems: 'center',
  },
  codeText: {
    color: colors.navy, fontSize: 16, fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },

  // Announce
  pinChip: {
    borderWidth: 1.5, borderColor: colors.sky, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start',
  },
  pinChipActive: { backgroundColor: colors.sky, borderColor: colors.navy },
  pinChipText: { color: colors.teal, fontSize: 12 },
  pinChipTextActive: { color: colors.navy, fontWeight: '600' },
  pinnedTag: { color: colors.teal, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  announcementTitle: { color: colors.navy, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  announcementBody: { color: colors.teal, fontSize: 13, lineHeight: 19 },

  // Profile
  profileRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  profileValue: { color: colors.navy, fontSize: 15, fontWeight: '600' },
  profileEdit: { color: colors.teal, fontSize: 13 },
  logoutFullBtn: {
    backgroundColor: colors.danger, borderRadius: 12, height: 48,
    flexDirection: 'row', gap: 8,
    justifyContent: 'center', alignItems: 'center', marginTop: 20,
  },
  logoutFullBtnText: { color: colors.white, fontSize: 14, fontWeight: '600' },
});
