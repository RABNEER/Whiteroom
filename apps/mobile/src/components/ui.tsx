import { ComponentType, ReactNode, useState } from "react";
import {
  ActivityIndicator,
  DimensionValue,
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
  Modal,
  Image,
} from "react-native";
import LogoImage from "../assets/logo.png";
import { SafeAreaView } from "react-native-safe-area-context";
import type { LucideProps } from "lucide-react-native";
import { colors as tokensColors, font, radius, spacing } from "@/theme/tokens";

// Backward compatibility map for purged design tokens inside the ui library
const colors = {
  ...tokensColors,
  success: "#15803D",
  primary: tokensColors.navy,
  info: tokensColors.teal,
  muted: tokensColors.teal,
  ink: tokensColors.navy,
};
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Circle } from "react-native-svg";

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

export function Eyebrow({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.eyebrow, style]}>{children}</Text>;
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
  style,
}: {
  children: ReactNode;
  accent?: string;
  size?: "md" | "lg";
  style?: StyleProp<TextStyle>;
}) {
  const flatStyle = StyleSheet.flatten(style);
  const color = flatStyle?.color;
  return (
    <Text style={[styles.display, size === "md" && styles.displayMd, style]}>
      {children}
      {accent ? (
        <Text style={[styles.displayAccent, color ? { color } : null]}>
          {" "}{accent}
        </Text>
      ) : null}
    </Text>
  );
}

export function AppHeader({
  eyebrow,
  title,
  accent,
  meta,
  trailing,
  onAvatarPress,
  avatarName = "Aarav",
}: {
  eyebrow?: string;
  title: string;
  accent?: string;
  meta?: string;
  trailing?: ReactNode;
  onAvatarPress?: () => void;
  avatarName?: string;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.brandLockup}>
        <View style={styles.headerText}>
          <Text style={styles.navBrand}>Whiteroom</Text>
          {meta ? <Text style={styles.navMeta}>{meta}</Text> : null}
        </View>
      </View>
      <View style={styles.headerTrailing}>
        {trailing}
        <Pressable
          accessibilityRole="button"
          onPress={onAvatarPress}
          style={({ pressed }) => [
            styles.profileBtn,
            pressed && { transform: [{ scale: 0.94 }] },
          ]}
        >
          <AvatarBadge label={avatarName} small />
        </Pressable>
      </View>
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
  return (
    <View style={[styles.heroPanel, compact && styles.heroPanelCompact]}>
      <View style={styles.heroContent}>{children}</View>
    </View>
  );
}

export function AvatarBadge({
  label,
  small = false,
  size,
  style,
  textStyle,
}: {
  label: string;
  small?: boolean;
  size?: number;
  style?: any;
  textStyle?: any;
}) {
  const firstLetter = label.slice(0, 1).toUpperCase();
  
  // Deterministic palette slot mapping based on character code
  let bgColor: string = colors.sky;
  let textColor: string = colors.navy;
  
  if (label === "+") {
    bgColor = colors.white;
    textColor = colors.teal;
  } else if (label.length > 0) {
    const code = label.toUpperCase().charCodeAt(0);
    const slot = code % 4;
    if (slot === 0) {
      bgColor = "#F1F5F9"; // Light gray
      textColor = "#0F172A"; // Dark slate
    } else if (slot === 1) {
      bgColor = "#E2E8F0"; // Slate 200
      textColor = "#1E293B"; // Slate 800
    } else if (slot === 2) {
      bgColor = "#F8FAFC"; // Slate 50
      textColor = "#334155"; // Slate 700
    } else {
      bgColor = "#ECEFF1"; // Slate 100/Blue-Grey
      textColor = "#263238"; // Dark blue-grey
    }
  }

  const customAvatarStyle = size ? {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: 1.5,
  } : null;

  const customTextStyle = size ? {
    fontSize: Math.round(size * 0.4),
  } : null;

  return (
    <View style={[styles.avatarBadge, small && styles.avatarBadgeSmall, customAvatarStyle, style, { backgroundColor: bgColor }]}>
      <Text style={[styles.avatarBadgeText, small && styles.avatarBadgeSmallText, customTextStyle, textStyle, { color: textColor }]}>
        {firstLetter}
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

export function SectionTitle({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.sectionTitle, style]}>{children}</Text>;
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
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.label, focused && { color: colors.primary }]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={[
          styles.input,
          props.multiline && styles.inputMultiline,
          focused && { borderColor: colors.primary, borderWidth: 1.5 },
        ]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
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
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
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
      <View style={{ flex: 1, justifyContent: "center", marginTop: spacing.sm }}>
        <Text style={[styles.metricValue, { marginTop: 0 }]}>{value}</Text>
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
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
    <View style={styles.segmentedContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.segmented, { minWidth: "100%" }]}
      >
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
      </ScrollView>
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
    <View style={styles.bottomNavContainer}>
      <View style={styles.bottomNav}>
        {items.map((item) => {
          const active = item.value === value;
          const Icon = item.icon;
          return (
            <Pressable
              key={item.value}
              accessibilityRole="button"
              onPress={() => onChange(item.value)}
              android_ripple={{
                color: "rgba(47, 65, 86, 0.12)",
                borderless: true,
                radius: 26,
              }}
              style={({ pressed }) => [
                styles.bottomItem,
                pressed && { opacity: 0.85 },
              ]}
            >
              <View style={[
                styles.navIconBox,
                active && styles.navIconBoxActive,
              ]}>
                <Icon
                  color={active ? colors.white : colors.teal}
                  size={18}
                />
              </View>
              <Text style={[styles.bottomLabel, active && styles.bottomLabelActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
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

export function DonutChart3D({
  value,
  size = 110,
  strokeWidth = 14,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radiusVal = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radiusVal;
  const strokeDashoffset = circumference - (value / 100) * circumference;

  return (
    <View style={[styles.donutContainer, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radiusVal}
          stroke="#E2E8F0"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radiusVal}
          stroke={colors.navy}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[styles.donutInner, { width: size - strokeWidth * 2, height: size - strokeWidth * 2 }]}>
        <Text style={styles.donutVal}>{value}%</Text>
      </View>
    </View>
  );
}

export function LayeredChart({
  value,
  size = 150,
  strokeWidth = 24,
  strokeColor = colors.white,
  bgColor = "rgba(255, 255, 255, 0.18)",
  textColor = colors.white,
  innerBgColor = "rgba(255, 255, 255, 0.15)",
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  strokeColor?: string;
  bgColor?: string;
  textColor?: string;
  innerBgColor?: string;
}) {
  const radiusVal = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radiusVal;
  const strokeDashoffset = circumference - (value / 100) * circumference;

  // Thin outer track radius
  const outerTrackRadius = radiusVal + strokeWidth / 2 + 3;

  return (
    <View style={[styles.layeredContainer, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* 1. Thin technical dotted outer track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={outerTrackRadius}
          stroke="rgba(255, 255, 255, 0.15)"
          strokeWidth={1}
          strokeDasharray="2, 3"
          fill="transparent"
        />

        {/* 2. Main background track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radiusVal}
          stroke={bgColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />

        {/* 3. Active Progress Ring */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radiusVal}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      
      {/* 4. Center glass bubble value display */}
      <View style={[styles.layeredInner, { 
        width: size - strokeWidth * 2 - 4, 
        height: size - strokeWidth * 2 - 4,
        backgroundColor: innerBgColor === "transparent" ? "rgba(255, 255, 255, 0.08)" : innerBgColor,
        borderWidth: 1,
        borderColor: "rgba(255, 255, 255, 0.22)",
      }]}>
        <Text style={[styles.layeredVal, { color: textColor }]}>{value}%</Text>
      </View>
    </View>
  );
}

export function SiblingDrawer({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable style={styles.drawerBackdrop} onPress={onClose}>
        <View style={styles.drawerContentContainer} pointerEvents="box-none">
          <Pressable style={styles.drawerSheet} pointerEvents="auto">
            <View style={styles.drawerHandle} />
            <Text style={styles.drawerTitle}>Select Sibling</Text>
            <View style={styles.drawerBody}>{children}</View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

export const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.paper,
    position: "relative",
  },
  bgElements: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 400,
    zIndex: -1,
  },
  waveSvg: {
    position: "absolute",
    top: -120,
    left: 0,
    right: 0,
  },
  content: {
    gap: spacing.md,
    padding: spacing.md,
    paddingBottom: spacing.lg + 110,
  },
  scrollWithFooter: {
    paddingBottom: 130,
  },
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
    letterSpacing: 1.5,
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
    color: colors.navy,
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
    color: colors.navy,
    fontWeight: "900",
  },
  header: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderBottomColor: "rgba(0, 0, 0, 0.08)",
    borderBottomWidth: 1.5,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    minHeight: 74,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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
    fontFamily: font.display,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  brandDot: {
    width: 6,
    height: 6,
    backgroundColor: colors.navy,
    borderRadius: radius.full,
    marginLeft: 4,
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
  profileBtn: {
    padding: 3,
    backgroundColor: colors.white,
    borderRadius: radius.full,
    borderColor: "rgba(0, 0, 0, 0.08)",
    borderWidth: 1.5,
  },
  heroPanel: {
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    minHeight: 210,
    overflow: "hidden",
    position: "relative",
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderWidth: 1.5,
  },
  heroPanelCompact: {
    minHeight: 150,
  },
  heroWaveContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "100%",
    zIndex: 1,
  },
  heroContent: {
    zIndex: 2,
    padding: spacing.lg,
    gap: spacing.md,
    flex: 1,
    justifyContent: "center",
  },
  avatarBadge: {
    alignItems: "center",
    backgroundColor: colors.sky,
    borderColor: colors.white,
    borderRadius: radius.full,
    borderWidth: 2,
    height: 58,
    justifyContent: "center",
    width: 58,
  },
  avatarBadgeSmall: {
    borderWidth: 1.5,
    height: 46,
    width: 46,
  },
  avatarBadgeClay: {
    backgroundColor: colors.white,
    padding: 3,
  },
  clayChar: {
    width: "100%",
    height: "100%",
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
    backgroundColor: colors.navy,
    borderRadius: radius.full,
    height: 7,
  },
  sectionTitle: {
    color: colors.navy,
    fontSize: 22,
    fontWeight: "900",
  },
  muted: {
    color: colors.teal,
    fontSize: 14,
    lineHeight: 20,
  },
  mutedMono: {
    fontFamily: font.mono,
  },
  fieldWrap: {
    gap: spacing.sm,
  },
  label: {
    color: colors.muted,
    fontFamily: font.mono,
    fontSize: 11,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: colors.white,
    borderColor: "rgba(0, 0, 0, 0.08)",
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.navy,
    fontSize: 15,
    minHeight: 52,
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
    borderRadius: radius.full,
    minHeight: 56,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderColor: "rgba(0, 0, 0, 0.15)",
    borderWidth: 1.5,
  },
  buttonGhost: {
    backgroundColor: colors.white,
    borderColor: colors.navy,
  },
  buttonSoft: {
    backgroundColor: colors.sky,
    borderColor: "rgba(0, 0, 0, 0.05)",
  },
  buttonDanger: {
    backgroundColor: colors.danger,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  buttonSuccess: {
    backgroundColor: colors.success,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  buttonText: {
    color: colors.white,
    fontFamily: font.body,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  buttonLightText: {
    color: colors.navy,
  },
  buttonPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.9,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderColor: "rgba(0, 0, 0, 0.08)",
    borderRadius: radius.full,
    borderWidth: 1.5,
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
    borderColor: "rgba(0, 0, 0, 0.06)",
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
    shadowOpacity: 0,
    elevation: 0,
  },
  cardInset: {
    backgroundColor: "rgba(0, 0, 0, 0.02)",
    borderColor: "rgba(0, 0, 0, 0.06)",
    borderWidth: 1.5,
    shadowOpacity: 0,
    elevation: 0,
  },
  metric: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 166,
    position: "relative",
    borderRadius: radius.lg,
  },
  metricIcon: {
    alignItems: "center",
    borderRadius: radius.full,
    height: 44,
    width: 44,
    justifyContent: "center",
    borderColor: "rgba(0, 0, 0, 0.05)",
    borderWidth: 1,
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
    borderColor: "rgba(0, 0, 0, 0.08)",
    borderWidth: 1,
  },
  pillText: {
    fontFamily: font.mono,
    fontSize: 12,
  },
  banner: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.md,
  },
  bannerText: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  segmentedContainer: {
    width: "100%",
  },
  segmented: {
    backgroundColor: "rgba(0, 0, 0, 0.04)",
    borderRadius: radius.full,
    flexDirection: "row",
    gap: spacing.xs,
    padding: 3,
  },
  segment: {
    borderRadius: radius.full,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    flexGrow: 1,
    flexShrink: 0,
  },
  segmentActive: {
    backgroundColor: colors.white,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentText: {
    color: colors.teal,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  segmentActiveText: {
    color: colors.navy,
    fontWeight: "900",
  },
  bottomNavContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  bottomNav: {
    backgroundColor: "rgba(255, 255, 255, 0.98)",
    borderTopColor: "rgba(0, 0, 0, 0.08)",
    borderTopWidth: 1.5,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    height: 80,
    paddingHorizontal: spacing.sm,
    paddingTop: 8,
    paddingBottom: 16,
  },
  bottomItem: {
    alignItems: "center",
    flex: 1,
    gap: 2,
    justifyContent: "center",
  },
  navIconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  navIconBoxActive: {
    backgroundColor: colors.navy,
    borderRadius: radius.full,
  },
  bottomLabel: {
    color: colors.teal,
    fontFamily: font.body,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  bottomLabelActive: {
    color: colors.navy,
    fontWeight: "900",
  },
  empty: {
    alignItems: "flex-start",
    paddingVertical: spacing.lg,
  },
  donutContainer: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  donutInner: {
    position: "absolute",
    backgroundColor: colors.white,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    borderColor: "rgba(0, 0, 0, 0.08)",
    borderWidth: 1.5,
  },
  donutVal: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.navy,
  },
  layeredContainer: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  layeredInner: {
    position: "absolute",
    backgroundColor: colors.white,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderWidth: 1.5,
  },
  layeredVal: {
    fontSize: 28,
    fontWeight: "900",
    color: colors.navy,
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "flex-end",
  },
  drawerContentContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  drawerSheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl + 20,
    borderColor: "rgba(0, 0, 0, 0.08)",
    borderWidth: 1.5,
  },
  drawerHandle: {
    width: 50,
    height: 6,
    backgroundColor: colors.sky,
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: spacing.lg,
  },
  drawerTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: colors.navy,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  drawerBody: {
    gap: spacing.md,
  },
});
