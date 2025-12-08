const trimString = (value: unknown): string => {
  return typeof value === "string" ? value.trim() : value !== undefined && value !== null ? String(value).trim() : "";
};

const UNSAFE_PROTOCOL_PATTERN =
  /^(javascript:|data:|file:|vbscript:|chrome:|edge:|safari-extension:|moz-extension:|opera:)/i;

const normalizeDetailLevel = (value: unknown): "shallow" | "medium" | "deep" => {
  const s = typeof value === "string" ? value.toLowerCase() : "";
  if (s === "shallow" || s === "deep" || s === "medium") return s as any;
  return "deep";
};

const VALID_SNAPSHOT_REF_PATTERN = /^s\d+(?:f\d+)?e\d+$/i;
const BACKEND_REF_PATTERN = /^backend:\d+$/i;

const refFormatError = (ref: string, label?: string): string | undefined => {
  if (!ref) return undefined;
  if (VALID_SNAPSHOT_REF_PATTERN.test(ref)) return undefined;
  if (BACKEND_REF_PATTERN.test(ref)) return undefined;

  const prefix = label ? `${label}: ` : "";
  return `${prefix}Invalid element reference "${ref}". Use format s{snapshot}e{element} or s{snapshot}f{frame}e{element}, e.g., "s1e1" or "s1f1e5".`;
};

export function sanitizeClickParams(params: any) {
  const target = trimString(params?.target);
  return {
    target,
    error: refFormatError(target),
  };
}

export function sanitizeTypeParams(params: any) {
  const target = trimString(params?.target);
  return {
    target,
    text:
      typeof params?.text === "string"
        ? params.text
        : params?.text !== undefined && params?.text !== null
          ? String(params.text)
        : undefined,
    clear: params?.clear !== false,
    submit: params?.submit === true,
    error: refFormatError(target),
  };
}

export function sanitizeInputParams(params: any) {
  const target = trimString(params?.target);
  return {
    target,
    value: params?.value,
    values: Array.isArray(params?.values)
      ? params.values.map((v: unknown) => String(v))
      : undefined,
    error: refFormatError(target),
  };
}

export function sanitizeDragParams(params: any) {
  const start = trimString(params?.start);
  const end = trimString(params?.end);
  const startError = refFormatError(start, "Start target");
  const endError = startError ? undefined : refFormatError(end, "End target");
  return {
    start,
    end,
    error: startError || endError,
  };
}

export function sanitizeNavigateParams(params: any) {
  const target = trimString(params?.target);
  if (!target) {
    return { target: "" };
  }

  const lowered = target.toLowerCase();
  if (lowered === "back" || lowered === "backward" || lowered === "forward") {
    return { target: lowered };
  }

  if (UNSAFE_PROTOCOL_PATTERN.test(target)) {
    return { target: "", error: "Unsafe navigation target rejected" };
  }

  return { target };
}

export function sanitizeScrollParams(params: any) {
  const target = trimString(params?.target);
  return {
    direction: params?.direction,
    amount: params?.amount,
    target,
    error: refFormatError(target),
  };
}

export function sanitizeSnapshotParams(params: any) {
  return {
    fullPage: params?.fullPage !== false,
    detailLevel: normalizeDetailLevel(params?.detail ?? "deep"),
  };
}

export function sanitizeScreenshotParams(params: any) {
  return {
    includeRefs: params?.includeRefs === true,
    detailLevel: normalizeDetailLevel(params?.detail ?? "deep"),
  };
}
