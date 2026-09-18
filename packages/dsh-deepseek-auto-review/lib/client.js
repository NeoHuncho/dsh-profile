window.__ModuleLoader__.load({
	id: "dsh-deepseek-auto-review",
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

// src/client.jsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react = __toESM(require("react"), 1);
var inject = ["slots"];
var FALLBACK = {
  label: "DSH Review",
  title: "DSH Auto Review",
  unavailable: "Review projection unavailable.",
  enabled: "ON",
  disabled: "OFF",
  reviewer: "Reviewer"
};
function installStyles() {
  if (typeof document === "undefined") return () => void 0;
  if (document.querySelector("style[data-dsh-deepseek-auto-review]")) return () => void 0;
  const tag = document.createElement("style");
  tag.dataset.dshDeepseekAutoReview = "panel";
  tag.textContent = `
[data-dsh-deepseek-auto-review]{font-family:inherit;color:var(--dsw-color-text,#1f2328)}
[data-dsh-deepseek-auto-review-button]{display:inline-flex;align-items:center;cursor:pointer;background:transparent;border:1px solid var(--dsw-color-border,rgba(128,128,128,.3));border-radius:6px;padding:3px 8px;font-size:12px;color:inherit}
[data-dsh-deepseek-auto-review-panel]{position:absolute;z-index:40;min-width:320px;max-width:440px;max-height:70vh;overflow-y:auto;background:var(--dsw-color-surface,#fff);border:1px solid var(--dsw-color-border,rgba(128,128,128,.3));border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:12px;font-size:12px;line-height:1.5}
[data-dsh-deepseek-auto-review-row]{display:flex;justify-content:space-between;gap:8px;padding:3px 0}
[data-dsh-deepseek-auto-review-title]{font-weight:600;margin-bottom:6px}
[data-dsh-deepseek-auto-review-section]{border-top:1px solid var(--dsw-color-border,rgba(128,128,128,.3));margin:8px 0;padding-top:8px}
[data-dsh-deepseek-auto-review-muted]{color:var(--dsw-color-text-muted,#6b7280)}
[data-dsh-deepseek-auto-review-allow]{color:var(--dsw-color-success,#16a34a)}
[data-dsh-deepseek-auto-review-deny]{color:var(--dsw-color-danger,#dc2626)}
[data-dsh-deepseek-auto-review-failed]{color:var(--dsw-color-warning,#b45309)}
`;
  document.head.appendChild(tag);
  return () => tag.remove();
}
function Panel({ useProjection }) {
  const [open, setOpen] = import_react.default.useState(false);
  const value = typeof useProjection === "function" ? useProjection("deepseekAutoReview") : void 0;
  if (!value) return null;
  return import_react.default.createElement(
    "div",
    { "data-dsh-deepseek-auto-review": true },
    import_react.default.createElement("button", { type: "button", "data-dsh-deepseek-auto-review-button": true, "aria-expanded": open, onClick: () => setOpen((previous) => !previous) }, FALLBACK.label),
    open && import_react.default.createElement(
      "div",
      { "data-dsh-deepseek-auto-review-panel": true },
      import_react.default.createElement("div", { "data-dsh-deepseek-auto-review-title": true }, FALLBACK.title),
      import_react.default.createElement("div", { "data-dsh-deepseek-auto-review-row": true }, import_react.default.createElement("span", null, "State"), import_react.default.createElement("strong", null, value.enabled ? FALLBACK.enabled : FALLBACK.disabled)),
      import_react.default.createElement("div", { "data-dsh-deepseek-auto-review-row": true }, import_react.default.createElement("span", null, FALLBACK.reviewer), import_react.default.createElement("span", { "data-dsh-deepseek-auto-review-muted": true }, `${value.reviewerProvider} / ${value.reviewerModel} (${value.reasoningEffort})`)),
      import_react.default.createElement(
        "div",
        { "data-dsh-deepseek-auto-review-section": true },
        import_react.default.createElement("div", { "data-dsh-deepseek-auto-review-muted": true }, "Each reviewed action is reported inline on the tool call it governs.")
      )
    )
  );
}
function apply(ctx) {
  ctx.effect(() => installStyles(), "dsh-auto-review: styles");
  ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({ name: "conversation.session.header.actions", id: "dsh-auto-review", order: 40 }, Panel));
}

		return module.exports;
	}
});
