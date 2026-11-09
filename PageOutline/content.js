(function () {
  "use strict";

  const HOST_ID = "page-outline-extension";
  const STATUS_HOST_ID = "page-outline-status";
  const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";
  const TOP_OFFSET = 80;
  const REBUILD_DELAY = 300;

  let enabled = false;
  let highlightEnabled = true;
  let headings = [];
  let headingButtons = new Map();
  let headingTree = [];
  let headingParents = new Map();
  const collapsedHeadings = new Set();
  let rebuildTimer = null;
  let mutationObserver = null;
  let isMonitoringUrl = false;
  let lastActiveHeading = null;

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.setAttribute("data-page-outline-owned", "true");
  host.style.cssText =
    "all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
      }

      .panel {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        width: min(320px, calc(100vw - 32px));
        height: min(70vh, 600px);
        max-height: calc(100vh - 32px);
        overflow: hidden;
        opacity: 0.8;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.2);
        color: #172033;
        font-family: "メイリオ", Meiryo, sans-serif;
        font-size: 13px;
        line-height: 1.4;
        pointer-events: auto;
      }

      .title {
        flex: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 10px 8px 12px;
        border-bottom: 1px solid #e2e8f0;
        background: #f8fafc;
        cursor: grab;
        font-weight: 700;
        user-select: none;
      }

      .title.dragging {
        cursor: grabbing;
      }

      .toggle-button {
        flex: none;
        padding: 2px 7px;
        border: 1px solid rgba(23, 37, 84, 0.45);
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.62);
        color: #172554;
        cursor: pointer;
        font: inherit;
        font-size: 11px;
        font-weight: 400;
      }

      .toggle-button:hover {
        background: #dbeafe;
      }

      .bulk-toggle-row {
        flex: none;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 8px;
        border-bottom: 1px solid #e2e8f0;
      }

      .bulk-level {
        flex: none;
        padding: 3px 5px;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        background: #ffffff;
        color: #334155;
        font: inherit;
        font-size: 11px;
      }

      .bulk-toggle {
        flex: 1 1 auto;
        padding: 4px 7px;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        background: #ffffff;
        color: #334155;
        cursor: pointer;
        font: inherit;
        font-size: 11px;
        text-align: left;
      }

      .bulk-toggle:hover {
        background: #f1f5f9;
      }

      .highlight-toggle-row {
        flex: none;
        padding: 0 8px 6px;
      }

      .list {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        padding: 6px;
        pointer-events: auto;
        overscroll-behavior: contain;
      }

      .item-row {
        display: flex;
        align-items: center;
        min-width: 0;
      }

      .collapse-button {
        flex: none;
        width: 20px;
        height: 26px;
        padding: 0;
        border: 0;
        background: transparent;
        color: #64748b;
        cursor: pointer;
        font: inherit;
        font-size: 13px;
        line-height: 1;
      }

      .collapse-button:hover {
        color: #1d4ed8;
      }

      .collapse-button.empty {
        cursor: default;
        visibility: hidden;
      }

      .children {
        margin-left: 16px;
      }

      .item {
        flex: 1 1 auto;
        min-width: 0;
        width: 100%;
        box-sizing: border-box;
        padding: 5px 8px;
        border: 0;
        border-radius: 4px;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font: inherit;
        text-align: left;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .item:hover {
        background: #e2e8f0;
      }

      .item.active {
        background: #dbeafe;
        color: #1d4ed8;
        font-weight: 700;
      }

      .item.ancestor-active {
        background: #f1f5f9;
      }

      .empty {
        padding: 12px 8px;
        color: #64748b;
      }

      .resize-handle {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 16px;
        height: 16px;
        padding: 0;
        border: 0;
        background: transparent;
        cursor: nwse-resize;
        pointer-events: auto;
      }

      .resize-handle::after {
        position: absolute;
        right: 3px;
        bottom: 3px;
        width: 7px;
        height: 7px;
        border-bottom: 2px solid #94a3b8;
        border-left: 2px solid #94a3b8;
        content: "";
      }
    </style>
    <aside class="panel" aria-label="ページの目次">
      <div class="title">
        <span>目次 (機能オンオフ: Alt+I)</span>
        <button class="toggle-button" type="button"></button>
      </div>
      <div class="bulk-toggle-row">
        <select class="bulk-level" aria-label="折りたたむ見出し階層">
          <option value="1">H1</option>
          <option value="2">H2</option>
          <option value="3">H3</option>
          <option value="4">H4</option>
          <option value="5">H5</option>
          <option value="6">H6</option>
        </select>
        <button class="bulk-toggle" type="button"></button>
      </div>
      <div class="highlight-toggle-row">
        <button class="bulk-toggle highlight-toggle" type="button"></button>
      </div>
      <div class="list"></div>
      <button class="resize-handle" type="button" aria-label="目次パネルのサイズを変更"></button>
    </aside>
  `;

  const panel = shadow.querySelector(".panel");
  const list = shadow.querySelector(".list");
  const titleBar = shadow.querySelector(".title");
  const resizeHandle = shadow.querySelector(".resize-handle");
  const toggleButton = shadow.querySelector(".toggle-button");
  const bulkLevel = shadow.querySelector(".bulk-level");
  const bulkToggle = shadow.querySelector(".bulk-toggle");
  const highlightToggle = shadow.querySelector(".highlight-toggle");
  const statusHost = document.createElement("div");
  statusHost.id = STATUS_HOST_ID;
  statusHost.setAttribute("data-page-outline-owned", "true");
  statusHost.style.cssText =
    "all: initial; position: fixed; left: 8px; bottom: 36px; z-index: 2147483647; pointer-events: none;";
  const statusShadow = statusHost.attachShadow({ mode: "open" });
  statusShadow.innerHTML = `
    <style>
      :host {
        all: initial;
      }

      .status {
        display: inline-block;
        padding: 3px 7px;
        border: 1px solid rgba(23, 37, 84, 0.45);
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.62);
        color: #172554;
        font-family: "メイリオ", Meiryo, sans-serif;
        font-size: 11px;
        line-height: 1.2;
        white-space: nowrap;
      }
    </style>
    <span class="status"></span>
  `;
  const status = statusShadow.querySelector(".status");
  let resizeState = null;
  let dragState = null;

  function startDrag(event) {
    if (event.target.closest("button")) {
      return;
    }

    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    dragState = {
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      width: rect.width,
      height: rect.height
    };
    panel.style.right = "auto";
    titleBar.classList.add("dragging");
    window.addEventListener("pointermove", dragPanel);
    window.addEventListener("pointerup", finishDrag, { once: true });
  }

  function dragPanel(event) {
    if (!dragState) {
      return;
    }

    const left = Math.min(
      Math.max(0, dragState.startLeft + event.clientX - dragState.startX),
      Math.max(0, window.innerWidth - dragState.width)
    );
    const top = Math.min(
      Math.max(0, dragState.startTop + event.clientY - dragState.startY),
      Math.max(0, window.innerHeight - dragState.height)
    );
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function finishDrag() {
    dragState = null;
    titleBar.classList.remove("dragging");
    window.removeEventListener("pointermove", dragPanel);
  }

  function startResize(event) {
    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    resizeState = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height
    };
    window.addEventListener("pointermove", resizePanel);
    window.addEventListener("pointerup", finishResize, { once: true });
  }

  function resizePanel(event) {
    if (!resizeState) {
      return;
    }

    const width = Math.min(
      Math.max(240, resizeState.startWidth - (event.clientX - resizeState.startX)),
      Math.max(240, window.innerWidth - 32)
    );
    const height = Math.min(
      Math.max(120, resizeState.startHeight + (event.clientY - resizeState.startY)),
      Math.max(120, window.innerHeight - 32)
    );
    panel.style.width = `${width}px`;
    panel.style.height = `${height}px`;
  }

  function finishResize() {
    resizeState = null;
    window.removeEventListener("pointermove", resizePanel);
  }

  resizeHandle.addEventListener("pointerdown", startResize);
  titleBar.addEventListener("pointerdown", startDrag);

  function isExtensionElement(element) {
    return (
      element instanceof Element &&
      (element.id === HOST_ID ||
        element.id === STATUS_HOST_ID ||
        element.closest(`#${HOST_ID}`) !== null ||
        element.closest(`#${STATUS_HOST_ID}`) !== null)
    );
  }

  function attachStatus() {
    if (!document.documentElement.contains(statusHost)) {
      document.documentElement.appendChild(statusHost);
    }
  }

  function syncStatus() {
    status.textContent = `PageOutline(Alt+I): ${enabled ? "ON" : "OFF"}`;
    status.classList.toggle("on", enabled);
    status.classList.toggle("off", !enabled);
  }

  function syncToggleButton() {
    toggleButton.textContent = enabled ? "オフ" : "オン";
    toggleButton.setAttribute(
      "aria-label",
      enabled ? "機能をオフにする" : "機能をオンにする"
    );
  }

  function clearHighlight() {
    for (const button of headingButtons.values()) {
      button.classList.remove("active", "ancestor-active");
    }
    lastActiveHeading = null;
  }

  function syncHighlightToggle() {
    highlightToggle.textContent = `強調: ${highlightEnabled ? "オン" : "オフ"}`;
    highlightToggle.setAttribute(
      "aria-label",
      `現在位置の強調表示を${highlightEnabled ? "オフ" : "オン"}にする`
    );
  }

  toggleButton.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "toggle-state" });
  });

  highlightToggle.addEventListener("click", () => {
    highlightEnabled = !highlightEnabled;
    syncHighlightToggle();
    if (highlightEnabled) {
      updateActiveHeading();
    } else {
      clearHighlight();
    }
  });

  bulkToggle.addEventListener("click", () => {
    const level = Number(bulkLevel.value);
    expandAncestorsForLevel(level);
    const collapsible = getCollapsibleHeadings(level);
    const allCollapsed =
      collapsible.length > 0 &&
      collapsible.every((heading) => collapsedHeadings.has(heading.element));

    for (const heading of collapsible) {
      if (allCollapsed) {
        collapsedHeadings.delete(heading.element);
      } else {
        collapsedHeadings.add(heading.element);
      }
    }
    render();
  });

  bulkLevel.addEventListener("change", () => {
    expandAncestorsForLevel(Number(bulkLevel.value));
    render();
  });

  function isVisible(element) {
    if (isExtensionElement(element) || element.hidden) {
      return false;
    }

    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.visibility !== "collapse" &&
      element.getClientRects().length > 0
    );
  }

  function ensureHeadingId(heading, index) {
    if (heading.id) {
      return heading.id;
    }

    let id;
    let suffix = index + 1;
    do {
      id = `page-outline-heading-${suffix}`;
      suffix += 1;
    } while (document.getElementById(id));

    heading.id = id;
    heading.setAttribute("data-page-outline-added-id", "true");
    return id;
  }

  function collectHeadings() {
    return [...document.querySelectorAll(HEADING_SELECTOR)]
      .filter(isVisible)
      .map((element, index) => ({
        element,
        id: ensureHeadingId(element, index),
        level: Number(element.tagName.substring(1)),
        text: element.textContent.trim() || "(無題)"
      }));
  }

  function buildHeadingTree(items) {
    const roots = [];
    const stack = [];
    headingParents = new Map();

    for (const heading of items) {
      const node = { ...heading, children: [] };
      while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
        stack.pop();
      }

      if (stack.length === 0) {
        roots.push(node);
        headingParents.set(node.element, null);
      } else {
        stack[stack.length - 1].children.push(node);
        headingParents.set(node.element, stack[stack.length - 1].element);
      }
      stack.push(node);
    }

    return roots;
  }

  function renderHeadingNode(node, parentElement) {
    const row = document.createElement("div");
    row.className = "item-row";

    const collapseButton = document.createElement("button");
    collapseButton.type = "button";
    collapseButton.className = "collapse-button";
    collapseButton.textContent = "";

    if (node.children.length === 0) {
      collapseButton.classList.add("empty");
      collapseButton.disabled = true;
    } else {
      const isCollapsed = collapsedHeadings.has(node.element);
      collapseButton.textContent = isCollapsed ? "▶" : "▼";
      collapseButton.setAttribute("aria-expanded", String(!isCollapsed));
      collapseButton.setAttribute(
        "aria-label",
        `${node.text}の子見出しを${isCollapsed ? "展開" : "折りたたむ"}`
      );
      collapseButton.addEventListener("click", (event) => {
        event.stopPropagation();
        if (collapsedHeadings.has(node.element)) {
          collapsedHeadings.delete(node.element);
        } else {
          collapsedHeadings.add(node.element);
        }
        render();
      });
    }
    row.appendChild(collapseButton);

    const item = document.createElement("button");
    item.type = "button";
    item.className = "item";
    item.textContent = node.text;
    item.title = node.text;
    item.dataset.targetId = node.id;
    item.addEventListener("click", () => scrollToHeading(node.element));
    headingButtons.set(node.element, item);
    row.appendChild(item);
    parentElement.appendChild(row);

    if (node.children.length > 0) {
      const children = document.createElement("div");
      children.className = "children";
      children.hidden = collapsedHeadings.has(node.element);
      for (const child of node.children) {
        renderHeadingNode(child, children);
      }
      parentElement.appendChild(children);
    }
  }

  function updateBulkToggle() {
    const level = Number(bulkLevel.value);
    const collapsible = getCollapsibleHeadings(level);
    const allCollapsed =
      collapsible.length > 0 &&
      collapsible.every((heading) => collapsedHeadings.has(heading.element));
    bulkToggle.textContent = allCollapsed
      ? `H${level}を展開`
      : `H${level}を折りたたむ`;
    bulkToggle.setAttribute(
      "aria-label",
      allCollapsed
        ? `H${level}の見出しをすべて展開`
        : `H${level}の見出しをすべて折りたたむ`
    );
    bulkToggle.disabled = collapsible.length === 0;
  }

  function getCollapsibleHeadings(level) {
    return headings.filter((heading) =>
      heading.level === level &&
      headingTree.some((node) => hasChildNode(node, heading.element))
    );
  }

  function expandAncestorsForLevel(level) {
    function expandParents(node) {
      if (node.level < level) {
        collapsedHeadings.delete(node.element);
      }
      node.children.forEach(expandParents);
    }

    headingTree.forEach(expandParents);
  }

  function hasChildNode(node, element) {
    if (node.element === element) {
      return node.children.length > 0;
    }
    return node.children.some((child) => hasChildNode(child, element));
  }

  function render() {
    headings = collectHeadings();
    headingTree = buildHeadingTree(headings);
    headingButtons = new Map();
    lastActiveHeading = null;
    list.replaceChildren();

    if (headings.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "見出しがありません";
      list.appendChild(empty);
      bulkToggle.textContent = "すべて折りたたむ";
      bulkToggle.disabled = true;
      bulkLevel.disabled = true;
      lastActiveHeading = null;
      return;
    }

    bulkLevel.disabled = false;
    const fragment = document.createDocumentFragment();
    for (const node of headingTree) {
      renderHeadingNode(node, fragment);
    }
    list.appendChild(fragment);
    updateBulkToggle();
    updateActiveHeading();
  }

  function scrollToHeading(heading) {
    const top = Math.max(
      0,
      window.scrollY + heading.getBoundingClientRect().top - TOP_OFFSET
    );
    window.scrollTo({ top, behavior: "smooth" });
  }

  function updateActiveHeading() {
    if (headings.length === 0) {
      return;
    }

    if (!highlightEnabled) {
      clearHighlight();
      return;
    }

    let active = headings[0];
    for (const heading of headings) {
      if (heading.element.getBoundingClientRect().top <= TOP_OFFSET + 1) {
        active = heading;
      } else {
        break;
      }
    }

    if (active.element === lastActiveHeading) {
      return;
    }

    for (const button of headingButtons.values()) {
      button.classList.remove("active", "ancestor-active");
    }

    const activeButton = headingButtons.get(active.element);
    activeButton?.classList.add("active");
    let ancestor = headingParents.get(active.element);
    while (ancestor) {
      headingButtons.get(ancestor)?.classList.add("ancestor-active");
      ancestor = headingParents.get(ancestor);
    }

    lastActiveHeading = active.element;
    scrollActiveButtonIntoView(activeButton);
  }

  function scrollActiveButtonIntoView(button) {
    if (!button) {
      return;
    }

    const listRect = list.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    let scrollOffset = 0;

    if (buttonRect.top < listRect.top) {
      scrollOffset = buttonRect.top - listRect.top;
    } else if (buttonRect.bottom > listRect.bottom) {
      scrollOffset = buttonRect.bottom - listRect.bottom;
    }

    if (scrollOffset !== 0) {
      list.scrollBy({ top: scrollOffset, behavior: "smooth" });
    }
  }

  function scheduleRebuild() {
    if (!enabled || rebuildTimer !== null) {
      return;
    }

    rebuildTimer = window.setTimeout(() => {
      rebuildTimer = null;
      if (enabled) {
        render();
      }
    }, REBUILD_DELAY);
  }

  function isOwnMutation(record) {
    if (isExtensionElement(record.target)) {
      return true;
    }

    return [...record.addedNodes, ...record.removedNodes].some(
      (node) => node instanceof Element && isExtensionElement(node)
    );
  }

  function startMonitoring() {
    if (mutationObserver) {
      return;
    }

    mutationObserver = new MutationObserver((records) => {
      if (records.some((record) => !isOwnMutation(record))) {
        scheduleRebuild();
      }
    });
    mutationObserver.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "id", "style", "hidden", "aria-hidden"]
    });
    window.addEventListener("scroll", updateActiveHeading, { passive: true });
    startUrlMonitoring();
  }

  function stopMonitoring() {
    mutationObserver?.disconnect();
    mutationObserver = null;
    window.removeEventListener("scroll", updateActiveHeading);
    stopUrlMonitoring();
    if (rebuildTimer !== null) {
      window.clearTimeout(rebuildTimer);
      rebuildTimer = null;
    }
  }

  function handleUrlChange() {
    if (enabled) {
      scheduleRebuild();
    }
  }

  function startUrlMonitoring() {
    if (isMonitoringUrl) {
      return;
    }

    isMonitoringUrl = true;
    window.addEventListener("popstate", handleUrlChange);
    window.addEventListener("hashchange", handleUrlChange);
    if (!history.__pageOutlinePatched) {
      for (const method of ["pushState", "replaceState"]) {
        const original = history[method];
        history[method] = function (...args) {
          const result = original.apply(this, args);
          handleUrlChange();
          return result;
        };
      }
      history.__pageOutlinePatched = true;
    }
  }

  function stopUrlMonitoring() {
    if (!isMonitoringUrl) {
      return;
    }

    isMonitoringUrl = false;
    window.removeEventListener("popstate", handleUrlChange);
    window.removeEventListener("hashchange", handleUrlChange);
  }

  function setEnabled(nextEnabled) {
    enabled = nextEnabled === true;
    attachStatus();
    syncStatus();
    syncToggleButton();
    if (enabled) {
      if (!document.documentElement.contains(host)) {
        document.documentElement.appendChild(host);
      }
      startMonitoring();
      render();
    } else {
      stopMonitoring();
      host.remove();
      headings = [];
      headingButtons = new Map();
      lastActiveHeading = null;
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "set-enabled") {
      setEnabled(message.enabled);
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.enabled) {
      setEnabled(changes.enabled.newValue);
    }
  });

  attachStatus();
  syncStatus();
  syncHighlightToggle();
  chrome.storage.local.get({ enabled: true }, (state) => {
    setEnabled(state.enabled);
  });
})();
