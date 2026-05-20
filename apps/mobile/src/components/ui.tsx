import { ComponentType, ReactNode } from "react";
import {
  ActivityIndicator,
  DimensionValue,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { LucideProps } from "lucide-react-native";
import { colors, font, radius, spacing } from "@/theme/tokens";

export type NavItem<T extends string> = {
  value: T;
  label: string;
  icon: ComponentType<LucideProps>;
};

export function Screen({
  children,
  scroll = true,
  footer,
}: {
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
}) {
  const content = <View style={styles.content}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={footer ? styles.scrollWithFooter : undefined}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function BrandWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Text style={[styles.wordmark, compact && styles.wordmarkCompact]}>
      White<Text style={styles.wordmarkAccent}>room</Text>
    </Text>
  );
}

export function DisplayTitle({
  children,
  accent,
  size = "lg",
}: {
  children: ReactNode;
  accent?: string;
  size?: "md" | "lg";
}) {
  return (
    <Text style={[styles.display, size === "md" && styles.displayMd]}>
      {children}
      {accent ? <Text style={styles.displayAccent}> {accent}</Text> : null}
    </Text>
  );
}

export function AppHeader({
  eyebrow,
  title,
  accent,
  meta,
  trailing,
}: {
  eyebrow?: string;
  title: string;
  accent?: string;
  meta?: string;
  trailing?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.brandLockup}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>W</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.navBrand}>Whiteroom</Text>
          <Text style={styles.navContext}>
            {[eyebrow, title, accent].filter(Boolean).join(" / ")}
          </Text>
          {meta ? <Text style={styles.navMeta}>{meta}</Text> : null}
        </View>
      </View>
      {trailing ? <View style={styles.headerTrailing}>{trailing}</View> : null}
    </View>
  );
}

export function HeroPanel({
  children,
  compact = false,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  return <View style={[styles.heroPanel, compact && styles.heroPanelCompact]}>{children}</View>;
}

export function AvatarBadge({ label, small = false }: { label: string; small?: boolean }) {
  return (
    <View style={[styles.avatarBadge, small && styles.avatarBadgeSmall]}>
      <Text style={[styles.avatarBadgeText, small && styles.avatarBadgeSmallText]}>
        {label.slice(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const width = `${Math.max(0, Math.min(100, value))}%` as DimensionValue;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width }]} />
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Muted({
  children,
  mono,
  style,
}: {
  children: ReactNode;
  mono?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.muted, mono && styles.mutedMono, style]}>{children}</Text>;
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.input, props.multiline && styles.inputMultiline]}
        {...props}
      />
    </View>
  );
}

export function Button({
  children,
  onPress,
  variant = "primary",
  loading,
  disabled,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  variant?: "primary" | "ghost" | "danger" | "success" | "soft";
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const lightVariant = variant === "ghost" || variant === "soft";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "ghost" && styles.buttonGhost,
        variant === "soft" && styles.buttonSoft,
        variant === "danger" && styles.buttonDanger,
        variant === "success" && styles.buttonSuccess,
        (pressed || disabled) && { opacity: 0.72 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={lightVariant ? colors.ink : colors.white} />
      ) : (
        <Text style={[styles.buttonText, lightVariant && styles.buttonLightText]}>
          {children}
        </Text>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon: Icon,
  onPress,
  active,
}: {
  icon: ComponentType<LucideProps>;
  onPress?: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.iconButton, active && styles.iconButtonActive]}
    >
      <Icon color={active ? colors.white : colors.ink} size={18} />
    </Pressable>
  );
}

export function Card({
  children,
  style,
  inset = false,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  inset?: boolean;
}) {
  return <View style={[styles.card, inset && styles.cardInset, style]}>{children}</View>;
}

export function MetricCard({
  label,
  value,
  note,
  tone = "primary",
}: {
  label: string;
  value: string | number;
  note?: string;
  tone?: "primary" | "success" | "danger" | "warning";
}) {
  const toneColor =
    tone === "success"
      ? colors.success
      : tone === "danger"
        ? colors.danger
        : tone === "warning"
          ? colors.warning
          : colors.primary;
  return (
    <Card style={styles.metric}>
      <View style={[styles.metricIcon, { backgroundColor: `${toneColor}12` }]}>
        <View style={[styles.metricDot, { backgroundColor: toneColor }]} />
      </View>
      {note ? (
        <View style={[styles.pill, { backgroundColor: `${toneColor}12` }]}>
          <Text style={[styles.pillText, { color: toneColor }]}>{note}</Text>
        </View>
      ) : null}
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </Card>
  );
}

export function Banner({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  children: ReactNode;
}) {
  const toneColor =
    tone === "danger"
      ? colors.danger
      : tone === "warning"
        ? colors.warning
        : tone === "success"
          ? colors.success
          : colors.info;
  return (
    <View style={[styles.banner, { borderColor: `${toneColor}28` }]}>
      <Text style={[styles.bannerText, { color: toneColor }]}>{children}</Text>
    </View>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentActiveText]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function BottomNav<T extends string>({
  value,
  items,
  onChange,
}: {
  value: T;
  items: NavItem<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.bottomNav}>
      {items.map((item, index) => {
        const active = item.value === value;
        const Icon = item.icon;
        const center = items.length >= 5 && index === Math.floor(items.length / 2);
        return (
          <Pressable
            key={item.value}
            accessibilityRole="button"
            onPress={() => onChange(item.value)}
            style={[styles.bottomItem, center && styles.bottomCenterItem]}
          >
            <View style={[center && styles.bottomCenterIcon, center && active && styles.bottomCenterIconActive]}>
              <Icon
                color={center ? colors.white : active ? colors.navy : colors.teal}
                size={center ? 22 : 18}
              />
            </View>
            <Text style={[styles.bottomLabel, active && styles.bottomLabelActive]}>
              {item.label}
            </Text>
            <View style={[styles.bottomDot, active && styles.bottomDotActive]} />
          </Pressable>
        );
      })}
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card style={styles.empty}>
      <SectionTitle>{title}</SectionTitle>
      <Muted>{body}</Muted>
    </Card>
  );
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.lg },
  scrollWithFooter: { paddingBottom: 110 },
  footer: {
    backgroundColor: "transparent",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  eyebrow: {
    color: colors.teal,
    fontFamily: font.mono,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  wordmark: {
    color: colors.navy,
    fontFamily: font.display,
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 40,
  },
  wordmarkCompact: {
    fontSize: 28,
    lineHeight: 34,
  },
  wordmarkAccent: {
    color: colors.teal,
    fontWeight: "900",
  },
  display: {
    color: colors.navy,
    fontFamily: font.display,
    fontSize: 38,
    fontWeight: "900",
    lineHeight: 43,
  },
  displayMd: {
    fontSize: 30,
    lineHeight: 35,
  },
  displayAccent: {
    color: colors.teal,
    fontWeight: "900",
  },
  header: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.sky,
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    minHeight: 74,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...Platform.select({
      ios: {
        shadowColor: colors.navy,
        shadowOpacity: 0.08,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
      },
      android: { elevation: 2 },
      web: { boxShadow: "0 16px 34px rgba(47, 65, 86, 0.10)" },
    }),
  },
  brandLockup: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
  },
  brandMark: {
    alignItems: "center",
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  brandMarkText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "900",
  },
  headerText: {
    flex: 1,
    gap: 1,
  },
  navBrand: {
    color: colors.navy,
    fontSize: 16,
    fontWeight: "900",
  },
  navContext: {
    color: colors.teal,
    fontSize: 12,
    fontWeight: "800",
  },
  navMeta: {
    color: colors.teal,
    fontFamily: font.mono,
    fontSize: 10,
  },
  headerTrailing: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  heroPanel: {
    backgroundColor: colors.navy,
    borderRadius: radius.xl,
    gap: spacing.md,
    minHeight: 210,
    overflow: "hidden",
    padding: spacing.lg,
    position: "relative",
    ...Platform.select({
      ios: {
        shadowColor: colors.navy,
        shadowOpacity: 0.28,
        shadowRadius: 26,
        shadowOffset: { width: 0, height: 18 },
      },
      android: { elevation: 5 },
      web: { boxShadow: "0 28px 60px rgba(47, 65, 86, 0.28)" },
    }),
  },
  heroPanelCompact: { minHeight: 150 },
  avatarBadge: {
    alignItems: "center",
    backgroundColor: colors.sky,
    borderColor: colors.white,
    borderRadius: radius.full,
    borderWidth: 3,
    height: 58,
    justifyContent: "center",
    width: 58,
  },
  avatarBadgeSmall: {
    borderWidth: 2,
    height: 46,
    width: 46,
  },
  avatarBadgeText: {
    color: colors.navy,
    fontSize: 16,
    fontWeight: "900",
  },
  avatarBadgeSmallText: {
    fontSize: 13,
  },
  progressTrack: {
    backgroundColor: colors.sky,
    borderRadius: radius.full,
    height: 7,
    overflow: "hidden",
  },
  progressFill: {
    backgroundColor: colors.teal,
    borderRadius: radius.full,
    height: 7,
  },
  sectionTitle: {
    color: colors.navy,
    fontSize: 22,
    fontWeight: "900",
  },
  muted: { color: colors.teal, fontSize: 14, lineHeight: 20 },
  mutedMono: { fontFamily: font.mono },
  fieldWrap: { gap: spacing.sm },
  label: {
    color: colors.muted,
    fontFamily: font.mono,
    fontSize: 11,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: colors.white,
    borderColor: colors.sky,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.navy,
    fontSize: 16,
    minHeight: 56,
    paddingHorizontal: spacing.md,
  },
  inputMultiline: {
    minHeight: 104,
    paddingTop: spacing.md,
    textAlignVertical: "top",
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    minHeight: 56,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  buttonGhost: {
    backgroundColor: colors.white,
    borderColor: colors.sky,
    borderWidth: 1,
  },
  buttonSoft: {
    backgroundColor: colors.sky,
  },
  buttonDanger: { backgroundColor: colors.navy },
  buttonSuccess: { backgroundColor: colors.teal },
  buttonText: {
    color: colors.white,
    fontFamily: font.body,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  buttonLightText: { color: colors.navy },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: colors.sky,
    borderRadius: radius.full,
    borderWidth: 1,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  iconButtonActive: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  card: {
    backgroundColor: colors.white,
    borderColor: colors.sky,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
    ...Platform.select({
      ios: {
        shadowColor: colors.navy,
        shadowOpacity: 0.14,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 16 },
      },
      android: { elevation: 3 },
      web: { boxShadow: "0 22px 48px rgba(47, 65, 86, 0.14)" },
    }),
  },
  cardInset: {
    backgroundColor: colors.beige,
    shadowOpacity: 0,
  },
  metric: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 166,
    position: "relative",
  },
  metricIcon: {
    alignItems: "center",
    borderRadius: radius.md,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  metricGlyph: {
    fontFamily: font.mono,
    fontSize: 20,
  },
  metricDot: {
    borderRadius: radius.full,
    height: 14,
    width: 14,
  },
  metricValue: {
    color: colors.navy,
    fontFamily: font.display,
    fontSize: 40,
    fontWeight: "900",
    lineHeight: 48,
    marginTop: spacing.sm,
  },
  metricLabel: {
    color: colors.teal,
    fontFamily: font.mono,
    fontSize: 14,
  },
  pill: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: "absolute",
    right: spacing.md,
    top: spacing.md,
  },
  pillText: {
    fontFamily: font.mono,
    fontSize: 12,
  },
  banner: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  bannerText: { fontSize: 14, fontWeight: "700", lineHeight: 20 },
  segmented: {
    backgroundColor: colors.white,
    borderRadius: radius.full,
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.xs,
  },
  segment: {
    borderRadius: radius.full,
    flex: 1,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  segmentActive: { backgroundColor: colors.navy },
  segmentText: {
    color: colors.teal,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  segmentActiveText: { color: colors.white },
  bottomNav: {
    backgroundColor: colors.white,
    borderColor: colors.sky,
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    minHeight: 78,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    ...Platform.select({
      ios: {
        shadowColor: colors.navy,
        shadowOpacity: 0.16,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 12 },
      },
      android: { elevation: 5 },
      web: { boxShadow: "0 18px 42px rgba(47, 65, 86, 0.18)" },
    }),
  },
  bottomItem: {
    alignItems: "center",
    flex: 1,
    gap: spacing.xs,
    minHeight: 56,
    justifyContent: "center",
  },
  bottomLabel: {
    color: colors.teal,
    fontFamily: font.body,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  bottomLabelActive: { color: colors.navy },
  bottomCenterItem: {
    marginTop: -24,
  },
  bottomCenterIcon: {
    alignItems: "center",
    backgroundColor: colors.navy,
    borderColor: colors.white,
    borderRadius: radius.full,
    borderWidth: 4,
    height: 58,
    justifyContent: "center",
    width: 58,
  },
  bottomCenterIconActive: {
    backgroundColor: colors.teal,
  },
  bottomDot: {
    borderRadius: radius.full,
    height: 6,
    opacity: 0,
    width: 6,
  },
  bottomDotActive: {
    backgroundColor: colors.navy,
    opacity: 1,
  },
  empty: { alignItems: "flex-start", paddingVertical: spacing.lg },
});
