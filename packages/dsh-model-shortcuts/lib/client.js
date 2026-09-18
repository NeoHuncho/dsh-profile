window.__ModuleLoader__.load({
	id: "dsh-model-shortcuts",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// packages/dsh-model-shortcuts/src/client.jsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react = __toESM(require("react"), 1);

// packages/dsh-model-shortcuts/src/shortcut.js
var NAMED_KEYS = {
  "`": "Backquote",
  backquote: "Backquote",
  grave: "Backquote",
  "-": "Minus",
  "=": "Equal",
  "[": "BracketLeft",
  "]": "BracketRight",
  "\\": "Backslash",
  ";": "Semicolon",
  "'": "Quote",
  ",": "Comma",
  ".": "Period",
  "/": "Slash",
  space: "Space",
  enter: "Enter",
  return: "Enter",
  escape: "Escape",
  esc: "Escape",
  tab: "Tab",
  backspace: "Backspace",
  delete: "Delete",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight"
};
var MODIFIERS = {
  ctrl: "ctrl",
  control: "ctrl",
  shift: "shift",
  alt: "alt",
  option: "alt",
  meta: "meta",
  cmd: "meta",
  win: "meta",
  command: "meta"
};
var MOD_LABEL = { ctrl: "Ctrl", shift: "Shift", alt: "Alt", meta: "Meta" };
function parseShortcut(input) {
  if (typeof input !== "string") return null;
  const parts = input.split("+").map((p) => p.trim().toLowerCase()).filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  const spec = { ctrl: false, shift: false, alt: false, meta: false, code: null, label: null };
  const mods = [];
  while (parts.length > 1) {
    const mod = MODIFIERS[parts.shift()];
    if (mod === void 0 || spec[mod]) return null;
    spec[mod] = true;
    mods.push(mod);
  }
  const token = parts[0];
  if (token === void 0) return null;
  let code = null;
  let keyLabel = null;
  if (/^[a-z]$/.test(token)) {
    code = "Key" + token.toUpperCase();
    keyLabel = token.toUpperCase();
  } else if (/^[0-9]$/.test(token)) {
    code = "Digit" + token;
    keyLabel = token;
  } else if (NAMED_KEYS[token] !== void 0) {
    code = NAMED_KEYS[token];
    keyLabel = token === "backquote" || token === "grave" ? "`" : token;
  } else if (/^f([1-9]|1[0-2])$/.test(token)) {
    code = "F" + token.slice(1);
    keyLabel = code;
  } else {
    return null;
  }
  spec.code = code;
  spec.label = [...mods.map((m) => MOD_LABEL[m]), keyLabel].join("+");
  return spec;
}
function matchesShortcut(spec, event) {
  if (spec === null || spec === void 0) return false;
  if (event.code !== spec.code) return false;
  return event.ctrlKey === spec.ctrl && event.shiftKey === spec.shift && event.altKey === spec.alt && event.metaKey === spec.meta;
}

// raw-css:/Users/williamguinaudie/.dsh/profiles/web/packages/dsh-model-shortcuts/src/picker.css
var picker_default = "/* Overlay picker for the model / reasoning-effort shortcuts. */\n\n.dsh-ms-overlay {\n  position: fixed;\n  inset: 0;\n  z-index: 1200;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  background: rgba(0, 0, 0, 0.32);\n  animation: dsh-ms-fade 0.09s ease-out;\n}\n\n@keyframes dsh-ms-fade {\n  from { opacity: 0; }\n  to { opacity: 1; }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .dsh-ms-overlay { animation: none; }\n}\n\n.dsh-ms-card {\n  display: flex;\n  flex-direction: column;\n  box-sizing: border-box;\n  width: max-content;\n  min-width: min(340px, 92vw);\n  max-width: min(520px, 92vw);\n  max-height: min(70vh, 560px);\n  padding: 6px;\n  overflow: hidden;\n  color: var(--dsw-alias-label-primary, #111);\n  background: var(--dsw-specific-menu, #fff);\n  border-radius: 18px;\n  box-shadow: var(--dsw-elevation-prominent, 0 12px 40px rgba(0, 0, 0, 0.3));\n}\n\n.dsh-ms-head {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: 12px;\n  padding: 8px 10px 6px;\n}\n\n.dsh-ms-title {\n  font-size: 13px;\n  font-weight: 600;\n  line-height: 18px;\n}\n\n.dsh-ms-hint {\n  font-size: 11px;\n  line-height: 16px;\n  color: var(--dsw-alias-label-tertiary, rgba(0, 0, 0, 0.5));\n  white-space: nowrap;\n}\n\n.dsh-ms-list {\n  display: flex;\n  flex-direction: column;\n  min-height: 0;\n  overflow-y: auto;\n}\n\n.dsh-ms-group {\n  padding: 8px 10px 2px;\n  font-size: 11px;\n  font-weight: 500;\n  line-height: 16px;\n  color: var(--dsw-alias-label-tertiary, rgba(0, 0, 0, 0.5));\n  position: sticky;\n  top: 0;\n  background: var(--dsw-specific-menu, #fff);\n  z-index: 1;\n}\n\n.dsh-ms-row {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  box-sizing: border-box;\n  width: auto;\n  min-width: 100%;\n  min-height: 38px;\n  padding: 6px 10px;\n  color: inherit;\n  font: inherit;\n  font-size: 14px;\n  line-height: 20px;\n  text-align: left;\n  background: transparent;\n  border: 0;\n  border-radius: 10px;\n  outline: none;\n  cursor: pointer;\n}\n\n.dsh-ms-row:hover,\n.dsh-ms-row:focus-visible,\n.dsh-ms-row[data-active='true'] {\n  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.14));\n}\n\n.dsh-ms-num {\n  flex: none;\n  display: grid;\n  place-items: center;\n  min-width: 20px;\n  height: 20px;\n  font-size: 11px;\n  font-weight: 600;\n  border-radius: 6px;\n  color: var(--dsw-alias-label-secondary, rgba(0, 0, 0, 0.65));\n  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.14));\n}\n\n.dsh-ms-copy {\n  display: flex;\n  flex-direction: column;\n  flex: 1;\n  min-width: 0;\n}\n\n.dsh-ms-name {\n  overflow: hidden;\n  font-weight: 500;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n}\n\n.dsh-ms-note {\n  overflow: hidden;\n  font-size: 11px;\n  line-height: 16px;\n  color: var(--dsw-alias-label-tertiary, rgba(0, 0, 0, 0.5));\n  white-space: nowrap;\n  text-overflow: ellipsis;\n}\n\n.dsh-ms-check {\n  flex: none;\n  font-size: 12px;\n  color: var(--dsw-alias-label-secondary, rgba(0, 0, 0, 0.65));\n}\n\n.dsh-ms-status {\n  padding: 10px;\n  font-size: 13px;\n  line-height: 20px;\n  color: var(--dsw-alias-label-tertiary, rgba(0, 0, 0, 0.5));\n}\n";

// packages/dsh-model-shortcuts/src/client.jsx
var import_jsx_runtime = require("react/jsx-runtime");
var inject = ["slots", "modelDirectories", "sessions"];
var DEFAULTS = {
  modelShortcuts: ["ctrl+shift+m", "ctrl+shift+k"],
  effortShortcuts: ["ctrl+shift+l", "ctrl+shift+u"],
  numberSelect: true
};
function parseBindings(inputs, fallback) {
  const specs = (Array.isArray(inputs) ? inputs : []).map((entry) => parseShortcut(entry)).filter((spec) => spec !== null);
  if (specs.length > 0) return specs;
  return fallback.map((entry) => parseShortcut(entry)).filter((spec) => spec !== null);
}
function matchesAny(specs, event) {
  for (const spec of specs) {
    if (matchesShortcut(spec, event)) return true;
  }
  return false;
}
function installStyles(css) {
  if (typeof document === "undefined") return () => {
  };
  if (document.querySelector("style[data-dsh-model-shortcuts]") !== null) return () => {
  };
  const tag = document.createElement("style");
  tag.dataset.dshModelShortcuts = "picker";
  tag.textContent = css;
  document.head.appendChild(tag);
  return () => tag.remove();
}
function apply(ctx) {
  ctx.effect(() => installStyles(picker_default), "model-shortcuts: styles");
  const prefsStore = createPrefsStore();
  ctx.slots.inject(
    "conversation.input.overlay",
    () => ctx.slots.register(
      { name: "conversation.input.overlay", id: "model-shortcuts", order: 120 },
      (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        ModelShortcuts,
        {
          ctx,
          prefsStore,
          sessionId: props?.sessionId
        }
      )
    )
  );
}
var PREFS_KEY = "dsh-model-shortcuts:prefs";
function readStoredPrefs() {
  const value = { ...DEFAULTS };
  if (typeof localStorage === "undefined") return value;
  let incoming;
  try {
    incoming = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
  } catch {
    return value;
  }
  if (incoming === null || typeof incoming !== "object") return value;
  const model = toBindingList(incoming.modelShortcut ?? incoming.modelShortcuts);
  const effort = toBindingList(incoming.effortShortcut ?? incoming.effortShortcuts);
  if (model !== null) value.modelShortcuts = model;
  if (effort !== null) value.effortShortcuts = effort;
  if (typeof incoming.numberSelect === "boolean") value.numberSelect = incoming.numberSelect;
  return value;
}
function toBindingList(input) {
  if (typeof input === "string") return [input];
  if (!Array.isArray(input)) return null;
  const out = input.filter((entry) => typeof entry === "string");
  return out.length > 0 ? out : null;
}
function createPrefsStore() {
  let value = readStoredPrefs();
  const listeners = /* @__PURE__ */ new Set();
  return {
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener);
      const onStorage = (event) => {
        if (event.key !== null && event.key !== PREFS_KEY) return;
        value = readStoredPrefs();
        for (const fn of listeners) fn();
      };
      if (listeners.size === 1 && typeof window !== "undefined") {
        window.addEventListener("storage", onStorage);
      }
      return () => {
        listeners.delete(listener);
        if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
      };
    }
  };
}
function ModelShortcuts({ ctx, prefsStore, sessionId }) {
  const prefs = import_react.default.useSyncExternalStore(prefsStore.subscribe, prefsStore.getSnapshot);
  const sessionList = ctx.sessions.list;
  const subscribeSessionList = import_react.default.useCallback(
    (listener) => sessionList.subscribe(listener),
    [sessionList]
  );
  const getSessionSnapshot = import_react.default.useCallback(
    () => sessionList.getSnapshot(),
    [sessionList]
  );
  const sessionState = import_react.default.useSyncExternalStore(
    subscribeSessionList,
    getSessionSnapshot,
    getSessionSnapshot
  );
  const effectiveSessionId = sessionId ?? sessionState?.current ?? null;
  const sessionPhase = sessionState?.phase;
  const [mode, setMode] = import_react.default.useState(null);
  const [cursor, setCursor] = import_react.default.useState(0);
  const [directory, setDirectory] = import_react.default.useState(null);
  const resolveDirectory = import_react.default.useCallback(() => {
    if (!effectiveSessionId) return null;
    try {
      const next = ctx.modelDirectories.directoryFor(effectiveSessionId);
      setDirectory((current2) => current2 === next ? current2 : next);
      return next;
    } catch {
      return null;
    }
  }, [ctx, effectiveSessionId]);
  import_react.default.useEffect(() => {
    setDirectory(null);
    resolveDirectory();
  }, [resolveDirectory, effectiveSessionId, sessionPhase]);
  const subscribeDirectory = import_react.default.useCallback(
    (listener) => directory ? directory.store.subscribe(listener) : () => {
    },
    [directory]
  );
  const getDirectorySnapshot = import_react.default.useCallback(
    () => directory ? directory.store.getSnapshot() : null,
    [directory]
  );
  const state = import_react.default.useSyncExternalStore(
    subscribeDirectory,
    getDirectorySnapshot,
    getDirectorySnapshot
  );
  const models = import_react.default.useMemo(() => {
    if (state === null) return [];
    const out = [];
    for (const group of state.groups) {
      for (const model of group.models) {
        out.push({
          provider: group.id,
          providerName: group.name,
          id: model.id,
          name: model.name,
          reasoning: model.reasoning
        });
      }
    }
    return out;
  }, [state]);
  const current = state?.current ?? null;
  const efforts = import_react.default.useMemo(() => {
    if (current === null) return [];
    const entry = models.find((m) => m.provider === current.provider && m.id === current.model);
    return entry?.reasoning?.efforts ?? [];
  }, [models, current]);
  const options = import_react.default.useMemo(() => {
    if (mode === "model") {
      return models.map((m) => ({
        key: `${m.provider}/${m.id}`,
        name: m.name,
        note: m.providerName,
        active: current !== null && current.provider === m.provider && current.model === m.id,
        selection: {
          provider: m.provider,
          model: m.id,
          ...m.reasoning?.defaultEffort ? { reasoningEffort: m.reasoning.defaultEffort } : {}
        }
      }));
    }
    if (mode === "effort") {
      return efforts.map((e) => ({
        key: e.id,
        name: e.name,
        note: e.description ?? "",
        active: current !== null && current.reasoningEffort === e.id,
        selection: current === null ? null : { provider: current.provider, model: current.model, reasoningEffort: e.id }
      }));
    }
    return [];
  }, [mode, models, efforts, current]);
  const close = import_react.default.useCallback(() => setMode(null), []);
  const choose = import_react.default.useCallback(
    (index) => {
      const activeDirectory = directory ?? resolveDirectory();
      const option = options[index];
      if (option === void 0 || option.selection === null || activeDirectory === null) return;
      activeDirectory.select(option.selection).catch(() => {
      });
      close();
    },
    [options, directory, resolveDirectory, close]
  );
  const open = import_react.default.useCallback(
    (next) => {
      const activeDirectory = directory ?? resolveDirectory();
      if (activeDirectory === null) return;
      activeDirectory.load().catch(() => {
      });
      setMode((prev) => prev === next ? null : next);
      setCursor(0);
    },
    [directory, resolveDirectory]
  );
  import_react.default.useEffect(() => {
    if (mode === null) return;
    const index = options.findIndex((o) => o.active);
    if (index >= 0) setCursor(index);
  }, [mode, options]);
  const modelSpecs = import_react.default.useMemo(
    () => parseBindings(prefs.modelShortcuts, DEFAULTS.modelShortcuts),
    [prefs.modelShortcuts]
  );
  const effortSpecs = import_react.default.useMemo(
    () => parseBindings(prefs.effortShortcuts, DEFAULTS.effortShortcuts),
    [prefs.effortShortcuts]
  );
  import_react.default.useEffect(() => {
    const onKey = (event) => {
      if (matchesAny(modelSpecs, event)) {
        event.preventDefault();
        event.stopPropagation();
        open("model");
        return;
      }
      if (matchesAny(effortSpecs, event)) {
        event.preventDefault();
        event.stopPropagation();
        open("effort");
        return;
      }
      if (mode === null) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setCursor((c) => {
          const size = options.length;
          if (size === 0) return 0;
          return (c + delta + size) % size;
        });
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        choose(cursor);
        return;
      }
      if (prefs.numberSelect && /^[1-9]$/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        choose(Number(event.key) - 1);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [
    modelSpecs,
    effortSpecs,
    mode,
    options,
    cursor,
    choose,
    close,
    open,
    prefs.numberSelect
  ]);
  if (mode === null) return null;
  const title = mode === "model" ? "Switch model" : "Reasoning effort";
  const binding = (mode === "model" ? modelSpecs : effortSpecs).map((spec) => spec.label).join(" / ");
  const keys = prefs.numberSelect ? "press 1\u20139 \xB7 Esc" : "\u2191\u2193 \xB7 Enter \xB7 Esc";
  const hint = binding ? `${binding} \xB7 ${keys}` : keys;
  let body;
  if (options.length > 0) {
    body = options.map((option, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        type: "button",
        className: "dsh-ms-row",
        "data-active": index === cursor ? "true" : "false",
        onMouseEnter: () => setCursor(index),
        onClick: () => choose(index),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-ms-num", children: index < 9 ? index + 1 : "\xB7" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsh-ms-copy", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-ms-name", children: option.name }),
            option.note ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-ms-note", children: option.note }) : null
          ] }),
          option.active ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-ms-check", children: "\u2713" }) : null
        ]
      },
      option.key
    ));
  } else if (state?.status === "loading") {
    body = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-ms-status", children: "Loading\u2026" });
  } else if (mode === "effort") {
    body = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-ms-status", children: "This model exposes no reasoning effort levels." });
  } else {
    body = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-ms-status", children: "No models available." });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-ms-overlay", role: "presentation", onClick: close, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      className: "dsh-ms-card",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": title,
      onClick: (event) => event.stopPropagation(),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-ms-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-ms-title", children: title }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-ms-hint", children: hint })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-ms-list", children: body })
      ]
    }
  ) });
}

		return module.exports;
	}
});
