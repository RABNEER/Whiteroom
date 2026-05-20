import { Redirect } from "expo-router";
import { useSession } from "@/auth/session-store";
import { Screen, Card, DisplayTitle, Eyebrow, Muted } from "@/components/ui";

export default function Index() {
  const user = useSession((state) => state.user);

  if (!user) return <Redirect href="/auth" />;
  if (user.role === "parent") return <Redirect href="/parent" />;
  if (user.role === "teacher") return <Redirect href="/teacher" />;

  return (
    <Screen>
      <Eyebrow>Whiteroom</Eyebrow>
      <DisplayTitle accent="blocked.">Role not supported</DisplayTitle>
      <Card>
        <Muted>Your account role is not available in the mobile app yet.</Muted>
      </Card>
    </Screen>
  );
}
