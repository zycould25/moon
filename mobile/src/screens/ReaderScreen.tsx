import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  Reader,
  useReader,
  type Location,
  type Section,
} from "@epubjs-react-native/core";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  cancelAnimation,
  Easing as ReanimatedEasing,
  runOnJS,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { captureRef, releaseCapture } from "react-native-view-shot";
import { prepareEpubForReading } from "../../modules/moon-epub";
import { AmbientBackground } from "../components/AmbientBackground";
import { GlassSurface } from "../components/GlassSurface";
import { IconButton } from "../components/IconButton";
import { PageCurlSurface } from "../components/PageCurlSurface";
import { useEpubFileSystem } from "../hooks/useEpubFileSystem";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { getCachedLocations, setCachedLocations } from "../services/readerCache";
import { useLibraryStore } from "../store/useLibraryStore";
import { getPalette, getReaderTheme, type Palette } from "../theme";
import type { MobileBook, NovelReadingFlow } from "../types";

type ReaderPanel = "toc" | "bookmarks" | "settings" | null;
type PageTurnDirection = "previous" | "next";

function clampProgress(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function normalizeStoredProgress(value: number): number {
  return clampProgress(value > 1 ? value / 100 : value);
}

interface ReaderScreenProps {
  book: MobileBook;
  onClose: () => void;
}

const generateLocationsInBackground = `
  (function () {
    if (window.__moonLocationsStarted) return true;
    window.__moonLocationsStarted = true;
    setTimeout(function () {
      book.locations.generate(3000).then(function () {
        var currentLocation = rendition.currentLocation();
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "onLocationsReady",
          epubKey: book.key(),
          locations: book.locations.save(),
          totalLocations: book.locations.total,
          currentLocation: currentLocation,
          progress: currentLocation
            ? book.locations.percentageFromCfi(currentLocation.start.cfi)
            : 0
        }));
      }).catch(function () {});
    }, 1200);
    return true;
  })();
`;

export function ReaderScreen({ book, onClose }: ReaderScreenProps) {
  const layout = useResponsiveLayout();
  const {
    goPrevious,
    goNext,
    injectJavascript,
    getMeta,
    getCurrentLocation,
    changeTheme,
    changeFontSize,
    atStart,
    atEnd,
    toc,
    section,
    isBookmarked,
  } = useReader();
  const {
    theme,
    fontSize,
    novelReadingFlow,
    updateBookMetadata,
    updateReadingProgress,
    addBookmark,
    removeBookmark,
    cycleTheme,
    setFontSize,
    setNovelReadingFlow,
  } = useLibraryStore();
  const palette = getPalette(theme);
  const [panel, setPanel] = useState<ReaderPanel>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFullscreenHint, setShowFullscreenHint] = useState(false);
  const [displayError, setDisplayError] = useState<string | null>(null);
  const [cachedLocations, setLocationsCache] = useState<string | null | undefined>(undefined);
  const [readerSource, setReaderSource] = useState<string | undefined>(undefined);
  const pendingProgress = useRef<{
    cfi: string;
    progress: number;
    chapter: string;
  } | null>(null);
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelNavigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fullscreenHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flowSwitchLocation = useRef<string | null>(null);
  const pageTurnInFlight = useRef(false);
  const pageGestureActive = useRef(false);
  const gestureDirection = useRef<PageTurnDirection | null>(null);
  const pageGestureStartX = useRef(0);
  const readerStageWidth = useRef(1);
  const readerStageHeight = useRef(1);
  const readerCaptureRef = useRef<View>(null);
  const cachedPageSnapshotRef = useRef<string | null>(null);
  const activePageSnapshotRef = useRef<string | null>(null);
  const curlTextureReadyUriRef = useRef<string | null>(null);
  const preNavigatedDirection = useRef<PageTurnDirection | null>(null);
  const navigationDispatched = useRef(false);
  const snapshotCaptureInFlight = useRef(false);
  const snapshotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const curlProgress = useSharedValue(0);
  const curlCorner = useSharedValue(0);
  const [pageCurlDirection, setPageCurlDirection] = useState<PageTurnDirection>("next");
  const [cachedPageSnapshot, setCachedPageSnapshot] = useState<string | null>(null);
  const [activePageSnapshot, setActivePageSnapshot] = useState<string | null>(null);
  const [readerStageSize, setReaderStageSize] = useState({ width: 1, height: 1 });
  const [readingProgress, setReadingProgress] = useState(() => normalizeStoredProgress(book.progress));
  const readerTheme = useMemo(
    () => getReaderTheme(
      theme,
      book.renditionLayout === "fixed",
      layout.mode === "phone" && layout.isLandscape,
    ),
    [book.renditionLayout, layout.isLandscape, layout.mode, theme],
  );
  const effectiveReadingFlow: NovelReadingFlow = book.renditionLayout === "fixed"
    ? "paginated"
    : novelReadingFlow || "paginated";
  const usesCompactReaderChrome = layout.mode === "phone";

  useEffect(() => {
    setReadingProgress(normalizeStoredProgress(book.progress));
    setIsFullscreen(false);
    flowSwitchLocation.current = null;
  }, [book.id]);

  useEffect(() => {
    let cancelled = false;
    setLocationsCache(undefined);
    void getCachedLocations(book.id).then((locations) => {
      if (!cancelled) setLocationsCache(locations);
    });
    return () => {
      cancelled = true;
    };
  }, [book.id]);

  useEffect(() => {
    let cancelled = false;
    setReaderSource(undefined);
    setDisplayError(null);
    if (book.renditionLayout !== "fixed") {
      setReaderSource(book.fileUri);
      return () => {
        cancelled = true;
      };
    }

    void prepareEpubForReading(book.fileUri, book.id)
      .then((source) => {
        if (!cancelled) setReaderSource(source || book.fileUri);
      })
      .catch((reason) => {
        if (!cancelled) {
          setDisplayError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [book.fileUri, book.id, book.renditionLayout]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (panel) {
        setPanel(null);
        return true;
      }
      if (isFullscreen) {
        setIsFullscreen(false);
        return true;
      }
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [isFullscreen, onClose, panel]);

  useEffect(() => {
    changeTheme(readerTheme);
  }, [changeTheme, readerTheme]);

  useEffect(() => {
    changeFontSize(`${fontSize}%`);
  }, [changeFontSize, fontSize]);

  const syncMetadata = useCallback(() => {
    const metadata = getMeta();
    const coverImage = book.coverImage || (
      typeof metadata.cover === "string" && metadata.cover.length < 1_500_000
        ? metadata.cover
        : undefined
    );
    updateBookMetadata(book.id, {
      title: metadata.title,
      author: metadata.author,
      coverImage,
    });
  }, [book.coverImage, book.id, getMeta, updateBookMetadata]);

  const flushReadingProgress = useCallback(() => {
    if (!pendingProgress.current) return;
    const next = pendingProgress.current;
    pendingProgress.current = null;
    progressTimer.current = null;
    updateReadingProgress(book.id, next.cfi, next.progress, next.chapter);
  }, [book.id, updateReadingProgress]);

  useEffect(() => () => {
    if (progressTimer.current) clearTimeout(progressTimer.current);
    if (panelNavigationTimer.current) clearTimeout(panelNavigationTimer.current);
    if (fullscreenHintTimer.current) clearTimeout(fullscreenHintTimer.current);
    flushReadingProgress();
  }, [flushReadingProgress]);

  const handleLocationChange = useCallback((
    _totalLocations: number,
    location: Location,
    nextProgress: number,
    currentSection: Section | null,
  ) => {
    const normalizedProgress = clampProgress(book.renditionLayout === "fixed" && (book.pageCount ?? 0) > 1
      ? location.start.index / ((book.pageCount ?? 1) - 1)
      : Number.isFinite(nextProgress)
        // @epubjs-react-native/core 1.4.x emits an integer percentage on
        // `relocated` (1 means 1%, not 100%).
        ? nextProgress / 100
        : 0);
    setReadingProgress(normalizedProgress);
    pendingProgress.current = {
      cfi: location.start.cfi,
      progress: normalizedProgress,
      chapter: currentSection?.label ?? "",
    };
    if (!progressTimer.current) progressTimer.current = setTimeout(flushReadingProgress, 500);
  }, [book.pageCount, book.renditionLayout, flushReadingProgress]);

  const toggleBookmark = () => {
    const currentLocation = getCurrentLocation();
    if (!currentLocation) return;
    const existing = book.bookmarks.find((bookmark) => bookmark.cfi === currentLocation.start.cfi);
    if (existing) removeBookmark(book.id, existing.id);
    else addBookmark(book.id, currentLocation.start.cfi, section?.label ?? book.currentChapter);
  };

  const showPanel = (nextPanel: Exclude<ReaderPanel, null>) => {
    setPanel((current) => current === nextPanel ? null : nextPanel);
  };

  const setCurlDirection = useCallback((direction: PageTurnDirection) => {
    setPageCurlDirection(direction);
  }, []);

  const navigateOnePage = useCallback((direction: PageTurnDirection) => {
    if (direction === "next") goNext();
    else goPrevious();
  }, [goNext, goPrevious]);

  const captureCurrentPage = useCallback(async () => {
    if (
      !readerCaptureRef.current
      || snapshotCaptureInFlight.current
      || pageGestureActive.current
      || pageTurnInFlight.current
    ) return;

    snapshotCaptureInFlight.current = true;
    try {
      const uri = await captureRef(readerCaptureRef, {
        format: "jpg",
        quality: 0.88,
        result: "tmpfile",
      });
      if (pageGestureActive.current || pageTurnInFlight.current) {
        releaseCapture(uri);
        return;
      }
      const previous = cachedPageSnapshotRef.current;
      curlTextureReadyUriRef.current = null;
      cachedPageSnapshotRef.current = uri;
      setCachedPageSnapshot(uri);
      if (previous && previous !== activePageSnapshotRef.current) releaseCapture(previous);
    } catch {
      // Some vendor WebViews refuse snapshots; navigation still falls back to a direct turn.
    } finally {
      snapshotCaptureInFlight.current = false;
    }
  }, []);

  const schedulePageSnapshot = useCallback((delay = 180) => {
    if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
    snapshotTimer.current = setTimeout(() => {
      snapshotTimer.current = null;
      void captureCurrentPage();
    }, delay);
  }, [captureCurrentPage]);

  const navigateToReaderLocation = useCallback((target: string) => {
    const normalizedTarget = target.trim();
    if (!normalizedTarget) return;

    pageGestureActive.current = false;
    gestureDirection.current = null;
    preNavigatedDirection.current = null;
    navigationDispatched.current = false;
    pageTurnInFlight.current = false;
    cancelAnimation(curlProgress);
    curlProgress.value = 0;
    activePageSnapshotRef.current = null;
    setActivePageSnapshot(null);

    // Navigation hrefs and spine hrefs are not consistently rooted by epub.js
    // for archive-backed books. Resolve the TOC href against the live spine and
    // display its numeric index, which is stable for both EPUB 2 and EPUB 3.
    injectJavascript(`
      (function (target) {
        var send = function (payload) {
          var bridge = window.ReactNativeWebView || window;
          bridge.postMessage(JSON.stringify(payload));
        };
        var cleanPath = function (value) {
          var path = String(value || '').split('#')[0];
          try { path = decodeURI(path); } catch (_) {}
          return path.replace(/\\\\/g, '/').replace(/^\\.\\//, '').replace(/^\\//, '');
        };

        try {
          var wanted = cleanPath(target);
          var items = book && book.spine ? book.spine.spineItems : [];
          var section = null;
          try { section = book.spine.get(target); } catch (_) {}
          if (!section) {
            section = items.find(function (item) {
              var href = cleanPath(item && item.href);
              return href === wanted
                || href.endsWith('/' + wanted)
                || wanted.endsWith('/' + href);
            }) || null;
          }

          var isCfi = /^epubcfi\\(/.test(target);
          var destination = isCfi ? target : section ? section.index : target;
          Promise.resolve(rendition.display(destination)).then(function () {
            send({
              type: 'moonNavigationResult',
              ok: true,
              target: target,
              destination: destination,
              href: section && section.href
            });
          }).catch(function (error) {
            send({
              type: 'moonNavigationResult',
              ok: false,
              target: target,
              destination: destination,
              reason: String(error && (error.message || error))
            });
          });
        } catch (error) {
          send({
            type: 'moonNavigationResult',
            ok: false,
            target: target,
            reason: String(error && (error.message || error))
          });
        }
      })(${JSON.stringify(normalizedTarget)});
      true;
    `);
    schedulePageSnapshot(300);
  }, [curlProgress, injectJavascript, schedulePageSnapshot]);

  const handleReaderWebViewMessage = useCallback((event: unknown) => {
    if (!event || typeof event !== "object" || !("type" in event)) return;
    const message = event as { type?: string; ok?: boolean; reason?: string; target?: string };
    if (message.type === "moonNavigationResult" && !message.ok) {
      console.warn("Moon EPUB navigation failed", message.target, message.reason);
    }
  }, []);

  const navigateFromModal = useCallback((target: string) => {
    setPanel(null);
    if (panelNavigationTimer.current) clearTimeout(panelNavigationTimer.current);
    // Let Android dismiss the native Modal before talking to the WebView.
    panelNavigationTimer.current = setTimeout(() => {
      panelNavigationTimer.current = null;
      navigateToReaderLocation(target);
    }, 180);
  }, [navigateToReaderLocation]);

  const updateReadingFlow = useCallback((nextFlow: NovelReadingFlow) => {
    if (book.renditionLayout === "fixed" || nextFlow === effectiveReadingFlow) return;
    flowSwitchLocation.current = getCurrentLocation()?.start.cfi || book.currentCfi || null;
    setNovelReadingFlow(nextFlow);
  }, [
    book.currentCfi,
    book.renditionLayout,
    effectiveReadingFlow,
    getCurrentLocation,
    setNovelReadingFlow,
  ]);

  const enterFullscreen = useCallback(() => {
    setPanel(null);
    setIsFullscreen(true);
    setShowFullscreenHint(true);
    if (fullscreenHintTimer.current) clearTimeout(fullscreenHintTimer.current);
    fullscreenHintTimer.current = setTimeout(() => {
      fullscreenHintTimer.current = null;
      setShowFullscreenHint(false);
    }, 1800);
  }, []);

  const exitFullscreen = useCallback(() => {
    setIsFullscreen(false);
    setShowFullscreenHint(false);
    if (fullscreenHintTimer.current) {
      clearTimeout(fullscreenHintTimer.current);
      fullscreenHintTimer.current = null;
    }
  }, []);

  const exitFullscreenGesture = useMemo(() => Gesture.LongPress()
    .enabled(isFullscreen)
    .minDuration(650)
    .maxDistance(18)
    .onStart(({ x, y }) => {
      const insideHorizontalCenter = x >= readerStageWidth.current * 0.25
        && x <= readerStageWidth.current * 0.75;
      const insideVerticalCenter = y >= readerStageHeight.current * 0.25
        && y <= readerStageHeight.current * 0.75;
      if (insideHorizontalCenter && insideVerticalCenter) exitFullscreen();
    })
    .runOnJS(true), [exitFullscreen, isFullscreen]);

  useEffect(() => () => {
    if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
    const snapshots = new Set([
      cachedPageSnapshotRef.current,
      activePageSnapshotRef.current,
    ]);
    snapshots.forEach((uri) => {
      if (uri) releaseCapture(uri);
    });
  }, []);

  const handleCurlTextureReady = useCallback((uri: string, ready: boolean) => {
    if (ready) {
      curlTextureReadyUriRef.current = uri;
    } else if (curlTextureReadyUriRef.current === uri) {
      curlTextureReadyUriRef.current = null;
    }
  }, []);

  const prepareSnapshotTurn = useCallback((
    direction: PageTurnDirection,
    curlDirection: PageTurnDirection = direction,
  ) => {
    const snapshot = cachedPageSnapshotRef.current;
    if (
      !snapshot
      || curlTextureReadyUriRef.current !== snapshot
      || preNavigatedDirection.current
    ) return false;

    setCurlDirection(curlDirection);
    preNavigatedDirection.current = direction;
    navigationDispatched.current = false;
    activePageSnapshotRef.current = snapshot;
    setActivePageSnapshot(snapshot);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (preNavigatedDirection.current !== direction || navigationDispatched.current) return;
        navigateOnePage(direction);
        navigationDispatched.current = true;
      });
    });
    return true;
  }, [navigateOnePage, setCurlDirection]);

  const clearCompletedPageTurn = useCallback(() => {
    activePageSnapshotRef.current = null;
    preNavigatedDirection.current = null;
    navigationDispatched.current = false;
    pageGestureActive.current = false;
    gestureDirection.current = null;
    cancelAnimation(curlProgress);
    curlProgress.value = 0;
    setActivePageSnapshot(null);
    pageTurnInFlight.current = false;
    schedulePageSnapshot(140);
  }, [curlProgress, schedulePageSnapshot]);

  const finishCancelledPageTurn = useCallback((
    direction: PageTurnDirection | null,
    shouldRestoreLocation: boolean,
  ) => {
    if (shouldRestoreLocation && direction) {
      navigateOnePage(direction === "next" ? "previous" : "next");
    }
    if (activePageSnapshotRef.current) {
      setTimeout(clearCompletedPageTurn, shouldRestoreLocation ? 110 : 0);
    } else {
      pageTurnInFlight.current = false;
    }
  }, [clearCompletedPageTurn, navigateOnePage]);

  const completePageTurn = useCallback((
    direction: PageTurnDirection,
    velocity = 0,
    curlDirection: PageTurnDirection = direction,
  ) => {
    if (pageTurnInFlight.current) return;
    pageTurnInFlight.current = true;
    pageGestureActive.current = false;
    gestureDirection.current = null;
    setCurlDirection(curlDirection);
    const usesSnapshot = preNavigatedDirection.current === direction
      || prepareSnapshotTurn(direction, curlDirection);
    cancelAnimation(curlProgress);

    if (!usesSnapshot) {
      navigateOnePage(direction);
      pageTurnInFlight.current = false;
      schedulePageSnapshot(220);
      return;
    }

    const animate = () => {
      if (!navigationDispatched.current) {
        navigateOnePage(direction);
        navigationDispatched.current = true;
      }
      const remaining = Math.max(0.08, 1 - curlProgress.value);
      const duration = Math.max(
        170,
        Math.min(390, (410 - Math.abs(velocity) / 9) * remaining + 70),
      );
      curlProgress.value = withTiming(
        1,
        {
          duration,
          easing: ReanimatedEasing.bezier(0.18, 0.74, 0.2, 1),
        },
        (finished) => {
          if (finished) runOnJS(clearCompletedPageTurn)();
        },
      );
    };
    if (activePageSnapshotRef.current !== activePageSnapshot) {
      setTimeout(animate, 28);
    } else {
      animate();
    }
  }, [
    activePageSnapshot,
    clearCompletedPageTurn,
    curlProgress,
    navigateOnePage,
    prepareSnapshotTurn,
    schedulePageSnapshot,
    setCurlDirection,
  ]);

  const cancelPageTurn = useCallback(() => {
    pageGestureActive.current = false;
    gestureDirection.current = null;
    const direction = preNavigatedDirection.current;
    const shouldRestoreLocation = Boolean(direction && navigationDispatched.current);
    preNavigatedDirection.current = null;
    pageTurnInFlight.current = Boolean(activePageSnapshotRef.current);
    cancelAnimation(curlProgress);
    curlProgress.value = withSpring(0, {
      stiffness: 260,
      damping: 24,
      mass: 0.72,
      overshootClamping: true,
    }, (finished) => {
      if (finished) {
        runOnJS(finishCancelledPageTurn)(direction, shouldRestoreLocation);
      }
    });
  }, [curlProgress, finishCancelledPageTurn]);

  const beginPageGesture = useCallback((absoluteX: number) => {
    pageGestureStartX.current = absoluteX;
    gestureDirection.current = null;
  }, []);

  const updatePageGesture = useCallback((absoluteX: number, pointerY: number) => {
    if (pageTurnInFlight.current) return;
    const displacementX = absoluteX - pageGestureStartX.current;
    if (Math.abs(displacementX) < 1) return;
    if (!gestureDirection.current) {
      const direction: PageTurnDirection = displacementX < 0 ? "next" : "previous";
      gestureDirection.current = direction;
      // epub.js may report atStart/atEnd one relocation late. Let rendition
      // reject a real boundary instead of swallowing the opposite swipe here.
      pageGestureActive.current = true;
      setCurlDirection(direction);
      curlCorner.value = pointerY < readerStageHeight.current / 2 ? 0 : 1;
      prepareSnapshotTurn(direction, direction);
    }
    const travel = Math.max(1, readerStageWidth.current * 0.72);
    const rawProgress = Math.max(0, Math.min(0.985, Math.abs(displacementX) / travel));
    curlProgress.value = rawProgress;
  }, [curlCorner, curlProgress, prepareSnapshotTurn, setCurlDirection]);

  const finishPageGesture = useCallback((absoluteX: number, velocityX: number) => {
    if (pageTurnInFlight.current) return;
    const displacementX = absoluteX - pageGestureStartX.current;
    const signedMotion = Math.abs(displacementX) >= 6 ? displacementX : velocityX;
    const direction = gestureDirection.current ?? (signedMotion < 0 ? "next" : "previous");
    const distanceRatio = Math.abs(displacementX) / Math.max(1, readerStageWidth.current);
    const shouldTurn = distanceRatio > 0.18 || Math.abs(velocityX) > 620;
    if (shouldTurn) completePageTurn(direction, velocityX, direction);
    else cancelPageTurn();
  }, [cancelPageTurn, completePageTurn]);

  const [leftPagePanGesture, rightPagePanGesture] = useMemo(() => {
    const createPagePanGesture = () => Gesture.Pan()
      .enabled(Boolean(readerSource && cachedLocations !== undefined && !displayError))
      .activeOffsetX([-12, 12])
      .failOffsetY([-22, 22])
      .onBegin(({ absoluteX }) => beginPageGesture(absoluteX))
      .onUpdate(({ absoluteX, y }) => updatePageGesture(absoluteX, y))
      .onEnd(({ absoluteX, velocityX }) => finishPageGesture(absoluteX, velocityX))
      .onFinalize((_event, success) => {
        if (!success && pageGestureActive.current && !pageTurnInFlight.current) cancelPageTurn();
      })
      .runOnJS(true);

    return [createPagePanGesture(), createPagePanGesture()] as const;
  }, [beginPageGesture, cachedLocations, cancelPageTurn, displayError, finishPageGesture, readerSource, updatePageGesture]);

  return (
    <SafeAreaView
      edges={isFullscreen ? [] : ["top", "right", "bottom", "left"]}
      style={[styles.safeArea, { backgroundColor: palette.background }]}
    >
      <StatusBar hidden={isFullscreen} style={theme === "dark" ? "light" : "dark"} />
      {!isFullscreen && <AmbientBackground palette={palette} />}
      {!isFullscreen && <GlassSurface
        palette={palette}
        intensity={52}
        style={[
          styles.toolbar,
          usesCompactReaderChrome && styles.compactToolbar,
          layout.isCompactHeight && styles.shortToolbar,
          { borderColor: palette.glassBorder, shadowColor: palette.shadow },
        ]}
      >
        <View style={styles.identity}>
          <IconButton icon="arrow-left" palette={palette} accessibilityLabel="返回书库" onPress={onClose} />
          <View style={styles.titleBlock}>
            <Text numberOfLines={1} style={[styles.bookTitle, { color: palette.text }]}>{book.title}</Text>
            <Text numberOfLines={1} style={[styles.chapter, { color: palette.mutedText }]}>
              {section?.label || book.currentChapter || "正在打开…"}
            </Text>
          </View>
        </View>

        <View style={styles.toolbarActions}>
          {layout.mode !== "phone" && (
            <Text style={[styles.progressLabel, { color: palette.mutedText }]}>
              {Math.round(readingProgress * 100)}%
            </Text>
          )}
          <IconButton
            icon="format-list-bulleted"
            palette={palette}
            accessibilityLabel="目录"
            active={panel === "toc"}
            onPress={() => showPanel("toc")}
          />
          <IconButton
            icon={isBookmarked || book.bookmarks.some((bookmark) => bookmark.cfi === book.currentCfi)
              ? "bookmark"
              : "bookmark-outline"}
            palette={palette}
            accessibilityLabel="添加或移除书签"
            onPress={toggleBookmark}
          />
          {layout.mode !== "phone" && (
            <IconButton
              icon="bookmark-multiple-outline"
              palette={palette}
              accessibilityLabel="书签列表"
              active={panel === "bookmarks"}
              onPress={() => showPanel("bookmarks")}
            />
          )}
          <IconButton
            icon="cog-outline"
            palette={palette}
            accessibilityLabel="阅读设置"
            active={panel === "settings"}
            onPress={() => showPanel("settings")}
          />
        </View>
        <View style={[styles.toolbarProgressTrack, { backgroundColor: palette.border }]}>
          <View
            collapsable={false}
            style={[
              styles.toolbarProgressValue,
              { width: `${readingProgress * 100}%`, backgroundColor: palette.accent },
            ]}
          />
        </View>
      </GlassSurface>}

      <View style={styles.readerWorkspace}> 
        <GestureDetector gesture={exitFullscreenGesture}>
          <View
            onLayout={({ nativeEvent }) => {
              const nextSize = {
                width: Math.max(1, nativeEvent.layout.width),
                height: Math.max(1, nativeEvent.layout.height),
              };
              readerStageWidth.current = nextSize.width;
              readerStageHeight.current = nextSize.height;
              setReaderStageSize((current) => (
                current.width === nextSize.width && current.height === nextSize.height
                  ? current
                  : nextSize
              ));
            }}
            style={[
              styles.readerStage,
              !isFullscreen && styles.floatingReaderStage,
              layout.mode !== "phone" && !isFullscreen && styles.largeReaderStage,
              { backgroundColor: palette.reader, borderColor: palette.glassBorder, shadowColor: palette.shadow },
            ]}
          >
            <View pointerEvents="none" style={[styles.pageUnderlay, { backgroundColor: palette.reader }]} />
            <View style={styles.readerPageSurface}>
              <View ref={readerCaptureRef} collapsable={false} style={styles.readerCaptureSurface}>
                {cachedLocations === undefined || readerSource === undefined ? (
                  <ReaderLoading
                    palette={palette}
                    label={book.renditionLayout === "fixed" ? "正在准备漫画…" : "正在准备阅读数据…"}
                  />
                ) : (
                  <Reader
                    key={`${book.id}:${readerSource}:${effectiveReadingFlow}`}
                    src={readerSource}
                    width="100%"
                    height="100%"
                    fileSystem={useEpubFileSystem}
                    initialLocation={flowSwitchLocation.current || book.currentCfi || undefined}
                    initialLocations={(cachedLocations || "[]") as unknown as string[]}
                    charactersPerLocation={3000}
                    defaultTheme={readerTheme}
                    enableSwipe={false}
                    enableSelection={false}
                    injectedJavascript={book.renditionLayout !== "fixed" && !cachedLocations
                      ? generateLocationsInBackground
                      : undefined}
                    flow={effectiveReadingFlow}
                    manager={effectiveReadingFlow === "scrolled-doc" ? "continuous" : "default"}
                    spread={layout.mode === "phone" || !layout.isLandscape ? "none" : "auto"}
                    onReady={() => {
                      setDisplayError(null);
                      syncMetadata();
                      changeTheme(readerTheme);
                      changeFontSize(`${fontSize}%`);
                      if (effectiveReadingFlow === "paginated") schedulePageSnapshot(260);
                    }}
                    onLocationsReady={(_epubKey, locations) => {
                      void setCachedLocations(book.id, locations);
                    }}
                    onLocationChange={(...args) => {
                      handleLocationChange(...args);
                      if (
                        effectiveReadingFlow === "paginated"
                        && !preNavigatedDirection.current
                        && !pageTurnInFlight.current
                      ) {
                        schedulePageSnapshot();
                      }
                    }}
                    onDisplayError={(reason) => setDisplayError(reason || "无法打开这本书")}
                    onWebViewMessage={handleReaderWebViewMessage}
                    renderLoadingFileComponent={({ downloadError }) => (
                      <ReaderLoading
                        palette={palette}
                        label={downloadError ? `文件读取失败：${downloadError}` : "正在读取 EPUB…"}
                        error={Boolean(downloadError)}
                      />
                    )}
                    renderOpeningBookComponent={() => <ReaderLoading palette={palette} label="正在排版…" />}
                  />
                )}
              </View>
            </View>

            {effectiveReadingFlow === "paginated" && <PageCurlSurface
              key={cachedPageSnapshot ?? "empty-page-texture"}
              active={Boolean(activePageSnapshot)}
              snapshotUri={cachedPageSnapshot}
              width={readerStageSize.width}
              height={readerStageSize.height}
              progress={curlProgress}
              corner={curlCorner}
              direction={pageCurlDirection}
              paperColor={palette.reader}
              textureStrength={book.renditionLayout === "fixed" ? 0.72 : 0.4}
              onTextureReady={handleCurlTextureReady}
            />}

            {effectiveReadingFlow === "paginated" && <View pointerEvents="box-none" style={styles.pageGestureLayer}>
              <GestureDetector gesture={leftPagePanGesture}>
                <View collapsable={false} style={[styles.pageGestureZone, styles.leftPageGestureZone]} />
              </GestureDetector>
              <GestureDetector gesture={rightPagePanGesture}>
                <View collapsable={false} style={[styles.pageGestureZone, styles.rightPageGestureZone]} />
              </GestureDetector>
            </View>}

            {isFullscreen && showFullscreenHint && (
              <View pointerEvents="none" style={styles.fullscreenHintContainer}>
                <View style={styles.fullscreenHint}> 
                  <MaterialCommunityIcons name="gesture-tap-hold" size={19} color="#FFFFFF" />
                  <Text style={styles.fullscreenHintText}>长按页面中央退出全屏</Text>
                </View>
              </View>
            )}

          {displayError && (
            <View style={[styles.readerError, { backgroundColor: palette.reader }]}>
              <MaterialCommunityIcons name="book-alert-outline" size={42} color={palette.danger} />
              <Text style={[styles.readerErrorTitle, { color: palette.text }]}>书籍打开失败</Text>
              <Text style={[styles.readerErrorMessage, { color: palette.mutedText }]}>{displayError}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={onClose}
                style={({ pressed }) => [
                  styles.readerErrorButton,
                  { backgroundColor: palette.accent },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={{ color: palette.onAccent, fontWeight: "800" }}>返回书库</Text>
              </Pressable>
            </View>
          )}
          </View>
        </GestureDetector>

        {!isFullscreen && layout.showsDockedReaderPanel && panel && (
          <ReaderSidePanel
            panel={panel}
            book={book}
            toc={toc}
            palette={palette}
            width={layout.panelWidth}
            onClose={() => setPanel(null)}
            onNavigate={navigateToReaderLocation}
            onRemoveBookmark={(bookmarkId) => removeBookmark(book.id, bookmarkId)}
            readingFlow={effectiveReadingFlow}
            canChangeReadingFlow={book.renditionLayout !== "fixed"}
            onChangeReadingFlow={updateReadingFlow}
            onEnterFullscreen={enterFullscreen}
          />
        )}
      </View>

      {!isFullscreen && <GlassSurface
        palette={palette}
        strong
        intensity={54}
        style={[
          styles.readerControls,
          layout.isCompactHeight && styles.shortReaderControls,
          { borderColor: palette.glassBorder, shadowColor: palette.shadow },
        ]}
      >
        <View
          style={[
            styles.readerControlsInner,
            (layout.mode !== "phone" || layout.isLandscape) && styles.wideReaderControlsInner,
          ]}
        >
          {effectiveReadingFlow === "paginated" ? (
            <IconButton
              icon="chevron-left"
              palette={palette}
              accessibilityLabel="上一页"
              disabled={atStart}
              onPress={() => completePageTurn("previous")}
            />
          ) : <View style={styles.controlSpacer} />}
          {book.renditionLayout === "fixed" ? (
            <View style={styles.pageStatus}>
              <MaterialCommunityIcons name="image-multiple-outline" size={19} color={palette.mutedText} />
              <Text style={[styles.pageStatusText, { color: palette.mutedText }]}>
                {Math.round(readingProgress * 100)}%
              </Text>
            </View>
          ) : (
            <View style={styles.fontControls}>
              <IconButton
                icon="format-font-size-decrease"
                palette={palette}
                accessibilityLabel="减小字号"
                disabled={fontSize <= 70}
                onPress={() => setFontSize(fontSize - 10)}
              />
              <Text style={[styles.fontLabel, { color: palette.mutedText }]}>{fontSize}%</Text>
              <IconButton
                icon="format-font-size-increase"
                palette={palette}
                accessibilityLabel="增大字号"
                disabled={fontSize >= 180}
                onPress={() => setFontSize(fontSize + 10)}
              />
            </View>
          )}
          <IconButton
            icon={theme === "dark" ? "weather-night" : theme === "sepia" ? "circle-half-full" : "white-balance-sunny"}
            palette={palette}
            accessibilityLabel="切换主题"
            onPress={cycleTheme}
          />
          {layout.mode === "phone" && (
            <IconButton
              icon="bookmark-multiple-outline"
              palette={palette}
              accessibilityLabel="书签列表"
              active={panel === "bookmarks"}
              onPress={() => showPanel("bookmarks")}
            />
          )}
          {effectiveReadingFlow === "paginated" ? (
            <IconButton
              icon="chevron-right"
              palette={palette}
              accessibilityLabel="下一页"
              disabled={atEnd}
              onPress={() => completePageTurn("next")}
            />
          ) : <View style={styles.controlSpacer} />}
        </View>
      </GlassSurface>}

      {!isFullscreen && !layout.showsDockedReaderPanel && (
        <ReaderPanelModal
          panel={panel}
          book={book}
          toc={toc}
          palette={palette}
          sideSheet={layout.isLandscape || layout.mode !== "phone"}
          width={layout.panelWidth}
          onClose={() => setPanel(null)}
          onNavigate={navigateFromModal}
          onRemoveBookmark={(bookmarkId) => removeBookmark(book.id, bookmarkId)}
          readingFlow={effectiveReadingFlow}
          canChangeReadingFlow={book.renditionLayout !== "fixed"}
          onChangeReadingFlow={updateReadingFlow}
          onEnterFullscreen={enterFullscreen}
        />
      )}
    </SafeAreaView>
  );
}

function ReaderLoading({
  palette,
  label,
  error = false,
}: {
  palette: Palette;
  label: string;
  error?: boolean;
}) {
  return (
    <View style={[styles.readerLoading, { backgroundColor: palette.reader }]}>
      {!error && <ActivityIndicator color={palette.accent} />}
      <Text style={[styles.loadingLabel, { color: error ? palette.danger : palette.mutedText }]}>{label}</Text>
    </View>
  );
}

function ReaderPanelModal({
  panel,
  book,
  toc,
  palette,
  sideSheet,
  width,
  onClose,
  onNavigate,
  onRemoveBookmark,
  readingFlow,
  canChangeReadingFlow,
  onChangeReadingFlow,
  onEnterFullscreen,
}: Omit<ReaderPanelContentProps, "panel"> & {
  panel: ReaderPanel;
  sideSheet: boolean;
  width: number;
}) {
  return (
    <Modal transparent animationType="slide" visible={Boolean(panel)} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      {panel && (
        <GlassSurface
          palette={palette}
          strong
          intensity={60}
          style={[
            styles.readerSheet,
            sideSheet && styles.readerSideSheet,
            sideSheet && { width },
            { borderColor: palette.glassBorder, shadowColor: palette.shadow },
          ]}
        >
          {!sideSheet && <View style={styles.sheetHandle} />}
          <ReaderPanelContent
            panel={panel}
            book={book}
            toc={toc}
            palette={palette}
            onClose={onClose}
            onNavigate={onNavigate}
            onRemoveBookmark={onRemoveBookmark}
            readingFlow={readingFlow}
            canChangeReadingFlow={canChangeReadingFlow}
            onChangeReadingFlow={onChangeReadingFlow}
            onEnterFullscreen={onEnterFullscreen}
          />
        </GlassSurface>
      )}
    </Modal>
  );
}

function ReaderSidePanel({ width, ...props }: ReaderPanelContentProps & { width: number }) {
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  return (
    <Animated.View
      style={[
        styles.sidePanel,
        {
          width,
          backgroundColor: props.palette.glassStrong,
          borderColor: props.palette.glassBorder,
          shadowColor: props.palette.shadow,
        },
        {
          opacity: entrance,
          transform: [{
            translateX: entrance.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }),
          }],
        },
      ]}
    >
      <ReaderPanelContent {...props} />
    </Animated.View>
  );
}

interface ReaderPanelContentProps {
  panel: Exclude<ReaderPanel, null>;
  book: MobileBook;
  toc: Section[];
  palette: Palette;
  onClose: () => void;
  onNavigate: (target: string) => void;
  onRemoveBookmark: (bookmarkId: string) => void;
  readingFlow: NovelReadingFlow;
  canChangeReadingFlow: boolean;
  onChangeReadingFlow: (flow: NovelReadingFlow) => void;
  onEnterFullscreen: () => void;
}

function ReaderPanelContent({
  panel,
  book,
  toc,
  palette,
  onClose,
  onNavigate,
  onRemoveBookmark,
  readingFlow,
  canChangeReadingFlow,
  onChangeReadingFlow,
  onEnterFullscreen,
}: ReaderPanelContentProps) {
  const tocEntries = flattenToc(toc);

  return (
    <View style={styles.panelContent}>
      <View style={[styles.panelHeader, { borderBottomColor: palette.border }]}>
        <Text style={[styles.panelTitle, { color: palette.text }]}> 
          {panel === "toc" ? "目录" : panel === "bookmarks" ? "书签" : "设置"}
        </Text>
        <IconButton icon="close" palette={palette} accessibilityLabel="关闭面板" onPress={onClose} />
      </View>
      <ScrollView contentContainerStyle={styles.panelScroll}>
        {panel === "toc" ? (
          tocEntries.length > 0 ? tocEntries.map(({ item, depth }, index) => (
            <Pressable
              key={`${item.id || item.href}-${index}`}
              onPress={() => onNavigate(item.href)}
              style={({ pressed }) => [
                styles.panelRow,
                { paddingLeft: 14 + depth * 16 },
                pressed && { backgroundColor: palette.accentSoft },
              ]}
            >
              <Text numberOfLines={2} style={[styles.panelRowText, { color: palette.text }]}>{item.label}</Text>
            </Pressable>
          )) : <PanelEmpty palette={palette} label="这本书没有提供目录" />
        ) : panel === "bookmarks" ? (
          book.bookmarks.length > 0 ? book.bookmarks.map((bookmark) => (
            <View key={bookmark.id} style={[styles.bookmarkRow, { borderBottomColor: palette.border }]}>
              <Pressable onPress={() => onNavigate(bookmark.cfi)} style={styles.bookmarkOpen}>
                <Text numberOfLines={2} style={[styles.bookmarkTitle, { color: palette.text }]}>{bookmark.chapter}</Text>
                <Text style={[styles.bookmarkDate, { color: palette.mutedText }]}>
                  {new Date(bookmark.createdAt).toLocaleDateString()}
                </Text>
              </Pressable>
              <IconButton
                icon="trash-can-outline"
                palette={palette}
                accessibilityLabel="删除书签"
                onPress={() => onRemoveBookmark(bookmark.id)}
              />
            </View>
          )) : <PanelEmpty palette={palette} label="还没有书签" />
        ) : (
          <ReaderSettings
            palette={palette}
            readingFlow={readingFlow}
            canChangeReadingFlow={canChangeReadingFlow}
            onChangeReadingFlow={onChangeReadingFlow}
            onEnterFullscreen={onEnterFullscreen}
          />
        )}
      </ScrollView>
    </View>
  );
}

function ReaderSettings({
  palette,
  readingFlow,
  canChangeReadingFlow,
  onChangeReadingFlow,
  onEnterFullscreen,
}: Pick<
  ReaderPanelContentProps,
  "palette" | "readingFlow" | "canChangeReadingFlow" | "onChangeReadingFlow" | "onEnterFullscreen"
>) {
  return (
    <View style={styles.settingsContent}>
      <Text style={[styles.settingsLabel, { color: palette.mutedText }]}>阅读方式</Text>
      <View style={[styles.flowSelector, { backgroundColor: palette.mutedSurface }]}> 
        <ReadingFlowOption
          icon="book-open-page-variant-outline"
          label="左右翻页"
          active={readingFlow === "paginated"}
          disabled={!canChangeReadingFlow}
          palette={palette}
          onPress={() => onChangeReadingFlow("paginated")}
        />
        <ReadingFlowOption
          icon="format-vertical-align-center"
          label="上下滚动"
          active={readingFlow === "scrolled-doc"}
          disabled={!canChangeReadingFlow}
          palette={palette}
          onPress={() => onChangeReadingFlow("scrolled-doc")}
        />
      </View>
      {/* {!canChangeReadingFlow && (
        <Text style={[styles.settingsNote, { color: palette.mutedText }]}>漫画和固定版式 EPUB 使用翻页模式</Text>
      )} */}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="进入全屏"
        onPress={onEnterFullscreen}
        style={({ pressed }) => [
          styles.fullscreenSetting,
          { borderColor: palette.border, backgroundColor: palette.surface },
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.settingIcon, { backgroundColor: palette.accentSoft }]}> 
          <MaterialCommunityIcons name="fullscreen" size={25} color={palette.accent} />
        </View>
        <View style={styles.settingCopy}>
          <Text style={[styles.settingTitle, { color: palette.text }]}>全屏</Text>
          <Text style={[styles.settingDescription, { color: palette.mutedText }]}>全屏</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={24} color={palette.mutedText} />
      </Pressable>
    </View>
  );
}

function ReadingFlowOption({
  icon,
  label,
  active,
  disabled,
  palette,
  onPress,
}: {
  icon: ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  active: boolean;
  disabled: boolean;
  palette: Palette;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.flowOption,
        active && { backgroundColor: palette.elevated },
        pressed && styles.pressed,
        disabled && styles.disabledSetting,
      ]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={24}
        color={active ? palette.accent : palette.mutedText}
      />
      <Text style={[styles.flowOptionText, { color: active ? palette.text : palette.mutedText }]}>{label}</Text>
      {active && <MaterialCommunityIcons name="check-circle" size={18} color={palette.accent} />}
    </Pressable>
  );
}

function PanelEmpty({ palette, label }: { palette: Palette; label: string }) {
  return (
    <View style={styles.panelEmpty}>
      <MaterialCommunityIcons name="bookmark-outline" size={34} color={palette.mutedText} />
      <Text style={{ color: palette.mutedText }}>{label}</Text>
    </View>
  );
}

function flattenToc(items: Section[], depth = 0): Array<{ item: Section; depth: number }> {
  const result: Array<{ item: Section; depth: number }> = [];
  for (const item of items) {
    result.push({ item, depth });
    if (Array.isArray(item.subitems) && item.subitems.length > 0) {
      result.push(...flattenToc(item.subitems as Section[], depth + 1));
    }
  }
  return result;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, overflow: "hidden" },
  toolbar: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 5,
    marginHorizontal: 7,
    paddingHorizontal: 5,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    elevation: 2,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  compactToolbar: { minHeight: 58, paddingHorizontal: 3 },
  shortToolbar: { minHeight: 52 },
  identity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" },
  titleBlock: { flex: 1, minWidth: 0, marginLeft: 3 },
  bookTitle: { fontSize: 14, lineHeight: 19, fontWeight: "800" },
  chapter: { marginTop: 1, fontSize: 11, lineHeight: 15 },
  toolbarActions: { flexDirection: "row", alignItems: "center" },
  progressLabel: { minWidth: 48, marginRight: 6, fontSize: 11, fontWeight: "700", textAlign: "center", fontVariant: ["tabular-nums"] },
  toolbarProgressTrack: { position: "absolute", right: 0, bottom: 0, left: 0, height: 2 },
  toolbarProgressValue: { height: "100%" },
  readerWorkspace: { flex: 1, minHeight: 0, flexDirection: "row" },
  readerStage: { flex: 1, minWidth: 0, overflow: "hidden" },
  floatingReaderStage: {
    marginTop: 6,
    marginHorizontal: 7,
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    elevation: 1,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  pageUnderlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  readerPageSurface: { flex: 1, minWidth: 0, overflow: "hidden" },
  readerCaptureSurface: { flex: 1, minWidth: 0 },
  pageGestureLayer: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 5 },
  pageGestureZone: { position: "absolute", top: 0, bottom: 0, width: "50%" },
  leftPageGestureZone: { left: 0 },
  rightPageGestureZone: { right: 0 },
  largeReaderStage: { margin: 10, borderRadius: 18 },
  readerControls: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    marginHorizontal: 7,
    marginBottom: 5,
    paddingHorizontal: 4,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    elevation: 3,
    shadowOpacity: 0.07,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: -4 },
  },
  shortReaderControls: { minHeight: 50 },
  readerControlsInner: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  wideReaderControlsInner: { maxWidth: 680, alignSelf: "center" },
  controlSpacer: { width: 44, height: 44 },
  fontControls: { flexDirection: "row", alignItems: "center" },
  fontLabel: { minWidth: 41, fontSize: 11, fontWeight: "700", textAlign: "center", fontVariant: ["tabular-nums"] },
  pageStatus: { minWidth: 82, height: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  pageStatusText: { fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  readerLoading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingLabel: { fontSize: 13 },
  readerError: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", padding: 30 },
  readerErrorTitle: { marginTop: 16, fontSize: 18, fontWeight: "800" },
  readerErrorMessage: { maxWidth: 420, marginTop: 8, fontSize: 13, lineHeight: 20, textAlign: "center" },
  readerErrorButton: { minWidth: 120, height: 44, marginTop: 22, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  sidePanel: {
    marginTop: 8,
    marginRight: 8,
    marginBottom: 8,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    elevation: 5,
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  panelContent: { flex: 1, minHeight: 0 },
  panelHeader: { minHeight: 62, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 20, paddingRight: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  panelTitle: { fontSize: 18, fontWeight: "800" },
  panelScroll: { flexGrow: 1, padding: 10, paddingBottom: 28 },
  panelRow: { minHeight: 46, justifyContent: "center", paddingVertical: 7, paddingRight: 12, borderRadius: 11 },
  panelRowText: { fontSize: 13, lineHeight: 19 },
  bookmarkRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  bookmarkOpen: { flex: 1, minWidth: 0, paddingVertical: 10 },
  bookmarkTitle: { fontSize: 13, lineHeight: 18, fontWeight: "700" },
  bookmarkDate: { marginTop: 3, fontSize: 10 },
  panelEmpty: { flex: 1, minHeight: 240, alignItems: "center", justifyContent: "center", gap: 12 },
  settingsContent: { gap: 14, padding: 8 },
  settingsLabel: { marginTop: 2, marginLeft: 4, fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  flowSelector: { flexDirection: "row", gap: 5, padding: 5, borderRadius: 17 },
  flowOption: { flex: 1, minHeight: 82, alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 13, paddingHorizontal: 8 },
  flowOptionText: { fontSize: 12, fontWeight: "800" },
  disabledSetting: { opacity: 0.42 },
  settingsNote: { marginTop: -6, marginHorizontal: 4, fontSize: 11, lineHeight: 17 },
  fullscreenSetting: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8, paddingHorizontal: 13, borderWidth: StyleSheet.hairlineWidth, borderRadius: 17 },
  settingIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14 },
  settingCopy: { flex: 1, minWidth: 0 },
  settingTitle: { fontSize: 14, fontWeight: "800" },
  settingDescription: { marginTop: 3, fontSize: 10, lineHeight: 15 },
  fullscreenHintContainer: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 20, alignItems: "center", justifyContent: "center" },
  fullscreenHint: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 22, backgroundColor: "#151713CC" },
  fullscreenHintText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  modalBackdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "#11141173" },
  readerSheet: { position: "absolute", right: 0, bottom: 0, left: 0, height: "72%", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", paddingBottom: 18, elevation: 12, shadowOpacity: 0.18, shadowRadius: 28, shadowOffset: { width: 0, height: -10 } },
  readerSideSheet: { top: 12, right: 12, bottom: 12, left: undefined, height: undefined, borderRadius: 24, paddingBottom: 0 },
  sheetHandle: { alignSelf: "center", width: 42, height: 5, marginTop: 10, borderRadius: 3, backgroundColor: "#8D918B66" },
  pressed: { opacity: 0.68, transform: [{ scale: 0.98 }] },
});
