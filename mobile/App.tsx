import "react-native-gesture-handler";

import { ReaderProvider } from "@epubjs-react-native/core";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LibraryScreen } from "./src/screens/LibraryScreen";
import { ReaderScreen } from "./src/screens/ReaderScreen";
import { useLibraryStore } from "./src/store/useLibraryStore";
import { getPalette } from "./src/theme";

export default function App() {
  const { books, theme, isHydrated, refreshLibraryMetadata } = useLibraryStore();
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const activeBook = books.find((book) => book.id === activeBookId) ?? null;
  const palette = getPalette(theme);
  const screenTransition = useRef(new Animated.Value(0)).current;
  const launchLogoProgress = useRef(new Animated.Value(0)).current;
  const launchScreenOpacity = useRef(new Animated.Value(1)).current;
  const [showLaunchScreen, setShowLaunchScreen] = useState(true);
  const screenKey = activeBook?.id ?? "library";

  useEffect(() => {
    if (isHydrated) void refreshLibraryMetadata();
  }, [isHydrated, refreshLibraryMetadata]);

  useEffect(() => {
    screenTransition.stopAnimation();
    screenTransition.setValue(0);
    Animated.timing(screenTransition, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [screenKey, screenTransition]);

  useEffect(() => {
    const logoAnimation = Animated.timing(launchLogoProgress, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    logoAnimation.start();
    return () => logoAnimation.stop();
  }, [launchLogoProgress]);

  useEffect(() => {
    if (!isHydrated) return;

    const hideAnimation = Animated.sequence([
      Animated.delay(510),
      Animated.timing(launchScreenOpacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    hideAnimation.start(({ finished }) => {
      if (finished) setShowLaunchScreen(false);
    });
    return () => hideAnimation.stop();
  }, [isHydrated, launchScreenOpacity]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ReaderProvider>
          <StatusBar style={theme === "dark" ? "light" : "dark"} />
          <Animated.View
            style={[
              styles.screen,
              {
                backgroundColor: palette.background,
                opacity: screenTransition,
                transform: [
                  {
                    translateY: screenTransition.interpolate({
                      inputRange: [0, 1],
                      outputRange: [8, 0],
                    }),
                  },
                  {
                    scale: screenTransition.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.992, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            {!isHydrated ? (
              <View style={[styles.loading, { backgroundColor: palette.background }]}>
                <ActivityIndicator color={palette.accent} />
                <Text style={[styles.loadingText, { color: palette.mutedText }]}>正在载入书库…</Text>
              </View>
            ) : activeBook ? (
              <ReaderScreen book={activeBook} onClose={() => setActiveBookId(null)} />
            ) : (
              <LibraryScreen onOpenBook={setActiveBookId} />
            )}
          </Animated.View>
          {showLaunchScreen && (
            <Animated.View
              pointerEvents="auto"
              style={[
                styles.launchScreen,
                {
                  backgroundColor: palette.background,
                  opacity: launchScreenOpacity,
                },
              ]}
            >
              <Animated.View
                style={[
                  styles.launchMark,
                  {
                    opacity: launchLogoProgress,
                    transform: [
                      {
                        translateY: launchLogoProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [10, 0],
                        }),
                      },
                      {
                        scale: launchLogoProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.88, 1],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <View style={[styles.launchGlow, { backgroundColor: palette.accentSoft }]} />
                <Image
                  accessibilityIgnoresInvertColors
                  source={require("./assets/icon.png")}
                  style={styles.launchIcon}
                />
              </Animated.View>
            </Animated.View>
          )}
        </ReaderProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  screen: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 13 },
  launchScreen: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  launchMark: {
    alignItems: "center",
    justifyContent: "center",
  },
  launchGlow: {
    position: "absolute",
    top: -18,
    width: 148,
    height: 148,
    borderRadius: 74,
    opacity: 0.55,
  },
  launchIcon: {
    width: 112,
    height: 112,
  },
});
