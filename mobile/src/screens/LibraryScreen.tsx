import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AmbientBackground } from "../components/AmbientBackground";
import { BookCard } from "../components/BookCard";
import { GlassSurface } from "../components/GlassSurface";
import { IconButton } from "../components/IconButton";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { useLibraryStore } from "../store/useLibraryStore";
import { getPalette, type Palette } from "../theme";
import type { LibraryFilter, MobileBook, MobileShelf } from "../types";

interface LibraryScreenProps {
  onOpenBook: (bookId: string) => void;
}

export function LibraryScreen({ onOpenBook }: LibraryScreenProps) {
  const layout = useResponsiveLayout();
  const {
    books,
    shelves,
    theme,
    isImporting,
    importStatus,
    error,
    importBooks,
    removeBook,
    markBookOpened,
    createShelf,
    deleteShelf,
    moveBookToShelf,
    cycleTheme,
    clearError,
  } = useLibraryStore();
  const palette = getPalette(theme);
  const [filter, setFilter] = useState<LibraryFilter>({ type: "all" });
  const [showCreateShelf, setShowCreateShelf] = useState(false);
  const [newShelfName, setNewShelfName] = useState("");
  const [actionBookId, setActionBookId] = useState<string | null>(null);

  const actionBook = books.find((book) => book.id === actionBookId) ?? null;
  const visibleBooks = useMemo(() => {
    const sorted = [...books].sort((a, b) =>
      (b.lastOpenedAt ?? b.importedAt).localeCompare(a.lastOpenedAt ?? a.importedAt));
    if (filter.type === "shelves") return [];
    if (filter.type === "recent") return sorted.filter((book) => book.lastOpenedAt);
    if (filter.type === "unfiled") return sorted.filter((book) => !book.shelfId);
    if (filter.type === "shelf") return sorted.filter((book) => book.shelfId === filter.shelfId);
    return sorted;
  }, [books, filter]);

  const heading = filter.type === "recent"
    ? "最近阅读"
    : filter.type === "shelves"
      ? "书架"
    : filter.type === "unfiled"
      ? "未归档书籍"
      : filter.type === "shelf"
        ? shelves.find((shelf) => shelf.id === filter.shelfId)?.name ?? "书架"
        : "书库";
  const isShelfContents = filter.type === "unfiled" || filter.type === "shelf";
  const unfiledBooks = books.filter((book) => !book.shelfId);
  const shelfCount = shelves.length + (unfiledBooks.length > 0 ? 1 : 0);

  const floatingFrameInset = layout.mode === "phone" ? 0 : 12;
  const floatingFrameGap = layout.usesSideNavigation ? 12 : 0;
  const canvasWidth = layout.width
    - floatingFrameInset * 2
    - (layout.usesSideNavigation ? layout.navigationWidth + floatingFrameGap : 0);
  const horizontalPadding = Math.max(
    layout.contentPadding,
    Number.isFinite(layout.contentMaxWidth)
      ? (canvasWidth - layout.contentMaxWidth) / 2
      : layout.contentPadding,
  );
  const contentWidth = canvasWidth - horizontalPadding * 2;
  const cardWidth = Math.max(
    layout.gridColumns >= 3 && layout.mode === "phone" ? 96 : 116,
    (contentWidth - layout.gridGap * (layout.gridColumns - 1)) / layout.gridColumns,
  );
  const compactCards = layout.mode === "phone" && layout.gridColumns >= 3;

  const openBook = (book: MobileBook) => {
    markBookOpened(book.id);
    onOpenBook(book.id);
  };

  const submitShelf = () => {
    if (!newShelfName.trim()) return;
    createShelf(newShelfName);
    setNewShelfName("");
    setShowCreateShelf(false);
  };

  const confirmDeleteBook = (book: MobileBook) => {
    setActionBookId(null);
    Alert.alert("移除书籍", `确定从设备中删除《${book.title}》吗？`, [
      { text: "取消", style: "cancel" },
      { text: "删除", style: "destructive", onPress: () => void removeBook(book.id) },
    ]);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]}>
      <AmbientBackground palette={palette} />
      <View style={[styles.workspace, layout.mode !== "phone" && styles.floatingWorkspace]}>
        {layout.navigationVariant === "sidebar" && (
          <SideNavigation
            width={layout.navigationWidth}
            filter={filter}
            books={books}
            shelves={shelves}
            palette={palette}
            onSelect={setFilter}
            onCreateShelf={() => setShowCreateShelf(true)}
            onDeleteShelf={(shelfId) => {
              deleteShelf(shelfId);
              if (filter.type === "shelf" && filter.shelfId === shelfId) setFilter({ type: "all" });
            }}
            onCycleTheme={cycleTheme}
          />
        )}

        {layout.navigationVariant === "rail" && (
          <CompactNavigationRail
            width={layout.navigationWidth}
            filter={filter}
            palette={palette}
            onSelect={setFilter}
            onShowShelves={() => setFilter({ type: "shelves" })}
            onCycleTheme={cycleTheme}
          />
        )}

        <View
          style={[
            styles.canvas,
            layout.mode === "phone" ? styles.phoneCanvas : styles.floatingCanvas,
            {
              backgroundColor: layout.mode === "phone" ? "transparent" : palette.glass,
              borderColor: palette.glassBorder,
              shadowColor: palette.shadow,
            },
          ]}
        >
          <GlassSurface
            palette={palette}
            intensity={layout.mode === "phone" ? 42 : 54}
            style={[
              styles.header,
              layout.mode === "phone" && styles.phoneHeader,
              {
                minHeight: layout.mode === "phone" ? (layout.isCompactHeight ? 56 : 66) : 76,
                paddingHorizontal: horizontalPadding,
                borderColor: palette.glassBorder,
                shadowColor: palette.shadow,
              },
            ]}
          >
            {isShelfContents && layout.navigationVariant === "bottom" && (
              <IconButton
                icon="arrow-left"
                palette={palette}
                accessibilityLabel="返回书架"
                onPress={() => setFilter({ type: "shelves" })}
              />
            )}
            <View style={styles.headerText}>
              {layout.mode !== "phone" && (
                <Text style={[styles.eyebrow, { color: palette.accent }]}>MOON READER</Text>
              )}
              <Text
                numberOfLines={1}
                style={[styles.heading, layout.mode === "phone" && styles.phoneHeading, { color: palette.text }]}
              >
                {heading}
              </Text>
              {layout.navigationVariant === "bottom" && (
                <Text style={[styles.headerMeta, { color: palette.mutedText }]}>
                  {filter.type === "shelves" ? `${shelfCount} 个书架` : `${visibleBooks.length} 本书`}
                </Text>
              )}
            </View>
            <View style={styles.headerActions}>
              {layout.navigationVariant === "bottom" && (
                <IconButton
                  icon={theme === "dark" ? "weather-night" : theme === "sepia" ? "circle-half-full" : "white-balance-sunny"}
                  palette={palette}
                  accessibilityLabel="切换外观主题"
                  onPress={cycleTheme}
                />
              )}
              {filter.type === "shelves" ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="新建书架"
                  onPress={() => setShowCreateShelf(true)}
                  style={({ pressed }) => [
                    styles.importButton,
                    { backgroundColor: palette.accent },
                    pressed && styles.pressed,
                  ]}
                >
                  <MaterialCommunityIcons name="folder-plus-outline" size={19} color={palette.onAccent} />
                  <Text style={[styles.importLabel, { color: palette.onAccent }]}>新建</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="导入 EPUB"
                  disabled={isImporting}
                  onPress={() => void importBooks()}
                  style={({ pressed }) => [
                    styles.importButton,
                    { backgroundColor: palette.accent },
                    pressed && styles.pressed,
                    isImporting && styles.disabled,
                  ]}
                >
                  {isImporting
                    ? <ActivityIndicator size="small" color={palette.onAccent} />
                    : <MaterialCommunityIcons name="tray-arrow-down" size={19} color={palette.onAccent} />}
                  <Text style={[styles.importLabel, { color: palette.onAccent }]}>导入</Text>
                </Pressable>
              )}
            </View>
          </GlassSurface>

          {(importStatus || error) && (
            <Pressable
              onPress={error ? clearError : undefined}
              style={[
                styles.notice,
                {
                  backgroundColor: error ? `${palette.danger}18` : palette.accentSoft,
                  borderBottomColor: palette.border,
                },
              ]}
            >
              <Text numberOfLines={2} style={{ color: error ? palette.danger : palette.text, flex: 1 }}>
                {error || importStatus}
              </Text>
              {error && <MaterialCommunityIcons name="close" size={18} color={palette.danger} />}
            </Pressable>
          )}

          {filter.type === "shelves" ? (
            <ShelfOverview
              books={books}
              shelves={shelves}
              palette={palette}
              columns={layout.gridColumns}
              cardWidth={cardWidth}
              gap={layout.gridGap}
              horizontalPadding={horizontalPadding}
              bottomPadding={layout.navigationVariant === "bottom" ? 94 : 42}
              onOpenShelf={setFilter}
              onCreateShelf={() => setShowCreateShelf(true)}
              onDeleteShelf={deleteShelf}
            />
          ) : (
            <FlatList
              key={`${layout.mode}-${layout.gridColumns}`}
              data={visibleBooks}
              numColumns={layout.gridColumns}
              keyExtractor={(book) => book.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.libraryContent,
                {
                  paddingHorizontal: horizontalPadding,
                  paddingTop: layout.mode === "phone" ? 16 : 26,
                  paddingBottom: layout.navigationVariant === "bottom" ? 94 : 42,
                },
                visibleBooks.length === 0 && styles.emptyContent,
              ]}
              columnWrapperStyle={layout.gridColumns > 1 ? { gap: layout.gridGap } : undefined}
              ItemSeparatorComponent={() => <View style={{ height: layout.mode === "phone" ? 18 : 28 }} />}
              ListHeaderComponent={visibleBooks.length > 0 ? (
                <View style={styles.listHeader}>
                  <Text style={[styles.bookCount, { color: palette.mutedText }]}> 
                    {layout.mode === "phone" ? "" : `${visibleBooks.length} 本书 · 长按书籍可整理`}
                  </Text>
                </View>
              ) : null}
              ListEmptyComponent={(
                <EmptyLibrary
                  palette={palette}
                  isAllBooksEmpty={books.length === 0}
                />
              )}
              renderItem={({ item, index }) => (
                <BookCard
                  book={item}
                  width={cardWidth}
                  palette={palette}
                  compact={compactCards}
                  animationIndex={index}
                  onOpen={() => openBook(item)}
                  onLongPress={() => setActionBookId(item.id)}
                />
              )}
            />
          )}

          {layout.navigationVariant === "bottom" && (
            <BottomNavigation
              filter={filter}
              palette={palette}
              onSelect={setFilter}
              onShowShelves={() => setFilter({ type: "shelves" })}
            />
          )}
        </View>
      </View>

      <CreateShelfModal
        visible={showCreateShelf}
        name={newShelfName}
        palette={palette}
        onChangeName={setNewShelfName}
        onSubmit={submitShelf}
        onClose={() => {
          setNewShelfName("");
          setShowCreateShelf(false);
        }}
      />

      <BookActionsModal
        book={actionBook}
        wide={layout.mode !== "phone"}
        shelves={shelves}
        palette={palette}
        onClose={() => setActionBookId(null)}
        onMove={(shelfId) => {
          if (actionBook) moveBookToShelf(actionBook.id, shelfId);
          setActionBookId(null);
        }}
        onDelete={() => actionBook && confirmDeleteBook(actionBook)}
      />
    </SafeAreaView>
  );
}

function SideNavigation({
  width,
  filter,
  books,
  shelves,
  palette,
  onSelect,
  onCreateShelf,
  onDeleteShelf,
  onCycleTheme,
}: {
  width: number;
  filter: LibraryFilter;
  books: MobileBook[];
  shelves: ReturnType<typeof useLibraryStore.getState>["shelves"];
  palette: Palette;
  onSelect: (filter: LibraryFilter) => void;
  onCreateShelf: () => void;
  onDeleteShelf: (shelfId: string) => void;
  onCycleTheme: () => void;
}) {
  return (
    <GlassSurface
      palette={palette}
      intensity={56}
      style={[
        styles.sideNavigation,
        {
          width,
          borderColor: palette.glassBorder,
          shadowColor: palette.shadow,
        },
      ]}
    >
      <View style={styles.brand}>
        <View style={[styles.brandMark, { backgroundColor: palette.elevated, borderColor: palette.border }]}>
          <MaterialCommunityIcons name="moon-waning-crescent" size={24} color={palette.accent} />
        </View>
        <Text style={[styles.brandName, { color: palette.text }]}>Moon</Text>
      </View>

      <ScrollView contentContainerStyle={styles.sideScroll}>
        <NavigationRow
          icon="bookshelf"
          label="全部书籍"
          count={books.length}
          active={filter.type === "all"}
          palette={palette}
          onPress={() => onSelect({ type: "all" })}
        />
        <NavigationRow
          icon="clock-outline"
          label="最近阅读"
          count={books.filter((book) => book.lastOpenedAt).length}
          active={filter.type === "recent"}
          palette={palette}
          onPress={() => onSelect({ type: "recent" })}
        />
        <NavigationRow
          icon="folder-outline"
          label="书架"
          count={shelves.length + (books.some((book) => !book.shelfId) ? 1 : 0)}
          active={filter.type === "shelves"}
          palette={palette}
          onPress={() => onSelect({ type: "shelves" })}
        />
        <NavigationRow
          icon="folder-outline"
          label="未归档"
          count={books.filter((book) => !book.shelfId).length}
          active={filter.type === "unfiled"}
          palette={palette}
          onPress={() => onSelect({ type: "unfiled" })}
        />

        <View style={styles.sectionTitleRow}>
          <Text style={[styles.sectionTitle, { color: palette.mutedText }]}>书籍文件夹</Text>
          <IconButton
            icon="folder-plus-outline"
            size={19}
            palette={palette}
            accessibilityLabel="新建书架"
            onPress={onCreateShelf}
          />
        </View>
        {shelves.map((shelf) => (
          <NavigationRow
            key={shelf.id}
            icon="folder-outline"
            label={shelf.name}
            count={books.filter((book) => book.shelfId === shelf.id).length}
            active={filter.type === "shelf" && filter.shelfId === shelf.id}
            palette={palette}
            onPress={() => onSelect({ type: "shelf", shelfId: shelf.id })}
            onLongPress={() => Alert.alert("删除书架", `删除“${shelf.name}”？书籍不会被删除。`, [
              { text: "取消", style: "cancel" },
              { text: "删除", style: "destructive", onPress: () => onDeleteShelf(shelf.id) },
            ])}
          />
        ))}
      </ScrollView>

      <Pressable onPress={onCycleTheme} style={[styles.themeRow, { borderTopColor: palette.border }]}>
        <MaterialCommunityIcons name="theme-light-dark" size={21} color={palette.mutedText} />
        <Text style={[styles.themeLabel, { color: palette.mutedText }]}>切换阅读主题</Text>
      </Pressable>
    </GlassSurface>
  );
}

function CompactNavigationRail({
  width,
  filter,
  palette,
  onSelect,
  onShowShelves,
  onCycleTheme,
}: {
  width: number;
  filter: LibraryFilter;
  palette: Palette;
  onSelect: (filter: LibraryFilter) => void;
  onShowShelves: () => void;
  onCycleTheme: () => void;
}) {
  return (
    <GlassSurface
      palette={palette}
      intensity={52}
      style={[
        styles.navigationRail,
        {
          width,
          borderColor: palette.glassBorder,
          shadowColor: palette.shadow,
        },
      ]}
    >
      <View style={[styles.railBrand, { backgroundColor: palette.accentSoft }]}>
        <MaterialCommunityIcons name="moon-waning-crescent" size={23} color={palette.accent} />
      </View>
      <View style={styles.railItems}>
        <RailNavigationItem
          icon="bookshelf"
          label="书库"
          active={filter.type === "all"}
          palette={palette}
          onPress={() => onSelect({ type: "all" })}
        />
        <RailNavigationItem
          icon="clock-outline"
          label="最近"
          active={filter.type === "recent"}
          palette={palette}
          onPress={() => onSelect({ type: "recent" })}
        />
        <RailNavigationItem
          icon="folder-outline"
          label="书架"
          active={filter.type === "shelves" || filter.type === "shelf" || filter.type === "unfiled"}
          palette={palette}
          onPress={onShowShelves}
        />
      </View>
      <RailNavigationItem
        icon="theme-light-dark"
        label="主题"
        active={false}
        palette={palette}
        onPress={onCycleTheme}
      />
    </GlassSurface>
  );
}

function RailNavigationItem({
  icon,
  label,
  active,
  palette,
  onPress,
}: {
  icon: "bookshelf" | "clock-outline" | "folder-outline" | "theme-light-dark";
  label: string;
  active: boolean;
  palette: Palette;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.railItem,
        active && { backgroundColor: palette.accentSoft },
        pressed && styles.pressed,
      ]}
    >
      <MaterialCommunityIcons name={icon} size={21} color={active ? palette.accent : palette.mutedText} />
      <Text style={[styles.railLabel, { color: active ? palette.accent : palette.mutedText }]}>{label}</Text>
    </Pressable>
  );
}

function NavigationRow({
  icon,
  label,
  count,
  active,
  palette,
  onPress,
  onLongPress,
}: {
  icon: "bookshelf" | "clock-outline" | "folder-outline";
  label: string;
  count: number;
  active: boolean;
  palette: Palette;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.navigationRow,
        active && { backgroundColor: palette.glassStrong, borderColor: palette.glassBorder },
        pressed && styles.pressed,
      ]}
    >
      <MaterialCommunityIcons name={icon} size={20} color={active ? palette.accent : palette.mutedText} />
      <Text numberOfLines={1} style={[styles.navigationLabel, { color: active ? palette.accent : palette.text }]}>
        {label}
      </Text>
      <Text style={[styles.navigationCount, { color: active ? palette.accent : palette.mutedText }]}>{count}</Text>
    </Pressable>
  );
}

function BottomNavigation({
  filter,
  palette,
  onSelect,
  onShowShelves,
}: {
  filter: LibraryFilter;
  palette: Palette;
  onSelect: (filter: LibraryFilter) => void;
  onShowShelves: () => void;
}) {
  return (
    <GlassSurface
      palette={palette}
      strong
      intensity={58}
      style={[
        styles.bottomNavigation,
        {
          borderColor: palette.glassBorder,
          shadowColor: palette.shadow,
        },
      ]}
    >
      <BottomNavigationItem
        icon="bookshelf"
        label="书库"
        active={filter.type === "all"}
        palette={palette}
        onPress={() => onSelect({ type: "all" })}
      />
      <BottomNavigationItem
        icon="clock-outline"
        label="最近"
        active={filter.type === "recent"}
        palette={palette}
        onPress={() => onSelect({ type: "recent" })}
      />
      <BottomNavigationItem
        icon="folder-outline"
        label="书架"
        active={filter.type === "shelves" || filter.type === "shelf" || filter.type === "unfiled"}
        palette={palette}
        onPress={onShowShelves}
      />
    </GlassSurface>
  );
}

function BottomNavigationItem({
  icon,
  label,
  active,
  palette,
  onPress,
}: {
  icon: "bookshelf" | "clock-outline" | "folder-outline";
  label: string;
  active: boolean;
  palette: Palette;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.bottomNavigationItem,
        active && { backgroundColor: palette.glassStrong, borderColor: palette.glassBorder },
        pressed && styles.pressed,
      ]}
    >
      <MaterialCommunityIcons name={icon} size={22} color={active ? palette.accent : palette.mutedText} />
      <Text style={[styles.bottomNavigationLabel, { color: active ? palette.accent : palette.mutedText }]}>{label}</Text>
    </Pressable>
  );
}

function EmptyLibrary({
  palette,
  isAllBooksEmpty,
}: {
  palette: Palette;
  isAllBooksEmpty: boolean;
}) {
  return (
    <View style={styles.emptyLibrary}>
      <View style={[styles.emptyIcon, { backgroundColor: palette.accentSoft }]}>
        <MaterialCommunityIcons
          name={isAllBooksEmpty ? "book-plus-outline" : "book-search-outline"}
          size={32}
          color={palette.accent}
        />
      </View>
      <Text style={[styles.emptyTitle, { color: palette.text }]}>
        {isAllBooksEmpty ? "暂无书籍" : "这里还没有书籍"}
      </Text>
      <Text style={[styles.emptyDescription, { color: palette.mutedText }]}>
        {isAllBooksEmpty ? "导入 EPUB 开始阅读" : "换一个书架看看"}
      </Text>
    </View>
  );
}

function ShelfOverview({
  books,
  shelves,
  palette,
  columns,
  cardWidth,
  gap,
  horizontalPadding,
  bottomPadding,
  onOpenShelf,
  onCreateShelf,
  onDeleteShelf,
}: {
  books: MobileBook[];
  shelves: MobileShelf[];
  palette: Palette;
  columns: number;
  cardWidth: number;
  gap: number;
  horizontalPadding: number;
  bottomPadding: number;
  onOpenShelf: (filter: LibraryFilter) => void;
  onCreateShelf: () => void;
  onDeleteShelf: (shelfId: string) => void;
}) {
  const unfiled = books.filter((book) => !book.shelfId);
  const items = [
    ...(unfiled.length > 0 ? [{ id: "unfiled", name: "未归档书籍", books: unfiled, shelfId: null }] : []),
    ...shelves.map((shelf) => ({
      id: shelf.id,
      name: shelf.name,
      books: books.filter((book) => book.shelfId === shelf.id),
      shelfId: shelf.id,
    })),
  ];

  return (
    <FlatList
      key={`shelves-${columns}`}
      data={items}
      numColumns={columns}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.libraryContent,
        {
          paddingHorizontal: horizontalPadding,
          paddingTop: 18,
          paddingBottom: bottomPadding,
        },
        items.length === 0 && styles.emptyContent,
      ]}
      columnWrapperStyle={columns > 1 ? { gap } : undefined}
      ItemSeparatorComponent={() => <View style={{ height: 24 }} />}
      ListHeaderComponent={items.length > 0 ? (
        <View style={styles.listHeader}>
          <Text style={[styles.bookCount, { color: palette.mutedText }]}>{items.length} 个书架</Text>
        </View>
      ) : null}
      ListEmptyComponent={(
        <View style={styles.emptyLibrary}>
          <View style={[styles.emptyIcon, { backgroundColor: palette.accentSoft }]}> 
            <MaterialCommunityIcons name="folder-plus-outline" size={32} color={palette.accent} />
          </View>
          <Text style={[styles.emptyTitle, { color: palette.text }]}>还没有书架</Text>
          <Text style={[styles.emptyDescription, { color: palette.mutedText }]}>新建书架整理你的藏书</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onCreateShelf}
            style={({ pressed }) => [
              styles.emptyShelfButton,
              { borderColor: palette.border },
              pressed && styles.pressed,
            ]}
          >
            <MaterialCommunityIcons name="plus" size={18} color={palette.accent} />
            <Text style={[styles.emptyShelfButtonText, { color: palette.accent }]}>新建书架</Text>
          </Pressable>
        </View>
      )}
      renderItem={({ item }) => (
        <MobileShelfCard
          name={item.name}
          books={item.books}
          width={cardWidth}
          palette={palette}
          onOpen={() => onOpenShelf(item.shelfId
            ? { type: "shelf", shelfId: item.shelfId }
            : { type: "unfiled" })}
          onLongPress={item.shelfId ? () => Alert.alert(
            "删除书架",
            `删除“${item.name}”？书籍会移到未归档。`,
            [
              { text: "取消", style: "cancel" },
              { text: "删除", style: "destructive", onPress: () => onDeleteShelf(item.shelfId!) },
            ],
          ) : undefined}
        />
      )}
    />
  );
}

function MobileShelfCard({
  name,
  books,
  width,
  palette,
  onOpen,
  onLongPress,
}: {
  name: string;
  books: MobileBook[];
  width: number;
  palette: Palette;
  onOpen: () => void;
  onLongPress?: () => void;
}) {
  const cover = books.find((book) => book.coverImage)?.coverImage ?? null;

  return (
    <View style={{ width }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`打开书架 ${name}，${books.length} 本书`}
        onPress={onOpen}
        onLongPress={onLongPress}
        delayLongPress={420}
        style={({ pressed }) => [styles.shelfCard, pressed && styles.pressed]}
      >
        <View
          style={[
            styles.shelfCover,
            { backgroundColor: palette.mutedSurface, borderColor: palette.border, shadowColor: palette.shadow },
          ]}
        >
          {cover ? (
            <Image source={{ uri: cover }} resizeMode="cover" style={styles.shelfCoverImage} />
          ) : (
            <View style={styles.shelfCoverFallback}>
              <MaterialCommunityIcons name="bookshelf" size={38} color={palette.accent} />
            </View>
          )}
          <View pointerEvents="none" style={styles.shelfSpine} />
          <View style={[styles.shelfBadge, { backgroundColor: palette.glassStrong, borderColor: palette.glassBorder }]}> 
            <MaterialCommunityIcons name="folder-outline" size={15} color={palette.accent} />
          </View>
        </View>
        <View style={styles.shelfMetadata}>
          <Text numberOfLines={1} style={[styles.shelfName, { color: palette.text }]}>{name}</Text>
          <Text style={[styles.shelfBookCount, { color: palette.mutedText }]}>{books.length} 本书</Text>
        </View>
      </Pressable>
    </View>
  );
}

function CreateShelfModal({
  visible,
  name,
  palette,
  onChangeName,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  name: string;
  palette: Palette;
  onChangeName: (name: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.centeredModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <GlassSurface
          palette={palette}
          strong
          intensity={62}
          style={[styles.dialog, { borderColor: palette.glassBorder, shadowColor: palette.shadow }]}
        >
          <Text style={[styles.dialogTitle, { color: palette.text }]}>新建书架</Text>
          <TextInput
            autoFocus
            value={name}
            onChangeText={onChangeName}
            onSubmitEditing={onSubmit}
            placeholder="例如：通勤阅读"
            placeholderTextColor={palette.mutedText}
            selectionColor={palette.accent}
            style={[
              styles.dialogInput,
              { color: palette.text, backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          />
          <View style={styles.dialogActions}>
            <Pressable onPress={onClose} style={styles.dialogAction}>
              <Text style={{ color: palette.mutedText, fontWeight: "700" }}>取消</Text>
            </Pressable>
            <Pressable onPress={onSubmit} style={[styles.dialogAction, { backgroundColor: palette.accent }]}>
              <Text style={{ color: palette.onAccent, fontWeight: "700" }}>创建</Text>
            </Pressable>
          </View>
        </GlassSurface>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function BookActionsModal({
  book,
  wide,
  shelves,
  palette,
  onClose,
  onMove,
  onDelete,
}: {
  book: MobileBook | null;
  wide: boolean;
  shelves: ReturnType<typeof useLibraryStore.getState>["shelves"];
  palette: Palette;
  onClose: () => void;
  onMove: (shelfId: string | null) => void;
  onDelete: () => void;
}) {
  return (
    <Modal transparent animationType="slide" visible={Boolean(book)} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <GlassSurface
        palette={palette}
        strong
        intensity={60}
        style={[
          styles.sheet,
          wide && styles.floatingSheet,
          { borderColor: palette.glassBorder, shadowColor: palette.shadow },
        ]}
      >
        <View style={styles.sheetHandle} />
        <Text numberOfLines={2} style={[styles.sheetTitle, styles.actionTitle, { color: palette.text }]}>
          {book?.title}
        </Text>
        <Text style={[styles.actionCaption, { color: palette.mutedText }]}>移动到书架</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelfChips}>
          <Pressable onPress={() => onMove(null)} style={[styles.shelfChip, { backgroundColor: palette.surface }]}>
            <Text style={{ color: palette.text }}>未归档</Text>
          </Pressable>
          {shelves.map((shelf) => (
            <Pressable
              key={shelf.id}
              onPress={() => onMove(shelf.id)}
              style={[styles.shelfChip, { backgroundColor: palette.surface }]}
            >
              <Text style={{ color: palette.text }}>{shelf.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable onPress={onDelete} style={[styles.deleteAction, { borderTopColor: palette.border }]}>
          <MaterialCommunityIcons name="trash-can-outline" size={21} color={palette.danger} />
          <Text style={{ color: palette.danger, fontWeight: "700" }}>从设备删除</Text>
        </Pressable>
      </GlassSurface>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, overflow: "hidden" },
  workspace: { flex: 1, flexDirection: "row" },
  floatingWorkspace: { gap: 10, padding: 10 },
  canvas: { flex: 1, overflow: "hidden" },
  phoneCanvas: { backgroundColor: "transparent" },
  floatingCanvas: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    elevation: 4,
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  sideNavigation: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    elevation: 4,
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  navigationRail: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 6,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    elevation: 4,
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  railBrand: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  railItems: { flex: 1, justifyContent: "center", gap: 4 },
  railItem: { width: 58, minHeight: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 2 },
  railLabel: { fontSize: 9, lineHeight: 12, fontWeight: "700" },
  brand: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 20 },
  brandMark: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  brandName: { fontSize: 17, fontWeight: "800" },
  sideScroll: { paddingHorizontal: 10, paddingBottom: 20 },
  navigationRow: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: "transparent", borderRadius: 13 },
  navigationLabel: { flex: 1, fontSize: 13, fontWeight: "600" },
  navigationCount: { fontSize: 11, fontVariant: ["tabular-nums"] },
  sectionTitleRow: { minHeight: 54, marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 12 },
  sectionTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" },
  themeRow: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, borderTopWidth: StyleSheet.hairlineWidth },
  themeLabel: { fontSize: 12, fontWeight: "600" },
  header: { minHeight: 76, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  phoneHeader: {
    marginTop: 5,
    marginHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    elevation: 2,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  headerText: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 10, lineHeight: 14, fontWeight: "800", letterSpacing: 1.4 },
  heading: { marginTop: 2, fontSize: 22, lineHeight: 28, fontWeight: "800", letterSpacing: -0.45 },
  phoneHeading: { marginTop: 0, fontSize: 18, lineHeight: 23, letterSpacing: -0.25 },
  headerMeta: { marginTop: 1, fontSize: 10.5, lineHeight: 14, fontWeight: "600" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 5 },
  importButton: { height: 40, minWidth: 84, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 12 },
  importLabel: { fontSize: 13, fontWeight: "800" },
  notice: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  libraryContent: { flexGrow: 1 },
  emptyContent: { justifyContent: "center" },
  listHeader: { minHeight: 30, justifyContent: "flex-start", paddingTop: 1, paddingBottom: 12 },
  bookCount: { fontSize: 12 },
  emptyLibrary: { alignItems: "center", paddingHorizontal: 30, paddingVertical: 36 },
  emptyIcon: { width: 66, height: 66, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  emptyTitle: { marginTop: 18, fontSize: 18, fontWeight: "800", textAlign: "center" },
  emptyDescription: { maxWidth: 300, marginTop: 7, fontSize: 13, lineHeight: 19, textAlign: "center" },
  emptyShelfButton: { minHeight: 42, marginTop: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 16, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13 },
  emptyShelfButtonText: { fontSize: 13, fontWeight: "800" },
  shelfCard: { width: "100%" },
  shelfCover: {
    width: "100%",
    aspectRatio: 0.75,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    borderTopRightRadius: 13,
    borderBottomRightRadius: 13,
    elevation: 3,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
  },
  shelfCoverImage: { width: "100%", height: "100%" },
  shelfCoverFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  shelfSpine: { position: "absolute", top: 0, bottom: 0, left: 0, width: 6, backgroundColor: "#0000001C", borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: "#FFFFFF33" },
  shelfBadge: { position: "absolute", top: 8, right: 8, width: 32, height: 32, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderRadius: 11 },
  shelfMetadata: { minHeight: 54, paddingTop: 10, paddingHorizontal: 1 },
  shelfName: { fontSize: 14, lineHeight: 19, fontWeight: "700" },
  shelfBookCount: { marginTop: 3, fontSize: 11.5, lineHeight: 16 },
  bottomNavigation: { position: "absolute", right: 10, bottom: 7, left: 10, height: 58, flexDirection: "row", gap: 4, padding: 4, borderRadius: 19, borderWidth: StyleSheet.hairlineWidth, elevation: 7, shadowOpacity: 0.09, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  bottomNavigationItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: "transparent", borderRadius: 15 },
  bottomNavigationLabel: { fontSize: 10, fontWeight: "700" },
  pressed: { opacity: 0.65, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.55 },
  modalBackdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "#11141173" },
  sheet: { position: "absolute", right: 0, bottom: 0, left: 0, maxHeight: "72%", overflow: "hidden", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, paddingBottom: 24, elevation: 12, shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: -8 } },
  floatingSheet: { left: undefined, right: 24, bottom: 24, width: 420, maxHeight: "82%", borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: "hidden" },
  sheetHandle: { alignSelf: "center", width: 42, height: 5, marginTop: 10, marginBottom: 6, borderRadius: 3, backgroundColor: "#8D918B66" },
  sheetTitle: { fontSize: 19, fontWeight: "800" },
  centeredModal: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  dialog: { width: "100%", maxWidth: 420, overflow: "hidden", borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 20, elevation: 12, shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } },
  dialogTitle: { fontSize: 19, fontWeight: "800" },
  dialogInput: { height: 48, marginTop: 18, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, paddingHorizontal: 14, fontSize: 15 },
  dialogActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 18 },
  dialogAction: { minWidth: 80, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  actionTitle: { paddingHorizontal: 20, paddingTop: 12 },
  actionCaption: { marginTop: 22, paddingHorizontal: 20, fontSize: 12, fontWeight: "700" },
  shelfChips: { gap: 9, paddingHorizontal: 20, paddingVertical: 14 },
  shelfChip: { minHeight: 42, borderRadius: 13, justifyContent: "center", paddingHorizontal: 16 },
  deleteAction: { minHeight: 58, marginTop: 6, paddingHorizontal: 20, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 10 },
});
