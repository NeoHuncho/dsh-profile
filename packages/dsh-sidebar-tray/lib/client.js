window.__ModuleLoader__.load({
	id: "dsh-sidebar-tray",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.jsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);

// src/spaces.js
var DEFAULT_SPACE_ID = "default";
var DEFAULT_SPACE_NAME = "Default";
function normalizeSpaces(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object") continue;
    const id = typeof entry.id === "string" ? entry.id : "";
    if (id === "" || id === DEFAULT_SPACE_ID || seen.has(id)) continue;
    seen.add(id);
    const workspaceIds = Array.isArray(entry.workspaceIds) ? [...new Set(entry.workspaceIds.filter((w) => typeof w === "string" && w.length > 0))] : [];
    out.push({ id, name: typeof entry.name === "string" && entry.name.trim() !== "" ? entry.name : "Space", workspaceIds });
  }
  return out;
}
function deriveSpaces(spaces, workspaces, options = {}) {
  const claimed = /* @__PURE__ */ new Map();
  for (const space of spaces) {
    for (const id of space.workspaceIds) if (!claimed.has(id)) claimed.set(id, space.id);
  }
  const spaceOf = (workspace) => {
    const direct = claimed.get(workspace.workspaceId);
    if (direct !== void 0) return direct;
    const parent = options.parentOf?.(workspace);
    if (parent !== void 0 && claimed.has(parent)) return claimed.get(parent);
    return DEFAULT_SPACE_ID;
  };
  const buckets = /* @__PURE__ */ new Map([[DEFAULT_SPACE_ID, []]]);
  for (const space of spaces) buckets.set(space.id, []);
  for (const workspace of workspaces) buckets.get(spaceOf(workspace)).push(workspace);
  return [
    { id: DEFAULT_SPACE_ID, name: DEFAULT_SPACE_NAME, builtin: true, workspaces: buckets.get(DEFAULT_SPACE_ID) },
    ...spaces.map((space) => ({ id: space.id, name: space.name, builtin: false, workspaces: buckets.get(space.id) }))
  ];
}
function spaceOfWorkspace(spaces, workspaceId) {
  return spaces.find((space) => space.workspaceIds.includes(workspaceId))?.id ?? DEFAULT_SPACE_ID;
}
function spaceInitials(name) {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// src/settled-store.js
var NS = "sidebar-tray";
var DEFAULTS = {
  settledSessionIds: [],
  shortcutsEnabled: true,
  sessionsPerWorkspace: 5,
  settledPreviewCount: 5,
  spaces: [],
  activeSpaceId: DEFAULT_SPACE_ID
};
function normalize(value) {
  const raw = value === null || typeof value !== "object" ? {} : value;
  const ids = Array.isArray(raw.settledSessionIds) ? raw.settledSessionIds : [];
  const spaces = normalizeSpaces(raw.spaces);
  const active = typeof raw.activeSpaceId === "string" ? raw.activeSpaceId : DEFAULT_SPACE_ID;
  return {
    // De-duplicate defensively: a hand-edited settings document is a supported
    // input, and a duplicated id would render the same row twice.
    settledSessionIds: [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))],
    shortcutsEnabled: raw.shortcutsEnabled !== false,
    sessionsPerWorkspace: positive(raw.sessionsPerWorkspace, DEFAULTS.sessionsPerWorkspace),
    settledPreviewCount: positive(raw.settledPreviewCount, DEFAULTS.settledPreviewCount),
    spaces,
    // A deleted space must never leave the sidebar pointing at nothing.
    activeSpaceId: active === DEFAULT_SPACE_ID || spaces.some((s) => s.id === active) ? active : DEFAULT_SPACE_ID
  };
}
function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : fallback;
}
function createSettledStore(remote) {
  let state = { ...DEFAULTS };
  let revision;
  const listeners = /* @__PURE__ */ new Set();
  const emit = () => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (error) {
        console.error("[dsh-sidebar-tray] store listener failed", error);
      }
    }
  };
  const settings = () => remote?.settings;
  async function reload() {
    const api = settings();
    if (api?.describe === void 0) return;
    try {
      const result = await api.describe();
      if (result?.ok !== true) return;
      const view = (result.value?.namespaces ?? []).find((entry) => entry.ns === NS);
      if (view === void 0) return;
      revision = view.revision;
      const next = normalize(view.value);
      if (JSON.stringify(next) === JSON.stringify(state)) return;
      state = next;
      emit();
    } catch (error) {
      console.error("[dsh-sidebar-tray] could not read tray settings", error);
    }
  }
  async function persist(writes) {
    const api = settings();
    if (api?.mutate === void 0) return;
    try {
      const ops = writes.map(([path, value]) => ({ op: "set", path: [path], value }));
      const result = await api.mutate(NS, ops, revision);
      if (result?.ok === true) {
        revision = result.value?.revision ?? revision;
        return;
      }
      await reload();
    } catch (error) {
      console.error("[dsh-sidebar-tray] could not persist tray settings", error);
      await reload();
    }
  }
  function write(patch) {
    state = normalize({ ...state, ...patch });
    emit();
    void persist(Object.entries(patch));
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reload,
    /** Most recently settled first, so the drawer preview shows the latest five. */
    settle(sessionId) {
      if (state.settledSessionIds.includes(sessionId)) return;
      write({ settledSessionIds: [sessionId, ...state.settledSessionIds] });
    },
    unsettle(sessionId) {
      if (!state.settledSessionIds.includes(sessionId)) return;
      write({ settledSessionIds: state.settledSessionIds.filter((id) => id !== sessionId) });
    },
    // ── Spaces ────────────────────────────────────────────────────────────
    setActiveSpace(spaceId) {
      if (spaceId === state.activeSpaceId) return;
      write({ activeSpaceId: spaceId });
    },
    createSpace(name) {
      const trimmed = String(name ?? "").trim();
      if (trimmed === "") return void 0;
      const id = `space-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      write({ spaces: [...state.spaces, { id, name: trimmed, workspaceIds: [] }], activeSpaceId: id });
      return id;
    },
    renameSpace(spaceId, name) {
      const trimmed = String(name ?? "").trim();
      if (trimmed === "") return;
      write({ spaces: state.spaces.map((s) => s.id === spaceId ? { ...s, name: trimmed } : s) });
    },
    /** Deleting a space returns its workspaces to Default (they are simply unclaimed). */
    deleteSpace(spaceId) {
      if (!state.spaces.some((s) => s.id === spaceId)) return;
      write({
        spaces: state.spaces.filter((s) => s.id !== spaceId),
        activeSpaceId: state.activeSpaceId === spaceId ? DEFAULT_SPACE_ID : state.activeSpaceId
      });
    },
    moveSpace(spaceId, direction) {
      const index = state.spaces.findIndex((s) => s.id === spaceId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= state.spaces.length) return;
      const next = [...state.spaces];
      [next[index], next[target]] = [next[target], next[index]];
      write({ spaces: next });
    },
    /** Claim a workspace for `spaceId`; `default` (or undefined) un-claims it. */
    assignWorkspace(workspaceId, spaceId) {
      const spaces = state.spaces.map((s) => {
        const without = s.workspaceIds.filter((id) => id !== workspaceId);
        return s.id === spaceId ? { ...s, workspaceIds: [...without, workspaceId] } : { ...s, workspaceIds: without };
      });
      write({ spaces });
    }
  };
}

// src/derive.js
var UNGROUPED_KEY = "";
function workspaceLabel(cwd) {
  if (typeof cwd !== "string" || cwd === "") return "";
  const parts = cwd.split(/[\\/]/).filter((part) => part.length > 0);
  return parts.length > 0 ? parts[parts.length - 1] : cwd;
}
function byRecency(a, b) {
  if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
  return a.id < b.id ? -1 : 1;
}
function visible(session, current, archived, settled) {
  if (session === void 0) return false;
  if (session.origin === "subagent") return false;
  if (archived.has(session.id)) return false;
  if (settled.has(session.id)) return false;
  return !session.blank || session.id === current;
}
function indexSubagentDescendants(byId) {
  const indexed = /* @__PURE__ */ new Map();
  for (const descendant of Object.values(byId)) {
    if (descendant.origin !== "subagent") continue;
    const seen = /* @__PURE__ */ new Set();
    let current = descendant;
    while (current?.origin === "subagent" && current.parentId !== void 0 && !seen.has(current.id)) {
      seen.add(current.id);
      const aggregate = indexed.get(current.parentId);
      if (aggregate === void 0) {
        indexed.set(current.parentId, { runningCount: descendant.running ? 1 : 0 });
      } else if (descendant.running) {
        aggregate.runningCount += 1;
      }
      current = byId[current.parentId];
    }
  }
  return indexed;
}
function hasActiveSchedule(session) {
  return (session.projectionValues?.schedule?.length ?? 0) > 0;
}
function pendingKind(kind) {
  return kind === "approval" || kind === "plan-review" || kind === "question" ? kind : void 0;
}
function sessionNode(summary, descendants, pendingInteractions) {
  const pending = pendingKind(pendingInteractions?.get?.(summary.id)?.kind);
  return {
    id: summary.id,
    title: summary.blank ? "" : summary.displayTitle,
    blank: summary.blank === true,
    running: summary.running === true,
    runningSubagentCount: descendants.get(summary.id)?.runningCount ?? 0,
    completed: summary.completed === true,
    hasActiveSchedule: hasActiveSchedule(summary),
    updatedAt: summary.updatedAt ?? 0,
    ...pending === void 0 ? {} : { pendingInteraction: pending }
  };
}
function owningGroupKey(workspaces, sessionId) {
  return workspaces.find((workspace) => workspace.sessionIds.includes(sessionId))?.workspaceId ?? UNGROUPED_KEY;
}
function deriveGroups(list, workspaces, archivedSessionIds, settledSessionIds, pendingInteractions, view) {
  const archived = new Set(archivedSessionIds ?? []);
  const settled = new Set(settledSessionIds ?? []);
  const expanded = new Set(view.expandedGroups ?? []);
  const shownAll = new Set(view.shownGroups ?? []);
  const perGroup = view.perGroup ?? 5;
  const descendants = indexSubagentDescendants(list.byId ?? {});
  const currentGroup = list.current === void 0 ? void 0 : owningGroupKey(workspaces, list.current);
  const accounted = /* @__PURE__ */ new Set();
  const groups = [];
  for (const workspace of workspaces) {
    const members = [];
    for (const id of workspace.sessionIds) {
      const summary = list.byId?.[id];
      if (summary === void 0) continue;
      accounted.add(id);
      if (!visible(summary, list.current, archived, settled)) continue;
      members.push(summary);
    }
    groups.push(
      buildGroup({
        key: workspace.workspaceId,
        workspaceId: workspace.workspaceId,
        cwd: workspace.path,
        label: workspace.title,
        members,
        // Workspace membership is a user-arranged order; do not re-sort it.
        sort: false,
        descendants,
        pendingInteractions,
        expanded: expanded.has(workspace.workspaceId),
        showAll: shownAll.has(workspace.workspaceId),
        perGroup,
        containsCurrent: workspace.workspaceId === currentGroup
      })
    );
  }
  const stray = view.includeStray === false ? [] : (list.ids ?? []).map((id) => list.byId?.[id]).filter((summary) => summary !== void 0 && !accounted.has(summary.id) && visible(summary, list.current, archived, settled));
  if (stray.length > 0) {
    groups.push(
      buildGroup({
        key: UNGROUPED_KEY,
        workspaceId: void 0,
        cwd: void 0,
        label: "",
        members: stray,
        sort: true,
        descendants,
        pendingInteractions,
        expanded: expanded.has(UNGROUPED_KEY),
        showAll: shownAll.has(UNGROUPED_KEY),
        perGroup,
        containsCurrent: currentGroup === UNGROUPED_KEY
      })
    );
  }
  return groups;
}
function buildGroup(input) {
  const members = input.sort ? [...input.members].sort(byRecency) : [...input.members];
  const nodes = members.map((summary) => sessionNode(summary, input.descendants, input.pendingInteractions));
  const capped = input.showAll ? nodes : nodes.slice(0, input.perGroup);
  return {
    key: input.key,
    workspaceId: input.workspaceId,
    cwd: input.cwd,
    label: input.label,
    sessionCount: nodes.length,
    expanded: input.expanded,
    containsCurrent: input.containsCurrent,
    // Rows actually rendered — the numbering source of truth.
    sessions: input.expanded ? capped : [],
    hiddenCount: input.expanded ? Math.max(0, nodes.length - capped.length) : 0,
    showingAll: input.showAll
  };
}
function deriveSearchResults(input) {
  const { list, workspaces, query, archivedSessionIds, settledSessionIds, pendingInteractions, content, limit } = input;
  const normalized = query.trim().toLowerCase();
  if (normalized === "") return { items: [], hasMore: false };
  const archived = new Set(archivedSessionIds ?? []);
  const settled = new Set(settledSessionIds ?? []);
  const descendants = indexSubagentDescendants(list.byId ?? {});
  const workspaceById = /* @__PURE__ */ new Map();
  for (const workspace of workspaces) {
    for (const id of workspace.sessionIds) workspaceById.set(id, workspace.title || workspaceLabel(workspace.path));
  }
  const eligible = (summary) => summary !== void 0 && summary.origin !== "subagent" && // A blank row has no durable title, so it can never match a query.
  !summary.blank && !archived.has(summary.id) && !settled.has(summary.id);
  const matches = (summary) => {
    const workspace = workspaceById.get(summary.id) ?? "";
    return (summary.displayTitle ?? "").toLowerCase().includes(normalized) || (summary.cwd ?? "").toLowerCase().includes(normalized) || workspace.toLowerCase().includes(normalized);
  };
  const toRow = (summary, snippet) => {
    const node = sessionNode(summary, descendants, pendingInteractions);
    return {
      id: summary.id,
      title: summary.displayTitle,
      workspace: workspaceById.get(summary.id) ?? workspaceLabel(summary.cwd),
      running: node.running,
      runningSubagentCount: node.runningSubagentCount,
      completed: node.completed,
      hasActiveSchedule: node.hasActiveSchedule,
      pendingInteraction: node.pendingInteraction,
      ...snippet === void 0 ? {} : { snippet }
    };
  };
  const rows = [];
  const seen = /* @__PURE__ */ new Set();
  for (const summary of (list.ids ?? []).map((id) => list.byId?.[id]).filter(eligible).sort(byRecency)) {
    if (!matches(summary)) continue;
    seen.add(summary.id);
    rows.push(toRow(summary));
  }
  for (const item of content?.items ?? []) {
    const summary = list.byId?.[item.sessionId];
    if (!eligible(summary)) continue;
    if (seen.has(summary.id)) {
      const existing = rows.find((row) => row.id === summary.id);
      if (existing !== void 0 && existing.snippet === void 0 && item.snippet !== void 0) {
        existing.snippet = item.snippet;
      }
      continue;
    }
    seen.add(summary.id);
    rows.push(toRow(summary, item.snippet));
  }
  const bounded = rows.slice(0, limit);
  return { items: bounded, hasMore: (content?.hasMore ?? false) || rows.length > bounded.length };
}
function deriveSettled(list, settledSessionIds, workspaces) {
  const workspaceById = /* @__PURE__ */ new Map();
  for (const workspace of workspaces) {
    for (const id of workspace.sessionIds) workspaceById.set(id, workspace.title || workspaceLabel(workspace.path));
  }
  const rows = [];
  for (const id of settledSessionIds ?? []) {
    const summary = list.byId?.[id];
    if (summary === void 0) continue;
    rows.push({
      id,
      title: summary.displayTitle || id,
      workspace: workspaceById.get(id) ?? workspaceLabel(summary.cwd),
      updatedAt: summary.updatedAt ?? 0,
      running: summary.running === true
    });
  }
  return rows;
}

// src/shortcuts.js
function chordActive(event) {
  return (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey;
}
function useShortcutActivation(React, enabled, onActivate) {
  const handler = React.useRef(onActivate);
  handler.current = onActivate;
  React.useEffect(() => {
    if (!enabled) return void 0;
    const onKeyDown = (event) => {
      if (!chordActive(event)) return;
      const match = /^Digit([1-9])$/.exec(event.code ?? "");
      if (match === null) return;
      event.preventDefault();
      event.stopPropagation();
      handler.current?.(Number(match[1]));
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled]);
}

// raw-css:/Users/williamguinaudie/.dsh/profiles/web/packages/dsh-sidebar-tray/src/tray.css
var tray_default = "/*\n * Tray styling.\n *\n * Every colour, radius and easing comes from the shell's own design tokens\n * (--dsw-alias-*, --ds-ease-*), so the replacement region inherits theme\n * switches, font-size preferences and the sidebar's scrollbar treatment\n * without restating any literal value the shell owns.\n */\n\n.tray-root {\n  --tray-edge-inset: var(--dsh-sidebar-inline-padding, 12px);\n  box-sizing: border-box;\n  display: flex;\n  flex: 1;\n  flex-direction: column;\n  min-height: 0;\n  padding-right: var(--tray-edge-inset);\n}\n\n.tray-root.tray-rail {\n  padding-right: 0;\n}\n\n/* \u2500\u2500 header \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.tray-header {\n  box-sizing: border-box;\n  display: flex;\n  flex: none;\n  align-items: center;\n  gap: 4px;\n  height: 36px;\n  margin-bottom: 4px;\n  padding-left: 4px;\n  color: var(--dsw-alias-label-tertiary);\n  overflow: hidden;\n}\n\n.tray-header-label {\n  flex: 1;\n  min-width: 0;\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n  line-height: 20px;\n}\n\n.tray-icon-button {\n  display: inline-flex;\n  flex: none;\n  align-items: center;\n  justify-content: center;\n  width: 28px;\n  height: 28px;\n  padding: 0;\n  color: var(--dsw-alias-label-secondary);\n  background: none;\n  border: none;\n  border-radius: 50%;\n  cursor: pointer;\n  font-size: 15px;\n  line-height: 1;\n}\n\n.tray-icon-button:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.tray-icon-button:focus-visible {\n  outline: 1px solid var(--dsw-alias-state-business-primary);\n  outline-offset: -1px;\n}\n\n/* \u2500\u2500 search \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.tray-search {\n  box-sizing: border-box;\n  display: flex;\n  flex: none;\n  align-items: center;\n  gap: 4px;\n  height: 30px;\n  margin: 0 0 6px;\n  padding: 0 6px;\n  color: var(--dsw-alias-label-caption);\n  background: none;\n  border: 0.5px solid var(--dsw-alias-border-l4);\n  border-radius: 10px;\n}\n\n.tray-search-input {\n  flex: 1;\n  min-width: 0;\n  color: var(--dsw-alias-label-primary);\n  background: none;\n  border: none;\n  outline: none;\n  font-size: 13px;\n  line-height: 18px;\n}\n\n.tray-search-input::placeholder {\n  color: var(--dsw-alias-label-tertiary);\n}\n\n/* \u2500\u2500 list body \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.tray-body {\n  flex: 1;\n  min-height: 0;\n  overflow-y: auto;\n  overflow-x: hidden;\n}\n\n.tray-group {\n  margin-bottom: 2px;\n}\n\n.tray-project-row,\n.tray-session-row {\n  box-sizing: border-box;\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  padding: 0 8px;\n  color: var(--dsw-alias-label-primary);\n  border-radius: 8px;\n  cursor: pointer;\n  user-select: none;\n}\n\n.tray-project-row {\n  height: 34px;\n}\n\n.tray-session-row {\n  gap: 0;\n  height: 32px;\n  animation: tray-row-in 0.15s var(--ds-ease-in-out);\n}\n\n@keyframes tray-row-in {\n  0% {\n    opacity: 0;\n  }\n}\n\n.tray-project-row:hover,\n.tray-session-row:hover,\n.tray-session-row.tray-selected {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.tray-arrow {\n  display: inline-flex;\n  flex: none;\n  align-items: center;\n  justify-content: center;\n  width: 16px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n  transition: transform 0.15s var(--ds-ease-in-out);\n}\n\n.tray-arrow-open {\n  transform: rotate(90deg);\n}\n\n.tray-project-label {\n  flex: 1;\n  min-width: 0;\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n  font-size: 14px;\n  line-height: 20px;\n}\n\n.tray-project-count {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n  line-height: 20px;\n}\n\n/* Status dot slot: keeps titles aligned whether or not a dot is present. */\n.tray-slot {\n  display: inline-flex;\n  flex: none;\n  align-items: center;\n  justify-content: center;\n  width: 16px;\n  height: 20px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.tray-dot {\n  width: 6px;\n  height: 6px;\n  border-radius: 50%;\n  background: currentColor;\n}\n\n.tray-dot-running {\n  color: var(--dsw-alias-state-business-primary);\n}\n\n.tray-dot-attention {\n  color: var(--dsw-alias-state-warning-primary, #d98a25);\n}\n\n.tray-dot-done {\n  color: var(--dsw-alias-state-success-primary, #35a06a);\n}\n\n.tray-session-title {\n  flex: 1;\n  min-width: 0;\n  margin: 0 6px 0 4px;\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n  font-size: 14px;\n  line-height: 20px;\n}\n\n.tray-session-time {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n  line-height: 20px;\n}\n\n.tray-session-row:hover .tray-session-time,\n.tray-session-row.tray-menu-open .tray-session-time {\n  display: none;\n}\n\n.tray-row-actions {\n  display: none;\n  flex: none;\n  align-items: center;\n  gap: 6px;\n}\n\n.tray-project-row:hover .tray-row-actions,\n.tray-session-row:hover .tray-row-actions,\n.tray-session-row.tray-menu-open .tray-row-actions,\n.tray-project-row.tray-menu-open .tray-row-actions {\n  display: inline-flex;\n}\n\n.tray-row-button {\n  display: inline-flex;\n  flex: none;\n  align-items: center;\n  justify-content: center;\n  width: 18px;\n  height: 18px;\n  padding: 0;\n  color: var(--dsw-alias-label-tertiary);\n  background: none;\n  border: none;\n  border-radius: 4px;\n  cursor: pointer;\n  font-size: 13px;\n  line-height: 1;\n}\n\n.tray-row-button:hover {\n  color: var(--dsw-alias-label-primary);\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n/* \u2500\u2500 Spaces \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n/*\n * A horizontal strip of pills under the header (Arc/Zen style). The active\n * pill is filled; hovering a pill reveals its Ctrl+Shift number.\n */\n.tray-spaces {\n  position: relative;\n  display: flex;\n  flex: none;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 4px;\n  margin: 0 0 6px;\n  padding: 0 4px;\n}\n\n.tray-space {\n  display: inline-flex;\n  flex: none;\n  align-items: center;\n  gap: 5px;\n  height: 24px;\n  max-width: 100%;\n  padding: 0 9px;\n  color: var(--dsw-alias-label-secondary);\n  background: none;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: 12px;\n  cursor: pointer;\n  font-size: 12px;\n  line-height: 1;\n  transition: background var(--ds-ease-fast, 120ms), color var(--ds-ease-fast, 120ms);\n}\n\n.tray-space:hover {\n  color: var(--dsw-alias-label-primary);\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.tray-space-active,\n.tray-space-active:hover {\n  color: var(--dsw-alias-label-primary);\n  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-interactive-bg-hover));\n  border-color: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2));\n  font-weight: 600;\n}\n\n.tray-space-label {\n  min-width: 0;\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n}\n\n.tray-space-count {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n  font-variant-numeric: tabular-nums;\n}\n\n.tray-space-key {\n  display: none;\n  min-width: 14px;\n  height: 14px;\n  padding: 0 3px;\n  color: var(--dsw-alias-label-tertiary);\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: 4px;\n  font-size: 10px;\n  font-weight: 600;\n  line-height: 13px;\n  text-align: center;\n  font-variant-numeric: tabular-nums;\n}\n\n.tray-space:hover .tray-space-key {\n  display: inline-block;\n}\n\n.tray-space-add {\n  width: 24px;\n  padding: 0;\n  justify-content: center;\n  border-style: dashed;\n  font-size: 13px;\n}\n\n/* Collapsed rail: vertical stack of initials. */\n.tray-spaces-rail {\n  flex-direction: column;\n  flex-wrap: nowrap;\n  padding: 0;\n  margin-top: 6px;\n}\n\n.tray-spaces-rail .tray-space {\n  width: 28px;\n  height: 28px;\n  padding: 0;\n  justify-content: center;\n  border-radius: 8px;\n  font-size: 11px;\n  font-weight: 600;\n}\n\n.tray-space-menu {\n  position: absolute;\n  top: calc(100% + 4px);\n  left: 4px;\n  z-index: 20;\n  display: flex;\n  flex-direction: column;\n  min-width: 160px;\n  padding: 4px;\n  background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base));\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: 10px;\n  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);\n}\n\n.tray-space-menu-title {\n  padding: 4px 8px 6px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n}\n\n.tray-space-menu button {\n  padding: 6px 8px;\n  color: var(--dsw-alias-label-primary);\n  text-align: left;\n  background: none;\n  border: none;\n  border-radius: 6px;\n  cursor: pointer;\n  font-size: 12px;\n}\n\n.tray-space-menu button:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.tray-space-menu-danger {\n  color: var(--dsw-alias-status-error, #d33) !important;\n}\n\n/* \u2500\u2500 show more / empty / status \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.tray-more {\n  display: block;\n  width: 100%;\n  margin: 0;\n  padding: 4px 8px 4px 30px;\n  color: var(--dsw-alias-label-tertiary);\n  text-align: left;\n  background: none;\n  border: none;\n  border-radius: 8px;\n  cursor: pointer;\n  font-size: 12px;\n  line-height: 18px;\n}\n\n.tray-more:hover {\n  color: var(--dsw-alias-label-primary);\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.tray-status {\n  padding: 10px 8px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 13px;\n  line-height: 18px;\n}\n\n/* \u2500\u2500 search results \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.tray-result-row {\n  box-sizing: border-box;\n  display: flex;\n  flex-direction: column;\n  align-items: stretch;\n  width: 100%;\n  min-height: 44px;\n  padding: 4px 8px;\n  color: var(--dsw-alias-label-primary);\n  text-align: left;\n  background: none;\n  border: none;\n  border-radius: 8px;\n  cursor: pointer;\n}\n\n.tray-result-row:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.tray-result-title {\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n  font-size: 14px;\n  line-height: 20px;\n}\n\n.tray-result-meta {\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n  line-height: 17px;\n}\n\n.tray-result-snippet {\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  line-height: 17px;\n}\n\n/* \u2500\u2500 settled drawer \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n/*\n * Pinned to the foot of the region, directly above the shell's Settings row,\n * and never scrolls away with the list.\n */\n.tray-settled {\n  flex: none;\n  margin-top: 4px;\n  padding-top: 4px;\n  border-top: 0.5px solid var(--dsw-alias-border-l1);\n}\n\n.tray-settled-header {\n  box-sizing: border-box;\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  width: 100%;\n  height: 32px;\n  padding: 0 8px;\n  color: var(--dsw-alias-label-secondary);\n  text-align: left;\n  background: none;\n  border: none;\n  border-radius: 8px;\n  cursor: pointer;\n}\n\n.tray-settled-header:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.tray-settled-label {\n  flex: 1;\n  min-width: 0;\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n  font-size: 13px;\n  line-height: 20px;\n}\n\n.tray-settled-count {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n  line-height: 20px;\n}\n\n.tray-settled-list {\n  max-height: 40vh;\n  overflow-y: auto;\n}\n\n.tray-settled-row .tray-session-title {\n  color: var(--dsw-alias-label-secondary);\n}\n\n/* \u2500\u2500 rail (collapsed sidebar) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.tray-rail .tray-header {\n  justify-content: flex-start;\n  margin-bottom: 12px;\n  padding-left: 0;\n}\n\n.tray-rail .tray-icon-button {\n  width: 36px;\n  height: 36px;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* \u2500\u2500 environment child workspaces (nested under their project) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.tray-group-nested {\n  margin-left: 14px;\n  padding-left: 6px;\n  border-left: 1px solid var(--dsw-alias-border-l2);\n}\n\n.tray-env-dot {\n  display: inline-block;\n  flex: none;\n  width: 6px;\n  height: 6px;\n  margin-right: 6px;\n  border-radius: 50%;\n  background: var(--dsw-alias-label-tertiary);\n}\n\n.tray-env-dot-running {\n  background: #3fb950;\n  box-shadow: 0 0 0 2px rgba(63, 185, 80, 0.2);\n}\n";

// src/client.jsx
var SEARCH_DEBOUNCE_MS = 200;
var EMPTY_PENDING = /* @__PURE__ */ new Map();
function timeLabel(value, now) {
  if (!Number.isFinite(value) || value <= 0) return "";
  const seconds = Math.max(0, Math.round((now - value) / 1e3));
  if (seconds < 60) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.round(months / 12)}y`;
}
function statusClass(node) {
  if (node.pendingInteraction !== void 0) return "tray-dot-attention";
  if (node.running || node.runningSubagentCount > 0) return "tray-dot-running";
  if (node.completed) return "tray-dot-done";
  return null;
}
function StatusDot({ React, node }) {
  const tone = statusClass(node);
  return React.createElement(
    "span",
    { className: "tray-slot" },
    tone === null ? null : React.createElement("span", { className: `tray-dot ${tone}` })
  );
}
function SpaceBar({ React, spaces, activeSpaceId, onSelect, onCreate, onRename, onDelete, onMove, rail }) {
  const [menuFor, setMenuFor] = React.useState(null);
  React.useEffect(() => {
    if (menuFor === null) return void 0;
    const close = () => setMenuFor(null);
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", close, true);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", close, true);
    };
  }, [menuFor]);
  const pills = spaces.map((space, index) => {
    const active = space.id === activeSpaceId;
    const number = index + 1;
    return React.createElement(
      "button",
      {
        type: "button",
        key: space.id,
        className: `tray-space${active ? " tray-space-active" : ""}`,
        title: `${space.name} \u2014 Ctrl+Shift+${number <= 9 ? number : ""}`.replace(/Ctrl\+Shift\+$/, ""),
        "aria-pressed": active,
        onClick: () => onSelect(space.id),
        onContextMenu: (event) => {
          event.preventDefault();
          setMenuFor(space.id);
        }
      },
      React.createElement("span", { className: "tray-space-label" }, rail ? spaceInitials(space.name) : space.name),
      rail || space.workspaces.length === 0 ? null : React.createElement("span", { className: "tray-space-count" }, String(space.workspaces.length)),
      number <= 9 && !rail ? React.createElement("kbd", { className: "tray-space-key", "aria-hidden": "true" }, String(number)) : null
    );
  });
  const menuSpace = menuFor === null ? void 0 : spaces.find((s) => s.id === menuFor);
  const menu = menuSpace === void 0 ? null : React.createElement(
    "div",
    { className: "tray-space-menu", role: "menu", onPointerDown: (event) => event.stopPropagation() },
    React.createElement("div", { className: "tray-space-menu-title" }, menuSpace.name),
    React.createElement(
      "button",
      { type: "button", role: "menuitem", onClick: () => {
        setMenuFor(null);
        onRename(menuSpace.id, menuSpace.name);
      } },
      "Rename\u2026"
    ),
    menuSpace.builtin ? null : React.createElement("button", { type: "button", role: "menuitem", onClick: () => {
      setMenuFor(null);
      onMove(menuSpace.id, -1);
    } }, "Move left"),
    menuSpace.builtin ? null : React.createElement("button", { type: "button", role: "menuitem", onClick: () => {
      setMenuFor(null);
      onMove(menuSpace.id, 1);
    } }, "Move right"),
    menuSpace.builtin ? null : React.createElement(
      "button",
      {
        type: "button",
        role: "menuitem",
        className: "tray-space-menu-danger",
        onClick: () => {
          setMenuFor(null);
          if (window.confirm(`Delete space \u201C${menuSpace.name}\u201D? Its workspaces move back to Default.`)) onDelete(menuSpace.id);
        }
      },
      "Delete space"
    )
  );
  return React.createElement(
    "div",
    { className: `tray-spaces${rail ? " tray-spaces-rail" : ""}`, role: "tablist", "aria-label": "Spaces" },
    ...pills,
    React.createElement(
      "button",
      {
        type: "button",
        className: "tray-space tray-space-add",
        title: "New space",
        "aria-label": "New space",
        onClick: () => {
          const name = window.prompt("Name the new space");
          if (name !== null && name.trim() !== "") onCreate(name);
        }
      },
      "\uFF0B"
    ),
    menu
  );
}
function SessionRow({ React, node, selected, now, onOpen, onSettle, onRename, onFork, onArchive }) {
  const stop = (event, run) => {
    event.stopPropagation();
    event.preventDefault();
    run();
  };
  const title = node.blank || node.title === "" ? "New session" : node.title;
  return React.createElement(
    "div",
    {
      className: `tray-session-row${selected ? " tray-selected" : ""}`,
      role: "treeitem",
      "aria-selected": selected,
      "data-session-id": node.id,
      title,
      onClick: () => onOpen(node.id)
    },
    React.createElement(StatusDot, { React, node }),
    React.createElement("span", { className: "tray-session-title" }, title),
    React.createElement("span", { className: "tray-session-time" }, timeLabel(node.updatedAt, now)),
    node.blank ? null : React.createElement(
      "span",
      { className: "tray-row-actions" },
      React.createElement(
        "button",
        {
          type: "button",
          className: "tray-row-button",
          title: "Settle conversation",
          "aria-label": `Settle ${title}`,
          onClick: (event) => stop(event, () => onSettle(node.id))
        },
        "\u25BE"
      ),
      React.createElement(
        "button",
        {
          type: "button",
          className: "tray-row-button",
          title: "Rename",
          "aria-label": `Rename ${title}`,
          onClick: (event) => stop(event, () => onRename(node.id, node.title))
        },
        "\u270E"
      ),
      React.createElement(
        "button",
        {
          type: "button",
          className: "tray-row-button",
          title: "Fork session",
          "aria-label": `Fork ${title}`,
          onClick: (event) => stop(event, () => onFork(node.id))
        },
        "\u2387"
      ),
      React.createElement(
        "button",
        {
          type: "button",
          className: "tray-row-button",
          title: "Archive session",
          "aria-label": `Archive ${title}`,
          onClick: (event) => stop(event, () => onArchive(node.id))
        },
        "\u2715"
      )
    )
  );
}
function SidebarTray(props) {
  const {
    React,
    wide,
    useSessions,
    useWorkspaces,
    useSessionPendingInteraction,
    settledStore,
    // Named `tray` rather than `actions`: the slot framework already supplies
    // an `actions` prop for a registered store's bound actions, and shadowing
    // it here would be a silent collision the day this entry gains a store.
    tray
  } = props;
  const list = useSessions((state) => state);
  const workspaceSnapshot = useWorkspaces((state) => state) || {};
  const allWorkspaces = workspaceSnapshot.items ?? [];
  const archivedSessionIds = workspaceSnapshot.archivedSessionIds ?? [];
  const settled = React.useSyncExternalStore(settledStore.subscribe, settledStore.getSnapshot);
  const [envParents, setEnvParents] = React.useState(() => window.__dshEnvParents__ ?? {});
  React.useEffect(() => {
    const sync = () => setEnvParents(window.__dshEnvParents__ ?? {});
    window.addEventListener("dsh-env-registry", sync);
    sync();
    return () => window.removeEventListener("dsh-env-registry", sync);
  }, []);
  const spaces = React.useMemo(
    () => deriveSpaces(settled.spaces, allWorkspaces, { parentOf: (workspace) => envParents[workspace.workspaceId] }),
    [settled.spaces, allWorkspaces, envParents]
  );
  const activeSpace = spaces.find((space) => space.id === settled.activeSpaceId) ?? spaces[0];
  const workspaces = activeSpace.workspaces;
  const showStray = activeSpace.id === DEFAULT_SPACE_ID;
  const [expandedGroups, setExpandedGroups] = React.useState(null);
  const [shownGroups, setShownGroups] = React.useState([]);
  const [settledOpen, setSettledOpen] = React.useState(false);
  const [settledShowAll, setSettledShowAll] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [content, setContent] = React.useState({ items: [], hasMore: false });
  const [searchState, setSearchState] = React.useState("idle");
  const [now, setNow] = React.useState(() => Date.now());
  const [flowBusy, setFlowBusy] = React.useState(false);
  const [flowError, setFlowError] = React.useState(null);
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 3e4);
    return () => clearInterval(id);
  }, []);
  const pendingInteractions = useSessionPendingInteraction((state) => state) ?? EMPTY_PENDING;
  const effectiveExpanded = React.useMemo(
    () => expandedGroups === null ? [...workspaces.map((w) => w.workspaceId), ""] : expandedGroups,
    [expandedGroups, workspaces]
  );
  const groups = React.useMemo(
    () => deriveGroups(
      list,
      workspaces,
      archivedSessionIds,
      settled.settledSessionIds,
      pendingInteractions,
      {
        expandedGroups: effectiveExpanded,
        shownGroups,
        perGroup: settled.sessionsPerWorkspace,
        includeStray: showStray
      }
    ),
    [list, workspaces, archivedSessionIds, settled, pendingInteractions, effectiveExpanded, shownGroups, showStray]
  );
  useShortcutActivation(React, settled.shortcutsEnabled, (index) => {
    const target = spaces[index - 1];
    if (target !== void 0) settledStore.setActiveSpace(target.id);
  });
  const spaceBar = React.createElement(SpaceBar, {
    React,
    spaces,
    activeSpaceId: activeSpace.id,
    rail: wide === false,
    onSelect: (id) => settledStore.setActiveSpace(id),
    onCreate: (name) => settledStore.createSpace(name),
    onRename: (id, current) => {
      const next = window.prompt("Rename space", current);
      if (next !== null && next.trim() !== "" && next.trim() !== current) settledStore.renameSpace(id, next);
    },
    onDelete: (id) => settledStore.deleteSpace(id),
    onMove: (id, direction) => settledStore.moveSpace(id, direction)
  });
  const moveWorkspaceToSpace = (workspaceId) => {
    const current = spaceOfWorkspace(settled.spaces, workspaceId);
    const options = spaces.map((space, index) => `${index + 1}. ${space.name}${space.id === current ? " (current)" : ""}`);
    const answer = window.prompt(`Move workspace to which space?

${options.join("\n")}

Enter a number:`);
    if (answer === null) return;
    const target = spaces[Number(answer.trim()) - 1];
    if (target === void 0 || target.id === current) return;
    settledStore.assignWorkspace(workspaceId, target.id);
  };
  React.useEffect(() => {
    const normalized = query.trim();
    setContent({ items: [], hasMore: false });
    if (normalized === "") {
      setSearchState("idle");
      return void 0;
    }
    setSearchState("loading");
    const controller = new AbortController();
    const timer = setTimeout(() => {
      Promise.resolve(tray.searchSessions(normalized, controller.signal)).then((result) => {
        if (controller.signal.aborted) return;
        setContent({ items: result?.items ?? [], hasMore: result?.hasMore ?? false });
        setSearchState("ready");
      }).catch(() => {
        if (!controller.signal.aborted) setSearchState("error");
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  const searching = query.trim() !== "";
  const results = React.useMemo(
    () => searching ? deriveSearchResults({
      list,
      workspaces,
      query,
      archivedSessionIds,
      settledSessionIds: settled.settledSessionIds,
      pendingInteractions,
      content,
      limit: tray.searchResultLimit ?? 40
    }) : { items: [], hasMore: false },
    [searching, list, workspaces, query, archivedSessionIds, settled, pendingInteractions, content]
  );
  const settledRows = React.useMemo(
    () => deriveSettled(list, settled.settledSessionIds, workspaces),
    [list, settled, workspaces]
  );
  const toggleGroup = (key) => {
    const open = effectiveExpanded.includes(key);
    setExpandedGroups(open ? effectiveExpanded.filter((entry) => entry !== key) : [...effectiveExpanded, key]);
  };
  const toggleShowAll = (key) => setShownGroups((current) => current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]);
  if (wide === false) {
    return React.createElement(
      "div",
      { className: "tray-root tray-rail" },
      React.createElement(
        "div",
        { className: "tray-header" },
        React.createElement(
          "button",
          {
            type: "button",
            className: "tray-icon-button",
            title: "New session",
            "aria-label": "New session",
            onClick: () => tray.startSession()
          },
          "\uFF0B"
        )
      ),
      spaceBar
    );
  }
  const body = [];
  if (searching) {
    if (results.items.length === 0) {
      body.push(
        React.createElement(
          "div",
          { className: "tray-status", key: "search-empty" },
          searchState === "loading" ? "Searching\u2026" : searchState === "error" ? "Search is unavailable." : "No conversations match."
        )
      );
    } else {
      for (const result of results.items) {
        body.push(
          React.createElement(
            "button",
            {
              type: "button",
              className: "tray-result-row",
              key: `result-${result.id}`,
              onClick: () => tray.open(result.id)
            },
            React.createElement("span", { className: "tray-result-title" }, result.title),
            React.createElement("span", { className: "tray-result-meta" }, result.workspace || "Ungrouped"),
            result.snippet === void 0 ? null : React.createElement("span", { className: "tray-result-snippet" }, result.snippet)
          )
        );
      }
      if (results.hasMore) {
        body.push(
          React.createElement(
            "div",
            { className: "tray-status", key: "search-more" },
            "More matches \u2014 narrow the search."
          )
        );
      }
    }
  } else {
    const childrenOf = /* @__PURE__ */ new Map();
    const topLevel = [];
    for (const group of groups) {
      const parent = group.workspaceId === void 0 ? void 0 : envParents[group.workspaceId];
      if (parent !== void 0 && groups.some((g) => g.workspaceId === parent)) {
        if (!childrenOf.has(parent)) childrenOf.set(parent, []);
        childrenOf.get(parent).push(group);
      } else topLevel.push(group);
    }
    const renderGroup = (group, nested) => {
      const label = group.label || workspaceLabel(group.cwd) || "Ungrouped";
      const env = nested && group.workspaceId !== void 0 ? window.__dshEnv__?.envForWorkspace(group.workspaceId) : void 0;
      return React.createElement(
        "div",
        { className: `tray-group${nested ? " tray-group-nested" : ""}`, key: `group-${group.key || "ungrouped"}` },
        React.createElement(
          "div",
          {
            className: "tray-project-row",
            onClick: () => toggleGroup(group.key),
            title: group.cwd ?? label
          },
          React.createElement(
            "span",
            { className: `tray-arrow${group.expanded ? " tray-arrow-open" : ""}`, "aria-hidden": "true" },
            "\u25B6"
          ),
          env !== void 0 ? React.createElement("span", { className: `tray-env-dot tray-env-dot-${env.state}`, "aria-hidden": "true", title: env.state }) : null,
          React.createElement("span", { className: "tray-project-label" }, nested ? label.replace(/^.*\u00B7\s*/, "") : label),
          React.createElement("span", { className: "tray-project-count" }, String(group.sessionCount)),
          group.workspaceId === void 0 ? null : React.createElement(
            "span",
            { className: "tray-row-actions" },
            spaces.length > 1 && !nested ? React.createElement(
              "button",
              {
                type: "button",
                className: "tray-row-button",
                title: `Move ${label} to another space`,
                "aria-label": `Move ${label} to another space`,
                onClick: (event) => {
                  event.stopPropagation();
                  moveWorkspaceToSpace(group.workspaceId);
                }
              },
              "\u2937"
            ) : null,
            React.createElement(
              "button",
              {
                type: "button",
                className: "tray-row-button",
                title: `New session in ${label}`,
                "aria-label": `New session in ${label}`,
                onClick: (event) => {
                  event.stopPropagation();
                  tray.startSession(group.workspaceId);
                }
              },
              "\uFF0B"
            )
          )
        ),
        ...group.sessions.map(
          (node) => React.createElement(SessionRow, {
            React,
            key: node.id,
            node,
            selected: node.id === list.current,
            now,
            onOpen: tray.open,
            onSettle: (id) => tray.settle(id, list.byId?.[id]?.cwd),
            onRename: tray.renameSession,
            onFork: tray.forkSession,
            onArchive: tray.archiveSession
          })
        ),
        group.hiddenCount > 0 ? React.createElement(
          "button",
          {
            type: "button",
            className: "tray-more",
            key: "more",
            onClick: () => toggleShowAll(group.key)
          },
          `Show ${group.hiddenCount} more`
        ) : null,
        group.showingAll && group.expanded && group.sessionCount > settled.sessionsPerWorkspace ? React.createElement(
          "button",
          { type: "button", className: "tray-more", key: "less", onClick: () => toggleShowAll(group.key) },
          "Show less"
        ) : null
      );
    };
    for (const group of topLevel) {
      body.push(renderGroup(group, false));
      for (const child of childrenOf.get(group.workspaceId) ?? []) body.push(renderGroup(child, true));
    }
    if (groups.length === 0) {
      body.push(
        React.createElement(
          "div",
          { className: "tray-status", key: "empty" },
          activeSpace.builtin ? "No conversations yet." : "This space is empty. Add a workspace with \u229E or move one here."
        )
      );
    }
  }
  const settledPreview = settledShowAll ? settledRows : settledRows.slice(0, settled.settledPreviewCount);
  const settledHidden = settledRows.length - settledPreview.length;
  return React.createElement(
    "div",
    { className: "tray-root" },
    React.createElement(
      "div",
      { className: "tray-header" },
      React.createElement("span", { className: "tray-header-label" }, "Conversations"),
      React.createElement(
        "button",
        {
          type: "button",
          className: "tray-icon-button",
          title: "Add workspace\u2026",
          "aria-label": "Add workspace",
          disabled: flowBusy,
          onClick: async () => {
            setFlowError(null);
            setFlowBusy(true);
            try {
              const path = await tray.pickDirectory();
              if (path !== void 0 && path !== null) {
                const created = await tray.createWorkspace({ path });
                if (!activeSpace.builtin && created?.workspaceId !== void 0) {
                  settledStore.assignWorkspace(created.workspaceId, activeSpace.id);
                }
              }
            } catch (error) {
              setFlowError(String(error?.message ?? error));
            } finally {
              setFlowBusy(false);
            }
          }
        },
        "\u229E"
      ),
      React.createElement(
        "button",
        {
          type: "button",
          className: "tray-icon-button",
          title: "New session",
          "aria-label": "New session",
          onClick: () => tray.startSession()
        },
        "\uFF0B"
      )
    ),
    spaceBar,
    flowError === null ? null : React.createElement("div", { className: "tray-status" }, `Couldn\u2019t add workspace: ${flowError}`),
    React.createElement(
      "div",
      { className: "tray-search" },
      React.createElement("span", { "aria-hidden": "true" }, "\u2315"),
      React.createElement("input", {
        className: "tray-search-input",
        type: "search",
        value: query,
        placeholder: "Search conversations",
        "aria-label": "Search conversations",
        onChange: (event) => setQuery(event.target.value)
      })
    ),
    React.createElement("div", { className: "tray-body", role: "tree", "aria-label": "Conversations" }, body),
    settledRows.length === 0 ? null : React.createElement(
      "div",
      { className: "tray-settled" },
      React.createElement(
        "button",
        {
          type: "button",
          className: "tray-settled-header",
          "aria-expanded": settledOpen,
          onClick: () => setSettledOpen((open) => !open)
        },
        React.createElement(
          "span",
          { className: `tray-arrow${settledOpen ? " tray-arrow-open" : ""}`, "aria-hidden": "true" },
          "\u25B6"
        ),
        React.createElement("span", { className: "tray-settled-label" }, "Settled"),
        React.createElement("span", { className: "tray-settled-count" }, String(settledRows.length))
      ),
      settledOpen ? React.createElement(
        "div",
        { className: "tray-settled-list" },
        ...settledPreview.map(
          (row) => React.createElement(
            "div",
            {
              className: "tray-session-row tray-settled-row",
              key: `settled-${row.id}`,
              title: row.title,
              onClick: () => tray.open(row.id)
            },
            React.createElement("span", { className: "tray-slot" }),
            React.createElement("span", { className: "tray-session-title" }, row.title),
            React.createElement("span", { className: "tray-session-time" }, timeLabel(row.updatedAt, now)),
            React.createElement(
              "span",
              { className: "tray-row-actions" },
              React.createElement(
                "button",
                {
                  type: "button",
                  className: "tray-row-button",
                  title: "Unsettle conversation",
                  "aria-label": `Unsettle ${row.title}`,
                  onClick: (event) => {
                    event.stopPropagation();
                    tray.unsettle(row.id, list.byId?.[row.id]?.cwd);
                  }
                },
                "\u21A9"
              )
            )
          )
        ),
        settledHidden > 0 ? React.createElement(
          "button",
          { type: "button", className: "tray-more", onClick: () => setSettledShowAll(true) },
          `Show ${settledHidden} more`
        ) : null,
        settledShowAll && settledRows.length > settled.settledPreviewCount ? React.createElement(
          "button",
          { type: "button", className: "tray-more", onClick: () => setSettledShowAll(false) },
          "Show less"
        ) : null
      ) : null
    )
  );
}
var inject = ["slots", "sessions", "workspaces", "uiWorkspace", "remote"];
function apply(ctx) {
  const React = require("react");
  const sessions = ctx.get("sessions");
  const workspaces = ctx.get("workspaces");
  const uiWorkspace = ctx.get("uiWorkspace");
  const slots = ctx.get("slots");
  if (sessions === void 0 || workspaces === void 0 || uiWorkspace === void 0 || slots === void 0) {
    console.error("[dsh-sidebar-tray] required client services are unavailable; leaving the shipped sidebar in place");
    return;
  }
  const style = document.createElement("style");
  style.dataset.plugin = "dsh-sidebar-tray";
  style.textContent = tray_default;
  document.head.append(style);
  ctx.effect(() => () => style.remove(), "sidebar-tray: styles");
  const settledStore = createSettledStore(ctx.get("remote"));
  void settledStore.reload();
  ctx.effect(
    () => ctx.on("settings/updated", () => {
      void settledStore.reload();
    }),
    "sidebar-tray: settings sync"
  );
  const envBridge = () => window.__dshEnv__;
  const tray = {
    open: (sessionId) => uiWorkspace.openSession(sessionId),
    /**
     * New conversation. On an env-enabled project (one with `.agents/env.json`)
     * this first creates a fresh worktree + child workspace and starts the
     * session there — the environment itself stays stopped until the user
     * presses Start in the header. A worktree that is already an env child
     * gets an ordinary session in place.
     */
    startSession: async (workspaceId) => {
      const bridge = envBridge();
      if (workspaceId !== void 0 && bridge?.isEnvProject(workspaceId) && bridge.envForWorkspace(workspaceId) === void 0) {
        try {
          const env = await bridge.createForWorkspace(workspaceId);
          if (env?.childWorkspaceId) return uiWorkspace.startSession(env.childWorkspaceId);
        } catch (error) {
          console.error("[dsh-sidebar-tray] could not create environment, starting in the main checkout", error);
          window.alert(`Could not create a worktree environment:
${error?.message ?? error}

Starting the conversation in the main checkout instead.`);
        }
      }
      return uiWorkspace.startSession(workspaceId);
    },
    forkSession: (sessionId) => {
      Promise.resolve(uiWorkspace.forkSession(sessionId)).catch(() => {
      });
    },
    archiveSession: (sessionId) => {
      Promise.resolve(uiWorkspace.archiveSession(sessionId)).catch(() => {
      });
    },
    renameSession: (sessionId, currentTitle) => {
      const next = window.prompt("Rename conversation", currentTitle ?? "");
      if (next === null) return;
      const trimmed = next.trim();
      if (trimmed === "" || trimmed === currentTitle) return;
      const session = sessions.binding(sessionId)?.session;
      Promise.resolve(session?.rename(trimmed)).catch(() => {
      });
    },
    /**
     * Settling a conversation that lives in a worktree environment stops and
     * deletes that environment (uncommitted work is committed to its branch,
     * which is kept). Unsettling restores the worktree from that branch.
     */
    settle: (sessionId, cwd) => {
      settledStore.settle(sessionId);
      const bridge = envBridge();
      const env = cwd && bridge ? bridge.envForCwd(cwd) : void 0;
      if (env !== void 0) {
        Promise.resolve(bridge.act(env.id, "teardown")).catch((error) => {
          console.error("[dsh-sidebar-tray] environment teardown failed", error);
          window.alert(`Conversation settled, but its environment could not be torn down:
${error?.message ?? error}`);
        });
      }
    },
    unsettle: (sessionId, cwd) => {
      settledStore.unsettle(sessionId);
      const bridge = envBridge();
      const env = cwd && bridge ? bridge.tornDownFor(cwd) : void 0;
      if (env !== void 0) {
        Promise.resolve(bridge.act(env.id, "restore")).catch((error) => {
          console.error("[dsh-sidebar-tray] environment restore failed", error);
          window.alert(`Conversation restored, but its environment could not be recreated:
${error?.message ?? error}`);
        });
      }
    },
    searchSessions: async (query, signal) => {
      const result = await sessions.search(query, signal);
      if (result?.ok !== true) throw new Error(result?.error?.message ?? "search failed");
      return result.value;
    },
    searchResultLimit: sessions.searchResultLimit ?? 40,
    pickDirectory: () => uiWorkspace.pickDirectory(),
    createWorkspace: (input) => workspaces.create(input)
  };
  slots.inject(
    "sidebar.workspaces",
    () => slots.register(
      {
        name: "sidebar.workspaces",
        // Shadow the shipped region: lowest priority renders.
        priority: -1,
        registrant: "dsh-sidebar-tray"
      },
      (props) => React.createElement(SidebarTray, { ...props, React, settledStore, tray })
    )
  );
}

		return module.exports;
	}
});
