import { useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Bell,
  ChartBar,
  ClipboardCheck,
  Home,
  LogOut,
  Megaphone,
  School,
  UserRound,
  Users,
} from "lucide-react-native";
import { api, ApiError } from "@/api/client";
import { queryClient } from "@/api/query";
import { useSession } from "@/auth/session-store";
import { registerDeviceForNotifications } from "@/features/notifications";
import {
  AppHeader,
  Banner,
  BottomNav,
  Button,
  Card,
  EmptyState,
  Eyebrow,
  Field,
  HeroPanel,
  IconButton,
  MetricCard,
  Muted,
  ProgressBar,
  Screen,
  SectionTitle,
  AvatarBadge,
} from "@/components/ui";
import { colors, font, radius, spacing } from "@/theme/tokens";
import { todayIsoDate } from "@/utils/format";

type TeacherTab = "home" | "attendance" | "records" | "messages" | "profile";
type AttendanceStatus = "present" | "absent" | "late";

const teacherTabs = [
  { value: "home", label: "Home", icon: Home },
  { value: "attendance", label: "Attend", icon: ClipboardCheck },
  { value: "records", label: "Records", icon: Users },
  { value: "messages", label: "Messages", icon: Megaphone },
  { value: "profile", label: "Profile", icon: UserRound },
] as const;

export default function TeacherScreen() {
  const [tab, setTab] = useState<TeacherTab>("home");
  const user = useSession((state) => state.user);
  const clear = useSession((state) => state.clear);
  const tenant = useQuery({ queryKey: ["tenant"], queryFn: api.tenantMe });
  const classes = useQuery({ queryKey: ["classes"], queryFn: api.classes });
  const students = useQuery({ queryKey: ["students"], queryFn: api.students });
  const sessions = useQuery({
    queryKey: ["attendanceSessions"],
    queryFn: () => api.attendanceSessions(),
  });
  const announcements = useQuery({
    queryKey: ["announcements"],
    queryFn: api.announcements,
  });

  const logout = useMutation({
    mutationFn: api.logout,
    onSettled: async () => {
      await clear();
      router.replace("/auth");
    },
  });

  const counts = {
    classes: classes.data?.length ?? 0,
    students: students.data?.length ?? 0,
    sessions: sessions.data?.length ?? 0,
    announcements: announcements.data?.length ?? 0,
  };

  return (
    <Screen footer={<BottomNav value={tab} items={[...teacherTabs]} onChange={setTab} />}>
      <View style={{ gap: spacing.lg }}>
        <AppHeader
          eyebrow="Good morning"
          title={tabTitle(tab)}
          accent={tabAccent(tab)}
          meta={tab === "home" ? `Tenant ${user?.tenantId ?? "not loaded"}` : "Tuesday, 20 May 2026"}
          trailing={
            <>
              <IconButton icon={Bell} />
              <IconButton icon={LogOut} active onPress={() => logout.mutate()} />
            </>
          }
        />

        {tenant.error ? <Banner tone="danger">{readError(tenant.error)}</Banner> : null}

        {tab === "home" ? (
          <HomePanel
            counts={counts}
            tenantName={tenant.data?.name ?? "Whiteroom"}
            sessions={sessions.data ?? []}
            onSelect={setTab}
          />
        ) : tab === "attendance" ? (
          <AttendancePanel />
        ) : tab === "records" ? (
          <RecordsPanel />
        ) : tab === "messages" ? (
          <AnnouncementsPanel />
        ) : (
          <ProfilePanel />
        )}
      </View>
    </Screen>
  );
}

function HomePanel({
  counts,
  tenantName,
  sessions,
  onSelect,
}: {
  counts: Record<string, number>;
  tenantName: string;
  sessions: { id: string; date: string; totalPresent?: number | null }[];
  onSelect: (tab: TeacherTab) => void;
}) {
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <HeroPanel>
          <View style={{ alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flex: 1, gap: spacing.sm }}>
              <Text style={{ color: colors.sky, fontWeight: "800" }}>Welcome back</Text>
              <Text style={{ color: colors.white, fontSize: 30, fontWeight: "900", lineHeight: 35 }}>
                {tenantName}
              </Text>
              <Muted style={{ color: colors.sky }}>Today's classwork is ready to move.</Muted>
            </View>
            <AvatarBadge label={tenantName} />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <HeroMiniStat label="Students" value={counts.students} />
            <HeroMiniStat label="Classes" value={counts.classes} />
            <HeroMiniStat label="Posts" value={counts.announcements} />
          </View>
        </HeroPanel>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
        <Pressable style={{ flexBasis: "47%", flexGrow: 1 }} onPress={() => onSelect("records")}>
          <MetricCard label="Total Students" value={counts.students} note="+12" />
        </Pressable>
        <Pressable style={{ flexBasis: "47%", flexGrow: 1 }} onPress={() => onSelect("attendance")}>
          <MetricCard label="Attendance Today" value="81%" note="+4%" tone="success" />
        </Pressable>
        <Pressable style={{ flexBasis: "47%", flexGrow: 1 }} onPress={() => onSelect("records")}>
          <MetricCard label="Classes" value={counts.classes} note="All done" tone="warning" />
        </Pressable>
        <Pressable style={{ flexBasis: "47%", flexGrow: 1 }} onPress={() => onSelect("messages")}>
          <MetricCard label="Alerts Sent" value={counts.announcements} note="3 new" tone="danger" />
        </Pressable>
      </View>

      <View style={{ gap: spacing.md }}>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          <SectionTitle>Today's Classes</SectionTitle>
          <Pressable onPress={() => onSelect("attendance")}>
            <Text style={{ color: colors.primary, fontFamily: font.mono }}>View all -&gt;</Text>
          </Pressable>
        </View>

        {sessions.length ? (
          sessions.slice(0, 3).map((session) => (
            <ClassPreviewCard key={session.id} title={session.date} present={session.totalPresent ?? 0} />
          ))
        ) : (
          <>
            <ClassPreviewCard title="Class 10 - A" subtitle="Mr. Sharma - Maths" present={28} total={36} live />
            <ClassPreviewCard title="Class 9 - B" subtitle="Science" present={31} total={35} done />
          </>
        )}
      </View>
    </View>
  );
}

function ClassPreviewCard({
  title,
  subtitle = "Attendance session",
  present,
  total = 36,
  live,
  done,
}: {
  title: string;
  subtitle?: string;
  present: number;
  total?: number;
  live?: boolean;
  done?: boolean;
}) {
  const pct = Math.min(100, Math.round((present / Math.max(total, 1)) * 100));
  return (
    <Card>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.ink, fontSize: 22, fontWeight: "900" }}>{title}</Text>
          <Muted mono>{subtitle}</Muted>
        </View>
        <View
          style={{
            backgroundColor: live ? colors.primarySoft : colors.mint,
            borderRadius: radius.full,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.xs,
          }}
        >
          <Text style={{ color: live ? colors.primary : colors.success, fontFamily: font.mono }}>
            {live ? "Live" : done ? "Done" : "Open"}
          </Text>
        </View>
      </View>
      <ProgressBar value={pct} />
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Muted mono>{pct}% present</Muted>
        <Muted mono>
          {present}/{total}
        </Muted>
      </View>
    </Card>
  );
}

function HeroMiniStat({ label, value }: { label: string; value: number }) {
  return (
    <View
      style={{
        backgroundColor: "#567C8D",
        borderColor: "#C8D9E6",
        borderRadius: radius.md,
        borderWidth: 1,
        flex: 1,
        padding: spacing.md,
      }}
    >
      <Text style={{ color: colors.white, fontSize: 20, fontWeight: "900" }}>{value}</Text>
      <Text style={{ color: colors.sky, fontSize: 11, fontWeight: "800" }}>{label}</Text>
    </View>
  );
}

function AttendancePanel() {
  const [classId, setClassId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [records, setRecords] = useState<Record<string, AttendanceStatus>>({});
  const classes = useQuery({ queryKey: ["classes"], queryFn: api.classes });
  const students = useQuery({ queryKey: ["students"], queryFn: api.students });
  const sessions = useQuery({ queryKey: ["attendanceSessions"], queryFn: () => api.attendanceSessions() });
  const sessionDetail = useQuery({
    queryKey: ["attendanceSession", sessionId],
    queryFn: () => api.attendanceSession(sessionId),
    enabled: Boolean(sessionId),
  });
  const createSession = useMutation({
    mutationFn: () => api.attendanceCreateSession({ classId, date: todayIsoDate() }),
    onSuccess: (session) => {
      setSessionId(session.id);
      queryClient.invalidateQueries({ queryKey: ["attendanceSessions"] });
    },
  });
  const mark = useMutation({
    mutationFn: () =>
      api.attendanceMark(sessionId, {
        idempotencyKey: createIdempotencyKey(),
        records: Object.entries(records).map(([studentId, status]) => ({ studentId, status })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendanceSession", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["attendanceSessions"] });
    },
  });

  const selectedClass = classes.data?.find((row) => row.id === classId);
  const totals = useMemo(() => {
    const values = Object.values(records);
    return {
      present: values.filter((value) => value === "present").length,
      absent: values.filter((value) => value === "absent").length,
      pending: Math.max((students.data?.length ?? 0) - values.length, 0),
    };
  }, [records, students.data?.length]);

  return (
    <View style={{ gap: spacing.lg }}>
      {createSession.error || mark.error ? (
        <Banner tone="danger">{readError(createSession.error ?? mark.error)}</Banner>
      ) : null}

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <MetricCard label="Present" value={totals.present} tone="success" />
        <MetricCard label="Absent" value={totals.absent} tone="danger" />
        <MetricCard label="Pending" value={totals.pending} tone="warning" />
      </View>

      <Card>
        <SectionTitle>Select Class</SectionTitle>
        <Muted mono>{selectedClass ? selectedClass.name : "Choose a class to start today's session."}</Muted>
        <View style={{ gap: spacing.sm }}>
          {classes.data?.map((row) => (
            <Button
              key={row.id}
              variant={row.id === classId ? "primary" : "ghost"}
              onPress={() => setClassId(row.id)}
            >
              {row.name}
            </Button>
          ))}
        </View>
        <Button disabled={!classId} loading={createSession.isPending} onPress={() => createSession.mutate()}>
          Start Today Session
        </Button>
      </Card>

      {sessions.data?.length ? (
        <Card>
          <SectionTitle>Recent Sessions</SectionTitle>
          {sessions.data.slice(0, 4).map((session) => (
            <Button
              key={session.id}
              variant={sessionId === session.id ? "primary" : "ghost"}
              onPress={() => setSessionId(session.id)}
            >
              {session.date} - {session.totalPresent ?? 0} present
            </Button>
          ))}
        </Card>
      ) : null}

      {sessionId ? (
        <View style={{ gap: 0 }}>
          <View style={{ paddingBottom: spacing.sm }}>
            <SectionTitle>Student Roll</SectionTitle>
            <Muted mono>
              {sessionDetail.data
                ? `${sessionDetail.data.records.length} records already marked`
                : "Tap P, A, or L for each student."}
            </Muted>
          </View>
          {(students.data ?? []).map((student) => (
            <AttendanceRow
              key={student.id}
              name={student.name}
              roll={student.rollNumber ?? "--"}
              status={records[student.id]}
              onChange={(status) => setRecords((prev) => ({ ...prev, [student.id]: status }))}
            />
          ))}
          <View style={{ paddingTop: spacing.md }}>
            <Button
              disabled={!sessionId || Object.keys(records).length === 0}
              loading={mark.isPending}
              onPress={() => mark.mutate()}
            >
              Save Attendance
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function AttendanceRow({
  name,
  roll,
  status,
  onChange,
}: {
  name: string;
  roll: string;
  status?: AttendanceStatus;
  onChange: (status: AttendanceStatus) => void;
}) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <View
      style={{
        alignItems: "center",
        borderBottomColor: colors.border,
        borderBottomWidth: 1,
        flexDirection: "row",
        gap: spacing.md,
        minHeight: 84,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.lavender,
          borderRadius: radius.full,
          height: 52,
          justifyContent: "center",
          width: 52,
        }}
      >
        <Text style={{ color: colors.primary, fontFamily: font.mono }}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.ink, fontSize: 19, fontWeight: "800" }}>{name}</Text>
        <Muted mono>#{roll}</Muted>
      </View>
      <StatusButton label="P" active={status === "present"} tone="success" onPress={() => onChange("present")} />
      <StatusButton label="A" active={status === "absent"} tone="danger" onPress={() => onChange("absent")} />
      <StatusButton label="L" active={status === "late"} tone="warning" onPress={() => onChange("late")} />
    </View>
  );
}

function StatusButton({
  label,
  active,
  tone,
  onPress,
}: {
  label: string;
  active: boolean;
  tone: "success" | "danger" | "warning";
  onPress: () => void;
}) {
  const color = tone === "success" ? colors.success : tone === "danger" ? colors.danger : colors.warning;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: active ? `${color}12` : colors.surface,
        borderColor: active ? color : colors.border,
        borderRadius: radius.sm,
        borderWidth: 1,
        height: 48,
        justifyContent: "center",
        width: 48,
      }}
    >
      <Text style={{ color: active ? color : colors.faint, fontFamily: font.mono, fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}

function RecordsPanel() {
  return (
    <View style={{ gap: spacing.lg }}>
      <ClassesPanel />
      <StudentsPanel />
    </View>
  );
}

function ClassesPanel() {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const classes = useQuery({ queryKey: ["classes"], queryFn: api.classes });
  const create = useMutation({
    mutationFn: () => api.classCreate({ name, subject: subject || undefined }),
    onSuccess: () => {
      setName("");
      setSubject("");
      queryClient.invalidateQueries({ queryKey: ["classes"] });
    },
  });

  return (
    <View style={{ gap: spacing.md }}>
      <Card>
        <Eyebrow>Classes</Eyebrow>
        <SectionTitle>Create class</SectionTitle>
        {create.error ? <Banner tone="danger">{readError(create.error)}</Banner> : null}
        <Field label="Class name" value={name} onChangeText={setName} placeholder="Class 10 - A" />
        <Field label="Subject" value={subject} onChangeText={setSubject} placeholder="Maths" />
        <Button disabled={!name} loading={create.isPending} onPress={() => create.mutate()}>
          Add Class
        </Button>
      </Card>
      {classes.data?.length ? (
        classes.data.map((row) => (
          <Card key={row.id} inset>
            <Text style={{ color: colors.ink, fontSize: 22, fontWeight: "900" }}>{row.name}</Text>
            <Muted mono>
              {row.subject ?? "General"} - {row.studentCount ?? 0} students
            </Muted>
          </Card>
        ))
      ) : (
        <EmptyState title="No classes yet" body="Create your first class to start schedules and attendance." />
      )}
    </View>
  );
}

function StudentsPanel() {
  const [name, setName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const students = useQuery({ queryKey: ["students"], queryFn: api.students });
  const create = useMutation({
    mutationFn: () => api.studentCreate({ name, rollNumber: rollNumber || undefined }),
    onSuccess: () => {
      setName("");
      setRollNumber("");
      queryClient.invalidateQueries({ queryKey: ["students"] });
    },
  });

  return (
    <View style={{ gap: spacing.md }}>
      <Card>
        <Eyebrow>Students</Eyebrow>
        <SectionTitle>Add student</SectionTitle>
        {create.error ? <Banner tone="danger">{readError(create.error)}</Banner> : null}
        <Field label="Student name" value={name} onChangeText={setName} placeholder="Rahul Kumar" />
        <Field label="Roll number" value={rollNumber} onChangeText={setRollNumber} placeholder="07" />
        <Button disabled={!name} loading={create.isPending} onPress={() => create.mutate()}>
          Add Student
        </Button>
      </Card>
      {students.data?.length ? (
        students.data.map((student) => (
          <Card key={student.id} inset>
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: colors.rose,
                  borderRadius: radius.full,
                  height: 48,
                  justifyContent: "center",
                  width: 48,
                }}
              >
                <Text style={{ color: colors.danger, fontFamily: font.mono }}>
                  {student.name.slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.ink, fontSize: 18, fontWeight: "800" }}>{student.name}</Text>
                <Muted mono>
                  Roll {student.rollNumber ?? "--"} - Parent {student.parentId ? "linked" : "not linked"}
                </Muted>
              </View>
            </View>
          </Card>
        ))
      ) : (
        <EmptyState title="No students yet" body="Add students before you mark attendance." />
      )}
    </View>
  );
}

function AnnouncementsPanel() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const announcements = useQuery({ queryKey: ["announcements"], queryFn: api.announcements });
  const create = useMutation({
    mutationFn: () => api.announcementCreate({ title, body }),
    onSuccess: () => {
      setTitle("");
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
  });

  return (
    <View style={{ gap: spacing.md }}>
      <Card>
        <Eyebrow>Broadcast</Eyebrow>
        <SectionTitle>Write parent update</SectionTitle>
        {create.error ? <Banner tone="danger">{readError(create.error)}</Banner> : null}
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="Homework update" />
        <Field
          label="Message"
          value={body}
          onChangeText={setBody}
          multiline
          placeholder="Chapter 4 exercise due tomorrow."
        />
        <Button disabled={!title || !body} loading={create.isPending} onPress={() => create.mutate()}>
          Publish
        </Button>
      </Card>
      {announcements.data?.length ? (
        announcements.data.map((item) => (
          <Card key={item.id}>
            <Eyebrow>Notice</Eyebrow>
            <SectionTitle>{item.title}</SectionTitle>
            <Muted>{item.body}</Muted>
          </Card>
        ))
      ) : (
        <EmptyState title="No messages yet" body="Publish announcements and they will appear here." />
      )}
    </View>
  );
}

function ProfilePanel() {
  const tenant = useQuery({ queryKey: ["tenant"], queryFn: api.tenantMe });
  const [name, setName] = useState("");
  const [brandColor, setBrandColor] = useState("#5147F2");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [classId, setClassId] = useState("");
  const classes = useQuery({ queryKey: ["classes"], queryFn: api.classes });
  const summary = useQuery({
    queryKey: ["reports", "attendance", month],
    queryFn: () => api.reportsAttendance(month),
  });
  const classStats = useQuery({
    queryKey: ["reports", "class", classId],
    queryFn: () => api.reportsClassStats(classId),
    enabled: Boolean(classId),
  });
  const update = useMutation({
    mutationFn: () => api.tenantUpdate({ name: name || undefined, brandColor }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tenant"] }),
  });
  const invite = useMutation({
    mutationFn: api.inviteGenerate,
    onSuccess: (data) => Alert.alert("Invite code", data.inviteCode),
  });
  const payment = useMutation({
    mutationFn: api.createPaymentOrder,
    onSuccess: () => Alert.alert("Payment order created", "Razorpay checkout can be attached after credentials."),
  });
  const notifications = useMutation({
    mutationFn: registerDeviceForNotifications,
    onSuccess: (result) => {
      Alert.alert(
        result.registered ? "Notifications ready" : "Notifications skipped",
        result.registered ? "This device is registered for class alerts." : "Permission was not granted."
      );
    },
  });

  return (
    <View style={{ gap: spacing.md }}>
      <Card>
        <Eyebrow>Institute</Eyebrow>
        <SectionTitle>{tenant.data?.name ?? "Institute profile"}</SectionTitle>
        <Muted mono>{tenant.data?.inviteCode ? `Current invite: ${tenant.data.inviteCode}` : "No invite loaded"}</Muted>
        <Field label="Name" value={name} onChangeText={setName} placeholder={tenant.data?.name ?? "Institute name"} />
        <Field label="Brand color" value={brandColor} onChangeText={setBrandColor} placeholder="#5147F2" />
        <Button loading={update.isPending} onPress={() => update.mutate()}>
          Save Profile
        </Button>
      </Card>

      <Card>
        <Eyebrow>Tools</Eyebrow>
        <Button variant="soft" loading={invite.isPending} onPress={() => invite.mutate()}>
          Generate Invite
        </Button>
        <Button variant="soft" loading={notifications.isPending} onPress={() => notifications.mutate()}>
          Enable Alerts
        </Button>
        <Button variant="soft" loading={payment.isPending} onPress={() => payment.mutate()}>
          Create Pro Order
        </Button>
      </Card>

      <Card>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <ChartBar color={colors.ink} size={20} />
          <SectionTitle>Reports</SectionTitle>
        </View>
        <Field label="Month" value={month} onChangeText={setMonth} placeholder="2026-05" />
        <Muted mono>{JSON.stringify(summary.data ?? {}, null, 2)}</Muted>
      </Card>

      <Card>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <School color={colors.ink} size={20} />
          <SectionTitle>Class Stats</SectionTitle>
        </View>
        {classes.data?.map((row) => (
          <Button key={row.id} variant={classId === row.id ? "primary" : "ghost"} onPress={() => setClassId(row.id)}>
            {row.name}
          </Button>
        ))}
        {classStats.data ? <Muted mono>{JSON.stringify(classStats.data, null, 2)}</Muted> : null}
      </Card>
    </View>
  );
}

function tabTitle(tab: TeacherTab) {
  if (tab === "attendance") return "Mark";
  if (tab === "records") return "Manage";
  if (tab === "messages") return "Send";
  if (tab === "profile") return "Tune";
  return "Home";
}

function tabAccent(tab: TeacherTab) {
  if (tab === "attendance") return "Attendance";
  if (tab === "records") return "Records";
  if (tab === "messages") return "Messages";
  if (tab === "profile") return "Profile";
  return "Overview";
}

function readError(error: unknown) {
  if (!error) return "Something went wrong";
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}

function createIdempotencyKey() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
