const trimString = (value: unknown): string => {
  return typeof value === "string" ? value.trim() : value !== undefined && value !== null ? String(value).trim() : "";
};

const UNSAFE_PROTOCOL_PATTERN =
  /^(javascript:|data:|file:|vbscript:|chrome:|edge:|safari-extension:|moz-extension:|opera:)/i;

export function sanitizeClickParams(params: any) {
  return {
    target: trimString(params?.target),
  };
}

export function sanitizeRefParams(params: any) {
  return {
    ref: trimString(params?.ref),
  };
}

export function sanitizeTypeParams(params: any) {
  return {
    target: trimString(params?.target),
    text:
      typeof params?.text === "string"
        ? params.text
        : params?.text !== undefined && params?.text !== null
          ? String(params.text)
          : undefined,
    clear: params?.clear !== false,
    submit: params?.submit === true,
  };
}

export function sanitizeInputParams(params: any) {
  return {
    target: trimString(params?.target),
    value: params?.value,
    values: Array.isArray(params?.values)
      ? params.values.map((v: unknown) => String(v))
      : undefined,
  };
}

export function sanitizeDragParams(params: any) {
  return {
    start: trimString(params?.start),
    end: trimString(params?.end),
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

export function sanitizeSnapshotParams(params: any) {
  return {
    fullPage: params?.fullPage !== false,
  };
}

export function sanitizeScreenshotParams(params: any) {
  return {
    includeRefs: params?.includeRefs !== false,
  };
}
