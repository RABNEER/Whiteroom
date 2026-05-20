import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bell, BookOpen, CalendarCheck, Home, LogOut, UserRound } from "lucide-react-native";
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
  HeroPanel,
  IconButton,
  MetricCard,
  Muted,
  Screen,
  SectionTitle,
  AvatarBadge,
  DonutChart3D,
  SiblingDrawer,
} from "@/components/ui";
import { colors, font, radius, spacing } from "@/theme/tokens";
import { formatDate } from "@/utils/format";

type ParentTab = "feed" | "children" | "profile";

const parentTabs = [
  { value: "feed", label: "Home", icon: Home },
  { value: "children", label: "Children", icon: BookOpen },
  { value: "profile", label: "Profile", icon: UserRound },
] as const;

export default function ParentScreen() {
  const [tab, setTab] = useState<ParentTab>("feed");
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);

  const clear = useSession((state) => state.clear);
  const tenant = useQuery({ queryKey: ["tenant"], queryFn: api.tenantMe });
  const feed = useQuery({ queryKey: ["parentFeed"], queryFn: api.parentFeed });
  const children = useQuery({ queryKey: ["parentChildren"], queryFn: api.parentChildren });

  const selectedChild = useMemo(
    () => children.data?.find((child) => child.id === selectedChildId) ?? children.data?.[0],
    [children.data, selectedChildId]
  );

  const logout = useMutation({
    mutationFn: api.logout,
    onSettled: async () => {
      await clear();
      router.replace("/auth");
    },
  });

  return (
    <Screen footer={<BottomNav value={tab} items={[...parentTabs]} onChange={setTab} />}>
      <View style={{ gap: spacing.lg }}>
        <AppHeader
          eyebrow="Parent room"
          title={tab === "feed" ? "Class" : tab === "children" ? "Child" : "Family"}
          accent={tab === "feed" ? "Updates" : tab === "children" ? "Progress" : "Profile"}
          meta={`${feed.data?.unread ?? 0} unread updates`}
          onAvatarPress={() => setDrawerVisible(true)}
          avatarName={selectedChild?.name ?? "Aarav"}
          trailing={
            <>
              <IconButton icon={Bell} />
            </>
          }
        />

        {tenant.error || feed.error || children.error ? (
          <Banner tone="danger">{readError(tenant.error ?? feed.error ?? children.error)}</Banner>
        ) : null}

        {tab === "feed" ? (
          <FeedPanel tenantName={tenant.data?.name ?? "Whiteroom"} unread={feed.data?.unread ?? 0} />
        ) : tab === "children" ? (
          <ChildrenPanel selectedChild={selectedChild} setSelectedChildId={setSelectedChildId} />
        ) : (
          <ProfilePanel logoutPending={logout.isPending} onLogout={() => logout.mutate()} />
        )}
      </View>

      <SiblingDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)}>
        {children.data?.map((child) => {
          const active = selectedChild?.id === child.id;
          return (
            <Pressable
              key={child.id}
              onPress={() => {
                setSelectedChildId(child.id);
                setDrawerVisible(false);
              }}
              style={{ marginBottom: spacing.xs }}
            >
              <Card inset={!active} style={active ? { borderColor: colors.teal, borderWidth: 2, backgroundColor: "rgba(86, 124, 141, 0.05)" } : undefined}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                  <AvatarBadge label={child.name} small />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.ink, fontSize: 18, fontWeight: "800" }}>{child.name}</Text>
                    <Muted>{active ? "Active Student" : "Switch Student"}</Muted>
                  </View>
                </View>
              </Card>
            </Pressable>
          );
        })}
      </SiblingDrawer>
    </Screen>
  );
}

function FeedPanel({ tenantName, unread }: { tenantName: string; unread: number }) {
  const feed = useQuery({ queryKey: ["parentFeed"], queryFn: api.parentFeed });
  const markRead = useMutation({
    mutationFn: (id: string) => api.announcementRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["parentFeed"] }),
  });

  if (!feed.data?.announcements.length) {
    return (
      <View style={{ gap: spacing.lg }}>
        <HeroPanel compact>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
            <AvatarBadge label={tenantName} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.white, fontSize: 24, fontWeight: "900" }}>{tenantName}</Text>
              <Muted style={{ color: colors.sky }}>{unread} unread school updates</Muted>
            </View>
          </View>
        </HeroPanel>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <MetricCard label="Unread" value={feed.data?.unread ?? 0} note="Live" />
          <MetricCard label="Children" value="--" note="Linked" tone="success" />
        </View>
        <EmptyState title="No updates yet" body="Announcements from teachers will show here." />
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.lg }}>
      <HeroPanel compact>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
          <AvatarBadge label={tenantName} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.white, fontSize: 24, fontWeight: "900" }}>{tenantName}</Text>
            <Muted style={{ color: colors.sky }}>Fresh updates from class.</Muted>
          </View>
        </View>
      </HeroPanel>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <MetricCard label="Unread" value={feed.data.unread} note="Live" />
        <MetricCard label="Updates" value={feed.data.announcements.length} note="New" tone="success" />
      </View>

      {feed.data.announcements.map((item) => (
        <Card key={item.id}>
          <Eyebrow>{formatDate(item.createdAt)}</Eyebrow>
          <SectionTitle>{item.title}</SectionTitle>
          <Muted>{item.body}</Muted>
          <Button variant="soft" loading={markRead.isPending} onPress={() => markRead.mutate(item.id)}>
            Mark Read
          </Button>
        </Card>
      ))}
    </View>
  );
}

function ChildrenPanel({
  selectedChild,
  setSelectedChildId,
}: {
  selectedChild: any;
  setSelectedChildId: (id: string | null) => void;
}) {
  const children = useQuery({ queryKey: ["parentChildren"], queryFn: api.parentChildren });
  const classes = useQuery({
    queryKey: ["parentChildClasses", selectedChild?.id],
    queryFn: () => api.parentChildClasses(selectedChild!.id),
    enabled: Boolean(selectedChild?.id),
  });
  const attendance = useQuery({
    queryKey: ["parentChildAttendance", selectedChild?.id],
    queryFn: () => api.parentChildAttendance(selectedChild!.id),
    enabled: Boolean(selectedChild?.id),
  });

  if (!children.data?.length) {
    return <EmptyState title="No linked children" body="Join through your teacher's invite code to link a child." />;
  }

  const presentCount = attendance.data?.filter((row) => row.status === "present").length ?? 0;
  const absentCount = attendance.data?.filter((row) => row.status === "absent").length ?? 0;
  const totalDays = presentCount + absentCount;
  const attendancePercentage = totalDays > 0 ? Math.round((presentCount / totalDays) * 100) : 94; // fallback to 94% from mockup if no history

  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ padding: 28 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 28 }}>
          <DonutChart3D value={attendancePercentage} />
          <View style={{ flex: 1 }}>
            <Eyebrow>RFID Attendance</Eyebrow>
            <SectionTitle style={{ color: colors.teal }}>{attendancePercentage >= 90 ? "In Campus" : "Out of Campus"}</SectionTitle>
            <Muted>08:32 AM • Gate 2</Muted>
          </View>
        </View>
      </Card>

      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <MetricCard label="Present" value={presentCount} tone="success" />
        <MetricCard label="Absent" value={absentCount} tone="danger" />
      </View>

      <Card>
        <Eyebrow>Children</Eyebrow>
        {children.data.map((child) => (
          <Button
            key={child.id}
            variant={selectedChild?.id === child.id ? "primary" : "ghost"}
            onPress={() => setSelectedChildId(child.id)}
          >
            {child.name}
          </Button>
        ))}
      </Card>

      <Card>
        <SectionTitle>Classes</SectionTitle>
        {classes.data?.length ? (
          classes.data.map((row) => (
            <View
              key={row.id}
              style={{
                borderBottomColor: colors.border,
                borderBottomWidth: 1,
                gap: spacing.xs,
                paddingVertical: spacing.sm,
              }}
            >
              <Text style={{ color: colors.ink, fontSize: 18, fontWeight: "800" }}>{row.name}</Text>
              <Muted mono>{row.subject ?? "General"}</Muted>
            </View>
          ))
        ) : (
          <Muted>No classes linked yet.</Muted>
        )}
      </Card>

      <Card>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <CalendarCheck color={colors.ink} size={20} />
          <SectionTitle>Attendance</SectionTitle>
        </View>
        {attendance.data?.length ? (
          attendance.data.map((row) => <AttendanceRecord key={row.id} date={row.date} status={row.status} />)
        ) : (
          <Muted>No attendance records yet.</Muted>
        )}
      </Card>
    </View>
  );
}

function AttendanceRecord({ date, status }: { date: string; status: string }) {
  const color =
    status === "present" ? colors.success : status === "absent" ? colors.danger : colors.warning;
  return (
    <View
      style={{
        alignItems: "center",
        borderBottomColor: colors.border,
        borderBottomWidth: 1,
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: spacing.sm,
      }}
    >
      <Muted mono>{date}</Muted>
      <View
        style={{
          backgroundColor: `${color}12`,
          borderRadius: radius.full,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.xs,
        }}
      >
        <Text style={{ color, fontFamily: font.mono, textTransform: "uppercase" }}>{status}</Text>
      </View>
    </View>
  );
}

function ProfilePanel({
  logoutPending,
  onLogout,
}: {
  logoutPending: boolean;
  onLogout: () => void;
}) {
  const notifications = useMutation({
    mutationFn: registerDeviceForNotifications,
  });

  return (
    <View style={{ gap: spacing.md }}>
      <Card>
        <Eyebrow>Notifications</Eyebrow>
        <SectionTitle>Absence alerts</SectionTitle>
        <Muted>Get attendance and announcement updates from the institute.</Muted>
        {notifications.error ? <Banner tone="danger">{readError(notifications.error)}</Banner> : null}
        <Button loading={notifications.isPending} onPress={() => notifications.mutate()}>
          Enable Alerts
        </Button>
      </Card>
      <Card>
        <Eyebrow>Account</Eyebrow>
        <SectionTitle>Session</SectionTitle>
        <Muted mono>Secure OTP session stored on this device.</Muted>
        <Pressable
          accessibilityRole="button"
          onPress={onLogout}
          style={{
            alignItems: "center",
            flexDirection: "row",
            gap: spacing.sm,
            justifyContent: "center",
            opacity: logoutPending ? 0.7 : 1,
            paddingVertical: spacing.sm,
          }}
        >
          <LogOut color={colors.danger} size={18} />
          <Text style={{ color: colors.danger, fontFamily: font.mono, fontWeight: "800" }}>
            LOG OUT
          </Text>
        </Pressable>
      </Card>
    </View>
  );
}

function readError(error: unknown) {
  if (!error) return "Something went wrong";
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
