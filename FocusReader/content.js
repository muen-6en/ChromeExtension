(function () {
  "use strict";

  const overlay = document.createElement("div");
  overlay.id = "focus-reading-overlay";
  overlay.setAttribute("aria-hidden", "true");
  const status = document.createElement("div");
  status.id = "focus-reading-status";
  status.setAttribute("aria-live", "polite");

  const panelNames = ["top", "bottom", "left", "right"];
  const panels = Object.fromEntries(
    panelNames.map((name) => {
      const panel = document.createElement("div");
      panel.className = `focus-reading-panel focus-reading-panel--${name}`;
      overlay.appendChild(panel);
      return [name, panel];
    })
  );
  const focusFrame = document.createElement("div");
  focusFrame.className = "focus-reading-frame";
  focusFrame.setAttribute("aria-hidden", "true");
  overlay.appendChild(focusFrame);

  let isPaused = false;
  let focusMode = "off";
  let isDimmed = true;
  let isAreaExpanded = false;
  let lastPointer = null;
  const verticalMargin = 4;
  const areaWidthRatio = 0.3;
  const areaHeightRatio = 0.2;
  const minimumAreaWidth = 320;
  const minimumAreaHeight = 120;
  const minimumCharacterWidth = 80;
  const minimumCharacterHeight = 40;
  const maximumCharacterWidth = 240;
  const maximumCharacterHeight = 64;

  function addOverlay() {
    if (!document.documentElement.contains(overlay)) {
      document.documentElement.appendChild(overlay);
    }
    if (!document.documentElement.contains(status)) {
      document.documentElement.appendChild(status);
    }
  }

  function syncStatus() {
    const dimmingLabel =
      !isDimmed && focusMode !== "off" ? "（グレーなし）" : "";
    if (isPaused) {
      status.textContent = "Focus Reading(Alt+M): 一時停止";
    } else if (focusMode === "off") {
      status.textContent = "Focus Reading(Alt+M): OFF";
    } else if (focusMode === "area") {
      status.textContent = `Focus Reading(Alt+M): 矩形${isAreaExpanded ? "（拡大）" : ""}${dimmingLabel}`;
    } else if (focusMode === "character") {
      status.textContent = `Focus Reading(Alt+M): 文字${dimmingLabel}`;
    } else {
      status.textContent = `Focus Reading(Alt+M): 行${dimmingLabel}`;
    }
  }

  function syncCursor() {
    document.documentElement.classList.toggle(
      "focus-reading-line-mode",
      !isPaused && focusMode === "line"
    );
    document.documentElement.classList.toggle(
      "focus-reading-area-mode",
      !isPaused && focusMode === "area"
    );
    document.documentElement.classList.toggle(
      "focus-reading-character-mode",
      !isPaused && focusMode === "character"
    );
  }

  function getRangeAtPoint(event) {
    const range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (range) {
      return range;
    }

    const position = document.caretPositionFromPoint?.(
      event.clientX,
      event.clientY
    );
    if (position?.offsetNode) {
      const fallbackRange = document.createRange();
      fallbackRange.setStart(position.offsetNode, position.offset);
      fallbackRange.collapse(true);
      return fallbackRange;
    }

    return null;
  }

  function getFocusRect(event) {
    const range = getRangeAtPoint(event);
    if (range) {
      const rects = range.getClientRects?.();
      if (rects?.length) {
        return rects[0];
      }
    }

    const target = event.target;
    if (!target || target === overlay || overlay.contains(target)) {
      return null;
    }

    return target.getBoundingClientRect();
  }

  function getCharacterFocusRect(event) {
    const pointRange = getRangeAtPoint(event);
    const textNode = pointRange?.startContainer;
    if (textNode?.nodeType === Node.TEXT_NODE) {
      const characterRange = document.createRange();
      const start = Math.max(0, pointRange.startOffset - 1);
      const end = Math.min(textNode.length, start + 3);
      characterRange.setStart(textNode, start);
      characterRange.setEnd(textNode, end);

      const rects = [...characterRange.getClientRects()];
      const lineRect = rects.find(
        (rect) => event.clientY >= rect.top && event.clientY <= rect.bottom
      );
      if (lineRect) {
        return lineRect;
      }
    }

    return getFocusRect(event);
  }

  function updateFocus(event) {
    if (isPaused || focusMode === "off" || !event) {
      return;
    }

    let left;
    let top;
    let width;
    let height;

    if (focusMode === "area") {
      const sizeMultiplier = isAreaExpanded ? 2 : 1;
      width = Math.min(
        window.innerWidth,
        Math.max(
          window.innerWidth * areaWidthRatio * sizeMultiplier,
          minimumAreaWidth * sizeMultiplier
        )
      );
      height = Math.min(
        window.innerHeight,
        Math.max(
          window.innerHeight * areaHeightRatio * sizeMultiplier,
          minimumAreaHeight * sizeMultiplier
        )
      );
      left = Math.min(
        Math.max(0, event.clientX - width / 2),
        window.innerWidth - width
      );
      top = Math.min(
        Math.max(0, event.clientY - height),
        window.innerHeight - height
      );
    } else {
      const rect =
        focusMode === "character"
          ? getCharacterFocusRect(event)
          : getFocusRect(event);
      if (!rect) {
        return;
      }
      top = Math.max(0, rect.top - verticalMargin);
      height = Math.min(
        window.innerHeight - top,
        rect.height + verticalMargin * 2
      );
      if (focusMode === "character") {
        left = Math.max(0, rect.left - verticalMargin);
        width = Math.min(
          window.innerWidth - left,
          maximumCharacterWidth,
          Math.max(rect.width + verticalMargin * 2, minimumCharacterWidth)
        );
        height = Math.min(
          window.innerHeight - top,
          maximumCharacterHeight,
          Math.max(height, minimumCharacterHeight)
        );
      } else {
        left = 0;
        width = window.innerWidth;
      }
    }

    const bottom = top + height;

    panels.top.style.height = `${top}px`;
    panels.bottom.style.top = `${bottom}px`;
    panels.bottom.style.height = `${Math.max(0, window.innerHeight - bottom)}px`;
    panels.left.style.top = `${top}px`;
    panels.left.style.width = `${left}px`;
    panels.left.style.height = `${height}px`;
    panels.right.style.top = `${top}px`;
    panels.right.style.left = `${left + width}px`;
    panels.right.style.width = `${Math.max(
      0,
      window.innerWidth - left - width
    )}px`;
    panels.right.style.height = `${height}px`;
    focusFrame.style.top = `${top}px`;
    focusFrame.style.left = `${left}px`;
    focusFrame.style.width = `${width}px`;
    focusFrame.style.height = `${height}px`;
    focusFrame.classList.toggle("focus-reading-frame--area", focusMode === "area");
    focusFrame.classList.toggle(
      "focus-reading-frame--expanded",
      isAreaExpanded
    );
  }

  function pauseOrResume() {
    isPaused = !isPaused;
    overlay.classList.toggle("focus-reading-paused", isPaused);
    syncCursor();
    syncStatus();
  }

  document.addEventListener(
    "mousemove",
    (event) => {
      if (!isPaused) {
        lastPointer = { x: event.clientX, y: event.clientY };
        addOverlay();
        updateFocus(event);
      }
    },
    { passive: true }
  );

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      pauseOrResume();
    } else if (event.altKey && event.key.toLowerCase() === "m") {
      event.preventDefault();
      focusMode =
        focusMode === "line"
          ? "area"
          : focusMode === "area"
            ? "off"
            : "line";
      overlay.classList.toggle(
        "focus-reading-disabled",
        focusMode === "off"
      );
      syncCursor();
      syncStatus();
      if (lastPointer) {
        updateFocus({
          clientX: lastPointer.x,
          clientY: lastPointer.y,
          target: document.elementFromPoint(lastPointer.x, lastPointer.y)
        });
      }
    } else if (event.altKey && event.key.toLowerCase() === "e") {
      event.preventDefault();
      if (focusMode === "area") {
        isAreaExpanded = !isAreaExpanded;
      } else if (focusMode === "line") {
        focusMode = "character";
        syncCursor();
      } else if (focusMode === "character") {
        focusMode = "line";
        syncCursor();
      }
      syncStatus();
      if (lastPointer) {
        updateFocus({
          clientX: lastPointer.x,
          clientY: lastPointer.y,
          target: document.elementFromPoint(lastPointer.x, lastPointer.y)
        });
      }
    } else if (event.altKey && event.key.toLowerCase() === "n") {
      if (focusMode !== "off") {
        event.preventDefault();
        isDimmed = !isDimmed;
        overlay.classList.toggle("focus-reading-no-dim", !isDimmed);
        syncStatus();
      }
    }
  });

  window.addEventListener(
    "scroll",
    () => {
      if (!isPaused) {
        if (lastPointer) {
          updateFocus({
            clientX: lastPointer.x,
            clientY: lastPointer.y,
            target: document.elementFromPoint(lastPointer.x, lastPointer.y)
          });
        }
      }
    },
    { passive: true }
  );

  addOverlay();
  overlay.classList.toggle("focus-reading-disabled", focusMode === "off");
  syncCursor();
  syncStatus();
})();
