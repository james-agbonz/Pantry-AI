import type { PricedCard } from "@pantry/contract";
import { forwardRef, useImperativeHandle } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { radius, shadowLift } from "@/theme";
import { MealCard, type Photo } from "./MealCard";

/** How far, as a share of screen width, a drag must go to count as a swipe. */
const THRESHOLD = 0.3;
/** A fling this fast (px/s) counts even if it's short. */
const FLING = 800;
const EXIT_MS = 220;
/** Tilt at the threshold, for the feel of a card in hand. */
const TILT_DEG = 8;

export interface SwipeCardHandle {
  /** Animate off screen as if swiped, then call back. The buttons use this. */
  fling: (dir: "left" | "right") => void;
}

interface Props {
  item: PricedCard;
  photo: Photo;
  onPass: () => void;
  onSelect: () => void;
}

/**
 * The top card of the deck: drag right to select, left to pass (SPEC §10).
 * The only element with `shadow-lift`, because it's the one you can drag.
 */
export const SwipeCard = forwardRef<SwipeCardHandle, Props>(function SwipeCard({ item, photo, onPass, onSelect }, ref) {
  const { width } = useWindowDimensions();
  const x = useSharedValue(0);

  const exit = (dir: "left" | "right") => {
    "worklet";
    x.value = withTiming(dir === "right" ? width * 1.5 : -width * 1.5, { duration: EXIT_MS }, (done) => {
      if (done) scheduleOnRN(dir === "right" ? onSelect : onPass);
    });
  };

  useImperativeHandle(ref, () => ({ fling: (dir) => exit(dir) }));

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      x.value = e.translationX;
    })
    .onEnd((e) => {
      if (x.value > width * THRESHOLD || e.velocityX > FLING) exit("right");
      else if (x.value < -width * THRESHOLD || e.velocityX < -FLING) exit("left");
      else x.value = withSpring(0);
    });

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { rotate: `${interpolate(x.value, [-width * THRESHOLD, 0, width * THRESHOLD], [-TILT_DEG, 0, TILT_DEG])}deg` },
    ],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.lift, style]}>
        <MealCard item={item} photo={photo} />
      </Animated.View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  lift: { boxShadow: shadowLift, borderRadius: radius["radius-lg"] },
});
