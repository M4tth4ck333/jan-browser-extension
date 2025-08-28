import { r as reactExports, u as useComposedRefs, a as useControllableState, j as jsxRuntimeExports, c as createContextScope, P as Primitive, b as composeEventHandlers, d as usePrevious, e as useSize, f as cn, g as clientExports } from "./index.js";
var SWITCH_NAME = "Switch";
var [createSwitchContext, createSwitchScope] = createContextScope(SWITCH_NAME);
var [SwitchProvider, useSwitchContext] = createSwitchContext(SWITCH_NAME);
var Switch$1 = reactExports.forwardRef(
  (props, forwardedRef) => {
    const {
      __scopeSwitch,
      name,
      checked: checkedProp,
      defaultChecked,
      required,
      disabled,
      value = "on",
      onCheckedChange,
      form,
      ...switchProps
    } = props;
    const [button, setButton] = reactExports.useState(null);
    const composedRefs = useComposedRefs(forwardedRef, (node) => setButton(node));
    const hasConsumerStoppedPropagationRef = reactExports.useRef(false);
    const isFormControl = button ? form || !!button.closest("form") : true;
    const [checked, setChecked] = useControllableState({
      prop: checkedProp,
      defaultProp: defaultChecked ?? false,
      onChange: onCheckedChange,
      caller: SWITCH_NAME
    });
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(SwitchProvider, { scope: __scopeSwitch, checked, disabled, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        Primitive.button,
        {
          type: "button",
          role: "switch",
          "aria-checked": checked,
          "aria-required": required,
          "data-state": getState(checked),
          "data-disabled": disabled ? "" : void 0,
          disabled,
          value,
          ...switchProps,
          ref: composedRefs,
          onClick: composeEventHandlers(props.onClick, (event) => {
            setChecked((prevChecked) => !prevChecked);
            if (isFormControl) {
              hasConsumerStoppedPropagationRef.current = event.isPropagationStopped();
              if (!hasConsumerStoppedPropagationRef.current) event.stopPropagation();
            }
          })
        }
      ),
      isFormControl && /* @__PURE__ */ jsxRuntimeExports.jsx(
        SwitchBubbleInput,
        {
          control: button,
          bubbles: !hasConsumerStoppedPropagationRef.current,
          name,
          value,
          checked,
          required,
          disabled,
          form,
          style: { transform: "translateX(-100%)" }
        }
      )
    ] });
  }
);
Switch$1.displayName = SWITCH_NAME;
var THUMB_NAME = "SwitchThumb";
var SwitchThumb = reactExports.forwardRef(
  (props, forwardedRef) => {
    const { __scopeSwitch, ...thumbProps } = props;
    const context = useSwitchContext(THUMB_NAME, __scopeSwitch);
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      Primitive.span,
      {
        "data-state": getState(context.checked),
        "data-disabled": context.disabled ? "" : void 0,
        ...thumbProps,
        ref: forwardedRef
      }
    );
  }
);
SwitchThumb.displayName = THUMB_NAME;
var BUBBLE_INPUT_NAME = "SwitchBubbleInput";
var SwitchBubbleInput = reactExports.forwardRef(
  ({
    __scopeSwitch,
    control,
    checked,
    bubbles = true,
    ...props
  }, forwardedRef) => {
    const ref = reactExports.useRef(null);
    const composedRefs = useComposedRefs(ref, forwardedRef);
    const prevChecked = usePrevious(checked);
    const controlSize = useSize(control);
    reactExports.useEffect(() => {
      const input = ref.current;
      if (!input) return;
      const inputProto = window.HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(
        inputProto,
        "checked"
      );
      const setChecked = descriptor.set;
      if (prevChecked !== checked && setChecked) {
        const event = new Event("click", { bubbles });
        setChecked.call(input, checked);
        input.dispatchEvent(event);
      }
    }, [prevChecked, checked, bubbles]);
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        type: "checkbox",
        "aria-hidden": true,
        defaultChecked: checked,
        ...props,
        tabIndex: -1,
        ref: composedRefs,
        style: {
          ...props.style,
          ...controlSize,
          position: "absolute",
          pointerEvents: "none",
          opacity: 0,
          margin: 0
        }
      }
    );
  }
);
SwitchBubbleInput.displayName = BUBBLE_INPUT_NAME;
function getState(checked) {
  return checked ? "checked" : "unchecked";
}
var Root$1 = Switch$1;
var Thumb = SwitchThumb;
function Switch({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    Root$1,
    {
      "data-slot": "switch",
      className: cn(
        "peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-input/80 inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      ),
      ...props,
      children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Thumb,
        {
          "data-slot": "switch-thumb",
          className: cn(
            "bg-background dark:data-[state=unchecked]:bg-foreground dark:data-[state=checked]:bg-primary-foreground pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0"
          )
        }
      )
    }
  );
}
var NAME = "Label";
var Label$1 = reactExports.forwardRef((props, forwardedRef) => {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    Primitive.label,
    {
      ...props,
      ref: forwardedRef,
      onMouseDown: (event) => {
        const target = event.target;
        if (target.closest("button, input, select, textarea")) return;
        props.onMouseDown?.(event);
        if (!event.defaultPrevented && event.detail > 1) event.preventDefault();
      }
    }
  );
});
Label$1.displayName = NAME;
var Root = Label$1;
const Label = reactExports.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsxRuntimeExports.jsx(
  Root,
  {
    ref,
    className: cn(
      "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
      className
    ),
    ...props
  }
));
Label.displayName = Root.displayName;
const DEFAULTS = {
  provider: "custom",
  apiBase: "",
  apiKey: "",
  model: "",
  temperature: 0.2,
  bridgeToken: "",
  useBridgeToken: false,
  inlineAssistEnabled: true,
  // Only the supported actions; Custom Prompt is always available from the tooltip/shortcut.
  inlineAssistActions: ["rewrite", "translate"],
  useModelList: false,
  useApiKey: true,
  // Custom full completions URL support (for provider: custom)
  useCustomCompletionsUrl: false,
  customCompletionsUrl: "",
  // UI: dim overlay behind reading indicator (busy pre-stream)
  showReadingOverlay: false,
  // Developer: show debug popover/tools in side panel
  showDebug: false,
  // Search preferences
  ddgOnly: false,
  // Side panel: show Search button in composer
  showComposerSearchButton: true
};
function OptionsApp() {
  const [cfg, setCfg] = reactExports.useState(DEFAULTS);
  const [status, setStatus] = reactExports.useState("");
  const [bridgeInfo, setBridgeInfo] = reactExports.useState({ connected: false, url: "", usingToken: false });
  const [cmdContext, setCmdContext] = reactExports.useState("root");
  const [advOpen, setAdvOpen] = reactExports.useState(false);
  const [showApiKey, setShowApiKey] = reactExports.useState(false);
  reactExports.useRef(null);
  const [modelsState, setModelsState] = reactExports.useState({ loading: false, error: "", items: [] });
  const [cmds, setCmds] = reactExports.useState([]);
  const onToggleUseBridge = (e) => {
    const val = !!e.target.checked;
    setCfg({ ...cfg, useBridgeToken: val });
    try {
      chrome.storage.sync.set({ useBridgeToken: val });
    } catch (_) {
    }
  };
  reactExports.useEffect(() => {
    (async () => {
      const s = await chrome.storage.sync.get(Object.keys(DEFAULTS));
      setCfg({ ...DEFAULTS, ...s });
    })();
  }, []);
  reactExports.useEffect(() => {
    try {
      chrome.commands.getAll((items) => setCmds(items || []));
    } catch (_) {
    }
  }, []);
  reactExports.useEffect(() => {
    if (!cfg.useModelList) return;
    if (!cfg.apiBase) return;
    if (cfg.useApiKey && !cfg.apiKey) return;
    let cancelled = false;
    const fetchModels = async () => {
      setModelsState({ loading: true, error: "", items: [] });
      const res = await chrome.runtime.sendMessage({
        type: "LIST_MODELS",
        payload: { apiBase: cfg.apiBase, apiKey: cfg.apiKey, useApiKey: !!cfg.useApiKey }
      }).catch((e) => ({ ok: false, error: e.message }));
      if (cancelled) return;
      if (!res?.ok) {
        setModelsState({ loading: false, error: res?.error || "Failed to fetch models", items: [] });
      } else {
        const items = Array.isArray(res.models) ? res.models : [];
        const normalized = items.map((m) => ({ id: m?.id || m?.name || "", name: m?.id || m?.name || "" })).filter((m) => m.id);
        setModelsState({ loading: false, error: "", items: normalized });
      }
    };
    fetchModels();
    return () => {
      cancelled = true;
    };
  }, [cfg.useModelList, cfg.provider, cfg.apiBase, cfg.apiKey]);
  const onChange = (k) => (e) => setCfg({ ...cfg, [k]: k === "temperature" ? Number(e.target.value) : e.target.value });
  const getDefaultBase = reactExports.useCallback((provider) => {
    switch (provider) {
      case "jan-server":
        return "https://comingsoon.ai";
      case "openai":
        return "https://api.openai.com/v1";
      case "anthropic":
        return "https://api.anthropic.com/v1";
      case "openrouter":
        return "https://openrouter.ai/api/v1";
      case "cerebras":
        return "https://api.cerebras.ai/v1";
      case "jan":
        return "http://localhost:1337/v1";
      default:
        return "";
    }
  }, []);
  const isLockedProvider = reactExports.useCallback((provider) => provider === "jan-server" || provider === "openai" || provider === "anthropic" || provider === "openrouter" || provider === "cerebras" || provider === "jan", []);
  const onProviderChange = (e) => {
    const provider = e.target.value;
    const apiBase = isLockedProvider(provider) ? getDefaultBase(provider) : cfg.apiBase || "";
    setCfg({ ...cfg, provider, apiBase });
  };
  const save = async () => {
    await chrome.storage.sync.set(cfg);
    setStatus("Saved ✓");
    setTimeout(() => setStatus(""), 1500);
    if (cfg.useModelList && cfg.apiBase && (!cfg.useApiKey || cfg.apiKey)) {
      setModelsState({ loading: true, error: "", items: [] });
      const res = await chrome.runtime.sendMessage({
        type: "LIST_MODELS",
        payload: { apiBase: cfg.apiBase, apiKey: cfg.apiKey, useApiKey: !!cfg.useApiKey }
      }).catch((e) => ({ ok: false, error: e.message }));
      if (!res?.ok) setModelsState({ loading: false, error: res?.error || "Failed to fetch models", items: [] });
      else {
        const items = Array.isArray(res.models) ? res.models : [];
        const normalized = items.map((m) => ({ id: m?.id || m?.name || "", name: m?.id || m?.name || "" })).filter((m) => m.id);
        setModelsState({ loading: false, error: "", items: normalized });
      }
    }
  };
  const test = async () => {
    setStatus("Testing…");
    const res = await chrome.runtime.sendMessage({ type: "TEST_SETTINGS" }).catch((e) => ({ ok: false, error: e.message }));
    setStatus(res?.ok ? "OK ✓" : `Error: ${res?.error}`);
  };
  const copyText = async (text, okMsg = "Copied ✓") => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(okMsg);
    } catch {
      setStatus("Copy failed");
    }
    setTimeout(() => setStatus(""), 1500);
  };
  const genToken = () => {
    try {
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      const b64 = btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      setCfg({ ...cfg, bridgeToken: b64 });
      setStatus("Generated token (remember to Save)");
      setTimeout(() => setStatus(""), 1800);
    } catch (e) {
      setStatus("Failed to generate token");
      setTimeout(() => setStatus(""), 1800);
    }
  };
  const copyServerCmd = async () => {
    let cmd = "";
    if (cfg.useBridgeToken) {
      if (!cfg.bridgeToken) {
        setStatus("No token to copy");
        setTimeout(() => setStatus(""), 1200);
        return;
      }
      cmd = cmdContext === "root" ? `BRIDGE_TOKEN='${cfg.bridgeToken}' npm run dev:mcp` : `BRIDGE_TOKEN='${cfg.bridgeToken}' npm run dev`;
    } else {
      cmd = cmdContext === "root" ? `npm run dev:mcp` : `npm run dev`;
    }
    await copyText(cmd, "Copied server command ✓");
  };
  const copyEnvKey = async () => {
    await copyText("BRIDGE_TOKEN", "Copied key ✓");
  };
  const copyEnvValue = async () => {
    if (!cfg.bridgeToken) {
      setStatus("No token to copy");
      setTimeout(() => setStatus(""), 1200);
      return;
    }
    await copyText(cfg.bridgeToken, "Copied value ✓");
  };
  const reconnectBridge = async () => {
    try {
      await chrome.runtime.sendMessage({ type: "RECONNECT_BRIDGE" });
    } catch (_) {
    }
    await checkBridge();
  };
  const checkBridge = async () => {
    try {
      const s = await chrome.runtime.sendMessage({ type: "GET_BRIDGE_STATUS" });
      if (s && s.ok) setBridgeInfo({ connected: !!s.connected, url: s.url || "", usingToken: !!s.usingToken });
      else setBridgeInfo({ connected: false, url: "", usingToken: false });
      setStatus(s?.ok ? s.connected ? "Bridge: Connected ✓" : "Bridge: Disconnected" : "Bridge: Unknown");
    } catch (_) {
      setBridgeInfo({ connected: false, url: "", usingToken: false });
      setStatus("Bridge: Unknown");
    }
    setTimeout(() => setStatus(""), 1500);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-screen ds-bg ds-text font-sans", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("header", { className: "px-4 py-4 border-b ds-border ds-card", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "typo-display font-display num-oldstyle", children: "Jan Summarizer – Settings" }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "p-4 max-w-2xl mx-auto space-y-5 reading", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm ds-muted-text small-caps", children: "Provider Preset" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { value: cfg.provider, onChange: onProviderChange, className: "input", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "jan-server", children: "Jan Server (Cloud)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "jan", children: "Jan (Local)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "openai", children: "OpenAI" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "anthropic", children: "Anthropic (shim required)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "openrouter", children: "OpenRouter" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "cerebras", children: "Cerebras (OpenAI-compatible)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "custom", children: "Custom" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm ds-muted-text small-caps", children: "API Base URL" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            className: "input",
            value: cfg.apiBase,
            onChange: onChange("apiBase"),
            placeholder: "https://comingsoon.ai, https://api.openai.com/v1, https://openrouter.ai/api/v1, http://localhost:1337/v1",
            disabled: isLockedProvider(cfg.provider),
            readOnly: isLockedProvider(cfg.provider)
          }
        ),
        isLockedProvider(cfg.provider) && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs ds-muted-text", children: "Endpoint locked for preset. Switch to Custom to edit." })
      ] }),
      cfg.provider === "custom" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-sm font-medium text-foreground small-caps", children: "Use full completions URL" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 text-sm text-foreground", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "use-custom-url", className: "text-foreground/80 cursor-pointer", children: "Off" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Switch,
              {
                id: "use-custom-url",
                checked: !!cfg.useCustomCompletionsUrl,
                onCheckedChange: (v) => {
                  const useCustomCompletionsUrl = !!v;
                  setCfg({ ...cfg, useCustomCompletionsUrl });
                  try {
                    chrome.storage.sync.set({ useCustomCompletionsUrl });
                  } catch (_) {
                  }
                },
                "aria-label": "Toggle using full completions URL"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "use-custom-url", className: "text-foreground/80 cursor-pointer", children: "On" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            className: "input",
            value: cfg.customCompletionsUrl,
            onChange: onChange("customCompletionsUrl"),
            placeholder: "e.g. https://your-endpoint.example.com/v1/chat/completions",
            disabled: !cfg.useCustomCompletionsUrl,
            readOnly: !cfg.useCustomCompletionsUrl
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs ds-muted-text", children: "When On, the extension will call this URL directly for chat completions (streaming and non-streaming). API Base above is still used for model listing." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm ds-muted-text small-caps", children: "API Key" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 text-sm text-foreground", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "use-api-key", className: "text-foreground/80 cursor-pointer", children: "Off" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Switch,
              {
                id: "use-api-key",
                checked: !!cfg.useApiKey,
                onCheckedChange: (v) => {
                  const useApiKey = !!v;
                  setCfg({ ...cfg, useApiKey });
                  try {
                    chrome.storage.sync.set({ useApiKey });
                  } catch (_) {
                  }
                },
                "aria-label": "Toggle using API key"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "use-api-key", className: "text-foreground/80 cursor-pointer", children: "On" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2 items-stretch", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              className: "input flex-1",
              type: showApiKey ? "text" : "password",
              value: cfg.apiKey,
              onChange: onChange("apiKey"),
              placeholder: "sk-…",
              autoComplete: "off",
              disabled: !cfg.useApiKey
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              className: "btn",
              onClick: () => setShowApiKey((v) => !v),
              "aria-label": showApiKey ? "Hide API key" : "Show API key",
              disabled: !cfg.useApiKey,
              children: showApiKey ? "Hide" : "Show"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-6 border ds-border ds-muted-bg rounded-xl p-4 space-y-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "typo-h1 font-display", children: "Debug" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm ds-muted-text", children: "Show debug tools (e.g., payload preview) in the side panel header." })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 text-sm text-foreground", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "show-debug", className: "text-foreground/80 cursor-pointer", children: "Off" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Switch,
            {
              id: "show-debug",
              checked: !!cfg.showDebug,
              onCheckedChange: (v) => {
                const showDebug = !!v;
                setCfg({ ...cfg, showDebug });
                try {
                  chrome.storage.sync.set({ showDebug });
                } catch (_) {
                }
              },
              "aria-label": "Toggle debug tools in side panel"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "show-debug", className: "text-foreground/80 cursor-pointer", children: "On" })
        ] })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-sm font-medium text-foreground small-caps", children: "Model" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 text-sm text-foreground", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "use-model-list", className: "text-foreground/80 cursor-pointer", children: "Manual" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Switch,
              {
                id: "use-model-list",
                checked: !!cfg.useModelList,
                onCheckedChange: (v) => {
                  const useModelList = !!v;
                  setCfg({ ...cfg, useModelList });
                  try {
                    chrome.storage.sync.set({ useModelList });
                  } catch (_) {
                  }
                },
                "aria-label": "Toggle model list dropdown"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "use-model-list", className: "text-foreground/80 cursor-pointer", children: "Dropdown" })
          ] })
        ] }),
        !cfg.useModelList ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            className: "input",
            value: cfg.model,
            onChange: onChange("model"),
            placeholder: "e.g. llama3.1-8b, mixtral, etc."
          }
        ) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2 items-stretch", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "select",
            {
              className: "input flex-1",
              value: cfg.model,
              onChange: onChange("model"),
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: modelsState.loading ? "Loading…" : "Select a model" }),
                modelsState.items.map((m) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: m.id, children: m.name }, m.id))
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              className: "btn",
              onClick: async () => {
                setModelsState((s) => ({ ...s, loading: true, error: "" }));
                const res = await chrome.runtime.sendMessage({
                  type: "LIST_MODELS",
                  payload: { apiBase: cfg.apiBase, apiKey: cfg.apiKey, useApiKey: !!cfg.useApiKey }
                }).catch((e) => ({ ok: false, error: e.message }));
                if (!res?.ok) setModelsState({ loading: false, error: res?.error || "Failed to fetch models", items: [] });
                else {
                  const items = Array.isArray(res.models) ? res.models : [];
                  const normalized = items.map((m) => ({ id: m?.id || m?.name || "", name: m?.id || m?.name || "" })).filter((m) => m.id);
                  setModelsState({ loading: false, error: "", items: normalized });
                }
              },
              disabled: modelsState.loading,
              "aria-label": "Refresh model list",
              children: modelsState.loading ? "…" : "Refresh"
            }
          )
        ] }),
        cfg.useModelList && modelsState.error && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-red-600", children: modelsState.error })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm ds-muted-text small-caps", children: "Temperature" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "number", step: "0.1", min: "0", max: "2", className: "input", value: cfg.temperature, onChange: onChange("temperature") })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 pt-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn btn-brand", onClick: save, children: "Save" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn btn-brand", onClick: test, children: "Test" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm ds-muted-text", children: status })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-6 border ds-border ds-muted-bg rounded-xl p-4 space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "typo-h1 font-display", children: "Keyboard Shortcuts" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm ds-muted-text", children: "Chrome might not auto-assign suggested keys. Set/confirm them in Shortcuts." })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                className: "btn",
                onClick: async () => {
                  try {
                    await chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
                  } catch (_) {
                    setStatus("Open chrome://extensions/shortcuts");
                    setTimeout(() => setStatus(""), 1800);
                  }
                },
                children: "Open Shortcuts"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn", onClick: () => {
              try {
                chrome.commands.getAll((items) => setCmds(items || []));
              } catch (_) {
              }
            }, children: "Refresh" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "text-sm grid gap-1", children: cmds.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ds-muted-text small-caps", children: c.description || c.name }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2 py-0.5 text-xs rounded bg-black/5", children: c.shortcut || "Unassigned" })
        ] }, c.name)) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-6 border ds-border ds-muted-bg rounded-xl p-4 space-y-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-between", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "typo-h1 font-display", children: "Search Preferences" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm ds-muted-text", children: "Control how the extension searches the web." })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm ds-muted-text", children: "DuckDuckGo only (no Google fallback)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 text-sm text-foreground", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "ddg-only", className: "text-foreground/80 cursor-pointer", children: "Off" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Switch,
              {
                id: "ddg-only",
                checked: !!cfg.ddgOnly,
                onCheckedChange: (v) => {
                  const ddgOnly = !!v;
                  setCfg({ ...cfg, ddgOnly });
                  try {
                    chrome.storage.sync.set({ ddgOnly });
                  } catch (_) {
                  }
                },
                "aria-label": "Toggle DuckDuckGo only mode"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "ddg-only", className: "text-foreground/80 cursor-pointer", children: "On" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm ds-muted-text", children: "Show Search button in composer" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 text-sm text-foreground", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "show-composer-search", className: "text-foreground/80 cursor-pointer", children: "Off" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Switch,
              {
                id: "show-composer-search",
                checked: !!cfg.showComposerSearchButton,
                onCheckedChange: (v) => {
                  const showComposerSearchButton = !!v;
                  setCfg({ ...cfg, showComposerSearchButton });
                  try {
                    chrome.storage.sync.set({ showComposerSearchButton });
                  } catch (_) {
                  }
                },
                "aria-label": "Toggle Search button visibility in composer"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "show-composer-search", className: "text-foreground/80 cursor-pointer", children: "On" })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-6 border ds-border ds-muted-bg rounded-xl p-4 space-y-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-between", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "typo-h1 font-display", children: "Reading Indicator" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm ds-muted-text", children: "Control visual emphasis when the extension is reading/scraping." })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm ds-muted-text", children: "Dim overlay during reading" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 text-sm text-foreground", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "show-reading-overlay", className: "text-foreground/80 cursor-pointer", children: "Off" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Switch,
              {
                id: "show-reading-overlay",
                checked: !!cfg.showReadingOverlay,
                onCheckedChange: (v) => {
                  const showReadingOverlay = !!v;
                  setCfg({ ...cfg, showReadingOverlay });
                  try {
                    chrome.storage.sync.set({ showReadingOverlay });
                  } catch (_) {
                  }
                },
                "aria-label": "Toggle dim overlay during reading"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "show-reading-overlay", className: "text-foreground/80 cursor-pointer", children: "On" })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-6 border ds-border ds-muted-bg rounded-xl p-4 space-y-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "typo-h1 font-display", children: "Inline Assistant (Tooltip)" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm ds-muted-text", children: "Show a small Jan button near text when selecting in inputs/contenteditable." })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 text-sm text-foreground", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "inline-assist-enabled", className: "text-foreground/80 cursor-pointer", children: "Off" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Switch,
              {
                id: "inline-assist-enabled",
                checked: !!cfg.inlineAssistEnabled,
                onCheckedChange: (v) => setCfg({ ...cfg, inlineAssistEnabled: !!v }),
                "aria-label": "Toggle inline assistant"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "inline-assist-enabled", className: "text-foreground/80 cursor-pointer", children: "On" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm ds-muted-text small-caps", children: "Actions" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-2 gap-2 text-sm", children: [
            { id: "rewrite", label: "Rewrite" },
            { id: "translate", label: "Translate" }
          ].map((a) => /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "inline-flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "checkbox", className: "w-4 h-4", checked: cfg.inlineAssistActions?.includes(a.id), onChange: (e) => {
              const next = new Set(cfg.inlineAssistActions || []);
              if (e.target.checked) next.add(a.id);
              else next.delete(a.id);
              setCfg({ ...cfg, inlineAssistActions: Array.from(next) });
            } }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: a.label })
          ] }, a.id)) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs ds-muted-text", children: "Custom Prompt is always available from the tooltip menu and keyboard shortcut. Save to apply changes. Copy uses the page clipboard API; Apply replaces the current selection." })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-6 border ds-border ds-muted-bg rounded-xl p-4 space-y-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "typo-h1 font-display flex items-center gap-2", children: [
              "Bridge (MCP)",
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] px-1.5 py-0.5 rounded-full bg-black/5 ds-muted-text relative top-[1px]", children: "safer" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm ds-muted-text", children: "Token and connection" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full ${bridgeInfo.connected ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-block w-2 h-2 rounded-full ${bridgeInfo.connected ? "bg-green-600" : "bg-red-600"}` }),
            bridgeInfo.connected ? "Connected" : "Disconnected"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm ds-muted-text", children: "Use token for bridge auth (default: off)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 text-sm text-foreground", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "use-bridge-token", className: "text-foreground/80 cursor-pointer", children: "Off" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Switch, { id: "use-bridge-token", checked: !!cfg.useBridgeToken, onCheckedChange: (v) => onToggleUseBridge({ target: { checked: v } }), "aria-label": "Toggle bridge token usage" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "use-bridge-token", className: "text-foreground/80 cursor-pointer", children: "On" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm ds-muted-text small-caps", children: "Bridge Token (optional)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col sm:flex-row gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input flex-1", value: cfg.bridgeToken || "", onChange: onChange("bridgeToken"), placeholder: "Set if server uses BRIDGE_TOKEN" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn", onClick: genToken, children: "Generate" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn", onClick: copyEnvValue, disabled: !cfg.bridgeToken, children: "Copy value" })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs ds-muted-text", children: "The extension will only send this token if the toggle above is On." })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm ds-muted-text small-caps", children: "Server command" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col sm:flex-row items-start sm:items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "inline-flex rounded-lg overflow-hidden border ds-border", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: `px-3 py-1.5 text-sm ${cmdContext === "root" ? "bg-black/5 font-semibold" : ""}`, onClick: () => setCmdContext("root"), children: "From root" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: `px-3 py-1.5 text-sm ${cmdContext === "mcp" ? "bg-black/5 font-semibold" : ""}`, onClick: () => setCmdContext("mcp"), children: "In mcp/" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn", onClick: copyServerCmd, disabled: !!cfg.useBridgeToken && !cfg.bridgeToken, children: "Copy server command" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs ds-muted-text", children: [
            "Run the copied command in the selected location. ",
            cfg.useBridgeToken ? "It uses your token as BRIDGE_TOKEN." : "No token will be used."
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "text-xs underline ds-muted-text", onClick: () => setAdvOpen(!advOpen), children: advOpen ? "Hide advanced" : "Show advanced" }),
          advOpen && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 flex flex-wrap gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn", onClick: copyEnvKey, children: "Copy Key (BRIDGE_TOKEN)" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn", onClick: copyEnvValue, disabled: !cfg.bridgeToken, children: "Copy Value" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 pt-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn btn-pastel-rev", onClick: async () => {
            await save();
            await reconnectBridge();
          }, children: "Save & Reconnect" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "text-sm underline", onClick: checkBridge, children: "Check bridge" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs ds-muted-text", children: [
            bridgeInfo.url || "",
            bridgeInfo.usingToken ? " • token:on" : ""
          ] })
        ] })
      ] })
    ] })
  ] });
}
const root = clientExports.createRoot(document.getElementById("root"));
root.render(/* @__PURE__ */ jsxRuntimeExports.jsx(OptionsApp, {}));
//# sourceMappingURL=options.js.map
