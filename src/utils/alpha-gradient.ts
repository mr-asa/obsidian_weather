const clamp01 = (value: number): number => {
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
};

export type AlphaEasingProfile =
  | "sineIn"
  | "sineOut"
  | "sineInOut"
  | "quadIn"
  | "quadOut"
  | "quadInOut"
  | "cubicIn"
  | "cubicOut"
  | "cubicInOut"
  | "circIn"
  | "circOut"
  | "circInOut";

export const DEFAULT_ALPHA_EASING_PROFILE: AlphaEasingProfile = "cubicInOut";

type EasingFn = (t: number) => number;

const easingMap: Record<AlphaEasingProfile, EasingFn> = {
  sineIn: (t: number) => 1 - Math.cos((Math.PI * clamp01(t)) / 2),
  sineOut: (t: number) => Math.sin((Math.PI * clamp01(t)) / 2),
  sineInOut: (t: number) => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2,
  quadIn: (t: number) => {
    const x = clamp01(t);
    return x * x;
  },
  quadOut: (t: number) => {
    const x = clamp01(t);
    return 1 - (1 - x) * (1 - x);
  },
  quadInOut: (t: number) => {
    const x = clamp01(t);
    if (x < 0.5) {
      return 2 * x * x;
    }
    return 1 - Math.pow(-2 * x + 2, 2) / 2;
  },
  cubicIn: (t: number) => {
    const x = clamp01(t);
    return x * x * x;
  },
  cubicOut: (t: number) => {
    const x = clamp01(t);
    return 1 - Math.pow(1 - x, 3);
  },
  cubicInOut: (t: number) => {
    const x = clamp01(t);
    if (x < 0.5) {
      return 4 * x * x * x;
    }
    return 1 - Math.pow(-2 * x + 2, 3) / 2;
  },
  circIn: (t: number) => 1 - Math.sqrt(1 - clamp01(t) * clamp01(t)),
  circOut: (t: number) => {
    const x = clamp01(t) - 1;
    return Math.sqrt(1 - x * x);
  },
  circInOut: (t: number) => {
    const x = clamp01(t);
    if (x < 0.5) {
      const scaled = 2 * x;
      return (1 - Math.sqrt(1 - scaled * scaled)) / 2;
    }
    const scaled = -2 * x + 2;
    return (Math.sqrt(1 - scaled * scaled) + 1) / 2;
  },
};

export interface AlphaGradientOptions {
  profile?: AlphaEasingProfile;
  /**
   * When false, the left fade is skipped and the gradient starts fully opaque.
   */
  enableLeft?: boolean;
  /**
   * When false, the right fade is skipped and the gradient stays opaque until the end.
   */
  enableRight?: boolean;
  /**
   * Portion of the gradient width that should remain fully opaque. Value is clamped to [0, 1].
   */
  innerOpacityRatio?: number;
  /**
   * Multiplier applied to the entire alpha curve. Value is clamped to [0, 1].
   */
  opacityScale?: number;
}

export interface AlphaGradientCurve {
  profile: AlphaEasingProfile;
  enableLeft: boolean;
  enableRight: boolean;
  innerOpacityRatio: number;
  opacityScale: number;
  sample(position: number): number;
  sampleStops(resolution?: number): number[];
  segments: {
    leftWidth: number;
    innerWidth: number;
    rightWidth: number;
  };
}

const resolveEasing = (profile: AlphaEasingProfile): EasingFn => {
  return easingMap[profile] ?? easingMap[DEFAULT_ALPHA_EASING_PROFILE];
};

const resolveBoolean = (value: boolean | undefined, defaultValue: boolean): boolean => {
  return value == null ? defaultValue : value;
};

export function createAlphaGradientCurve(options: AlphaGradientOptions = {}): AlphaGradientCurve {
  const profile = options.profile ?? DEFAULT_ALPHA_EASING_PROFILE;
  const easing = resolveEasing(profile);
  const enableLeft = resolveBoolean(options.enableLeft, true);
  const enableRight = resolveBoolean(options.enableRight, true);
  const innerOpacityRatio = clamp01(options.innerOpacityRatio ?? 0.5);
  const opacityScale = clamp01(options.opacityScale ?? 1);

  const baseEdgeWidth = (1 - innerOpacityRatio) / 2;

  let leftWidth = enableLeft ? Math.max(0, baseEdgeWidth) : 0;
  let rightWidth = enableRight ? Math.max(0, baseEdgeWidth) : 0;

  if (!enableLeft && enableRight) {
    rightWidth += Math.max(0, baseEdgeWidth);
  }

  if (!enableRight && enableLeft) {
    leftWidth += Math.max(0, baseEdgeWidth);
  }

  let innerWidth = innerOpacityRatio;
  if (!enableLeft && !enableRight) {
    innerWidth = 1;
    leftWidth = 0;
    rightWidth = 0;
  }

  innerWidth = clamp01(innerWidth);

  const totalWidth = leftWidth + innerWidth + rightWidth;
  const normalizationFactor = totalWidth > 0 ? 1 / totalWidth : 0;

  const normalizedLeftWidth = leftWidth * normalizationFactor;
  const normalizedInnerWidth = innerWidth * normalizationFactor;
  const normalizedRightWidth = rightWidth * normalizationFactor;

  const innerEnd = normalizedLeftWidth + normalizedInnerWidth;

  const sample = (rawPosition: number): number => {
    if (totalWidth === 0) {
      return 0;
    }

    const position = clamp01(rawPosition);

    if (normalizedLeftWidth > 0 && position < normalizedLeftWidth) {
      const t = position / normalizedLeftWidth;
      return opacityScale * easing(t);
    }

    if (position <= innerEnd || normalizedRightWidth === 0) {
      return opacityScale;
    }

    if (normalizedRightWidth > 0 && position < 1) {
      const t = (position - innerEnd) / normalizedRightWidth;
      return opacityScale * easing(1 - t);
    }

    return 0;
  };

  const sampleStops = (resolution = 128): number[] => {
    const steps = Math.max(2, Math.floor(resolution));
    const values: number[] = [];
    for (let i = 0; i < steps; i += 1) {
      const t = i / (steps - 1);
      values.push(sample(t));
    }
    return values;
  };

  return {
    profile,
    enableLeft,
    enableRight,
    innerOpacityRatio,
    opacityScale,
    sample,
    sampleStops,
    segments: {
      leftWidth: normalizedLeftWidth,
      innerWidth: normalizedInnerWidth,
      rightWidth: normalizedRightWidth,
    },
  };
}
