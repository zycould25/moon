import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import type { Palette } from "../theme";

export function AmbientBackground({ palette }: { palette: Palette }) {
  return (
    <View pointerEvents="none" style={styles.layer}>
      <LinearGradient
        colors={[
          `${palette.ambientWarm}28`,
          `${palette.ambientWarm}0A`,
          "#00000000",
        ]}
        locations={[0, 0.32, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.topLight}
      />
      <LinearGradient
        colors={["#00000000", `${palette.ambientCool}14`]}
        locations={[0, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bottomLight}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
  },
  topLight: { position: "absolute", top: 0, right: 0, left: 0, height: 280 },
  bottomLight: { position: "absolute", right: 0, bottom: 0, left: 0, height: 320 },
});
