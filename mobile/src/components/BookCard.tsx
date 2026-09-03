import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { Palette } from "../theme";
import type { MobileBook } from "../types";

interface BookCardProps {
  book: MobileBook;
  width: number;
  palette: Palette;
  compact?: boolean;
  animationIndex?: number;
  onOpen: () => void;
  onLongPress: () => void;
}

export function BookCard({
  book,
  width,
  palette,
  compact = false,
  animationIndex = 0,
  onOpen,
  onLongPress,
}: BookCardProps) {
  const progressLabel = `${Math.round(book.progress * 100)}%`;
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    entrance.setValue(0);
    Animated.timing(entrance, {
      toValue: 1,
      duration: 260,
      delay: Math.min(animationIndex, 8) * 32,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [animationIndex, entrance]);

  return (
    <Animated.View
      style={{
        width,
        opacity: entrance,
        transform: [{
          translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
        }],
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`打开《${book.title}》，已读 ${progressLabel}`}
        onPress={onOpen}
        onLongPress={onLongPress}
        delayLongPress={360}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <View
          style={[
            styles.cover,
            {
              backgroundColor: palette.mutedSurface,
              borderColor: palette.border,
              shadowColor: palette.shadow,
            },
            compact && styles.compactCover,
          ]}
        >
          {book.coverImage ? (
            <Image source={{ uri: book.coverImage }} resizeMode="cover" style={styles.coverImage} />
          ) : (
            <View style={styles.coverFallback}>
              <MaterialCommunityIcons name="book-open-page-variant-outline" size={34} color={palette.accent} />
              <Text numberOfLines={4} style={[styles.fallbackTitle, { color: palette.text }]}>
                {book.title}
              </Text>
            </View>
          )}
          <View pointerEvents="none" style={styles.bookSpine} />
          {book.progress > 0 && (
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressValue,
                  { width: `${book.progress * 100}%`, backgroundColor: palette.accent },
                ]}
              />
            </View>
          )}
        </View>
        <View style={[styles.metadata, compact && styles.compactMetadata]}>
          <Text
            numberOfLines={2}
            style={[styles.title, compact && styles.compactTitle, { color: palette.text }]}
          >
            {book.title}
          </Text>
          <Text numberOfLines={1} style={[styles.author, compact && styles.compactAuthor, { color: palette.mutedText }]}>
            {book.author || "未知作者"}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { width: "100%", flexShrink: 0 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.985 }] },
  cover: {
    width: "100%",
    aspectRatio: 0.75,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    borderTopRightRadius: 13,
    borderBottomRightRadius: 13,
    elevation: 3,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
  },
  compactCover: { borderTopLeftRadius: 5, borderBottomLeftRadius: 5, borderTopRightRadius: 10, borderBottomRightRadius: 10 },
  coverImage: { width: "100%", height: "100%" },
  bookSpine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 6,
    backgroundColor: "#0000001C",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "#FFFFFF33",
  },
  coverFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 14,
  },
  fallbackTitle: {
    fontFamily: "serif",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  progressTrack: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    height: 4,
    backgroundColor: "#00000020",
  },
  progressValue: { height: "100%" },
  metadata: { minHeight: 56, paddingTop: 11 },
  compactMetadata: { minHeight: 51, paddingTop: 8 },
  title: { fontSize: 14, lineHeight: 19, fontWeight: "700" },
  compactTitle: { fontSize: 12, lineHeight: 16, fontWeight: "700" },
  author: { marginTop: 3, fontSize: 12, lineHeight: 17 },
  compactAuthor: { marginTop: 2, fontSize: 10.5, lineHeight: 15 },
});
