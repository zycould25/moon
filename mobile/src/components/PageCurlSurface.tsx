/*
 * Page-curl geometry is adapted from the Hewlett-Packard / WebVfx shader used
 * by rn-animated-components. The geometry remains available under BSD-3-Clause.
 *
 * Copyright (c) 2010 Hewlett-Packard Development Company, L.P.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * 3. Neither the name of Hewlett-Packard nor the names of its contributors may
 *    be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES ARE DISCLAIMED. IN NO EVENT SHALL THE
 * COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DAMAGES ARISING FROM USE.
 *
 * Moon changes the original material model substantially: the destination is a
 * transparent live reader surface, previous-page direction is supported, and
 * the paper backside is sampled from the page texture instead of being white.
 */

import {
  Canvas,
  Fill,
  ImageShader,
  Shader,
  Skia,
  useImage,
} from "@shopify/react-native-skia";
import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";

export type PageCurlDirection = "previous" | "next";

interface PageCurlSurfaceProps {
  active: boolean;
  snapshotUri: string | null;
  width: number;
  height: number;
  progress: SharedValue<number>;
  corner: SharedValue<number>;
  direction: PageCurlDirection;
  paperColor: string;
  textureStrength: number;
  onTextureReady?: (uri: string, ready: boolean) => void;
}

const PAGE_CURL_SHADER = `
  uniform shader pageTexture;
  uniform float2 resolution;
  uniform float progress;
  uniform float cornerFlag;
  uniform float reverseFlag;
  uniform float3 paperTint;
  uniform float textureStrength;

  const float PI = 3.141592653589793;
  const float MIN_AMOUNT = -0.255;
  const float MAX_AMOUNT = 1.12;
  const float CYLINDER_RADIUS = 0.159154943;
  const float AA_SCALE = 640.0;
  const float AA_SHARPNESS = 3.0;

  float2 toCanonical(float2 uv) {
    if (reverseFlag > 0.5) uv.x = 1.0 - uv.x;
    if (cornerFlag < 0.5) uv.y = 1.0 - uv.y;
    return uv;
  }

  float2 fromCanonical(float2 uv) {
    if (cornerFlag < 0.5) uv.y = 1.0 - uv.y;
    if (reverseFlag > 0.5) uv.x = 1.0 - uv.x;
    return uv;
  }

  float4 samplePage(float2 uv) {
    return pageTexture.eval(fromCanonical(uv) * resolution);
  }

  float3 hitPoint(float hitAngle, float3 point, float3x3 reverseRotation) {
    point.y = hitAngle / (2.0 * PI);
    return reverseRotation * point;
  }

  float4 antiAlias(float4 innerColor, float4 outerColor, float distance) {
    float scaledDistance = distance * AA_SCALE;
    if (scaledDistance < 0.0) return outerColor;
    if (scaledDistance > 2.0) return innerColor;
    float blend = pow(1.0 - scaledDistance / 2.0, AA_SHARPNESS);
    return mix(innerColor, outerColor, blend);
  }

  float distanceToEdge(float3 point) {
    float dx = abs(point.x > 0.5 ? 1.0 - point.x : point.x);
    float dy = abs(point.y > 0.5 ? 1.0 - point.y : point.y);
    if (point.x < 0.0) dx = -point.x;
    if (point.x > 1.0) dx = point.x - 1.0;
    if (point.y < 0.0) dy = -point.y;
    if (point.y > 1.0) dy = point.y - 1.0;
    if ((point.x < 0.0 || point.x > 1.0) &&
        (point.y < 0.0 || point.y > 1.0)) {
      return sqrt(dx * dx + dy * dy);
    }
    return min(dx, dy);
  }

  float4 destinationShadow(float alpha) {
    float softened = clamp(alpha, 0.0, 0.42);
    return float4(0.0, 0.0, 0.0, softened);
  }

  float4 seeThrough(
    float yc,
    float2 pagePoint,
    float3x3 rotation,
    float3x3 reverseRotation,
    float cylinderAngle
  ) {
    float hitAngle = PI - (acos(yc / CYLINDER_RADIUS) - cylinderAngle);
    float3 point = hitPoint(hitAngle, rotation * float3(pagePoint, 1.0), reverseRotation);
    if (yc <= 0.0 &&
        (point.x < 0.0 || point.y < 0.0 || point.x > 1.0 || point.y > 1.0)) {
      return float4(0.0);
    }
    if (yc > 0.0) return samplePage(pagePoint);
    return antiAlias(samplePage(point.xy), float4(0.0), distanceToEdge(point));
  }

  float4 seeThroughWithShadow(
    float yc,
    float2 pagePoint,
    float3 point,
    float3x3 rotation,
    float3x3 reverseRotation,
    float cylinderAngle,
    float amount
  ) {
    float edgeShadow = max(0.0, (1.0 - distanceToEdge(point) * 28.0) / 3.5);
    edgeShadow *= clamp(amount + 0.18, 0.0, 1.0);
    float4 color = seeThrough(yc, pagePoint, rotation, reverseRotation, cylinderAngle);
    color.rgb *= 1.0 - edgeShadow * 0.72;
    return color;
  }

  // The back is real page content seen through paper. Local luminance and
  // chroma from the snapshot drive the result; paperTint only supplies the
  // material color. Comics therefore keep more color while text pages show a
  // subtler mirrored ink impression.
  float4 texturedBackside(float yc, float3 point) {
    float4 source = samplePage(point.xy);
    float luminance = dot(source.rgb, float3(0.2126, 0.7152, 0.0722));
    float3 desaturated = mix(float3(luminance), source.rgb, 0.58);
    float3 localContrast = clamp((desaturated - 0.5) * 0.76 + 0.5, 0.0, 1.0);

    float curlPosition = clamp(1.0 - abs(yc / CYLINDER_RADIUS), 0.0, 1.0);
    float transmittedInk = textureStrength * (0.76 + curlPosition * 0.24);
    float3 material = mix(paperTint, localContrast, transmittedInk);

    float diffuse = 0.68 + pow(curlPosition, 0.34) * 0.30;
    float directionalShade = 0.94 + (yc / CYLINDER_RADIUS) * 0.08;
    float rimLight = pow(curlPosition, 3.0) * 0.055;
    material = material * diffuse * directionalShade + paperTint * rimLight;
    return float4(clamp(material, 0.0, 1.0), source.a);
  }

  float4 shadowOnDestination(
    float2 pagePoint,
    float yc,
    float3 point,
    float3x3 reverseRotation,
    float cylinderAngle,
    float amount
  ) {
    float shadow = (1.0 - ((-CYLINDER_RADIUS - yc) / max(amount, 0.02) * 6.4)) / 6.0;
    shadow *= 1.0 - abs(point.x - 0.5) * 0.82;

    float foldedY = -2.0 * CYLINDER_RADIUS - yc;
    float hitAngle = (acos(clamp(foldedY / CYLINDER_RADIUS, -1.0, 1.0)) + cylinderAngle) - PI;
    float3 hit = hitPoint(hitAngle, point, reverseRotation);
    if (foldedY < 0.0 && hit.x >= 0.0 && hit.y >= 0.0 &&
        hit.x <= 1.0 && hit.y <= 1.0 && (hitAngle < PI || amount > 0.5)) {
      float radial = length(hit.xy - float2(0.5));
      shadow = (1.0 - radial / 0.71) * pow(-foldedY / CYLINDER_RADIUS, 3.0) * 0.34;
    } else {
      shadow = max(shadow, 0.0);
    }
    return destinationShadow(shadow * smoothstep(0.02, 0.24, progress));
  }

  float4 main(float2 xy) {
    float2 pagePoint = toCanonical(xy / resolution);
    float amount = progress * (MAX_AMOUNT - MIN_AMOUNT) + MIN_AMOUNT;
    float cylinderCenter = amount;
    float cylinderAngle = 2.0 * PI * amount;

    float angle = 100.0 * PI / 180.0;
    float c = cos(-angle);
    float s = sin(-angle);
    float3x3 rotation = float3x3(
      c, s, 0.0,
      -s, c, 0.0,
      -0.801, 0.890, 1.0
    );
    c = cos(angle);
    s = sin(angle);
    float3x3 reverseRotation = float3x3(
      c, s, 0.0,
      -s, c, 0.0,
      0.985, 0.985, 1.0
    );

    float3 point = rotation * float3(pagePoint, 1.0);
    float yc = point.y - cylinderCenter;

    if (yc < -CYLINDER_RADIUS) {
      return shadowOnDestination(
        pagePoint,
        yc,
        point,
        reverseRotation,
        cylinderAngle,
        amount
      );
    }
    if (yc > CYLINDER_RADIUS) return samplePage(pagePoint);

    float hitAngle = (acos(clamp(yc / CYLINDER_RADIUS, -1.0, 1.0)) + cylinderAngle) - PI;
    float wrappedAngle = mod(hitAngle, 2.0 * PI);
    if ((wrappedAngle > PI && amount < 0.5) ||
        (wrappedAngle > PI / 2.0 && amount < 0.0)) {
      return seeThrough(yc, pagePoint, rotation, reverseRotation, cylinderAngle);
    }

    point = hitPoint(hitAngle, point, reverseRotation);
    if (point.x < 0.0 || point.y < 0.0 || point.x > 1.0 || point.y > 1.0) {
      return seeThroughWithShadow(
        yc,
        pagePoint,
        point,
        rotation,
        reverseRotation,
        cylinderAngle,
        amount
      );
    }

    float4 back = texturedBackside(yc, point);
    float4 other = yc < 0.0
      ? destinationShadow(
          (1.0 - length(point.xy - float2(0.5)) / 0.71) *
          pow(max(-yc / CYLINDER_RADIUS, 0.0), 3.0) * 0.32
        )
      : samplePage(pagePoint);
    back = antiAlias(back, other, CYLINDER_RADIUS - abs(yc));

    float4 edge = seeThroughWithShadow(
      yc,
      pagePoint,
      point,
      rotation,
      reverseRotation,
      cylinderAngle,
      amount
    );
    return antiAlias(back, edge, distanceToEdge(point));
  }
`;

export function PageCurlSurface({
  active,
  snapshotUri,
  width,
  height,
  progress,
  corner,
  direction,
  paperColor,
  textureStrength,
  onTextureReady,
}: PageCurlSurfaceProps) {
  const image = useImage(snapshotUri);
  const effect = useMemo(() => Skia.RuntimeEffect.Make(PAGE_CURL_SHADER), []);
  const paperTint = useMemo(() => hexToRgb(paperColor), [paperColor]);
  const reverseFlag = direction === "previous" ? 1 : 0;
  const uniforms = useDerivedValue(() => ({
    resolution: [width, height] as [number, number],
    progress: progress.value,
    cornerFlag: corner.value,
    reverseFlag,
    paperTint,
    textureStrength,
  }), [height, paperTint, reverseFlag, textureStrength, width]);

  useEffect(() => {
    if (!snapshotUri) return;
    onTextureReady?.(snapshotUri, Boolean(image));
  }, [image, onTextureReady, snapshotUri]);

  if (!active || !image || !effect || width <= 1 || height <= 1) return null;

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Canvas style={styles.canvas}>
        <Fill>
          <Shader source={effect} uniforms={uniforms}>
            <ImageShader
              image={image}
              fit="fill"
              width={width}
              height={height}
            />
          </Shader>
        </Fill>
      </Canvas>
    </View>
  );
}

function hexToRgb(color: string): [number, number, number] {
  const value = color.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(value)) {
    return [
      Number.parseInt(value.charAt(0).repeat(2), 16) / 255,
      Number.parseInt(value.charAt(1).repeat(2), 16) / 255,
      Number.parseInt(value.charAt(2).repeat(2), 16) / 255,
    ];
  }
  if (/^[0-9a-f]{6}$/i.test(value)) {
    return [
      Number.parseInt(value.slice(0, 2), 16) / 255,
      Number.parseInt(value.slice(2, 4), 16) / 255,
      Number.parseInt(value.slice(4, 6), 16) / 255,
    ];
  }
  return [1, 1, 1];
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 4,
  },
  canvas: {
    flex: 1,
  },
});
