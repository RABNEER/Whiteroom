# WhatsApp-Style Chat List Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add WhatsApp-style features—including dynamic quick filters (All, Unread, Groups, Personal), pinned chat listings, draft indicators, and long-press quick-action context sheets—to the Chats tab in both the Teacher and Parent dashboards.

**Architecture:** Extend the inline `ChatsTab` components in both `teacher/index.tsx` and `parent/index.tsx` to handle tab filtering and room pinning in local/secure state, display draft messages stored in client-side text state, and trigger a bottom sheet modal for room management.

**Tech Stack:** React Native (StyleSheet, FlatList, TextInput, Modal, Pressable), TanStack React Query, Lucide React Native, and expo-router.

---

### Task 1: Add Quick Filters Bar to Chats Tab

**Files:**
- Modify: [teacher/index.tsx](file:///d:/Whiteroom/apps/mobile/app/teacher/index.tsx)
- Modify: [parent/index.tsx](file:///d:/Whiteroom/apps/mobile/app/parent/index.tsx)

**Step 1: Define Filter Type and State**
Add a state hook for active filter inside the `ChatsTab` component:
```typescript
type ChatFilter = 'ALL' | 'UNREAD' | 'GROUPS' | 'PERSONAL';
const [filter, setFilter] = useState<ChatFilter>('ALL');
```

**Step 2: Add Horizontal Filter Bar under Search Bar**
Add a horizontal scrollable view containing filter pills. Update the component layout:
```tsx
{/* Filters Row */}
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
```

**Step 3: Update Room Filtering Logic**
Refactor `filteredRooms` to check the selected filter:
```typescript
const filteredRooms = useMemo(() => {
  let list = rooms;

  // 1. Apply Search Query
  if (search.trim()) {
    const query = search.toLowerCase();
    list = list.filter(
      (room) =>
        room.name.toLowerCase().includes(query) ||
        room.subtitle.toLowerCase().includes(query)
    );
  }

  // 2. Apply Quick Filter
  if (filter === 'UNREAD') {
    list = list.filter((room) => room.unreadCount > 0);
  } else if (filter === 'GROUPS') {
    list = list.filter((room) => room.type === 'classroom' || room.type === 'teacher_channel');
  } else if (filter === 'PERSONAL') {
    list = list.filter((room) => room.type === 'direct_message');
  }

  return list;
}, [rooms, search, filter]);
```

**Step 4: Update styles in `chatStyles`**
Add styles to support horizontal filtering:
```typescript
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
```

---

### Task 2: Implement Chat Room Pinning & Custom Swipe Actions

**Files:**
- Modify: [teacher/index.tsx](file:///d:/Whiteroom/apps/mobile/app/teacher/index.tsx)
- Modify: [parent/index.tsx](file:///d:/Whiteroom/apps/mobile/app/parent/index.tsx)

**Step 1: Set up Pinning State**
Declare a client-side pinned rooms ID list:
```typescript
const [pinnedRoomIds, setPinnedRoomIds] = useState<string[]>([]);
```

**Step 2: Add Pinned Room Ordering**
Order pinned rooms at the top of the rooms lists before filtering:
```typescript
const sortedRooms = useMemo(() => {
  return [...rooms].sort((a, b) => {
    const aPinned = pinnedRoomIds.includes(a.id);
    const bPinned = pinnedRoomIds.includes(b.id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    // fallback to default sorting (updatedAt)
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}, [rooms, pinnedRoomIds]);
```
Update `filteredRooms` dependency hook to consume `sortedRooms` instead of `rooms`.

**Step 3: Implement Long-Press Bottom Actions Sheet**
Introduce a React Native `<Modal>` that triggers when a room item is long-pressed, letting the user toggle pins or mark rooms read:
```typescript
const [selectedRoom, setSelectedRoom] = useState<any | null>(null);

const handleLongPressRoom = (room: any) => {
  setSelectedRoom(room);
};

const togglePinRoom = (roomId: string) => {
  setPinnedRoomIds((prev) =>
    prev.includes(roomId) ? prev.filter((id) => id !== roomId) : [...prev, roomId]
  );
  setSelectedRoom(null);
};
```
Inside the ChatsTab JSX, render the Modal actions sheet:
```tsx
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
```

**Step 4: Update Room Rendering with Pin Indicator**
Add the long press trigger to the row pressable:
```tsx
onLongPress={() => handleLongPressRoom(item)}
```
Show a small pin icon next to the room name if the room is pinned:
```tsx
{pinnedRoomIds.includes(item.id) && (
  <Text style={{ marginRight: 6 }}>📌</Text>
)}
```

**Step 5: Add modal styles to `chatStyles`**
```typescript
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
```

---

### Task 3: Draft Message Indicators

**Files:**
- Modify: [teacher/index.tsx](file:///d:/Whiteroom/apps/mobile/app/teacher/index.tsx)
- Modify: [parent/index.tsx](file:///d:/Whiteroom/apps/mobile/app/parent/index.tsx)

**Step 1: Check room text inputs**
When editing a message draft on the Chat message screen `/chat/[roomId]`, the state should persist in the local storage so the listing tab can display it. Define a mock check (or query local storage drafts if available) inside `ChatsTab` to render draft tags next to the subtitle:
```typescript
// Mock/Load local drafts for display
const [roomDrafts, setRoomDrafts] = useState<Record<string, string>>({
  "room-1": "Make sure to bring notes tomorrow...",
});
```

**Step 2: Show Draft Badge in Room Row**
In `renderRoomItem`, check for a draft and display it:
```tsx
const draftText = roomDrafts[item.id];
```
In the subtitle view, if a draft exists, style it in green (`#22C55E` / custom green) and prefix with "Draft: ":
```tsx
<Text style={[chatStyles.roomSubtitle, draftText && { color: "#22C55E", fontWeight: "600" }]} numberOfLines={1}>
  {draftText ? `Draft: ${draftText}` : item.subtitle}
</Text>
```

---

### Verification Plan

#### Automated Verification
- Verify TypeScript builds cleanly:
  ```powershell
  pnpm build
  ```
- Run standard workspace tests:
  ```powershell
  pnpm test
  ```

#### Manual Verification
- Go to the Chats bottom tab on both Parent and Teacher interfaces.
- Verify the **All**, **Unread**, **Groups**, and **Personal** pills filter chats accurately.
- Long press on a chat row, select **Pin Conversation**, and confirm it shifts to the top of the list with a pin icon. Long press again to unpin.
- Confirm any simulated draft messages show green draft text prefixes.
