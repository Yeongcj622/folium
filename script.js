// ============ State ============
// Fixed px<->cm scale (independent of slide size), based on 96px = 2.54cm (1in).
const PX_PER_CM = 960 / 25.4;
const PX_TO_CM = 1 / PX_PER_CM;

let SLIDE_W = 960, SLIDE_H = 540;
// extra workspace around the slide where off-slide objects can be placed,
// viewed and selected (like PowerPoint's gray pasteboard area)
const CANVAS_MARGIN = 60;
const svgNS = "http://www.w3.org/2000/svg";

// Shape types (besides "text") that can hold a typed text label
const TEXT_CAPABLE_SHAPES = ["rect", "roundrect", "ellipse", "triangle", "equilTriangle", "rightTriangle", "diamond", "pentagon", "hexagon", "heptagon", "decagon", "dodecagon", "star", "heart", "speech",
    "parallelogram", "trapezoid", "octagon", "cross", "rightArrow", "leftArrow", "upArrow", "downArrow", "cylinder",
    "doubleArrow", "chevron", "lightningBolt", "donut", "pie", "blockArc", "moon", "cloud", "noSymbol"];
// Polygon-based shapes whose outline is a simple list of points
const POLYGON_SHAPES = ["parallelogram", "trapezoid", "octagon", "cross", "rightArrow", "leftArrow", "upArrow", "downArrow"];
const TEXT_CAPABLE_TYPES = ["text", ...TEXT_CAPABLE_SHAPES];

// CSS values for the per-character text effects (shadow/glow/reflection),
// shared between whole-object rendering and the per-selection inline styles.
const TEXT_FX_SHADOW = "2px 2px 4px rgba(0,0,0,0.55)";
const TEXT_FX_GLOW = "0 0 4px #65c8d6, 0 0 10px #65c8d6, 0 0 16px #65c8d6";

// Builds the inline style object for the "Shadow"/"Glow" text effect
// buttons, applied either to a whole text div or to a wrapped <span>
// around the current selection.
function textEffectStyle(kind) {
    if (kind === "shadow") return { textShadow: TEXT_FX_SHADOW };
    if (kind === "glow") return { textShadow: TEXT_FX_GLOW };
    return {};
}

// Converts a "#rrggbb" color plus a 0-100 opacity percentage to "rgba(...)".
function hexToRgba(hex, opacityPct) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "#000000") || [];
    const r = parseInt(m[1] || "00", 16), g = parseInt(m[2] || "00", 16), b = parseInt(m[3] || "00", 16);
    return `rgba(${r}, ${g}, ${b}, ${(opacityPct ?? 100) / 100})`;
}

// Applies the whole-object text effect settings (set via the Home tab's
// quick toggle buttons or the Text Effects tab's detailed controls) to a
// rendered text div's inline style.
function applyTextEffects(div, obj) {
    const shadows = [];
    if (obj.textShadow) {
        const angleRad = (obj.textShadowAngle ?? 45) * Math.PI / 180;
        const dist = obj.textShadowDistance ?? 2;
        const blur = obj.textShadowBlur ?? 4;
        const color = hexToRgba(obj.textShadowColor || "#000000", obj.textShadowOpacity ?? 55);
        const dx = (Math.cos(angleRad) * dist).toFixed(1);
        const dy = (Math.sin(angleRad) * dist).toFixed(1);
        shadows.push(`${dx}px ${dy}px ${blur}px ${color}`);
    }
    if (obj.textGlow) {
        const size = obj.textGlowSize ?? 6;
        const color = hexToRgba(obj.textGlowColor || "#65c8d6", obj.textGlowOpacity ?? 85);
        shadows.push(`0 0 ${size}px ${color}`, `0 0 ${size * 2}px ${color}`);
    }
    if (shadows.length) div.style.textShadow = shadows.join(", ");
    if (obj.textOutline) {
        div.style.webkitTextStroke = `${obj.textOutlineWidth ?? 1}px ${obj.textOutlineColor || "#000000"}`;
    }
    if (obj.letterSpacing) {
        div.style.letterSpacing = obj.letterSpacing + "px";
    }
}

function makeSlide() {
    return { id: uid(), objects: [], fill: { type: "solid", color: "#ffffff" } };
}

let state = {
    slides: [ makeSlide() ],
    current: 0,
    selection: [],   // array of object ids
    cellSelections: [], // ids of selected table cell rects (for fill/border editing)
    editPoints: null, // id of object currently in vertex edit-points mode
    tool: "select",
    zoom: 1,
    slideW: SLIDE_W,
    slideH: SLIDE_H,
};

// ============ Slide size presets (in cm) ============
const SLIDE_SIZE_PRESETS = [
    { id: "widescreen", label: "Widescreen (16:9)", w: 25.4, h: 14.29 },
    { id: "standard", label: "Standard (4:3)", w: 25.4, h: 19.05 },
    { id: "a4-portrait", label: "A4 Portrait", w: 21, h: 29.7 },
    { id: "a4-landscape", label: "A4 Landscape", w: 29.7, h: 21 },
    { id: "a3-portrait", label: "A3 Portrait", w: 29.7, h: 42 },
    { id: "a3-landscape", label: "A3 Landscape", w: 42, h: 29.7 },
    { id: "letter-portrait", label: "Letter Portrait", w: 21.59, h: 27.94 },
    { id: "letter-landscape", label: "Letter Landscape", w: 27.94, h: 21.59 },
    { id: "custom", label: "Custom", w: null, h: null },
];

// Scale all objects (recursively, incl. group children) when the slide size changes.
function scaleObjectsForSlideResize(sx, sy) {
    const scaleObj = (o) => {
        o.x *= sx; o.y *= sy; o.w *= sx; o.h *= sy;
        if (o.type === "group" && o.children) o.children.forEach(scaleObj);
    };
    state.slides.forEach(slide => slide.objects.forEach(scaleObj));
}

// wCm/hCm are the new slide dimensions in centimeters.
function setSlideSize(wCm, hCm) {
    const newW = Math.round(wCm * PX_PER_CM);
    const newH = Math.round(hCm * PX_PER_CM);
    if (newW === SLIDE_W && newH === SLIDE_H) return;
    pushHistory(true);
    const sx = newW / SLIDE_W, sy = newH / SLIDE_H;
    scaleObjectsForSlideResize(sx, sy);
    SLIDE_W = newW; SLIDE_H = newH;
    state.slideW = newW; state.slideH = newH;
    render(); renderProperties();
    updateSlideSizeControls();
}

function uid() { return 'o' + Math.random().toString(36).slice(2, 10); }

function curSlide() { return state.slides[state.current]; }
function getObj(id) { return curSlide().objects.find(o => o.id === id); }

// recursively find an object by id, including inside group children (e.g. table cells)
function findObjectById(objects, id) {
    for (const o of objects) {
        if (o.id === id) return o;
        if (o.type === "group" && o.children) {
            const found = findObjectById(o.children, id);
            if (found) return found;
        }
    }
    return null;
}

// recompute cell rect/label positions & sizes from a table group's
// colWidths/rowHeights (and keep the outline rect matching the table bounds).
// Merged cells (colSpan/rowSpan > 1) are sized to cover their full span;
// covered cells (hidden behind a merge) are left untouched and skipped by the renderer.
function layoutTable(group) {
    const { rows, cols } = { rows: group.tableRows, cols: group.tableCols };
    const colX = [group.x];
    for (let c = 0; c < cols; c++) colX.push(colX[c] + group.colWidths[c]);
    const rowY = [group.y];
    for (let r = 0; r < rows; r++) rowY.push(rowY[r] + group.rowHeights[r]);

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const idx = (r * cols + c) * 2;
            const cell = group.children[idx], label = group.children[idx + 1];
            if (cell.covered) continue;
            const rowSpan = cell.rowSpan || 1, colSpan = cell.colSpan || 1;
            const cx = colX[c], cy = rowY[r];
            const w = colX[Math.min(c + colSpan, cols)] - cx;
            const h = rowY[Math.min(r + rowSpan, rows)] - cy;
            cell.x = cx; cell.y = cy; cell.w = w; cell.h = h;
            label.x = cx; label.y = cy; label.w = w; label.h = h;
        }
    }
    const outline = group.children[group.children.length - 1];
    outline.x = group.x; outline.y = group.y; outline.w = group.w; outline.h = group.h;
}

// ---- Table geometry helpers ----
function tableColX(group) {
    const a = [group.x];
    for (let c = 0; c < group.tableCols; c++) a.push(a[c] + group.colWidths[c]);
    return a;
}
function tableRowY(group) {
    const a = [group.y];
    for (let r = 0; r < group.tableRows; r++) a.push(a[r] + group.rowHeights[r]);
    return a;
}
// Returns {r, c, cellId} for the table cell at slide coordinates (px, py), or null
function cellAtPoint(group, px, py) {
    const colX = tableColX(group), rowY = tableRowY(group);
    let col = -1, row = -1;
    for (let c = 0; c < group.tableCols; c++) if (px >= colX[c] && px < colX[c + 1]) { col = c; break; }
    for (let r = 0; r < group.tableRows; r++) if (py >= rowY[r] && py < rowY[r + 1]) { row = r; break; }
    if (row < 0 || col < 0) return null;
    const cell = group.children[(row * group.tableCols + col) * 2];
    return cell ? { r: row, c: col, cellId: cell.id } : null;
}
// Returns all non-covered cell IDs in the rectangle (r1,c1)-(r2,c2)
function cellRectSelection(group, r1, c1, r2, c2) {
    const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
    const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);
    const ids = [];
    for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
            const cell = group.children[(r * group.tableCols + c) * 2];
            if (cell && !cell.covered) ids.push(cell.id);
        }
    }
    return ids;
}
// Returns the border segment key nearest to (px, py) within tolerance, or null.
// Key format: "h:row:col" (horizontal edge at rowY[row], colX[col]..colX[col+1])
//             "v:row:col" (vertical edge at colX[col], rowY[row]..rowY[row+1])
const BORDER_HIT_TOL = 7;
function borderAtPoint(group, px, py) {
    const colX = tableColX(group), rowY = tableRowY(group);
    let best = null, bestDist = BORDER_HIT_TOL;
    for (let r = 0; r <= group.tableRows; r++) {
        const dy = Math.abs(py - rowY[r]);
        if (dy < bestDist) {
            for (let c = 0; c < group.tableCols; c++) {
                if (px >= colX[c] && px <= colX[c + 1]) { best = `h:${r}:${c}`; bestDist = dy; break; }
            }
        }
    }
    for (let c = 0; c <= group.tableCols; c++) {
        const dx = Math.abs(px - colX[c]);
        if (dx < bestDist) {
            for (let r = 0; r < group.tableRows; r++) {
                if (py >= rowY[r] && py <= rowY[r + 1]) { best = `v:${r}:${c}`; bestDist = dx; break; }
            }
        }
    }
    return best;
}

// returns the {r, c, idx} grid position of a cell rect within a table group's
// flat children array (idx is the index of the cell rect itself)
function cellGridPos(group, cellId) {
    const idx = group.children.findIndex(c => c.id === cellId);
    if (idx < 0 || idx >= group.tableRows * group.tableCols * 2 || idx % 2 !== 0) return null;
    const cellIdx = idx / 2;
    return { r: Math.floor(cellIdx / group.tableCols), c: cellIdx % group.tableCols, idx };
}

// merges the currently selected cells into one, if they form a rectangular
// block of unmerged 1x1 cells. Returns true on success.
function mergeCells(group) {
    const cols = group.tableCols;
    const positions = state.cellSelections.map(id => cellGridPos(group, id)).filter(Boolean);
    if (positions.length < 2) return false;
    for (const p of positions) {
        const cell = group.children[p.idx];
        if ((cell.colSpan || 1) > 1 || (cell.rowSpan || 1) > 1 || cell.covered) return false;
    }
    const minR = Math.min(...positions.map(p => p.r));
    const maxR = Math.max(...positions.map(p => p.r));
    const minC = Math.min(...positions.map(p => p.c));
    const maxC = Math.max(...positions.map(p => p.c));
    const set = new Set(positions.map(p => `${p.r},${p.c}`));
    for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
            if (!set.has(`${r},${c}`)) return false;
        }
    }

    const topIdx = (minR * cols + minC) * 2;
    const topCell = group.children[topIdx];
    topCell.colSpan = maxC - minC + 1;
    topCell.rowSpan = maxR - minR + 1;
    for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
            if (r === minR && c === minC) continue;
            const idx = (r * cols + c) * 2;
            group.children[idx].covered = true;
            group.children[idx + 1].covered = true;
            group.children[idx + 1].text = "";
        }
    }
    layoutTable(group);
    state.cellSelections = [topCell.id];
    return true;
}

// splits the selected merged cell back into its original 1x1 cells.
// Returns true on success.
function unmergeCells(group) {
    if (state.cellSelections.length !== 1) return false;
    const pos = cellGridPos(group, state.cellSelections[0]);
    if (!pos) return false;
    const cell = group.children[pos.idx];
    const rowSpan = cell.rowSpan || 1, colSpan = cell.colSpan || 1;
    if (rowSpan === 1 && colSpan === 1) return false;
    const cols = group.tableCols;
    for (let r = pos.r; r < pos.r + rowSpan; r++) {
        for (let c = pos.c; c < pos.c + colSpan; c++) {
            const idx = (r * cols + c) * 2;
            group.children[idx].covered = false;
            group.children[idx + 1].covered = false;
        }
    }
    cell.colSpan = 1;
    cell.rowSpan = 1;
    layoutTable(group);
    return true;
}

// Table style presets (cell fill / text colors), in the spirit of
// PowerPoint's table style gallery.
const TABLE_STYLES = {
    none:   { header: "#ffffff", headerText: "#000000", band1: "#ffffff", band2: "#ffffff", border: "#000000" },
    blue:   { header: "#2454a0", headerText: "#ffffff", band1: "#ffffff", band2: "#dbe8f6", border: "#2454a0" },
    gray:   { header: "#595959", headerText: "#ffffff", band1: "#ffffff", band2: "#e6e6e6", border: "#595959" },
    green:  { header: "#2e7d32", headerText: "#ffffff", band1: "#ffffff", band2: "#e3f4e3", border: "#2e7d32" },
    orange: { header: "#d9692f", headerText: "#ffffff", band1: "#ffffff", band2: "#fbe4d5", border: "#d9692f" },
};

// recolors a table's cells/borders/header text based on its styleId,
// headerRow and bandedRows flags. Overwrites any per-cell custom fills.
function applyTableStyle(group) {
    const style = TABLE_STYLES[group.styleId || "none"];
    const cols = group.tableCols;
    for (let r = 0; r < group.tableRows; r++) {
        for (let c = 0; c < cols; c++) {
            const idx = (r * cols + c) * 2;
            const cell = group.children[idx], label = group.children[idx + 1];
            if (cell.covered) continue;
            let fillColor = style.band1, textColor = "#000000", bold = false;
            if (group.headerRow && r === 0) {
                fillColor = style.header;
                textColor = style.headerText;
                bold = true;
            } else if (group.bandedRows) {
                const dataRow = group.headerRow ? r - 1 : r;
                if (dataRow % 2 === 1) fillColor = style.band2;
            }
            cell.fill = { type: "solid", color: fillColor };
            cell.stroke.color = style.border;
            label.fontColor = textColor;
            label.bold = bold;
        }
    }
    const outline = group.children[group.children.length - 1];
    outline.stroke.color = style.border;
}

// ============ Undo / Redo history ============
let historyStack = [];
let redoStack = [];
let historyTimer = null;
let spellcheckEnabled = true;

function snapshotState() {
    return JSON.stringify({ slides: state.slides, current: state.current, slideW: SLIDE_W, slideH: SLIDE_H,
        headerText: state.headerText, footerText: state.footerText });
}

// Call before a mutation. Rapid successive calls (e.g. dragging, slider input)
// within 600ms collapse into a single undo step; pass force=true for discrete
// actions (delete, duplicate, paste...) that should always get their own step.
function pushHistory(force = false) {
    if (!force && historyTimer) {
        clearTimeout(historyTimer);
        historyTimer = setTimeout(() => { historyTimer = null; }, 600);
        return;
    }
    historyStack.push(snapshotState());
    if (historyStack.length > 60) historyStack.shift();
    redoStack = [];
    if (historyTimer) clearTimeout(historyTimer);
    historyTimer = setTimeout(() => { historyTimer = null; }, 600);
    updateHistoryButtons();
}

function undo() {
    if (!historyStack.length) return;
    redoStack.push(snapshotState());
    const prev = JSON.parse(historyStack.pop());
    state.slides = prev.slides; state.current = prev.current; state.selection = [];
    SLIDE_W = prev.slideW || SLIDE_W; SLIDE_H = prev.slideH || SLIDE_H;
    state.slideW = SLIDE_W; state.slideH = SLIDE_H;
    state.headerText = prev.headerText; state.footerText = prev.footerText;
    render(); renderProperties();
    updateHistoryButtons();
    updateSlideSizeControls();
}

function redo() {
    if (!redoStack.length) return;
    historyStack.push(snapshotState());
    const next = JSON.parse(redoStack.pop());
    state.slides = next.slides; state.current = next.current; state.selection = [];
    SLIDE_W = next.slideW || SLIDE_W; SLIDE_H = next.slideH || SLIDE_H;
    state.slideW = SLIDE_W; state.slideH = SLIDE_H;
    state.headerText = next.headerText; state.footerText = next.footerText;
    render(); renderProperties();
    updateHistoryButtons();
    updateSlideSizeControls();
}

function updateHistoryButtons() {
    document.getElementById("undoBtn").disabled = historyStack.length === 0;
    document.getElementById("redoBtn").disabled = redoStack.length === 0;
}

// ============ Icon Library (80 original icons, 24×24 fill paths) ============
const ICON_LIBRARY = [
  // ARROWS
  {id:"arrow-right",     cat:"Arrows",       label:"Arrow Right",     d:"M4 10v4h12v4l5-6-5-6v4H4z"},
  {id:"arrow-left",      cat:"Arrows",       label:"Arrow Left",      d:"M20 10v4H8v4l-5-6 5-6v4h12z"},
  {id:"arrow-up",        cat:"Arrows",       label:"Arrow Up",        d:"M14 20V8h4l-6-7-6 7h4v12h4z"},
  {id:"arrow-down",      cat:"Arrows",       label:"Arrow Down",      d:"M10 4v12H6l6 7 6-7h-4V4h-4z"},
  {id:"arrow-rotate",    cat:"Arrows",       label:"Rotate",          d:"M12 4V0L7 5l5 5V6a6 6 0 110 12 6 6 0 01-6-6H4a8 8 0 1016 0 8 8 0 00-8-8z"},
  {id:"arrow-swap",      cat:"Arrows",       label:"Swap",            d:"M9 17l-5-5 5-5v3h6V7l5 5-5 5v-3H9v3z"},
  {id:"arrow-ffwd",      cat:"Arrows",       label:"Fast Forward",    d:"M4 8l5 4-5 4V8zm8 0l5 4-5 4V8z"},
  {id:"arrow-rwd",       cat:"Arrows",       label:"Rewind",          d:"M20 8l-5 4 5 4V8zm-8 0l-5 4 5 4V8z"},
  {id:"arrow-expand",    cat:"Arrows",       label:"Expand",          d:"M3 3h7v2H6.41l4.3 4.29-1.42 1.42L5 6.41V10H3V3zm18 0h-7v2h3.59l-4.3 4.29 1.42 1.42L19 6.41V10h2V3zm-7 18h7v-7h-2v3.59l-4.29-4.3-1.42 1.42L19.59 19H16v2zm-7 0H3v-7h2v3.59l4.29-4.3 1.42 1.42L6.41 19H10v2z"},
  {id:"arrow-compress",  cat:"Arrows",       label:"Compress",        d:"M3.41 5.41L8 10H5v2h7V5h-2v3L5.41 3.59 3.41 5.41zM16 5h-2v7h7v-2h-3l4.59-4.59-1.41-1.41L16 8.83V5zM5 14H3v7h7v-2H6.41l4.59-4.59-1.41-1.41L5 18v-4zm14 3.17l-4.59-4.58-1.41 1.41L17.58 19H14v2h7v-7h-2v3.17z"},
  // COMMUNICATION
  {id:"chat",            cat:"Communication",label:"Chat",            d:"M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2zm-7 11H7v-2h6v2zm3-4H7V7h9v2z"},
  {id:"email",           cat:"Communication",label:"Email",           d:"M22 6a2 2 0 00-2-2H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6zm-2 0l-8 5-8-5h16zm0 12H4V8l8 5 8-5v10z"},
  {id:"phone",           cat:"Communication",label:"Phone",           d:"M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57A1 1 0 0121 16.5V20a1 1 0 01-1 1C9.61 21 3 14.39 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57.1.35.03.74-.24 1.02l-2.21 2.2z"},
  {id:"bell",            cat:"Communication",label:"Bell",            d:"M12 22a2 2 0 002-2h-4a2 2 0 002 2zm6-6V11a6 6 0 00-5-5.92V4a1 1 0 00-2 0v1.08A6 6 0 006 11v5l-2 2v1h16v-1l-2-2z"},
  {id:"wifi",            cat:"Communication",label:"WiFi",            d:"M1 9l2 2a12.15 12.15 0 0118 0l2-2A15 15 0 001 9zm4 4 2 2a7 7 0 0110 0l2-2A10 10 0 005 13zm4 4 3 3 3-3a4 4 0 00-6 0z"},
  {id:"send",            cat:"Communication",label:"Send",            d:"M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"},
  {id:"mic",             cat:"Communication",label:"Microphone",      d:"M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 006 6.93V21h2v-3.07A7 7 0 0019 11h-2z"},
  {id:"share",           cat:"Communication",label:"Share",           d:"M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81a3 3 0 000-6 3 3 0 00-3 3c0 .24.04.47.09.7L7.04 9.81A2.99 2.99 0 005 9a3 3 0 000 6c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65a2.92 2.92 0 002.92 2.92 2.92 2.92 0 000-5.84z"},
  {id:"broadcast",       cat:"Communication",label:"Broadcast",       d:"M12 9a3 3 0 013 3 3 3 0 01-3 3 3 3 0 01-3-3 3 3 0 013-3m0-4.5a7.5 7.5 0 017.5 7.5 7.5 7.5 0 01-7.5 7.5A7.5 7.5 0 014.5 12 7.5 7.5 0 0112 4.5M12 2a10 10 0 0110 10 10 10 0 01-10 10A10 10 0 012 12 10 10 0 0112 2z"},
  {id:"video-cam",       cat:"Communication",label:"Video",           d:"M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"},
  // NATURE
  {id:"sun",             cat:"Nature",        label:"Sun",             d:"M12 7a5 5 0 100 10A5 5 0 0012 7zM2 13h2v-2H2v2zm18 0h2v-2h-2v2zm-9 9v-2h-2v2h2zm0-18V2h-2v2h2zM4.22 19.78l1.42-1.42-1.42-1.41-1.41 1.41 1.41 1.42zm15.56 0l1.41-1.42-1.41-1.41-1.42 1.41 1.42 1.42zM4.22 4.22L2.81 5.64l1.41 1.41 1.42-1.41-1.42-1.42zm15.56 0l-1.42 1.42 1.42 1.41 1.41-1.41-1.41-1.42z"},
  {id:"moon",            cat:"Nature",        label:"Moon",            d:"M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"},
  {id:"cloud",           cat:"Nature",        label:"Cloud",           d:"M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13a5 5 0 000-10c-.03 0-.06.01-.09.01a7.5 7.5 0 00-.56-3.97z"},
  {id:"snowflake",       cat:"Nature",        label:"Snowflake",       d:"M20 11h-3.17l2.54-2.54-1.41-1.41L14 11h-2V9l3.95-3.95-1.42-1.41L12 6.17V3h-2v3.17L7.47 3.64 6.05 5.05 10 9v2H8L4.05 7.05 2.64 8.46 5.17 11H2v2h3.17L2.64 15.54l1.41 1.41L8 13h2v2l-3.95 3.95 1.42 1.41L10 17.83V21h2v-3.17l2.53 2.53 1.42-1.41L12 15v-2h2l3.95 3.95 1.41-1.41L16.83 13H20v-2z"},
  {id:"leaf",            cat:"Nature",        label:"Leaf",            d:"M17 8C8 10 5.9 16.17 3.82 21L5.71 22l1-2.3A4.49 4.49 0 008 20c5 0 10-2 10-10 0 0-1 0-1-2z"},
  {id:"tree",            cat:"Nature",        label:"Tree",            d:"M12 2L6.5 11H10L5 19h6.5v3h1v-3H19L14 11h3.5L12 2z"},
  {id:"flower",          cat:"Nature",        label:"Flower",          d:"M12 22a2 2 0 002-2h-4a2 2 0 002 2zm0-20c-2.25 0-4 1.75-4 4 0 1.23.56 2.33 1.44 3.06C7.55 9.86 6 11.75 6 14h2c0-2.21 1.79-4 4-4s4 1.79 4 4h2c0-2.25-1.55-4.14-3.44-4.94C15.44 8.33 16 7.23 16 6c0-2.25-1.75-4-4-4zm0 6a2 2 0 110-4 2 2 0 010 4z"},
  {id:"lightning",       cat:"Nature",        label:"Lightning",       d:"M13 2L4.5 13.5H11L9 22l10.5-11.5H14L16 2H13z"},
  {id:"rain",            cat:"Nature",        label:"Rain",            d:"M17.5 14H6.5a3.5 3.5 0 010-7H7A7 7 0 0121 9c0 .34-.02.68-.06 1a4.5 4.5 0 01.06 4h-3.5zM8 18a1 1 0 110 2 1 1 0 010-2zm4 0a1 1 0 110 2 1 1 0 010-2zm4 0a1 1 0 110 2 1 1 0 010-2zm-6 3a1 1 0 110 2 1 1 0 010-2zm4 0a1 1 0 110 2 1 1 0 010-2z"},
  {id:"fire",            cat:"Nature",        label:"Fire",            d:"M17.6 11.5c-1.3-2.3-4.1-3-4.1-3 .3 1.1 0 2.2-.5 2.7-1.3-2.3-4-4.2-4-4.2.2 2.2-.7 4.8-2 6.4C5.7 15 5 17 5 17.1A7 7 0 0012 21a7 7 0 007-7c0-1.1-.5-2.5-1.4-2.5z"},
  // TECHNOLOGY
  {id:"laptop",          cat:"Technology",    label:"Laptop",          d:"M4 6h16v11H4V6zm-2 13h20l-2-2H4l-2 2z"},
  {id:"mobile",          cat:"Technology",    label:"Mobile",          d:"M17 2H7a2 2 0 00-2 2v16a2 2 0 002 2h10a2 2 0 002-2V4a2 2 0 00-2-2zm-5 18a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm5-4H7V5h10v11z"},
  {id:"camera",          cat:"Technology",    label:"Camera",          d:"M20 5h-3.17L15 3H9L7.17 5H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V7a2 2 0 00-2-2zm-8 13a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z"},
  {id:"headphones",      cat:"Technology",    label:"Headphones",      d:"M12 2a9 9 0 00-9 9v7a2 2 0 002 2h2a2 2 0 002-2v-3a2 2 0 00-2-2H5v-2a7 7 0 0114 0v2h-2a2 2 0 00-2 2v3a2 2 0 002 2h2a2 2 0 002-2v-7a9 9 0 00-9-9z"},
  {id:"battery",         cat:"Technology",    label:"Battery",         d:"M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4zM13 18h-2v-2h2v2zm0-4h-2v-4h2v4z"},
  {id:"database",        cat:"Technology",    label:"Database",        d:"M12 2C6.48 2 2 3.79 2 6v12c0 2.21 4.48 4 10 4s10-1.79 10-4V6c0-2.21-4.48-4-10-4zm0 2c4.42 0 8 1.12 8 2.5S16.42 9 12 9 4 7.88 4 6.5 7.58 4 12 4zM4 8.93c1.69.84 4.52 1.57 8 1.57s6.31-.73 8-1.57V12c0 1.38-3.58 2.5-8 2.5S4 13.38 4 12V8.93zm0 5c1.69.84 4.52 1.57 8 1.57s6.31-.73 8-1.57V17.5c0 1.38-3.58 2.5-8 2.5S4 18.88 4 17.5v-3.57z"},
  {id:"code",            cat:"Technology",    label:"Code",            d:"M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"},
  {id:"gear",            cat:"Technology",    label:"Settings",        d:"M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 110-7.2 3.6 3.6 0 010 7.2z"},
  {id:"lock",            cat:"Technology",    label:"Lock",            d:"M18 8h-1V6a5 5 0 00-10 0v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2zm-6 9a2 2 0 110-4 2 2 0 010 4zm3.1-9H8.9V6a3.1 3.1 0 016.2 0v2z"},
  {id:"monitor",         cat:"Technology",    label:"Monitor",         d:"M21 3H3a1 1 0 00-1 1v13a1 1 0 001 1h7v2H8v2h8v-2h-2v-2h7a1 1 0 001-1V4a1 1 0 00-1-1zm-1 13H4V5h16v11z"},
  // BUSINESS
  {id:"chart-bar",       cat:"Business",      label:"Bar Chart",       d:"M5 9h4v11H5V9zm10-5h4v16h-4V4zm-5 8h4v8h-4v-8z"},
  {id:"chart-line",      cat:"Business",      label:"Line Chart",      d:"M3 3v18h18V3H3zm15.7 14.3l-4.2-5-3 3-2.5-3-3 3.2V5H19v12.3z"},
  {id:"briefcase",       cat:"Business",      label:"Briefcase",       d:"M20 7h-2.18c.07-.26.18-.5.18-.76V6a2 2 0 00-2-2h-4a2 2 0 00-2 2v.24C9.18 5 9.07 5.26 9 5.52L9 6H5a2 2 0 00-2 2v11a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2zm-8-1h4v1h-4V6zm8 13H4V9h5v3h2V9h4v3h2V9h3v10z"},
  {id:"document",        cat:"Business",      label:"Document",        d:"M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm4 18H6V4h7v5h5v11z"},
  {id:"clipboard",       cat:"Business",      label:"Clipboard",       d:"M19 3h-4.18A2.99 2.99 0 0012 1c-1.31 0-2.42.83-2.83 2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-7 0a1 1 0 110 2 1 1 0 010-2zm7 16H5V5h2v3h10V5h2v14z"},
  {id:"calendar",        cat:"Business",      label:"Calendar",        d:"M19 3h-1V1h-2v2H8V1H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm0 16H5V8h14v11zM7 10h2v2H7v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2z"},
  {id:"clock",           cat:"Business",      label:"Clock",           d:"M12 2a10 10 0 100 20A10 10 0 0012 2zm0 18a8 8 0 110-16 8 8 0 010 16zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"},
  {id:"lightbulb",       cat:"Business",      label:"Idea",            d:"M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17a2 2 0 002 2h4a2 2 0 002-2v-2.26C17.81 13.47 19 11.38 19 9c0-3.86-3.14-7-7-7z"},
  {id:"search",          cat:"Business",      label:"Search",          d:"M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"},
  {id:"star-rate",       cat:"Business",      label:"Star",            d:"M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"},
  // PEOPLE
  {id:"person",          cat:"People",        label:"Person",          d:"M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"},
  {id:"group",           cat:"People",        label:"Group",           d:"M16 11a3 3 0 100-6 3 3 0 000 6zm-8 0a3 3 0 100-6 3 3 0 000 6zm8 2c-1.53 0-4.5.77-4.5 2.5V18h9v-2.5c0-1.73-2.97-2.5-4.5-2.5zm-8 0C6.47 13 3.5 13.77 3.5 15.5V18h9v-2.5C12.5 13.77 9.53 13 8 13z"},
  {id:"heart",           cat:"People",        label:"Heart",           d:"M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"},
  {id:"thumbs-up",       cat:"People",        label:"Like",            d:"M1 21h4V9H1v12zm22-11a2 2 0 00-2-2h-6.31l.95-4.57.03-.32a1.5 1.5 0 00-.44-1.06L14.17 1 7.59 7.59A2 2 0 007 9v10a2 2 0 002 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05A2 2 0 0023 12v-2z"},
  {id:"award",           cat:"People",        label:"Award",           d:"M12 2a5 5 0 100 10A5 5 0 0012 2zm0 12l-3.33 8.83a.5.5 0 00.76.55L12 21.4l2.57 1.98a.5.5 0 00.76-.55L12 14z"},
  {id:"home",            cat:"People",        label:"Home",            d:"M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"},
  {id:"flag",            cat:"People",        label:"Flag",            d:"M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"},
  {id:"location",        cat:"People",        label:"Location",        d:"M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"},
  {id:"person-add",      cat:"People",        label:"Add Person",      d:"M15 12a4 4 0 100-8 4 4 0 000 8zm-8 2v2H5v3H3v-3H0v-2h3v-3h2v3h2zm8 0c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"},
  {id:"accessibility",   cat:"People",        label:"Accessibility",   d:"M12 2a2 2 0 012 2 2 2 0 01-2 2 2 2 0 01-2-2 2 2 0 012-2zm9 7h-6v13h-2v-6h-2v6H9V9H3V7h18v2z"},
  // SYMBOLS
  {id:"plus",            cat:"Symbols",       label:"Plus",            d:"M19 11h-6V5h-2v6H5v2h6v6h2v-6h6z"},
  {id:"minus",           cat:"Symbols",       label:"Minus",           d:"M19 13H5v-2h14z"},
  {id:"check",           cat:"Symbols",       label:"Check",           d:"M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"},
  {id:"close-x",         cat:"Symbols",       label:"Close",           d:"M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"},
  {id:"info",            cat:"Symbols",       label:"Info",            d:"M12 2a10 10 0 100 20A10 10 0 0012 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"},
  {id:"warning",         cat:"Symbols",       label:"Warning",         d:"M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"},
  {id:"bookmark",        cat:"Symbols",       label:"Bookmark",        d:"M17 3H7a2 2 0 00-2 2v16l7-3 7 3V5a2 2 0 00-2-2z"},
  {id:"tag",             cat:"Symbols",       label:"Tag",             d:"M21.41 11.58l-9-9A2 2 0 0011 2H4a2 2 0 00-2 2v7c0 .55.22 1.05.59 1.41l9 9a2 2 0 002.83 0l7-7c.78-.78.78-2.05 0-2.83zm-14.91-4.08a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"},
  {id:"filter",          cat:"Symbols",       label:"Filter",          d:"M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"},
  {id:"grid-view",       cat:"Symbols",       label:"Grid",            d:"M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"},
  // ACTIONS
  {id:"download",        cat:"Actions",       label:"Download",        d:"M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"},
  {id:"upload",          cat:"Actions",       label:"Upload",          d:"M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"},
  {id:"trash",           cat:"Actions",       label:"Delete",          d:"M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"},
  {id:"edit-pen",        cat:"Actions",       label:"Edit",            d:"M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"},
  {id:"copy",            cat:"Actions",       label:"Copy",            d:"M16 1H4a2 2 0 00-2 2v14h2V3h12V1zm3 4H8a2 2 0 00-2 2v14a2 2 0 002 2h11a2 2 0 002-2V7a2 2 0 00-2-2zm0 16H8V7h11v14z"},
  {id:"save-file",       cat:"Actions",       label:"Save",            d:"M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7l-4-4zm-5 16a3 3 0 110-6 3 3 0 010 6zm3-10H5V5h10v4z"},
  {id:"print",           cat:"Actions",       label:"Print",           d:"M19 8H5a3 3 0 00-3 3v6h4v4h12v-4h4v-6a3 3 0 00-3-3zM15 18H9v-4h6v4zm3-7a1 1 0 110-2 1 1 0 010 2zm-1-9H7v4h10V2z"},
  {id:"zoom-in",         cat:"Actions",       label:"Zoom In",         d:"M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zm.5-5H8v2H7V9H5V8h2V6h1v2h2v1z"},
  {id:"fullscreen",      cat:"Actions",       label:"Fullscreen",      d:"M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"},
  {id:"cut",             cat:"Actions",       label:"Cut",             d:"M9.64 7.64c.23-.5.36-1.05.36-1.64a4 4 0 00-8 0 4 4 0 004 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36A3.94 3.94 0 006 14a4 4 0 104 4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8a2 2 0 110-4 2 2 0 010 4zm0 12a2 2 0 110-4 2 2 0 010 4zm6-7.5a.5.5 0 110-1 .5.5 0 010 1zM19 3l-6 6 2 2 7-7V3h-3z"},
  // Extra featured icons
  {id:"brain",           cat:"People",        label:"Brain",           d:"M9.5 2A5.5 5.5 0 004 7.5c0 .56.08 1.1.23 1.61A4.5 4.5 0 002 13c0 2.27 1.68 4.15 3.87 4.45.4 1.17 1.5 2.55 3.13 2.55.5 0 1-.14 1.41-.39A3.5 3.5 0 0012 21a3.5 3.5 0 001.59-3.39c.41.25.91.39 1.41.39 1.63 0 2.73-1.38 3.13-2.55C20.32 17.15 22 15.27 22 13a4.5 4.5 0 00-2.23-3.89c.15-.51.23-1.05.23-1.61A5.5 5.5 0 0014.5 2c-.96 0-1.86.25-2.63.68A5.47 5.47 0 009.5 2zm.5 8v8c-.5 0-1-.67-1-1.5V14H8.5A2.5 2.5 0 006 11.5v-.5h1.5v.5c0 .55.45 1 1 1H9v-2.5c0-.83.67-1.5 1.5-1.5h.5v1zm4 0h.5c.83 0 1.5.67 1.5 1.5V12h.5c.55 0 1-.45 1-1v-.5H18.5v-.5a2.5 2.5 0 00-2.5 2.5H15v-2.5c0-.83-.67-1.5-1.5-1.5H13V10h1.5z"},
  // ARROWS — additional
  {id:"undo",            cat:"Arrows",        label:"Undo",            d:"M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"},
  {id:"redo",            cat:"Arrows",        label:"Redo",            d:"M18.4 10.6A11.003 11.003 0 007.5 8c-2.86 0-5.52 1.1-7.5 2.99L2 13c1.58-1.5 3.7-2.4 6-2.4 2.97 0 5.57 1.61 7.01 3.99L13 17h9V8l-3.6 2.6z"},
  {id:"refresh",         cat:"Arrows",        label:"Refresh",         d:"M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"},
  {id:"chevron-right",   cat:"Arrows",        label:"Chevron Right",   d:"M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"},
  {id:"chevron-left",    cat:"Arrows",        label:"Chevron Left",    d:"M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"},
  // COMMUNICATION — additional
  {id:"reply",           cat:"Communication", label:"Reply",           d:"M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"},
  {id:"forum",           cat:"Communication", label:"Forum",           d:"M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"},
  {id:"rss",             cat:"Communication", label:"RSS Feed",        d:"M6.18 15.64a2.18 2.18 0 012.18 2.18C8.36 19 7.38 20 6.18 20 4.98 20 4 19 4 17.82a2.18 2.18 0 012.18-2.18M4 4.44A15.56 15.56 0 0119.56 20h-2.83A12.73 12.73 0 004 7.27V4.44m0 5.66a9.9 9.9 0 019.9 9.9h-2.83A7.07 7.07 0 004 12.93v-2.83z"},
  // NATURE — additional
  {id:"landscape",       cat:"Nature",        label:"Landscape",       d:"M21 19V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2zm-8.5-5.5l-2.5 3.22L7 13l-3 4h16l-5-6.5-3.5 3z"},
  {id:"water-drop",      cat:"Nature",        label:"Water Drop",      d:"M12 2C6.48 10 4 13.48 4 16a8 8 0 0016 0c0-2.52-2.48-6-8-14z"},
  {id:"eco",             cat:"Nature",        label:"Eco/Leaf",        d:"M6.05 8.24C4.05 11.6 4 15.48 6.1 19c.65-4.4 3.76-8.04 8.05-9.89C10.42 11.73 8.5 14.72 8.5 18.17c1.1.55 2.32.83 3.5.83 4.14 0 7.5-3.36 7.5-7.5 0-5.24-3.75-8.58-13.45-3.26z"},
  // TECHNOLOGY — additional
  {id:"keyboard",        cat:"Technology",    label:"Keyboard",        d:"M20 5H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V7a2 2 0 00-2-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-3 0h2v2H5v-2zm0-3h2v2H5V8zm10 7H9v-2h6v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z"},
  {id:"cpu",             cat:"Technology",    label:"CPU / Chip",      d:"M9.5 3H7v2H5v2H3v2h2v6H3v2h2v2h2v2h2.5v-2h5V19H17v2h2v-2h2v-2h2v-2h-2V9h2V7h-2V5h-2V3h-2.5v2h-5V3zM7 7h10v10H7V7zm2 2v6h6V9H9z"},
  {id:"wifi-off",        cat:"Technology",    label:"WiFi Off",        d:"M23.64 7.1c-.42-.4-.86-.76-1.32-1.1L21 7.31c.36.27.72.58 1.06.92L23.64 7.1zM19 4l-1.45 1.45a9.992 9.992 0 00-5.54-1.65C8.45 3.8 5.18 5.34 2.94 7.84L1 5.9a12.17 12.17 0 013.91-2.88l-1.17-1.17L5.16.41l17 17-1.41 1.41L19 16.73V4zm-4.17 4.15L9.01 14.28A3 3 0 0012 15c1.66 0 3-1.34 3-3a3 3 0 00-.17-.85zM7.57 11.7l-.85.85A5.02 5.02 0 0112 11c.18 0 .35.01.52.03L10.45 13l-.04-.04A3.01 3.01 0 007.57 11.7zM5.07 9.28L3.49 7.7C1.93 9.09.86 10.96.36 13L2.3 13a8.005 8.005 0 012.77-3.72zM12 21a2 2 0 100-4 2 2 0 000 4z"},
  // BUSINESS — additional
  {id:"folder",          cat:"Business",      label:"Folder",          d:"M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"},
  {id:"money",           cat:"Business",      label:"Money",           d:"M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"},
  {id:"cart",            cat:"Business",      label:"Shopping Cart",   d:"M7 18a2 2 0 100 4 2 2 0 000-4zM1 2v2h2l3.6 7.59L5.25 14a2 2 0 001.75 3h14v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63H19a2 2 0 001.75-1.03l3.58-6.49A1 1 0 0023.45 4H5.21l-.94-2H1zm18 16a2 2 0 100 4 2 2 0 000-4z"},
  {id:"analytics",       cat:"Business",      label:"Analytics",       d:"M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"},
  // PEOPLE — additional
  {id:"emoji-happy",     cat:"People",        label:"Happy Face",      d:"M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5c-2.49 0-4.5-2.01-4.5-4.5h2c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5h2c0 2.49-2.01 4.5-4.5 4.5zm-2.5-7a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm10 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"},
  {id:"running",         cat:"People",        label:"Running",         d:"M13.49 5.48a2 2 0 100-4 2 2 0 000 4zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3a7.3 7.3 0 005.2 2.1v-2c-1.5 0-2.84-.56-3.8-1.45l-1-1c-.4-.4-.9-.6-1.4-.6-.5 0-.9.1-1.2.3l-4.2 1.9v4.4h2v-3l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.3z"},
  {id:"medical",         cat:"People",        label:"Medical",         d:"M20 6h-2.18c.07-.26.18-.5.18-.76V5a3 3 0 00-6 0v.24c0 .26.11.5.18.76H10V5a3 3 0 00-6 0v.24c0 .26.11.5.18.76H2v16h18V6zm-8-1a1 1 0 012 0v.24a1 1 0 01-.76.76H12.76a1 1 0 01-.76-.76V5zm-6 0a1 1 0 012 0v.24a1 1 0 01-.76.76H6.76A1 1 0 016 5.24V5zm12 14h-2v-3h-3v-2h3v-3h2v3h3v2h-3v3z"},
  // SYMBOLS — additional
  {id:"help",            cat:"Symbols",       label:"Help",            d:"M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"},
  {id:"power",           cat:"Symbols",       label:"Power",           d:"M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42A6.92 6.92 0 0119 12c0 3.87-3.13 7-7 7A7 7 0 015 12c0-2.28 1.09-4.3 2.58-5.42L6.17 5.17A8.932 8.932 0 003 12a9 9 0 009 9 9 9 0 009-9c0-2.74-1.23-5.19-3.17-6.83z"},
  {id:"percent",         cat:"Symbols",       label:"Percent",         d:"M18.99 3L21 5 5 21H3l2-2L18.99 3zM7 5a2 2 0 110 4 2 2 0 010-4zm10 10a2 2 0 110 4 2 2 0 010-4z"},
  // ACTIONS — additional
  {id:"link",            cat:"Actions",       label:"Link",            d:"M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zm4.1 1h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"},
  {id:"crop",            cat:"Actions",       label:"Crop",            d:"M17 15H7V5H5v2H1v2h4v10h10v4h2v-4h4v-2h-4zM7 1H5v2h2V1zm10 8h2V7h-2v2h-4v4h-2v2h6V9z"},
  {id:"move",            cat:"Actions",       label:"Move",            d:"M10 9h4V6h3l-5-5-5 5h3v3zm-1 1H6V7l-5 5 5 5v-3h3v-4zm14 2l-5-5v3h-3v4h3v3l5-5zm-9 3h-4v3H7l5 5 5-5h-3v-3z"},
  // MEDIA
  {id:"play",            cat:"Media",         label:"Play",            d:"M8 5v14l11-7z"},
  {id:"pause",           cat:"Media",         label:"Pause",           d:"M6 19h4V5H6v14zm8-14v14h4V5h-4z"},
  {id:"stop-btn",        cat:"Media",         label:"Stop",            d:"M6 6h12v12H6z"},
  {id:"music-note",      cat:"Media",         label:"Music Note",      d:"M12 3v10.55A4 4 0 1014 17V7h4V3h-6z"},
  {id:"volume-up",       cat:"Media",         label:"Volume",          d:"M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"},
  {id:"photo",           cat:"Media",         label:"Photo",           d:"M21 19V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2zm-12.5-5.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"},
  {id:"film",            cat:"Media",         label:"Film / Video",    d:"M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V4h-4z"},
  {id:"subtitle",        cat:"Media",         label:"Subtitles",       d:"M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm-8 11H4v-2h8v2zm8 0h-6v-2h6v2zm0-4H4v-2h16v2z"},
];

// ============ Default object factory ============
function makeObject(type, x, y, w, h) {
    const base = {
        id: uid(), type, x, y, w, h, rotation: 0, flipH: false, flipV: false,
        fill: { type: "solid", color: "#a4c2e0" },
        stroke: { color: "#2454a0", width: 2, dash: "solid" },
        opacity: 100,
        shadow: false,
    };
    if (type === "text") {
        base.fill = { type: "solid", color: "none" };
        base.stroke = { color: "none", width: 0, dash: "solid" };
        base.text = "Text";
        base.fontFamily = "Arial";
        base.fontSize = 24;
        base.fontColor = "#1a1a1a";
        base.bold = false;
        base.italic = false;
        base.underline = false;
        base.align = "left";
        base.list = "none"; // "none" | "bullet"|"circle"|"square"|"dash"|"arrow"|"check"|"star" | "number"|"alpha-upper"|"alpha-lower"|"roman-upper"|"roman-lower"
    }
    if (type === "line" || type === "arrow") {
        base.fill = { type: "solid", color: "none" };
        base.stroke = { color: "#1a1a1a", width: 3, dash: "solid" };
    }
    if (["leftBrace", "rightBrace", "leftBracket", "rightBracket"].includes(type)) {
        base.fill = { type: "solid", color: "none" };
        base.stroke = { color: "#1a1a1a", width: 3, dash: "solid" };
    }
    if (type === "star") {
        base.points = 5;
    }
    if (type === "roundrect") {
        base.cornerRadius = 0.15;
    }
    if (TEXT_CAPABLE_SHAPES.includes(type)) {
        base.text = "";
        base.fontFamily = "Arial";
        base.fontSize = 18;
        base.fontColor = "#1a1a1a";
        base.bold = false;
        base.italic = false;
        base.underline = false;
        base.align = "center";
        base.list = "none";
    }
    if (type === "image") {
        base.fill = { type: "solid", color: "none" };
        base.stroke = { color: "none", width: 0, dash: "solid" };
    }
    if (type === "chart") {
        base.fill = { type: "solid", color: "none" };
        base.stroke = { color: "none", width: 0, dash: "solid" };
        base.chartType = "bar";
        base.chartLabels = ["Q1", "Q2", "Q3", "Q4"];
        base.chartData = [4, 7, 3, 9];
        base.barColor = "#2454a0";
    }
    if (type === "zoom") {
        base.fill = { type: "solid", color: "none" };
        base.stroke = { color: "#2454a0", width: 2, dash: "dashed" };
        base.targetSlide = 0;
    }
    if (type === "object") {
        base.fill = { type: "solid", color: "#f4f6f9" };
        base.stroke = { color: "#d6dbe1", width: 1, dash: "solid" };
        base.fileName = "";
    }
    if (type === "video" || type === "audio") {
        base.fill = { type: "solid", color: "none" };
        base.stroke = { color: "none", width: 0, dash: "solid" };
        base.src = "";
        base.fileName = "";
    }
    if (type === "icon") {
        base.fill = { type: "solid", color: "#333333" };
        base.stroke = { color: "none", width: 0, dash: "solid" };
        base.iconId = "";
    }
    return base;
}

// ============ Rendering ============
const svg = document.getElementById("slideSvg");

function render() {
    updateConnectors();
    const vbW = SLIDE_W + CANVAS_MARGIN * 2, vbH = SLIDE_H + CANVAS_MARGIN * 2;
    svg.setAttribute("viewBox", `${-CANVAS_MARGIN} ${-CANVAS_MARGIN} ${vbW} ${vbH}`);
    svg.setAttribute("width", vbW);
    svg.setAttribute("height", vbH);
    svg.innerHTML = "";
    const defs = document.createElementNS(svgNS, "defs");
    svg.appendChild(defs);

    const slide = curSlide();
    const bg = document.createElementNS(svgNS, "rect");
    bg.setAttribute("x", 0); bg.setAttribute("y", 0);
    bg.setAttribute("width", SLIDE_W); bg.setAttribute("height", SLIDE_H);
    bg.setAttribute("fill", resolveFill(slide, defs));
    bg.setAttribute("style", "filter: drop-shadow(0 4px 18px rgba(0,0,0,0.18));");
    svg.appendChild(bg);

    slide.objects.forEach(obj => {
        const el = renderObject(obj, defs);
        svg.appendChild(el);
    });

    appendHeaderFooter(svg);

    renderSelectionOverlay();
    if (cropState) {
        const cropObj = getObj(cropState.id);
        if (cropObj) renderCropOverlay(cropObj);
    }
    renderSlidesPanel();
    scheduleAutosave();
}

// ============ Header & Footer ============
function appendHeaderFooter(targetSvg) {
    if (state.headerText) {
        const h = document.createElementNS(svgNS, "text");
        applyAttrs(h, { x: SLIDE_W / 2, y: 16, "text-anchor": "middle", "font-size": 12, fill: "#999999" });
        h.textContent = state.headerText;
        targetSvg.appendChild(h);
    }
    if (state.footerText) {
        const f = document.createElementNS(svgNS, "text");
        applyAttrs(f, { x: SLIDE_W / 2, y: SLIDE_H - 8, "text-anchor": "middle", "font-size": 12, fill: "#999999" });
        f.textContent = state.footerText;
        targetSvg.appendChild(f);
    }
}

// ============ Zoom & responsive canvas sizing ============
const canvasWrap = document.getElementById("canvasWrap");
const canvasArea = document.querySelector(".canvas-area");

// clicking the gray pasteboard area around the slide (outside the svg):
// in select mode, start a marquee drag; otherwise just deselect
canvasArea.addEventListener("mousedown", (e) => {
    closeAllDropdowns();
    closeTextContextMenu();
    if (e.target === canvasArea || e.target.classList.contains("canvas-pad") || e.target === canvasWrap) {
        if (state.tool === "select") {
            if (!e.shiftKey) {
                state.selection = [];
                state.cellSelections = [];
            }
            const pt = svgPoint(e);
            drag = { mode: "marquee", startX: pt.x, startY: pt.y };
            e.preventDefault();
        } else {
            if (state.selection.length || state.cellSelections.length) {
                state.selection = [];
                state.cellSelections = [];
                render(); renderProperties();
            }
        }
        // Reset border paint hover when clicking off the table
        if (borderPaintHover) { borderPaintHover = null; document.body.style.cursor = ""; updateBorderPaintOverlay(); }
    }
});

let currentScale = 1;
// The zoom level at which the SVG was last fully rendered.
// During a pinch/wheel gesture we apply a CSS transform relative to this.
let _committedZoom = 1;

function applyZoom() {
    const padding = 32;
    const availW = Math.max(canvasArea.clientWidth - padding, 50);
    const availH = Math.max(canvasArea.clientHeight - padding, 50);
    const fitScale = Math.min(availW / (SLIDE_W + CANVAS_MARGIN * 2), availH / (SLIDE_H + CANVAS_MARGIN * 2), 1);
    currentScale = fitScale * state.zoom;
    const w = (SLIDE_W + CANVAS_MARGIN * 2) * currentScale;
    const h = (SLIDE_H + CANVAS_MARGIN * 2) * currentScale;
    canvasWrap.style.width = w + "px";
    canvasWrap.style.height = h + "px";
    svg.style.width = w + "px";
    svg.style.height = h + "px";
    svg.style.transform = "";          // clear any CSS-transform preview
    svg.style.transformOrigin = "";
    _committedZoom = state.zoom;
    document.getElementById("zoomLevel").textContent = Math.round(state.zoom * 100) + "%";
    document.getElementById("zoomSlider").value = Math.round(state.zoom * 100);
    render();
}

window.addEventListener("resize", applyZoom);

// shared by fill and stroke: builds a gradient def (if needed) and returns
// the value to use for a fill/stroke attribute (a color string or url(#id))
function resolveColor(f, id, defs) {
    if (!f || f.type === "solid" || !f.type) return f ? f.color : "none";
    if (f.type === "gradient") {
        const tag = f.gradientType === "radial" ? "radialGradient" : "linearGradient";
        const grad = document.createElementNS(svgNS, tag);
        grad.setAttribute("id", id);
        if (tag === "linearGradient") {
            const angle = (f.angle || 0) * Math.PI / 180;
            const x2 = 0.5 + 0.5 * Math.cos(angle), y2 = 0.5 + 0.5 * Math.sin(angle);
            const x1 = 0.5 - 0.5 * Math.cos(angle), y1 = 0.5 - 0.5 * Math.sin(angle);
            grad.setAttribute("x1", x1); grad.setAttribute("y1", y1);
            grad.setAttribute("x2", x2); grad.setAttribute("y2", y2);
        }
        (f.stops || []).forEach(s => {
            const stop = document.createElementNS(svgNS, "stop");
            stop.setAttribute("offset", s.pos + "%");
            stop.setAttribute("stop-color", s.color);
            grad.appendChild(stop);
        });
        defs.appendChild(grad);
        return `url(#${id})`;
    }
    return f.color || "none";
}

// returns a plain color (never a gradient url) for consumers that can't use
// gradients, such as TikZ export - falls back to the gradient's first stop
function solidColorOf(s) {
    if (!s) return "none";
    if (s.type === "gradient") return (s.stops && s.stops[0] && s.stops[0].color) || "#000000";
    return s.color;
}

function resolveFill(obj, defs) {
    const f = obj.fill;
    if (!f || f.type === "solid" || f.type === "gradient") return resolveColor(f, "fill-" + obj.id, defs);
    const id = "fill-" + obj.id;
    if (f.type === "parchment") {
        // turbulence filter for paper texture
        const filterId = "parch-filter-" + obj.id;
        const filter = document.createElementNS(svgNS, "filter");
        filter.setAttribute("id", filterId);
        const turb = document.createElementNS(svgNS, "feTurbulence");
        turb.setAttribute("type", "fractalNoise");
        turb.setAttribute("baseFrequency", "0.04 0.06");
        turb.setAttribute("numOctaves", "3");
        turb.setAttribute("result", "noise");
        const comp = document.createElementNS(svgNS, "feColorMatrix");
        comp.setAttribute("in", "noise");
        comp.setAttribute("type", "matrix");
        comp.setAttribute("values", "0 0 0 0 0.7  0 0 0 0 0.62  0 0 0 0 0.45  0 0 0 0.35 0");
        filter.appendChild(turb);
        filter.appendChild(comp);
        defs.appendChild(filter);

        const pat = document.createElementNS(svgNS, "pattern");
        pat.setAttribute("id", id);
        pat.setAttribute("width", "100%"); pat.setAttribute("height", "100%");
        pat.setAttribute("patternContentUnits", "objectBoundingBox");
        const baseRect = document.createElementNS(svgNS, "rect");
        baseRect.setAttribute("width", 1); baseRect.setAttribute("height", 1);
        baseRect.setAttribute("fill", f.color || "#e8d9b5");
        pat.appendChild(baseRect);
        const noiseRect = document.createElementNS(svgNS, "rect");
        noiseRect.setAttribute("width", 1); noiseRect.setAttribute("height", 1);
        noiseRect.setAttribute("filter", `url(#${filterId})`);
        pat.appendChild(noiseRect);
        defs.appendChild(pat);
        return `url(#${id})`;
    }
    if (f.type === "emoji") {
        const size = f.emojiSize || 32;
        const pat = document.createElementNS(svgNS, "pattern");
        pat.setAttribute("id", id);
        pat.setAttribute("width", size);
        pat.setAttribute("height", size);
        pat.setAttribute("patternUnits", "userSpaceOnUse");
        const bgRect = document.createElementNS(svgNS, "rect");
        bgRect.setAttribute("width", size); bgRect.setAttribute("height", size);
        bgRect.setAttribute("fill", f.bgColor || "#ffffff");
        pat.appendChild(bgRect);
        const txt = document.createElementNS(svgNS, "text");
        txt.setAttribute("x", size / 2);
        txt.setAttribute("y", size / 2);
        txt.setAttribute("font-size", size * 0.8);
        txt.setAttribute("text-anchor", "middle");
        txt.setAttribute("dominant-baseline", "central");
        txt.textContent = f.emoji || "⭐";
        pat.appendChild(txt);
        defs.appendChild(pat);
        return `url(#${id})`;
    }
    return f.color || "none";
}

function strokeAttrs(obj, defs) {
    const s = obj.stroke || { color: "none", width: 0 };
    const attrs = {};
    if (s.type === "gradient" && defs) attrs.stroke = resolveColor(s, "stroke-" + obj.id, defs);
    else attrs.stroke = s.color === "none" ? "none" : s.color;
    const w = s.width || 0;
    attrs["stroke-width"] = w;
    switch (s.dash) {
        case "dashed": attrs["stroke-dasharray"] = (w * 3 + 2) + "," + (w * 2 + 2); break;
        case "dotted": attrs["stroke-dasharray"] = w + "," + (w * 1.5 + 1); break;
        case "longdash": attrs["stroke-dasharray"] = (w * 6 + 2) + "," + (w * 2 + 2); break;
        case "dashdot": attrs["stroke-dasharray"] = `${w * 3 + 2},${w * 1.5 + 1},${w},${w * 1.5 + 1}`; break;
        case "longdashdot": attrs["stroke-dasharray"] = `${w * 6 + 2},${w * 2 + 1},${w},${w * 2 + 1}`; break;
    }
    if (s.cap) attrs["stroke-linecap"] = s.cap;
    if (s.join) attrs["stroke-linejoin"] = s.join;
    return attrs;
}

function applyAttrs(el, attrs) {
    for (const k in attrs) el.setAttribute(k, attrs[k]);
}

function roundedRectPath(x, y, w, h, ratio = 0.15) {
    const r = Math.min(w, h) * Math.max(0, Math.min(0.5, ratio));
    return `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`;
}

function speechBubblePath(x, y, w, h) {
    const r = Math.min(w, h) * 0.12;
    const bodyH = h * 0.78;
    const body = roundedRectPath(x, y, w, bodyH);
    const tailX1 = x + w * 0.18, tailX2 = x + w * 0.38, tailY = y + bodyH;
    const tailTip = [x + w * 0.12, y + h];
    return `${body} M${tailX1},${tailY} L${tailTip[0]},${tailTip[1]} L${tailX2},${tailY} Z`;
}

// returns an array of [x,y] points for a simple polygon-based shape
function shapePolygonPoints(type, x, y, w, h) {
    switch (type) {
        case "parallelogram": {
            const o = w * 0.25;
            return [[x + o, y], [x + w, y], [x + w - o, y + h], [x, y + h]];
        }
        case "trapezoid": {
            const o = w * 0.2;
            return [[x + o, y], [x + w - o, y], [x + w, y + h], [x, y + h]];
        }
        case "octagon": {
            const ox = w * 0.3, oy = h * 0.3;
            return [[x + ox, y], [x + w - ox, y], [x + w, y + oy], [x + w, y + h - oy],
                    [x + w - ox, y + h], [x + ox, y + h], [x, y + h - oy], [x, y + oy]];
        }
        case "cross": {
            const tx = w / 3, ty = h / 3;
            return [
                [x + tx, y], [x + w - tx, y], [x + w - tx, y + ty], [x + w, y + ty], [x + w, y + h - ty], [x + w - tx, y + h - ty],
                [x + w - tx, y + h], [x + tx, y + h], [x + tx, y + h - ty], [x, y + h - ty], [x, y + ty], [x + tx, y + ty]
            ];
        }
        case "rightArrow": {
            const headW = w * 0.35, bodyY = y + h * 0.25, bodyH = h * 0.5;
            return [[x, bodyY], [x + w - headW, bodyY], [x + w - headW, y], [x + w, y + h / 2], [x + w - headW, y + h], [x + w - headW, bodyY + bodyH], [x, bodyY + bodyH]];
        }
        case "leftArrow": {
            const headW = w * 0.35, bodyY = y + h * 0.25, bodyH = h * 0.5;
            return [[x + w, bodyY], [x + headW, bodyY], [x + headW, y], [x, y + h / 2], [x + headW, y + h], [x + headW, bodyY + bodyH], [x + w, bodyY + bodyH]];
        }
        case "upArrow": {
            const headH = h * 0.35, bodyX = x + w * 0.25, bodyW = w * 0.5;
            return [[bodyX, y + h], [bodyX, y + headH], [x, y + headH], [x + w / 2, y], [x + w, y + headH], [bodyX + bodyW, y + headH], [bodyX + bodyW, y + h]];
        }
        case "downArrow": {
            const headH = h * 0.35, bodyX = x + w * 0.25, bodyW = w * 0.5;
            return [[bodyX, y], [bodyX, y + h - headH], [x, y + h - headH], [x + w / 2, y + h], [x + w, y + h - headH], [bodyX + bodyW, y + h - headH], [bodyX + bodyW, y]];
        }
        case "doubleArrow": {
            const headW = w * 0.2, bodyY = y + h * 0.25, bodyH = h * 0.5;
            return [
                [x, y + h / 2], [x + headW, y], [x + headW, bodyY], [x + w - headW, bodyY], [x + w - headW, y], [x + w, y + h / 2],
                [x + w - headW, y + h], [x + w - headW, bodyY + bodyH], [x + headW, bodyY + bodyH], [x + headW, y + h]
            ];
        }
        case "chevron": {
            const o = w * 0.35;
            return [[x, y], [x + w - o, y], [x + w, y + h / 2], [x + w - o, y + h], [x, y + h], [x + o, y + h / 2]];
        }
        case "lightningBolt": {
            return [
                [x + w * 0.6, y], [x + w * 0.32, y + h * 0.45], [x + w * 0.52, y + h * 0.45], [x + w * 0.35, y + h],
                [x + w * 0.78, y + h * 0.48], [x + w * 0.55, y + h * 0.48]
            ];
        }
    }
    return null;
}

const EDIT_POINTS_SHAPE_TYPES = [
    "triangle", "equilTriangle", "rightTriangle", "star", "diamond", "pentagon", "hexagon", "heptagon", "decagon", "dodecagon",
    "parallelogram", "trapezoid", "octagon", "cross",
    "rightArrow", "leftArrow", "upArrow", "downArrow", "doubleArrow", "chevron", "lightningBolt"
];

// returns an array of [x,y] absolute points for a polygon-rendered shape,
// honoring obj.customPoints (fractions of w/h) if the user has edited them
function getShapePoints(obj) {
    const { x, y, w, h } = obj;
    const cx = x + w / 2, cy = y + h / 2;
    let pts;
    switch (obj.type) {
        case "triangle": pts = [[cx, y], [x + w, y + h], [x, y + h]]; break;
        case "star": {
            const outerR = Math.min(w, h) / 2, innerR = Math.min(w, h) / 4, n = obj.points || 5;
            pts = [];
            for (let i = 0; i < n * 2; i++) {
                const r = i % 2 === 0 ? outerR : innerR;
                const ang = (Math.PI / n) * i - Math.PI / 2;
                pts.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
            }
            break;
        }
        case "diamond": pts = [[cx, y], [x + w, cy], [cx, y + h], [x, cy]]; break;
        case "pentagon": case "hexagon": case "heptagon": case "decagon": case "dodecagon": {
            const nMap = {pentagon:5, hexagon:6, heptagon:7, decagon:10, dodecagon:12};
            const n = nMap[obj.type];
            pts = [];
            for (let i = 0; i < n; i++) {
                const ang = (2 * Math.PI / n) * i - Math.PI / 2;
                pts.push([cx + (w / 2) * Math.cos(ang), cy + (h / 2) * Math.sin(ang)]);
            }
            break;
        }
        case "rightTriangle": pts = [[x, y], [x + w, y + h], [x, y + h]]; break;
        case "equilTriangle": pts = [[cx, y], [x + w, y + h], [x, y + h]]; break;
        default:
            pts = shapePolygonPoints(obj.type, x, y, w, h);
    }
    if (!pts) return null;
    if (obj.customPoints && obj.customPoints.length === pts.length && w && h) {
        return obj.customPoints.map(p => [x + p.x * w, y + p.y * h]);
    }
    return pts;
}

// maps a point from the object's unrotated/unflipped local space to slide screen space
function localToScreen(obj, pt) {
    const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
    let x = pt[0], y = pt[1];
    if (obj.flipH) x = 2 * cx - x;
    if (obj.flipV) y = 2 * cy - y;
    if (obj.rotation) {
        const rad = obj.rotation * Math.PI / 180;
        const dx = x - cx, dy = y - cy;
        x = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
        y = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
    }
    return [x, y];
}

// inverse of localToScreen: maps a slide screen-space point back to the
// object's unrotated/unflipped local space
function screenToLocal(obj, pt) {
    const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
    let x = pt.x, y = pt.y;
    if (obj.rotation) {
        const rad = -obj.rotation * Math.PI / 180;
        const dx = x - cx, dy = y - cy;
        x = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
        y = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
    }
    if (obj.flipH) x = 2 * cx - x;
    if (obj.flipV) y = 2 * cy - y;
    return { x, y };
}

// the two endpoints of a line/arrow object. By default a line spans the
// "anti-diagonal" of its bounding box, i.e. (x,y+h) -> (x+w,y); when
// obj.diag is set it instead spans the main diagonal (x,y) -> (x+w,y+h).
// This lets lines/arrows be drawn (and connectors snapped) in either
// diagonal direction.
function lineEndpoints(obj) {
    if (obj.diag) return { p1: { x: obj.x, y: obj.y }, p2: { x: obj.x + obj.w, y: obj.y + obj.h } };
    return { p1: { x: obj.x, y: obj.y + obj.h }, p2: { x: obj.x + obj.w, y: obj.y } };
}

// ============ Shape boolean operations (Merge Shapes) ============
// shape types that can be converted to a polygon for boolean ops
const MERGE_SHAPE_TYPES = ["rect", "roundrect", "ellipse", "freeform", ...EDIT_POINTS_SHAPE_TYPES];

// approximates an object's outline as a polygon (array of [x,y] points) in
// absolute slide coordinates, accounting for rotation/flip
function objectToPolygon(obj) {
    const { x, y, w, h } = obj;
    let localPts;
    if (obj.type === "rect" || obj.type === "roundrect") {
        localPts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    } else if (obj.type === "ellipse") {
        const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, n = 48;
        localPts = [];
        for (let i = 0; i < n; i++) {
            const ang = 2 * Math.PI * i / n;
            localPts.push([cx + rx * Math.cos(ang), cy + ry * Math.sin(ang)]);
        }
    } else if (obj.type === "freeform") {
        const region = obj.regions && obj.regions[0];
        if (!region) return null;
        localPts = region.map(p => [x + p.x * w, y + p.y * h]);
    } else {
        localPts = getShapePoints(obj);
    }
    if (!localPts) return null;
    return localPts.map(p => localToScreen(obj, p));
}

// performs a boolean operation ("union" | "combine" | "intersect" | "subtract")
// on the currently selected shapes, replacing them with a single freeform shape
function mergeShapes(opName) {
    const objs = state.selection.map(getObj).filter(Boolean);
    if (objs.length < 2) return;
    const polys = objs.map(o => objectToPolygon(o));
    if (polys.some(p => !p)) return;

    pushHistory();
    let result = { regions: [polys[0]], inverted: false };
    for (let i = 1; i < polys.length; i++) {
        const next = { regions: [polys[i]], inverted: false };
        switch (opName) {
            case "union": result = PolyBool.union(result, next); break;
            case "intersect": result = PolyBool.intersect(result, next); break;
            case "subtract": result = PolyBool.difference(result, next); break;
            case "combine": result = PolyBool.xor(result, next); break;
        }
    }
    const regions = result.regions;
    if (!regions || regions.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    regions.forEach(r => r.forEach(([px, py]) => {
        minX = Math.min(minX, px); minY = Math.min(minY, py);
        maxX = Math.max(maxX, px); maxY = Math.max(maxY, py);
    }));
    const w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);

    const newObj = makeObject("freeform", minX, minY, w, h);
    newObj.fill = JSON.parse(JSON.stringify(objs[0].fill));
    newObj.stroke = JSON.parse(JSON.stringify(objs[0].stroke));
    newObj.regions = regions.map(r => r.map(([px, py]) => ({ x: (px - minX) / w, y: (py - minY) / h })));

    const insertIdx = curSlide().objects.indexOf(objs[0]);
    objs.forEach(o => {
        const i = curSlide().objects.indexOf(o);
        if (i !== -1) curSlide().objects.splice(i, 1);
    });
    curSlide().objects.splice(Math.min(insertIdx, curSlide().objects.length), 0, newObj);
    state.selection = [newObj.id];
    render(); renderProperties();
}

// SVG path data for a freeform object. Supports two storage formats:
//   pathSegments: [{type:"M"|"L"|"C", x, y, [cp1x,cp1y,cp2x,cp2y]}] (fractional coords) — pen-drawn shapes
//   regions: [[{x,y},...]] (fractional polygon points) — shapes from boolean merge
function freeformPath(obj) {
    if (obj.pathSegments && obj.pathSegments.length >= 2) {
        const ax = v => obj.x + v * obj.w, ay = v => obj.y + v * obj.h;
        let d = "";
        for (const s of obj.pathSegments) {
            if (s.type === "M")      d += `M${ax(s.x)},${ay(s.y)}`;
            else if (s.type === "L") d += `L${ax(s.x)},${ay(s.y)}`;
            else if (s.type === "C") d += `C${ax(s.cp1x)},${ay(s.cp1y)} ${ax(s.cp2x)},${ay(s.cp2y)} ${ax(s.x)},${ay(s.y)}`;
        }
        if (obj.pathClosed) d += "Z";
        return d;
    }
    return (obj.regions || []).map(region => {
        const pts = region.map(p => `${obj.x + p.x * obj.w},${obj.y + p.y * obj.h}`);
        return `M${pts.join("L")}Z`;
    }).join(" ");
}

// ============ Freeform (pen) drawing tool ============

let penDraw = null; // transient drawing state; lives outside `state` since it is never serialised

const PEN_CLOSE_SNAP  = 14; // snap-to-close radius in slide coords
const PEN_DRAG_THRESH =  5; // move threshold to classify a mousedown+move as a "drag"

function cancelFreeformDraw() {
    penDraw = null;
    const el = svg.querySelector("#freeform-preview");
    if (el) el.remove();
    document.body.style.cursor = "";
    setTool("select");
}

// Returns the SVG path segment string from anchor `prev` to anchor `curr`.
// Uses cubic bezier when either endpoint is a smooth (drag-created) anchor.
function _penSegment(prev, curr) {
    if (!prev.smooth && !curr.smooth) return `L${curr.x},${curr.y}`;
    let cp1x, cp1y;
    if (prev.smooth) { cp1x = prev.x + prev.hx * 0.4; cp1y = prev.y + prev.hy * 0.4; }
    else              { cp1x = prev.x + (curr.x - prev.x) / 3; cp1y = prev.y + (curr.y - prev.y) / 3; }
    let cp2x, cp2y;
    if (curr.smooth) { cp2x = curr.x - curr.hx * 0.4; cp2y = curr.y - curr.hy * 0.4; }
    else              { cp2x = curr.x - (curr.x - prev.x) / 3; cp2y = curr.y - (curr.y - prev.y) / 3; }
    return `C${cp1x},${cp1y} ${cp2x},${cp2y} ${curr.x},${curr.y}`;
}

function _buildAnchorPathD(anchors, closed) {
    if (!anchors.length) return "";
    let d = `M${anchors[0].x},${anchors[0].y}`;
    for (let i = 1; i < anchors.length; i++) d += _penSegment(anchors[i-1], anchors[i]);
    if (closed) d += "Z";
    return d;
}

function drawFreeformPreview() {
    let el = svg.querySelector("#freeform-preview");
    if (!el) {
        el = document.createElementNS(svgNS, "g");
        el.id = "freeform-preview";
        el.setAttribute("pointer-events", "none");
        svg.appendChild(el);
    }
    el.innerHTML = "";
    if (!penDraw) return;
    const { anchors, curX, curY, buttonDown, isDragging, downX, downY } = penDraw;
    if (!anchors.length) return;

    let d = _buildAnchorPathD(anchors, false);

    if (buttonDown && isDragging && downX !== null) {
        // Show the curve that would be created if the user releases here
        const last = anchors[anchors.length - 1];
        const hx = curX - downX, hy = curY - downY;
        d += _penSegment(last, { x: downX, y: downY, smooth: true, hx, hy });
        // Draw tangent handle line
        const hl = document.createElementNS(svgNS, "line");
        hl.setAttribute("x1", downX - hx * 0.4); hl.setAttribute("y1", downY - hy * 0.4);
        hl.setAttribute("x2", downX + hx * 0.4); hl.setAttribute("y2", downY + hy * 0.4);
        hl.setAttribute("stroke", "#999"); hl.setAttribute("stroke-width", "1");
        hl.setAttribute("stroke-dasharray", "3,2");
        el.appendChild(hl);
        // Dot at new anchor position
        const ad = document.createElementNS(svgNS, "circle");
        ad.setAttribute("cx", downX); ad.setAttribute("cy", downY); ad.setAttribute("r", 4);
        ad.setAttribute("fill", "white"); ad.setAttribute("stroke", "#2454a0"); ad.setAttribute("stroke-width", "1.5");
        el.appendChild(ad);
    } else if (!buttonDown && curX !== null) {
        // Live preview of next straight segment
        d += `L${curX},${curY}`;
    }

    // Main path
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#2454a0");
    path.setAttribute("stroke-width", "1.5");
    el.appendChild(path);

    // Close-path highlight ring
    const nearClose = !buttonDown && curX !== null && anchors.length >= 3 &&
        Math.hypot(curX - anchors[0].x, curY - anchors[0].y) < PEN_CLOSE_SNAP * 1.5;
    if (nearClose) {
        const ring = document.createElementNS(svgNS, "circle");
        ring.setAttribute("cx", anchors[0].x); ring.setAttribute("cy", anchors[0].y);
        ring.setAttribute("r", 9);
        ring.setAttribute("fill", "rgba(47,160,176,0.2)");
        ring.setAttribute("stroke", "#2fa0b0"); ring.setAttribute("stroke-width", "2");
        el.appendChild(ring);
    }

    // Anchor dots
    anchors.forEach((a, i) => {
        const c = document.createElementNS(svgNS, "circle");
        c.setAttribute("cx", a.x); c.setAttribute("cy", a.y);
        c.setAttribute("r", i === 0 ? 5 : 4);
        c.setAttribute("fill", i === 0 ? "#2fa0b0" : "white");
        c.setAttribute("stroke", "#2454a0"); c.setAttribute("stroke-width", "1.5");
        el.appendChild(c);
    });
}

function finishFreeformDraw(closed) {
    if (!penDraw) return;
    const anchors = penDraw.anchors;
    if (anchors.length < 2) { cancelFreeformDraw(); return; }

    // Compute bounding box (including bezier control points)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    anchors.forEach(a => {
        minX = Math.min(minX, a.x); minY = Math.min(minY, a.y);
        maxX = Math.max(maxX, a.x); maxY = Math.max(maxY, a.y);
        if (a.smooth) {
            minX = Math.min(minX, a.x + a.hx * 0.4, a.x - a.hx * 0.4);
            minY = Math.min(minY, a.y + a.hy * 0.4, a.y - a.hy * 0.4);
            maxX = Math.max(maxX, a.x + a.hx * 0.4, a.x - a.hx * 0.4);
            maxY = Math.max(maxY, a.y + a.hy * 0.4, a.y - a.hy * 0.4);
        }
    });
    minX -= 2; minY -= 2; maxX += 2; maxY += 2;
    const w = Math.max(maxX - minX, 4), h = Math.max(maxY - minY, 4);
    const nx = v => (v - minX) / w, ny = v => (v - minY) / h;

    // Build normalized pathSegments
    const pathSegments = [{ type: "M", x: nx(anchors[0].x), y: ny(anchors[0].y) }];
    for (let i = 1; i < anchors.length; i++) {
        const prev = anchors[i-1], curr = anchors[i];
        if (!prev.smooth && !curr.smooth) {
            pathSegments.push({ type: "L", x: nx(curr.x), y: ny(curr.y) });
        } else {
            let cp1x, cp1y, cp2x, cp2y;
            if (prev.smooth) { cp1x = prev.x + prev.hx*0.4; cp1y = prev.y + prev.hy*0.4; }
            else              { cp1x = prev.x + (curr.x-prev.x)/3; cp1y = prev.y + (curr.y-prev.y)/3; }
            if (curr.smooth) { cp2x = curr.x - curr.hx*0.4; cp2y = curr.y - curr.hy*0.4; }
            else              { cp2x = curr.x - (curr.x-prev.x)/3; cp2y = curr.y - (curr.y-prev.y)/3; }
            pathSegments.push({
                type: "C", x: nx(curr.x), y: ny(curr.y),
                cp1x: nx(cp1x), cp1y: ny(cp1y), cp2x: nx(cp2x), cp2y: ny(cp2y)
            });
        }
    }

    pushHistory();
    const obj = makeObject("freeform", minX, minY, w, h);
    obj.pathSegments = pathSegments;
    obj.pathClosed = closed;
    obj.regions = [[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]]; // bbox polygon for merge ops

    curSlide().objects.push(obj);
    state.selection = [obj.id];
    const el = svg.querySelector("#freeform-preview");
    if (el) el.remove();
    penDraw = null;
    document.body.style.cursor = "";
    setTool("select");
    render(); renderProperties(); pushHistory();
}

// ============ Connectors ============
// distance (in slide units) within which a line/arrow endpoint snaps to a
// nearby shape's connection point
const CONNECTOR_SNAP = 10;
// types that lines/arrows can connect to
const CONNECTABLE_TYPES_EXCLUDE = ["line", "arrow"];

// the 4 edge-midpoint connection points of a shape, in screen space
// (accounting for rotation/flip)
function getConnectionPoints(obj) {
    const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
    return [
        { point: "top", local: [cx, obj.y] },
        { point: "right", local: [obj.x + obj.w, cy] },
        { point: "bottom", local: [cx, obj.y + obj.h] },
        { point: "left", local: [obj.x, cy] },
    ].map(p => {
        const [x, y] = localToScreen(obj, p.local);
        return { point: p.point, id: obj.id, x, y };
    });
}

// finds the nearest connection point (on any other connectable shape) to pt,
// within CONNECTOR_SNAP. Returns {id, point, x, y} or null.
function findConnectionSnap(pt, excludeId) {
    let best = null, bestDist = CONNECTOR_SNAP;
    curSlide().objects.forEach(o => {
        if (o.id === excludeId || CONNECTABLE_TYPES_EXCLUDE.includes(o.type)) return;
        getConnectionPoints(o).forEach(cp => {
            const d = Math.hypot(cp.x - pt.x, cp.y - pt.y);
            if (d < bestDist) { bestDist = d; best = cp; }
        });
    });
    return best;
}

// re-positions connector lines/arrows whose endpoints are attached to other
// shapes' connection points, so they follow when those shapes move/resize
function updateConnectors() {
    curSlide().objects.forEach(obj => {
        if (obj.type !== "line" && obj.type !== "arrow") return;
        let { p1, p2 } = lineEndpoints(obj);
        if (obj.startConnect) {
            const target = getObj(obj.startConnect.id);
            if (!target) { obj.startConnect = null; }
            else {
                const cp = getConnectionPoints(target).find(c => c.point === obj.startConnect.point);
                if (cp) p1 = { x: cp.x, y: cp.y };
            }
        }
        if (obj.endConnect) {
            const target = getObj(obj.endConnect.id);
            if (!target) { obj.endConnect = null; }
            else {
                const cp = getConnectionPoints(target).find(c => c.point === obj.endConnect.point);
                if (cp) p2 = { x: cp.x, y: cp.y };
            }
        }
        if (obj.startConnect || obj.endConnect) {
            if (obj.diag) {
                obj.x = p1.x; obj.w = p2.x - p1.x;
                obj.y = p1.y; obj.h = p2.y - p1.y;
            } else {
                obj.x = p1.x; obj.w = p2.x - p1.x;
                obj.y = p2.y; obj.h = p1.y - p2.y;
            }
        }
    });
}

// draws small markers at every connectable shape's connection points, used
// while drawing/dragging a line or arrow endpoint. Highlights the point
// nearest pt (if within snap range).
function drawConnectionPoints(excludeId, pt) {
    const snap = pt ? findConnectionSnap(pt, excludeId) : null;
    curSlide().objects.forEach(o => {
        if (o.id === excludeId || CONNECTABLE_TYPES_EXCLUDE.includes(o.type)) return;
        getConnectionPoints(o).forEach(cp => {
            const dot = document.createElementNS(svgNS, "circle");
            const isActive = snap && snap.id === cp.id && snap.point === cp.point;
            applyAttrs(dot, {
                cx: cp.x, cy: cp.y, r: isActive ? 5 : 3,
                class: "connection-point" + (isActive ? " active" : ""),
                "pointer-events": "none"
            });
            svg.appendChild(dot);
        });
    });
}

// outline path for a cylinder (flowchart "database" shape)
function cylinderPath(x, y, w, h) {
    const rx = w / 2, ry = h * 0.12;
    const top = y + ry, bottom = y + h - ry;
    return `M${x},${top} A${rx},${ry} 0 0 1 ${x + w},${top} L${x + w},${bottom} A${rx},${ry} 0 0 1 ${x},${bottom} Z M${x},${top} A${rx},${ry} 0 0 0 ${x + w},${top}`;
}

// point on an ellipse centered at (cx,cy) with radii (rx,ry) at angle `deg` degrees
function ellipsePoint(cx, cy, rx, ry, deg) {
    const rad = deg * Math.PI / 180;
    return [cx + rx * Math.cos(rad), cy + ry * Math.sin(rad)];
}

// a ring (donut) - outer ellipse with a smaller concentric hole, drawn with fill-rule evenodd
function donutPath(x, y, w, h) {
    const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, irx = rx * 0.55, iry = ry * 0.55;
    return `M${cx - rx},${cy} A${rx},${ry} 0 1 0 ${cx + rx},${cy} A${rx},${ry} 0 1 0 ${cx - rx},${cy} Z `
         + `M${cx - irx},${cy} A${irx},${iry} 0 1 0 ${cx + irx},${cy} A${irx},${iry} 0 1 0 ${cx - irx},${cy} Z`;
}

// a pie wedge spanning from startDeg to endDeg around the bounding ellipse
function piePath(x, y, w, h, startDeg = -90, endDeg = 180) {
    const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2;
    const [sx, sy] = ellipsePoint(cx, cy, rx, ry, startDeg);
    const [ex, ey] = ellipsePoint(cx, cy, rx, ry, endDeg);
    const large = ((endDeg - startDeg) % 360 + 360) % 360 > 180 ? 1 : 0;
    return `M${cx},${cy} L${sx},${sy} A${rx},${ry} 0 ${large} 1 ${ex},${ey} Z`;
}

// a partial ring spanning from startDeg to endDeg (PowerPoint "Block Arc")
function blockArcPath(x, y, w, h, startDeg = -90, endDeg = 180) {
    const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, irx = rx * 0.6, iry = ry * 0.6;
    const [sx, sy] = ellipsePoint(cx, cy, rx, ry, startDeg);
    const [ex, ey] = ellipsePoint(cx, cy, rx, ry, endDeg);
    const [iex, iey] = ellipsePoint(cx, cy, irx, iry, endDeg);
    const [isx, isy] = ellipsePoint(cx, cy, irx, iry, startDeg);
    const large = ((endDeg - startDeg) % 360 + 360) % 360 > 180 ? 1 : 0;
    return `M${sx},${sy} A${rx},${ry} 0 ${large} 1 ${ex},${ey} L${iex},${iey} A${irx},${iry} 0 ${large} 0 ${isx},${isy} Z`;
}

// crescent moon shape: outer circle with an inner offset circle carved out
function moonPath(x, y, w, h) {
    const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2;
    return `M${cx},${y} A${rx},${ry} 0 0 1 ${cx},${y + h} A${rx * 0.55},${ry} 0 0 0 ${cx},${y} Z`;
}

// a rough cloud outline made of overlapping rounded bumps
function cloudPath(x, y, w, h) {
    return `M${x + w * 0.22},${y + h * 0.7}
        A${w * 0.18},${h * 0.3} 0 1 1 ${x + w * 0.32},${y + h * 0.32}
        A${w * 0.22},${h * 0.32} 0 1 1 ${x + w * 0.62},${y + h * 0.22}
        A${w * 0.2},${h * 0.3} 0 1 1 ${x + w * 0.85},${y + h * 0.62}
        A${w * 0.16},${h * 0.24} 0 1 1 ${x + w * 0.78},${y + h * 0.85}
        L${x + w * 0.25},${y + h * 0.85}
        A${w * 0.16},${h * 0.24} 0 1 1 ${x + w * 0.22},${y + h * 0.7} Z`;
}

// curly brace, opening either to the right ("left brace") or left ("right brace")
function bracePath(x, y, w, h, isLeft) {
    const mid = y + h / 2;
    if (isLeft) {
        return `M${x + w},${y} C${x},${y} ${x},${y} ${x},${y + h * 0.25}
            C${x},${mid - h * 0.04} ${x - w},${mid} ${x},${mid}
            C${x - w},${mid} ${x},${mid + h * 0.04} ${x},${y + h * 0.75}
            C${x},${y + h} ${x},${y + h} ${x + w},${y + h}`;
    }
    return `M${x},${y} C${x + w},${y} ${x + w},${y} ${x + w},${y + h * 0.25}
        C${x + w},${mid - h * 0.04} ${x + 2 * w},${mid} ${x + w},${mid}
        C${x + 2 * w},${mid} ${x + w},${mid + h * 0.04} ${x + w},${y + h * 0.75}
        C${x + w},${y + h} ${x + w},${y + h} ${x},${y + h}`;
}

// square bracket, opening either to the right ("left bracket") or left ("right bracket")
function bracketPath(x, y, w, h, isLeft) {
    if (isLeft) return `M${x + w},${y} L${x},${y} L${x},${y + h} L${x + w},${y + h}`;
    return `M${x},${y} L${x + w},${y} L${x + w},${y + h} L${x},${y + h}`;
}

// circle with a diagonal bar through it ("No" / prohibited symbol)
function noSymbolPath(x, y, w, h) {
    const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2;
    const barW = Math.min(w, h) * 0.12;
    const angle = Math.atan2(h, w);
    const dx = barW / 2 * Math.sin(angle), dy = barW / 2 * Math.cos(angle);
    const outer = `M${cx - rx},${cy} A${rx},${ry} 0 1 0 ${cx + rx},${cy} A${rx},${ry} 0 1 0 ${cx - rx},${cy} Z`;
    const bar = `M${x + dx},${y - dy} L${x + w + dx},${y + h - dy} L${x + w - dx},${y + h + dy} L${x - dx},${y + dy} Z`;
    return `${outer} ${bar}`;
}

// default color palette for multi-series charts (pie/donut slices)
const CHART_PALETTE = ["#2454a0", "#e07b39", "#4caf50", "#f4c542", "#9c27b0", "#e91e63", "#00bcd4", "#795548"];

// ============ Chart rendering helpers ============
function renderBarChart(shape, obj, data, labels) {
    const max = Math.max(...data, 1);
    const n = data.length;
    const padding = 8, labelH = 16;
    const chartX = obj.x + padding, chartW = obj.w - padding * 2;
    const axisY = obj.y + obj.h - padding - labelH;
    const chartH = axisY - (obj.y + padding);
    const gap = chartW * 0.03;
    const barW = (chartW - gap * (n + 1)) / n;
    data.forEach((v, i) => {
        const barH = Math.max((v / max) * chartH, 0);
        const bx = chartX + gap + i * (barW + gap);
        const by = axisY - barH;
        const rect = document.createElementNS(svgNS, "rect");
        applyAttrs(rect, { x: bx, y: by, width: Math.max(barW, 1), height: barH, fill: obj.barColor || "#2454a0" });
        shape.appendChild(rect);
        if (labels[i]) {
            const label = document.createElementNS(svgNS, "text");
            applyAttrs(label, { x: bx + barW / 2, y: axisY + labelH - 2, "text-anchor": "middle", "font-size": 10, fill: "#555555" });
            label.textContent = labels[i];
            shape.appendChild(label);
        }
    });
    const axis = document.createElementNS(svgNS, "line");
    applyAttrs(axis, { x1: chartX, y1: axisY, x2: chartX + chartW, y2: axisY, stroke: "#bbbbbb", "stroke-width": 1 });
    shape.appendChild(axis);
}

function renderLineChart(shape, obj, data, labels) {
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const padding = 8, labelH = 16;
    const chartX = obj.x + padding, chartW = obj.w - padding * 2;
    const axisY = obj.y + obj.h - padding - labelH;
    const chartH = axisY - (obj.y + padding);
    const n = data.length;
    const stepX = n > 1 ? chartW / (n - 1) : 0;
    const range = (max - min) || 1;
    const points = data.map((v, i) => [chartX + i * stepX, axisY - ((v - min) / range) * chartH]);

    const poly = document.createElementNS(svgNS, "polyline");
    applyAttrs(poly, { points: points.map(p => p.join(",")).join(" "), fill: "none", stroke: obj.barColor || "#2454a0", "stroke-width": 2 });
    shape.appendChild(poly);

    points.forEach(([px, py], i) => {
        const dot = document.createElementNS(svgNS, "circle");
        applyAttrs(dot, { cx: px, cy: py, r: 3, fill: obj.barColor || "#2454a0" });
        shape.appendChild(dot);
        if (labels[i]) {
            const label = document.createElementNS(svgNS, "text");
            applyAttrs(label, { x: px, y: axisY + labelH - 2, "text-anchor": "middle", "font-size": 10, fill: "#555555" });
            label.textContent = labels[i];
            shape.appendChild(label);
        }
    });
    const axis = document.createElementNS(svgNS, "line");
    applyAttrs(axis, { x1: chartX, y1: axisY, x2: chartX + chartW, y2: axisY, stroke: "#bbbbbb", "stroke-width": 1 });
    shape.appendChild(axis);
}

function renderPieChart(shape, obj, data, labels, palette, donut, bgFill) {
    const total = data.reduce((a, b) => a + b, 0) || 1;
    const hasLegend = labels.some(l => l);
    const legendW = hasLegend ? Math.min(obj.w * 0.35, 90) : 0;
    const plotW = obj.w - legendW;
    const cx = obj.x + plotW / 2, cy = obj.y + obj.h / 2;
    const r = Math.max(Math.min(plotW, obj.h) / 2 - 8, 1);

    let angle = -Math.PI / 2;
    data.forEach((v, i) => {
        const slice = (v / total) * Math.PI * 2;
        const end = angle + slice;
        const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
        const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
        const largeArc = slice > Math.PI ? 1 : 0;
        const path = document.createElementNS(svgNS, "path");
        const d = total === 0 ? "" : (data.length === 1
            ? `M${cx},${cy} m${r},0 a${r},${r} 0 1 1 ${-2 * r},0 a${r},${r} 0 1 1 ${2 * r},0 Z`
            : `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} Z`);
        if (d) {
            applyAttrs(path, { d, fill: palette[i % palette.length] });
            shape.appendChild(path);
        }
        angle = end;
    });

    if (donut) {
        const hole = document.createElementNS(svgNS, "circle");
        applyAttrs(hole, { cx, cy, r: r * 0.5, fill: bgFill === "none" ? "#ffffff" : bgFill });
        shape.appendChild(hole);
    }

    if (hasLegend) {
        const itemH = Math.min(18, obj.h / labels.length);
        labels.forEach((lab, i) => {
            const ly = obj.y + 8 + i * itemH;
            const swatch = document.createElementNS(svgNS, "rect");
            applyAttrs(swatch, { x: obj.x + plotW + 6, y: ly, width: 10, height: 10, fill: palette[i % palette.length] });
            shape.appendChild(swatch);
            const text = document.createElementNS(svgNS, "text");
            applyAttrs(text, { x: obj.x + plotW + 20, y: ly + 9, "font-size": 10, fill: "#333333" });
            text.textContent = lab;
            shape.appendChild(text);
        });
    }
}

function heartPath(x, y, w, h) {
    const cx = x + w / 2;
    return `M${cx},${y + h * 0.3}
        C${cx},${y} ${x},${y} ${x},${y + h * 0.3}
        C${x},${y + h * 0.6} ${cx},${y + h * 0.8} ${cx},${y + h}
        C${cx},${y + h * 0.8} ${x + w},${y + h * 0.6} ${x + w},${y + h * 0.3}
        C${x + w},${y} ${cx},${y} ${cx},${y + h * 0.3} Z`;
}

// Flipping a rotated object should mirror it left-right (or top-to-bottom)
// as seen on screen, not in its own rotated local axes - which would look
// like flipping along a diagonal once rotated. A screen-space mirror of a
// rotated shape is equivalent to negating its rotation angle and toggling
// the local flip flag (reflection-rotation identity: F*R(a) = R(-a)*F).
function flipObjectScreenH(obj) {
    obj.rotation = (360 - (obj.rotation || 0)) % 360;
    obj.flipH = !obj.flipH;
}
function flipObjectScreenV(obj) {
    obj.rotation = (360 - (obj.rotation || 0)) % 360;
    obj.flipV = !obj.flipV;
}

// builds the SVG transform attribute for an object, combining horizontal/vertical
// flip (applied first, around the shape's own center) with rotation
function shapeTransform(obj) {
    const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
    const parts = [];
    if (obj.rotation) parts.push(`rotate(${obj.rotation} ${cx} ${cy})`);
    if (obj.flipH || obj.flipV) {
        const sx = obj.flipH ? -1 : 1, sy = obj.flipV ? -1 : 1;
        parts.push(`translate(${cx} ${cy})`, `scale(${sx} ${sy})`, `translate(${-cx} ${-cy})`);
    }
    return parts.join(" ");
}

// Rounded-rect SVG path using an absolute radius (clamped to half the shorter side)
function tableRoundedPath(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    if (r <= 0) return `M${x},${y} H${x + w} V${y + h} H${x} Z`;
    return `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`;
}

// Appends custom border-painter lines to targetEl for a table group
function renderCustomBordersInto(obj, targetEl) {
    if (!obj.customBorders || !Object.keys(obj.customBorders).length) return;
    const colX = tableColX(obj), rowY = tableRowY(obj);
    for (const [key, bs] of Object.entries(obj.customBorders)) {
        const parts = key.split(":");
        const type = parts[0], r = parseInt(parts[1]), c = parseInt(parts[2]);
        if (isNaN(r) || isNaN(c)) continue;
        const bl = document.createElementNS(svgNS, "line");
        const w = bs.width ?? 2;
        if (type === "h" && c < colX.length - 1 && r < rowY.length) {
            applyAttrs(bl, { x1: colX[c], y1: rowY[r], x2: colX[c + 1], y2: rowY[r] });
        } else if (type === "v" && r < rowY.length - 1 && c < colX.length) {
            applyAttrs(bl, { x1: colX[c], y1: rowY[r], x2: colX[c], y2: rowY[r + 1] });
        } else continue;
        applyAttrs(bl, { stroke: bs.color || "#000", "stroke-width": w, "stroke-linecap": "square", "pointer-events": "none" });
        if (bs.dash === "dashed") bl.setAttribute("stroke-dasharray", `${w * 3 + 2},${w * 2 + 2}`);
        else if (bs.dash === "dotted") bl.setAttribute("stroke-dasharray", `${w},${w * 1.5 + 1}`);
        targetEl.appendChild(bl);
    }
}

function renderObject(obj, defs, topLevel = true, slideIndex = state.current) {
    const g = document.createElementNS(svgNS, "g");
    if (topLevel) {
        g.setAttribute("class", "shape-el");
        g.setAttribute("data-id", obj.id);
    }
    const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
    const transform = shapeTransform(obj);
    if (transform) g.setAttribute("transform", transform);

    const fill = resolveFill(obj, defs);
    const sAttrs = strokeAttrs(obj, defs);

    let shape;
    switch (obj.type) {
        case "rect":
            shape = document.createElementNS(svgNS, "rect");
            applyAttrs(shape, { x: obj.x, y: obj.y, width: obj.w, height: obj.h, fill, ...sAttrs });
            break;
        case "ellipse":
            shape = document.createElementNS(svgNS, "ellipse");
            applyAttrs(shape, { cx, cy, rx: obj.w / 2, ry: obj.h / 2, fill, ...sAttrs });
            break;
        case "triangle":
        case "equilTriangle":
        case "rightTriangle":
        case "star":
        case "diamond":
        case "pentagon":
        case "hexagon":
        case "heptagon":
        case "decagon":
        case "dodecagon":
            shape = document.createElementNS(svgNS, "polygon");
            applyAttrs(shape, {
                points: getShapePoints(obj).map(p => p.join(",")).join(" "),
                fill, ...sAttrs
            });
            break;
        case "freeform":
            shape = document.createElementNS(svgNS, "path");
            applyAttrs(shape, {
                d: freeformPath(obj), fill, "fill-rule": "evenodd", ...sAttrs
            });
            break;
        case "roundrect":
            shape = document.createElementNS(svgNS, "path");
            applyAttrs(shape, { d: roundedRectPath(obj.x, obj.y, obj.w, obj.h, obj.cornerRadius), fill, ...sAttrs });
            break;
        case "heart":
            shape = document.createElementNS(svgNS, "path");
            applyAttrs(shape, { d: heartPath(obj.x, obj.y, obj.w, obj.h), fill, ...sAttrs });
            break;
        case "speech":
            shape = document.createElementNS(svgNS, "path");
            applyAttrs(shape, { d: speechBubblePath(obj.x, obj.y, obj.w, obj.h), fill, ...sAttrs });
            break;
        case "parallelogram":
        case "trapezoid":
        case "octagon":
        case "cross":
        case "rightArrow":
        case "leftArrow":
        case "upArrow":
        case "downArrow":
        case "doubleArrow":
        case "chevron":
        case "lightningBolt":
            shape = document.createElementNS(svgNS, "polygon");
            applyAttrs(shape, {
                points: getShapePoints(obj).map(p => p.join(",")).join(" "),
                fill, ...sAttrs
            });
            break;
        case "cylinder":
            shape = document.createElementNS(svgNS, "path");
            applyAttrs(shape, { d: cylinderPath(obj.x, obj.y, obj.w, obj.h), fill, ...sAttrs });
            break;
        case "donut":
            shape = document.createElementNS(svgNS, "path");
            applyAttrs(shape, { d: donutPath(obj.x, obj.y, obj.w, obj.h), "fill-rule": "evenodd", fill, ...sAttrs });
            break;
        case "pie":
            shape = document.createElementNS(svgNS, "path");
            applyAttrs(shape, { d: piePath(obj.x, obj.y, obj.w, obj.h), fill, ...sAttrs });
            break;
        case "blockArc":
            shape = document.createElementNS(svgNS, "path");
            applyAttrs(shape, { d: blockArcPath(obj.x, obj.y, obj.w, obj.h), fill, ...sAttrs });
            break;
        case "moon":
            shape = document.createElementNS(svgNS, "path");
            applyAttrs(shape, { d: moonPath(obj.x, obj.y, obj.w, obj.h), fill, ...sAttrs });
            break;
        case "cloud":
            shape = document.createElementNS(svgNS, "path");
            applyAttrs(shape, { d: cloudPath(obj.x, obj.y, obj.w, obj.h), fill, ...sAttrs });
            break;
        case "noSymbol":
            shape = document.createElementNS(svgNS, "path");
            applyAttrs(shape, { d: noSymbolPath(obj.x, obj.y, obj.w, obj.h), "fill-rule": "evenodd", fill, ...sAttrs });
            break;
        case "leftBrace":
        case "rightBrace":
            shape = document.createElementNS(svgNS, "path");
            applyAttrs(shape, { d: bracePath(obj.x, obj.y, obj.w, obj.h, obj.type === "leftBrace"), fill: "none", ...sAttrs });
            break;
        case "leftBracket":
        case "rightBracket":
            shape = document.createElementNS(svgNS, "path");
            applyAttrs(shape, { d: bracketPath(obj.x, obj.y, obj.w, obj.h, obj.type === "leftBracket"), fill: "none", ...sAttrs });
            break;
        case "group": {
            shape = document.createElementNS(svgNS, "g");
            const tChildren = obj.children || [];
            const isTable = !!(obj.tableCols);
            const tRadius = isTable ? Math.max(0, Math.min(obj.tableCornerRadius || 0, obj.w / 2, obj.h / 2)) : 0;

            if (isTable && tRadius > 0 && defs) {
                // Rounded table: clip cell content to the rounded outline, then draw
                // the rounded outline stroke on top so corners look clean.
                const clipId = "tc-" + obj.id;
                const existing = defs.getElementById?.(clipId) || defs.querySelector?.(`#${clipId}`);
                if (!existing) {
                    const cp = document.createElementNS(svgNS, "clipPath");
                    cp.id = clipId;
                    const cpPath = document.createElementNS(svgNS, "path");
                    cpPath.setAttribute("d", tableRoundedPath(obj.x, obj.y, obj.w, obj.h, tRadius));
                    cp.appendChild(cpPath);
                    defs.appendChild(cp);
                }
                const inner = document.createElementNS(svgNS, "g");
                inner.setAttribute("clip-path", `url(#${clipId})`);
                // Render all children except the outline (last rect child)
                tChildren.filter((c, i) => i < tChildren.length - 1 && !c.covered)
                         .forEach(child => inner.appendChild(renderObject(child, defs, false, slideIndex)));
                renderCustomBordersInto(obj, inner);
                shape.appendChild(inner);
                // Draw the rounded outline border on top (unclipped)
                const ol = tChildren[tChildren.length - 1];
                if (ol) {
                    const olEl = document.createElementNS(svgNS, "path");
                    olEl.setAttribute("d", tableRoundedPath(obj.x, obj.y, obj.w, obj.h, tRadius));
                    olEl.setAttribute("fill", "none");
                    applyAttrs(olEl, strokeAttrs(ol, defs));
                    shape.appendChild(olEl);
                }
            } else {
                tChildren.filter(child => !child.covered).forEach(child => shape.appendChild(renderObject(child, defs, false, slideIndex)));
                if (isTable) renderCustomBordersInto(obj, shape);
            }

            // Draw header separator — the line after row 0 at the same weight as the outer border
            if (isTable && obj.tableRows > 1) {
                const olStroke = tChildren[tChildren.length - 1]?.stroke;
                const sepColor = (olStroke && olStroke.color !== "none") ? olStroke.color : "#000000";
                const sepWidth = (olStroke && olStroke.width > 0) ? olStroke.width : 3;
                const sepY = obj.y + (obj.rowHeights?.[0] ?? obj.h / obj.tableRows);
                const sep = document.createElementNS(svgNS, "line");
                applyAttrs(sep, {
                    x1: obj.x, y1: sepY, x2: obj.x + obj.w, y2: sepY,
                    stroke: sepColor, "stroke-width": sepWidth, "stroke-linecap": "square", "pointer-events": "none"
                });
                shape.appendChild(sep);
            }
            break;
        }
        case "line":
        case "arrow": {
            shape = document.createElementNS(svgNS, "line");
            const { p1, p2 } = lineEndpoints(obj);
            applyAttrs(shape, { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, ...sAttrs });
            if (obj.type === "arrow") {
                const markerId = "arrow-" + obj.id;
                const marker = document.createElementNS(svgNS, "marker");
                marker.setAttribute("id", markerId);
                marker.setAttribute("markerWidth", "10");
                marker.setAttribute("markerHeight", "10");
                marker.setAttribute("refX", "6");
                marker.setAttribute("refY", "3");
                marker.setAttribute("orient", "auto");
                marker.setAttribute("markerUnits", "strokeWidth");
                const path = document.createElementNS(svgNS, "path");
                path.setAttribute("d", "M0,0 L6,3 L0,6 Z");
                path.setAttribute("fill", sAttrs.stroke);
                marker.appendChild(path);
                defs.appendChild(marker);
                shape.setAttribute("marker-end", `url(#${markerId})`);
            }
            break;
        }
        case "text": {
            const fo = document.createElementNS(svgNS, "foreignObject");
            applyAttrs(fo, { x: obj.x, y: obj.y, width: obj.w, height: obj.h });
            const div = document.createElement("div");
            div.className = "text-edit-box";
            div.setAttribute("data-id", obj.id);
            div.setAttribute("spellcheck", spellcheckEnabled ? "true" : "false");
            div.setAttribute("lang", "en");
            div.style.fontFamily = `"${obj.fontFamily}", sans-serif`;
            div.style.fontSize = obj.fontSize + "px";
            div.style.color = obj.fontColor;
            div.style.fontWeight = obj.bold ? "bold" : "normal";
            div.style.fontStyle = obj.italic ? "italic" : "normal";
            div.style.textDecoration = [obj.underline && "underline", obj.strikethrough && "line-through"].filter(Boolean).join(" ") || "none";
            div.style.textAlign = obj.align || "left";
            div.style.background = fill === "none" ? "transparent" : fill;
            div.style.paddingLeft = (4 + (obj.indent || 0) * 16) + "px";
            div.style.paddingRight = "4px";
            div.style.paddingTop = div.style.paddingBottom = "2px";
            div.style.boxSizing = "border-box";
            div.style.cursor = "move";
            // keep text wrapping and clipped within the box's current size as
            // it's resized, rather than spilling outside its bounds
            div.style.overflow = "hidden";
            div.style.overflowWrap = "break-word";
            div.style.wordBreak = "break-word";
            if (obj.valign === "middle") {
                div.style.display = "flex";
                div.style.flexDirection = "column";
                div.style.justifyContent = "center";
            }
            if (obj.isCode) {
                div.style.borderRadius = "10px";
                div.style.whiteSpace = "pre-wrap";
                div.style.overflow = "hidden";
                div.style.padding = "10px 12px";
                div.style.position = "relative";
            }
            applyTextEffects(div, obj);
            setTextBoxContent(div, obj, slideIndex);
            fo.appendChild(div);
            shape = fo;
            // border for the text box (so it can be selected/seen even if empty fill)
            if (sAttrs.stroke !== "none") {
                const border = document.createElementNS(svgNS, "rect");
                const borderAttrs = { x: obj.x, y: obj.y, width: obj.w, height: obj.h, fill: "none", ...sAttrs };
                if (obj.isCode) borderAttrs.rx = 10;
                applyAttrs(border, borderAttrs);
                g.appendChild(border);
            }
            break;
        }
        case "image": {
            shape = document.createElementNS(svgNS, "image");
            applyAttrs(shape, { x: obj.x, y: obj.y, width: obj.w, height: obj.h, preserveAspectRatio: "none" });
            // plain `href` (SVG2) survives XMLSerializer round-trips used for
            // slide show / PDF export; `xlink:href` would serialize with an
            // unbound "ns1:" prefix that browsers don't resolve as an image source.
            shape.setAttribute("href", obj.src);

            // Non-destructive CSS/SVG filter pipeline — no pixel data is modified.
            // Order: exposure → tone → colour → presence → artistic
            const imgFilters = [];

            // Exposure
            if (obj.imgBrightness !== undefined && obj.imgBrightness !== 100)
                imgFilters.push(`brightness(${obj.imgBrightness / 100})`);
            if (obj.imgContrast !== undefined && obj.imgContrast !== 100)
                imgFilters.push(`contrast(${obj.imgContrast / 100})`);

            // Tone (Lightroom-style)
            if (obj.imgHighlights) {
                const h = obj.imgHighlights / 100;
                imgFilters.push(h > 0
                    ? `brightness(${(1 + h * 0.28).toFixed(3)}) contrast(${(1 - h * 0.10).toFixed(3)})`
                    : `brightness(${(1 + h * 0.15).toFixed(3)}) contrast(${(1 - h * 0.18).toFixed(3)})`);
            }
            if (obj.imgShadows) {
                const s = obj.imgShadows / 100;
                imgFilters.push(s > 0
                    ? `brightness(${(1 + s * 0.18).toFixed(3)}) contrast(${(1 - s * 0.12).toFixed(3)})`
                    : `brightness(${(1 + s * 0.10).toFixed(3)}) contrast(${(1 - s * 0.22).toFixed(3)})`);
            }
            if (obj.imgWhites) {
                const w = obj.imgWhites / 100;
                imgFilters.push(`brightness(${(1 + w * 0.20).toFixed(3)})`);
            }
            if (obj.imgBlacks) {
                const b = obj.imgBlacks / 100;
                imgFilters.push(b < 0
                    ? `contrast(${(1 - b * 0.25).toFixed(3)}) brightness(${(1 + b * 0.06).toFixed(3)})`
                    : `brightness(${(1 + b * 0.10).toFixed(3)}) contrast(${(1 - b * 0.12).toFixed(3)})`);
            }

            // White balance
            if (obj.imgTemperature) {
                const t = obj.imgTemperature / 100;
                if (t > 0) {
                    imgFilters.push(`sepia(${(t * 0.25).toFixed(3)})`);
                    imgFilters.push(`saturate(${(1 + t * 0.35).toFixed(3)})`);
                    imgFilters.push(`hue-rotate(${(-t * 14).toFixed(1)}deg)`);
                } else {
                    imgFilters.push(`saturate(${(1 + t * 0.20).toFixed(3)})`);
                    imgFilters.push(`hue-rotate(${(-t * 14).toFixed(1)}deg)`);
                }
            }
            if (obj.imgTint) {
                const t = obj.imgTint / 100;
                // positive = magenta, negative = green
                imgFilters.push(`hue-rotate(${(t > 0 ? -t * 12 : -t * 50).toFixed(1)}deg)`);
                imgFilters.push(`saturate(${(1 + Math.abs(t) * 0.15).toFixed(3)})`);
            }

            // Colour
            if (obj.imgVibrance) {
                // Vibrance: gentler than saturation, boosts muted colours more
                imgFilters.push(`saturate(${(1 + obj.imgVibrance / 100 * 0.6).toFixed(3)})`);
            }
            if (obj.imgSaturation !== undefined && obj.imgSaturation !== 100)
                imgFilters.push(`saturate(${obj.imgSaturation / 100})`);
            if (obj.imgHue)
                imgFilters.push(`hue-rotate(${obj.imgHue}deg)`);

            // Presence
            if (obj.imgClarity) {
                const c = obj.imgClarity / 100;
                imgFilters.push(`contrast(${(1 + c * 0.28).toFixed(3)})`);
                if (c > 0) imgFilters.push(`saturate(${(1 + c * 0.12).toFixed(3)})`);
            }

            // Noise reduction (gentle blur)
            if (obj.imgNoise && obj.imgNoise > 0)
                imgFilters.push(`blur(${(obj.imgNoise * 0.12).toFixed(2)}px)`);

            // Soften (negative sharpen)
            if (obj.imgSharpen && obj.imgSharpen < 0)
                imgFilters.push(`blur(${(Math.abs(obj.imgSharpen) * 0.35).toFixed(2)}px)`);

            // Artistic presets
            const artisticFilters = {
                grayscale:    "grayscale(1)",
                sepia:        "sepia(0.8)",
                invert:       "invert(1)",
                blur:         "blur(4px)",
                vintage:      "sepia(0.45) contrast(0.88) brightness(0.92) saturate(1.3) hue-rotate(-5deg)",
                cool:         "hue-rotate(22deg) saturate(1.15) brightness(1.05)",
                warm:         "sepia(0.2) hue-rotate(-18deg) saturate(1.3) brightness(1.05)",
                highcontrast: "contrast(2.2) brightness(0.88)",
                pencil:       "grayscale(1) contrast(1.9) brightness(1.15)",
                matte:        "contrast(0.85) brightness(1.1) saturate(0.8)",
                fade:         "contrast(0.8) brightness(1.15) saturate(0.7) sepia(0.1)",
                chrome:       "grayscale(0.3) contrast(1.4) brightness(1.1) saturate(1.5)",
            };
            if (obj.imgArtistic && artisticFilters[obj.imgArtistic])
                imgFilters.push(artisticFilters[obj.imgArtistic]);

            if (imgFilters.length) shape.style.filter = imgFilters.join(" ");

            // Real unsharp-mask sharpen via SVG feConvolveMatrix.
            // Wrapped in a <g> so it composes on top of the CSS filters above.
            if (obj.imgSharpen && obj.imgSharpen > 0) {
                const shpId = "img-sharpen-" + obj.id;
                const shpFilt = document.createElementNS(svgNS, "filter");
                shpFilt.setAttribute("id", shpId);
                shpFilt.setAttribute("color-interpolation-filters", "sRGB");
                const conv = document.createElementNS(svgNS, "feConvolveMatrix");
                const s = Math.min(obj.imgSharpen / 5, 1);
                conv.setAttribute("order", "3");
                conv.setAttribute("kernelMatrix", `0 ${-s} 0 ${-s} ${1 + 4*s} ${-s} 0 ${-s} 0`);
                conv.setAttribute("preserveAlpha", "true");
                shpFilt.appendChild(conv);
                defs.appendChild(shpFilt);
                const shpG = document.createElementNS(svgNS, "g");
                shpG.setAttribute("filter", `url(#${shpId})`);
                shpG.appendChild(shape);
                if (shape._picBorderRect) { shpG._picBorderRect = shape._picBorderRect; delete shape._picBorderRect; }
                if (shape._vigRect) { shpG._vigRect = shape._vigRect; delete shape._vigRect; }
                if (shape._grainRect) { shpG._grainRect = shape._grainRect; delete shape._grainRect; }
                shape = shpG;
            }

            // Crop via clipPath
            if (obj.imgCrop && (obj.imgCrop.top || obj.imgCrop.right || obj.imgCrop.bottom || obj.imgCrop.left)) {
                const cropId = "img-crop-" + obj.id;
                const clip = document.createElementNS(svgNS, "clipPath");
                clip.setAttribute("id", cropId);
                const clipRect = document.createElementNS(svgNS, "rect");
                const cl = (obj.imgCrop.left || 0) / 100;
                const ct = (obj.imgCrop.top || 0) / 100;
                const cr = (obj.imgCrop.right || 0) / 100;
                const cb = (obj.imgCrop.bottom || 0) / 100;
                applyAttrs(clipRect, {
                    x: obj.x + obj.w * cl,
                    y: obj.y + obj.h * ct,
                    width: obj.w * (1 - cl - cr),
                    height: obj.h * (1 - ct - cb),
                });
                clip.appendChild(clipRect);
                defs.appendChild(clip);
                shape.setAttribute("clip-path", `url(#${cropId})`);
            }

            // Vignette — radial gradient rect overlaid on the image (pointer-events:none)
            if (obj.imgVignette && obj.imgVignette > 0) {
                const vigId = "img-vig-" + obj.id;
                const vigGrad = document.createElementNS(svgNS, "radialGradient");
                vigGrad.setAttribute("id", vigId);
                vigGrad.setAttribute("cx", "50%"); vigGrad.setAttribute("cy", "50%");
                vigGrad.setAttribute("r", "70%");
                vigGrad.setAttribute("gradientUnits", "objectBoundingBox");
                const vs1 = document.createElementNS(svgNS, "stop");
                vs1.setAttribute("offset", "40%"); vs1.setAttribute("stop-color", "#000"); vs1.setAttribute("stop-opacity", "0");
                const vs2 = document.createElementNS(svgNS, "stop");
                vs2.setAttribute("offset", "100%"); vs2.setAttribute("stop-color", "#000"); vs2.setAttribute("stop-opacity", String((obj.imgVignette / 100 * 0.85).toFixed(3)));
                vigGrad.appendChild(vs1); vigGrad.appendChild(vs2);
                defs.appendChild(vigGrad);
                shape._vigRect = document.createElementNS(svgNS, "rect");
                applyAttrs(shape._vigRect, { x: obj.x, y: obj.y, width: obj.w, height: obj.h, fill: `url(#${vigId})`, "pointer-events": "none" });
            }

            // Grain — feTurbulence noise composited over the image
            if (obj.imgGrain && obj.imgGrain > 0) {
                const grId = "img-grain-" + obj.id;
                const grFilt = document.createElementNS(svgNS, "filter");
                grFilt.setAttribute("id", grId);
                grFilt.setAttribute("x", "0%"); grFilt.setAttribute("y", "0%");
                grFilt.setAttribute("width", "100%"); grFilt.setAttribute("height", "100%");
                const turb = document.createElementNS(svgNS, "feTurbulence");
                turb.setAttribute("type", "fractalNoise");
                turb.setAttribute("baseFrequency", (0.55 + obj.imgGrain * 0.003).toFixed(3));
                turb.setAttribute("numOctaves", "3");
                turb.setAttribute("stitchTiles", "stitch");
                turb.setAttribute("result", "noise");
                const cm = document.createElementNS(svgNS, "feColorMatrix");
                cm.setAttribute("in", "noise"); cm.setAttribute("type", "saturate"); cm.setAttribute("values", "0"); cm.setAttribute("result", "grayNoise");
                const blend = document.createElementNS(svgNS, "feBlend");
                blend.setAttribute("in", "SourceGraphic"); blend.setAttribute("in2", "grayNoise");
                blend.setAttribute("mode", "overlay"); blend.setAttribute("result", "blended");
                const comp = document.createElementNS(svgNS, "feComponentTransfer"); comp.setAttribute("in", "blended");
                const fa = document.createElementNS(svgNS, "feFuncA"); fa.setAttribute("type", "linear"); fa.setAttribute("slope", "1"); comp.appendChild(fa);
                grFilt.appendChild(turb); grFilt.appendChild(cm); grFilt.appendChild(blend); grFilt.appendChild(comp);
                defs.appendChild(grFilt);
                shape._grainRect = document.createElementNS(svgNS, "rect");
                applyAttrs(shape._grainRect, { x: obj.x, y: obj.y, width: obj.w, height: obj.h, fill: "transparent", filter: `url(#${grId})`, "pointer-events": "none" });
            }

            // Picture border: stored for post-processing after shape is added to g
            if (obj.picBorderWidth && obj.picBorderWidth > 0 && obj.picBorderStyle && obj.picBorderStyle !== "none") {
                const borderRect = document.createElementNS(svgNS, "rect");
                applyAttrs(borderRect, { x: obj.x, y: obj.y, width: obj.w, height: obj.h });
                borderRect.style.fill = "none";
                borderRect.style.stroke = obj.picBorderColor || "#000000";
                borderRect.style.strokeWidth = obj.picBorderWidth;
                if (obj.picBorderStyle === "dashed") borderRect.style.strokeDasharray = "8 4";
                else if (obj.picBorderStyle === "dotted") borderRect.style.strokeDasharray = "2 4";
                shape._picBorderRect = borderRect;
            }
            break;
        }
        case "chart": {
            shape = document.createElementNS(svgNS, "g");
            const bg = document.createElementNS(svgNS, "rect");
            applyAttrs(bg, { x: obj.x, y: obj.y, width: obj.w, height: obj.h, fill, ...sAttrs });
            shape.appendChild(bg);
            const data = (obj.chartData && obj.chartData.length) ? obj.chartData : [1];
            const labels = obj.chartLabels || [];
            const chartType = obj.chartType || "bar";
            if (chartType === "pie" || chartType === "donut") {
                renderPieChart(shape, obj, data, labels, CHART_PALETTE, chartType === "donut", fill);
            } else if (chartType === "line") {
                renderLineChart(shape, obj, data, labels);
            } else {
                renderBarChart(shape, obj, data, labels);
            }
            break;
        }
        case "zoom": {
            const fo = document.createElementNS(svgNS, "foreignObject");
            applyAttrs(fo, { x: obj.x, y: obj.y, width: obj.w, height: obj.h });
            const wrapper = document.createElement("div");
            wrapper.className = "zoom-thumb";
            const targetSlide = state.slides[obj.targetSlide];
            if (targetSlide) {
                const miniSvg = document.createElementNS(svgNS, "svg");
                miniSvg.setAttribute("viewBox", `0 0 ${SLIDE_W} ${SLIDE_H}`);
                const miniDefs = document.createElementNS(svgNS, "defs");
                miniSvg.appendChild(miniDefs);
                const bgRect = document.createElementNS(svgNS, "rect");
                applyAttrs(bgRect, { x: 0, y: 0, width: SLIDE_W, height: SLIDE_H, fill: resolveFill(targetSlide, miniDefs) });
                miniSvg.appendChild(bgRect);
                targetSlide.objects.forEach(o => miniSvg.appendChild(renderObject(o, miniDefs, false, obj.targetSlide)));
                wrapper.appendChild(miniSvg);
            }
            const label = document.createElement("div");
            label.className = "zoom-label";
            label.textContent = `Slide ${(obj.targetSlide ?? 0) + 1}`;
            wrapper.appendChild(label);
            fo.appendChild(wrapper);
            shape = fo;
            break;
        }
        case "object": {
            shape = document.createElementNS(svgNS, "g");
            const rect = document.createElementNS(svgNS, "rect");
            applyAttrs(rect, { x: obj.x, y: obj.y, width: obj.w, height: obj.h, fill, ...sAttrs });
            shape.appendChild(rect);
            const icon = document.createElementNS(svgNS, "text");
            applyAttrs(icon, { x: obj.x + obj.w / 2, y: obj.y + obj.h / 2 - 4, "text-anchor": "middle", "font-size": Math.min(obj.w, obj.h) * 0.35 });
            icon.textContent = "📎";
            shape.appendChild(icon);
            const label = document.createElementNS(svgNS, "text");
            applyAttrs(label, { x: obj.x + obj.w / 2, y: obj.y + obj.h - 8, "text-anchor": "middle", "font-size": 11, fill: "#555555" });
            label.textContent = obj.fileName || "Object";
            shape.appendChild(label);
            break;
        }
        case "video": {
            const fo = document.createElementNS(svgNS, "foreignObject");
            applyAttrs(fo, { x: obj.x, y: obj.y, width: obj.w, height: obj.h });
            if (obj.src) {
                const video = document.createElement("video");
                video.src = obj.src;
                video.controls = true;
                video.style.width = "100%";
                video.style.height = "100%";
                fo.appendChild(video);
            } else {
                const div = document.createElement("div");
                div.className = "media-placeholder";
                div.textContent = "🎥 Video";
                fo.appendChild(div);
            }
            shape = fo;
            break;
        }
        case "audio": {
            const fo = document.createElementNS(svgNS, "foreignObject");
            applyAttrs(fo, { x: obj.x, y: obj.y, width: obj.w, height: obj.h });
            const wrap = document.createElement("div");
            wrap.className = "media-placeholder";
            if (obj.src) {
                const audio = document.createElement("audio");
                audio.src = obj.src;
                audio.controls = true;
                audio.style.width = "100%";
                wrap.appendChild(audio);
            } else {
                wrap.textContent = "🔊 Audio";
            }
            fo.appendChild(wrap);
            shape = fo;
            break;
        }
        case "icon": {
            const iconDef = ICON_LIBRARY.find(ic => ic.id === obj.iconId);
            if (!iconDef) {
                shape = document.createElementNS(svgNS, "rect");
                applyAttrs(shape, { x: obj.x, y: obj.y, width: obj.w, height: obj.h, fill: "none", stroke: "#aaa", "stroke-dasharray": "4,4", "stroke-width": 1 });
            } else {
                const ig = document.createElementNS(svgNS, "g");
                const sx = obj.w / 24, sy = obj.h / 24;
                ig.setAttribute("transform", `translate(${obj.x},${obj.y}) scale(${sx},${sy})`);
                const p = document.createElementNS(svgNS, "path");
                p.setAttribute("d", iconDef.d);
                p.setAttribute("fill", fill);
                p.setAttribute("fill-rule", "evenodd");
                ig.appendChild(p);
                shape = ig;
            }
            break;
        }
    }
    if (obj.opacity !== undefined && obj.opacity < 100) {
        g.setAttribute("opacity", (obj.opacity / 100).toFixed(2));
    }
    let filterTarget = g;
    if (obj.shadow || obj.glow) {
        const filterId = "fx-" + obj.id;
        const filter = document.createElementNS(svgNS, "filter");
        filter.setAttribute("id", filterId);
        const region = obj.shadow && obj.shadowPerspective ? 150 : 60;
        filter.setAttribute("x", `-${region}%`); filter.setAttribute("y", `-${region}%`);
        filter.setAttribute("width", `${100 + region * 2}%`); filter.setAttribute("height", `${100 + region * 2}%`);
        if (obj.glow) {
            const glowDrop = document.createElementNS(svgNS, "feDropShadow");
            glowDrop.setAttribute("dx", "0"); glowDrop.setAttribute("dy", "0");
            glowDrop.setAttribute("stdDeviation", String(obj.glowSize ?? 6));
            glowDrop.setAttribute("flood-color", obj.glowColor || "#65c8d6");
            glowDrop.setAttribute("flood-opacity", ((obj.glowOpacity ?? 85) / 100).toFixed(2));
            filter.appendChild(glowDrop);
        }
        if (obj.shadow) {
            const angleRad = (obj.shadowAngle ?? 45) * Math.PI / 180;
            const dist = obj.shadowDistance ?? 4;
            const blur = obj.shadowBlur ?? 4;
            const color = obj.shadowColor || "#000000";
            const opacity = ((obj.shadowOpacity ?? 40) / 100).toFixed(2);
            if (obj.shadowPerspective) {
                const farDist = dist * 3;
                const far = document.createElementNS(svgNS, "feDropShadow");
                far.setAttribute("dx", (Math.cos(angleRad) * farDist).toFixed(2));
                far.setAttribute("dy", (Math.sin(angleRad) * farDist).toFixed(2));
                far.setAttribute("stdDeviation", String(blur * 2.5));
                far.setAttribute("flood-color", color);
                far.setAttribute("flood-opacity", (opacity * 0.5).toFixed(2));
                filter.appendChild(far);
            }
            const drop = document.createElementNS(svgNS, "feDropShadow");
            drop.setAttribute("dx", (Math.cos(angleRad) * dist).toFixed(2));
            drop.setAttribute("dy", (Math.sin(angleRad) * dist).toFixed(2));
            drop.setAttribute("stdDeviation", String(blur));
            drop.setAttribute("flood-color", color);
            drop.setAttribute("flood-opacity", opacity);
            filter.appendChild(drop);
        }
        defs.appendChild(filter);
        if (obj.type === "text" && obj.isCode) {
            // keep the language badge crisp: apply the filter to an inner
            // group around the code block only, not the whole element
            const fxGroup = document.createElementNS(svgNS, "g");
            fxGroup.setAttribute("filter", `url(#${filterId})`);
            g.appendChild(fxGroup);
            filterTarget = fxGroup;
        } else {
            g.setAttribute("filter", `url(#${filterId})`);
        }
    }
    if (!topLevel) g.setAttribute("data-child-id", obj.id);

    // reflection: a mirrored, fading copy of the shape below the original
    if (obj.reflection && shape) {
        const maskId = "refl-mask-" + obj.id;
        const grad = document.createElementNS(svgNS, "linearGradient");
        grad.setAttribute("id", maskId + "-grad");
        grad.setAttribute("x1", "0"); grad.setAttribute("y1", "0");
        grad.setAttribute("x2", "0"); grad.setAttribute("y2", "1");
        const maxOpacity = (obj.reflectionOpacity ?? 50) / 100;
        const stop1 = document.createElementNS(svgNS, "stop");
        stop1.setAttribute("offset", "0"); stop1.setAttribute("stop-color", "#ffffff"); stop1.setAttribute("stop-opacity", maxOpacity.toFixed(2));
        const stop2 = document.createElementNS(svgNS, "stop");
        stop2.setAttribute("offset", "1"); stop2.setAttribute("stop-color", "#ffffff"); stop2.setAttribute("stop-opacity", "0");
        grad.appendChild(stop1); grad.appendChild(stop2);
        defs.appendChild(grad);

        const sizeFrac = (obj.reflectionSize ?? 50) / 100;
        const mask = document.createElementNS(svgNS, "mask");
        mask.setAttribute("id", maskId);
        const maskRect = document.createElementNS(svgNS, "rect");
        applyAttrs(maskRect, { x: obj.x, y: obj.y + obj.h, width: obj.w, height: Math.max(obj.h * sizeFrac, 1), fill: `url(#${maskId}-grad)` });
        mask.appendChild(maskRect);
        defs.appendChild(mask);

        const reflG = document.createElementNS(svgNS, "g");
        reflG.setAttribute("mask", `url(#${maskId})`);
        const flipG = document.createElementNS(svgNS, "g");
        flipG.setAttribute("transform", `translate(0 ${2 * (obj.y + obj.h)}) scale(1 -1)`);
        flipG.appendChild(shape.cloneNode(true));
        reflG.appendChild(flipG);
        g.appendChild(reflG);
    }

    filterTarget.appendChild(shape);

    // Picture border overlay rect (image objects don't support SVG stroke natively)
    if (shape._picBorderRect) {
        filterTarget.appendChild(shape._picBorderRect);
        delete shape._picBorderRect;
    }
    // Vignette overlay rect
    if (shape._vigRect) { filterTarget.appendChild(shape._vigRect); delete shape._vigRect; }
    // Grain overlay rect
    if (shape._grainRect) { filterTarget.appendChild(shape._grainRect); delete shape._grainRect; }

    if (obj.type === "text" && obj.isCode) {
        const badge = getCodeBadge(obj.codeLang);
        const badgeFo = document.createElementNS(svgNS, "foreignObject");
        applyAttrs(badgeFo, { x: obj.x, y: obj.y, width: obj.w, height: obj.h });
        const badgeWrap = document.createElement("div");
        badgeWrap.style.width = "100%";
        badgeWrap.style.height = "100%";
        badgeWrap.style.boxSizing = "border-box";
        badgeWrap.style.display = "flex";
        badgeWrap.style.justifyContent = "flex-end";
        badgeWrap.style.alignItems = "flex-start";
        badgeWrap.style.padding = "6px";
        badgeWrap.style.pointerEvents = "none";
        const badgeEl = document.createElement("span");
        badgeEl.textContent = badge.abbr;
        badgeEl.style.background = badge.color;
        badgeEl.style.color = badge.text;
        badgeEl.style.fontSize = "10px";
        badgeEl.style.fontWeight = "700";
        badgeEl.style.padding = "2px 5px";
        badgeEl.style.borderRadius = "4px";
        badgeEl.style.fontFamily = "Arial, sans-serif";
        badgeEl.style.lineHeight = "1.2";
        badgeWrap.appendChild(badgeEl);
        badgeFo.appendChild(badgeWrap);
        g.appendChild(badgeFo);
    }

    // typed text overlay for shapes (rect, ellipse, etc.) - rendered for both
    // top-level objects and shapes nested inside a group, so grouped shapes'
    // text labels remain visible and editable.
    if (TEXT_CAPABLE_SHAPES.includes(obj.type) && obj.text) {
        const fo = document.createElementNS(svgNS, "foreignObject");
        applyAttrs(fo, { x: obj.x, y: obj.y, width: obj.w, height: obj.h });
        const div = document.createElement("div");
        div.className = "text-edit-box shape-text";
        div.setAttribute("data-id", obj.id);
        div.style.fontFamily = `"${obj.fontFamily}", sans-serif`;
        div.style.fontSize = obj.fontSize + "px";
        div.style.color = obj.fontColor;
        div.style.fontWeight = obj.bold ? "bold" : "normal";
        div.style.fontStyle = obj.italic ? "italic" : "normal";
        div.style.textDecoration = [obj.underline && "underline", obj.strikethrough && "line-through"].filter(Boolean).join(" ") || "none";
        div.style.textAlign = obj.align || "center";
        div.style.display = "flex";
        div.style.flexDirection = "column";
        div.style.justifyContent = "center";
        div.style.padding = "2px 6px";
        div.style.boxSizing = "border-box";
        div.style.background = "transparent";
        div.style.cursor = "move";
        div.style.overflow = "hidden";
        div.style.overflowWrap = "break-word";
        div.style.wordBreak = "break-word";
        div.style.minWidth = "0";
        div.style.minHeight = "0";
        applyTextEffects(div, obj);
        setTextBoxContent(div, obj, slideIndex);
        fo.appendChild(div);
        g.appendChild(fo);
    }

    return g;
}

// ============ Selection overlay ============
const HANDLE_SIZE = 12;

function renderSelectionOverlay() {
    if (state.selection.length === 0) return;
    const objs = state.selection.map(getObj).filter(Boolean);
    if (objs.length === 0) return;

    // Scale all handle geometry inversely with zoom so handles stay
    // constant size on screen regardless of zoom level.
    const inv = 1 / (currentScale || 1);
    const hs = HANDLE_SIZE * inv;
    const sw = Math.max(0.5, 1 * inv);  // selection box stroke-width
    const rotOffset = 22 * inv;
    const rotR = 8 * inv;

    if (objs.length === 1) {
        const obj = objs[0];
        const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
        const g = document.createElementNS(svgNS, "g");
        if (obj.rotation) g.setAttribute("transform", `rotate(${obj.rotation} ${cx} ${cy})`);

        const box = document.createElementNS(svgNS, "rect");
        applyAttrs(box, { x: obj.x, y: obj.y, width: obj.w, height: obj.h, class: "selection-box", "stroke-width": sw });
        g.appendChild(box);

        // vertex edit-points mode: draw draggable vertex handles instead of
        // the normal resize/rotate handles
        if (state.editPoints === obj.id && EDIT_POINTS_SHAPE_TYPES.includes(obj.type)) {
            svg.appendChild(g);
            const pts = getShapePoints(obj) || [];
            pts.forEach((p, i) => {
                const [sx, sy] = localToScreen(obj, p);
                const v = document.createElementNS(svgNS, "circle");
                applyAttrs(v, { cx: sx, cy: sy, r: hs / 2, class: "handle vertex-handle", "data-handle": "vertex", "data-index": i, "stroke-width": sw });
                svg.appendChild(v);
            });
            return;
        }

        // resize handles at 8 positions
        const positions = [
            ["nw", obj.x, obj.y], ["n", obj.x + obj.w / 2, obj.y], ["ne", obj.x + obj.w, obj.y],
            ["e", obj.x + obj.w, obj.y + obj.h / 2], ["se", obj.x + obj.w, obj.y + obj.h],
            ["s", obj.x + obj.w / 2, obj.y + obj.h], ["sw", obj.x, obj.y + obj.h], ["w", obj.x, obj.y + obj.h / 2]
        ];
        positions.forEach(([dir, hx, hy]) => {
            const h = document.createElementNS(svgNS, "rect");
            applyAttrs(h, {
                x: hx - hs / 2, y: hy - hs / 2,
                width: hs, height: hs,
                class: "handle", "data-handle": dir, "stroke-width": sw
            });
            g.appendChild(h);
        });

        // PowerPoint-style corner-radius adjustment handle for rounded rectangles
        if (obj.type === "roundrect") {
            const ratio = Math.max(0, Math.min(0.5, obj.cornerRadius ?? 0.15));
            const r = Math.min(obj.w, obj.h) * ratio;
            const adj = document.createElementNS(svgNS, "circle");
            applyAttrs(adj, { cx: obj.x + r, cy: obj.y, r: hs / 2, class: "handle adjust-handle", "data-handle": "adjust", "stroke-width": sw });
            g.appendChild(adj);
        }

        // rotate handle
        const rot = document.createElementNS(svgNS, "circle");
        applyAttrs(rot, { cx: obj.x + obj.w / 2, cy: obj.y - rotOffset, r: rotR, class: "handle rotate", "data-handle": "rotate" });
        g.appendChild(rot);
        const rline = document.createElementNS(svgNS, "line");
        applyAttrs(rline, { x1: obj.x + obj.w / 2, y1: obj.y, x2: obj.x + obj.w / 2, y2: obj.y - rotOffset, stroke: "#2454a0", "stroke-width": sw });
        g.appendChild(rline);

        // table row/column divider handles: drag to resize cells
        if (obj.type === "group" && obj.tableCols) {
            const DIV_HIT = 6 * inv;
            let cx2 = obj.x;
            for (let c = 0; c < obj.tableCols - 1; c++) {
                cx2 += obj.colWidths[c];
                const d = document.createElementNS(svgNS, "rect");
                applyAttrs(d, {
                    x: cx2 - DIV_HIT / 2, y: obj.y, width: DIV_HIT, height: obj.h,
                    class: "handle table-divider col-divider", "data-handle": "col-divider", "data-index": c
                });
                g.appendChild(d);
            }
            let cy2 = obj.y;
            for (let r = 0; r < obj.tableRows - 1; r++) {
                cy2 += obj.rowHeights[r];
                const d = document.createElementNS(svgNS, "rect");
                applyAttrs(d, {
                    x: obj.x, y: cy2 - DIV_HIT / 2, width: obj.w, height: DIV_HIT,
                    class: "handle table-divider row-divider", "data-handle": "row-divider", "data-index": r
                });
                g.appendChild(d);
            }

            // highlight the currently selected cell(s) (for fill/border editing)
            state.cellSelections.forEach(cellId => {
                const cell = findObjectById(obj.children, cellId);
                if (cell) {
                    const hl = document.createElementNS(svgNS, "rect");
                    applyAttrs(hl, { x: cell.x, y: cell.y, width: cell.w, height: cell.h, class: "cell-highlight", "stroke-width": sw });
                    g.appendChild(hl);
                }
            });
        }

        svg.appendChild(g);
    } else {
        objs.forEach(obj => {
            const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
            const box = document.createElementNS(svgNS, "rect");
            applyAttrs(box, { x: obj.x, y: obj.y, width: obj.w, height: obj.h, class: "selection-box", "stroke-width": sw });
            if (obj.rotation) box.setAttribute("transform", `rotate(${obj.rotation} ${cx} ${cy})`);
            svg.appendChild(box);
        });
    }
}

// ============ Visual Crop Mode ============
let cropState = null; // { id, edge: 'top'|'right'|'bottom'|'left'|null, startPt, startCrop }

function enterCropMode(objId) {
    const obj = getObj(objId);
    cropState = {
        id: objId, edge: null,
        originalCrop: obj ? JSON.parse(JSON.stringify(obj.imgCrop || {})) : {}
    };
    document.getElementById("picCropDoneBtn").style.display = "";
    document.getElementById("picCropCancelBtn").style.display = "";
    document.getElementById("picVisualCropBtn").style.display = "none";
    canvasArea.style.cursor = "crosshair";
    render();
}

function exitCropMode(apply) {
    if (!cropState) return;
    if (!apply) {
        const obj = getObj(cropState.id);
        if (obj) obj.imgCrop = cropState.originalCrop;
    }
    cropState = null;
    document.getElementById("picCropDoneBtn").style.display = "none";
    document.getElementById("picCropCancelBtn").style.display = "none";
    document.getElementById("picVisualCropBtn").style.display = "";
    canvasArea.style.cursor = "";
    render();
}

function renderCropOverlay(obj) {
    const inv = 1 / (currentScale || 1);
    const crop = obj.imgCrop || { top: 0, right: 0, bottom: 0, left: 0 };
    const cl = (crop.left || 0) / 100 * obj.w;
    const ct = (crop.top || 0) / 100 * obj.h;
    const cr = (crop.right || 0) / 100 * obj.w;
    const cb = (crop.bottom || 0) / 100 * obj.h;

    const x1 = obj.x + cl, y1 = obj.y + ct;
    const x2 = obj.x + obj.w - cr, y2 = obj.y + obj.h - cb;

    // Darken cropped-away areas
    const darkenStyle = "fill:rgba(0,0,0,0.45);pointer-events:none";
    function addDark(x, y, w, h) {
        if (w <= 0 || h <= 0) return;
        const r = document.createElementNS(svgNS, "rect");
        applyAttrs(r, { x, y, width: w, height: h });
        r.setAttribute("style", darkenStyle);
        svg.appendChild(r);
    }
    addDark(obj.x, obj.y, obj.w, ct);           // top
    addDark(obj.x, y2, obj.w, cb);               // bottom
    addDark(obj.x, y1, cl, y2 - y1);             // left
    addDark(x2, y1, cr, y2 - y1);                // right

    // Crop boundary rect
    const bdr = document.createElementNS(svgNS, "rect");
    applyAttrs(bdr, { x: x1, y: y1, width: x2 - x1, height: y2 - y1 });
    bdr.style.cssText = "fill:none;stroke:#fff;stroke-width:" + (1.5 * inv) + ";pointer-events:none";
    svg.appendChild(bdr);
    // Rule-of-thirds grid lines
    for (let i = 1; i < 3; i++) {
        const vl = document.createElementNS(svgNS, "line");
        applyAttrs(vl, { x1: x1 + (x2-x1)*i/3, y1: y1, x2: x1 + (x2-x1)*i/3, y2 });
        vl.style.cssText = "stroke:rgba(255,255,255,0.4);stroke-width:" + inv;
        svg.appendChild(vl);
        const hl = document.createElementNS(svgNS, "line");
        applyAttrs(hl, { x1, y1: y1 + (y2-y1)*i/3, x2, y2: y1 + (y2-y1)*i/3 });
        hl.style.cssText = "stroke:rgba(255,255,255,0.4);stroke-width:" + inv;
        svg.appendChild(hl);
    }

    // Edge drag handles (invisible wide hit-zone + visible line)
    const hs = 8 * inv; // half hit-width
    const handles = [
        { edge: "top",    x: x1, y: y1 - hs, w: x2-x1, h: hs*2, cursor: "n-resize" },
        { edge: "bottom", x: x1, y: y2 - hs, w: x2-x1, h: hs*2, cursor: "s-resize" },
        { edge: "left",   x: x1 - hs, y: y1, w: hs*2, h: y2-y1, cursor: "w-resize" },
        { edge: "right",  x: x2 - hs, y: y1, w: hs*2, h: y2-y1, cursor: "e-resize" },
    ];
    handles.forEach(h => {
        const r = document.createElementNS(svgNS, "rect");
        applyAttrs(r, { x: h.x, y: h.y, width: h.w, height: h.h });
        r.style.cssText = "fill:transparent;cursor:" + h.cursor;
        r.dataset.cropEdge = h.edge;
        svg.appendChild(r);
    });

    // Corner handles
    const cs = 6 * inv;
    [[x1, y1], [x2, y1], [x1, y2], [x2, y2]].forEach(([cx, cy]) => {
        const c = document.createElementNS(svgNS, "rect");
        applyAttrs(c, { x: cx - cs/2, y: cy - cs/2, width: cs, height: cs });
        c.style.cssText = "fill:#fff;stroke:#333;stroke-width:" + (0.8*inv) + ";pointer-events:none";
        svg.appendChild(c);
    });
}

// ============ Slides panel ============
// ---- Slide clipboard (copy/paste) ----
let slideCopyBuffer = null;

function duplicateSlide(i) {
    pushHistory(true);
    const copy = JSON.parse(JSON.stringify(state.slides[i]));
    state.slides.splice(i + 1, 0, copy);
    state.current = i + 1;
    state.selection = [];
    render(); renderProperties();
}

function copySlide(i) {
    slideCopyBuffer = JSON.parse(JSON.stringify(state.slides[i]));
    document.getElementById("slidesList").classList.add("has-copy");
}

function pasteSlide(afterIndex) {
    if (!slideCopyBuffer) return;
    pushHistory(true);
    const copy = JSON.parse(JSON.stringify(slideCopyBuffer));
    state.slides.splice(afterIndex + 1, 0, copy);
    state.current = afterIndex + 1;
    state.selection = [];
    render(); renderProperties();
}

function deleteSlide(i) {
    if (state.slides.length <= 1) return;
    if (!confirm(`Delete slide ${i + 1}? This cannot be undone after the next save.`)) return;
    pushHistory(true);
    state.slides.splice(i, 1);
    if (state.current >= state.slides.length) state.current = state.slides.length - 1;
    state.selection = [];
    render(); renderProperties();
}

// ---- Slide context menu ----
const slideCtxMenu = (() => {
    const menu = document.createElement("div");
    menu.id = "slideContextMenu";
    menu.style.cssText = "position:fixed;z-index:9000;background:#fff;border:1px solid #c8d4dc;border-radius:5px;box-shadow:0 4px 14px rgba(0,0,0,0.16);padding:4px 0;min-width:160px;font-size:0.82rem;display:none";
    document.body.appendChild(menu);
    let targetIndex = -1;

    function item(label, action, disabled) {
        const btn = document.createElement("button");
        btn.style.cssText = "display:block;width:100%;text-align:left;padding:6px 14px;background:none;border:none;cursor:pointer;color:" + (disabled ? "#aaa" : "#222");
        btn.textContent = label;
        if (!disabled) btn.onmouseenter = () => { btn.style.background = "#e8f4f7"; };
        btn.onmouseleave = () => { btn.style.background = "none"; };
        if (!disabled) btn.onclick = () => { close(); action(); };
        return btn;
    }

    function divider() {
        const d = document.createElement("div");
        d.style.cssText = "height:1px;background:#e8eef2;margin:3px 0";
        return d;
    }

    function open(e, i) {
        targetIndex = i;
        menu.innerHTML = "";
        menu.appendChild(item("Duplicate Slide", () => duplicateSlide(targetIndex)));
        menu.appendChild(divider());
        menu.appendChild(item("Copy Slide", () => copySlide(targetIndex)));
        menu.appendChild(item("Paste Slide After", () => pasteSlide(targetIndex), !slideCopyBuffer));
        menu.appendChild(divider());
        menu.appendChild(item("Delete Slide", () => deleteSlide(targetIndex), state.slides.length <= 1));
        const x = Math.min(e.clientX, window.innerWidth - 175);
        const y = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 10);
        menu.style.left = x + "px";
        menu.style.top = y + "px";
        menu.style.display = "block";
        // measure height after display so we can clamp properly
        requestAnimationFrame(() => {
            const h = menu.offsetHeight;
            if (e.clientY + h > window.innerHeight - 4) menu.style.top = (window.innerHeight - h - 4) + "px";
        });
    }

    function close() { menu.style.display = "none"; }
    document.addEventListener("mousedown", (e) => { if (!menu.contains(e.target)) close(); }, true);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

    return { open, close };
})();

function renderSlidesPanel() {
    const list = document.getElementById("slidesList");
    list.innerHTML = "";
    state.slides.forEach((slide, i) => {
        const thumb = document.createElement("div");
        thumb.className = "slide-thumb" + (i === state.current ? " active" : "");
        thumb.style.aspectRatio = `${SLIDE_W} / ${SLIDE_H}`;
        const miniSvg = document.createElementNS(svgNS, "svg");
        miniSvg.setAttribute("viewBox", `0 0 ${SLIDE_W} ${SLIDE_H}`);
        const defs = document.createElementNS(svgNS, "defs");
        miniSvg.appendChild(defs);
        const bg = document.createElementNS(svgNS, "rect");
        applyAttrs(bg, { x: 0, y: 0, width: SLIDE_W, height: SLIDE_H, fill: resolveFill(slide, defs) });
        miniSvg.appendChild(bg);
        slide.objects.forEach(obj => miniSvg.appendChild(renderObject(obj, defs, true, i)));
        appendHeaderFooter(miniSvg);
        thumb.appendChild(miniSvg);

        const num = document.createElement("span");
        num.className = "slide-num";
        num.textContent = i + 1;
        thumb.appendChild(num);

        const del = document.createElement("button");
        del.className = "slide-del";
        del.textContent = "✕";
        del.title = "Delete slide";
        del.onclick = (e) => { e.stopPropagation(); deleteSlide(i); };
        thumb.appendChild(del);

        thumb.onclick = () => {
            state.current = i;
            state.selection = [];
            render(); renderProperties();
        };
        thumb.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            state.current = i;
            render(); renderProperties();
            slideCtxMenu.open(e, i);
        });
        list.appendChild(thumb);
    });
}

document.getElementById("slidesList").addEventListener("click", (e) => {
    // Paste on click of empty sidebar area (not on a slide thumb or its children)
    if (e.target.closest(".slide-thumb")) return;
    if (!slideCopyBuffer) return;
    pasteSlide(state.slides.length - 1);
});

document.getElementById("addSlideBtn").onclick = () => {
    pushHistory(true);
    state.slides.push(makeSlide());
    state.current = state.slides.length - 1;
    state.selection = [];
    render(); renderProperties();
};

// ============ Toolbar: tool selection ============
document.querySelectorAll(".tool-btn").forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll(".tool-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.tool = btn.dataset.tool;
        state.selection = [];
        render(); renderProperties();
        const menu = btn.closest(".ribbon-dropdown-menu");
        if (menu) menu.classList.remove("open");
    };
});

// ============ Image insert ============
document.getElementById("picturesBtn").onclick = () => document.getElementById("imageInput").click();
document.getElementById("imageInput").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        const img = new Image();
        img.onload = () => {
            let w = img.width, h = img.height;
            const maxDim = 300;
            if (w > maxDim || h > maxDim) {
                const scale = maxDim / Math.max(w, h);
                w *= scale; h *= scale;
            }
            const obj = makeObject("image", (SLIDE_W - w) / 2, (SLIDE_H - h) / 2, w, h);
            obj.src = reader.result;
            curSlide().objects.push(obj);
            state.selection = [obj.id];
            setTool("select");
            render(); renderProperties();
        };
        img.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
};

// ============ Ribbon dropdowns (Shapes / Symbols) ============
function closeAllDropdowns() {
    document.querySelectorAll(".ribbon-dropdown-menu.open").forEach(m => m.classList.remove("open"));
}
document.querySelectorAll(".ribbon-dropdown-toggle").forEach(btn => {
    btn.onclick = (e) => {
        e.stopPropagation();
        const menu = btn.nextElementSibling;
        const wasOpen = menu.classList.contains("open");
        closeAllDropdowns();
        if (!wasOpen) {
            const rect = btn.getBoundingClientRect();
            menu.style.left = rect.left + "px";
            menu.style.top = rect.bottom + "px";
            menu.classList.add("open");
        }
    };
});
document.addEventListener("click", (e) => {
    if (e.composedPath().some(node => node.classList && node.classList.contains("ribbon-dropdown-menu"))) return;
    closeAllDropdowns();
});

// ============ Insert tab: New Slide ============
document.getElementById("newSlideBtn").onclick = () => document.getElementById("addSlideBtn").click();

// ============ Insert tab: Table ============
// returns a [cellRect, cellLabel] pair for a table cell of the given size
function makeTableCell(x, y, w, h, strokeWidth = 1) {
    const cell = makeObject("rect", x, y, w, h);
    cell.fill = { type: "solid", color: "#ffffff" };
    cell.stroke = { color: "#000000", width: strokeWidth, dash: "solid" };
    cell.colSpan = 1;
    cell.rowSpan = 1;
    cell.covered = false;
    const label = makeObject("text", x, y, w, h);
    label.text = "";
    label.fontSize = 14;
    label.align = "center";
    label.valign = "middle";
    label.fill = { type: "solid", color: "none" };
    label.stroke = { color: "none", width: 0, dash: "solid" };
    label.covered = false;
    return [cell, label];
}

function createTable(rows, cols) {
    pushHistory(true);
    const tableW = 480, tableH = 240;
    // cascade each new table's position so it doesn't land exactly on top of a previous one
    const existingTables = curSlide().objects.filter(o => o.type === "group" && o.tableCols).length;
    const cascade = (existingTables % 6) * 24;
    const x0 = (SLIDE_W - tableW) / 2 + cascade, y0 = (SLIDE_H - tableH) / 2 + cascade;
    const cellW = tableW / cols, cellH = tableH / rows;
    const children = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            children.push(...makeTableCell(x0 + c * cellW, y0 + r * cellH, cellW, cellH));
        }
    }
    // thicker outer border drawn on top of the cell grid
    const outline = makeObject("rect", x0, y0, tableW, tableH);
    outline.fill = { type: "solid", color: "none" };
    outline.stroke = { color: "#000000", width: 3, dash: "solid" };
    children.push(outline);
    const group = {
        id: uid(), type: "group", x: x0, y: y0, w: tableW, h: tableH, rotation: 0, opacity: 100, shadow: false, children,
        tableRows: rows, tableCols: cols,
        colWidths: Array(cols).fill(cellW), rowHeights: Array(rows).fill(cellH),
        headerRow: false, bandedRows: false, styleId: "none", customBorders: {}
    };
    curSlide().objects.push(group);
    state.selection = [group.id];
    state.cellSelections = [];
    setTool("select");
    render(); renderProperties();
}

// inserts a new row below the selected row (or at the bottom if no cell selected)
function insertTableRow(group) {
    const rows = group.tableRows, cols = group.tableCols;
    const strokeWidth = group.children[0].stroke.width || 1;
    let afterRow = rows - 1;
    if (state.cellSelections.length === 1) {
        const pos = cellGridPos(group, state.cellSelections[0]);
        if (pos) afterRow = pos.r;
    }
    const newRowH = group.rowHeights[afterRow] || 60;
    const outline = group.children[group.children.length - 1];
    const cellChildren = group.children.slice(0, group.children.length - 1);
    const insertAt = (afterRow + 1) * cols * 2;
    const newCells = [];
    for (let c = 0; c < cols; c++) newCells.push(...makeTableCell(0, 0, group.colWidths[c], newRowH, strokeWidth));
    cellChildren.splice(insertAt, 0, ...newCells);
    cellChildren.push(outline);
    group.children = cellChildren;
    group.tableRows = rows + 1;
    group.rowHeights.splice(afterRow + 1, 0, newRowH);
    group.h += newRowH;
    layoutTable(group);
}

// inserts a new column after the selected column (or at the right if no cell selected)
function insertTableColumn(group) {
    const rows = group.tableRows, cols = group.tableCols;
    const strokeWidth = group.children[0].stroke.width || 1;
    let afterCol = cols - 1;
    if (state.cellSelections.length === 1) {
        const pos = cellGridPos(group, state.cellSelections[0]);
        if (pos) afterCol = pos.c;
    }
    const newColW = group.colWidths[afterCol] || 100;
    const outline = group.children[group.children.length - 1];
    const newChildren = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const idx = (r * cols + c) * 2;
            newChildren.push(group.children[idx], group.children[idx + 1]);
            if (c === afterCol) newChildren.push(...makeTableCell(0, 0, newColW, group.rowHeights[r], strokeWidth));
        }
    }
    newChildren.push(outline);
    group.children = newChildren;
    group.tableCols = cols + 1;
    group.colWidths.splice(afterCol + 1, 0, newColW);
    group.w += newColW;
    layoutTable(group);
}

// returns the row/column index to delete: the row/column of the single
// selected cell if any, otherwise the last row/column.
function tableDeleteTargetRow(group) {
    if (state.cellSelections.length === 1) {
        const pos = cellGridPos(group, state.cellSelections[0]);
        if (pos) return pos.r;
    }
    return group.tableRows - 1;
}
function tableDeleteTargetCol(group) {
    if (state.cellSelections.length === 1) {
        const pos = cellGridPos(group, state.cellSelections[0]);
        if (pos) return pos.c;
    }
    return group.tableCols - 1;
}

// removes row r0 from a table group. Refuses (returns false) if it's the
// last remaining row, or if a merged cell spans across r0.
function deleteTableRow(group, r0) {
    const rows = group.tableRows, cols = group.tableCols;
    if (rows <= 1 || r0 < 0 || r0 >= rows) return false;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const rowSpan = group.children[(r * cols + c) * 2].rowSpan || 1;
            if (rowSpan > 1 && r0 >= r && r0 <= r + rowSpan - 1) return false;
        }
    }
    group.children.splice(r0 * cols * 2, cols * 2);
    group.h -= group.rowHeights[r0];
    group.rowHeights.splice(r0, 1);
    group.tableRows = rows - 1;
    state.cellSelections = [];
    layoutTable(group);
    return true;
}

// removes column c0 from a table group. Refuses (returns false) if it's the
// last remaining column, or if a merged cell spans across c0.
function deleteTableColumn(group, c0) {
    const rows = group.tableRows, cols = group.tableCols;
    if (cols <= 1 || c0 < 0 || c0 >= cols) return false;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const colSpan = group.children[(r * cols + c) * 2].colSpan || 1;
            if (colSpan > 1 && c0 >= c && c0 <= c + colSpan - 1) return false;
        }
    }
    const outline = group.children[group.children.length - 1];
    const newChildren = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (c === c0) continue;
            const idx = (r * cols + c) * 2;
            newChildren.push(group.children[idx], group.children[idx + 1]);
        }
    }
    newChildren.push(outline);
    group.children = newChildren;
    group.w -= group.colWidths[c0];
    group.colWidths.splice(c0, 1);
    group.tableCols = cols - 1;
    state.cellSelections = [];
    layoutTable(group);
    return true;
}

// ---- Table grid picker dropdown ----
const TABLE_GRID_MAX = 12;
const tableGridPicker = document.getElementById("tableGridPicker");
const tableGridLabel = document.getElementById("tableGridLabel");
for (let r = 1; r <= TABLE_GRID_MAX; r++) {
    for (let c = 1; c <= TABLE_GRID_MAX; c++) {
        const cell = document.createElement("div");
        cell.className = "table-grid-cell";
        cell.dataset.row = r;
        cell.dataset.col = c;
        cell.onmouseenter = () => {
            tableGridPicker.querySelectorAll(".table-grid-cell").forEach(other => {
                other.classList.toggle("active", +other.dataset.row <= r && +other.dataset.col <= c);
            });
            tableGridLabel.textContent = `${c} x ${r} Table`;
        };
        cell.onclick = (e) => {
            e.stopPropagation();
            createTable(r, c);
            document.getElementById("tableDropdownMenu").classList.remove("open");
        };
        tableGridPicker.appendChild(cell);
    }
}

document.getElementById("insertRowBtn").onclick = (e) => {
    e.stopPropagation();
    const obj = getObj(state.selection[0]);
    if (!obj || obj.type !== "group" || !obj.tableCols) return;
    pushHistory(true);
    insertTableRow(obj);
    render(); renderProperties();
    document.getElementById("tableDropdownMenu").classList.remove("open");
};

document.getElementById("insertColBtn").onclick = (e) => {
    e.stopPropagation();
    const obj = getObj(state.selection[0]);
    if (!obj || obj.type !== "group" || !obj.tableCols) return;
    pushHistory(true);
    insertTableColumn(obj);
    render(); renderProperties();
    document.getElementById("tableDropdownMenu").classList.remove("open");
};

document.getElementById("deleteRowBtn").onclick = (e) => {
    e.stopPropagation();
    const obj = getObj(state.selection[0]);
    if (!obj || obj.type !== "group" || !obj.tableCols) return;
    pushHistory(true);
    if (!deleteTableRow(obj, tableDeleteTargetRow(obj))) {
        alert("Can't delete this row: unmerge any cells spanning it first, or it's the only row left.");
    }
    render(); renderProperties();
    document.getElementById("tableDropdownMenu").classList.remove("open");
};

document.getElementById("deleteColBtn").onclick = (e) => {
    e.stopPropagation();
    const obj = getObj(state.selection[0]);
    if (!obj || obj.type !== "group" || !obj.tableCols) return;
    pushHistory(true);
    if (!deleteTableColumn(obj, tableDeleteTargetCol(obj))) {
        alert("Can't delete this column: unmerge any cells spanning it first, or it's the only column left.");
    }
    render(); renderProperties();
    document.getElementById("tableDropdownMenu").classList.remove("open");
};

// ============ Insert tab: Screenshot ============
document.getElementById("screenshotBtn").onclick = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        alert("Screen capture is not supported in this browser.");
        return;
    }
    let stream;
    try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const video = document.createElement("video");
        video.srcObject = stream;
        await video.play();
        await new Promise(r => setTimeout(r, 150));
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);
        const dataURL = canvas.toDataURL("image/png");
        let w = canvas.width, h = canvas.height;
        const maxDim = 400;
        if (w > maxDim || h > maxDim) {
            const scale = maxDim / Math.max(w, h);
            w *= scale; h *= scale;
        }
        pushHistory(true);
        const obj = makeObject("image", (SLIDE_W - w) / 2, (SLIDE_H - h) / 2, w, h);
        obj.src = dataURL;
        curSlide().objects.push(obj);
        state.selection = [obj.id];
        setTool("select");
        render(); renderProperties();
    } catch (err) {
        alert("Screenshot capture failed or was cancelled.");
    } finally {
        if (stream) stream.getTracks().forEach(t => t.stop());
    }
};

// ============ Insert tab: SmartArt ============
// each layout function returns { x, y, w, h, children } for a group of
// shapes/text laid out around the slide center
function smartArtLabelBox(type, x, y, w, h, text, fillColor, fontSize = 16) {
    const box = makeObject(type, x, y, w, h);
    box.fill = { type: "solid", color: fillColor };
    box.stroke = { color: "#1a3a70", width: 2, dash: "solid" };
    box.text = text;
    box.fontColor = "#ffffff";
    box.fontSize = fontSize;
    box.bold = true;
    box.align = "center";
    return box;
}

// a line/arrow object running from (x1,y1) to (x2,y2)
function smartArtConnector(type, x1, y1, x2, y2, color = "#888888", width = 2) {
    const conn = makeObject(type, x1, y2, x2 - x1, y1 - y2);
    conn.stroke = { color, width, dash: "solid" };
    return conn;
}

function smartArtProcess() {
    const boxW = 140, boxH = 70, gap = 50;
    const totalW = boxW * 3 + gap * 2;
    const x0 = (SLIDE_W - totalW) / 2, y0 = (SLIDE_H - boxH) / 2;
    const children = [];
    ["Step 1", "Step 2", "Step 3"].forEach((text, i) => {
        const bx = x0 + i * (boxW + gap);
        children.push(smartArtLabelBox("roundrect", bx, y0, boxW, boxH, text, "#2454a0", 18));
        if (i < 2) children.push(makeObject("arrow", bx + boxW, y0 + boxH / 2, gap, 0));
    });
    return { x: x0, y: y0, w: totalW, h: boxH, children };
}

function smartArtCycle() {
    const boxW = 130, boxH = 60, radius = 140;
    const cx = SLIDE_W / 2, cy = SLIDE_H / 2;
    const labels = ["Plan", "Do", "Check", "Act"];
    const children = [];
    const positions = labels.map((_, i) => {
        const ang = -Math.PI / 2 + i * (Math.PI / 2);
        return [cx + radius * Math.cos(ang), cy + radius * Math.sin(ang)];
    });
    positions.forEach(([px, py], i) => {
        children.push(smartArtLabelBox("ellipse", px - boxW / 2, py - boxH / 2, boxW, boxH, labels[i], CHART_PALETTE[i % CHART_PALETTE.length]));
    });
    for (let i = 0; i < positions.length; i++) {
        const [x1, y1] = positions[i];
        const [x2, y2] = positions[(i + 1) % positions.length];
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const margin = boxW / 2 + 6;
        children.push(smartArtConnector("arrow", x1 + ux * margin, y1 + uy * margin, x2 - ux * margin, y2 - uy * margin));
    }
    return { x: cx - radius - boxW / 2, y: cy - radius - boxH / 2, w: (radius + boxW / 2) * 2, h: (radius + boxH / 2) * 2, children };
}

function smartArtPyramid() {
    const levels = ["Vision", "Strategy", "Tactics", "Tasks"];
    const baseW = 360, levelH = 55, gap = 6;
    const totalH = levels.length * levelH + (levels.length - 1) * gap;
    const x0 = (SLIDE_W - baseW) / 2, y0 = (SLIDE_H - totalH) / 2;
    const children = [];
    levels.forEach((text, i) => {
        const w = baseW * ((i + 1) / levels.length);
        const x = x0 + (baseW - w) / 2;
        const y = y0 + i * (levelH + gap);
        children.push(smartArtLabelBox("roundrect", x, y, w, levelH, text, CHART_PALETTE[i % CHART_PALETTE.length]));
    });
    return { x: x0, y: y0, w: baseW, h: totalH, children };
}

function smartArtList() {
    const items = ["Point 1", "Point 2", "Point 3", "Point 4"];
    const boxW = 360, boxH = 50, gap = 12;
    const totalH = items.length * boxH + (items.length - 1) * gap;
    const x0 = (SLIDE_W - boxW) / 2, y0 = (SLIDE_H - totalH) / 2;
    const children = items.map((text, i) => {
        const box = smartArtLabelBox("roundrect", x0, y0 + i * (boxH + gap), boxW, boxH, text, CHART_PALETTE[i % CHART_PALETTE.length]);
        box.align = "left";
        return box;
    });
    return { x: x0, y: y0, w: boxW, h: totalH, children };
}

function smartArtHierarchy() {
    const topW = 160, boxH = 60, childW = 140, gap = 30, vGap = 60;
    const totalW = childW * 3 + gap * 2;
    const topX = (SLIDE_W - topW) / 2;
    const childX0 = (SLIDE_W - totalW) / 2;
    const y0 = (SLIDE_H - (boxH * 2 + vGap)) / 2;
    const childY = y0 + boxH + vGap;

    const children = [smartArtLabelBox("rect", topX, y0, topW, boxH, "Manager", "#2454a0")];
    ["Team A", "Team B", "Team C"].forEach((text, i) => {
        const cx = childX0 + i * (childW + gap);
        children.push(smartArtLabelBox("rect", cx, childY, childW, boxH, text, "#5b8bcf", 14));
        children.push(smartArtConnector("line", topX + topW / 2, y0 + boxH, cx + childW / 2, childY));
    });

    const minX = Math.min(topX, childX0);
    const maxX = Math.max(topX + topW, childX0 + totalW);
    return { x: minX, y: y0, w: maxX - minX, h: childY + boxH - y0, children };
}

const SMARTART_LAYOUTS = {
    process: smartArtProcess,
    cycle: smartArtCycle,
    pyramid: smartArtPyramid,
    list: smartArtList,
    hierarchy: smartArtHierarchy,
};

document.querySelectorAll("#smartArtDropdownMenu button").forEach(btn => {
    btn.onclick = (e) => {
        e.stopPropagation();
        const layoutFn = SMARTART_LAYOUTS[btn.dataset.smartart];
        if (!layoutFn) return;
        pushHistory(true);
        const { x, y, w, h, children } = layoutFn();
        const group = { id: uid(), type: "group", x, y, w, h, rotation: 0, opacity: 100, shadow: false, children };
        curSlide().objects.push(group);
        state.selection = [group.id];
        setTool("select");
        render(); renderProperties();
        document.getElementById("smartArtDropdownMenu").classList.remove("open");
    };
});

// ============ Insert tab: Chart ============
document.getElementById("chartBtn").onclick = () => {
    pushHistory(true);
    const obj = makeObject("chart", (SLIDE_W - 320) / 2, (SLIDE_H - 220) / 2, 320, 220);
    curSlide().objects.push(obj);
    state.selection = [obj.id];
    setTool("select");
    render(); renderProperties();
};

// ============ Insert tab: Zoom ============
document.getElementById("zoomFeatureBtn").onclick = () => {
    if (state.slides.length < 2) {
        alert("Add another slide first to create a Zoom link.");
        return;
    }
    pushHistory(true);
    const obj = makeObject("zoom", (SLIDE_W - 280) / 2, (SLIDE_H - 160) / 2, 280, 160);
    obj.targetSlide = state.current === 0 ? 1 : 0;
    curSlide().objects.push(obj);
    state.selection = [obj.id];
    setTool("select");
    render(); renderProperties();
};

// ============ Insert tab: Link ============
document.getElementById("linkBtn").onclick = () => {
    if (!state.selection.length) {
        alert("Select an object first, then add a link to it.");
        return;
    }
    const objs = state.selection.map(getObj).filter(Boolean);
    const url = prompt("Enter a URL:", objs[0].href || "https://");
    if (url === null) return;
    pushHistory(true);
    objs.forEach(o => o.href = url || null);
    render(); renderProperties();
};

// ============ Insert tab: Header & Footer ============
document.getElementById("headerFooterBtn").onclick = () => {
    const header = prompt("Header text (leave empty to remove):", state.headerText || "");
    if (header === null) return;
    const footer = prompt("Footer text (leave empty to remove):", state.footerText || "");
    if (footer === null) return;
    pushHistory(true);
    state.headerText = header;
    state.footerText = footer;
    render();
};

// ============ Insert tab: WordArt ============
document.getElementById("wordArtBtn").onclick = () => {
    pushHistory(true);
    const obj = makeObject("text", (SLIDE_W - 300) / 2, (SLIDE_H - 80) / 2, 300, 80);
    obj.text = "WordArt";
    obj.fontFamily = "Anton";
    obj.fontSize = 48;
    obj.bold = true;
    obj.align = "center";
    obj.fontColor = "#2454a0";
    curSlide().objects.push(obj);
    state.selection = [obj.id];
    setTool("select");
    render(); renderProperties();
};

// ============ Insert tab: Date & Time ============
document.getElementById("dateTimeBtn").onclick = () => {
    pushHistory(true);
    const obj = makeObject("text", 20, SLIDE_H - 40, 160, 28);
    obj.fontSize = 14;
    obj.field = "datetime";
    obj.text = fieldText(obj);
    curSlide().objects.push(obj);
    state.selection = [obj.id];
    setTool("select");
    render(); renderProperties();
};

// ============ Insert tab: Slide Number ============
document.getElementById("slideNumberBtn").onclick = () => {
    pushHistory(true);
    const obj = makeObject("text", SLIDE_W - 90, SLIDE_H - 40, 70, 28);
    obj.fontSize = 14;
    obj.align = "right";
    obj.field = "slidenumber";
    obj.text = fieldText(obj, state.current);
    curSlide().objects.push(obj);
    state.selection = [obj.id];
    setTool("select");
    render(); renderProperties();
};

// ============ Insert tab: Object ============
document.getElementById("objectBtn").onclick = () => document.getElementById("objectInput").click();
document.getElementById("objectInput").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    pushHistory(true);
    const obj = makeObject("object", (SLIDE_W - 160) / 2, (SLIDE_H - 100) / 2, 160, 100);
    obj.fileName = file.name;
    curSlide().objects.push(obj);
    state.selection = [obj.id];
    setTool("select");
    render(); renderProperties();
    e.target.value = "";
};

// ============ Insert tab: Equation ============
// Converts a Grapher-style math expression (e.g. "x^2 + 1/(x+1)") into LaTeX
// using math.js, the same library Function Grapher uses for its live
// previews and derivative displays. Falls back to the raw text if it's
// already LaTeX (math.js can't parse commands like "\frac").
function equationToTex(expr, rawTex = false) {
    if (!expr) return "";
    if (rawTex) return expr;
    try {
        return math.parse(expr).toTex();
    } catch {
        return expr;
    }
}

// Renders an equation's source as real math notation via KaTeX. When
// `rawTex` is true, `text` is already LaTeX (e.g. a derivative label
// produced by the Plot tool) and is rendered as-is, skipping math.js parsing.
function renderEquation(div, text, rawTex = false) {
    div.innerHTML = "";
    const tex = equationToTex(text, rawTex);
    try {
        katex.render(tex, div, { throwOnError: false, displayMode: false });
    } catch {
        div.textContent = text;
    }
}

document.getElementById("equationBtn").onclick = () => {
    pushHistory(true);
    const obj = makeObject("text", (SLIDE_W - 220) / 2, (SLIDE_H - 50) / 2, 220, 50);
    obj.text = "x^2 + 1";
    obj.fontFamily = "Roboto Mono";
    obj.fontSize = 22;
    obj.align = "center";
    obj.isEquation = true;
    curSlide().objects.push(obj);
    state.selection = [obj.id];
    setTool("select");
    render(); renderProperties();
    const div = svg.querySelector(`.text-edit-box[data-id="${obj.id}"]`);
    if (div) enterTextEditMode(div, obj);
};

// ============ Insert tab: Code ============
const LANGUAGE_BADGES = {
    javascript: { abbr: "JS",   color: "#f7df1e", text: "#222222" },
    typescript: { abbr: "TS",   color: "#3178c6", text: "#ffffff" },
    python:     { abbr: "Py",   color: "#3776ab", text: "#ffffff" },
    java:       { abbr: "Java", color: "#ea2d2e", text: "#ffffff" },
    "c++":      { abbr: "C++",  color: "#00599c", text: "#ffffff" },
    c:          { abbr: "C",    color: "#a8b9cc", text: "#222222" },
    "c#":       { abbr: "C#",   color: "#68217a", text: "#ffffff" },
    haskell:    { abbr: "Hs",   color: "#5e5086", text: "#ffffff" },
    scala:      { abbr: "Sc",   color: "#dc322f", text: "#ffffff" },
    html:       { abbr: "</>",  color: "#e34c26", text: "#ffffff" },
    css:        { abbr: "CSS",  color: "#264de4", text: "#ffffff" },
    bash:       { abbr: "$_",   color: "#4eaa25", text: "#ffffff" },
    shell:      { abbr: "$_",   color: "#4eaa25", text: "#ffffff" },
    sql:        { abbr: "SQL",  color: "#e38c00", text: "#ffffff" },
    go:         { abbr: "Go",   color: "#00add8", text: "#ffffff" },
    rust:       { abbr: "Rs",   color: "#dea584", text: "#222222" },
    php:        { abbr: "PHP",  color: "#777bb4", text: "#ffffff" },
    ruby:       { abbr: "Rb",   color: "#cc342d", text: "#ffffff" },
    swift:      { abbr: "Sw",   color: "#fa7343", text: "#ffffff" },
    kotlin:     { abbr: "Kt",   color: "#7f52ff", text: "#ffffff" },
    r:          { abbr: "R",    color: "#276dc3", text: "#ffffff" },
    lua:        { abbr: "Lua",  color: "#000080", text: "#ffffff" },
    perl:       { abbr: "Pl",   color: "#39457e", text: "#ffffff" },
    dart:       { abbr: "Dt",   color: "#0175c2", text: "#ffffff" },
    julia:      { abbr: "Jl",   color: "#9558b2", text: "#ffffff" },
    matlab:     { abbr: "M",    color: "#e16737", text: "#ffffff" },
    assembly:   { abbr: "Asm",  color: "#6e4c13", text: "#ffffff" },
    yaml:       { abbr: "YML",  color: "#cb171e", text: "#ffffff" },
    json:       { abbr: "{}",   color: "#888888", text: "#ffffff" },
    xml:        { abbr: "XML",  color: "#f16529", text: "#ffffff" },
    markdown:   { abbr: "MD",   color: "#083fa1", text: "#ffffff" },
    latex:      { abbr: "TeX",  color: "#008080", text: "#ffffff" },
    toml:       { abbr: "TOML", color: "#9c4121", text: "#ffffff" },
};

// Priority languages shown first in the language picker
const LANGUAGES_PRIORITY = [
    { value: "python",     label: "Python" },
    { value: "c",          label: "C" },
    { value: "haskell",    label: "Haskell" },
    { value: "java",       label: "Java" },
    { value: "html",       label: "HTML" },
    { value: "css",        label: "CSS" },
    { value: "javascript", label: "JavaScript" },
    { value: "scala",      label: "Scala" },
];
const LANGUAGES_OTHER = [
    { value: "typescript", label: "TypeScript" },
    { value: "c++",        label: "C++" },
    { value: "c#",         label: "C#" },
    { value: "go",         label: "Go" },
    { value: "rust",       label: "Rust" },
    { value: "ruby",       label: "Ruby" },
    { value: "php",        label: "PHP" },
    { value: "swift",      label: "Swift" },
    { value: "kotlin",     label: "Kotlin" },
    { value: "r",          label: "R" },
    { value: "sql",        label: "SQL" },
    { value: "bash",       label: "Bash / Shell" },
    { value: "lua",        label: "Lua" },
    { value: "perl",       label: "Perl" },
    { value: "dart",       label: "Dart" },
    { value: "julia",      label: "Julia" },
    { value: "matlab",     label: "MATLAB" },
    { value: "assembly",   label: "Assembly" },
    { value: "yaml",       label: "YAML" },
    { value: "json",       label: "JSON" },
    { value: "xml",        label: "XML" },
    { value: "markdown",   label: "Markdown" },
    { value: "latex",      label: "LaTeX" },
    { value: "toml",       label: "TOML" },
];
const ALL_LANGUAGES = [...LANGUAGES_PRIORITY, ...LANGUAGES_OTHER];

let selectedCodeLang = "javascript";
function getCodeBadge(lang) {
    const key = (lang || "").trim().toLowerCase();
    return LANGUAGE_BADGES[key] || { abbr: (key.slice(0, 2) || "{}").toUpperCase(), color: "#666666", text: "#ffffff" };
}

// ============ Code tool: simple syntax highlighting ============
// Per-token visual style: color + optional CSS extras (fontStyle, fontWeight)
const CODE_TOKEN_STYLES = {
    comment:  { color: "#7a8ea0", fontStyle: "italic" },
    string:   { color: "#c04c0c" },
    number:   { color: "#1b6ac9" },
    keyword:  { color: "#8a2be2", fontWeight: "600" },
    function: { color: "#138a50" },
    type:     { color: "#c47900", fontWeight: "600" },
};
const CODE_KEYWORDS = new Set([
    "abstract", "and", "as", "assert", "async", "await", "auto", "break", "case", "catch",
    "chan", "char", "class", "const", "continue", "def", "default", "defer", "del", "delete",
    "do", "elif", "else", "elseif", "enum", "except", "export", "extends", "false", "final",
    "finally", "float", "fn", "for", "foreach", "from", "func", "global", "go", "goto",
    "if", "impl", "implements", "import", "in", "instanceof", "int", "interface", "is",
    "lambda", "let", "loop", "match", "mod", "module", "mut", "namespace", "new", "none",
    "not", "null", "nil", "of", "or", "override", "pass", "private", "protected", "pub",
    "public", "raise", "return", "self", "sizeof", "static", "struct", "super", "switch",
    "this", "throw", "throws", "trait", "true", "try", "type", "typedef", "typeof",
    "undefined", "union", "unsafe", "unsigned", "use", "using", "var", "virtual", "void",
    "volatile", "while", "with", "yield",
    "string", "String", "bool", "Boolean", "number", "Number", "double", "long", "short", "byte",
]);

function getCodeCommentStyle(lang) {
    const lc = (lang || "").trim().toLowerCase();
    if (["python", "py", "bash", "shell", "sh", "ruby", "rb", "yaml", "perl", "r", "makefile", "toml"].includes(lc)) return "#";
    if (["latex", "tex"].includes(lc)) return "%";
    if (lc === "sql") return "--";
    return "//";
}

function supportsBlockComments(lang) {
    const lc = (lang || "").trim().toLowerCase();
    return !["python", "py", "bash", "shell", "sh", "ruby", "rb", "yaml", "sql", "latex", "tex", "perl", "r", "toml", "makefile"].includes(lc);
}

const CODE_TOKEN_RE = /^("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|^(\d+(?:\.\d+)?)|^([A-Za-z_$][A-Za-z0-9_$]*)/;

// Tokenizes a single line of code for syntax highlighting. `state` is a small
// mutable object ({ inBlockComment: bool }) carried across lines so /* */
// comments can span multiple lines.
function highlightCodeLine(line, lang, state) {
    const tokens = [];
    const commentMark = getCodeCommentStyle(lang);
    const blockComments = supportsBlockComments(lang);
    const push = (text, type) => {
        if (!text) return;
        if (tokens.length && tokens[tokens.length - 1].type === type) tokens[tokens.length - 1].text += text;
        else tokens.push({ text, type });
    };
    let i = 0;
    while (i < line.length) {
        if (state.inBlockComment) {
            const endIdx = line.indexOf("*/", i);
            if (endIdx === -1) { push(line.slice(i), "comment"); i = line.length; }
            else { push(line.slice(i, endIdx + 2), "comment"); i = endIdx + 2; state.inBlockComment = false; }
            continue;
        }
        const rest = line.slice(i);
        if (commentMark && rest.startsWith(commentMark)) { push(rest, "comment"); i = line.length; continue; }
        if (blockComments && rest.startsWith("/*")) {
            const endIdx = line.indexOf("*/", i + 2);
            if (endIdx === -1) { push(line.slice(i), "comment"); state.inBlockComment = true; i = line.length; }
            else { push(line.slice(i, endIdx + 2), "comment"); i = endIdx + 2; }
            continue;
        }
        const m = rest.match(CODE_TOKEN_RE);
        if (m) {
            if (m[1]) { push(m[1], "string"); i += m[1].length; continue; }
            if (m[2]) { push(m[2], "number"); i += m[2].length; continue; }
            if (m[3]) {
                const word = m[3];
                const after = rest.slice(word.length);
                let type = null;
                if (CODE_KEYWORDS.has(word)) type = "keyword";
                else if (/^\s*\(/.test(after)) type = "function";
                push(word, type);
                i += word.length;
                continue;
            }
        }
        push(line[i], null);
        i += 1;
    }
    return tokens;
}

function escapeHtml(str) {
    return (str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// Renders one line of code as highlighted HTML (a sequence of colored spans).
function codeLineToHtml(line, lang, state) {
    return highlightCodeLine(line, lang, state).map(t => {
        const escaped = escapeHtml(t.text);
        const style = CODE_TOKEN_STYLES[t.type];
        if (!style) return escaped;
        const css = [
            `color:${style.color}`,
            style.fontStyle ? `font-style:${style.fontStyle}` : "",
            style.fontWeight ? `font-weight:${style.fontWeight}` : "",
        ].filter(Boolean).join(";");
        return `<span style="${css}">${escaped}</span>`;
    }).join("");
}

// Reads a plain-text code block's contenteditable div back into an array of
// lines. Each top-level <div>/<p> child (or a <br>) represents one line
// break - this matches the structure produced by setCodeLinesHtml below, and
// also the structure the browser produces natively when Enter/Backspace are
// pressed inside such a div (splitting/merging top-level <div>s).
function getCodeLines(div) {
    const lines = [];
    let current = "";
    let sawBreak = false;
    for (const child of Array.from(div.childNodes)) {
        if (child.nodeType === Node.ELEMENT_NODE && (child.tagName === "DIV" || child.tagName === "P")) {
            lines.push(current + child.textContent);
            current = "";
            sawBreak = true;
        } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName === "BR") {
            lines.push(current);
            current = "";
            sawBreak = true;
        } else {
            current += child.textContent || "";
        }
    }
    // only count a trailing run of non-block content as its own line; if
    // every child was already a line-break element, don't add a phantom
    // extra blank line at the end
    if (!sawBreak || current !== "") lines.push(current);
    return lines;
}

// Replaces div's content with one syntax-highlighted <div> per line (empty
// lines get a <br> so they remain visible/focusable).
function setCodeLinesHtml(div, lines, lang) {
    const commentState = { inBlockComment: false };
    div.innerHTML = lines.map(line => `<div>${codeLineToHtml(line, lang, commentState) || "<br>"}</div>`).join("");
}

// Returns the caret's position as { line, offset } matching getCodeLines'
// line numbering and per-line character offsets. Returns null if the
// selection isn't inside div.
function getCodeCaretPos(div) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    const { startContainer, startOffset } = sel.getRangeAt(0);
    if (startContainer !== div && !div.contains(startContainer)) return null;

    function textLenBefore(node, container, offset) {
        if (node === container) {
            if (node.nodeType === Node.TEXT_NODE) return offset;
            let acc = 0;
            const kids = Array.from(node.childNodes);
            for (let i = 0; i < offset && i < kids.length; i++) acc += (kids[i].textContent || "").length;
            return acc;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return null;
        let acc = 0;
        for (const c of Array.from(node.childNodes)) {
            if (c === container || (c.nodeType === Node.ELEMENT_NODE && c.contains(container))) {
                const sub = textLenBefore(c, container, offset);
                return sub === null ? null : acc + sub;
            }
            acc += (c.textContent || "").length;
        }
        return null;
    }

    if (startContainer === div) {
        const kids = Array.from(div.childNodes);
        let line = 0, cur = 0;
        for (let i = 0; i < startOffset && i < kids.length; i++) {
            const c = kids[i];
            const isLineBreak = c.nodeType === Node.ELEMENT_NODE && (c.tagName === "DIV" || c.tagName === "P" || c.tagName === "BR");
            if (isLineBreak) { line++; cur = 0; } else { cur += (c.textContent || "").length; }
        }
        return { line, offset: cur };
    }

    let lineIdx = 0, current = 0;
    for (const child of Array.from(div.childNodes)) {
        const isLineBreak = child.nodeType === Node.ELEMENT_NODE && (child.tagName === "DIV" || child.tagName === "P" || child.tagName === "BR");
        if (child === startContainer || (child.nodeType === Node.ELEMENT_NODE && child.contains(startContainer))) {
            const within = textLenBefore(child, startContainer, startOffset);
            return { line: lineIdx, offset: current + (within || 0) };
        }
        if (isLineBreak) { lineIdx++; current = 0; }
        else { current += (child.textContent || "").length; }
    }
    return { line: lineIdx, offset: current };
}

// Places the caret at the given { line, offset } (counterpart to
// getCodeCaretPos), assuming div's children are one <div>/<p> per line
// (as produced by setCodeLinesHtml).
function setCodeCaretPos(div, pos) {
    const kids = Array.from(div.childNodes);
    if (kids.length === 0) return;
    const lineEl = kids[Math.max(0, Math.min(pos.line, kids.length - 1))];
    let remaining = pos.offset;
    let target = null, targetOffset = 0;
    (function visit(node) {
        if (target) return;
        if (node.nodeType === Node.TEXT_NODE) {
            const len = node.textContent.length;
            if (remaining <= len) { target = node; targetOffset = remaining; return; }
            remaining -= len;
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        for (const child of Array.from(node.childNodes)) {
            visit(child);
            if (target) return;
        }
    })(lineEl);
    const sel = window.getSelection();
    const range = document.createRange();
    if (target) range.setStart(target, targetOffset);
    else { range.selectNodeContents(lineEl); range.collapse(false); sel.removeAllRanges(); sel.addRange(range); return; }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
}

// Inserts a literal text node at the current caret position, replacing any
// selection. Used for Tab so it doesn't move focus away from the editor.
function insertTextAtCaret(text) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
}

// ============ Code language dropdown ============
// Clicking the Code button opens a language picker; selecting a language
// sets selectedCodeLang and inserts a code block in that language.
(function initCodeLangDropdown() {
    const btn = document.getElementById("codeBtn");
    const menu = document.getElementById("codeLangMenu");
    if (!btn || !menu) return;

    function insertCodeBlock(lang) {
        menu.style.display = "none";
        selectedCodeLang = lang;
        // Update active state in menu
        menu.querySelectorAll(".code-lang-opt").forEach(x => x.classList.toggle("active", x.dataset.lang === lang));
        // Insert the code block
        pushHistory(true);
        const obj = makeObject("text", (SLIDE_W - 360) / 2, (SLIDE_H - 180) / 2, 360, 180);
        obj.text = "";
        obj.fontFamily = "Roboto Mono";
        obj.fontSize = 14;
        obj.fontColor = "#1e1e1e";
        obj.fill = { type: "solid", color: "#f3f3f3" };
        obj.stroke = { color: "#d4d4d4", width: 1, dash: "solid" };
        obj.align = "left";
        obj.isCode = true;
        obj.codeLang = lang;
        curSlide().objects.push(obj);
        state.selection = [obj.id];
        setTool("select");
        render(); renderProperties();
        const div = svg.querySelector(`.text-edit-box[data-id="${obj.id}"]`);
        if (div) enterTextEditMode(div, obj);
    }

    function buildMenu() {
        menu.innerHTML = "";
        const addSection = (title) => {
            const h = document.createElement("div");
            h.className = "code-lang-section";
            h.textContent = title;
            menu.appendChild(h);
        };
        const addOpt = ({ value, label: langLabel }) => {
            const b = document.createElement("button");
            b.className = "code-lang-opt" + (value === selectedCodeLang ? " active" : "");
            b.dataset.lang = value;
            const badge = LANGUAGE_BADGES[value];
            if (badge) {
                const span = document.createElement("span");
                span.className = "code-lang-badge";
                span.textContent = badge.abbr;
                span.style.background = badge.color;
                span.style.color = badge.text;
                b.appendChild(span);
            }
            const t = document.createElement("span");
            t.textContent = langLabel;
            b.appendChild(t);
            b.onclick = () => insertCodeBlock(value);
            menu.appendChild(b);
        };

        addSection("Priority");
        LANGUAGES_PRIORITY.forEach(l => addOpt(l));
        const divider = document.createElement("hr");
        divider.className = "code-lang-divider";
        menu.appendChild(divider);
        addSection("All Languages");
        LANGUAGES_OTHER.forEach(l => addOpt(l));
    }

    buildMenu();

    btn.onclick = () => {
        const open = menu.style.display !== "none";
        if (open) { menu.style.display = "none"; return; }
        const r = btn.getBoundingClientRect();
        menu.style.left = r.left + "px";
        menu.style.top = (r.bottom + 3) + "px";
        menu.style.display = "block";
    };
    document.addEventListener("click", e => {
        if (!btn.contains(e.target) && !menu.contains(e.target)) menu.style.display = "none";
    });
})();

// ============ Insert tab: Plot ============
// Lets the user plot a 2D y=f(x) curve or a 3D z=f(x,y) surface (via
// Plotly + math.js, mirroring Grapher's plot2D()/plot3D() and
// derivativeTex() helpers), then inserts the rendered chart as a static
// image object plus an optional KaTeX-rendered derivative label.
function plotLinspace(min, max, n) {
    const arr = new Array(n);
    const step = (max - min) / (n - 1);
    for (let i = 0; i < n; i++) arr[i] = min + step * i;
    return arr;
}

const plotModal = document.getElementById("plotModal");
const plotRenderTarget = document.getElementById("plotRenderTarget");

function showPlotModal() {
    plotModal.classList.add("active");
    updatePlot2dPreview();
    updatePlotParamPreview();
    updatePlot3dPreview();
}
function hidePlotModal() {
    plotModal.classList.remove("active");
}

document.getElementById("plotBtn").onclick = showPlotModal;
document.getElementById("plotCancelBtn").onclick = hidePlotModal;
plotModal.addEventListener("mousedown", (e) => {
    if (e.target === plotModal) hidePlotModal();
});

document.querySelectorAll(".modal-tab[data-plot-tab]").forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll(".modal-tab[data-plot-tab]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById("plotSection2d").style.display = btn.dataset.plotTab === "2d" ? "" : "none";
        document.getElementById("plotSectionParam").style.display = btn.dataset.plotTab === "param" ? "" : "none";
        document.getElementById("plotSection3d").style.display = btn.dataset.plotTab === "3d" ? "" : "none";
    };
});

function safeMathTex(fn) {
    try { return fn(); } catch { return null; }
}

function updatePlot2dPreview() {
    const expr = document.getElementById("plot2dExpr").value;
    const preview = document.getElementById("plot2dPreview");
    const derivPreview = document.getElementById("plot2dDerivativePreview");
    const rhsTex = safeMathTex(() => math.parse(expr).toTex());
    if (rhsTex !== null) renderEquation(preview, `y = ${rhsTex}`, true);
    else preview.innerHTML = "";
    const derivTex = safeMathTex(() => math.derivative(expr, "x").toTex());
    if (derivTex !== null) renderEquation(derivPreview, `\\dfrac{dy}{dx} = ${derivTex}`, true);
    else derivPreview.innerHTML = "";
}

function updatePlot3dPreview() {
    const expr = document.getElementById("plot3dExpr").value;
    const preview = document.getElementById("plot3dPreview");
    const derivPreview = document.getElementById("plot3dDerivativePreview");
    const rhsTex = safeMathTex(() => math.parse(expr).toTex());
    if (rhsTex !== null) renderEquation(preview, `z = ${rhsTex}`, true);
    else preview.innerHTML = "";
    const dxTex = safeMathTex(() => math.derivative(expr, "x").toTex());
    const dyTex = safeMathTex(() => math.derivative(expr, "y").toTex());
    if (dxTex !== null && dyTex !== null) {
        renderEquation(derivPreview, `\\dfrac{\\partial z}{\\partial x} = ${dxTex} \\quad \\dfrac{\\partial z}{\\partial y} = ${dyTex}`, true);
    } else {
        derivPreview.innerHTML = "";
    }
}

["plot2dExpr"].forEach(id => document.getElementById(id).addEventListener("input", updatePlot2dPreview));
["plot3dExpr"].forEach(id => document.getElementById(id).addEventListener("input", updatePlot3dPreview));

function updatePlotParamPreview() {
    const xExpr = document.getElementById("plotParamX").value;
    const yExpr = document.getElementById("plotParamY").value;
    const preview = document.getElementById("plotParamPreview");
    const derivPreview = document.getElementById("plotParamDerivativePreview");
    const xTex = safeMathTex(() => math.parse(xExpr).toTex());
    const yTex = safeMathTex(() => math.parse(yExpr).toTex());
    if (xTex !== null && yTex !== null) {
        renderEquation(preview, `x(t) = ${xTex} \\quad y(t) = ${yTex}`, true);
    } else {
        preview.innerHTML = "";
    }
    const dxTex = safeMathTex(() => math.derivative(xExpr, "t").toTex());
    const dyTex = safeMathTex(() => math.derivative(yExpr, "t").toTex());
    if (dxTex !== null && dyTex !== null) {
        renderEquation(derivPreview, `\\dfrac{dx}{dt} = ${dxTex} \\quad \\dfrac{dy}{dt} = ${dyTex}`, true);
    } else {
        derivPreview.innerHTML = "";
    }
}
["plotParamX", "plotParamY"].forEach(id => document.getElementById(id).addEventListener("input", updatePlotParamPreview));

const PLOT_FONT = { family: "Segoe UI, Tahoma, Verdana, sans-serif", size: 12 };

async function insertPlot2d() {
    const expr = document.getElementById("plot2dExpr").value.trim();
    const errorEl = document.getElementById("plot2dError");
    errorEl.textContent = "";

    let min, max;
    try {
        min = math.evaluate(document.getElementById("plot2dMin").value);
        max = math.evaluate(document.getElementById("plot2dMax").value);
        if (typeof min !== "number" || typeof max !== "number" || !isFinite(min) || !isFinite(max) || min >= max) {
            throw new Error("Invalid range");
        }
    } catch {
        errorEl.textContent = "Invalid x range values.";
        return;
    }

    let node;
    try {
        node = math.compile(expr);
        node.evaluate({ x: min });
    } catch (err) {
        errorEl.textContent = `Invalid expression: ${err.message}`;
        return;
    }

    const xs = plotLinspace(min, max, 400);
    const ys = xs.map(x => {
        try { return node.evaluate({ x }); } catch { return null; }
    });

    await Plotly.newPlot(plotRenderTarget, [{
        x: xs, y: ys, type: "scatter", mode: "lines", name: `y = ${expr}`,
        line: { color: "#2454a0", width: 2 },
    }], {
        margin: { t: 30, r: 20, b: 40, l: 50 },
        font: PLOT_FONT,
        xaxis: { zeroline: true, title: "x" },
        yaxis: { zeroline: true, title: "y" },
    }, { responsive: false });

    const dataURL = await Plotly.toImage(plotRenderTarget, { format: "png", width: 700, height: 500, scale: 2 });

    pushHistory(true);
    const w = 400, h = 286;
    const showDerivative = document.getElementById("plot2dDerivative").checked;
    const derivTex = showDerivative ? safeMathTex(() => `\\dfrac{dy}{dx} = ${math.derivative(expr, "x").toTex()}`) : null;
    const totalH = h + (derivTex ? 46 : 0);

    const obj = makeObject("image", (SLIDE_W - w) / 2, (SLIDE_H - totalH) / 2, w, h);
    obj.src = dataURL;
    curSlide().objects.push(obj);
    const newSelection = [obj.id];

    if (derivTex) {
        const dObj = makeObject("text", obj.x, obj.y + h + 10, w, 36);
        dObj.text = derivTex;
        dObj.isEquation = true;
        dObj.rawTex = true;
        dObj.fontFamily = "Roboto Mono";
        dObj.fontSize = 18;
        dObj.align = "center";
        curSlide().objects.push(dObj);
        newSelection.push(dObj.id);
    }

    state.selection = newSelection;
    setTool("select");
    render(); renderProperties();
    hidePlotModal();
}

async function insertPlot3d() {
    const expr = document.getElementById("plot3dExpr").value.trim();
    const errorEl = document.getElementById("plot3dError");
    errorEl.textContent = "";

    let xMin, xMax, yMin, yMax;
    try {
        xMin = math.evaluate(document.getElementById("plot3dXMin").value);
        xMax = math.evaluate(document.getElementById("plot3dXMax").value);
        yMin = math.evaluate(document.getElementById("plot3dYMin").value);
        yMax = math.evaluate(document.getElementById("plot3dYMax").value);
        [xMin, xMax, yMin, yMax].forEach(v => {
            if (typeof v !== "number" || !isFinite(v)) throw new Error("Invalid range");
        });
        if (xMin >= xMax || yMin >= yMax) throw new Error("Invalid range");
    } catch {
        errorEl.textContent = "Invalid range values.";
        return;
    }

    let node;
    try {
        node = math.compile(expr);
        node.evaluate({ x: xMin, y: yMin });
    } catch (err) {
        errorEl.textContent = `Invalid expression: ${err.message}`;
        return;
    }

    const xs = plotLinspace(xMin, xMax, 40);
    const ys = plotLinspace(yMin, yMax, 40);
    const zs = ys.map(y => xs.map(x => {
        try { return node.evaluate({ x, y }); } catch { return null; }
    }));

    await Plotly.newPlot(plotRenderTarget, [{
        x: xs, y: ys, z: zs, type: "surface", name: `z = ${expr}`, showscale: false,
        colorscale: [[0, "#2454a0"], [1, "#a4c2e0"]],
    }], {
        margin: { t: 30, r: 20, b: 20, l: 20 },
        font: PLOT_FONT,
        scene: {
            xaxis: { title: "x" },
            yaxis: { title: "y" },
            zaxis: { title: "z" },
        },
    }, { responsive: false });

    const dataURL = await Plotly.toImage(plotRenderTarget, { format: "png", width: 700, height: 500, scale: 2 });

    pushHistory(true);
    const w = 420, h = 300;
    const showDerivative = document.getElementById("plot3dDerivative").checked;
    const dxTex = showDerivative ? safeMathTex(() => math.derivative(expr, "x").toTex()) : null;
    const dyTex = showDerivative ? safeMathTex(() => math.derivative(expr, "y").toTex()) : null;
    let derivTex = null;
    if (dxTex !== null || dyTex !== null) {
        const parts = [];
        if (dxTex !== null) parts.push(`\\dfrac{\\partial z}{\\partial x} = ${dxTex}`);
        if (dyTex !== null) parts.push(`\\dfrac{\\partial z}{\\partial y} = ${dyTex}`);
        derivTex = parts.join("\\quad ");
    }
    const totalH = h + (derivTex ? 46 : 0);

    const obj = makeObject("image", (SLIDE_W - w) / 2, (SLIDE_H - totalH) / 2, w, h);
    obj.src = dataURL;
    curSlide().objects.push(obj);
    const newSelection = [obj.id];

    if (derivTex) {
        const dObj = makeObject("text", obj.x, obj.y + h + 10, w, 36);
        dObj.text = derivTex;
        dObj.isEquation = true;
        dObj.rawTex = true;
        dObj.fontFamily = "Roboto Mono";
        dObj.fontSize = 16;
        dObj.align = "center";
        curSlide().objects.push(dObj);
        newSelection.push(dObj.id);
    }

    state.selection = newSelection;
    setTool("select");
    render(); renderProperties();
    hidePlotModal();
}

async function insertPlotParam() {
    const xExpr = document.getElementById("plotParamX").value.trim();
    const yExpr = document.getElementById("plotParamY").value.trim();
    const errorEl = document.getElementById("plotParamError");
    errorEl.textContent = "";

    let tMin, tMax;
    try {
        tMin = math.evaluate(document.getElementById("plotParamTMin").value);
        tMax = math.evaluate(document.getElementById("plotParamTMax").value);
        if (typeof tMin !== "number" || typeof tMax !== "number" || !isFinite(tMin) || !isFinite(tMax) || tMin >= tMax) {
            throw new Error("Invalid range");
        }
    } catch {
        errorEl.textContent = "Invalid t range values.";
        return;
    }

    let xNode, yNode;
    try {
        xNode = math.compile(xExpr);
        xNode.evaluate({ t: tMin });
    } catch (err) {
        errorEl.textContent = `Invalid x(t) expression: ${err.message}`;
        return;
    }
    try {
        yNode = math.compile(yExpr);
        yNode.evaluate({ t: tMin });
    } catch (err) {
        errorEl.textContent = `Invalid y(t) expression: ${err.message}`;
        return;
    }

    const ts = plotLinspace(tMin, tMax, 600);
    const xs = ts.map(t => { try { return xNode.evaluate({ t }); } catch { return null; } });
    const ys = ts.map(t => { try { return yNode.evaluate({ t }); } catch { return null; } });

    await Plotly.newPlot(plotRenderTarget, [{
        x: xs, y: ys, type: "scatter", mode: "lines",
        name: `(${xExpr}, ${yExpr})`,
        line: { color: "#2454a0", width: 2 },
    }], {
        margin: { t: 30, r: 20, b: 40, l: 50 },
        font: PLOT_FONT,
        xaxis: { zeroline: true, title: "x", scaleanchor: "y", scaleratio: 1 },
        yaxis: { zeroline: true, title: "y" },
    }, { responsive: false });

    const dataURL = await Plotly.toImage(plotRenderTarget, { format: "png", width: 700, height: 500, scale: 2 });

    pushHistory(true);
    const w = 400, h = 286;
    const showDerivative = document.getElementById("plotParamDerivative").checked;
    const dxTex = showDerivative ? safeMathTex(() => math.derivative(xExpr, "t").toTex()) : null;
    const dyTex = showDerivative ? safeMathTex(() => math.derivative(yExpr, "t").toTex()) : null;
    let derivTex = null;
    if (dxTex !== null && dyTex !== null) {
        derivTex = `\\dfrac{dx}{dt} = ${dxTex} \\quad \\dfrac{dy}{dt} = ${dyTex}`;
    }
    const totalH = h + (derivTex ? 46 : 0);

    const obj = makeObject("image", (SLIDE_W - w) / 2, (SLIDE_H - totalH) / 2, w, h);
    obj.src = dataURL;
    curSlide().objects.push(obj);
    const newSelection = [obj.id];

    if (derivTex) {
        const dObj = makeObject("text", obj.x, obj.y + h + 10, w, 36);
        dObj.text = derivTex;
        dObj.isEquation = true;
        dObj.rawTex = true;
        dObj.fontFamily = "Roboto Mono";
        dObj.fontSize = 16;
        dObj.align = "center";
        curSlide().objects.push(dObj);
        newSelection.push(dObj.id);
    }

    state.selection = newSelection;
    setTool("select");
    render(); renderProperties();
    hidePlotModal();
}

document.getElementById("plotInsertBtn").onclick = () => {
    const activeTab = document.querySelector(".modal-tab[data-plot-tab].active").dataset.plotTab;
    if (activeTab === "2d") insertPlot2d();
    else if (activeTab === "param") insertPlotParam();
    else insertPlot3d();
};

// ============ Insert tab: Symbol ============
document.querySelectorAll("#symbolDropdownMenu button[data-symbol]").forEach(btn => {
    btn.onclick = () => {
        pushHistory(true);
        const obj = makeObject("text", (SLIDE_W - 60) / 2, (SLIDE_H - 60) / 2, 60, 60);
        obj.text = btn.dataset.symbol;
        obj.fontSize = 36;
        obj.align = "center";
        curSlide().objects.push(obj);
        state.selection = [obj.id];
        setTool("select");
        render(); renderProperties();
        document.getElementById("symbolDropdownMenu").classList.remove("open");
    };
});

// ============ Insert tab: Video / Audio ============
document.getElementById("videoBtn").onclick = () => document.getElementById("videoInput").click();
document.getElementById("videoInput").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        pushHistory(true);
        const obj = makeObject("video", (SLIDE_W - 320) / 2, (SLIDE_H - 180) / 2, 320, 180);
        obj.src = reader.result;
        obj.fileName = file.name;
        curSlide().objects.push(obj);
        state.selection = [obj.id];
        setTool("select");
        render(); renderProperties();
    };
    reader.readAsDataURL(file);
    e.target.value = "";
};

document.getElementById("audioBtn").onclick = () => document.getElementById("audioInput").click();
document.getElementById("audioInput").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        pushHistory(true);
        const obj = makeObject("audio", (SLIDE_W - 240) / 2, (SLIDE_H - 50) / 2, 240, 50);
        obj.src = reader.result;
        obj.fileName = file.name;
        curSlide().objects.push(obj);
        state.selection = [obj.id];
        setTool("select");
        render(); renderProperties();
    };
    reader.readAsDataURL(file);
    e.target.value = "";
};

function setTool(tool) {
    state.tool = tool;
    document.querySelectorAll(".tool-btn").forEach(b => b.classList.toggle("active", b.dataset.tool === tool));
    if (tool === "freeform") {
        document.body.style.cursor = "crosshair";
    } else {
        if (penDraw) { const el = svg.querySelector("#freeform-preview"); if (el) el.remove(); penDraw = null; }
        document.body.style.cursor = "";
    }
}

// ============ Z-order ============
document.getElementById("bringFrontBtn").onclick = () => zOrder("front");
document.getElementById("bringForwardBtn").onclick = () => zOrder("forward");
document.getElementById("sendBackwardBtn").onclick = () => zOrder("backward");
document.getElementById("sendBackBtn").onclick = () => zOrder("back");

function zOrder(dir) {
    pushHistory(true);
    const objs = curSlide().objects;
    state.selection.forEach(id => {
        const idx = objs.findIndex(o => o.id === id);
        if (idx === -1) return;
        const [item] = objs.splice(idx, 1);
        if (dir === "front") objs.push(item);
        else if (dir === "back") objs.unshift(item);
        else if (dir === "forward") objs.splice(Math.min(idx + 1, objs.length), 0, item);
        else if (dir === "backward") objs.splice(Math.max(idx - 1, 0), 0, item);
    });
    render();
}

// ============ Font (Home tab) ============
const fontFamilySelect = document.getElementById("fontFamilySelect");
const fontSizeInput = document.getElementById("fontSizeInput");
const fontSizeDecBtn = document.getElementById("fontSizeDecBtn");
const fontSizeIncBtn = document.getElementById("fontSizeIncBtn");
const fontBoldBtn = document.getElementById("fontBoldBtn");
const fontItalicBtn = document.getElementById("fontItalicBtn");
const fontUnderlineBtn = document.getElementById("fontUnderlineBtn");
const fontStrikeBtn = document.getElementById("fontStrikeBtn");
const indentDecBtn = document.getElementById("indentDecBtn");
const indentIncBtn = document.getElementById("indentIncBtn");
const textShadowBtn = document.getElementById("textShadowBtn");
const textGlowBtn = document.getElementById("textGlowBtn");
const fontColorInputWrap = document.getElementById("fontColorInputWrap");
const fontColorInput = makeColorPickerBtn("#000000", c => {
    applyFormatting(() => document.execCommand("foreColor", false, c), o => { o.fontColor = c; });
});
fontColorInputWrap.appendChild(fontColorInput);
const textAlignBtns = document.querySelectorAll(".ribbon button[data-textalign]");
const bulletListBtn       = document.getElementById("bulletListBtn");
const bulletListCaretBtn  = document.getElementById("bulletListCaretBtn");
const bulletListMenu      = document.getElementById("bulletListMenu");
const numberedListBtn     = document.getElementById("numberedListBtn");
const numberedListCaretBtn = document.getElementById("numberedListCaretBtn");
const numberedListMenu    = document.getElementById("numberedListMenu");
const listStyleOpts       = document.querySelectorAll(".list-style-opt");

const BULLET_TYPES = new Set(["bullet","circle","square","dash","arrow","check","star"]);
const NUMBER_TYPES = new Set(["number","alpha-upper","alpha-lower","roman-upper","roman-lower"]);

function getEffectiveListType() {
    const { div: editDiv, obj: editObj } = getActiveTextEditContext();
    if (editDiv && editDiv.isContentEditable && editObj) return getCurrentLiType() || editObj.list || "none";
    return getTextTargets()[0]?.list || "none";
}

function closeAllListMenus() {
    bulletListMenu.style.display = "none";
    numberedListMenu.style.display = "none";
}
const pasteBtn = document.getElementById("pasteBtn");
const cutBtn = document.getElementById("cutBtn");
const copyBtn = document.getElementById("copyBtn");
const homeNewSlideBtn = document.getElementById("homeNewSlideBtn");

FONT_LIST.forEach(f => fontFamilySelect.appendChild(el("option", { value: f, text: f, style: `font-family:'${f}'` })));

// Text-bearing objects affected by the Home tab's font/editing controls:
// directly-selected text boxes & shapes, plus the text labels of any
// selected table cells.
function getTextTargets() {
    const targets = [];
    state.selection.map(getObj).filter(Boolean).forEach(obj => {
        if (TEXT_CAPABLE_TYPES.includes(obj.type)) {
            targets.push(obj);
        } else if (obj.type === "group" && obj.tableCols && state.cellSelections.length) {
            state.cellSelections.forEach(cellId => {
                const cell = findObjectById(obj.children, cellId);
                if (!cell) return;
                const label = obj.children[obj.children.indexOf(cell) + 1];
                if (label && label.type === "text") targets.push(label);
            });
        }
    });
    return targets;
}

function applyToTextSelection(fn) {
    const textObjs = getTextTargets();
    if (!textObjs.length) return;
    pushHistory();
    textObjs.forEach(fn);
    render(); renderProperties();
}

// Remembers the most recent non-collapsed text selection inside a
// text-edit-box, as plain-text character offsets (so it survives the DOM
// rebuild that happens when focus moves to a ribbon control like the font
// family/size selectors and the editor div gets re-rendered).
let lastEditSelection = null; // { objId, start, end }

// Returns { start, end } character offsets of `range` within div's plain text.
function textOffsetsOfRange(div, range) {
    const preRange = document.createRange();
    preRange.selectNodeContents(div);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    return { start, end: start + range.toString().length };
}

// Restores a selection by plain-text character offsets (counterpart to
// textOffsetsOfRange). Returns true if both endpoints were found.
function setRangeByTextOffsets(div, start, end) {
    let pos = 0, startNode = null, startOff = 0, endNode = null, endOff = 0;
    (function walk(node) {
        if (startNode && endNode) return;
        if (node.nodeType === Node.TEXT_NODE) {
            const len = node.textContent.length;
            if (!startNode && start <= pos + len) { startNode = node; startOff = start - pos; }
            if (!endNode && end <= pos + len) { endNode = node; endOff = end - pos; }
            pos += len;
            return;
        }
        for (const c of node.childNodes) { walk(c); if (startNode && endNode) return; }
    })(div);
    if (!startNode || !endNode) return false;
    const range = document.createRange();
    range.setStart(startNode, startOff);
    range.setEnd(endNode, endOff);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
}

document.addEventListener("selectionchange", () => {
    const active = document.activeElement;
    if (!active || !active.classList || !active.classList.contains("text-edit-box") || active.contentEditable !== "true") return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (sel.isCollapsed || !active.contains(range.commonAncestorContainer)) {
        lastEditSelection = null;
        return;
    }
    lastEditSelection = { objId: active.dataset.id, ...textOffsetsOfRange(active, range) };
});

// If a text box is being edited and has a non-collapsed text selection inside
// it, returns that <div>/object pair so formatting controls can be applied to
// just the highlighted text (via execCommand) instead of the whole object.
// Also handles the case where focus just moved to a ribbon control (e.g. the
// font family/size dropdowns), by re-entering edit mode and restoring the
// last highlighted selection from `lastEditSelection`.
function getActiveTextSelection() {
    const active = document.activeElement;
    if (active && active.classList && active.classList.contains("text-edit-box") && active.contentEditable === "true") {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !active.contains(sel.anchorNode)) return null;
        const obj = findObjectById(curSlide().objects, active.dataset.id);
        if (!obj) return null;
        return { div: active, obj };
    }
    if (lastEditSelection) {
        const { objId, start, end } = lastEditSelection;
        const obj = findObjectById(curSlide().objects, objId);
        const div = svg.querySelector(`.text-edit-box[data-id="${objId}"]`);
        if (obj && div) {
            enterTextEditMode(div, obj, true, false);
            div.focus();
            if (setRangeByTextOffsets(div, start, end)) return { div, obj };
        }
    }
    return null;
}

// Wraps the current (non-collapsed) selection in a <span> with the given
// inline CSS properties, for formatting (font family/size/...) that
// execCommand can't apply with arbitrary values. Re-selects the wrapped
// content afterward so further formatting can be layered on top.
function applyInlineStyle(styleProps) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    const span = document.createElement("span");
    Object.assign(span.style, styleProps);
    span.appendChild(range.extractContents());
    range.insertNode(span);
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    sel.removeAllRanges();
    sel.addRange(newRange);
    return true;
}

// Runs `cmd` (an execCommand-based formatter) on the active highlighted text
// and syncs the result back into the object, or falls back to `fn` applied
// to the whole object(s) when nothing is highlighted.
function applyFormatting(cmd, fn) {
    const sel = getActiveTextSelection();
    if (sel) {
        // Highlighted text in typing mode → apply to the selection only.
        pushHistory(true);
        sel.div.focus();
        cmd();
        sel.obj.text = getTextBoxContent(sel.div, sel.obj);
        sel.obj.field = null;
        // Never call render() here — it wipes the SVG canvas and destroys the
        // live contenteditable, collapsing the selection and interrupting edit
        // flow. The div already shows the correct formatted content; the full
        // render happens naturally in finish() when the user clicks away.
        return;
    }
    // If a text box is in typing mode (contenteditable=true) but nothing is
    // highlighted, do nothing — cursor placed but no text selected to format.
    if (svg && svg.querySelector('.text-edit-box[contenteditable="true"]')) return;
    // Object selected but NOT in typing mode → format the whole object.
    applyToTextSelection(fn);
}

fontFamilySelect.onchange = () => applyFormatting(
    () => applyInlineStyle({ fontFamily: `"${fontFamilySelect.value}", sans-serif` }),
    o => { o.fontFamily = fontFamilySelect.value; }
);
fontSizeInput.onchange = () => applyFormatting(
    () => applyInlineStyle({ fontSize: (parseFloat(fontSizeInput.value) || 12) + "px" }),
    o => { o.fontSize = parseFloat(fontSizeInput.value) || 12; }
);
fontSizeDecBtn.onclick = () => {
    const cur = parseFloat(fontSizeInput.value) || 12;
    const next = Math.max(1, cur - 1);
    fontSizeInput.value = next;
    fontSizeInput.dispatchEvent(new Event("change"));
};
fontSizeIncBtn.onclick = () => {
    const cur = parseFloat(fontSizeInput.value) || 12;
    const next = cur + 1;
    fontSizeInput.value = next;
    fontSizeInput.dispatchEvent(new Event("change"));
};
// fontColorInput onChange is wired in makeColorPickerBtn above
fontBoldBtn.onclick = () => applyFormatting(() => document.execCommand("bold"), o => { o.bold = !o.bold; });
fontItalicBtn.onclick = () => applyFormatting(() => document.execCommand("italic"), o => { o.italic = !o.italic; });
fontUnderlineBtn.onclick = () => applyFormatting(() => document.execCommand("underline"), o => { o.underline = !o.underline; });
fontStrikeBtn.onclick = () => applyFormatting(() => document.execCommand("strikethrough"), o => { o.strikethrough = !o.strikethrough; });
indentDecBtn.onclick = () => applyToTextSelection(o => { o.indent = Math.max(0, (o.indent || 0) - 1); });
indentIncBtn.onclick = () => applyToTextSelection(o => { o.indent = Math.min(6, (o.indent || 0) + 1); });
pasteBtn.onclick = () => pasteClipboard();
cutBtn.onclick = () => cutSelection();
copyBtn.onclick = () => copySelection();
homeNewSlideBtn.onclick = () => document.getElementById("addSlideBtn").click();
textShadowBtn.onclick = () => applyFormatting(() => applyInlineStyle(textEffectStyle("shadow")), o => { o.textShadow = !o.textShadow; });
textGlowBtn.onclick = () => applyFormatting(() => applyInlineStyle(textEffectStyle("glow")), o => { o.textGlow = !o.textGlow; });
// clicking these controls would normally steal focus from the contenteditable
// text box, collapsing/discarding the user's highlighted text selection
// before the click handler runs. Preventing the default mousedown focus
// change keeps the highlighted range intact so bold/italic/underline/color
// apply to just the selected text.
[fontBoldBtn, fontItalicBtn, fontUnderlineBtn, fontStrikeBtn, fontColorInput, textShadowBtn, textGlowBtn, fontSizeDecBtn, fontSizeIncBtn].forEach(btn => {
    btn.addEventListener("mousedown", (e) => e.preventDefault());
});
textAlignBtns.forEach(btn => {
    btn.onclick = () => applyToTextSelection(o => { o.align = btn.dataset.textalign; });
});
// Quick-toggle: bullet list
bulletListBtn.onclick = () => {
    const cur = getEffectiveListType();
    applyListStyle(BULLET_TYPES.has(cur) ? "none" : "bullet");
};

// Caret: open bullet style picker
bulletListCaretBtn.onclick = () => {
    const open = bulletListMenu.style.display !== "none";
    closeAllListMenus();
    if (!open) {
        const rect = bulletListCaretBtn.getBoundingClientRect();
        bulletListMenu.style.left = rect.left + "px";
        bulletListMenu.style.top  = (rect.bottom + 2) + "px";
        bulletListMenu.style.display = "flex";
    }
};

// Quick-toggle: numbered list
numberedListBtn.onclick = () => {
    const cur = getEffectiveListType();
    applyListStyle(NUMBER_TYPES.has(cur) ? "none" : "number");
};

// Caret: open numbered style picker
numberedListCaretBtn.onclick = () => {
    const open = numberedListMenu.style.display !== "none";
    closeAllListMenus();
    if (!open) {
        const rect = numberedListCaretBtn.getBoundingClientRect();
        numberedListMenu.style.left = rect.left + "px";
        numberedListMenu.style.top  = (rect.bottom + 2) + "px";
        numberedListMenu.style.display = "flex";
    }
};

document.addEventListener("click", e => {
    if (!bulletListBtn.contains(e.target) && !bulletListCaretBtn.contains(e.target) && !bulletListMenu.contains(e.target) &&
        !numberedListBtn.contains(e.target) && !numberedListCaretBtn.contains(e.target) && !numberedListMenu.contains(e.target)) {
        closeAllListMenus();
    }
});

// Returns the active contenteditable text-edit-box and its state object, or nulls.
function getActiveTextEditContext() {
    const active = document.activeElement;
    const div = (active && active.classList?.contains("text-edit-box") && active.contentEditable === "true")
        ? active
        : svg?.querySelector('.text-edit-box[contenteditable="true"]');
    const obj = div ? findObjectById(curSlide().objects, div.dataset.id) : null;
    return { div: div || null, obj: obj || null };
}

// Returns the list type of the <li> the cursor is currently inside, or null.
function getCurrentLiType() {
    const { div: editDiv } = getActiveTextEditContext();
    if (!editDiv || !editDiv.isContentEditable) return null;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return null;
    let node = range.startContainer;
    while (node && node !== editDiv) {
        if (node.tagName === "LI") return node.closest("[data-list-type]")?.dataset.listType || null;
        node = node.parentNode;
    }
    return null;
}

// Splits a plain-text contentEditable div into lines and finds the cursor's line index.
// Handles both <br>-separated and <div>/<p>-wrapped lines (both appear from browser Enter).
function splitPlainTextAtCursor(div, range) {
    const lines = [];
    let currentParts = [];
    let cursorLine = 0;
    let cursorFound = false;
    const startNode = range?.startContainer;

    const flushLine = () => { lines.push(currentParts.join("")); currentParts = []; };

    const findCursorIn = (node) => {
        if (cursorFound) return;
        if (node === startNode) { cursorLine = lines.length; cursorFound = true; return; }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const tw = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
        let n;
        while ((n = tw.nextNode())) {
            if (n === startNode) { cursorLine = lines.length; cursorFound = true; return; }
        }
    };

    for (const child of div.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
            findCursorIn(child);
            currentParts.push(child.textContent);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
            if (child.tagName === "BR") {
                findCursorIn(child);
                flushLine();
            } else if (child.tagName === "DIV" || child.tagName === "P") {
                if (currentParts.length > 0) flushLine();
                findCursorIn(child);
                // A bare <br> is a browser placeholder for an empty block — strip it so
                // we don't get a spurious <br> token when the line content is joined later.
                lines.push((child.innerHTML || "").replace(/^<br\s*\/?>$/i, ""));
            } else {
                findCursorIn(child);
                currentParts.push(child.outerHTML);
            }
        }
    }
    if (currentParts.length > 0 || lines.length === 0) lines.push(currentParts.join(""));

    return { lines, cursorLine: Math.max(0, Math.min(cursorLine, lines.length - 1)) };
}

function applyListStyle(type) {
    closeAllListMenus();
    const { div: editDiv, obj: editObj } = getActiveTextEditContext();

    // ── Toggle logic ──────────────────────────────────────────────────────────
    // With a SELECTION (text highlighted): toggle off if all selected lines already have this type.
    // With a CURSOR ONLY (nothing selected): act as a "generator" — always apply, never toggle.
    // Without edit mode: object-level toggle (selected object = implicit selection).
    if (type !== "none") {
        if (editDiv && editDiv.isContentEditable && editObj) {
            const sel = window.getSelection();
            const allLisToggle = [...editDiv.querySelectorAll("li")];
            if (allLisToggle.length > 0 && sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed) {
                const range = sel.getRangeAt(0);
                const affected = allLisToggle.filter(li => { try { return range.intersectsNode(li); } catch { return false; } });
                if (affected.length > 0 && affected.every(li => li.closest("[data-list-type]")?.dataset.listType === type)) {
                    type = "none";
                }
            }
            // collapsed cursor → no toggle (generator mode)
        } else {
            const textObjs = getTextTargets();
            if (textObjs.length > 0 && (textObjs[0].list || "none") === type) type = "none";
        }
    }

    if (!editDiv || !editDiv.isContentEditable || !editObj) {
        // Not in typing mode → apply list to the whole selected object(s)
        applyToTextSelection(o => {
            if (type === "none" && o.list && o.list !== "none" && o.text) {
                // List → plain text: convert \n separators back to <br>
                o.text = o.text.split("\n").join("<br>");
            } else if (type !== "none" && (!o.list || o.list === "none") && o.text) {
                // Plain text → list: text may be stored as contentEditable HTML
                // (e.g. "Line 1<div>Line 2</div><div>Line 3</div>") which
                // setTextBoxContent cannot parse as separate lines. Normalize to \n.
                if (o.text.includes("<div") || o.text.includes("<p")) {
                    const tmp = document.createElement("div");
                    tmp.innerHTML = o.text;
                    const lines = [];
                    let cur = [];
                    for (const child of tmp.childNodes) {
                        if (child.nodeType === Node.TEXT_NODE) {
                            cur.push(child.textContent);
                        } else if (child.nodeType === Node.ELEMENT_NODE) {
                            if (child.tagName === "BR") {
                                lines.push(cur.join("")); cur = [];
                            } else if (child.tagName === "DIV" || child.tagName === "P") {
                                if (cur.length > 0) { lines.push(cur.join("")); cur = []; }
                                lines.push((child.innerHTML || "").replace(/^<br\s*\/?>$/i, ""));
                            } else {
                                cur.push(child.outerHTML);
                            }
                        }
                    }
                    if (cur.length > 0 || lines.length === 0) lines.push(cur.join(""));
                    o.text = lines.join("\n");
                }
            }
            o.list = type; delete o.paragraphListTypes;
        });
        syncFontRibbon();
        return;
    }

    const sel = window.getSelection();
    const allLis = [...editDiv.querySelectorAll("li")];

    // Helper: restore cursor to a specific <li> index after any DOM rebuild, and sync the
    // properties textarea (via the input → syncContent listener already attached to editDiv).
    const restoreCursor = (liIdx) => {
        const lis = editDiv.querySelectorAll("li");
        const target = lis[Math.min(Math.max(liIdx, 0), lis.length - 1)];
        if (target) {
            const r = document.createRange();
            r.setStart(target, 0);
            r.collapse(true);
            const s = window.getSelection();
            if (s) { s.removeAllRanges(); s.addRange(r); }
        }
        editDiv.dispatchEvent(new Event("input", { bubbles: true })); // syncs properties textarea
    };

    // Capture cursor's current <li> index before any rebuild
    let cursorLiIdx = 0;
    if (sel && sel.rangeCount > 0) {
        let node = sel.getRangeAt(0).startContainer;
        while (node && node !== editDiv) {
            if (node.tagName === "LI") { const i = allLis.indexOf(node); if (i >= 0) cursorLiIdx = i; break; }
            node = node.parentNode;
        }
    }

    if (allLis.length === 0) {
        // No list structure yet (plain text in edit mode)
        if (type === "none") { syncFontRibbon(); return; }
        pushHistory();

        const range0 = (sel && sel.rangeCount > 0) ? sel.getRangeAt(0) : null;
        const { lines: lineHtmls, cursorLine } = splitPlainTextAtCursor(editDiv, range0);

        let newLineHtmls, newTypes, focusIdx;

        if (!range0 || range0.collapsed) {
            // Cursor only: convert just the current line
            newLineHtmls = lineHtmls;
            newTypes = lineHtmls.map((_, i) => i === cursorLine ? type : "none");
            focusIdx = cursorLine;
        } else {
            // Selection: apply only to the lines covered by the selection
            const { cursorLine: selStart } = splitPlainTextAtCursor(editDiv, { startContainer: range0.startContainer, startOffset: range0.startOffset });
            const { cursorLine: selEnd }   = splitPlainTextAtCursor(editDiv, { startContainer: range0.endContainer,   startOffset: range0.endOffset });
            // If selection ends at offset 0 of a new line, don't include that line
            const lastLine = (range0.endOffset === 0 && selEnd > selStart) ? selEnd - 1 : selEnd;
            newLineHtmls = lineHtmls;
            newTypes = lineHtmls.map((_, i) => (i >= selStart && i <= lastLine) ? type : "none");
            focusIdx = selStart;
        }

        editDiv.innerHTML = "";
        let idx = 0;
        while (idx < newLineHtmls.length) {
            const curType = newTypes[idx];
            const block = createListBlock(curType);
            while (idx < newLineHtmls.length && newTypes[idx] === curType) {
                const li = document.createElement("li");
                li.innerHTML = newLineHtmls[idx];
                block.appendChild(li);
                idx++;
            }
            editDiv.appendChild(block);
        }

        editObj.list = type;
        delete editObj.paragraphListTypes;
        delete editObj.paragraphIndents;
        editObj.text = getTextBoxContent(editDiv, editObj);
        restoreCursor(focusIdx);
        syncFontRibbon();
        return;
    }

    // Determine which lines are affected by the current selection
    let affectedLis;
    if (!sel || sel.rangeCount === 0) {
        affectedLis = allLis;
    } else {
        const range = sel.getRangeAt(0);
        if (range.collapsed) {
            // Cursor only → change just the current item's type
            let node = range.startContainer;
            let foundLi = null;
            while (node && node !== editDiv) {
                if (node.tagName === "LI") { foundLi = node; break; }
                node = node.parentNode;
            }
            affectedLis = foundLi ? [foundLi] : allLis;
        } else {
            // Selection → find all <li> items that intersect the highlighted range
            affectedLis = allLis.filter(li => { try { return range.intersectsNode(li); } catch { return false; } });
            if (affectedLis.length === 0) affectedLis = allLis;
        }
    }

    // All lines affected → full-object operation (rebuild in-place, user stays in edit mode)
    if (affectedLis.length === allLis.length) {
        if (type === "none") {
            pushHistory();
            // Strip bare <br> browser adds as cursor placeholder in empty <li> to avoid
            // double line breaks when joining (empty li "<br>" + join "<br>" = "<br><br>").
            const lines = allLis.map(li => li.innerHTML.replace(/^<br\s*\/?>$/i, ""));
            editDiv.innerHTML = lines.join("<br>");
            editObj.text = editDiv.innerHTML;
            editObj.list = "none";
            delete editObj.paragraphListTypes;
            delete editObj.paragraphIndents;
            // Cursor at start since list items are gone
            const r = document.createRange(); r.setStart(editDiv, 0); r.collapse(true);
            const s = window.getSelection(); if (s) { s.removeAllRanges(); s.addRange(r); }
            editDiv.dispatchEvent(new Event("input", { bubbles: true }));
            syncFontRibbon();
            return;
        }
        // Change type for all lines: snapshot live DOM first (may have unsaved edits)
        pushHistory();
        const liveText = getTextBoxContent(editDiv, editObj);
        editObj.list = type;
        editObj.text = liveText;
        delete editObj.paragraphListTypes;
        delete editObj.paragraphIndents;
        setTextBoxContent(editDiv, editObj);
        editObj.text = getTextBoxContent(editDiv, editObj);
        restoreCursor(cursorLiIdx);
        syncFontRibbon();
        return;
    }

    // Partial application: only affected lines change type
    pushHistory();
    const affectedSet = new Set(affectedLis);
    const newTypes = allLis.map((li) => {
        if (affectedSet.has(li)) return type;
        return li.closest("ul,ol")?.dataset.listType || editObj.list || "bullet";
    });

    // If every line ends up "none", convert the whole box to plain text
    if (newTypes.every(t => t === "none")) {
        const lines = allLis.map(li => li.innerHTML.replace(/^<br\s*\/?>$/i, ""));
        editDiv.innerHTML = lines.join("<br>");
        editObj.text = editDiv.innerHTML;
        editObj.list = "none";
        delete editObj.paragraphListTypes;
        delete editObj.paragraphIndents;
        const r = document.createRange(); r.setStart(editDiv, 0); r.collapse(true);
        const s = window.getSelection(); if (s) { s.removeAllRanges(); s.addRange(r); }
        editDiv.dispatchEvent(new Event("input", { bubbles: true }));
        syncFontRibbon();
        return;
    }

    const typeCounts = {};
    newTypes.forEach(t => { typeCounts[t] = (typeCounts[t] || 0) + 1; });
    const nonNoneEntries = Object.entries(typeCounts).filter(([t]) => t !== "none");
    editObj.list = nonNoneEntries.length
        ? nonNoneEntries.sort((a, b) => b[1] - a[1])[0][0]
        : (editObj.list && editObj.list !== "none" ? editObj.list : "bullet");
    editObj.paragraphListTypes = newTypes;

    const items = allLis.map((li, i) => ({ html: li.innerHTML, type: newTypes[i] }));
    editDiv.innerHTML = "";
    let i = 0;
    while (i < items.length) {
        const curType = items[i].type;
        const block = createListBlock(curType);
        while (i < items.length && items[i].type === curType) {
            const newLi = document.createElement("li");
            newLi.innerHTML = items[i].html;
            block.appendChild(newLi);
            i++;
        }
        editDiv.appendChild(block);
    }
    editObj.text = getTextBoxContent(editDiv, editObj);
    restoreCursor(cursorLiIdx);
    syncFontRibbon();
}

listStyleOpts.forEach(btn => {
    btn.addEventListener("mousedown", e => e.preventDefault());
    btn.onclick = () => applyListStyle(btn.dataset.list);
});

function syncFontRibbon() {
    const textObjs = getTextTargets();
    const enabled = textObjs.length > 0;
    const controls = [fontFamilySelect, fontSizeInput, fontSizeDecBtn, fontSizeIncBtn, fontBoldBtn, fontItalicBtn, fontUnderlineBtn, fontStrikeBtn, indentDecBtn, indentIncBtn, fontColorInput, textShadowBtn, textGlowBtn, ...textAlignBtns, bulletListBtn, bulletListCaretBtn, numberedListBtn, numberedListCaretBtn];
    controls.forEach(c => c.disabled = !enabled);
    if (!enabled) {
        [fontBoldBtn, fontItalicBtn, fontUnderlineBtn, fontStrikeBtn, textShadowBtn, textGlowBtn, ...textAlignBtns].forEach(b => b.classList.remove("active"));
        listStyleOpts.forEach(b => b.classList.remove("active"));
        bulletListBtn.classList.remove("active");
        numberedListBtn.classList.remove("active");
        return;
    }
    const obj = textObjs[0];
    fontFamilySelect.value = obj.fontFamily;
    fontSizeInput.value = obj.fontSize;
    fontColorInput._setValue(obj.fontColor);
    fontBoldBtn.classList.toggle("active", !!obj.bold);
    fontItalicBtn.classList.toggle("active", !!obj.italic);
    fontUnderlineBtn.classList.toggle("active", !!obj.underline);
    fontStrikeBtn.classList.toggle("active", !!obj.strikethrough);
    textShadowBtn.classList.toggle("active", !!obj.textShadow);
    textGlowBtn.classList.toggle("active", !!obj.textGlow);
    textAlignBtns.forEach(b => b.classList.toggle("active", (obj.align || "left") === b.dataset.textalign));
    // Prefer the cursor's actual <li> type over the object-level list type
    const curList = getCurrentLiType() || obj.list || "none";
    listStyleOpts.forEach(b => b.classList.toggle("active", b.dataset.list === curList));
    bulletListBtn.classList.toggle("active",   BULLET_TYPES.has(curList));
    numberedListBtn.classList.toggle("active", NUMBER_TYPES.has(curList));
}

// ============ Align / Distribute ============
document.querySelectorAll(".ribbon button[data-align]").forEach(btn => {
    btn.onclick = () => alignSelection(btn.dataset.align);
});

function alignSelection(mode) {
    const objs = state.selection.map(getObj).filter(Boolean);
    if (objs.length === 0) return;
    pushHistory(true);

    if (mode === "distH" || mode === "distV") {
        if (objs.length < 3) return;
        if (mode === "distH") {
            objs.sort((a, b) => a.x - b.x);
            const min = objs[0].x, max = objs[objs.length - 1].x + objs[objs.length - 1].w;
            const totalW = objs.reduce((s, o) => s + o.w, 0);
            const gap = (max - min - totalW) / (objs.length - 1);
            let cur = min;
            objs.forEach(o => { o.x = cur; cur += o.w + gap; });
        } else {
            objs.sort((a, b) => a.y - b.y);
            const min = objs[0].y, max = objs[objs.length - 1].y + objs[objs.length - 1].h;
            const totalH = objs.reduce((s, o) => s + o.h, 0);
            const gap = (max - min - totalH) / (objs.length - 1);
            let cur = min;
            objs.forEach(o => { o.y = cur; cur += o.h + gap; });
        }
        render();
        return;
    }

    // align relative to the slide bounds
    objs.forEach(o => {
        switch (mode) {
            case "left": o.x = 0; break;
            case "centerH": o.x = (SLIDE_W - o.w) / 2; break;
            case "right": o.x = SLIDE_W - o.w; break;
            case "top": o.y = 0; break;
            case "middleV": o.y = (SLIDE_H - o.h) / 2; break;
            case "bottom": o.y = SLIDE_H - o.h; break;
        }
    });
    render();
}

// ============ Delete / Duplicate ============
document.getElementById("deleteBtn").onclick = () => {
    if (!state.selection.length) return;
    pushHistory(true);
    curSlide().objects = curSlide().objects.filter(o => !state.selection.includes(o.id));
    state.selection = [];
    render(); renderProperties();
};

// recursively assign fresh ids to an object and any group children
function reassignIds(obj) {
    obj.id = uid();
    if (obj.type === "group" && obj.children) obj.children.forEach(reassignIds);
    return obj;
}

document.getElementById("duplicateBtn").onclick = () => {
    if (!state.selection.length) return;
    pushHistory(true);
    const newIds = [];
    state.selection.forEach(id => {
        const orig = getObj(id);
        if (!orig) return;
        const copy = reassignIds(JSON.parse(JSON.stringify(orig)));
        copy.x += 16; copy.y += 16;
        if (copy.type === "group") offsetGroupChildren(copy, 16, 16);
        curSlide().objects.push(copy);
        newIds.push(copy.id);
    });
    state.selection = newIds;
    render(); renderProperties();
};

function offsetGroupChildren(group, dx, dy) {
    (group.children || []).forEach(c => {
        c.x += dx; c.y += dy;
        if (c.type === "group") offsetGroupChildren(c, dx, dy);
    });
}

// ============ Group / Ungroup ============
document.getElementById("groupBtn").onclick = groupSelection;
document.getElementById("ungroupBtn").onclick = ungroupSelection;

function groupSelection() {
    if (state.selection.length < 2) return;
    const objs = state.selection.map(getObj).filter(Boolean);
    if (objs.length < 2) return;
    pushHistory(true);
    const minX = Math.min(...objs.map(o => o.x));
    const minY = Math.min(...objs.map(o => o.y));
    const maxX = Math.max(...objs.map(o => o.x + o.w));
    const maxY = Math.max(...objs.map(o => o.y + o.h));
    const group = {
        id: uid(), type: "group", x: minX, y: minY, w: maxX - minX, h: maxY - minY,
        rotation: 0, opacity: 100, shadow: false,
        children: objs.map(o => JSON.parse(JSON.stringify(o))),
    };
    const ids = new Set(state.selection);
    curSlide().objects = curSlide().objects.filter(o => !ids.has(o.id));
    curSlide().objects.push(group);
    state.selection = [group.id];
    render(); renderProperties();
}

function ungroupSelection() {
    if (state.selection.length !== 1) return;
    const group = getObj(state.selection[0]);
    if (!group || group.type !== "group") return;
    pushHistory(true);
    const idx = curSlide().objects.findIndex(o => o.id === group.id);
    curSlide().objects.splice(idx, 1);
    const newIds = [];
    group.children.forEach(c => { curSlide().objects.push(c); newIds.push(c.id); });
    state.selection = newIds;
    render(); renderProperties();
}

// ============ Copy / Paste ============
let clipboard = null;

function copySelection() {
    const objs = state.selection.map(getObj).filter(Boolean);
    if (!objs.length) return;
    clipboard = objs.map(o => JSON.parse(JSON.stringify(o)));
}

function cutSelection() {
    if (!state.selection.length) return;
    copySelection();
    document.getElementById("deleteBtn").click();
}

function pasteClipboard() {
    if (!clipboard || !clipboard.length) return;
    pushHistory(true);
    const newIds = [];
    clipboard.forEach(o => {
        const copy = reassignIds(JSON.parse(JSON.stringify(o)));
        copy.x += 16; copy.y += 16;
        if (copy.type === "group") offsetGroupChildren(copy, 16, 16);
        curSlide().objects.push(copy);
        newIds.push(copy.id);
    });
    state.selection = newIds;
    render(); renderProperties();
}

// ============ Keyboard ============
document.addEventListener("keydown", (e) => {
    if (e.target.isContentEditable || e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    const ctrl = e.ctrlKey || e.metaKey;

    if ((e.key === "Delete" || e.key === "Backspace") && state.selection.length) {
        e.preventDefault();
        document.getElementById("deleteBtn").click();
    }
    if (e.key === "Escape") {
        if (bgrSession) {
            bgrClose();
            return;
        }
        if (penDraw) {
            cancelFreeformDraw();
        } else if (state.editPoints) {
            state.editPoints = null;
            render(); renderProperties();
        } else {
            state.selection = [];
            render(); renderProperties();
        }
    }
    if (ctrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
    }
    if (ctrl && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
    }
    if (ctrl && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copySelection();
    }
    if (ctrl && e.key.toLowerCase() === "v") {
        e.preventDefault();
        pasteClipboard();
    }
    if (ctrl && e.key.toLowerCase() === "x") {
        e.preventDefault();
        cutSelection();
    }
    if (ctrl && e.key.toLowerCase() === "d" && state.selection.length) {
        e.preventDefault();
        document.getElementById("duplicateBtn").click();
    }
    if (ctrl && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (e.shiftKey) ungroupSelection(); else groupSelection();
    }

    // Arrow-key nudge
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) && state.selection.length) {
        e.preventDefault();
        pushHistory();
        const step = e.shiftKey ? 10 : 1;
        const objs = state.selection.map(getObj).filter(Boolean);
        objs.forEach(o => {
            let dx = 0, dy = 0;
            if (e.key === "ArrowUp") dy = -step;
            if (e.key === "ArrowDown") dy = step;
            if (e.key === "ArrowLeft") dx = -step;
            if (e.key === "ArrowRight") dx = step;
            o.x += dx; o.y += dy;
            if (o.type === "group") offsetGroupChildren(o, dx, dy);
        });
        render(); renderProperties();
    }
});

// ============ Mouse interaction ============
function svgPoint(e) {
    const rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left) * ((SLIDE_W + CANVAS_MARGIN * 2) / rect.width) - CANVAS_MARGIN;
    const y = (e.clientY - rect.top) * ((SLIDE_H + CANVAS_MARGIN * 2) / rect.height) - CANVAS_MARGIN;
    return { x, y };
}

let drag = null; // current drag operation
let lastClick = null; // for manual double-click detection on shapes

// ---- Border paint tool state ----
const borderPaintState = { active: false, color: "#000000", width: 2, dash: "solid" };
let borderPaintHover = null; // { key, tableId } | null

function updateBorderPaintOverlay() {
    const existing = document.getElementById("border-paint-overlay");
    if (existing) existing.remove();
    if (!borderPaintHover) return;
    const obj = getObj(borderPaintHover.tableId);
    if (!obj) return;
    const colX = tableColX(obj), rowY = tableRowY(obj);
    const [type, rs, cs] = borderPaintHover.key.split(":");
    const r = parseInt(rs), c = parseInt(cs);
    if (type === "h" && c >= colX.length - 1) return;
    if (type === "v" && r >= rowY.length - 1) return;
    const g = document.createElementNS(svgNS, "g");
    g.id = "border-paint-overlay";
    const line = document.createElementNS(svgNS, "line");
    if (type === "h") {
        applyAttrs(line, { x1: colX[c], y1: rowY[r], x2: colX[c + 1], y2: rowY[r] });
    } else {
        applyAttrs(line, { x1: colX[c], y1: rowY[r], x2: colX[c], y2: rowY[r + 1] });
    }
    applyAttrs(line, {
        stroke: borderPaintState.color, "stroke-width": Math.max(3, borderPaintState.width),
        "stroke-opacity": "0.65", "stroke-linecap": "square",
        "pointer-events": "none", class: "border-paint-hover-line"
    });
    g.appendChild(line);
    svg.appendChild(g);
}

svg.addEventListener("mousedown", (e) => {
    const pt = svgPoint(e);
    const target = e.target;

    // Crop mode: handle edge dragging
    if (cropState) {
        const edge = target.dataset && target.dataset.cropEdge;
        if (edge) {
            const obj = getObj(cropState.id);
            if (obj) {
                cropState.edge = edge;
                cropState.startPt = { x: pt.x, y: pt.y };
                cropState.startCrop = Object.assign({ top: 0, right: 0, bottom: 0, left: 0 }, obj.imgCrop || {});
                e.preventDefault(); e.stopPropagation();
            }
        }
        return;
    }

    closeAllDropdowns();
    closeTextContextMenu();

    // commit any in-progress text edit before doing anything else, so a
    // render() triggered below doesn't wipe out unsaved typed text
    const activeEdit = document.activeElement;
    if (activeEdit && activeEdit.isContentEditable && activeEdit.classList && activeEdit.classList.contains("text-edit-box") && !activeEdit.contains(target)) {
        activeEdit.blur();
    }

    if (state.tool !== "select") {
        if (state.tool === "freeform") {
            if (!penDraw) {
                // Start a new freeform path
                penDraw = { anchors: [], buttonDown: true, downX: pt.x, downY: pt.y, isDragging: false, curX: pt.x, curY: pt.y };
            } else {
                // Check if clicking on first anchor to close the path
                if (penDraw.anchors.length >= 3) {
                    const a0 = penDraw.anchors[0];
                    if (Math.hypot(pt.x - a0.x, pt.y - a0.y) < PEN_CLOSE_SNAP) {
                        finishFreeformDraw(true);
                        return;
                    }
                }
                penDraw.buttonDown = true;
                penDraw.downX = pt.x; penDraw.downY = pt.y;
                penDraw.isDragging = false;
            }
            drawFreeformPreview();
            return;
        }
        // start drawing a new shape
        pushHistory(true);
        drag = { mode: "draw", startX: pt.x, startY: pt.y, tool: state.tool };
        return;
    }

    // check for handle interaction
    if (target.classList.contains("handle")) {
        const handle = target.dataset.handle;
        const obj = getObj(state.selection[0]);
        if (!obj) return;
        pushHistory();
        if (handle === "rotate") {
            drag = { mode: "rotate", id: obj.id, cx: obj.x + obj.w / 2, cy: obj.y + obj.h / 2, startRotation: obj.rotation, startX: pt.x, startY: pt.y };
        } else if (handle === "vertex") {
            drag = { mode: "vertex", id: obj.id, index: parseInt(target.dataset.index, 10) };
        } else if (handle === "adjust") {
            drag = { mode: "adjust", id: obj.id };
        } else if (handle === "col-divider" || handle === "row-divider") {
            drag = {
                mode: handle, id: obj.id, index: parseInt(target.dataset.index, 10),
                startColWidths: [...obj.colWidths], startRowHeights: [...obj.rowHeights],
                startX: pt.x, startY: pt.y
            };
        } else {
            drag = { mode: "resize", id: obj.id, handle, start: { ...obj },
                startChildren: obj.type === "group" ? JSON.parse(JSON.stringify(obj.children)) : null,
                startColWidths: obj.tableCols ? [...obj.colWidths] : null,
                startRowHeights: obj.tableCols ? [...obj.rowHeights] : null,
                startX: pt.x, startY: pt.y };
        }
        return;
    }

    // if a text box is already in edit mode and the click lands inside it,
    // let the browser handle caret placement / drag-to-select / double- and
    // triple-click word/paragraph selection natively, instead of re-running
    // our select/move/edit logic (which would re-render and collapse any
    // selection the user is making)
    {
        const editingDiv = target.closest(".text-edit-box");
        if (editingDiv && editingDiv.contentEditable === "true") return;
    }

    // check for shape interaction
    let g = target.closest(".shape-el");
    // Fallback: closest() may not cross the HTML→SVG namespace boundary when
    // the click lands on a <span>/<div> inside a foreignObject code block.
    // Locate the shape via the text-edit-box's data-id instead.
    if (!g) {
        const foDiv = target.closest(".text-edit-box");
        if (foDiv && foDiv.contentEditable !== "true" && foDiv.dataset.id) {
            g = svg.querySelector(`.shape-el[data-id="${foDiv.dataset.id}"]`);
        }
    }
    if (g) {
        const id = g.dataset.id;
        const obj = getObj(id);
        if (!obj) return;

        // manual double-click detection (foreignObject text editing is unreliable
        // with the native dblclick event). Text boxes nested inside a group (e.g.
        // table cells) carry their own data-id, distinct from the group's id.
        const textDiv = target.closest(".text-edit-box");
        const clickId = textDiv ? textDiv.dataset.id : id;

        const now = Date.now();
        const isDoubleClick = lastClick && lastClick.id === clickId && (now - lastClick.time) < 400;
        lastClick = { id: clickId, time: now };

        if (isDoubleClick && obj.type === "zoom") {
            lastClick = null;
            if (state.slides[obj.targetSlide]) {
                state.current = obj.targetSlide;
                state.selection = [];
                render(); renderProperties();
            }
            return;
        }

        // Border paint mode: intercept clicks near table borders
        if (borderPaintState.active && obj.type === "group" && obj.tableCols &&
                state.selection.length === 1 && state.selection[0] === id) {
            const border = borderAtPoint(obj, pt.x, pt.y);
            if (border) {
                pushHistory();
                if (!obj.customBorders) obj.customBorders = {};
                obj.customBorders[border] = { color: borderPaintState.color, width: borderPaintState.width, dash: borderPaintState.dash };
                drag = { mode: "border-paint", tableId: id, lastKey: border };
                render();
                return;
            }
        }

        // Detect which table cell (if any) was clicked — works regardless of
        // whether the table is already selected, so a single click+drag on a
        // cell immediately starts range selection.
        let cellId = null;
        if (obj.type === "group" && obj.tableCols) {
            const childEl = target.closest("[data-child-id]");
            if (childEl) {
                let cell = findObjectById(obj.children, childEl.dataset.childId);
                if (cell && cell.type === "text") {
                    const idx = obj.children.indexOf(cell);
                    const rectCell = obj.children[idx - 1];
                    if (rectCell && rectCell.type === "rect") cell = rectCell;
                }
                if (cell && cell.type === "rect") cellId = cell.id;
            }
            // Fallback: use slide-coordinate hit test (handles edge cases)
            if (!cellId) {
                const hit = cellAtPoint(obj, pt.x, pt.y);
                if (hit) cellId = hit.cellId;
            }
        }

        // shift+click on a cell: toggle it in/out of the multi-cell selection
        if (cellId && e.shiftKey && state.selection.includes(id)) {
            if (state.cellSelections.includes(cellId)) {
                state.cellSelections = state.cellSelections.filter(c => c !== cellId);
            } else {
                state.cellSelections.push(cellId);
            }
            render(); renderProperties();
            return;
        }

        const wasSoleSelection = !e.shiftKey && state.selection.length === 1 && state.selection[0] === id;

        state.cellSelections = cellId ? [cellId] : [];

        if (e.shiftKey) {
            if (state.selection.includes(id)) state.selection = state.selection.filter(s => s !== id);
            else state.selection.push(id);
        } else if (!state.selection.includes(id)) {
            state.selection = [id];
        }
        render(); renderProperties();
        pushHistory();

        // Stationary click on an already-selected cell → enter text edit mode
        let editCandidate = null;
        if (wasSoleSelection && cellId) {
            const cell = findObjectById(obj.children, cellId);
            const idx = obj.children.indexOf(cell);
            const label = obj.children[idx + 1];
            if (label && label.type === "text") editCandidate = { id: label.id, clientX: e.clientX, clientY: e.clientY };
        } else if (!cellId && wasSoleSelection) {
            // Allow edit-mode entry whether the click landed on the text area
            // (textDiv found) or on the shape body / SVG border rect.
            const textObj = findObjectById(curSlide().objects, id);
            if (textObj && TEXT_CAPABLE_TYPES.includes(textObj.type)) editCandidate = { id: id, clientX: e.clientX, clientY: e.clientY };
        }

        // Any click on a table cell starts a cell-range drag (first OR second click).
        // Dragging the table itself: only possible when clicking non-cell areas.
        if (cellId && !e.shiftKey) {
            const pos = cellGridPos(obj, cellId);
            if (pos) {
                drag = {
                    mode: "table-cell-select",
                    tableId: id, startR: pos.r, startC: pos.c,
                    startX: pt.x, startY: pt.y, editCandidate
                };
                return;
            }
        }

        // grab anywhere on the object to move it; if the mouse doesn't
        // actually move, mouseup turns this into an edit instead (editCandidate)
        drag = {
            mode: "move", startX: pt.x, startY: pt.y, editCandidate,
            origins: state.selection.map(sid => {
                const o = getObj(sid);
                return { id: sid, x: o.x, y: o.y, children: o.type === "group" ? JSON.parse(JSON.stringify(o.children)) : null };
            })
        };
        return;
    }

    // empty area: start marquee selection
    if (!e.shiftKey) { state.selection = []; state.cellSelections = []; render(); renderProperties(); }
    drag = { mode: "marquee", startX: pt.x, startY: pt.y };
});

const ALIGN_SNAP_THRESHOLD = 6;

// how far (in slide units) the mouse can move between mousedown and mouseup
// on an object before it counts as a drag-to-move rather than a click
const MOVE_CLICK_THRESHOLD = 3;

// While dragging a selection, snap its edges/center to the edges/center of other
// objects (and the slide bounds) so dashed alignment guides can be shown.
function computeAlignSnap(dx, dy, origins) {
    const movingIds = new Set(origins.map(o => o.id));
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    origins.forEach(o => {
        const obj = getObj(o.id);
        if (!obj) return;
        const x = o.x + dx, y = o.y + dy;
        left = Math.min(left, x); right = Math.max(right, x + obj.w);
        top = Math.min(top, y); bottom = Math.max(bottom, y + obj.h);
    });
    if (!isFinite(left)) return { dx, dy, guideV: null, guideH: null };
    const centerX = (left + right) / 2, centerY = (top + bottom) / 2;

    const vCandidates = [0, SLIDE_W, SLIDE_W / 2];
    const hCandidates = [0, SLIDE_H, SLIDE_H / 2];
    curSlide().objects.forEach(o => {
        if (movingIds.has(o.id)) return;
        vCandidates.push(o.x, o.x + o.w, o.x + o.w / 2);
        hCandidates.push(o.y, o.y + o.h, o.y + o.h / 2);
    });

    let bestVDist = ALIGN_SNAP_THRESHOLD + 1, snapDx = 0, guideV = null;
    [left, right, centerX].forEach(edgeVal => {
        vCandidates.forEach(c => {
            const d = Math.abs(edgeVal - c);
            if (d < bestVDist) { bestVDist = d; snapDx = c - edgeVal; guideV = c; }
        });
    });

    let bestHDist = ALIGN_SNAP_THRESHOLD + 1, snapDy = 0, guideH = null;
    [top, bottom, centerY].forEach(edgeVal => {
        hCandidates.forEach(c => {
            const d = Math.abs(edgeVal - c);
            if (d < bestHDist) { bestHDist = d; snapDy = c - edgeVal; guideH = c; }
        });
    });

    return {
        dx: bestVDist <= ALIGN_SNAP_THRESHOLD ? dx + snapDx : dx,
        dy: bestHDist <= ALIGN_SNAP_THRESHOLD ? dy + snapDy : dy,
        guideV: bestVDist <= ALIGN_SNAP_THRESHOLD ? guideV : null,
        guideH: bestHDist <= ALIGN_SNAP_THRESHOLD ? guideH : null,
    };
}

function drawAlignmentGuides(guideV, guideH) {
    if (guideV != null) {
        const line = document.createElementNS(svgNS, "line");
        applyAttrs(line, { x1: guideV, y1: -1000, x2: guideV, y2: SLIDE_H + 1000,
            stroke: "#ff4d8d", "stroke-width": 1, "stroke-dasharray": "4,3", "pointer-events": "none", class: "align-guide" });
        svg.appendChild(line);
    }
    if (guideH != null) {
        const line = document.createElementNS(svgNS, "line");
        applyAttrs(line, { x1: -1000, y1: guideH, x2: SLIDE_W + 1000, y2: guideH,
            stroke: "#ff4d8d", "stroke-width": 1, "stroke-dasharray": "4,3", "pointer-events": "none", class: "align-guide" });
        svg.appendChild(line);
    }
}

window.addEventListener("mousemove", (e) => {
    // Border paint hover: update highlighted border segment (even without a drag)
    if (borderPaintState.active) {
        const tableId = state.selection.length === 1 ? state.selection[0] : null;
        const tableObj = tableId ? getObj(tableId) : null;
        if (tableObj && tableObj.tableCols) {
            const pt2 = svgPoint(e);
            const inBounds = pt2.x >= tableObj.x - BORDER_HIT_TOL && pt2.x <= tableObj.x + tableObj.w + BORDER_HIT_TOL &&
                             pt2.y >= tableObj.y - BORDER_HIT_TOL && pt2.y <= tableObj.y + tableObj.h + BORDER_HIT_TOL;
            const newKey = inBounds ? borderAtPoint(tableObj, pt2.x, pt2.y) : null;
            const oldKey = borderPaintHover ? borderPaintHover.key : null;
            if (newKey !== oldKey) {
                borderPaintHover = newKey ? { key: newKey, tableId } : null;
                document.body.style.cursor = borderPaintHover ? "crosshair" : "";
                updateBorderPaintOverlay();
            }
        } else if (borderPaintHover) {
            borderPaintHover = null;
            document.body.style.cursor = "";
            updateBorderPaintOverlay();
        }
    }

    // Freeform pen drawing: update cursor position and redraw preview
    if (penDraw) {
        const pf = svgPoint(e);
        penDraw.curX = pf.x; penDraw.curY = pf.y;
        if (penDraw.buttonDown && Math.hypot(pf.x - penDraw.downX, pf.y - penDraw.downY) > PEN_DRAG_THRESH)
            penDraw.isDragging = true;
        drawFreeformPreview();
        return;
    }

    // Crop mode drag
    if (cropState && cropState.edge) {
        const obj = getObj(cropState.id);
        if (obj) {
            const pt = svgPoint(e);
            const dx = pt.x - cropState.startPt.x;
            const dy = pt.y - cropState.startPt.y;
            const sc = cropState.startCrop;
            const crop = Object.assign({}, sc);
            const MARGIN = 5; // minimum crop in %
            if (cropState.edge === "top") {
                crop.top = Math.max(0, Math.min(100 - MARGIN - sc.bottom, sc.top + (dy / obj.h) * 100));
            } else if (cropState.edge === "bottom") {
                crop.bottom = Math.max(0, Math.min(100 - MARGIN - sc.top, sc.bottom - (dy / obj.h) * 100));
            } else if (cropState.edge === "left") {
                crop.left = Math.max(0, Math.min(100 - MARGIN - sc.right, sc.left + (dx / obj.w) * 100));
            } else if (cropState.edge === "right") {
                crop.right = Math.max(0, Math.min(100 - MARGIN - sc.left, sc.right - (dx / obj.w) * 100));
            }
            crop.top = Math.round(crop.top); crop.bottom = Math.round(crop.bottom);
            crop.left = Math.round(crop.left); crop.right = Math.round(crop.right);
            obj.imgCrop = crop;
            document.getElementById("picCropTop").value = crop.top;
            document.getElementById("picCropRight").value = crop.right;
            document.getElementById("picCropBottom").value = crop.bottom;
            document.getElementById("picCropLeft").value = crop.left;
            render();
        }
        return;
    }

    if (!drag) return;
    const pt = svgPoint(e);

    // Border paint drag: paint each new border segment the cursor passes over
    if (drag.mode === "border-paint") {
        const obj = getObj(drag.tableId);
        if (obj) {
            const border = borderAtPoint(obj, pt.x, pt.y);
            if (border && border !== drag.lastKey) {
                if (!obj.customBorders) obj.customBorders = {};
                obj.customBorders[border] = { color: borderPaintState.color, width: borderPaintState.width, dash: borderPaintState.dash };
                drag.lastKey = border;
                render();
            }
        }
        return;
    }

    // Cell range selection drag: extend rectangle selection as cursor moves
    if (drag.mode === "table-cell-select") {
        const obj = getObj(drag.tableId);
        if (obj) {
            const cell = cellAtPoint(obj, pt.x, pt.y);
            if (cell) {
                const newSel = cellRectSelection(obj, drag.startR, drag.startC, cell.r, cell.c);
                if (newSel.join(",") !== state.cellSelections.join(",")) {
                    state.cellSelections = newSel;
                    render(); renderProperties();
                }
            }
        }
        return;
    }

    if (drag.mode === "draw") {
        const x = Math.min(drag.startX, pt.x), y = Math.min(drag.startY, pt.y);
        const w = Math.abs(pt.x - drag.startX), h = Math.abs(pt.y - drag.startY);
        drawPreview(x, y, w, h);
        if (drag.tool === "line" || drag.tool === "arrow") drawConnectionPoints(null, pt);
        return;
    }

    if (drag.mode === "move") {
        let dx = pt.x - drag.startX, dy = pt.y - drag.startY;
        const snap = computeAlignSnap(dx, dy, drag.origins);
        dx = snap.dx; dy = snap.dy;
        drag.origins.forEach(o => {
            const obj = getObj(o.id);
            if (!obj) return;
            obj.x = o.x + dx; obj.y = o.y + dy;
            if (obj.type === "group" && o.children) {
                obj.children.forEach((c, i) => {
                    c.x = o.children[i].x + dx; c.y = o.children[i].y + dy;
                });
            }
        });
        render();
        drawAlignmentGuides(snap.guideV, snap.guideH);
        return;
    }

    if (drag.mode === "resize") {
        const guides = resizeObject(drag, pt);
        render();
        drawAlignmentGuides(guides.guideV, guides.guideH);
        const obj = getObj(drag.id);
        if (obj && (obj.type === "line" || obj.type === "arrow")) {
            const p1Handle = obj.diag ? "nw" : "sw", p2Handle = obj.diag ? "se" : "ne";
            if (drag.handle === p1Handle || drag.handle === p2Handle) drawConnectionPoints(obj.id, pt);
        }
        return;
    }

    if (drag.mode === "col-divider" || drag.mode === "row-divider") {
        const obj = getObj(drag.id);
        if (!obj) return;
        const MIN = 20;
        if (drag.mode === "col-divider") {
            const dx = pt.x - drag.startX;
            const i = drag.index;
            const total = drag.startColWidths[i] + drag.startColWidths[i + 1];
            let w0 = drag.startColWidths[i] + dx;
            w0 = Math.max(MIN, Math.min(total - MIN, w0));
            obj.colWidths[i] = w0;
            obj.colWidths[i + 1] = total - w0;
        } else {
            const dy = pt.y - drag.startY;
            const i = drag.index;
            const total = drag.startRowHeights[i] + drag.startRowHeights[i + 1];
            let h0 = drag.startRowHeights[i] + dy;
            h0 = Math.max(MIN, Math.min(total - MIN, h0));
            obj.rowHeights[i] = h0;
            obj.rowHeights[i + 1] = total - h0;
        }
        layoutTable(obj);
        render();
        return;
    }

    if (drag.mode === "rotate") {
        const a1 = Math.atan2(drag.startY - drag.cy, drag.startX - drag.cx);
        const a2 = Math.atan2(pt.y - drag.cy, pt.x - drag.cx);
        const obj = getObj(drag.id);
        if (obj) {
            let rotation = Math.round(drag.startRotation + (a2 - a1) * 180 / Math.PI);
            // snap to axis-aligned angles (0/90/180/270/360) when close
            const ROTATE_SNAP = 5;
            const normalized = ((rotation % 360) + 360) % 360;
            const nearest = Math.round(normalized / 90) * 90;
            if (Math.abs(normalized - nearest) <= ROTATE_SNAP) {
                rotation += (nearest === 360 ? 0 : nearest) - normalized;
            }
            obj.rotation = rotation;
        }
        render(); renderProperties();
        return;
    }

    if (drag.mode === "adjust") {
        const obj = getObj(drag.id);
        if (obj) {
            const local = screenToLocal(obj, pt);
            const minDim = Math.min(obj.w, obj.h) || 1;
            obj.cornerRadius = Math.max(0, Math.min(0.5, (local.x - obj.x) / minDim));
            render();
        }
        return;
    }

    if (drag.mode === "vertex") {
        const obj = getObj(drag.id);
        if (obj && obj.customPoints && obj.customPoints[drag.index]) {
            const local = screenToLocal(obj, pt);
            obj.customPoints[drag.index] = {
                x: obj.w ? (local.x - obj.x) / obj.w : 0,
                y: obj.h ? (local.y - obj.y) / obj.h : 0
            };
            render();
        }
        return;
    }

    if (drag.mode === "marquee") {
        const x = Math.min(drag.startX, pt.x), y = Math.min(drag.startY, pt.y);
        const w = Math.abs(pt.x - drag.startX), h = Math.abs(pt.y - drag.startY);
        drawMarquee(x, y, w, h);
        return;
    }
});

window.addEventListener("mouseup", (e) => {
    // Crop mode: end drag
    if (cropState && cropState.edge) {
        cropState.edge = null;
        cropState.startPt = null;
        cropState.startCrop = null;
        pushHistory(true);
        return;
    }
    // Freeform pen: finalize the point on mouseup (smooth if dragged, corner otherwise)
    if (penDraw && penDraw.buttonDown) {
        const pu = svgPoint(e);
        penDraw.anchors.push({
            x: penDraw.downX, y: penDraw.downY,
            smooth: penDraw.isDragging,
            hx: penDraw.isDragging ? pu.x - penDraw.downX : 0,
            hy: penDraw.isDragging ? pu.y - penDraw.downY : 0,
        });
        penDraw.buttonDown = false;
        penDraw.isDragging = false;
        penDraw.curX = pu.x; penDraw.curY = pu.y;
        drawFreeformPreview();
        return;
    }

    if (!drag) return;
    const pt = svgPoint(e);

    if (drag.mode === "draw") {
        const x = Math.min(drag.startX, pt.x), y = Math.min(drag.startY, pt.y);
        let w = Math.abs(pt.x - drag.startX), h = Math.abs(pt.y - drag.startY);
        if (w < 4 && h < 4) { w = 120; h = drag.tool === "line" || drag.tool === "arrow" ? 0 : (drag.tool === "text" ? 100 : 90); }
        if (drag.tool === "text" && w === 120) w = 280;
        const obj = makeObject(drag.tool, x, y, Math.max(w, 4), Math.max(h, drag.tool === "line" || drag.tool === "arrow" ? 0 : 4));
        if (drag.tool === "line" || drag.tool === "arrow" && h === 0) obj.h = h;
        if (obj.type === "line" || obj.type === "arrow") {
            // a drag where start/end move along the same diagonal direction
            // (both increasing or both decreasing) traces the box's main
            // diagonal (x,y)->(x+w,y+h); otherwise the anti-diagonal
            const dx = pt.x - drag.startX, dy = pt.y - drag.startY;
            obj.diag = (dx >= 0) === (dy >= 0);
        }
        curSlide().objects.push(obj);

        if (obj.type === "line" || obj.type === "arrow") {
            let { p1, p2 } = lineEndpoints(obj);
            const snap1 = findConnectionSnap(p1, obj.id);
            const snap2 = findConnectionSnap(p2, obj.id);
            if (snap1) { p1 = { x: snap1.x, y: snap1.y }; obj.startConnect = { id: snap1.id, point: snap1.point }; }
            if (snap2) { p2 = { x: snap2.x, y: snap2.y }; obj.endConnect = { id: snap2.id, point: snap2.point }; }
            if (snap1 || snap2) {
                if (obj.diag) {
                    obj.x = p1.x; obj.w = p2.x - p1.x;
                    obj.y = p1.y; obj.h = p2.y - p1.y;
                } else {
                    obj.x = p1.x; obj.w = p2.x - p1.x;
                    obj.y = p2.y; obj.h = p1.y - p2.y;
                }
            }
        }

        state.selection = [obj.id];
        setTool("select");
        render(); renderProperties();
        if (drag.tool === "text") {
            const div = svg.querySelector(`.text-edit-box[data-id="${obj.id}"]`);
            if (div) enterTextEditMode(div, obj);
        }
    }

    if (drag.mode === "resize") {
        const obj = getObj(drag.id);
        if (obj && (obj.type === "line" || obj.type === "arrow")) {
            const p1Handle = obj.diag ? "nw" : "sw", p2Handle = obj.diag ? "se" : "ne";
            if (drag.handle === p1Handle || drag.handle === p2Handle) {
                const isStart = drag.handle === p1Handle;
                const { p1, p2 } = lineEndpoints(obj);
                const endpoint = isStart ? p1 : p2;
                const snap = findConnectionSnap(endpoint, obj.id);
                if (snap) {
                    if (isStart) obj.startConnect = { id: snap.id, point: snap.point };
                    else obj.endConnect = { id: snap.id, point: snap.point };
                    render(); renderProperties();
                } else {
                    if (isStart) obj.startConnect = null;
                    else obj.endConnect = null;
                }
            }
        }
    }

    if (drag.mode === "marquee") {
        const x = Math.min(drag.startX, pt.x), y = Math.min(drag.startY, pt.y);
        const w = Math.abs(pt.x - drag.startX), h = Math.abs(pt.y - drag.startY);
        if (w > 2 || h > 2) {
            state.selection = curSlide().objects.filter(o =>
                o.x >= x && o.y >= y && o.x + o.w <= x + w && o.y + o.h <= y + h
            ).map(o => o.id);
        }
        render(); renderProperties();
    }

    // a stationary click (no real drag) on an already-selected object's
    // body/text/cell enters edit mode there instead of just moving it by 0px
    if (drag.mode === "move" && drag.editCandidate) {
        const dx = pt.x - drag.startX, dy = pt.y - drag.startY;
        if (Math.abs(dx) <= MOVE_CLICK_THRESHOLD && Math.abs(dy) <= MOVE_CLICK_THRESHOLD) {
            const textObj = findObjectById(curSlide().objects, drag.editCandidate.id);
            const div = svg.querySelector(`.text-edit-box[data-id="${drag.editCandidate.id}"]`);
            if (textObj && div) enterTextEditMode(div, textObj, true, true, { x: drag.editCandidate.clientX, y: drag.editCandidate.clientY });
        }
    }

    // Cell range selection: stationary click enters text edit mode on the cell
    if (drag.mode === "table-cell-select") {
        const dx = pt.x - drag.startX, dy = pt.y - drag.startY;
        if (Math.abs(dx) <= MOVE_CLICK_THRESHOLD && Math.abs(dy) <= MOVE_CLICK_THRESHOLD && drag.editCandidate) {
            const textObj = findObjectById(curSlide().objects, drag.editCandidate.id);
            const div = svg.querySelector(`.text-edit-box[data-id="${drag.editCandidate.id}"]`);
            if (textObj && div) enterTextEditMode(div, textObj, true, true, { x: drag.editCandidate.clientX, y: drag.editCandidate.clientY });
        }
        renderProperties();
    }

    drag = null;
});

// Freeform dblclick: the second click already added an anchor via mouseup.
// Remove it if it's a near-duplicate of the previous anchor, then finish.
svg.addEventListener("dblclick", (e) => {
    if (!penDraw) return;
    e.preventDefault(); e.stopPropagation();
    const anchors = penDraw.anchors;
    if (anchors.length >= 2) {
        const a = anchors[anchors.length - 1], b = anchors[anchors.length - 2];
        if (Math.hypot(a.x - b.x, a.y - b.y) < 6) anchors.pop();
    }
    finishFreeformDraw(false);
});

// ============ Right-click formatting menu for highlighted text ============
let textContextMenu = null;

function closeTextContextMenu() {
    if (textContextMenu) { textContextMenu.remove(); textContextMenu = null; }
}
document.addEventListener("click", closeTextContextMenu);
document.addEventListener("scroll", closeTextContextMenu, true);

function showTextFormatMenu(e, div) {
    const obj = findObjectById(curSlide().objects, div.dataset.id);
    if (!obj) return;

    const menu = document.createElement("div");
    menu.className = "text-context-menu";
    menu.style.left = e.clientX + "px";
    menu.style.top = e.clientY + "px";

    // Syncs the div's HTML back into the object and re-renders. `fn` runs
    // first so execCommand-based per-selection edits land before the sync.
    const apply = (fn) => {
        div.focus();
        fn();
        obj.text = getTextBoxContent(div, obj);
        obj.field = null;
        render(); renderProperties();
    };

    const mkBtn = (label, title, onClick) => {
        const b = document.createElement("button");
        b.innerHTML = label;
        b.title = title;
        b.onmousedown = (ev) => ev.preventDefault(); // preserve text selection
        b.onclick = () => apply(onClick);
        return b;
    };

    menu.appendChild(mkBtn("<b>B</b>", "Bold", () => document.execCommand("bold")));
    menu.appendChild(mkBtn("<i>I</i>", "Italic", () => document.execCommand("italic")));
    menu.appendChild(mkBtn("<u>U</u>", "Underline", () => document.execCommand("underline")));
    menu.appendChild(mkBtn("&#8676;", "Align left", () => { obj.align = "left"; }));
    menu.appendChild(mkBtn("&#8596;", "Align center", () => { obj.align = "center"; }));
    menu.appendChild(mkBtn("&#8677;", "Align right", () => { obj.align = "right"; }));

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.title = "Text color";
    colorInput.value = obj.fontColor || "#1a1a1a";
    colorInput.onmousedown = (ev) => ev.stopPropagation();
    colorInput.oninput = () => { div.focus(); document.execCommand("foreColor", false, colorInput.value); };
    colorInput.onchange = () => apply(() => {});
    menu.appendChild(colorInput);

    const sep = document.createElement("div");
    sep.className = "text-context-menu-sep";
    menu.appendChild(sep);

    menu.appendChild(mkBtn("Cut", "Cut selection", () => document.execCommand("cut")));
    menu.appendChild(mkBtn("Copy", "Copy selection", () => document.execCommand("copy")));
    menu.appendChild(mkBtn("Delete", "Delete selection", () => document.execCommand("delete")));
    const pasteBtn = mkBtn("Paste", "Paste", () => {});
    pasteBtn.onclick = async () => {
        div.focus();
        try {
            const text = await navigator.clipboard.readText();
            document.execCommand("insertText", false, text);
        } catch {
            document.execCommand("paste");
        }
        apply(() => {});
    };
    menu.appendChild(pasteBtn);

    document.body.appendChild(menu);
    textContextMenu = menu;
}

function showShapeContextMenu(e, hasSelection) {
    const menu = document.createElement("div");
    menu.className = "shape-context-menu";
    menu.style.left = e.clientX + "px";
    menu.style.top = e.clientY + "px";

    const mkItem = (label, onClick, disabled) => {
        const b = document.createElement("button");
        b.textContent = label;
        b.disabled = !!disabled;
        b.onclick = () => { closeTextContextMenu(); onClick(); };
        return b;
    };

    const noClipboard = !clipboard || !clipboard.length;
    if (hasSelection) {
        menu.appendChild(mkItem("Cut", cutSelection));
        menu.appendChild(mkItem("Copy", copySelection));
    }
    menu.appendChild(mkItem("Paste", pasteClipboard, noClipboard));
    if (hasSelection) {
        menu.appendChild(mkItem("Duplicate", () => document.getElementById("duplicateBtn").click()));
        menu.appendChild(mkItem("Delete", () => document.getElementById("deleteBtn").click()));
    }

    document.body.appendChild(menu);
    textContextMenu = menu;
}

svg.addEventListener("contextmenu", (e) => {
    const textDiv = e.target.closest(".text-edit-box");
    if (textDiv && textDiv.contentEditable === "true") {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && textDiv.contains(sel.anchorNode)) {
            e.preventDefault();
            closeTextContextMenu();
            showTextFormatMenu(e, textDiv);
            return;
        }
    }

    e.preventDefault();
    closeTextContextMenu();

    const shapeEl = e.target.closest(".shape-el");
    if (shapeEl) {
        const id = shapeEl.dataset.id;
        if (!state.selection.includes(id)) {
            state.selection = [id];
            render(); renderProperties();
        }
        showShapeContextMenu(e, true);
    } else {
        showShapeContextMenu(e, false);
    }
});

function drawPreview(x, y, w, h) {
    const tool = drag && drag.tool;
    let el = svg.querySelector("#draw-preview");

    // for actual shape tools, render a live preview of the real shape being
    // drawn (e.g. a star outline instead of a generic dashed rectangle)
    if (tool && tool !== "text") {
        if (el && el.tagName.toLowerCase() !== "g") { el.remove(); el = null; }
        if (!el) {
            el = document.createElementNS(svgNS, "g");
            el.id = "draw-preview";
            el.setAttribute("opacity", "0.6");
            el.setAttribute("pointer-events", "none");
            svg.appendChild(el);
        }
        const isLine = tool === "line" || tool === "arrow";
        const tempObj = makeObject(tool, x, y, Math.max(w, 1), isLine ? h : Math.max(h, 1));
        const defs = svg.querySelector("defs");
        el.innerHTML = "";
        el.appendChild(renderObject(tempObj, defs, false));
        return;
    }

    if (el && el.tagName.toLowerCase() !== "rect") { el.remove(); el = null; }
    if (!el) {
        el = document.createElementNS(svgNS, "rect");
        el.id = "draw-preview";
        el.setAttribute("fill", "rgba(36,84,160,0.12)");
        el.setAttribute("stroke", "#2454a0");
        el.setAttribute("stroke-dasharray", "4 3");
        el.setAttribute("pointer-events", "none");
        svg.appendChild(el);
    }
    applyAttrs(el, { x, y, width: w, height: h });
}

function drawMarquee(x, y, w, h) {
    let el = svg.querySelector("#draw-preview");
    if (!el) {
        el = document.createElementNS(svgNS, "rect");
        el.id = "draw-preview";
        el.setAttribute("class", "marquee");
        svg.appendChild(el);
    }
    applyAttrs(el, { x, y, width: w, height: h });
}

// Measures the smallest box that can show an object's text without clipping it.
// `forWidth` (if given) is used as the wrap width when measuring required height.
function measureTextMin(obj, forWidth) {
    const text = obj.field ? fieldText(obj) : obj.text;
    if (!text) return { minW: 4, minH: 4 };
    const isShape = obj.type !== "text";
    const padX = isShape ? 12 : 8;
    const padY = 4;

    const measurer = document.createElement("div");
    measurer.style.cssText = "position:absolute; visibility:hidden; left:-9999px; top:-9999px;";
    measurer.style.fontFamily = `"${obj.fontFamily}", sans-serif`;
    measurer.style.fontSize = obj.fontSize + "px";
    measurer.style.fontWeight = obj.bold ? "bold" : "normal";
    measurer.style.fontStyle = obj.italic ? "italic" : "normal";
    document.body.appendChild(measurer);

    // minW: the width of the longest unbreakable "word" - the narrowest the
    // box can get while still being able to wrap each word onto its own line
    // (rather than requiring the whole text to fit on a single line).
    measurer.style.whiteSpace = "pre-wrap";
    measurer.style.overflowWrap = "normal";
    measurer.style.wordBreak = "normal";
    measurer.style.width = "1px";
    setTextBoxContent(measurer, obj);
    const minW = measurer.scrollWidth + padX;

    // minH: the height needed to wrap the text at the given (or minimum) width
    measurer.style.overflowWrap = "break-word";
    measurer.style.wordBreak = "break-word";
    measurer.style.width = Math.max((forWidth ?? minW) - padX, 1) + "px";
    const minH = measurer.scrollHeight + padY;

    document.body.removeChild(measurer);
    return { minW, minH };
}

function resizeObject(drag, pt) {
    const obj = getObj(drag.id);
    if (!obj) return;
    const s = drag.start;
    let dx = pt.x - drag.startX, dy = pt.y - drag.startY;
    // x/y/w/h describe the object's unrotated bounding box, but the mouse
    // movement happens in screen space, which is rotated relative to that
    // box. Rotate the drag delta back into the object's local space so
    // resize handles track the mouse correctly when the object is rotated.
    if (s.rotation) {
        const rad = -s.rotation * Math.PI / 180;
        const cos = Math.cos(rad), sin = Math.sin(rad);
        const ldx = dx * cos - dy * sin;
        const ldy = dx * sin + dy * cos;
        dx = ldx; dy = ldy;
    }
    let { x, y, w, h } = s;
    if (drag.handle.includes("e")) w = s.w + dx;
    if (drag.handle.includes("w")) { x = s.x + dx; w = s.w - dx; }
    if (drag.handle.includes("s")) h = s.h + dy;
    if (drag.handle.includes("n")) { y = s.y + dy; h = s.h - dy; }

    // Corner handles on images preserve aspect ratio
    if (obj.type === "image" && drag.handle.length === 2 && s.w !== 0 && s.h !== 0) {
        const aspect = s.w / s.h;
        const scale = Math.abs(w / s.w) > Math.abs(h / s.h) ? w / s.w : h / s.h;
        w = s.w * scale;
        h = w / aspect;
        if (drag.handle.includes("w")) x = s.x + s.w - w;
        if (drag.handle.includes("n")) y = s.y + s.h - h;
    }

    // Text-capable objects can't shrink below the size needed to show their text
    if (TEXT_CAPABLE_TYPES.includes(obj.type)) {
        let { minW, minH } = measureTextMin(obj, w);
        if (w < minW) {
            if (drag.handle.includes("w")) x = s.x + s.w - minW;
            w = minW;
            minH = measureTextMin(obj, w).minH;
        }
        if (h < minH) {
            if (drag.handle.includes("n")) y = s.y + s.h - minH;
            h = minH;
        }
    }

    if (w < 4) w = 4;
    if (h < 4 && obj.type !== "line" && obj.type !== "arrow") h = 4;

    // Snap the edges being dragged to nearby objects' edges/centers and the slide bounds
    let guideV = null, guideH = null;
    const vCandidates = [0, SLIDE_W, SLIDE_W / 2];
    const hCandidates = [0, SLIDE_H, SLIDE_H / 2];
    curSlide().objects.forEach(o => {
        if (o.id === obj.id) return;
        vCandidates.push(o.x, o.x + o.w, o.x + o.w / 2);
        hCandidates.push(o.y, o.y + o.h, o.y + o.h / 2);
        // also snap so the resized box ends up the same width/height as this object
        if (drag.handle.includes("e")) vCandidates.push(x + o.w);
        if (drag.handle.includes("w")) vCandidates.push((s.x + s.w) - o.w);
        if (drag.handle.includes("s")) hCandidates.push(y + o.h);
        if (drag.handle.includes("n")) hCandidates.push((s.y + s.h) - o.h);
    });
    if (drag.handle.includes("e")) {
        let best = ALIGN_SNAP_THRESHOLD + 1;
        vCandidates.forEach(c => { const d = Math.abs((x + w) - c); if (d < best) { best = d; w = c - x; guideV = c; } });
    }
    if (drag.handle.includes("w")) {
        let best = ALIGN_SNAP_THRESHOLD + 1;
        vCandidates.forEach(c => { const d = Math.abs(x - c); if (d < best) { best = d; w = x + w - c; x = c; guideV = c; } });
    }
    if (drag.handle.includes("s")) {
        let best = ALIGN_SNAP_THRESHOLD + 1;
        hCandidates.forEach(c => { const d = Math.abs((y + h) - c); if (d < best) { best = d; h = c - y; guideH = c; } });
    }
    if (drag.handle.includes("n")) {
        let best = ALIGN_SNAP_THRESHOLD + 1;
        hCandidates.forEach(c => { const d = Math.abs(y - c); if (d < best) { best = d; h = y + h - c; y = c; guideH = c; } });
    }
    if (w < 4) w = 4;
    if (h < 4 && obj.type !== "line" && obj.type !== "arrow") h = 4;

    // When rotated, the box's center moves as w/h change, which would make
    // rotation (applied around the center) shift the anchor edge/corner on
    // screen even though its local coordinate didn't change. Re-translate
    // x/y so the corner/edge opposite the dragged handle stays put on screen,
    // matching how PowerPoint/Figma handle resizing rotated shapes.
    if (s.rotation) {
        const anchorLX = drag.handle.includes("e") ? s.x : drag.handle.includes("w") ? s.x + s.w : s.x + s.w / 2;
        const anchorLY = drag.handle.includes("s") ? s.y : drag.handle.includes("n") ? s.y + s.h : s.y + s.h / 2;
        const anchorScreen = localToScreen(s, [anchorLX, anchorLY]);
        const newAnchorLX = drag.handle.includes("e") ? x : drag.handle.includes("w") ? x + w : x + w / 2;
        const newAnchorLY = drag.handle.includes("s") ? y : drag.handle.includes("n") ? y + h : y + h / 2;
        const newAnchorScreen = localToScreen({ ...s, x, y, w, h }, [newAnchorLX, newAnchorLY]);
        x += anchorScreen[0] - newAnchorScreen[0];
        y += anchorScreen[1] - newAnchorScreen[1];
    }

    if (obj.type === "group" && drag.startChildren) {
        const scaleX = s.w !== 0 ? w / s.w : 1;
        const scaleY = s.h !== 0 ? h / s.h : 1;
        obj.children.forEach((c, i) => {
            const sc = drag.startChildren[i];
            c.x = x + (sc.x - s.x) * scaleX;
            c.y = y + (sc.y - s.y) * scaleY;
            c.w = sc.w * scaleX;
            c.h = sc.h * scaleY;
        });
        if (obj.tableCols && drag.startColWidths && drag.startRowHeights) {
            obj.colWidths = drag.startColWidths.map(v => v * scaleX);
            obj.rowHeights = drag.startRowHeights.map(v => v * scaleY);
        }
    }

    obj.x = x; obj.y = y; obj.w = w; obj.h = h;
    return { guideV, guideH };
}

// ============ Dynamic text fields (Date & Time / Slide Number) ============
function fieldText(obj, slideIndex = state.current) {
    if (obj.field === "datetime") return new Date().toLocaleDateString();
    if (obj.field === "slidenumber") return `${slideIndex + 1} / ${state.slides.length}`;
    return obj.text;
}

// ============ Text content (incl. bullet/numbered lists) ============
const LIST_ORDERED = new Set(["number", "alpha-upper", "alpha-lower", "roman-upper", "roman-lower"]);
const LIST_CSS_TYPE = {
    bullet: "disc", circle: "circle", square: "square",
    dash: "none", arrow: "none", check: "none", star: "none",
    number: "decimal", "alpha-upper": "upper-alpha", "alpha-lower": "lower-alpha",
    "roman-upper": "upper-roman", "roman-lower": "lower-roman",
};
const LIST_ICONS = {
    bullet: "#icon-list-bullet", number: "#icon-list-number",
    circle: "#icon-list-bullet", square: "#icon-list-bullet",
    dash: "#icon-list-bullet", arrow: "#icon-list-bullet",
    check: "#icon-list-bullet", star: "#icon-list-bullet",
    "alpha-upper": "#icon-list-number", "alpha-lower": "#icon-list-number",
    "roman-upper": "#icon-list-number", "roman-lower": "#icon-list-number",
};

function createListBlock(type) {
    const tag = LIST_ORDERED.has(type) ? "ol" : "ul";
    const el = document.createElement(tag);
    el.dataset.listType = type;
    el.style.margin = "0";
    el.style.paddingLeft = "1.4em";
    return el;
}

function setTextBoxContent(div, obj, slideIndex = state.current) {
    div.innerHTML = "";
    const text = obj.field ? fieldText(obj, slideIndex) : obj.text;
    if (obj.list && obj.list !== "none") {
        // Normalize: <br> tags left over from a previous un-listing count as line breaks
        const lines = (text || "").replace(/<br\s*\/?>/gi, "\n").split("\n");
        const lineTypes = obj.paragraphListTypes && obj.paragraphListTypes.length === lines.length
            ? obj.paragraphListTypes
            : lines.map(() => obj.list);
        const commentState = { inBlockComment: false };
        const lineIndents = obj.paragraphIndents && obj.paragraphIndents.length === lines.length
            ? obj.paragraphIndents : lines.map(() => 0);
        let i = 0;
        while (i < lines.length) {
            const curType = lineTypes[i] || obj.list;
            const block = createListBlock(curType);
            while (i < lines.length && (lineTypes[i] || obj.list) === curType) {
                const li = document.createElement("li");
                if (obj.isCode) li.innerHTML = codeLineToHtml(lines[i], obj.codeLang, commentState);
                else li.innerHTML = lines[i];
                const indent = lineIndents[i] || 0;
                if (indent > 0) { li.dataset.indent = String(indent); li.style.paddingLeft = (indent * 1.4) + "em"; }
                block.appendChild(li);
                i++;
            }
            div.appendChild(block);
        }
        return;
    } else if (obj.isCode) {
        setCodeLinesHtml(div, (text || "").split("\n"), obj.codeLang);
    } else if (obj.isEquation) {
        renderEquation(div, text, obj.rawTex);
    } else {
        div.innerHTML = text || "";
    }
}

// Reads back a code block's plain text after editing, turning <br> and
// block-level (<div>/<p>) line breaks - which contentEditable inserts when
// the user presses Enter - back into "\n" so multi-line code is preserved.
function getCodeText(div) {
    const lines = [];
    let current = "";
    const flush = () => { lines.push(current); current = ""; };
    function walk(node) {
        if (node.nodeType === Node.TEXT_NODE) { current += node.textContent; return; }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (node.tagName === "BR") { flush(); return; }
        const isBlock = node.tagName === "DIV" || node.tagName === "P";
        if (isBlock && current !== "") flush();
        Array.from(node.childNodes).forEach(walk);
        if (isBlock) flush();
    }
    Array.from(div.childNodes).forEach(walk);
    if (current !== "" || lines.length === 0) lines.push(current);
    return lines.join("\n");
}

// Returns the editable content of a text box. For regular text boxes this
// is inline HTML (so per-selection formatting like bold/italic/color from
// the right-click menu survives), while code blocks stay plain text.
function getTextBoxContent(div, obj) {
    if (obj.list && obj.list !== "none") {
        const blocks = [...div.querySelectorAll("ul,ol")];
        if (blocks.length === 0) return div.innerHTML || "";
        const lines = [], types = [], indents = [];
        for (const block of blocks) {
            const t = block.dataset.listType || (block.tagName === "OL" ? "number" : "bullet");
            for (const li of block.children) {
                if (li.tagName === "LI") {
                    lines.push(obj.isCode ? getCodeText(li) : li.innerHTML);
                    types.push(t);
                    indents.push(parseInt(li.dataset.indent || "0", 10));
                }
            }
        }
        const allSame = types.every(t => t === types[0]);
        if (allSame) {
            if (types[0] && types[0] !== "none") obj.list = types[0]; // never downgrade to "none"
            delete obj.paragraphListTypes;
        } else {
            obj.paragraphListTypes = types;
        }
        if (indents.some(n => n > 0)) { obj.paragraphIndents = indents; }
        else { delete obj.paragraphIndents; }
        return lines.join("\n");
    }
    if (obj.isCode) return getCodeLines(div).join("\n");
    if (obj.isEquation) return div.textContent;
    return div.innerHTML;
}

// ============ Double-click to edit text ============
// `deferFocus` controls whether this function takes focus itself (deferred to
// the next tick, to dodge a spurious immediate blur inside SVG foreignObjects)
// or leaves focus alone because a native event (e.g. mousedown on the text)
// is about to focus the element and place the caret/selection itself - taking
// focus again here would clobber that native click-drag text selection.
function enterTextEditMode(div, obj, skipInitialSelectAll = false, deferFocus = true, caretPoint = null) {
    // Guard: if already in edit mode, avoid adding duplicate event listeners.
    // Just re-focus and optionally re-select – handlers are already wired up.
    if (div.contentEditable === "true") {
        if (deferFocus) {
            setTimeout(() => {
                div.focus();
                if (!skipInitialSelectAll) document.execCommand("selectAll", false, null);
            }, 0);
        }
        return;
    }
    if (obj.field) {
        obj.text = fieldText(obj);
        obj.field = null;
        setTextBoxContent(div, obj);
    }
    if (obj.isEquation) {
        // swap the rendered KaTeX markup for the raw source so it can be edited as text
        div.textContent = obj.text;
    }
    // Apply spellcheck BEFORE making the element editable so the browser
    // reads the correct state when it first activates the edit context.
    div.setAttribute("spellcheck", spellcheckEnabled ? "true" : "false");
    div.setAttribute("autocorrect", spellcheckEnabled ? "on" : "off");
    div.setAttribute("autocapitalize", spellcheckEnabled ? "sentences" : "off");
    div.contentEditable = "true";
    div.style.cursor = "text";

    const isPlainCode = obj.isCode && (!obj.list || obj.list === "none");

    // keep the "Content" textarea in the properties panel live while typing,
    // without rebuilding the panel (which would steal focus from the canvas)
    const syncContent = () => {
        if (isPlainCode) {
            // re-highlight code as the user types, preserving the caret
            const pos = getCodeCaretPos(div);
            const lines = getCodeLines(div);
            obj.text = lines.join("\n");
            setCodeLinesHtml(div, lines, obj.codeLang);
            if (pos) setCodeCaretPos(div, pos);
        } else {
            obj.text = getTextBoxContent(div, obj);
        }
        const ta = panel.querySelector("textarea");
        if (ta && document.activeElement !== ta) ta.value = obj.text;
    };

    const finish = () => {
        obj.text = getTextBoxContent(div, obj);
        div.contentEditable = "false";
        div.removeEventListener("blur", finish);
        div.removeEventListener("input", syncContent);
        render(); renderProperties();
    };
    const BRACKET_OPEN  = { "(": ")", "[": "]", "{": "}", '"': '"', "`": "`" };
    const BRACKET_CLOSE = new Set([")", "]", "}", '"', "`"]);

    // fn(pos, lines) → returns new caret pos {line,offset} or undefined to keep original
    function codeEdit(fn) {
        const pos = getCodeCaretPos(div);
        if (!pos) return false;
        const lines = getCodeLines(div);
        const newPos = fn(pos, lines);
        obj.text = lines.join("\n");
        setCodeLinesHtml(div, lines, obj.codeLang);
        // Always restore caret AFTER the HTML rebuild so it isn't wiped
        setCodeCaretPos(div, newPos !== undefined ? newPos : pos);
        const ta = panel.querySelector("textarea");
        if (ta && document.activeElement !== ta) ta.value = obj.text;
        return true;
    }

    div.addEventListener("keydown", (ke) => {
        ke.stopPropagation();
        if (ke.key === "Escape") { div.blur(); return; }

        if (!isPlainCode) {
            const inList = !!(obj.list && obj.list !== "none");

            // Markdown-style auto-list: typing "+" / "1." / "a)" at the start of
            // the current line then pressing Space triggers a list conversion.
            if (ke.key === " " && !ke.ctrlKey && !ke.metaKey && !ke.shiftKey) {
                const sel0 = window.getSelection();
                if (sel0 && sel0.rangeCount > 0 && sel0.getRangeAt(0).collapsed) {
                    const r0 = sel0.getRangeAt(0);
                    // Walk up to find the enclosing block (li, div, p) or stop at div
                    let bl = r0.startContainer;
                    while (bl && bl !== div && !["LI","DIV","P"].includes(bl.nodeName))
                        bl = bl.parentNode;
                    const blockNode = (bl && bl !== div) ? bl : null;
                    try {
                        const r2 = document.createRange();
                        r2.setStart(blockNode || div, 0);
                        r2.setEnd(r0.startContainer, r0.startOffset);
                        let txt = r2.toString();
                        // In plain-text mode (no block node), only consider the text after the last newline
                        if (!blockNode && txt.includes("\n")) txt = txt.split("\n").pop();
                        const autoType = txt === "+"                  ? "bullet"
                            : /^[0-9]+\.$/.test(txt)                 ? "number"
                            : /^[a-zA-Z]\)$/.test(txt)               ? "alpha-lower"
                            : null;
                        if (autoType) {
                            ke.preventDefault();
                            sel0.removeAllRanges(); sel0.addRange(r2);
                            document.execCommand("delete");
                            applyListStyle(autoType);
                            return;
                        }
                    } catch {}
                }
            }

            if (ke.key === "Tab" && !ke.ctrlKey && !ke.metaKey) {
                ke.preventDefault();
                if (inList) {
                    // Tab / Shift+Tab: change indent level of current list item
                    const sel = window.getSelection();
                    if (sel && sel.rangeCount > 0 && sel.getRangeAt(0).collapsed) {
                        let li = sel.getRangeAt(0).startContainer;
                        while (li && li !== div) { if (li.tagName === "LI") break; li = li.parentNode; }
                        if (li && li.tagName === "LI") {
                            const cur = parseInt(li.dataset.indent || "0", 10);
                            const next = ke.shiftKey ? Math.max(0, cur - 1) : Math.min(4, cur + 1);
                            if (next === 0) { delete li.dataset.indent; li.style.paddingLeft = ""; }
                            else { li.dataset.indent = String(next); li.style.paddingLeft = (next * 1.4) + "em"; }
                            syncContent();
                            return;
                        }
                    }
                }
                insertTextAtCaret("\t"); syncContent();
                return;
            }

            // ── Backspace at start of a list item ─────────────────────────────────
            if (ke.key === "Backspace" && inList) {
                const sel0 = window.getSelection();
                if (sel0 && sel0.rangeCount > 0 && sel0.getRangeAt(0).collapsed) {
                    const r0 = sel0.getRangeAt(0);
                    let li0 = r0.startContainer;
                    while (li0 && li0 !== div) { if (li0.tagName === "LI") break; li0 = li0.parentNode; }
                    if (li0 && li0.tagName === "LI") {
                        // Are we at the very start of this li?
                        const testR = document.createRange();
                        testR.selectNodeContents(li0);
                        testR.setEnd(r0.startContainer, r0.startOffset);
                        if (testR.toString().length === 0 && testR.cloneContents().textContent === "") {
                            ke.preventDefault();
                            const allLis0 = [...div.querySelectorAll("li")];
                            const liIdx0 = allLis0.indexOf(li0);
                            if (liIdx0 === 0) {
                                // First item → de-list it (remove bullet, keep text)
                                const content0 = li0.innerHTML.replace(/^<br\s*\/?>$/i, "");
                                const listEl0 = li0.closest("ul,ol");
                                li0.remove();
                                if (listEl0 && !listEl0.querySelector("li")) listEl0.remove();
                                if (!div.querySelector("li")) {
                                    obj.list = "none";
                                    delete obj.paragraphListTypes;
                                    delete obj.paragraphIndents;
                                    div.innerHTML = (content0 ? content0 + (div.innerHTML ? "<br>" + div.innerHTML : "") : div.innerHTML);
                                } else {
                                    if (content0) {
                                        const br0 = document.createElement("br");
                                        div.insertBefore(br0, div.firstChild);
                                        const tmp0 = document.createElement("span");
                                        tmp0.innerHTML = content0;
                                        while (tmp0.firstChild) div.insertBefore(tmp0.firstChild, br0);
                                    }
                                }
                                const rr = document.createRange();
                                rr.setStart(div.firstChild || div, 0);
                                rr.collapse(true);
                                sel0.removeAllRanges(); sel0.addRange(rr);
                            } else {
                                // Merge with previous li
                                const prevLi = allLis0[liIdx0 - 1];
                                const mergeContent = li0.innerHTML.replace(/^<br\s*\/?>$/i, "");
                                const snapNode = prevLi.lastChild;
                                if (mergeContent) {
                                    const tmp1 = document.createElement("span");
                                    tmp1.innerHTML = mergeContent;
                                    while (tmp1.firstChild) prevLi.appendChild(tmp1.firstChild);
                                }
                                li0.remove();
                                const rr2 = document.createRange();
                                if (snapNode) {
                                    if (snapNode.nodeType === Node.TEXT_NODE) rr2.setStart(snapNode, snapNode.textContent.length);
                                    else rr2.setStartAfter(snapNode);
                                } else { rr2.setStart(prevLi, 0); }
                                rr2.collapse(true);
                                sel0.removeAllRanges(); sel0.addRange(rr2);
                            }
                            syncContent();
                            return;
                        }
                    }
                }
            }

            // ── Enter: always handle manually in list mode to avoid browser <div> creation ──
            if (ke.key === "Enter" && !ke.shiftKey && !ke.ctrlKey && !ke.metaKey) {
                if (inList) {
                    ke.preventDefault();
                    const sel = window.getSelection();
                    if (!sel || sel.rangeCount === 0) return;
                    const range = sel.getRangeAt(0);
                    if (!range.collapsed) range.deleteContents();

                    let li = range.startContainer;
                    while (li && li !== div) { if (li.tagName === "LI") break; li = li.parentNode; }

                    if (!li || li.tagName !== "LI") {
                        // Cursor not in any <li> — shouldn't normally happen
                        document.execCommand("insertLineBreak");
                        syncContent();
                        return;
                    }

                    if (!li.textContent.trim() && !li.querySelector("img")) {
                        // Empty item → exit list (de-list this item, keep cursor here)
                        const allLisE = [...div.querySelectorAll("li")];
                        const liIdxE = allLisE.indexOf(li);
                        const curTypesE = allLisE.map(el => el.closest("ul,ol")?.dataset.listType || obj.list || "bullet");
                        const newTypesE = [...curTypesE];
                        newTypesE[liIdxE] = "none";

                        if (newTypesE.every(t => t === "none")) {
                            const lineHtmlsE = allLisE.map(el => el.innerHTML.replace(/^<br\s*\/?>$/i, ""));
                            div.innerHTML = lineHtmlsE.join("<br>");
                            obj.list = "none";
                            delete obj.paragraphListTypes;
                            delete obj.paragraphIndents;
                            // Cursor at the converted line position
                            let node = div.childNodes[liIdxE * 2] || div.lastChild || div;
                            const re = document.createRange();
                            re.setStart(node, 0); re.collapse(true);
                            sel.removeAllRanges(); sel.addRange(re);
                            syncContent();
                            return;
                        }

                        const itemsE = allLisE.map((el, i) => ({ html: el.innerHTML.replace(/^<br\s*\/?>$/i, ""), type: newTypesE[i] }));
                        div.innerHTML = "";
                        let bi = 0;
                        while (bi < itemsE.length) {
                            const cType = itemsE[bi].type;
                            const block = createListBlock(cType);
                            while (bi < itemsE.length && itemsE[bi].type === cType) {
                                const newLiE = document.createElement("li");
                                newLiE.innerHTML = itemsE[bi].html;
                                block.appendChild(newLiE);
                                bi++;
                            }
                            div.appendChild(block);
                        }
                        const tcE = {};
                        newTypesE.forEach(t => { tcE[t] = (tcE[t] || 0) + 1; });
                        const nnE = Object.entries(tcE).filter(([t]) => t !== "none");
                        obj.list = nnE.length ? nnE.sort((a, b) => b[1] - a[1])[0][0] : (obj.list && obj.list !== "none" ? obj.list : "bullet");
                        const convLi = div.querySelectorAll("li")[liIdxE];
                        if (convLi) {
                            const re2 = document.createRange();
                            re2.setStart(convLi, 0); re2.collapse(true);
                            sel.removeAllRanges(); sel.addRange(re2);
                        }
                        syncContent();
                        return;
                    }

                    // Non-empty item → split at cursor, create new <li>
                    const newLi = document.createElement("li");
                    if (li.dataset.indent) { newLi.dataset.indent = li.dataset.indent; newLi.style.paddingLeft = li.style.paddingLeft; }
                    const afterRange = document.createRange();
                    afterRange.setStart(range.startContainer, range.startOffset);
                    afterRange.setEnd(li, li.childNodes.length);
                    const frag = afterRange.extractContents();
                    if (frag.hasChildNodes()) newLi.appendChild(frag);
                    li.after(newLi);

                    const re3 = document.createRange();
                    const fc = newLi.firstChild;
                    if (fc && fc.nodeType === Node.TEXT_NODE) re3.setStart(fc, 0);
                    else if (fc) re3.setStart(fc, 0);
                    else re3.setStart(newLi, 0);
                    re3.collapse(true);
                    sel.removeAllRanges(); sel.addRange(re3);
                    syncContent();
                    return;
                }
                // non-list: fall through to browser default
                return;
            }

            return;
        }

        // Tab → literal tab
        if (ke.key === "Tab") {
            ke.preventDefault();
            codeEdit((pos, lines) => {
                const line = lines[pos.line] || "";
                lines[pos.line] = line.slice(0, pos.offset) + "\t" + line.slice(pos.offset);
                return { line: pos.line, offset: pos.offset + 1 };
            });
            return;
        }

        if (ke.ctrlKey || ke.metaKey || ke.altKey) return;

        // Backspace: delete matching pair when cursor sits between them (e.g. {|})
        if (ke.key === "Backspace") {
            const peekPos = getCodeCaretPos(div);
            if (peekPos) {
                const peekLines = getCodeLines(div);
                const peekLine = peekLines[peekPos.line] || "";
                const prev = peekLine[peekPos.offset - 1];
                const next = peekLine[peekPos.offset];
                if (prev && BRACKET_OPEN[prev] && BRACKET_OPEN[prev] === next) {
                    ke.preventDefault();
                    codeEdit((pos, lines) => {
                        const line = lines[pos.line];
                        lines[pos.line] = line.slice(0, pos.offset - 1) + line.slice(pos.offset + 1);
                        return { line: pos.line, offset: pos.offset - 1 };
                    });
                    return;
                }
            }
            // Not a bracket pair — let browser delete normally; syncContent re-highlights
            return;
        }

        // Closing bracket typed when next char is the same closer → skip over it
        if (BRACKET_CLOSE.has(ke.key)) {
            codeEdit((pos, lines) => {
                const line = lines[pos.line] || "";
                const before = line.slice(0, pos.offset);
                // Dedent when only tabs precede the closer on this line
                if (/^\t+$/.test(before) && (ke.key === "}" || ke.key === ")" || ke.key === "]")) {
                    ke.preventDefault();
                    const dedented = before.slice(0, -1);
                    const after = line.slice(pos.offset);
                    lines[pos.line] = dedented + ke.key + after;
                    return { line: pos.line, offset: dedented.length + 1 };
                } else if (line[pos.offset] === ke.key) {
                    ke.preventDefault();
                    return { line: pos.line, offset: pos.offset + 1 };
                }
            });
            return;
        }

        // Auto-bracket/quote pairing
        if (ke.key in BRACKET_OPEN) {
            ke.preventDefault();
            const closer = BRACKET_OPEN[ke.key];
            codeEdit((pos, lines) => {
                const line = lines[pos.line] || "";
                const prevChar = line[pos.offset - 1];
                if ((ke.key === '"' || ke.key === "`") && prevChar === "\\") {
                    lines[pos.line] = line.slice(0, pos.offset) + ke.key + line.slice(pos.offset);
                } else {
                    lines[pos.line] = line.slice(0, pos.offset) + ke.key + closer + line.slice(pos.offset);
                }
                return { line: pos.line, offset: pos.offset + 1 };
            });
            return;
        }

        // Enter: auto-indent + smart bracket expansion
        if (ke.key === "Enter") {
            ke.preventDefault();
            codeEdit((pos, lines) => {
                const line = lines[pos.line] || "";
                const before = line.slice(0, pos.offset);
                const after  = line.slice(pos.offset);
                const indent = (line.match(/^[ \t]*/) || [""])[0];
                const trimmedBefore = before.trimEnd();
                const opensBlock = /[{(\[]$/.test(trimmedBefore);
                const closesImmediately = opensBlock && /^[})\]]/.test(after.trimStart());
                if (closesImmediately) {
                    const newIndent = indent + "\t";
                    const closerPart = after.trimStart();
                    lines.splice(pos.line, 1, before, newIndent, indent + closerPart);
                    return { line: pos.line + 1, offset: newIndent.length };
                } else {
                    const opensAny = /[{([:]$/.test(trimmedBefore);
                    const newIndent = indent + (opensAny ? "\t" : "");
                    lines.splice(pos.line, 1, before, newIndent + after);
                    return { line: pos.line + 1, offset: newIndent.length };
                }
            });
            return;
        }
    });
    if (isPlainCode) {
        div.addEventListener("paste", (pe) => {
            pe.preventDefault();
            const text = pe.clipboardData.getData("text/plain");
            document.execCommand("insertText", false, text);
        });
    }
    div.addEventListener("input", syncContent);

    if (!deferFocus) {
        div.addEventListener("blur", finish);
        return;
    }

    // Focusing an element inside an SVG foreignObject can trigger a spurious
    // immediate blur in the same tick, so defer focus/selection and attach
    // the blur handler only after focus has actually settled.
    setTimeout(() => {
        div.focus();
        let placedCaret = false;
        if (isPlainCode) {
            // Always resume at the end of the last line so the user can
            // immediately continue typing where they left off.
            const lines = getCodeLines(div);
            const lastLine = Math.max(0, lines.length - 1);
            setCodeCaretPos(div, { line: lastLine, offset: (lines[lastLine] || "").length });
            placedCaret = true;
        } else if (caretPoint && document.caretRangeFromPoint) {
            const range = document.caretRangeFromPoint(caretPoint.x, caretPoint.y);
            if (range && div.contains(range.startContainer)) {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                placedCaret = true;
            }
        }
        if (!placedCaret && !skipInitialSelectAll) document.execCommand("selectAll", false, null);
        div.addEventListener("blur", finish);
    }, 0);
}

// ============ Type-to-edit: select an object, then start typing ============
// When exactly one text-capable object (or a single selected table cell) is
// selected and no input/textarea/contentEditable has focus, pressing a
// printable key (or Backspace) jumps straight into edit mode for that
// object's text, replacing its current content with what was typed.
document.addEventListener("keydown", (e) => {
    const active = document.activeElement;
    if (active && (active.isContentEditable || active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) return;
    if (state.tool !== "select") return;
    if (state.selection.length !== 1) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!(e.key.length === 1 || e.key === "Backspace")) return;

    const obj = getObj(state.selection[0]);
    if (!obj) return;

    let target = null;
    if (TEXT_CAPABLE_TYPES.includes(obj.type)) {
        target = obj;
    } else if (obj.type === "group" && obj.tableCols && state.cellSelections.length === 1) {
        const cell = findObjectById(obj.children, state.cellSelections[0]);
        if (cell) {
            const label = obj.children[obj.children.indexOf(cell) + 1];
            if (label && label.type === "text") target = label;
        }
    }
    if (!target) return;

    const div = svg.querySelector(`.text-edit-box[data-id="${target.id}"]`);
    if (!div) return;

    e.preventDefault();
    pushHistory();
    enterTextEditMode(div, target, true);
    div.focus();
    document.execCommand("selectAll", false, null);
    if (e.key === "Backspace") {
        document.execCommand("delete", false, null);
    } else {
        document.execCommand("insertText", false, e.key);
    }
});

// ============ Properties panel ============
const panel = document.getElementById("propertiesPanel");

function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const k in attrs) {
        if (k === "text") e.textContent = attrs[k];
        else if (k.startsWith("on")) e[k] = attrs[k];
        else e.setAttribute(k, attrs[k]);
    }
    children.forEach(c => e.appendChild(c));
    return e;
}

function row(labelText, ...inputs) {
    return el("div", { class: "prop-row" }, [el("label", { text: labelText }), ...inputs]);
}

function section(title, ...children) {
    return el("div", { class: "prop-section" }, [el("h3", { text: title }), ...children]);
}

// ============ Shape Styles preset gallery ============
const SHAPE_STYLE_COLORS = [
    { name: "Blue", accent: "#4472c4", light: "#dae3f3", dark: "#2e528f" },
    { name: "Orange", accent: "#ed7d31", light: "#fbe5d6", dark: "#c55a11" },
    { name: "Gray", accent: "#a5a5a5", light: "#ededed", dark: "#767171" },
    { name: "Gold", accent: "#ffc000", light: "#fff2cc", dark: "#bf8f00" },
    { name: "Green", accent: "#70ad47", light: "#e2efda", dark: "#548235" },
    { name: "Navy", accent: "#264478", light: "#d9e2f3", dark: "#1f3864" },
];

function buildShapeStylePresets() {
    const presets = [{
        name: "No Style",
        apply: o => {
            o.fill = { type: "solid", color: "#ffffff" };
            o.stroke = { color: "#1a1a1a", width: 1, dash: "solid" };
            o.shadow = false; o.glow = false;
        }
    }];
    SHAPE_STYLE_COLORS.forEach(c => {
        presets.push({
            name: c.name + " Outline",
            apply: o => {
                o.fill = { type: "solid", color: "#ffffff" };
                o.stroke = { color: c.accent, width: 2.25, dash: "solid" };
                o.shadow = false; o.glow = false;
            }
        });
        presets.push({
            name: c.name + " Fill",
            apply: o => {
                o.fill = { type: "solid", color: c.accent };
                o.stroke = { color: c.dark, width: 1, dash: "solid" };
                o.shadow = false; o.glow = false;
            }
        });
        presets.push({
            name: c.name + " Subtle Effect",
            apply: o => {
                o.fill = { type: "solid", color: c.light };
                o.stroke = { color: c.accent, width: 1, dash: "solid" };
                o.shadow = true; o.shadowColor = "#000000"; o.shadowBlur = 4;
                o.shadowDistance = 3; o.shadowAngle = 45; o.shadowOpacity = 25;
                o.glow = false;
            }
        });
        presets.push({
            name: c.name + " Intense Effect",
            apply: o => {
                o.fill = { type: "gradient", gradientType: "linear", angle: 90,
                    stops: [{ color: c.light, pos: 0 }, { color: c.accent, pos: 100 }] };
                o.stroke = { color: c.dark, width: 1, dash: "solid" };
                o.shadow = true; o.shadowColor = "#000000"; o.shadowBlur = 8;
                o.shadowDistance = 5; o.shadowAngle = 45; o.shadowOpacity = 35;
                o.glow = false;
            }
        });
    });
    return presets;
}
const SHAPE_STYLE_PRESETS = buildShapeStylePresets();

function buildShapeStylesSection(obj, multi) {
    const targets = multi || [obj];
    const grid = el("div", { class: "style-swatch-grid" });
    SHAPE_STYLE_PRESETS.forEach(preset => {
        const swatch = el("button", { class: "style-swatch", title: preset.name });
        const preview = JSON.parse(JSON.stringify(obj));
        preset.apply(preview);
        const fill = preview.fill;
        if (fill.type === "gradient") {
            const stops = fill.stops.map(s => `${s.color} ${s.pos}%`).join(", ");
            swatch.style.background = `linear-gradient(135deg, ${stops})`;
        } else {
            swatch.style.background = fill.color === "none" ? "#ffffff" : fill.color;
        }
        swatch.style.borderColor = preview.stroke.color === "none" ? "#d6dbe1" : preview.stroke.color;
        swatch.style.borderWidth = Math.min(preview.stroke.width || 1, 4) + "px";
        if (preview.shadow) swatch.style.boxShadow = "2px 2px 4px rgba(0,0,0,0.3)";
        swatch.onclick = () => {
            pushHistory(true);
            applyToAll(targets, o => preset.apply(o));
            render();
            renderProperties();
        };
        grid.appendChild(swatch);
    });
    return section("Shape Styles", grid);
}

function renderProperties() {
    syncFontRibbon();
    updateShapeFormatTab();
    updateTextEffectsTab();
    updateFormatPictureTab();
    updateEditTableTab();
    panel.innerHTML = "";
    const objs = state.selection.map(getObj).filter(Boolean);
    if (objs.length === 0) {
        const empty = el("div", { class: "panel-empty-state" });
        const icon = el("div", { class: "panel-empty-icon" });
        icon.innerHTML = "&#10022;";
        empty.appendChild(icon);
        empty.appendChild(el("p", { class: "empty-msg",
            text: "Select an object to edit its properties, or pick a tool above and draw on the canvas." }));
        panel.appendChild(empty);
        panel.appendChild(buildSlideBackgroundSection());
        return;
    }

    if (objs.length === 1) {
        const obj = objs[0];
        panel.appendChild(buildPositionSection(obj));
        if (TEXT_CAPABLE_TYPES.includes(obj.type)) panel.appendChild(buildFontSection(obj));
        if (!["image", "group", "chart", "zoom", "video", "audio"].includes(obj.type)) {
            panel.appendChild(buildShapeStylesSection(obj));
            panel.appendChild(buildFillSection(obj));
            panel.appendChild(buildStrokeSection(obj));
        }
        if (obj.type === "star") panel.appendChild(buildStarSection(obj));
        if (obj.type === "image") panel.appendChild(buildImageSection(obj));
        if (obj.type === "chart") panel.appendChild(buildChartSection(obj));
        if (obj.type === "zoom") panel.appendChild(buildZoomSection(obj));
        if (obj.type === "video") panel.appendChild(buildMediaSection(obj, "video"));
        if (obj.type === "audio") panel.appendChild(buildMediaSection(obj, "audio"));
        if (obj.type !== "group" && obj.type !== "zoom") panel.appendChild(buildLinkSection(obj));
        if (obj.type === "group" && obj.tableCols) panel.appendChild(buildTableSection(obj));
        panel.appendChild(buildEffectsSection(obj));
    } else {
        panel.appendChild(el("p", { class: "empty-msg", text: `${objs.length} objects selected. Use Align/Arrange in the toolbar, or edit shared fill/stroke below.` }));
        if (!objs.some(o => o.type === "image" || o.type === "group")) {
            panel.appendChild(buildShapeStylesSection(objs[0], objs));
            panel.appendChild(buildFillSection(objs[0], objs));
            panel.appendChild(buildStrokeSection(objs[0], objs));
        }
        panel.appendChild(buildEffectsSection(objs[0], objs));
    }
}

function buildEffectsSection(obj, multi) {
    const targets = multi || [obj];
    const opacityInput = el("input", { type: "range", min: 0, max: 100, value: obj.opacity ?? 100 });
    const opacityVal = el("span", { class: "small", text: (obj.opacity ?? 100) + "%" });
    opacityInput.oninput = () => {
        const v = parseInt(opacityInput.value);
        opacityVal.textContent = v + "%";
        applyToAll(targets, o => o.opacity = v);
    };
    opacityInput.onchange = () => pushHistory(true);

    const shadowInput = el("input", { type: "checkbox" });
    shadowInput.checked = targets.every(o => o.shadow);
    shadowInput.onchange = () => { pushHistory(true); applyToAll(targets, o => o.shadow = shadowInput.checked); };

    const shadowColorInput = makeColorPickerBtn(obj.shadowColor || "#000000", c => applyToAll(targets, o => o.shadowColor = c), { onCommit: () => pushHistory(true) });

    const shadowBlurInput = el("input", { type: "range", min: 0, max: 20, value: obj.shadowBlur ?? 4 });
    const shadowBlurVal = el("span", { class: "small", text: String(obj.shadowBlur ?? 4) });
    shadowBlurInput.oninput = () => {
        shadowBlurVal.textContent = shadowBlurInput.value;
        applyToAll(targets, o => o.shadowBlur = parseInt(shadowBlurInput.value));
    };
    shadowBlurInput.onchange = () => pushHistory(true);

    const shadowDistInput = el("input", { type: "range", min: 0, max: 30, value: obj.shadowDistance ?? 4 });
    const shadowDistVal = el("span", { class: "small", text: String(obj.shadowDistance ?? 4) });
    shadowDistInput.oninput = () => {
        shadowDistVal.textContent = shadowDistInput.value;
        applyToAll(targets, o => o.shadowDistance = parseInt(shadowDistInput.value));
    };
    shadowDistInput.onchange = () => pushHistory(true);

    const shadowAngleInput = el("input", { type: "range", min: 0, max: 359, value: obj.shadowAngle ?? 45 });
    const shadowAngleVal = el("span", { class: "small", text: (obj.shadowAngle ?? 45) + "°" });
    shadowAngleInput.oninput = () => {
        shadowAngleVal.textContent = shadowAngleInput.value + "°";
        applyToAll(targets, o => o.shadowAngle = parseInt(shadowAngleInput.value));
    };
    shadowAngleInput.onchange = () => pushHistory(true);

    const shadowOpacityInput = el("input", { type: "range", min: 0, max: 100, value: obj.shadowOpacity ?? 40 });
    const shadowOpacityVal = el("span", { class: "small", text: (obj.shadowOpacity ?? 40) + "%" });
    shadowOpacityInput.oninput = () => {
        shadowOpacityVal.textContent = shadowOpacityInput.value + "%";
        applyToAll(targets, o => o.shadowOpacity = parseInt(shadowOpacityInput.value));
    };
    shadowOpacityInput.onchange = () => pushHistory(true);

    const shadowPerspectiveInput = el("input", { type: "checkbox" });
    shadowPerspectiveInput.checked = targets.every(o => o.shadowPerspective);
    shadowPerspectiveInput.onchange = () => {
        pushHistory(true);
        applyToAll(targets, o => o.shadowPerspective = shadowPerspectiveInput.checked);
    };

    const glowInput = el("input", { type: "checkbox" });
    glowInput.checked = targets.every(o => o.glow);
    glowInput.onchange = () => { pushHistory(true); applyToAll(targets, o => o.glow = glowInput.checked); };

    const glowColorInput = makeColorPickerBtn(obj.glowColor || "#65c8d6", c => applyToAll(targets, o => o.glowColor = c), { onCommit: () => pushHistory(true) });

    const glowSizeInput = el("input", { type: "range", min: 0, max: 30, value: obj.glowSize ?? 6 });
    const glowSizeVal = el("span", { class: "small", text: String(obj.glowSize ?? 6) });
    glowSizeInput.oninput = () => {
        glowSizeVal.textContent = glowSizeInput.value;
        applyToAll(targets, o => o.glowSize = parseInt(glowSizeInput.value));
    };
    glowSizeInput.onchange = () => pushHistory(true);

    const glowOpacityInput = el("input", { type: "range", min: 0, max: 100, value: obj.glowOpacity ?? 85 });
    const glowOpacityVal = el("span", { class: "small", text: (obj.glowOpacity ?? 85) + "%" });
    glowOpacityInput.oninput = () => {
        glowOpacityVal.textContent = glowOpacityInput.value + "%";
        applyToAll(targets, o => o.glowOpacity = parseInt(glowOpacityInput.value));
    };
    glowOpacityInput.onchange = () => pushHistory(true);

    const reflectionInput = el("input", { type: "checkbox" });
    reflectionInput.checked = targets.every(o => o.reflection);
    reflectionInput.onchange = () => { pushHistory(true); applyToAll(targets, o => o.reflection = reflectionInput.checked); render(); };

    const reflectionSizeInput = el("input", { type: "range", min: 10, max: 100, value: obj.reflectionSize ?? 50 });
    const reflectionSizeVal = el("span", { class: "small", text: (obj.reflectionSize ?? 50) + "%" });
    reflectionSizeInput.oninput = () => {
        reflectionSizeVal.textContent = reflectionSizeInput.value + "%";
        applyToAll(targets, o => o.reflectionSize = parseInt(reflectionSizeInput.value));
        render();
    };
    reflectionSizeInput.onchange = () => pushHistory(true);

    const reflectionOpacityInput = el("input", { type: "range", min: 0, max: 100, value: obj.reflectionOpacity ?? 50 });
    const reflectionOpacityVal = el("span", { class: "small", text: (obj.reflectionOpacity ?? 50) + "%" });
    reflectionOpacityInput.oninput = () => {
        reflectionOpacityVal.textContent = reflectionOpacityInput.value + "%";
        applyToAll(targets, o => o.reflectionOpacity = parseInt(reflectionOpacityInput.value));
        render();
    };
    reflectionOpacityInput.onchange = () => pushHistory(true);

    return section("Effects",
        row("Opacity", opacityInput, opacityVal),
        row("Shadow", shadowInput),
        row("Shadow Color", shadowColorInput),
        row("Shadow Blur", shadowBlurInput, shadowBlurVal),
        row("Shadow Distance", shadowDistInput, shadowDistVal),
        row("Shadow Direction", shadowAngleInput, shadowAngleVal),
        row("Shadow Opacity", shadowOpacityInput, shadowOpacityVal),
        row("Perspective", shadowPerspectiveInput),
        row("Glow", glowInput, glowColorInput),
        row("Glow Size", glowSizeInput, glowSizeVal),
        row("Glow Opacity", glowOpacityInput, glowOpacityVal),
        row("Reflection", reflectionInput),
        row("Reflection Size", reflectionSizeInput, reflectionSizeVal),
        row("Reflection Opacity", reflectionOpacityInput, reflectionOpacityVal)
    );
}

function buildSlideBackgroundSection(refresh) {
    const slide = curSlide();
    if (!slide.fill) slide.fill = { type: "solid", color: "#ffffff" };
    const fillSection = buildFillSection(slide, null, refresh);
    fillSection.querySelector("h3").textContent = "Slide Background";
    return fillSection;
}

function buildPositionSection(obj) {
    const mk = (key, step = 1) => {
        const input = el("input", { type: "number", value: Math.round(obj[key]), step });
        input.onchange = () => { obj[key] = parseFloat(input.value) || 0; render(); };
        return input;
    };
    const rotInput = el("input", { type: "number", value: obj.rotation, class: "small" });
    rotInput.onchange = () => { obj.rotation = parseFloat(rotInput.value) || 0; render(); };
    const flipHBtn = el("button", { class: "panel-action-btn" + (obj.flipH ? " active" : ""), text: "Flip Horizontal" });
    flipHBtn.onclick = () => { pushHistory(true); flipObjectScreenH(obj); render(); renderProperties(); };
    const flipVBtn = el("button", { class: "panel-action-btn" + (obj.flipV ? " active" : ""), text: "Flip Vertical" });
    flipVBtn.onclick = () => { pushHistory(true); flipObjectScreenV(obj); render(); renderProperties(); };
    return section("Position & Size",
        row("X", mk("x")), row("Y", mk("y")),
        row("Width", mk("w")), row("Height", mk("h")),
        row("Rotation", rotInput, el("span", { text: "°" })),
        row("Flip", flipHBtn, flipVBtn)
    );
}

function buildFontSection(obj) {
    const familySelect = el("select");
    FONT_LIST.forEach(f => familySelect.appendChild(el("option", { value: f, text: f, style: `font-family:'${f}'` })));
    familySelect.value = obj.fontFamily;
    familySelect.onchange = () => { obj.fontFamily = familySelect.value; render(); };

    const sizeInput = el("input", { type: "number", value: obj.fontSize, class: "small" });
    sizeInput.onchange = () => { obj.fontSize = parseFloat(sizeInput.value) || 12; render(); };

    const colorInput = makeColorPickerBtn(obj.fontColor, c => { obj.fontColor = c; render(); });

    const styleRow = el("div", { class: "style-toggle-row" });
    const bBtn = el("button", { text: "B", style: "font-weight:bold" });
    const iBtn = el("button", { text: "I", style: "font-style:italic" });
    const uBtn = el("button", { text: "U", style: "text-decoration:underline" });
    [["bold", bBtn], ["italic", iBtn], ["underline", uBtn]].forEach(([key, btn]) => {
        if (obj[key]) btn.classList.add("active");
        btn.onclick = () => { obj[key] = !obj[key]; render(); renderProperties(); };
    });
    styleRow.append(bBtn, iBtn, uBtn);

    const alignRow = el("div", { class: "style-toggle-row" });
    [["left", "⟸"], ["center", "↔"], ["right", "⟹"]].forEach(([a, label]) => {
        const btn = el("button", { text: label });
        if (obj.align === a) btn.classList.add("active");
        btn.onclick = () => { obj.align = a; render(); renderProperties(); };
        alignRow.appendChild(btn);
    });

    const textArea = el("textarea", { rows: 3 });
    textArea.value = obj.field ? fieldText(obj) : obj.text;
    textArea.oninput = () => { obj.text = textArea.value; obj.field = null; render(); };

    if (obj.isCode) {
        const langSelect = el("select", { class: "small" });
        ALL_LANGUAGES.forEach(({ value, label }) => {
            const opt = el("option", { value, text: label });
            if (value === (obj.codeLang || "javascript")) opt.selected = true;
            langSelect.appendChild(opt);
        });
        langSelect.onchange = () => { obj.codeLang = langSelect.value; render(); renderProperties(); };
        return section("Text",
            row("Content", textArea),
            row("Language", langSelect),
            row("Font", familySelect),
            row("Size", sizeInput, el("span", { text: "px" })),
            row("Color", colorInput)
        );
    }

    if (obj.isEquation) {
        textArea.rows = 2;
        textArea.placeholder = "e.g. x^2 + 1/(x+1), or raw LaTeX";
        const preview = el("div", { class: "equation-preview" });
        const updatePreview = () => renderEquation(preview, textArea.value, obj.rawTex);
        textArea.oninput = () => { obj.text = textArea.value; obj.field = null; updatePreview(); render(); };
        updatePreview();
        return section("Equation",
            row("Expression", textArea),
            row("Preview", preview),
            row("Font", familySelect),
            row("Size", sizeInput, el("span", { text: "px" })),
            row("Color", colorInput)
        );
    }

    return section("Text",
        row("Content", textArea),
        row("Font", familySelect),
        row("Size", sizeInput, el("span", { text: "px" })),
        row("Color", colorInput),
        row("Style", styleRow),
        row("Align", alignRow)
    );
}

function buildStarSection(obj) {
    const input = el("input", { type: "number", value: obj.points || 5, min: 3, max: 20, class: "small" });
    input.onchange = () => { obj.points = parseInt(input.value) || 5; render(); };
    return section("Star", row("Points", input));
}

function buildImageSection(obj) {
    const btn = el("button", { class: "ghost-btn", text: "Replace Image" });
    btn.onclick = () => {
        const input = document.createElement("input");
        input.type = "file"; input.accept = "image/*";
        input.onchange = () => {
            const file = input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => { obj.src = reader.result; render(); };
            reader.readAsDataURL(file);
        };
        input.click();
    };
    return section("Image", btn);
}

function buildChartSection(obj) {
    const typeSelect = el("select");
    [["bar", "Bar"], ["line", "Line"], ["pie", "Pie"], ["donut", "Donut"]].forEach(([val, label]) => {
        typeSelect.appendChild(el("option", { value: val, text: label }));
    });
    typeSelect.value = obj.chartType || "bar";
    typeSelect.onchange = () => { obj.chartType = typeSelect.value; render(); renderProperties(); };

    const labelsInput = el("input", { type: "text", value: (obj.chartLabels || []).join(", ") });
    labelsInput.onchange = () => {
        obj.chartLabels = labelsInput.value.split(",").map(s => s.trim());
        render();
    };
    const dataInput = el("input", { type: "text", value: (obj.chartData || []).join(", ") });
    dataInput.onchange = () => {
        obj.chartData = dataInput.value.split(",").map(s => parseFloat(s.trim()) || 0);
        render();
    };

    const sections = [
        row("Chart Type", typeSelect),
        row("Labels", labelsInput),
        row("Values", dataInput)
    ];

    if (obj.chartType === "pie" || obj.chartType === "donut") {
        const note = el("p", { class: "empty-msg",
            text: "Slices use a default color palette in the order of the values above." });
        sections.push(note);
    } else {
        const colorInput = makeColorPickerBtn(obj.barColor || "#2454a0", c => { obj.barColor = c; render(); });
        sections.push(row(obj.chartType === "line" ? "Line Color" : "Bar Color", colorInput));
    }

    return section("Chart", ...sections);
}

function buildTableSection(group) {
    const sections = [];

    // ---- Table style: presets, header row, banded rows ----
    const styleSelect = el("select");
    [["none", "No Style"], ["blue", "Blue"], ["gray", "Gray"], ["green", "Green"], ["orange", "Orange"]]
        .forEach(([v, label]) => styleSelect.appendChild(el("option", { value: v, text: label })));
    styleSelect.value = group.styleId || "none";
    styleSelect.onchange = () => {
        pushHistory(true);
        group.styleId = styleSelect.value;
        applyTableStyle(group);
        render(); renderProperties();
    };

    const headerInput = el("input", { type: "checkbox" });
    headerInput.checked = !!group.headerRow;
    headerInput.onchange = () => {
        pushHistory(true);
        group.headerRow = headerInput.checked;
        applyTableStyle(group);
        render(); renderProperties();
    };

    const bandedInput = el("input", { type: "checkbox" });
    bandedInput.checked = !!group.bandedRows;
    bandedInput.onchange = () => {
        pushHistory(true);
        group.bandedRows = bandedInput.checked;
        applyTableStyle(group);
        render(); renderProperties();
    };

    sections.push(section("Table Style",
        row("Style", styleSelect),
        row("Header Row", headerInput),
        row("Banded Rows", bandedInput)
    ));

    // ---- Selected cell(s): fill + border + merge/unmerge ----
    const cells = state.cellSelections.map(id => findObjectById(group.children, id)).filter(Boolean);
    if (cells.length > 0) {
        const selLabel = cells.length > 1 ? `Selected Cells (${cells.length})` : "Selected Cell";

        // Fill sub-section
        const cellSection = buildFillSection(cells[0], cells);
        cellSection.querySelector("h3").textContent = `${selLabel} Fill`;
        cellSection.appendChild(el("p", { class: "empty-msg",
            text: "Click+drag across cells to select a range. Shift-click to add/remove individual cells." }));

        // Cell border color/width
        const cellBorderColor = makeColorPickerBtn(cells[0].stroke?.color === "none" ? "#000000" : (cells[0].stroke?.color || "#000000"), c => { pushHistory(true); cells.forEach(cl => { if (!cl.stroke) cl.stroke = {}; cl.stroke.color = c; }); render(); });
        const cellBorderNone = el("button", { text: cells.every(c => c.stroke?.color === "none") ? "No Border ✓" : "No Border", class: "table-action-btn" });
        cellBorderNone.onclick = () => {
            pushHistory(true);
            const allNone = cells.every(c => c.stroke?.color === "none");
            cells.forEach(c => { if (!c.stroke) c.stroke = {}; c.stroke.color = allNone ? "#000000" : "none"; });
            render(); renderProperties();
        };
        const cellBorderWidth = el("input", { type: "number", value: cells[0].stroke?.width ?? 1, min: 0, max: 20, class: "small" });
        cellBorderWidth.onchange = () => { const w = Math.max(0, parseFloat(cellBorderWidth.value) || 0); cells.forEach(c => { if (!c.stroke) c.stroke = {}; c.stroke.width = w; }); render(); };

        cellSection.appendChild(el("h4", { text: `${selLabel} Border`, style: "margin:8px 0 4px;font-size:0.75rem;color:#555;" }));
        cellSection.appendChild(row("Color", cellBorderColor, cellBorderNone));
        cellSection.appendChild(row("Width", cellBorderWidth, el("span", { text: "px" })));

        // Merge / Unmerge actions
        const actionsRow = el("div", { class: "prop-row" });
        if (cells.length > 1) {
            const mergeBtn = el("button", { text: "Merge Cells", class: "table-action-btn" });
            mergeBtn.onclick = () => {
                pushHistory(true);
                if (!mergeCells(group)) alert("Select a rectangular block of unmerged cells to merge.");
                render(); renderProperties();
            };
            actionsRow.appendChild(mergeBtn);
        }
        if (cells.length === 1 && ((cells[0].colSpan || 1) > 1 || (cells[0].rowSpan || 1) > 1)) {
            const unmergeBtn = el("button", { text: "Unmerge Cell", class: "table-action-btn" });
            unmergeBtn.onclick = () => {
                pushHistory(true);
                unmergeCells(group);
                render(); renderProperties();
            };
            actionsRow.appendChild(unmergeBtn);
        }
        if (actionsRow.children.length) cellSection.appendChild(actionsRow);

        sections.push(cellSection);
    } else {
        sections.push(section("Cell Selection",
            el("p", { class: "empty-msg", text: "Click a cell to select it. Click+drag to select a range. Shift-click to add/remove cells. Double-click to edit text." })));
    }

    // ---- Global table border controls ----
    const cellRects = group.children.filter((c, i) => c.type === "rect" && i !== group.children.length - 1 && !c.covered);
    const outline = group.children[group.children.length - 1];

    const innerColorInput = makeColorPickerBtn(cellRects[0]?.stroke?.color === "none" ? "#000000" : (cellRects[0]?.stroke?.color || "#000000"), c => { cellRects.forEach(cr => cr.stroke.color = c); render(); });
    const innerInput = el("input", { type: "number", min: 0, step: 0.5, value: (cellRects[0] && cellRects[0].stroke.width) ?? 1, class: "small" });
    innerInput.onchange = () => { const w = Math.max(0, parseFloat(innerInput.value) || 0); cellRects.forEach(c => c.stroke.width = w); render(); };
    const outerColorInput = makeColorPickerBtn(outline.stroke?.color === "none" ? "#000000" : (outline.stroke?.color || "#000000"), c => { outline.stroke.color = c; render(); });
    const outerInput = el("input", { type: "number", min: 0, step: 0.5, value: outline.stroke.width ?? 3, class: "small" });
    outerInput.onchange = () => { const w = Math.max(0, parseFloat(outerInput.value) || 0); outline.stroke.width = w; render(); };

    // ---- Rounded corners ----
    const cornerInput = el("input", { type: "number", min: 0, max: 100, step: 1, value: group.tableCornerRadius || 0, class: "small" });
    cornerInput.onchange = () => {
        group.tableCornerRadius = Math.max(0, parseFloat(cornerInput.value) || 0);
        render();
    };
    const cornerSlider = el("input", { type: "range", min: 0, max: 80, step: 1, value: group.tableCornerRadius || 0 });
    cornerSlider.oninput = () => {
        group.tableCornerRadius = parseFloat(cornerSlider.value);
        cornerInput.value = cornerSlider.value;
        render();
    };
    cornerInput.oninput = () => {
        group.tableCornerRadius = Math.max(0, parseFloat(cornerInput.value) || 0);
        cornerSlider.value = group.tableCornerRadius;
        render();
    };

    sections.push(section("Table Borders",
        row("Inner Color", innerColorInput),
        row("Inner Width", innerInput, el("span", { text: "px" })),
        row("Outer Color", outerColorInput),
        row("Outer Width", outerInput, el("span", { text: "px" })),
        row("Corner Radius", cornerSlider, cornerInput, el("span", { text: "px" }))
    ));

    // ---- Border Painter ----
    const paintToggle = el("button", {
        text: borderPaintState.active ? "Painter: ON  (click to stop)" : "Painter: OFF  (click to start)",
        class: "table-action-btn" + (borderPaintState.active ? " border-paint-active" : "")
    });
    paintToggle.onclick = () => {
        borderPaintState.active = !borderPaintState.active;
        if (!borderPaintState.active) { borderPaintHover = null; document.body.style.cursor = ""; updateBorderPaintOverlay(); }
        renderProperties();
    };

    const paintColor = makeColorPickerBtn(borderPaintState.color, c => { borderPaintState.color = c; });

    const paintWidth = el("input", { type: "number", value: borderPaintState.width, min: 0, max: 30, class: "small" });
    paintWidth.oninput = () => { borderPaintState.width = parseFloat(paintWidth.value) || 0; };

    const paintDash = el("select");
    [["solid","Solid"],["dashed","Dashed"],["dotted","Dotted"]].forEach(([v,l]) => paintDash.appendChild(el("option",{value:v,text:l})));
    paintDash.value = borderPaintState.dash;
    paintDash.onchange = () => { borderPaintState.dash = paintDash.value; };

    const clearBtn = el("button", { text: "Clear All Painted Borders", class: "table-action-btn" });
    clearBtn.onclick = () => { pushHistory(true); group.customBorders = {}; render(); };

    sections.push(section("Border Painter",
        el("p", { class: "empty-msg", text: "Click or drag across border lines to paint them." }),
        row("", paintToggle),
        row("Color", paintColor),
        row("Width", paintWidth, el("span", { text: "px" })),
        row("Style", paintDash),
        row("", clearBtn)
    ));

    return el("div", {}, sections);
}

function buildZoomSection(obj) {
    const select = el("select");
    state.slides.forEach((s, i) => select.appendChild(el("option", { value: i, text: `Slide ${i + 1}` })));
    select.value = obj.targetSlide || 0;
    select.onchange = () => { obj.targetSlide = parseInt(select.value); render(); };
    return section("Zoom", row("Target Slide", select),
        el("p", { class: "empty-msg", text: "Double-click the zoom box on the canvas to jump to that slide." }));
}

function buildMediaSection(obj, kind) {
    const btn = el("button", { class: "ghost-btn", text: `Replace ${kind === "video" ? "Video" : "Audio"}` });
    btn.onclick = () => {
        const input = document.createElement("input");
        input.type = "file"; input.accept = kind === "video" ? "video/*" : "audio/*";
        input.onchange = () => {
            const file = input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => { obj.src = reader.result; obj.fileName = file.name; render(); };
            reader.readAsDataURL(file);
        };
        input.click();
    };
    return section(kind === "video" ? "Video" : "Audio",
        el("p", { class: "empty-msg", text: obj.fileName || "No file selected" }),
        btn
    );
}

function buildLinkSection(obj) {
    const input = el("input", { type: "text", value: obj.href || "", placeholder: "https://..." });
    input.onchange = () => { obj.href = input.value || null; };
    return section("Link", row("URL", input));
}

function applyToAll(objs, fn) {
    objs.forEach(fn);
    render();
}

// ============ Shared Color Picker ============

const PALETTE_THEME = [
    "#FFFFFF","#000000","#E7E6E6","#44546A","#4472C4","#ED7D31","#A5A5A5","#FFC000","#5B9BD5","#70AD47",
    "#F2F2F2","#808080","#D9D9D9","#D6DCE4","#D9E2F3","#FCE4D6","#EDEDED","#FFF2CC","#DEEAF1","#E2EFDA",
    "#D9D9D9","#595959","#BFBFBF","#ACB9CA","#B4C7E7","#F8CBAD","#DBDBDB","#FFE699","#BDD7EE","#C6E0B4",
    "#BFBFBF","#3F3F3F","#A6A6A6","#8497B0","#8EAADB","#F4B183","#C9C9C9","#FFD966","#9DC3E6","#A9D18E",
    "#808080","#262626","#7F7F7F","#323F4F","#2E75B5","#C55A11","#808080","#BF8F00","#2E75B6","#538135",
    "#404040","#0D0D0D","#404040","#222A35","#1F4E79","#843C0C","#404040","#7F6000","#1F4E79","#375623",
];
const PALETTE_STANDARD = [
    "#C00000","#FF0000","#FFC000","#FFFF00","#92D050",
    "#00B050","#00B0F0","#0070C0","#002060","#7030A0",
];

function getRecentColors() {
    try { return JSON.parse(localStorage.getItem("folium_recent_colors") || "[]"); } catch { return []; }
}
function addRecentColor(hex) {
    if (!hex || hex === "none" || !/^#/.test(hex)) return;
    let r = getRecentColors().filter(c => c.toLowerCase() !== hex.toLowerCase());
    r.unshift(hex);
    localStorage.setItem("folium_recent_colors", JSON.stringify(r.slice(0, 10)));
}

let _cpPopup = null;
function _closeColorPicker() { _cpPopup?.remove(); _cpPopup = null; }

// Creates a color swatch button showing the color picker popup on click.
// onChange(color): called for every change (live & final)
// onCommit(color): called only when selection is finalized (optional, for pushHistory)
// allowNone: include "No Fill" option in popup
function makeColorPickerBtn(value, onChange, { allowNone = false, onCommit = null } = {}) {
    const btn = document.createElement("button");
    btn.className = "cp-swatch-btn";
    const strip = document.createElement("span");
    strip.className = "cp-color-strip";
    const arrow = document.createElement("span");
    arrow.className = "cp-arrow";
    arrow.textContent = "▾";
    btn.append(strip, arrow);

    const updateStrip = (v) => {
        strip.style.background = (!v || v === "none")
            ? "repeating-linear-gradient(45deg,#ccc 0,#ccc 3px,#fff 3px,#fff 6px)"
            : v;
        btn.dataset.cv = v;
    };
    updateStrip(value);
    btn._setValue = updateStrip;

    btn.addEventListener("mousedown", e => { e.stopPropagation(); e.preventDefault(); });
    btn.addEventListener("click", e => {
        e.stopPropagation(); e.preventDefault();
        if (_cpPopup) { _closeColorPicker(); return; }
        _cpPopup = _buildCpPopup(btn, btn.dataset.cv, (newColor, isLive) => {
            updateStrip(newColor);
            onChange(newColor);
            if (!isLive) { if (onCommit) onCommit(newColor); addRecentColor(newColor); }
        }, { allowNone });
    });
    return btn;
}

function _buildCpPopup(anchor, curColor, onSelect, { allowNone = false } = {}) {
    const popup = document.createElement("div");
    popup.className = "cp-popup";
    popup.addEventListener("mousedown", e => e.stopPropagation());
    popup.addEventListener("click", e => e.stopPropagation());

    const mkSw = (c) => {
        const s = document.createElement("button");
        s.className = "cp-swatch-cell"; s.title = c; s.style.background = c;
        if (c.toLowerCase() === (curColor || "").toLowerCase()) s.classList.add("cp-selected");
        s.addEventListener("click", () => { onSelect(c, false); _closeColorPicker(); });
        return s;
    };

    const mkSec = (title, colors, cols) => {
        const sec = document.createElement("div"); sec.className = "cp-section";
        if (title) { const h = document.createElement("div"); h.className = "cp-section-title"; h.textContent = title; sec.appendChild(h); }
        const grid = document.createElement("div"); grid.className = "cp-swatch-grid";
        if (cols) { grid.style.display = "grid"; grid.style.gridTemplateColumns = `repeat(${cols},16px)`; }
        colors.forEach(c => grid.appendChild(mkSw(c)));
        sec.appendChild(grid); return sec;
    };

    popup.appendChild(mkSec("Theme Colors", PALETTE_THEME, 10));
    popup.appendChild(mkSec("Standard Colors", PALETTE_STANDARD));
    const recent = getRecentColors();
    if (recent.length > 0) popup.appendChild(mkSec("Recently Used", recent));

    const sep = document.createElement("hr"); sep.className = "cp-sep"; popup.appendChild(sep);

    if (allowNone) {
        const nb = document.createElement("button"); nb.className = "cp-action-row";
        nb.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="5.5" fill="none" stroke="#666" stroke-width="1.5"/><line x1="3.5" y1="12.5" x2="12.5" y2="3.5" stroke="#c33" stroke-width="1.5"/></svg> No Fill`;
        nb.addEventListener("click", () => { onSelect("none", false); _closeColorPicker(); });
        popup.appendChild(nb);
    }

    const mb = document.createElement("button"); mb.className = "cp-action-row";
    mb.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="5.5" fill="none" stroke="#666" stroke-width="1.5"/><circle cx="5.5" cy="8" r="1.2" fill="#e44"/><circle cx="8" cy="8" r="1.2" fill="#4b4"/><circle cx="10.5" cy="8" r="1.2" fill="#44d"/></svg> More Colors…`;
    popup.appendChild(mb);

    const ni = document.createElement("input"); ni.type = "color";
    ni.value = (!curColor || curColor === "none") ? "#000000" : curColor;
    ni.style.cssText = "position:absolute;visibility:hidden;width:0;height:0;";
    ni.addEventListener("input", () => onSelect(ni.value, true));
    ni.addEventListener("change", () => { onSelect(ni.value, false); _closeColorPicker(); });
    popup.appendChild(ni);
    mb.addEventListener("click", () => ni.click());

    document.body.appendChild(popup);
    const ar = anchor.getBoundingClientRect(), pr = popup.getBoundingClientRect();
    let top = ar.bottom + 2, left = ar.left;
    if (left + pr.width > window.innerWidth - 8) left = window.innerWidth - pr.width - 8;
    if (top + pr.height > window.innerHeight - 8) top = ar.top - pr.height - 2;
    popup.style.left = Math.max(4, left) + "px";
    popup.style.top = Math.max(4, top) + "px";

    const onOut = (e) => {
        if (!popup.contains(e.target) && e.target !== anchor) { _closeColorPicker(); document.removeEventListener("mousedown", onOut, true); }
    };
    setTimeout(() => document.addEventListener("mousedown", onOut, true), 0);
    return popup;
}

function _lerpGradColor(stops, pos) {
    if (!stops || stops.length === 0) return "#ffffff";
    const sorted = [...stops].sort((a, b) => a.pos - b.pos);
    if (pos <= sorted[0].pos) return sorted[0].color;
    if (pos >= sorted[sorted.length - 1].pos) return sorted[sorted.length - 1].color;
    let lo = sorted[0], hi = sorted[sorted.length - 1];
    for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i].pos <= pos && sorted[i + 1].pos >= pos) { lo = sorted[i]; hi = sorted[i + 1]; break; }
    }
    const t = (pos - lo.pos) / (hi.pos - lo.pos || 1);
    const c1 = parseInt(lo.color.replace(/^#/, "").padStart(6, "0"), 16);
    const c2 = parseInt(hi.color.replace(/^#/, "").padStart(6, "0"), 16);
    const lc = (a, b) => Math.round(a + (b - a) * t);
    const r = lc((c1 >> 16) & 0xff, (c2 >> 16) & 0xff);
    const g = lc((c1 >> 8) & 0xff, (c2 >> 8) & 0xff);
    const b = lc(c1 & 0xff, c2 & 0xff);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ============ Gradient memory ============
let _lastGradientFill = null;

function buildFillSection(obj, multi, refresh) {
    const targets = multi || [obj];
    const refreshFn = refresh || renderProperties;
    const fill = obj.fill || { type: "solid", color: "#ffffff" };
    if (fill.type === "gradient" && fill.stops) _lastGradientFill = JSON.parse(JSON.stringify(fill));
    const typeSelect = el("select");
    [["solid", "Solid Color"], ["gradient", "Gradient"], ["parchment", "Parchment Paper"], ["emoji", "Emoji Pattern"]].forEach(([v, l]) => {
        typeSelect.appendChild(el("option", { value: v, text: l }));
    });
    typeSelect.value = fill.type;
    typeSelect.onchange = () => {
        const type = typeSelect.value;
        applyToAll(targets, o => {
            if (type === "solid") o.fill = { type: "solid", color: fill.color || "#a4c2e0" };
            else if (type === "gradient") o.fill = _lastGradientFill
                ? JSON.parse(JSON.stringify(_lastGradientFill))
                : { type: "gradient", gradientType: "linear", angle: 0, stops: [{ color: "#ffffff", pos: 0 }, { color: "#a4c2e0", pos: 100 }] };
            else if (type === "parchment") o.fill = { type: "parchment", color: "#e8d9b5" };
            else if (type === "emoji") o.fill = { type: "emoji", emoji: "⭐", emojiSize: 32, bgColor: "#ffffff" };
        });
        refreshFn();
    };

    const container = section("Fill", row("Type", typeSelect));

    if (fill.type === "solid") {
        const colorInput = makeColorPickerBtn(fill.color, c => applyToAll(targets, o => o.fill.color = c), { allowNone: true });
        container.appendChild(row("Color", colorInput));
    } else if (fill.type === "gradient") {
        const gTypeSelect = el("select");
        [["linear", "Linear"], ["radial", "Radial"]].forEach(([v, l]) => gTypeSelect.appendChild(el("option", { value: v, text: l })));
        gTypeSelect.value = fill.gradientType || "linear";
        gTypeSelect.onchange = () => { applyToAll(targets, o => o.fill.gradientType = gTypeSelect.value); _lastGradientFill = JSON.parse(JSON.stringify(fill)); };
        container.appendChild(row("Style", gTypeSelect));

        if ((fill.gradientType || "linear") === "linear") {
            const angleInput = el("input", { type: "range", min: 0, max: 360, value: fill.angle || 0 });
            const angleVal = el("span", { text: (fill.angle || 0) + "°", class: "small" });
            angleInput.oninput = () => { applyToAll(targets, o => o.fill.angle = parseInt(angleInput.value)); angleVal.textContent = angleInput.value + "°"; _lastGradientFill = JSON.parse(JSON.stringify(fill)); };
            container.appendChild(row("Angle", angleInput, angleVal));
        }

        let selFillStop = 0;
        const fillBarWrap = el("div", { class: "grad-bar-wrap" });
        const saveFillGrad = () => { _lastGradientFill = JSON.parse(JSON.stringify(fill)); };
        const buildFillBar = () => {
            fillBarWrap.innerHTML = "";
            const stops = fill.stops || [];
            const sorted = [...stops].sort((a, b) => a.pos - b.pos);
            const track = el("div", { class: "grad-bar-track" });
            track.style.background = `linear-gradient(to right, ${sorted.map(s => `${s.color} ${s.pos}%`).join(", ")})`;
            stops.forEach((stop, i) => {
                const handle = el("div", { class: "grad-stop-handle" + (i === selFillStop ? " selected" : "") });
                handle.style.left = stop.pos + "%";
                handle.style.background = stop.color;
                handle.title = `${stop.color}  ${stop.pos}%\nRight-click to delete`;
                handle.addEventListener("mousedown", mde => {
                    mde.preventDefault(); mde.stopPropagation();
                    selFillStop = i;
                    const startX = mde.clientX, origPos = stop.pos;
                    const rect = track.getBoundingClientRect();
                    let moved = false;
                    const onMv = mv => {
                        moved = true;
                        const p = Math.max(0, Math.min(100, Math.round(origPos + (mv.clientX - startX) / rect.width * 100)));
                        applyToAll(targets, o => { if (o.fill.stops[i]) o.fill.stops[i].pos = p; });
                        saveFillGrad(); buildFillBar();
                    };
                    const onUp = () => { window.removeEventListener("mousemove", onMv); window.removeEventListener("mouseup", onUp); if (!moved) buildFillBar(); };
                    window.addEventListener("mousemove", onMv); window.addEventListener("mouseup", onUp);
                });
                handle.addEventListener("contextmenu", e => {
                    e.preventDefault();
                    if (stops.length > 2) { applyToAll(targets, o => { if (o.fill.stops.length > 2) o.fill.stops.splice(i, 1); }); if (selFillStop >= fill.stops.length) selFillStop = fill.stops.length - 1; saveFillGrad(); buildFillBar(); }
                });
                track.appendChild(handle);
            });
            track.addEventListener("click", e => {
                if (e.target !== track) return;
                e.stopPropagation();
                const rect = track.getBoundingClientRect();
                const pos = Math.max(0, Math.min(100, Math.round((e.clientX - rect.left) / rect.width * 100)));
                const c = _lerpGradColor(stops, pos);
                applyToAll(targets, o => o.fill.stops.push({ color: c, pos }));
                selFillStop = fill.stops.length - 1;
                saveFillGrad(); buildFillBar();
            });
            fillBarWrap.appendChild(track);
            if (stops.length > 0) {
                const si = Math.min(selFillStop, stops.length - 1);
                const s = stops[si];
                const edRow = el("div", { class: "grad-stop-editor-row" });
                const cp = makeColorPickerBtn(s.color, c => { applyToAll(targets, o => { if (o.fill.stops[si]) o.fill.stops[si].color = c; }); saveFillGrad(); buildFillBar(); });
                const pi = el("input", { type: "number", min: 0, max: 100, value: s.pos, class: "small" });
                pi.onchange = () => { const p = Math.max(0, Math.min(100, parseInt(pi.value) || 0)); applyToAll(targets, o => { if (o.fill.stops[si]) o.fill.stops[si].pos = p; }); pi.value = p; saveFillGrad(); buildFillBar(); };
                edRow.append(cp, pi, el("span", { text: "%", class: "small" }));
                if (stops.length > 2) { const db = el("button", { text: "✕" }); db.onclick = () => { applyToAll(targets, o => { if (o.fill.stops.length > 2) o.fill.stops.splice(si, 1); }); if (selFillStop >= fill.stops.length) selFillStop = fill.stops.length - 1; saveFillGrad(); buildFillBar(); }; edRow.appendChild(db); }
                fillBarWrap.appendChild(edRow);
            }
        };
        buildFillBar();
        container.appendChild(fillBarWrap);
    } else if (fill.type === "parchment") {
        const colorInput = makeColorPickerBtn(fill.color || "#e8d9b5", c => applyToAll(targets, o => o.fill.color = c));
        container.appendChild(row("Base Tint", colorInput));
    } else if (fill.type === "emoji") {
        const emojiInput = el("input", { type: "text", value: fill.emoji || "⭐", maxlength: 4 });
        emojiInput.oninput = () => applyToAll(targets, o => o.fill.emoji = emojiInput.value);
        const sizeInput = el("input", { type: "range", min: 12, max: 80, value: fill.emojiSize || 32 });
        const sizeVal = el("span", { text: (fill.emojiSize || 32) + "px", class: "small" });
        sizeInput.oninput = () => {
            applyToAll(targets, o => o.fill.emojiSize = parseInt(sizeInput.value));
            sizeVal.textContent = sizeInput.value + "px";
        };
        const bgInput = makeColorPickerBtn(fill.bgColor || "#ffffff", c => applyToAll(targets, o => o.fill.bgColor = c));
        container.appendChild(row("Emoji", emojiInput));
        container.appendChild(row("Size", sizeInput, sizeVal));
        container.appendChild(row("Background", bgInput));
    }
    return container;
}

function buildStrokeSection(obj, multi, refresh) {
    const targets = multi || [obj];
    const refreshFn = refresh || renderProperties;
    const stroke = obj.stroke || { color: "none", width: 0, dash: "solid" };

    const typeSelect = el("select");
    [["solid", "Solid Color"], ["gradient", "Gradient"]].forEach(([v, l]) => {
        typeSelect.appendChild(el("option", { value: v, text: l }));
    });
    typeSelect.value = stroke.type === "gradient" ? "gradient" : "solid";
    typeSelect.onchange = () => {
        const type = typeSelect.value;
        applyToAll(targets, o => {
            const w = o.stroke ? o.stroke.width : 1;
            const dash = o.stroke ? o.stroke.dash : "solid";
            const cap = o.stroke ? o.stroke.cap : undefined;
            const join = o.stroke ? o.stroke.join : undefined;
            if (type === "solid") {
                const color = (o.stroke && o.stroke.color && o.stroke.color !== "none") ? o.stroke.color
                    : (o.stroke && o.stroke.stops && o.stroke.stops[0] && o.stroke.stops[0].color) || "#1a1a1a";
                o.stroke = { type: "solid", color, width: w, dash, cap, join };
            } else if (type === "gradient") {
                o.stroke = { type: "gradient", gradientType: "linear", angle: 0, width: w, dash, cap, join,
                    stops: [{ color: "#ffffff", pos: 0 }, { color: "#a4c2e0", pos: 100 }] };
            }
        });
        refreshFn();
    };

    const container = section("Line / Outline", row("Type", typeSelect));

    if (stroke.type === "gradient") {
        const gTypeSelect = el("select");
        [["linear", "Linear"], ["radial", "Radial"]].forEach(([v, l]) => gTypeSelect.appendChild(el("option", { value: v, text: l })));
        gTypeSelect.value = stroke.gradientType || "linear";
        gTypeSelect.onchange = () => applyToAll(targets, o => o.stroke.gradientType = gTypeSelect.value);
        container.appendChild(row("Style", gTypeSelect));

        if ((stroke.gradientType || "linear") === "linear") {
            const angleInput = el("input", { type: "range", min: 0, max: 360, value: stroke.angle || 0 });
            const angleVal = el("span", { text: (stroke.angle || 0) + "°", class: "small" });
            angleInput.oninput = () => { applyToAll(targets, o => o.stroke.angle = parseInt(angleInput.value)); angleVal.textContent = angleInput.value + "°"; };
            container.appendChild(row("Angle", angleInput, angleVal));
        }

        let selStrkStop = 0;
        const strkBarWrap = el("div", { class: "grad-bar-wrap" });
        const buildStrkBar = () => {
            strkBarWrap.innerHTML = "";
            const stops = stroke.stops || [];
            const sorted = [...stops].sort((a, b) => a.pos - b.pos);
            const track = el("div", { class: "grad-bar-track" });
            track.style.background = `linear-gradient(to right, ${sorted.map(s => `${s.color} ${s.pos}%`).join(", ")})`;
            stops.forEach((stop, i) => {
                const handle = el("div", { class: "grad-stop-handle" + (i === selStrkStop ? " selected" : "") });
                handle.style.left = stop.pos + "%";
                handle.style.background = stop.color;
                handle.title = `${stop.color}  ${stop.pos}%\nRight-click to delete`;
                handle.addEventListener("mousedown", mde => {
                    mde.preventDefault(); mde.stopPropagation();
                    selStrkStop = i;
                    const startX = mde.clientX, origPos = stop.pos;
                    const rect = track.getBoundingClientRect();
                    let moved = false;
                    const onMv = mv => { moved = true; const p = Math.max(0, Math.min(100, Math.round(origPos + (mv.clientX - startX) / rect.width * 100))); applyToAll(targets, o => { if (o.stroke.stops[i]) o.stroke.stops[i].pos = p; }); buildStrkBar(); };
                    const onUp = () => { window.removeEventListener("mousemove", onMv); window.removeEventListener("mouseup", onUp); if (!moved) buildStrkBar(); };
                    window.addEventListener("mousemove", onMv); window.addEventListener("mouseup", onUp);
                });
                handle.addEventListener("contextmenu", e => {
                    e.preventDefault();
                    if (stops.length > 2) { applyToAll(targets, o => { if (o.stroke.stops.length > 2) o.stroke.stops.splice(i, 1); }); if (selStrkStop >= stroke.stops.length) selStrkStop = stroke.stops.length - 1; buildStrkBar(); }
                });
                track.appendChild(handle);
            });
            track.addEventListener("click", e => {
                if (e.target !== track) return;
                e.stopPropagation();
                const rect = track.getBoundingClientRect();
                const pos = Math.max(0, Math.min(100, Math.round((e.clientX - rect.left) / rect.width * 100)));
                const c = _lerpGradColor(stops, pos);
                applyToAll(targets, o => o.stroke.stops.push({ color: c, pos }));
                selStrkStop = stroke.stops.length - 1;
                buildStrkBar();
            });
            strkBarWrap.appendChild(track);
            if (stops.length > 0) {
                const si = Math.min(selStrkStop, stops.length - 1);
                const s = stops[si];
                const edRow = el("div", { class: "grad-stop-editor-row" });
                const cp = makeColorPickerBtn(s.color, c => { applyToAll(targets, o => { if (o.stroke.stops[si]) o.stroke.stops[si].color = c; }); buildStrkBar(); });
                const pi = el("input", { type: "number", min: 0, max: 100, value: s.pos, class: "small" });
                pi.onchange = () => { const p = Math.max(0, Math.min(100, parseInt(pi.value) || 0)); applyToAll(targets, o => { if (o.stroke.stops[si]) o.stroke.stops[si].pos = p; }); pi.value = p; buildStrkBar(); };
                edRow.append(cp, pi, el("span", { text: "%", class: "small" }));
                if (stops.length > 2) { const db = el("button", { text: "✕" }); db.onclick = () => { applyToAll(targets, o => { if (o.stroke.stops.length > 2) o.stroke.stops.splice(si, 1); }); if (selStrkStop >= stroke.stops.length) selStrkStop = stroke.stops.length - 1; buildStrkBar(); }; edRow.appendChild(db); }
                strkBarWrap.appendChild(edRow);
            }
        };
        buildStrkBar();
        container.appendChild(strkBarWrap);
    } else {
        const colorInput = makeColorPickerBtn(stroke.color, c => applyToAll(targets, o => o.stroke.color = c), { allowNone: true });
        container.appendChild(row("Color", colorInput));
    }

    const widthInput = el("input", { type: "number", value: stroke.width, min: 0, max: 40, class: "small" });
    widthInput.onchange = () => applyToAll(targets, o => o.stroke.width = parseFloat(widthInput.value) || 0);

    const dashSelect = el("select");
    [["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"], ["longdash", "Long Dash"],
     ["dashdot", "Dash Dot"], ["longdashdot", "Long Dash Dot"]].forEach(([v, l]) => dashSelect.appendChild(el("option", { value: v, text: l })));
    dashSelect.value = stroke.dash || "solid";
    dashSelect.onchange = () => applyToAll(targets, o => o.stroke.dash = dashSelect.value);

    const capSelect = el("select");
    [["butt", "Flat"], ["round", "Round"], ["square", "Square"]].forEach(([v, l]) => capSelect.appendChild(el("option", { value: v, text: l })));
    capSelect.value = stroke.cap || "butt";
    capSelect.onchange = () => applyToAll(targets, o => o.stroke.cap = capSelect.value);

    const joinSelect = el("select");
    [["miter", "Miter"], ["round", "Round"], ["bevel", "Bevel"]].forEach(([v, l]) => joinSelect.appendChild(el("option", { value: v, text: l })));
    joinSelect.value = stroke.join || "miter";
    joinSelect.onchange = () => applyToAll(targets, o => o.stroke.join = joinSelect.value);

    container.appendChild(row("Width", widthInput, el("span", { text: "px" })));
    container.appendChild(row("Style", dashSelect));
    container.appendChild(row("Cap", capSelect));
    container.appendChild(row("Join", joinSelect));
    return container;
}

// ============ Ribbon tab switching ============
document.querySelectorAll(".ribbon-tab").forEach(tab => {
    // switching tabs to reach the Home tab's formatting buttons shouldn't
    // blur an in-progress text edit / discard the highlighted selection
    tab.addEventListener("mousedown", (e) => e.preventDefault());
    tab.onclick = () => {
        document.querySelectorAll(".ribbon-tab").forEach(t => t.classList.toggle("active", t === tab));
        const target = tab.dataset.ribbonTab;
        document.querySelectorAll(".ribbon-content").forEach(p => p.classList.toggle("active", p.dataset.ribbonPanel === target));
    };
});

// ============ Edit Shape tab ============
const shapeFormatTab = document.getElementById("shapeFormatTab");
const shapeStylesRibbonGroup = document.getElementById("shapeStylesRibbonGroup");
const shapeStylesRibbonGallery = document.getElementById("shapeStylesRibbonGallery");
const shapeFlipHBtn = document.getElementById("shapeFlipHBtn");
const shapeFlipVBtn = document.getElementById("shapeFlipVBtn");
const shapeRotateLeftBtn = document.getElementById("shapeRotateLeftBtn");
const shapeRotateRightBtn = document.getElementById("shapeRotateRightBtn");
const saveMyShapeBtn = document.getElementById("saveMyShapeBtn");
const editPointsRibbonGroup = document.getElementById("editPointsRibbonGroup");
const editPointsBtn = document.getElementById("editPointsBtn");
const mergeShapesRibbonGroup = document.getElementById("mergeShapesRibbonGroup");
const mergeUnionBtn = document.getElementById("mergeUnionBtn");
const mergeCombineBtn = document.getElementById("mergeCombineBtn");
const mergeIntersectBtn = document.getElementById("mergeIntersectBtn");
const mergeSubtractBtn = document.getElementById("mergeSubtractBtn");

function shapeFormatTargets() {
    return state.selection.map(getObj).filter(Boolean);
}

function shapeStyleTargets() {
    const objs = shapeFormatTargets();
    if (objs.length === 0) return [];
    if (objs.some(o => ["image", "group", "chart", "zoom", "video", "audio"].includes(o.type))) return [];
    return objs;
}

function updateShapeFormatTab() {
    const targets = shapeFormatTargets();
    const styleTargets = shapeStyleTargets();
    const wasActive = shapeFormatTab.classList.contains("active");
    const wasHidden = shapeFormatTab.style.display === "none";
    shapeFormatTab.style.display = targets.length ? "" : "none";
    if (!targets.length && wasActive) {
        shapeFormatTab.classList.remove("active");
        document.querySelector('.ribbon-tab[data-ribbon-tab="home"]').classList.add("active");
        document.querySelectorAll(".ribbon-content").forEach(p => p.classList.toggle("active", p.dataset.ribbonPanel === "home"));
    }
    // Auto-switch to Edit Shape when shapes are newly selected (tab was hidden, no images in selection)
    if (wasHidden && styleTargets.length && !picTargets().length) {
        document.querySelectorAll(".ribbon-tab").forEach(t => t.classList.remove("active"));
        shapeFormatTab.classList.add("active");
        document.querySelectorAll(".ribbon-content").forEach(p => p.classList.toggle("active", p.dataset.ribbonPanel === "shapeFormat"));
    }
    shapeStylesRibbonGroup.style.display = styleTargets.length ? "" : "none";
    if (styleTargets.length) renderShapeStylesRibbonGallery(styleTargets);

    // Show fill/outline/effects groups only for style-capable objects
    const sfFillGroup = document.getElementById("shapeFillRibbonGroup");
    const sfEffectsGroup = document.getElementById("shapeEffectsRibbonGroup");
    if (sfFillGroup) sfFillGroup.style.display = styleTargets.length ? "" : "none";
    if (sfEffectsGroup) sfEffectsGroup.style.display = styleTargets.length ? "" : "none";

    if (styleTargets.length) updateShapeRibbonControls(styleTargets);

    const canEditPoints = targets.length === 1 && EDIT_POINTS_SHAPE_TYPES.includes(targets[0].type);
    editPointsRibbonGroup.style.display = canEditPoints ? "" : "none";
    if (!canEditPoints && state.editPoints) { state.editPoints = null; render(); }
    if (state.editPoints && (!targets.length || targets[0].id !== state.editPoints)) {
        state.editPoints = null;
        render();
    }
    editPointsBtn.classList.toggle("active", !!state.editPoints);

    const canMerge = targets.length >= 2 && targets.every(o => MERGE_SHAPE_TYPES.includes(o.type));
    mergeShapesRibbonGroup.style.display = canMerge ? "" : "none";
}

mergeUnionBtn.onclick = () => mergeShapes("union");
mergeCombineBtn.onclick = () => mergeShapes("combine");
mergeIntersectBtn.onclick = () => mergeShapes("intersect");
mergeSubtractBtn.onclick = () => mergeShapes("subtract");

// ============ Edit Shape — Fill / Outline / Effects ribbon controls ============

function updateShapeRibbonControls(targets) {
    const obj = targets[0];
    // Fill swatch
    const swatch = document.getElementById("shapeFillSwatch");
    if (swatch) {
        const f = obj.fill || { type: "solid", color: "#a4c2e0" };
        if (f.type === "gradient" && f.stops && f.stops.length >= 2) {
            swatch.style.background = `linear-gradient(90deg,${f.stops[0].color},${f.stops[f.stops.length-1].color})`;
        } else {
            swatch.style.background = (f.color === "none") ? "repeating-linear-gradient(45deg,#ccc 0,#ccc 3px,#fff 3px,#fff 6px)" : (f.color || "#a4c2e0");
        }
    }
    // Outline swatch
    const oSwatch = document.getElementById("shapeOutlineSwatch");
    if (oSwatch) {
        const s = obj.stroke || { color: "#1a1a1a" };
        const c = s.type === "gradient" && s.stops ? s.stops[0].color : s.color;
        oSwatch.style.background = (!c || c === "none") ? "repeating-linear-gradient(45deg,#ccc 0,#ccc 3px,#fff 3px,#fff 6px)" : c;
    }
    // Effect button active states
    const shadowBtn = document.getElementById("shapeShadowBtn");
    const glowBtn = document.getElementById("shapeGlowBtn");
    const reflectionBtn = document.getElementById("shapeReflectionBtn");
    if (shadowBtn) shadowBtn.classList.toggle("active", !!obj.shadow);
    if (glowBtn) glowBtn.classList.toggle("active", !!obj.glow);
    if (reflectionBtn) reflectionBtn.classList.toggle("active", !!obj.reflection);
}

function syncShapeRibbonMenus() {
    const targets = shapeStyleTargets();
    if (!targets.length) return;
    const obj = targets[0];

    // Shadow
    document.getElementById("sfShadowEnable").checked = !!obj.shadow;
    document.getElementById("sfShadowColor").value = obj.shadowColor || "#000000";
    const sfShadowBlur = document.getElementById("sfShadowBlur"); sfShadowBlur.value = obj.shadowBlur ?? 4; document.getElementById("sfShadowBlurVal").textContent = sfShadowBlur.value;
    const sfShadowDist = document.getElementById("sfShadowDist"); sfShadowDist.value = obj.shadowDistance ?? 4; document.getElementById("sfShadowDistVal").textContent = sfShadowDist.value;
    const sfShadowAngle = document.getElementById("sfShadowAngle"); sfShadowAngle.value = obj.shadowAngle ?? 45; document.getElementById("sfShadowAngleVal").textContent = sfShadowAngle.value + "°";
    const sfShadowOpacity = document.getElementById("sfShadowOpacity"); sfShadowOpacity.value = obj.shadowOpacity ?? 40; document.getElementById("sfShadowOpacityVal").textContent = sfShadowOpacity.value + "%";

    // Glow
    document.getElementById("sfGlowEnable").checked = !!obj.glow;
    document.getElementById("sfGlowColor").value = obj.glowColor || "#65c8d6";
    const sfGlowSize = document.getElementById("sfGlowSize"); sfGlowSize.value = obj.glowSize ?? 6; document.getElementById("sfGlowSizeVal").textContent = sfGlowSize.value;
    const sfGlowOpacity = document.getElementById("sfGlowOpacity"); sfGlowOpacity.value = obj.glowOpacity ?? 85; document.getElementById("sfGlowOpacityVal").textContent = sfGlowOpacity.value + "%";

    // Reflection
    document.getElementById("sfReflectionEnable").checked = !!obj.reflection;
    const sfRefSize = document.getElementById("sfReflectionSize"); sfRefSize.value = obj.reflectionSize ?? 50; document.getElementById("sfReflectionSizeVal").textContent = sfRefSize.value + "%";
    const sfRefOpacity = document.getElementById("sfReflectionOpacity"); sfRefOpacity.value = obj.reflectionOpacity ?? 50; document.getElementById("sfReflectionOpacityVal").textContent = sfRefOpacity.value + "%";
}

// Wire dropdowns
initPicDropdown("shapeFillBtn", "shapeFillMenu");
initPicDropdown("shapeOutlineBtn", "shapeOutlineMenu");
initPicDropdown("shapeShadowBtn", "shapeShadowMenu");
initPicDropdown("shapeGlowBtn", "shapeGlowMenu");
initPicDropdown("shapeReflectionBtn", "shapeReflectionMenu");

function rebuildShapeFillMenu() {
    const targets = shapeStyleTargets();
    if (!targets.length) return;
    const menu = document.getElementById("shapeFillMenu");
    if (!menu) return;
    menu.innerHTML = "";
    const refreshFn = () => { render(); rebuildShapeFillMenu(); updateShapeRibbonControls(shapeStyleTargets()); };
    menu.appendChild(buildFillSection(targets[0], targets, refreshFn));
}

function rebuildShapeOutlineMenu() {
    const targets = shapeStyleTargets();
    if (!targets.length) return;
    const menu = document.getElementById("shapeOutlineMenu");
    if (!menu) return;
    menu.innerHTML = "";
    const refreshFn = () => { render(); rebuildShapeOutlineMenu(); updateShapeRibbonControls(shapeStyleTargets()); };
    menu.appendChild(buildStrokeSection(targets[0], targets, refreshFn));
}

// Rebuild fill/outline menus dynamically when opened; sync shadow/glow/reflection from state
document.getElementById("shapeFillBtn")?.addEventListener("click", () => {
    if (shapeStyleTargets().length) rebuildShapeFillMenu();
});
document.getElementById("shapeOutlineBtn")?.addEventListener("click", () => {
    if (shapeStyleTargets().length) rebuildShapeOutlineMenu();
});
["shapeShadowBtn","shapeGlowBtn","shapeReflectionBtn"].forEach(id => {
    document.getElementById(id)?.addEventListener("click", () => {
        const targets = shapeStyleTargets();
        if (targets.length) syncShapeRibbonMenus();
    });
});

// Shadow controls
document.getElementById("sfShadowEnable").onchange = () => {
    const targets = shapeStyleTargets(); if (!targets.length) return;
    const v = document.getElementById("sfShadowEnable").checked;
    pushHistory(true); applyToAll(targets, o => o.shadow = v); render(); updateShapeRibbonControls(targets);
};
document.getElementById("sfShadowColor").oninput = () => {
    const targets = shapeStyleTargets(); if (!targets.length) return;
    applyToAll(targets, o => o.shadowColor = document.getElementById("sfShadowColor").value); render();
};
document.getElementById("sfShadowColor").onchange = () => pushHistory(true);
["sfShadowBlur","sfShadowDist","sfShadowAngle","sfShadowOpacity"].forEach(id => {
    const el2 = document.getElementById(id);
    const valId = id + "Val";
    const suffix = id === "sfShadowAngle" ? "°" : (id === "sfShadowOpacity" ? "%" : "");
    const prop = { sfShadowBlur: "shadowBlur", sfShadowDist: "shadowDistance", sfShadowAngle: "shadowAngle", sfShadowOpacity: "shadowOpacity" }[id];
    el2.oninput = () => {
        const v = parseInt(el2.value);
        document.getElementById(valId).textContent = v + suffix;
        const t = shapeStyleTargets(); if (!t.length) return;
        applyToAll(t, o => o[prop] = v); render();
    };
    el2.onchange = () => pushHistory(true);
});

// Glow controls
document.getElementById("sfGlowEnable").onchange = () => {
    const targets = shapeStyleTargets(); if (!targets.length) return;
    const v = document.getElementById("sfGlowEnable").checked;
    pushHistory(true); applyToAll(targets, o => o.glow = v); render(); updateShapeRibbonControls(targets);
};
document.getElementById("sfGlowColor").oninput = () => {
    const targets = shapeStyleTargets(); if (!targets.length) return;
    applyToAll(targets, o => o.glowColor = document.getElementById("sfGlowColor").value); render();
};
document.getElementById("sfGlowColor").onchange = () => pushHistory(true);
["sfGlowSize","sfGlowOpacity"].forEach(id => {
    const el2 = document.getElementById(id);
    const valId = id + "Val";
    const suffix = id === "sfGlowOpacity" ? "%" : "";
    const prop = { sfGlowSize: "glowSize", sfGlowOpacity: "glowOpacity" }[id];
    el2.oninput = () => {
        const v = parseInt(el2.value);
        document.getElementById(valId).textContent = v + suffix;
        const t = shapeStyleTargets(); if (!t.length) return;
        applyToAll(t, o => o[prop] = v); render();
    };
    el2.onchange = () => pushHistory(true);
});

// Reflection controls
document.getElementById("sfReflectionEnable").onchange = () => {
    const targets = shapeStyleTargets(); if (!targets.length) return;
    const v = document.getElementById("sfReflectionEnable").checked;
    pushHistory(true); applyToAll(targets, o => o.reflection = v); render(); updateShapeRibbonControls(targets);
};
["sfReflectionSize","sfReflectionOpacity"].forEach(id => {
    const el2 = document.getElementById(id);
    const valId = id + "Val";
    const prop = { sfReflectionSize: "reflectionSize", sfReflectionOpacity: "reflectionOpacity" }[id];
    el2.oninput = () => {
        const v = parseInt(el2.value);
        document.getElementById(valId).textContent = v + "%";
        const t = shapeStyleTargets(); if (!t.length) return;
        applyToAll(t, o => o[prop] = v); render();
    };
    el2.onchange = () => pushHistory(true);
});

editPointsBtn.onclick = () => {
    const targets = shapeFormatTargets();
    if (targets.length !== 1 || !EDIT_POINTS_SHAPE_TYPES.includes(targets[0].type)) return;
    const obj = targets[0];
    if (state.editPoints === obj.id) {
        state.editPoints = null;
    } else {
        if (!obj.customPoints) {
            const pts = getShapePoints(obj);
            obj.customPoints = pts.map(p => ({ x: (p[0] - obj.x) / obj.w, y: (p[1] - obj.y) / obj.h }));
        }
        state.editPoints = obj.id;
    }
    render();
    editPointsBtn.classList.toggle("active", !!state.editPoints);
};

function renderShapeStylesRibbonGallery(targets) {
    shapeStylesRibbonGallery.innerHTML = "";
    const obj = targets[0];
    SHAPE_STYLE_PRESETS.forEach(preset => {
        const swatch = el("button", { class: "style-swatch ribbon-swatch", title: preset.name });
        const preview = JSON.parse(JSON.stringify(obj));
        preset.apply(preview);
        const fill = preview.fill;
        if (fill.type === "gradient") {
            const stops = fill.stops.map(s => `${s.color} ${s.pos}%`).join(", ");
            swatch.style.background = `linear-gradient(135deg, ${stops})`;
        } else {
            swatch.style.background = fill.color === "none" ? "#ffffff" : fill.color;
        }
        swatch.style.borderColor = preview.stroke.color === "none" ? "#d6dbe1" : preview.stroke.color;
        swatch.style.borderWidth = Math.min(preview.stroke.width || 1, 4) + "px";
        if (preview.shadow) swatch.style.boxShadow = "2px 2px 4px rgba(0,0,0,0.3)";
        swatch.onclick = () => {
            pushHistory(true);
            applyToAll(targets, o => preset.apply(o));
            renderProperties();
        };
        shapeStylesRibbonGallery.appendChild(swatch);
    });
}

shapeFlipHBtn.onclick = () => {
    const targets = shapeFormatTargets();
    if (!targets.length) return;
    pushHistory(true);
    applyToAll(targets, flipObjectScreenH);
    renderProperties();
};
shapeFlipVBtn.onclick = () => {
    const targets = shapeFormatTargets();
    if (!targets.length) return;
    pushHistory(true);
    applyToAll(targets, flipObjectScreenV);
    renderProperties();
};
shapeRotateLeftBtn.onclick = () => {
    const targets = shapeFormatTargets();
    if (!targets.length) return;
    pushHistory(true);
    applyToAll(targets, o => o.rotation = ((o.rotation || 0) - 90 + 360) % 360);
    renderProperties();
};
shapeRotateRightBtn.onclick = () => {
    const targets = shapeFormatTargets();
    if (!targets.length) return;
    pushHistory(true);
    applyToAll(targets, o => o.rotation = ((o.rotation || 0) + 90) % 360);
    renderProperties();
};

// ============ Text Effects tab ============
const textEffectsTab = document.getElementById("textEffectsTab");
const txTextColorInput = document.getElementById("txTextColorInput");
const txLetterSpacing = document.getElementById("txLetterSpacing");
const txLetterSpacingVal = document.getElementById("txLetterSpacingVal");
const txOutlineEnable = document.getElementById("txOutlineEnable");
const txOutlineColor = document.getElementById("txOutlineColor");
const txOutlineWidth = document.getElementById("txOutlineWidth");
const txOutlineWidthVal = document.getElementById("txOutlineWidthVal");
const txShadowEnable = document.getElementById("txShadowEnable");
const txShadowColor = document.getElementById("txShadowColor");
const txShadowBlur = document.getElementById("txShadowBlur");
const txShadowBlurVal = document.getElementById("txShadowBlurVal");
const txShadowDist = document.getElementById("txShadowDist");
const txShadowDistVal = document.getElementById("txShadowDistVal");
const txShadowAngle = document.getElementById("txShadowAngle");
const txShadowAngleVal = document.getElementById("txShadowAngleVal");
const txShadowOpacity = document.getElementById("txShadowOpacity");
const txShadowOpacityVal = document.getElementById("txShadowOpacityVal");
const txGlowEnable = document.getElementById("txGlowEnable");
const txGlowColor = document.getElementById("txGlowColor");
const txGlowSize = document.getElementById("txGlowSize");
const txGlowSizeVal = document.getElementById("txGlowSizeVal");
const txGlowOpacity = document.getElementById("txGlowOpacity");
const txGlowOpacityVal = document.getElementById("txGlowOpacityVal");

function updateTextEffectsTab() {
    const targets = getTextTargets();
    const wasActive = textEffectsTab.classList.contains("active");
    textEffectsTab.style.display = targets.length ? "" : "none";
    if (!targets.length && wasActive) {
        textEffectsTab.classList.remove("active");
        document.querySelector('.ribbon-tab[data-ribbon-tab="home"]').classList.add("active");
        document.querySelectorAll(".ribbon-content").forEach(p => p.classList.toggle("active", p.dataset.ribbonPanel === "home"));
    }
    if (!targets.length) return;
    const obj = targets[0];

    txTextColorInput.value = obj.fontColor || "#000000";
    txLetterSpacing.value = obj.letterSpacing ?? 0;
    txLetterSpacingVal.textContent = (obj.letterSpacing ?? 0) + "px";

    txOutlineEnable.checked = !!obj.textOutline;
    txOutlineColor.value = obj.textOutlineColor || "#000000";
    txOutlineWidth.value = obj.textOutlineWidth ?? 1;
    txOutlineWidthVal.textContent = (obj.textOutlineWidth ?? 1) + "px";

    txShadowEnable.checked = !!obj.textShadow;
    txShadowColor.value = obj.textShadowColor || "#000000";
    txShadowBlur.value = obj.textShadowBlur ?? 4;
    txShadowBlurVal.textContent = obj.textShadowBlur ?? 4;
    txShadowDist.value = obj.textShadowDistance ?? 2;
    txShadowDistVal.textContent = obj.textShadowDistance ?? 2;
    txShadowAngle.value = obj.textShadowAngle ?? 45;
    txShadowAngleVal.textContent = (obj.textShadowAngle ?? 45) + "°";
    txShadowOpacity.value = obj.textShadowOpacity ?? 55;
    txShadowOpacityVal.textContent = (obj.textShadowOpacity ?? 55) + "%";

    txGlowEnable.checked = !!obj.textGlow;
    txGlowColor.value = obj.textGlowColor || "#65c8d6";
    txGlowSize.value = obj.textGlowSize ?? 6;
    txGlowSizeVal.textContent = obj.textGlowSize ?? 6;
    txGlowOpacity.value = obj.textGlowOpacity ?? 85;
    txGlowOpacityVal.textContent = (obj.textGlowOpacity ?? 85) + "%";
}

// Applies `fn` to every selected text target, re-rendering live without
// pushing an undo step (for slider drags); call pushHistory(true) separately
// on "change" to commit the step once the drag ends.
function applyToTextTargetsLive(fn) {
    const targets = getTextTargets();
    if (!targets.length) return;
    targets.forEach(fn);
    render();
}

txTextColorInput.oninput = () => applyToTextSelection(o => { o.fontColor = txTextColorInput.value; });

txLetterSpacing.oninput = () => {
    txLetterSpacingVal.textContent = txLetterSpacing.value + "px";
    applyToTextTargetsLive(o => o.letterSpacing = parseFloat(txLetterSpacing.value));
};
txLetterSpacing.onchange = () => pushHistory(true);

txOutlineEnable.onchange = () => applyToTextSelection(o => o.textOutline = txOutlineEnable.checked);
txOutlineColor.oninput = () => applyToTextTargetsLive(o => o.textOutlineColor = txOutlineColor.value);
txOutlineColor.onchange = () => pushHistory(true);
txOutlineWidth.oninput = () => {
    txOutlineWidthVal.textContent = txOutlineWidth.value + "px";
    applyToTextTargetsLive(o => o.textOutlineWidth = parseFloat(txOutlineWidth.value));
};
txOutlineWidth.onchange = () => pushHistory(true);

txShadowEnable.onchange = () => applyToTextSelection(o => o.textShadow = txShadowEnable.checked);
txShadowColor.oninput = () => applyToTextTargetsLive(o => o.textShadowColor = txShadowColor.value);
txShadowColor.onchange = () => pushHistory(true);
txShadowBlur.oninput = () => {
    txShadowBlurVal.textContent = txShadowBlur.value;
    applyToTextTargetsLive(o => o.textShadowBlur = parseInt(txShadowBlur.value));
};
txShadowBlur.onchange = () => pushHistory(true);
txShadowDist.oninput = () => {
    txShadowDistVal.textContent = txShadowDist.value;
    applyToTextTargetsLive(o => o.textShadowDistance = parseInt(txShadowDist.value));
};
txShadowDist.onchange = () => pushHistory(true);
txShadowAngle.oninput = () => {
    txShadowAngleVal.textContent = txShadowAngle.value + "°";
    applyToTextTargetsLive(o => o.textShadowAngle = parseInt(txShadowAngle.value));
};
txShadowAngle.onchange = () => pushHistory(true);
txShadowOpacity.oninput = () => {
    txShadowOpacityVal.textContent = txShadowOpacity.value + "%";
    applyToTextTargetsLive(o => o.textShadowOpacity = parseInt(txShadowOpacity.value));
};
txShadowOpacity.onchange = () => pushHistory(true);

txGlowEnable.onchange = () => applyToTextSelection(o => o.textGlow = txGlowEnable.checked);
txGlowColor.oninput = () => applyToTextTargetsLive(o => o.textGlowColor = txGlowColor.value);
txGlowColor.onchange = () => pushHistory(true);
txGlowSize.oninput = () => {
    txGlowSizeVal.textContent = txGlowSize.value;
    applyToTextTargetsLive(o => o.textGlowSize = parseInt(txGlowSize.value));
};
txGlowSize.onchange = () => pushHistory(true);
txGlowOpacity.oninput = () => {
    txGlowOpacityVal.textContent = txGlowOpacity.value + "%";
    applyToTextTargetsLive(o => o.textGlowOpacity = parseInt(txGlowOpacity.value));
};
txGlowOpacity.onchange = () => pushHistory(true);

// ============ Format Picture tab ============
const formatPictureTab = document.getElementById("formatPictureTab");

function picTargets() {
    return state.selection.map(getObj).filter(o => o && o.type === "image");
}

function updateFormatPictureTab() {
    const targets = picTargets();
    const wasActive = formatPictureTab.classList.contains("active");
    const wasHidden = formatPictureTab.style.display === "none";
    formatPictureTab.style.display = targets.length ? "" : "none";
    if (!targets.length && wasActive) {
        formatPictureTab.classList.remove("active");
        document.querySelector('.ribbon-tab[data-ribbon-tab="home"]').classList.add("active");
        document.querySelectorAll(".ribbon-content").forEach(p => p.classList.toggle("active", p.dataset.ribbonPanel === "home"));
        return;
    }
    if (!targets.length) return;
    // Auto-switch to Format Picture when image(s) are newly selected (tab was hidden before)
    if (wasHidden) {
        document.querySelectorAll(".ribbon-tab").forEach(t => t.classList.remove("active"));
        formatPictureTab.classList.add("active");
        document.querySelectorAll(".ribbon-content").forEach(p => p.classList.toggle("active", p.dataset.ribbonPanel === "formatPicture"));
    }
    const obj = targets[0];
    document.getElementById("picBrightnessSlider").value = obj.imgBrightness ?? 100;
    document.getElementById("picBrightnessVal").textContent = (obj.imgBrightness ?? 100) + "%";
    document.getElementById("picContrastSlider").value = obj.imgContrast ?? 100;
    document.getElementById("picContrastVal").textContent = (obj.imgContrast ?? 100) + "%";
    document.getElementById("picSharpenSlider").value = obj.imgSharpen ?? 0;
    document.getElementById("picSharpenVal").textContent = obj.imgSharpen ?? 0;
    document.getElementById("picSaturationSlider").value = obj.imgSaturation ?? 100;
    document.getElementById("picSaturationVal").textContent = (obj.imgSaturation ?? 100) + "%";
    document.getElementById("picHueSlider").value = obj.imgHue ?? 0;
    document.getElementById("picHueVal").textContent = (obj.imgHue ?? 0) + "°";
    // Tone sliders
    function syncSlider(id, valId, val, fmt) {
        const el = document.getElementById(id); const vl = document.getElementById(valId);
        if (el) el.value = val ?? 0;
        if (vl) vl.textContent = fmt ? fmt(val ?? 0) : (val ?? 0);
    }
    const signFmt = v => (v > 0 ? "+" : "") + v;
    syncSlider("picHighlightsSlider","picHighlightsVal", obj.imgHighlights, signFmt);
    syncSlider("picShadowsSlider",   "picShadowsVal",   obj.imgShadows,    signFmt);
    syncSlider("picWhitesSlider",    "picWhitesVal",    obj.imgWhites,     signFmt);
    syncSlider("picBlacksSlider",    "picBlacksVal",    obj.imgBlacks,     signFmt);
    syncSlider("picClaritySlider",   "picClarityVal",   obj.imgClarity,    signFmt);
    syncSlider("picTempSlider",      "picTempVal",      obj.imgTemperature,signFmt);
    syncSlider("picTintSlider",      "picTintVal",      obj.imgTint,       signFmt);
    syncSlider("picVibranceSlider",  "picVibranceVal",  obj.imgVibrance,   signFmt);
    syncSlider("picVignetteSlider",  "picVignetteVal",  obj.imgVignette,   v => v);
    syncSlider("picGrainSlider",     "picGrainVal",     obj.imgGrain,      v => v);
    syncSlider("picNoiseSlider",     "picNoiseVal",     obj.imgNoise,      v => v);
    document.getElementById("picOpacitySlider").value = obj.opacity ?? 100;
    document.getElementById("picOpacityVal").textContent = (obj.opacity ?? 100) + "%";
    document.getElementById("picBorderColorInput").value = obj.picBorderColor || "#000000";
    document.getElementById("picBorderWidthSlider").value = obj.picBorderWidth ?? 0;
    document.getElementById("picBorderWidthVal").textContent = (obj.picBorderWidth ?? 0) + "px";
    document.getElementById("picShadowEnable").checked = !!obj.shadow;
    document.getElementById("picShadowColor").value = obj.shadowColor || "#000000";
    document.getElementById("picShadowBlur").value = obj.shadowBlur ?? 8;
    document.getElementById("picShadowBlurVal").textContent = obj.shadowBlur ?? 8;
    document.getElementById("picShadowDist").value = obj.shadowDistance ?? 4;
    document.getElementById("picShadowDistVal").textContent = obj.shadowDistance ?? 4;
    document.getElementById("picGlowEnable").checked = !!obj.glow;
    document.getElementById("picGlowColor").value = obj.glowColor || "#65c8d6";
    document.getElementById("picGlowSize").value = obj.glowSize ?? 6;
    document.getElementById("picGlowSizeVal").textContent = obj.glowSize ?? 6;
    document.getElementById("picReflectionEnable").checked = !!obj.reflection;
    document.getElementById("picReflectionOffset").value = obj.reflectionSize ?? 50;
    document.getElementById("picReflectionOffsetVal").textContent = obj.reflectionSize ?? 50;
    document.getElementById("picCropTop").value = obj.imgCrop?.top ?? 0;
    document.getElementById("picCropRight").value = obj.imgCrop?.right ?? 0;
    document.getElementById("picCropBottom").value = obj.imgCrop?.bottom ?? 0;
    document.getElementById("picCropLeft").value = obj.imgCrop?.left ?? 0;
    document.getElementById("picHeightInput").value = Math.round(obj.h);
    document.getElementById("picWidthInput").value = Math.round(obj.w);
    document.getElementById("picRotationInput").value = obj.rotation ?? 0;
    renderPicStylesGallery(obj);
}

function applyToPicTargets(fn) {
    const targets = picTargets();
    if (!targets.length) return;
    pushHistory(true);
    targets.forEach(fn);
    render();
}

function applyToPicTargetsLive(fn) {
    const targets = picTargets();
    if (!targets.length) return;
    targets.forEach(fn);
    render();
}

// Close all pic dropdown menus
function closePicMenus() {
    document.querySelectorAll(".pic-adj-menu").forEach(m => m.style.display = "none");
}

// Init a pic-adj-dropdown button
function initPicDropdown(btnId, menuId) {
    const btn = document.getElementById(btnId);
    const menu = document.getElementById(menuId);
    if (!btn || !menu) return;
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const wasOpen = menu.style.display !== "none";
        closePicMenus();
        if (!wasOpen) {
            const r = btn.getBoundingClientRect();
            menu.style.left = r.left + "px";
            menu.style.top = (r.bottom + 2) + "px";
            menu.style.display = "block";
        }
    });
}

// Close pic menus on outside click
document.addEventListener("click", (e) => {
    if (!e.target.closest(".pic-adj-dropdown") && !e.target.closest(".pic-adj-menu")) {
        closePicMenus();
    }
});

// Init all Format Picture dropdowns
initPicDropdown("picCorrectionsBtn", "picCorrectionsMenu");
initPicDropdown("picColourBtn", "picColourMenu");
initPicDropdown("picArtisticBtn", "picArtisticMenu");
initPicDropdown("picTransparencyBtn", "picTransparencyMenu");
initPicDropdown("picChangeBtn", "picChangeMenu");
initPicDropdown("picResetBtn", "picResetMenu");
initPicDropdown("picBorderBtn", "picBorderMenu");
initPicDropdown("picEffectsBtn", "picEffectsMenu");
initPicDropdown("picBringForwardBtn", "picBringForwardMenu");
initPicDropdown("picSendBackwardBtn", "picSendBackwardMenu");
initPicDropdown("picAlignBtn", "picAlignMenu");
initPicDropdown("picGroupBtn", "picGroupMenu");
initPicDropdown("picRotateBtn", "picRotateMenu");
initPicDropdown("picCropBtn", "picCropMenu");

// ---- Adjust: Corrections ----
const picBrightnessSlider = document.getElementById("picBrightnessSlider");
const picBrightnessVal = document.getElementById("picBrightnessVal");
const picContrastSlider = document.getElementById("picContrastSlider");
const picContrastVal = document.getElementById("picContrastVal");
const picSharpenSlider = document.getElementById("picSharpenSlider");
const picSharpenVal = document.getElementById("picSharpenVal");

picBrightnessSlider.oninput = () => {
    picBrightnessVal.textContent = picBrightnessSlider.value + "%";
    applyToPicTargetsLive(o => o.imgBrightness = parseInt(picBrightnessSlider.value));
};
picBrightnessSlider.onchange = () => pushHistory(true);

picContrastSlider.oninput = () => {
    picContrastVal.textContent = picContrastSlider.value + "%";
    applyToPicTargetsLive(o => o.imgContrast = parseInt(picContrastSlider.value));
};
picContrastSlider.onchange = () => pushHistory(true);

picSharpenSlider.oninput = () => {
    picSharpenVal.textContent = picSharpenSlider.value;
    applyToPicTargetsLive(o => o.imgSharpen = parseFloat(picSharpenSlider.value));
};
picSharpenSlider.onchange = () => pushHistory(true);

// ---- Adjust: Colour ----
const picSaturationSlider = document.getElementById("picSaturationSlider");
const picSaturationVal = document.getElementById("picSaturationVal");
const picHueSlider = document.getElementById("picHueSlider");
const picHueVal = document.getElementById("picHueVal");

picSaturationSlider.oninput = () => {
    picSaturationVal.textContent = picSaturationSlider.value + "%";
    applyToPicTargetsLive(o => o.imgSaturation = parseInt(picSaturationSlider.value));
};
picSaturationSlider.onchange = () => pushHistory(true);

picHueSlider.oninput = () => {
    picHueVal.textContent = picHueSlider.value + "°";
    applyToPicTargetsLive(o => o.imgHue = parseInt(picHueSlider.value));
};
picHueSlider.onchange = () => pushHistory(true);

// ---- Tone: Highlights / Shadows / Whites / Blacks ----
function makeSimpleSlider(id, valId, prop, fmt) {
    const sl = document.getElementById(id);
    const vl = document.getElementById(valId);
    if (!sl || !vl) return;
    sl.oninput = () => { vl.textContent = fmt(sl.value); applyToPicTargetsLive(o => o[prop] = parseFloat(sl.value)); };
    sl.onchange = () => pushHistory(true);
}
makeSimpleSlider("picHighlightsSlider", "picHighlightsVal", "imgHighlights", v => (v > 0 ? "+" : "") + v);
makeSimpleSlider("picShadowsSlider",    "picShadowsVal",    "imgShadows",    v => (v > 0 ? "+" : "") + v);
makeSimpleSlider("picWhitesSlider",     "picWhitesVal",     "imgWhites",     v => (v > 0 ? "+" : "") + v);
makeSimpleSlider("picBlacksSlider",     "picBlacksVal",     "imgBlacks",     v => (v > 0 ? "+" : "") + v);
makeSimpleSlider("picClaritySlider",    "picClarityVal",    "imgClarity",    v => (v > 0 ? "+" : "") + v);

// ---- White Balance: Temperature / Tint ----
makeSimpleSlider("picTempSlider",    "picTempVal",    "imgTemperature", v => (v > 0 ? "+" : "") + v);
makeSimpleSlider("picTintSlider",    "picTintVal",    "imgTint",        v => (v > 0 ? "+" : "") + v);
makeSimpleSlider("picVibranceSlider","picVibranceVal","imgVibrance",    v => (v > 0 ? "+" : "") + v);

// ---- Artistic: Vignette / Grain / Noise ----
makeSimpleSlider("picVignetteSlider","picVignetteVal","imgVignette",   v => v);
makeSimpleSlider("picGrainSlider",   "picGrainVal",   "imgGrain",      v => v);
makeSimpleSlider("picNoiseSlider",   "picNoiseVal",   "imgNoise",      v => v);

// ---- Rotate & Flip (ribbon large buttons) ----
document.getElementById("picFlipHRibbonBtn").addEventListener("click", () => {
    const targets = picTargets(); if (!targets.length) return;
    pushHistory(true); applyToAll(targets, flipObjectScreenH); render();
});
document.getElementById("picFlipVRibbonBtn").addEventListener("click", () => {
    const targets = picTargets(); if (!targets.length) return;
    pushHistory(true); applyToAll(targets, flipObjectScreenV); render();
});
document.getElementById("picRotateCWBtn").addEventListener("click", () => {
    applyToPicTargets(o => { o.rotation = ((o.rotation || 0) + 90) % 360; });
    updateFormatPictureTab();
});
document.getElementById("picRotateCCWBtn").addEventListener("click", () => {
    applyToPicTargets(o => { o.rotation = ((o.rotation || 0) - 90 + 360) % 360; });
    updateFormatPictureTab();
});

document.querySelectorAll(".pic-recolor-opt[data-recolor]").forEach(btn => {
    btn.addEventListener("click", () => {
        const val = btn.dataset.recolor;
        applyToPicTargets(o => {
            if (val === "none") {
                delete o.imgArtistic;
                delete o.imgHue;
                o.imgSaturation = 100;
            } else {
                o.imgArtistic = val;
            }
        });
        closePicMenus();
    });
});

// ---- Adjust: Artistic ----
document.querySelectorAll(".pic-artistic-opt").forEach(btn => {
    btn.addEventListener("click", () => {
        const val = btn.dataset.artistic;
        applyToPicTargets(o => {
            if (val === "none") delete o.imgArtistic;
            else o.imgArtistic = val;
        });
        closePicMenus();
    });
});

// ---- Adjust: Transparency ----
const picOpacitySlider = document.getElementById("picOpacitySlider");
const picOpacityVal = document.getElementById("picOpacityVal");

picOpacitySlider.oninput = () => {
    picOpacityVal.textContent = picOpacitySlider.value + "%";
    applyToPicTargetsLive(o => o.opacity = parseInt(picOpacitySlider.value));
};
picOpacitySlider.onchange = () => pushHistory(true);

document.querySelectorAll(".pic-recolor-opt[data-opacity]").forEach(btn => {
    btn.addEventListener("click", () => {
        const val = parseInt(btn.dataset.opacity);
        applyToPicTargets(o => o.opacity = val);
        closePicMenus();
    });
});

// ---- Manage: Compress (no-op toast) ----
document.getElementById("picCompressBtn").addEventListener("click", () => {
    closePicMenus();
    alert("Compress Pictures: Images in this editor are already stored at their original quality.");
});

// ---- Manage: Change Picture ----
const picChangeInput = document.getElementById("picChangeInput");

document.getElementById("picChangeFromFileBtn").addEventListener("click", () => {
    closePicMenus();
    picChangeInput.value = "";
    picChangeInput.click();
});

picChangeInput.addEventListener("change", () => {
    const file = picChangeInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        applyToPicTargets(o => {
            o.src = ev.target.result;
            delete o.imgCrop;
        });
    };
    reader.readAsDataURL(file);
});

document.getElementById("picChangeLinkBtn").addEventListener("click", () => {
    closePicMenus();
    const url = prompt("Enter image URL:");
    if (url && url.trim()) {
        applyToPicTargets(o => {
            o.src = url.trim();
            delete o.imgCrop;
        });
    }
});

// ---- Manage: Reset Picture ----
function resetImageProps(o) {
    delete o.imgBrightness; delete o.imgContrast; delete o.imgSaturation;
    delete o.imgHue; delete o.imgSharpen; delete o.imgArtistic;
    delete o.imgHighlights; delete o.imgShadows; delete o.imgWhites; delete o.imgBlacks;
    delete o.imgClarity; delete o.imgTemperature; delete o.imgTint; delete o.imgVibrance;
    delete o.imgVignette; delete o.imgGrain; delete o.imgNoise;
    delete o.imgCrop;
    delete o.picBorderWidth; delete o.picBorderColor; delete o.picBorderStyle;
}

document.getElementById("picResetImageBtn").addEventListener("click", () => {
    applyToPicTargets(o => resetImageProps(o));
    closePicMenus();
    updateFormatPictureTab();
});

document.getElementById("picResetSizeBtn").addEventListener("click", () => {
    applyToPicTargets(o => {
        resetImageProps(o);
        o.w = 200; o.h = 200;
    });
    closePicMenus();
    updateFormatPictureTab();
});

// ---- Picture Styles: Border ----
const picBorderColorInput = document.getElementById("picBorderColorInput");
const picBorderWidthSlider = document.getElementById("picBorderWidthSlider");
const picBorderWidthVal = document.getElementById("picBorderWidthVal");

picBorderColorInput.oninput = () => {
    applyToPicTargetsLive(o => o.picBorderColor = picBorderColorInput.value);
};
picBorderColorInput.onchange = () => pushHistory(true);

picBorderWidthSlider.oninput = () => {
    picBorderWidthVal.textContent = picBorderWidthSlider.value + "px";
    applyToPicTargetsLive(o => {
        o.picBorderWidth = parseFloat(picBorderWidthSlider.value);
        if (o.picBorderWidth > 0 && !o.picBorderStyle) o.picBorderStyle = "solid";
    });
};
picBorderWidthSlider.onchange = () => pushHistory(true);

document.querySelectorAll(".pic-recolor-opt[data-borderstyle]").forEach(btn => {
    btn.addEventListener("click", () => {
        const val = btn.dataset.borderstyle;
        applyToPicTargets(o => {
            if (val === "none") {
                o.picBorderWidth = 0;
                delete o.picBorderStyle;
            } else {
                o.picBorderStyle = val;
                if (!o.picBorderWidth) o.picBorderWidth = 2;
            }
        });
        closePicMenus();
        updateFormatPictureTab();
    });
});

// ---- Picture Styles: Effects (Shadow / Glow / Reflection) ----
document.getElementById("picShadowEnable").addEventListener("change", (e) => {
    applyToPicTargets(o => {
        o.shadow = e.target.checked;
        if (o.shadow && !o.shadowBlur) {
            o.shadowBlur = 8; o.shadowDistance = 4;
            o.shadowAngle = 45; o.shadowOpacity = 40;
            o.shadowColor = "#000000";
        }
    });
});
document.getElementById("picShadowColor").addEventListener("input", (e) => {
    applyToPicTargetsLive(o => o.shadowColor = e.target.value);
});
document.getElementById("picShadowColor").addEventListener("change", () => pushHistory(true));
document.getElementById("picShadowBlur").addEventListener("input", (e) => {
    document.getElementById("picShadowBlurVal").textContent = e.target.value;
    applyToPicTargetsLive(o => o.shadowBlur = parseInt(e.target.value));
});
document.getElementById("picShadowBlur").addEventListener("change", () => pushHistory(true));
document.getElementById("picShadowDist").addEventListener("input", (e) => {
    document.getElementById("picShadowDistVal").textContent = e.target.value;
    applyToPicTargetsLive(o => o.shadowDistance = parseInt(e.target.value));
});
document.getElementById("picShadowDist").addEventListener("change", () => pushHistory(true));

document.getElementById("picGlowEnable").addEventListener("change", (e) => {
    applyToPicTargets(o => {
        o.glow = e.target.checked;
        if (o.glow && !o.glowSize) {
            o.glowSize = 6; o.glowOpacity = 85; o.glowColor = "#65c8d6";
        }
    });
});
document.getElementById("picGlowColor").addEventListener("input", (e) => {
    applyToPicTargetsLive(o => o.glowColor = e.target.value);
});
document.getElementById("picGlowColor").addEventListener("change", () => pushHistory(true));
document.getElementById("picGlowSize").addEventListener("input", (e) => {
    document.getElementById("picGlowSizeVal").textContent = e.target.value;
    applyToPicTargetsLive(o => o.glowSize = parseInt(e.target.value));
});
document.getElementById("picGlowSize").addEventListener("change", () => pushHistory(true));

document.getElementById("picReflectionEnable").addEventListener("change", (e) => {
    applyToPicTargets(o => {
        o.reflection = e.target.checked;
        if (o.reflection && !o.reflectionSize) {
            o.reflectionSize = 50; o.reflectionOpacity = 50;
        }
    });
});
document.getElementById("picReflectionOffset").addEventListener("input", (e) => {
    document.getElementById("picReflectionOffsetVal").textContent = e.target.value;
    applyToPicTargetsLive(o => o.reflectionSize = parseInt(e.target.value));
});
document.getElementById("picReflectionOffset").addEventListener("change", () => pushHistory(true));

// ---- Picture Styles: Gallery ----
const PIC_STYLES = [
    // Row 1
    { name: "No Style",           props: { shadow:false, glow:false, reflection:false, picBorderWidth:0, imgBrightness:100, imgContrast:100, imgSaturation:100 },
      thumb: { w:"92%", h:"84%", border:"none",              shadow:"none",                                                          filter:"none",                      rotation:0,  radius:"1px"  } },
    { name: "Drop Shadow",        props: { shadow:true, shadowColor:"#000", shadowBlur:10, shadowDistance:4, shadowAngle:45, shadowOpacity:35, picBorderWidth:0 },
      thumb: { w:"82%", h:"72%", border:"none",              shadow:"4px 4px 0 rgba(0,0,0,0.55)",                                    filter:"none",                      rotation:0,  radius:"1px"  } },
    { name: "Simple Frame, White",props: { picBorderWidth:5, picBorderColor:"#fff", picBorderStyle:"solid", shadow:true, shadowBlur:6, shadowDistance:3, shadowColor:"#000", shadowOpacity:25, shadowAngle:45 },
      thumb: { w:"68%", h:"60%", border:"4px solid #fff",    shadow:"1.5px 2px 5px rgba(0,0,0,0.38)",                               filter:"none",                      rotation:0,  radius:"0px"  } },
    { name: "Simple Frame, Black",props: { picBorderWidth:3, picBorderColor:"#111", picBorderStyle:"solid", shadow:false, glow:false },
      thumb: { w:"78%", h:"70%", border:"3px solid #111",    shadow:"none",                                                          filter:"none",                      rotation:0,  radius:"0px"  } },
    // Row 2
    { name: "Thick Matte, Black", props: { picBorderWidth:9, picBorderColor:"#111", picBorderStyle:"solid", shadow:true, shadowBlur:4, shadowDistance:2, shadowColor:"#000", shadowOpacity:20, shadowAngle:45 },
      thumb: { w:"54%", h:"48%", border:"8px solid #111",    shadow:"1px 1px 3px rgba(0,0,0,0.28)",                                 filter:"none",                      rotation:0,  radius:"0px"  } },
    { name: "Double Frame, Black",props: { picBorderWidth:3, picBorderColor:"#111", picBorderStyle:"solid", shadow:false },
      thumb: { w:"64%", h:"56%", border:"2px solid #111",    shadow:"0 0 0 3px #f4f4f4, 0 0 0 5px #111",                            filter:"none",                      rotation:0,  radius:"0px"  } },
    { name: "Rounded Rectangle",  props: { picBorderWidth:3, picBorderColor:"#777", picBorderStyle:"solid", picBorderRadius:12, shadow:false },
      thumb: { w:"82%", h:"74%", border:"2.5px solid #888",  shadow:"none",                                                          filter:"none",                      rotation:0,  radius:"9px"  } },
    { name: "Rotated, White",     props: { picBorderWidth:5, picBorderColor:"#fff", picBorderStyle:"solid", shadow:true, shadowBlur:8, shadowDistance:4, shadowColor:"#000", shadowOpacity:30, shadowAngle:45 },
      thumb: { w:"66%", h:"58%", border:"3px solid #fff",    shadow:"2px 2px 6px rgba(0,0,0,0.38)",                                 filter:"none",                      rotation:-8, radius:"0px"  } },
    // Row 3
    { name: "Perspective Shadow", props: { picBorderWidth:4, picBorderColor:"#fff", picBorderStyle:"solid", shadow:true, shadowBlur:18, shadowDistance:8, shadowAngle:135, shadowOpacity:50 },
      thumb: { w:"68%", h:"60%", border:"2.5px solid #fff",  shadow:"-5px 5px 0 rgba(0,0,0,0.5)",                                   filter:"none",                      rotation:0,  radius:"0px"  } },
    { name: "Bevel Rectangle",    props: { picBorderWidth:4, picBorderColor:"#888", picBorderStyle:"solid", shadow:true, shadowBlur:2, shadowDistance:1, shadowColor:"#000", shadowOpacity:40, shadowAngle:315 },
      thumb: { w:"78%", h:"70%", border:"2px solid #c0c0c0", shadow:"inset 2px 2px 3px #fff, inset -2px -2px 2px rgba(0,0,0,0.38), 1px 2px 4px rgba(0,0,0,0.22)", filter:"none", rotation:0, radius:"2px" } },
    { name: "Soft Edge",          props: { picSoftEdge:true, picSoftEdgeSize:8, picBorderWidth:0 },
      thumb: { w:"88%", h:"80%", border:"none",              shadow:"none",                                                          filter:"none",                      rotation:0,  radius:"2px",  softEdge:true } },
    { name: "Glow: Blue",         props: { glow:true, glowColor:"#4488ff", glowSize:10, glowOpacity:85, picBorderWidth:0 },
      thumb: { w:"76%", h:"68%", border:"none",              shadow:"0 0 7px 4px rgba(68,136,255,0.7)",                              filter:"none",                      rotation:0,  radius:"2px"  } },
    // Row 4
    { name: "Reflected, White",   props: { picBorderWidth:4, picBorderColor:"#fff", picBorderStyle:"solid", shadow:true, shadowBlur:3, shadowDistance:2, shadowColor:"#000", shadowOpacity:20, shadowAngle:90, reflection:true, reflectionSize:35, reflectionOpacity:40 },
      thumb: { w:"70%", h:"44%", border:"2.5px solid #fff",  shadow:"0 2px 4px rgba(0,0,0,0.22)",                                   filter:"none",                      rotation:0,  radius:"0px",  reflection:true } },
    { name: "Oval",               props: { picBorderWidth:2, picBorderColor:"#111", picBorderStyle:"solid" },
      thumb: { w:"86%", h:"78%", border:"2.5px solid #111",  shadow:"none",                                                          filter:"none",                      rotation:0,  radius:"50%"  } },
    { name: "Grayscale",          props: { imgArtistic:"grayscale", picBorderWidth:2, picBorderColor:"#555", picBorderStyle:"solid" },
      thumb: { w:"78%", h:"70%", border:"2px solid #666",    shadow:"none",                                                          filter:"grayscale(1) contrast(1.1)",rotation:0,  radius:"0px"  } },
    { name: "Vintage",            props: { imgArtistic:"vintage", picBorderWidth:4, picBorderColor:"#8b6a4a", picBorderStyle:"solid" },
      thumb: { w:"68%", h:"60%", border:"4px solid #8b6a4a", shadow:"none",                                                          filter:"sepia(0.75) contrast(0.9)", rotation:0,  radius:"1px"  } },
];

let picStylesScrollRow = 0;
const PIC_STYLES_COLS = 4;
const PIC_STYLES_ROWS_VISIBLE = 2;

function makePicStyleBtn(style, i, size, showLabel, onClickExtra) {
    const t = style.thumb;
    const btn = document.createElement("button");
    btn.className = "pic-style-btn";
    if (size) { btn.style.width = size.w; btn.style.height = size.h; }
    btn.title = style.name;

    const photo = document.createElement("div");
    photo.className = "pic-style-photo";
    photo.style.cssText = `
        width: ${t.w}; height: ${t.reflection ? "calc(" + t.h + " * 0.65)" : t.h};
        border: ${t.border}; box-shadow: ${t.shadow}; filter: ${t.filter};
        transform: rotate(${t.rotation}deg); border-radius: ${t.radius};
    `;
    if (t.softEdge) {
        const mask = "radial-gradient(ellipse 82% 78% at 50% 50%, black 48%, transparent 100%)";
        photo.style.webkitMaskImage = mask;
        photo.style.maskImage = mask;
    }
    btn.appendChild(photo);

    if (t.reflection) {
        const refl = document.createElement("div");
        refl.className = "pic-style-photo";
        refl.style.cssText = `
            width: ${t.w}; height: calc(${t.h} * 0.28);
            border: ${t.border}; box-shadow: none; filter: none;
            transform: rotate(${t.rotation}deg) scaleY(-1); border-radius: ${t.radius};
            opacity: 0.28; margin-top: 1px;
        `;
        btn.appendChild(refl);
    }

    if (showLabel) {
        const lbl = document.createElement("span");
        lbl.className = "pic-style-label";
        lbl.textContent = style.name;
        btn.appendChild(lbl);
    }

    btn.addEventListener("click", () => {
        applyToPicTargets(o => {
            Object.assign(o, style.props);
            if (style.props.picBorderWidth === 0) delete o.picBorderStyle;
        });
        document.querySelectorAll(".pic-style-btn").forEach((b, j) => b.classList.toggle("active", j === i));
        if (onClickExtra) onClickExtra();
        render();
        updateFormatPictureTab();
    });
    return btn;
}

function updatePicStylesScroll() {
    const gallery = document.getElementById("picStylesGallery");
    if (!gallery) return;
    const rowH = 1.9 * 16 + 4;
    gallery.style.transform = `translateY(-${picStylesScrollRow * rowH}px)`;
    const totalRows = Math.ceil(PIC_STYLES.length / PIC_STYLES_COLS);
    const upBtn = document.getElementById("picStylesUpBtn");
    const downBtn = document.getElementById("picStylesDownBtn");
    if (upBtn) upBtn.disabled = picStylesScrollRow === 0;
    if (downBtn) downBtn.disabled = picStylesScrollRow >= totalRows - PIC_STYLES_ROWS_VISIBLE;
}

function renderPicStylesGallery(obj) {
    const gallery = document.getElementById("picStylesGallery");
    if (!gallery) return;
    gallery.innerHTML = "";
    PIC_STYLES.forEach((style, i) => {
        gallery.appendChild(makePicStyleBtn(style, i, null, false, null));
    });
    picStylesScrollRow = 0;
    updatePicStylesScroll();
}

// Populate the More panel gallery (called lazily on first open)
function renderPicStylesMoreGallery() {
    const mg = document.getElementById("picStylesMoreGallery");
    if (!mg || mg.children.length > 0) return;
    PIC_STYLES.forEach((style, i) => {
        mg.appendChild(makePicStyleBtn(style, i, { w:"3.5rem", h:"2.6rem" }, true, closePicStylesMore));
    });
}

let picStylesMoreOpen = false;
function closePicStylesMore() {
    picStylesMoreOpen = false;
    const panel = document.getElementById("picStylesMorePanel");
    if (panel) panel.style.display = "none";
}

document.getElementById("picStylesUpBtn").addEventListener("click", () => {
    if (picStylesScrollRow > 0) { picStylesScrollRow--; updatePicStylesScroll(); }
});
document.getElementById("picStylesDownBtn").addEventListener("click", () => {
    const totalRows = Math.ceil(PIC_STYLES.length / PIC_STYLES_COLS);
    if (picStylesScrollRow < totalRows - PIC_STYLES_ROWS_VISIBLE) { picStylesScrollRow++; updatePicStylesScroll(); }
});
document.getElementById("picStylesMoreBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    const panel = document.getElementById("picStylesMorePanel");
    if (!panel) return;
    if (picStylesMoreOpen) { closePicStylesMore(); return; }
    renderPicStylesMoreGallery();
    const btnRect = e.currentTarget.closest(".pic-styles-wrap").getBoundingClientRect();
    panel.style.display = "block";
    panel.style.left = btnRect.left + "px";
    panel.style.top = (btnRect.bottom + 4) + "px";
    picStylesMoreOpen = true;
});
document.addEventListener("click", (e) => {
    if (picStylesMoreOpen && !e.target.closest("#picStylesMorePanel") && !e.target.closest("#picStylesMoreBtn")) {
        closePicStylesMore();
    }
});

// ---- Arrange: Bring Forward / Send Backward ----
document.getElementById("picBringForwardOneBtn").addEventListener("click", () => { zOrder("forward"); closePicMenus(); });
document.getElementById("picBringFrontBtn").addEventListener("click", () => { zOrder("front"); closePicMenus(); });
document.getElementById("picSendBackwardOneBtn").addEventListener("click", () => { zOrder("backward"); closePicMenus(); });
document.getElementById("picSendBackBtn").addEventListener("click", () => { zOrder("back"); closePicMenus(); });

// ---- Arrange: Selection Pane (placeholder) ----
document.getElementById("picSelectionPaneBtn").addEventListener("click", () => {
    alert("Selection Pane: Use the panel on the right to reorder objects.");
});

// ---- Arrange: Align ----
document.querySelectorAll("[data-pic-align]").forEach(btn => {
    btn.addEventListener("click", () => {
        alignSelection(btn.dataset.picAlign);
        closePicMenus();
    });
});

// ---- Group / Ungroup ----
document.getElementById("picGroupSelBtn").addEventListener("click", () => { groupSelection(); closePicMenus(); });
document.getElementById("picUngroupSelBtn").addEventListener("click", () => { ungroupSelection(); closePicMenus(); });

// ---- Rotate / Flip ----
document.getElementById("picRotateRight90Btn").addEventListener("click", () => {
    applyToPicTargets(o => o.rotation = ((o.rotation || 0) + 90) % 360);
    closePicMenus();
    updateFormatPictureTab();
});
document.getElementById("picRotateLeft90Btn").addEventListener("click", () => {
    applyToPicTargets(o => o.rotation = ((o.rotation || 0) - 90 + 360) % 360);
    closePicMenus();
    updateFormatPictureTab();
});
document.getElementById("picFlipHBtn").addEventListener("click", () => {
    const targets = picTargets();
    if (!targets.length) return;
    pushHistory(true);
    applyToAll(targets, flipObjectScreenH);
    render();
    closePicMenus();
});
document.getElementById("picFlipVBtn").addEventListener("click", () => {
    const targets = picTargets();
    if (!targets.length) return;
    pushHistory(true);
    applyToAll(targets, flipObjectScreenV);
    render();
    closePicMenus();
});
document.getElementById("picRotationInput").addEventListener("change", (e) => {
    const val = ((parseInt(e.target.value) % 360) + 360) % 360;
    applyToPicTargets(o => o.rotation = val);
    closePicMenus();
    updateFormatPictureTab();
});

// ---- Visual Crop button ----
document.getElementById("picVisualCropBtn").addEventListener("click", () => {
    const targets = picTargets();
    if (!targets.length) return;
    closePicMenus();
    enterCropMode(targets[0].id);
});
document.getElementById("picCropDoneBtn").addEventListener("click", () => {
    exitCropMode(true);
    updateFormatPictureTab();
});
document.getElementById("picCropCancelBtn").addEventListener("click", () => {
    if (cropState) {
        const obj = getObj(cropState.id);
        if (obj && cropState.originalCrop !== undefined) obj.imgCrop = cropState.originalCrop;
    }
    exitCropMode(false);
});

// ---- Crop ----
document.getElementById("picCropApplyBtn").addEventListener("click", () => {
    const top = parseInt(document.getElementById("picCropTop").value) || 0;
    const right = parseInt(document.getElementById("picCropRight").value) || 0;
    const bottom = parseInt(document.getElementById("picCropBottom").value) || 0;
    const left = parseInt(document.getElementById("picCropLeft").value) || 0;
    applyToPicTargets(o => {
        o.imgCrop = { top, right, bottom, left };
    });
    closePicMenus();
});

document.getElementById("picCropResetBtn").addEventListener("click", () => {
    applyToPicTargets(o => delete o.imgCrop);
    closePicMenus();
    updateFormatPictureTab();
});

// ---- Size inputs ----
document.getElementById("picHeightInput").addEventListener("change", (e) => {
    const val = Math.max(1, parseInt(e.target.value) || 1);
    applyToPicTargets(o => o.h = val);
    updateFormatPictureTab();
});
document.getElementById("picWidthInput").addEventListener("change", (e) => {
    const val = Math.max(1, parseInt(e.target.value) || 1);
    applyToPicTargets(o => o.w = val);
    updateFormatPictureTab();
});

// ---- Remove Background (PowerPoint-style interactive editor) ----

let bgrSession = null;

document.getElementById("picRemoveBgBtn").addEventListener("click", () => {
    const targets = picTargets();
    if (!targets.length) return;
    const obj = targets[0];
    if (!obj.src) return;
    bgrOpen(obj);
});

function bgrOpen(obj) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
        const W = img.naturalWidth || img.width;
        const H = img.naturalHeight || img.height;

        // Extract original pixels into a fixed buffer
        const offscreen = document.createElement("canvas");
        offscreen.width = W; offscreen.height = H;
        const octx = offscreen.getContext("2d");
        octx.drawImage(img, 0, 0);
        const srcData = octx.getImageData(0, 0, W, H).data;

        const removeMask = new Uint8Array(W * H); // 1 = will be removed
        const keepMask   = new Uint8Array(W * H); // 1 = user-protected (overrides remove)
        bgrInitialDetect(srcData, W, H, removeMask);
        const initRemoveMask = removeMask.slice();

        const canvas = document.getElementById("bgrCanvas");
        canvas.width  = W;
        canvas.height = H;

        bgrSession = {
            obj, srcData, W, H,
            removeMask, keepMask, initRemoveMask,
            tool: "remove",
            brushSize: 15,
            mouseDown: false,
            lastX: -1, lastY: -1,
        };

        document.getElementById("bgrModal").classList.add("active");
        document.getElementById("bgrMarkRemoveBtn").classList.add("active");
        document.getElementById("bgrMarkKeepBtn").classList.remove("active");
        document.getElementById("bgrBrushSlider").value = 15;
        document.getElementById("bgrBrushSizeLabel").textContent = "15";

        bgrRender();
    };
    img.onerror = () => showStatus("Cannot process this image (CORS or format issue)", false);
    img.src = obj.src;
}

function bgrClose() {
    document.getElementById("bgrModal").classList.remove("active");
    bgrSession = null;
}

function bgrInitialDetect(srcData, W, H, removeMask) {
    const px = srcData;
    const corners = [[0,0],[W-1,0],[0,H-1],[W-1,H-1]];
    const avgBg = corners
        .map(([x, y]) => { const i=(y*W+x)*4; return [px[i], px[i+1], px[i+2]]; })
        .reduce((a, c) => [a[0]+c[0], a[1]+c[1], a[2]+c[2]], [0,0,0])
        .map(v => v / 4);

    const THRESHOLD = 42;
    const visited = new Uint8Array(W * H);
    const queue = [];
    for (const [x, y] of corners) {
        const idx = y * W + x;
        if (!visited[idx]) { visited[idx] = 1; queue.push(idx); }
    }
    while (queue.length) {
        const idx = queue.pop();
        const pi = idx * 4;
        const dr = px[pi]-avgBg[0], dg = px[pi+1]-avgBg[1], db = px[pi+2]-avgBg[2];
        if (px[pi+3] === 0 || Math.sqrt(dr*dr+dg*dg+db*db) <= THRESHOLD) {
            removeMask[idx] = 1;
            const cx = idx % W, cy = (idx / W) | 0;
            for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
                const nx = cx+dx, ny = cy+dy;
                if (nx<0||ny<0||nx>=W||ny>=H) continue;
                const ni = ny*W+nx;
                if (!visited[ni]) { visited[ni]=1; queue.push(ni); }
            }
        }
    }
}

function bgrApplyStroke(canvasX, canvasY) {
    const s = bgrSession;
    if (!s) return;
    const { srcData, W, H, removeMask, keepMask, tool, brushSize, lastX, lastY } = s;

    // Interpolate along the stroke for a smooth continuous brush
    const dist = lastX >= 0 ? Math.hypot(canvasX-lastX, canvasY-lastY) : 0;
    const steps = Math.max(1, Math.ceil(dist / Math.max(1, brushSize * 0.4)));
    const seedSet = new Set();

    for (let step = 0; step <= steps; step++) {
        const t = steps > 0 ? step / steps : 0;
        const bx = Math.round(lastX >= 0 ? lastX + (canvasX-lastX)*t : canvasX);
        const by = Math.round(lastY >= 0 ? lastY + (canvasY-lastY)*t : canvasY);
        for (let dy = -brushSize; dy <= brushSize; dy++) {
            for (let dx = -brushSize; dx <= brushSize; dx++) {
                if (dx*dx + dy*dy > brushSize*brushSize) continue;
                const nx = bx+dx, ny = by+dy;
                if (nx<0||ny<0||nx>=W||ny>=H) continue;
                seedSet.add(ny*W+nx);
            }
        }
    }

    // Directly paint all brush pixels
    for (const idx of seedSet) {
        if (tool === "remove") { removeMask[idx] = 1; keepMask[idx] = 0; }
        else                   { keepMask[idx]   = 1; removeMask[idx] = 0; }
    }

    // Flood-fill expand from seeds via color similarity (smart detection)
    const EXPAND_THRESHOLD = 26;
    const expandVisited = new Uint8Array(W * H);
    const queue = [...seedSet];
    for (const idx of seedSet) expandVisited[idx] = 1;

    while (queue.length) {
        const idx = queue.pop();
        const pi  = idx * 4;
        const r0  = srcData[pi], g0 = srcData[pi+1], b0 = srcData[pi+2];
        const cx  = idx % W, cy = (idx / W) | 0;
        for (const [ddx, ddy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const nx = cx+ddx, ny = cy+ddy;
            if (nx<0||ny<0||nx>=W||ny>=H) continue;
            const ni = ny*W+nx;
            if (expandVisited[ni]) continue;
            expandVisited[ni] = 1;
            const pi2 = ni*4;
            const dr = srcData[pi2]-r0, dg = srcData[pi2+1]-g0, db = srcData[pi2+2]-b0;
            if (Math.sqrt(dr*dr+dg*dg+db*db) <= EXPAND_THRESHOLD) {
                if (tool === "remove" && !keepMask[ni]) removeMask[ni] = 1;
                else if (tool === "keep") { keepMask[ni] = 1; removeMask[ni] = 0; }
                queue.push(ni);
            }
        }
    }

    s.lastX = canvasX;
    s.lastY = canvasY;
}

function bgrRender(cursorX, cursorY) {
    if (!bgrSession) return;
    const { srcData, W, H, removeMask, keepMask, tool, brushSize } = bgrSession;

    const canvas = document.getElementById("bgrCanvas");
    const ctx = canvas.getContext("2d");
    const display = ctx.createImageData(W, H);
    const dp = display.data;

    for (let i = 0; i < W * H; i++) {
        const s = i * 4;
        if (removeMask[i] && !keepMask[i]) {
            // Purple-magenta tint = "will become transparent"
            dp[s]   = (srcData[s]   * 0.28 + 155 * 0.72) | 0;
            dp[s+1] = (srcData[s+1] * 0.28 +  20 * 0.72) | 0;
            dp[s+2] = (srcData[s+2] * 0.28 + 175 * 0.72) | 0;
            dp[s+3] = 185;
        } else {
            dp[s]   = srcData[s];
            dp[s+1] = srcData[s+1];
            dp[s+2] = srcData[s+2];
            dp[s+3] = srcData[s+3];
        }
    }
    ctx.putImageData(display, 0, 0);

    // Brush cursor preview
    if (cursorX !== undefined && cursorY !== undefined) {
        const rect   = canvas.getBoundingClientRect();
        const pxScale = rect.width > 0 ? W / rect.width : 1;
        const isRemoveTool = tool === "remove";
        ctx.save();
        ctx.strokeStyle = isRemoveTool ? "rgba(255,80,80,0.95)" : "rgba(50,215,85,0.95)";
        ctx.lineWidth   = Math.max(1, 1.5 * pxScale);
        ctx.setLineDash([4 * pxScale, 3 * pxScale]);
        ctx.beginPath();
        ctx.arc(cursorX, cursorY, brushSize, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = Math.max(1, 2 * pxScale);
        const arm = brushSize * 0.38;
        ctx.beginPath();
        ctx.moveTo(cursorX - arm, cursorY);
        ctx.lineTo(cursorX + arm, cursorY);
        if (!isRemoveTool) {
            ctx.moveTo(cursorX, cursorY - arm);
            ctx.lineTo(cursorX, cursorY + arm);
        }
        ctx.stroke();
        ctx.restore();
    }
}

function bgrApplyFinal() {
    if (!bgrSession) return;
    const { obj, srcData, W, H, removeMask, keepMask } = bgrSession;

    const offscreen = document.createElement("canvas");
    offscreen.width = W; offscreen.height = H;
    const ctx = offscreen.getContext("2d");
    const result = ctx.createImageData(W, H);
    const rp = result.data;
    for (let i = 0; i < W * H; i++) {
        const s = i * 4;
        rp[s]   = srcData[s];
        rp[s+1] = srcData[s+1];
        rp[s+2] = srcData[s+2];
        rp[s+3] = (removeMask[i] && !keepMask[i]) ? 0 : srcData[s+3];
    }
    ctx.putImageData(result, 0, 0);
    pushHistory();
    obj.src = offscreen.toDataURL("image/png");
    render();
    bgrClose();
}

// Tool button wiring
document.getElementById("bgrMarkRemoveBtn").addEventListener("click", () => {
    if (!bgrSession) return;
    bgrSession.tool = "remove";
    document.getElementById("bgrMarkRemoveBtn").classList.add("active");
    document.getElementById("bgrMarkKeepBtn").classList.remove("active");
});
document.getElementById("bgrMarkKeepBtn").addEventListener("click", () => {
    if (!bgrSession) return;
    bgrSession.tool = "keep";
    document.getElementById("bgrMarkKeepBtn").classList.add("active");
    document.getElementById("bgrMarkRemoveBtn").classList.remove("active");
});
document.getElementById("bgrBrushSlider").addEventListener("input", e => {
    if (!bgrSession) return;
    bgrSession.brushSize = parseInt(e.target.value);
    document.getElementById("bgrBrushSizeLabel").textContent = e.target.value;
});
document.getElementById("bgrDiscardBtn").addEventListener("click", () => {
    if (!bgrSession) return;
    bgrSession.removeMask.set(bgrSession.initRemoveMask);
    bgrSession.keepMask.fill(0);
    bgrSession.lastX = bgrSession.lastY = -1;
    bgrRender();
});
document.getElementById("bgrKeepBtn").addEventListener("click", bgrApplyFinal);

// Canvas mouse events
(function () {
    const canvas = document.getElementById("bgrCanvas");

    function toCanvas(e) {
        const rect = canvas.getBoundingClientRect();
        const s = bgrSession;
        return [
            (e.clientX - rect.left) * (s.W / rect.width),
            (e.clientY - rect.top)  * (s.H / rect.height),
        ];
    }

    canvas.addEventListener("mousedown", e => {
        if (!bgrSession) return;
        e.preventDefault();
        bgrSession.mouseDown = true;
        bgrSession.lastX = bgrSession.lastY = -1;
        const [x, y] = toCanvas(e);
        bgrApplyStroke(x, y);
        bgrRender(x, y);
    });
    canvas.addEventListener("mousemove", e => {
        if (!bgrSession) return;
        const [x, y] = toCanvas(e);
        if (bgrSession.mouseDown) bgrApplyStroke(x, y);
        bgrRender(x, y);
    });
    canvas.addEventListener("mouseup", () => {
        if (!bgrSession) return;
        bgrSession.mouseDown = false;
        bgrSession.lastX = bgrSession.lastY = -1;
        bgrRender();
    });
    canvas.addEventListener("mouseleave", () => {
        if (!bgrSession) return;
        bgrSession.mouseDown = false;
        bgrSession.lastX = bgrSession.lastY = -1;
        bgrRender();
    });
})();

// ---- Format Pane button ----
document.getElementById("picFormatPaneBtn").addEventListener("click", () => {
    // Switch to the Home tab panel which contains the properties panel
    document.querySelectorAll(".ribbon-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".ribbon-content").forEach(p => p.classList.remove("active"));
    document.querySelector('.ribbon-tab[data-ribbon-tab="home"]').classList.add("active");
    document.querySelector('.ribbon-content[data-ribbon-panel="home"]').classList.add("active");
    renderProperties();
});

// ============ Edit Table tab ============
const editTableTab = document.getElementById("editTableTab");

function getSelectedTable() {
    if (state.selection.length !== 1) return null;
    const obj = getObj(state.selection[0]);
    return (obj && obj.type === "group" && obj.tableCols) ? obj : null;
}

let _editTablePrevId = null;

function updateEditTableTab() {
    const group = getSelectedTable();
    const wasActive = editTableTab.classList.contains("active");
    const isNewTable = group && group.id !== _editTablePrevId;
    editTableTab.style.display = group ? "" : "none";

    if (!group) {
        if (wasActive) {
            editTableTab.classList.remove("active");
            document.querySelector('.ribbon-tab[data-ribbon-tab="home"]').classList.add("active");
            document.querySelectorAll(".ribbon-content").forEach(p => p.classList.toggle("active", p.dataset.ribbonPanel === "home"));
        }
        _editTablePrevId = null;
        return;
    }

    // Auto-switch to Edit Table tab when a new table is selected
    if (isNewTable && !wasActive) {
        document.querySelectorAll(".ribbon-tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".ribbon-content").forEach(p => p.classList.remove("active"));
        editTableTab.classList.add("active");
        document.querySelector('.ribbon-content[data-ribbon-panel="editTable"]').classList.add("active");
    }
    _editTablePrevId = group.id;

    // Sync style controls
    document.getElementById("etStyleSelect").value = group.styleId || "none";
    document.getElementById("etHeaderRowBtn").classList.toggle("active", !!group.headerRow);
    document.getElementById("etBandedRowsBtn").classList.toggle("active", !!group.bandedRows);

    // Sync border controls
    const cellRects = group.children.filter((c, i) => c.type === "rect" && i !== group.children.length - 1 && !c.covered);
    const outline = group.children[group.children.length - 1];
    if (cellRects.length) {
        const innerCol = cellRects[0].stroke?.color;
        _etInnerColorBtn._setValue(innerCol === "none" ? "#000000" : (innerCol || "#000000"));
        document.getElementById("etInnerWidth").value = cellRects[0].stroke?.width ?? 1;
    }
    const outerCol = outline.stroke?.color;
    _etOuterColorBtn._setValue(outerCol === "none" ? "#000000" : (outerCol || "#000000"));
    document.getElementById("etOuterWidth").value = outline.stroke?.width ?? 3;

    // Sync corner radius
    const r = group.tableCornerRadius || 0;
    document.getElementById("etCornerSlider").value = r;
    document.getElementById("etCornerNum").value = r;

    // Sync border painter
    _etPaintColorBtn._setValue(borderPaintState.color);
    document.getElementById("etPaintWidth").value = borderPaintState.width;
    document.getElementById("etPaintDash").value = borderPaintState.dash;
    document.getElementById("etBorderPaintBtn").classList.toggle("et-painter-on", borderPaintState.active);
    document.getElementById("etBorderPaintLabel").textContent = borderPaintState.active ? "Painter\nON" : "Border\nPainter";

    // Merge/Unmerge button state
    const cells = state.cellSelections.map(id => findObjectById(group.children, id)).filter(Boolean);
    const etMergeBtn = document.getElementById("etMergeBtn");
    const etUnmergeBtn = document.getElementById("etUnmergeBtn");
    etMergeBtn.disabled = cells.length < 2;
    etMergeBtn.style.opacity = cells.length < 2 ? "0.4" : "";
    const canUnmerge = cells.length === 1 && ((cells[0]?.colSpan || 1) > 1 || (cells[0]?.rowSpan || 1) > 1);
    etUnmergeBtn.disabled = !canUnmerge;
    etUnmergeBtn.style.opacity = canUnmerge ? "" : "0.4";
}

// Wire up Edit Table color picker buttons
const _etInnerColorBtn = makeColorPickerBtn("#000000", c => {
    const group = getSelectedTable(); if (!group) return;
    group.children.filter((ch, i) => ch.type === "rect" && i !== group.children.length - 1 && !ch.covered)
        .forEach(ch => ch.stroke.color = c);
    render();
});
document.getElementById("etInnerColorWrap").appendChild(_etInnerColorBtn);

const _etOuterColorBtn = makeColorPickerBtn("#000000", c => {
    const group = getSelectedTable(); if (!group) return;
    const outline = group.children[group.children.length - 1];
    outline.stroke.color = c; render();
});
document.getElementById("etOuterColorWrap").appendChild(_etOuterColorBtn);

const _etPaintColorBtn = makeColorPickerBtn(borderPaintState.color, c => { borderPaintState.color = c; });
document.getElementById("etPaintColorWrap").appendChild(_etPaintColorBtn);

// Wire up Edit Table ribbon controls
document.getElementById("etStyleSelect").onchange = () => {
    const group = getSelectedTable(); if (!group) return;
    pushHistory(true);
    group.styleId = document.getElementById("etStyleSelect").value;
    applyTableStyle(group);
    render(); renderProperties();
};
document.getElementById("etHeaderRowBtn").onclick = () => {
    const group = getSelectedTable(); if (!group) return;
    pushHistory(true);
    group.headerRow = !group.headerRow;
    applyTableStyle(group);
    render(); renderProperties(); updateEditTableTab();
};
document.getElementById("etBandedRowsBtn").onclick = () => {
    const group = getSelectedTable(); if (!group) return;
    pushHistory(true);
    group.bandedRows = !group.bandedRows;
    applyTableStyle(group);
    render(); renderProperties(); updateEditTableTab();
};
document.getElementById("etInsertRowBtn").onclick = () => {
    const group = getSelectedTable(); if (!group) return;
    pushHistory(true); insertTableRow(group); render(); renderProperties();
};
document.getElementById("etDeleteRowBtn").onclick = () => {
    const group = getSelectedTable(); if (!group) return;
    pushHistory(true);
    if (!deleteTableRow(group, tableDeleteTargetRow(group)))
        alert("Can't delete: unmerge spanning cells first, or it's the only row.");
    render(); renderProperties();
};
document.getElementById("etInsertColBtn").onclick = () => {
    const group = getSelectedTable(); if (!group) return;
    pushHistory(true); insertTableColumn(group); render(); renderProperties();
};
document.getElementById("etDeleteColBtn").onclick = () => {
    const group = getSelectedTable(); if (!group) return;
    pushHistory(true);
    if (!deleteTableColumn(group, tableDeleteTargetCol(group)))
        alert("Can't delete: unmerge spanning cells first, or it's the only column.");
    render(); renderProperties();
};
document.getElementById("etMergeBtn").onclick = () => {
    const group = getSelectedTable(); if (!group) return;
    pushHistory(true);
    if (!mergeCells(group)) alert("Select a rectangular block of unmerged cells to merge.");
    render(); renderProperties();
};
document.getElementById("etUnmergeBtn").onclick = () => {
    const group = getSelectedTable(); if (!group) return;
    pushHistory(true); unmergeCells(group); render(); renderProperties();
};
document.getElementById("etInnerWidth").onchange = () => {
    const group = getSelectedTable(); if (!group) return;
    pushHistory(true);
    const w = Math.max(0, parseFloat(document.getElementById("etInnerWidth").value) || 0);
    group.children.filter((c, i) => c.type === "rect" && i !== group.children.length - 1 && !c.covered)
        .forEach(c => c.stroke.width = w);
    render();
};
document.getElementById("etOuterWidth").onchange = () => {
    const group = getSelectedTable(); if (!group) return;
    pushHistory(true);
    const outline = group.children[group.children.length - 1];
    outline.stroke.width = Math.max(0, parseFloat(document.getElementById("etOuterWidth").value) || 0);
    render();
};
document.getElementById("etCornerSlider").oninput = () => {
    const group = getSelectedTable(); if (!group) return;
    const v = parseFloat(document.getElementById("etCornerSlider").value);
    group.tableCornerRadius = v;
    document.getElementById("etCornerNum").value = v;
    render();
};
document.getElementById("etCornerNum").oninput = () => {
    const group = getSelectedTable(); if (!group) return;
    const v = Math.max(0, parseFloat(document.getElementById("etCornerNum").value) || 0);
    group.tableCornerRadius = v;
    document.getElementById("etCornerSlider").value = Math.min(80, v);
    render();
};
document.getElementById("etBorderPaintBtn").onclick = () => {
    borderPaintState.active = !borderPaintState.active;
    if (!borderPaintState.active) { borderPaintHover = null; document.body.style.cursor = ""; updateBorderPaintOverlay(); }
    renderProperties();
};
// etPaintColor change is handled in the makeColorPickerBtn callback above
document.getElementById("etPaintWidth").oninput = () => { borderPaintState.width = parseFloat(document.getElementById("etPaintWidth").value) || 0; };
document.getElementById("etPaintDash").onchange = () => { borderPaintState.dash = document.getElementById("etPaintDash").value; };
document.getElementById("etClearPaintBtn").onclick = () => {
    const group = getSelectedTable(); if (!group) return;
    pushHistory(true); group.customBorders = {}; render();
};

// ============ My Shapes (custom saved presets) ============
const MY_SHAPES_KEY = "ldm-my-shapes";
const myShapesGrid = document.getElementById("myShapesGrid");
const myShapesEmptyMsg = document.getElementById("myShapesEmptyMsg");

function loadMyShapes() {
    try {
        return JSON.parse(localStorage.getItem(MY_SHAPES_KEY)) || [];
    } catch (e) {
        return [];
    }
}
function saveMyShapes(list) {
    localStorage.setItem(MY_SHAPES_KEY, JSON.stringify(list));
}

function makeThumbnail(obj, size = 56) {
    const pad = Math.max(obj.w, obj.h) * 0.08;
    const svgEl = document.createElementNS(svgNS, "svg");
    svgEl.setAttribute("viewBox", `${obj.x - pad} ${obj.y - pad} ${obj.w + pad * 2} ${obj.h + pad * 2}`);
    svgEl.setAttribute("width", size);
    svgEl.setAttribute("height", size);
    svgEl.classList.add("my-shape-thumb");
    const defs = document.createElementNS(svgNS, "defs");
    svgEl.appendChild(defs);
    svgEl.appendChild(renderObject(obj, defs, true));
    return svgEl;
}

saveMyShapeBtn.onclick = () => {
    const targets = shapeFormatTargets();
    if (!targets.length) return;
    let obj;
    if (targets.length === 1) {
        obj = JSON.parse(JSON.stringify(targets[0]));
    } else {
        const minX = Math.min(...targets.map(o => o.x));
        const minY = Math.min(...targets.map(o => o.y));
        const maxX = Math.max(...targets.map(o => o.x + o.w));
        const maxY = Math.max(...targets.map(o => o.y + o.h));
        obj = {
            id: uid(), type: "group", x: minX, y: minY, w: maxX - minX, h: maxY - minY,
            rotation: 0, flipH: false, flipV: false, opacity: 100, shadow: false,
            fill: { type: "solid", color: "none" }, stroke: { color: "none", width: 0, dash: "solid" },
            children: JSON.parse(JSON.stringify(targets))
        };
    }
    const name = prompt("Name this shape preset:", obj.type === "group" ? "My Group" : "My Shape");
    if (name === null) return;
    const list = loadMyShapes();
    list.push({ id: uid(), name: name || "My Shape", object: obj });
    saveMyShapes(list);
    renderMyShapesGrid();
};

function renderMyShapesGrid() {
    const list = loadMyShapes();
    myShapesGrid.innerHTML = "";
    myShapesEmptyMsg.style.display = list.length ? "none" : "";
    list.forEach(entry => {
        const item = el("div", { class: "my-shape-item", title: entry.name });
        item.appendChild(makeThumbnail(entry.object));
        item.appendChild(el("span", { class: "my-shape-name", text: entry.name }));
        const delBtn = el("button", { class: "my-shape-delete", text: "✕", title: "Delete" });
        delBtn.onclick = (e) => {
            e.stopPropagation();
            const updated = loadMyShapes().filter(x => x.id !== entry.id);
            saveMyShapes(updated);
            renderMyShapesGrid();
        };
        item.appendChild(delBtn);
        item.onclick = () => {
            pushHistory(true);
            const copy = reassignIds(JSON.parse(JSON.stringify(entry.object)));
            const newX = Math.round((SLIDE_W - copy.w) / 2);
            const newY = Math.round((SLIDE_H - copy.h) / 2);
            if (copy.type === "group") offsetGroupChildren(copy, newX - copy.x, newY - copy.y);
            copy.x = newX;
            copy.y = newY;
            curSlide().objects.push(copy);
            state.selection = [copy.id];
            render();
            renderProperties();
            document.getElementById("myShapesDropdownMenu").classList.remove("open");
        };
        myShapesGrid.appendChild(item);
    });
}
renderMyShapesGrid();

// ============ Design tab: slide size controls ============
const slideSizeSelect = document.getElementById("slideSizeSelect");
const slideWidthInput = document.getElementById("slideWidthInput");
const slideHeightInput = document.getElementById("slideHeightInput");
const orientationPortraitBtn = document.getElementById("orientationPortraitBtn");
const orientationLandscapeBtn = document.getElementById("orientationLandscapeBtn");

SLIDE_SIZE_PRESETS.forEach(p => slideSizeSelect.appendChild(el("option", { value: p.id, text: p.label })));

function currentSlideWCm() { return SLIDE_W * PX_TO_CM; }
function currentSlideHCm() { return SLIDE_H * PX_TO_CM; }

function matchingPreset(wCm, hCm) {
    return SLIDE_SIZE_PRESETS.find(p => p.w !== null && Math.abs(p.w - wCm) < 0.05 && Math.abs(p.h - hCm) < 0.05);
}

function updateSlideSizeControls() {
    const wCm = currentSlideWCm(), hCm = currentSlideHCm();
    slideWidthInput.value = wCm.toFixed(2);
    slideHeightInput.value = hCm.toFixed(2);
    const preset = matchingPreset(wCm, hCm);
    slideSizeSelect.value = preset ? preset.id : "custom";
    const portrait = hCm > wCm;
    orientationPortraitBtn.classList.toggle("active", portrait);
    orientationLandscapeBtn.classList.toggle("active", !portrait);
}

slideSizeSelect.onchange = () => {
    const preset = SLIDE_SIZE_PRESETS.find(p => p.id === slideSizeSelect.value);
    if (!preset || preset.w === null) return; // "Custom" - keep current size
    setSlideSize(preset.w, preset.h);
};

function applyCustomSlideSize() {
    const w = parseFloat(slideWidthInput.value);
    const h = parseFloat(slideHeightInput.value);
    if (w > 0 && h > 0) setSlideSize(w, h);
    else updateSlideSizeControls();
}
slideWidthInput.onchange = applyCustomSlideSize;
slideHeightInput.onchange = applyCustomSlideSize;

orientationPortraitBtn.onclick = () => {
    const wCm = currentSlideWCm(), hCm = currentSlideHCm();
    if (hCm < wCm) setSlideSize(hCm, wCm);
};
orientationLandscapeBtn.onclick = () => {
    const wCm = currentSlideWCm(), hCm = currentSlideHCm();
    if (wCm < hCm) setSlideSize(hCm, wCm);
};

updateSlideSizeControls();

// ============ Design tab: Themes ============
// Each theme sets the slide background fill (applied to every slide) and the
// app header's accent color, giving the deck a consistent look in one click.
const SLIDE_THEMES = [
    { id: "default", name: "Default", fill: { type: "solid", color: "#ffffff" }, headerColor: "#2fa0b0" },
    { id: "sunrise", name: "Sunrise", fill: { type: "gradient", gradientType: "linear", angle: 135, stops: [{ pos: 0, color: "#fff5e6" }, { pos: 100, color: "#ffd9a0" }] }, headerColor: "#e8943a" },
    { id: "ocean", name: "Ocean", fill: { type: "gradient", gradientType: "linear", angle: 135, stops: [{ pos: 0, color: "#e6f4f9" }, { pos: 100, color: "#aee0ef" }] }, headerColor: "#2fa0b0" },
    { id: "blossom", name: "Blossom", fill: { type: "gradient", gradientType: "linear", angle: 135, stops: [{ pos: 0, color: "#fff0f5" }, { pos: 100, color: "#ffd0e0" }] }, headerColor: "#d6577a" },
    { id: "mint", name: "Mint", fill: { type: "gradient", gradientType: "linear", angle: 135, stops: [{ pos: 0, color: "#eafff2" }, { pos: 100, color: "#b9f0d0" }] }, headerColor: "#2fae7a" },
    { id: "lavender", name: "Lavender", fill: { type: "gradient", gradientType: "linear", angle: 135, stops: [{ pos: 0, color: "#f3eefc" }, { pos: 100, color: "#d8c8f5" }] }, headerColor: "#7a5fc4" },
    { id: "slate", name: "Slate", fill: { type: "gradient", gradientType: "linear", angle: 135, stops: [{ pos: 0, color: "#f4f6f8" }, { pos: 100, color: "#cfd6dd" }] }, headerColor: "#5c6b7a" },
    { id: "charcoal", name: "Charcoal", fill: { type: "gradient", gradientType: "linear", angle: 135, stops: [{ pos: 0, color: "#3a3f47" }, { pos: 100, color: "#20242b" }] }, headerColor: "#4a5568" },
    { id: "crimson", name: "Crimson", fill: { type: "gradient", gradientType: "linear", angle: 135, stops: [{ pos: 0, color: "#fff5f5" }, { pos: 100, color: "#ffd6d6" }] }, headerColor: "#c0392b" },
    { id: "royal", name: "Royal", fill: { type: "gradient", gradientType: "linear", angle: 135, stops: [{ pos: 0, color: "#eef0fb" }, { pos: 100, color: "#c8d0f0" }] }, headerColor: "#34495e" },
    { id: "gold", name: "Gold", fill: { type: "gradient", gradientType: "linear", angle: 135, stops: [{ pos: 0, color: "#fffaf0" }, { pos: 100, color: "#ffe9b3" }] }, headerColor: "#b8860b" },
    { id: "sky", name: "Sky", fill: { type: "solid", color: "#eaf6ff" }, headerColor: "#3498db" },
    { id: "coral", name: "Coral", fill: { type: "gradient", gradientType: "linear", angle: 135, stops: [{ pos: 0, color: "#fff4f0" }, { pos: 100, color: "#ffd0c2" }] }, headerColor: "#e8674a" },
    { id: "sage", name: "Sage", fill: { type: "gradient", gradientType: "linear", angle: 135, stops: [{ pos: 0, color: "#f3f7f0" }, { pos: 100, color: "#d6e6cf" }] }, headerColor: "#6f9a5c" },
    { id: "plum", name: "Plum", fill: { type: "gradient", gradientType: "linear", angle: 135, stops: [{ pos: 0, color: "#f8f0fb" }, { pos: 100, color: "#e3c9f0" }] }, headerColor: "#8e44ad" },
    { id: "graphite", name: "Graphite", fill: { type: "solid", color: "#f0f1f3" }, headerColor: "#34495e" },
];

function themeSwatchBackground(theme) {
    if (theme.fill.type === "solid") return theme.fill.color;
    const stops = theme.fill.stops.map(s => `${s.color} ${s.pos}%`).join(", ");
    return `linear-gradient(${theme.fill.angle}deg, ${stops})`;
}

function renderThemesGallery() {
    const gallery = document.getElementById("themesGallery");
    gallery.innerHTML = "";
    SLIDE_THEMES.forEach(theme => {
        const swatch = el("div", { class: "theme-swatch", title: theme.name });
        swatch.style.background = themeSwatchBackground(theme);
        if (JSON.stringify(curSlide().fill) === JSON.stringify(theme.fill)) {
            swatch.classList.add("active");
        }
        const check = el("span", { class: "theme-swatch-check", text: "✓" });
        swatch.appendChild(check);
        swatch.onclick = () => {
            pushHistory(true);
            state.slides.forEach(slide => { slide.fill = JSON.parse(JSON.stringify(theme.fill)); });
            applyHeaderColor(theme.headerColor);
            render();
            renderProperties();
            renderThemesGallery();
            renderFormatBgPanel();
        };
        gallery.appendChild(swatch);
    });
}

// ============ Design tab: Slide Layouts ============
// Each layout builds a fresh set of placeholder objects for the current slide size.
function layoutTitleObj(text, x, y, w, h, fontSize, align) {
    const o = makeObject("text", x, y, w, h);
    o.text = text;
    o.fontSize = fontSize;
    o.bold = true;
    o.align = align || "left";
    o.fontColor = "#1a1a1a";
    return o;
}
function layoutBodyObj(text, x, y, w, h) {
    const o = makeObject("text", x, y, w, h);
    o.text = text;
    o.fontSize = 18;
    o.fontColor = "#444444";
    o.align = "left";
    return o;
}
const SLIDE_LAYOUTS = [
    { id: "blank", name: "Blank", build: () => [] },
    {
        id: "title", name: "Title Slide", build: () => {
            const subtitle = layoutBodyObj("Click to add subtitle", SLIDE_W * 0.15, SLIDE_H * 0.58, SLIDE_W * 0.7, SLIDE_H * 0.12);
            subtitle.align = "center";
            subtitle.fontSize = 20;
            return [
                layoutTitleObj("Click to add title", SLIDE_W * 0.1, SLIDE_H * 0.38, SLIDE_W * 0.8, SLIDE_H * 0.18, 40, "center"),
                subtitle,
            ];
        }
    },
    {
        id: "titleContent", name: "Title & Content", build: () => [
            layoutTitleObj("Click to add title", SLIDE_W * 0.06, SLIDE_H * 0.05, SLIDE_W * 0.88, SLIDE_H * 0.15, 32, "left"),
            layoutBodyObj("Click to add text", SLIDE_W * 0.06, SLIDE_H * 0.25, SLIDE_W * 0.88, SLIDE_H * 0.68),
        ]
    },
    {
        id: "twoContent", name: "Two Content", build: () => [
            layoutTitleObj("Click to add title", SLIDE_W * 0.06, SLIDE_H * 0.05, SLIDE_W * 0.88, SLIDE_H * 0.15, 32, "left"),
            layoutBodyObj("Click to add text", SLIDE_W * 0.06, SLIDE_H * 0.25, SLIDE_W * 0.42, SLIDE_H * 0.68),
            layoutBodyObj("Click to add text", SLIDE_W * 0.52, SLIDE_H * 0.25, SLIDE_W * 0.42, SLIDE_H * 0.68),
        ]
    },
    {
        id: "section", name: "Section Header", build: () => {
            const bar = makeObject("rect", SLIDE_W * 0.06, SLIDE_H * 0.42, SLIDE_W * 0.12, SLIDE_H * 0.05);
            bar.fill = { type: "solid", color: "#2fa0b0" };
            bar.stroke = { color: "none", width: 0, dash: "solid" };
            return [
                bar,
                layoutTitleObj("Click to add section title", SLIDE_W * 0.06, SLIDE_H * 0.5, SLIDE_W * 0.7, SLIDE_H * 0.2, 36, "left"),
            ];
        }
    },
    {
        id: "titleOnly", name: "Title Only", build: () => [
            layoutTitleObj("Click to add title", SLIDE_W * 0.06, SLIDE_H * 0.05, SLIDE_W * 0.88, SLIDE_H * 0.15, 32, "left"),
        ]
    },
];

function renderSlidePreviewSvg(fill, objects) {
    const svgEl = document.createElementNS(svgNS, "svg");
    svgEl.setAttribute("viewBox", `0 0 ${SLIDE_W} ${SLIDE_H}`);
    const defs = document.createElementNS(svgNS, "defs");
    svgEl.appendChild(defs);
    const bg = document.createElementNS(svgNS, "rect");
    applyAttrs(bg, { x: 0, y: 0, width: SLIDE_W, height: SLIDE_H, fill: resolveFill({ id: "preview", fill }, defs) });
    svgEl.appendChild(bg);
    objects.forEach(obj => svgEl.appendChild(renderObject(obj, defs, true)));
    return svgEl;
}

function renderLayoutsGallery() {
    const gallery = document.getElementById("layoutsGallery");
    gallery.innerHTML = "";
    SLIDE_LAYOUTS.forEach(layout => {
        const item = el("div", { class: "gallery-thumb-item", title: layout.name });
        item.appendChild(renderSlidePreviewSvg(curSlide().fill, layout.build()));
        item.appendChild(el("span", { class: "gallery-thumb-name", text: layout.name }));
        item.onclick = () => {
            pushHistory(true);
            curSlide().objects = layout.build().map(reassignIds);
            state.selection = [];
            render();
            renderProperties();
        };
        gallery.appendChild(item);
    });
}

// ============ Design tab: My Templates (custom saved slide designs) ============
const MY_TEMPLATES_KEY = "ldm-my-templates";
const myTemplatesGallery = document.getElementById("myTemplatesGallery");
const saveTemplateBtn = document.getElementById("saveTemplateBtn");

function loadMyTemplates() {
    try {
        return JSON.parse(localStorage.getItem(MY_TEMPLATES_KEY)) || [];
    } catch (e) {
        return [];
    }
}
function saveMyTemplates(list) {
    localStorage.setItem(MY_TEMPLATES_KEY, JSON.stringify(list));
}

saveTemplateBtn.onclick = () => {
    const name = prompt("Name this slide template:", "My Template");
    if (name === null) return;
    const list = loadMyTemplates();
    list.push({
        id: uid(),
        name: name || "My Template",
        fill: JSON.parse(JSON.stringify(curSlide().fill)),
        objects: JSON.parse(JSON.stringify(curSlide().objects)),
    });
    saveMyTemplates(list);
    renderMyTemplatesGallery();
};

function renderMyTemplatesGallery() {
    const list = loadMyTemplates();
    myTemplatesGallery.querySelectorAll(".gallery-thumb-item").forEach(n => n.remove());
    list.forEach(entry => {
        const item = el("div", { class: "gallery-thumb-item", title: entry.name });
        item.appendChild(renderSlidePreviewSvg(entry.fill, entry.objects));
        item.appendChild(el("span", { class: "gallery-thumb-name", text: entry.name }));
        const delBtn = el("button", { class: "my-shape-delete", text: "✕", title: "Delete template" });
        delBtn.onclick = (e) => {
            e.stopPropagation();
            saveMyTemplates(loadMyTemplates().filter(x => x.id !== entry.id));
            renderMyTemplatesGallery();
        };
        item.appendChild(delBtn);
        item.onclick = () => {
            pushHistory(true);
            curSlide().fill = JSON.parse(JSON.stringify(entry.fill));
            curSlide().objects = JSON.parse(JSON.stringify(entry.objects)).map(reassignIds);
            state.selection = [];
            render();
            renderProperties();
            renderThemesGallery();
            renderFormatBgPanel();
        };
        myTemplatesGallery.appendChild(item);
    });
}

renderThemesGallery();
renderLayoutsGallery();
renderMyTemplatesGallery();

// ============ Design tab: Format Background dropdown ============
const formatBgDropdownMenu = document.getElementById("formatBgDropdownMenu");
function renderFormatBgPanel() {
    formatBgDropdownMenu.innerHTML = "";
    formatBgDropdownMenu.appendChild(buildSlideBackgroundSection(renderFormatBgPanel));
    renderProperties();
}
document.getElementById("formatBgDropdownBtn").addEventListener("click", renderFormatBgPanel);
renderFormatBgPanel();

// ============ Zoom controls ============
function scrollToSelection() {
    if (!state.selection.length) return;
    const objs = state.selection.map(id => curSlide().objects.find(o => o.id === id)).filter(Boolean);
    if (!objs.length) return;
    const minX = Math.min(...objs.map(o => o.x));
    const minY = Math.min(...objs.map(o => o.y));
    const maxX = Math.max(...objs.map(o => o.x + o.w));
    const maxY = Math.max(...objs.map(o => o.y + o.h));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const pad = 16;
    const px = (cx + CANVAS_MARGIN) * currentScale + pad;
    const py = (cy + CANVAS_MARGIN) * currentScale + pad;
    canvasArea.scrollTo({ left: px - canvasArea.clientWidth / 2, top: py - canvasArea.clientHeight / 2, behavior: "smooth" });
}

document.getElementById("zoomInBtn").onclick = () => { state.zoom = Math.min(20, Math.round((state.zoom * 1.001) * 100000) / 100000); applyZoom(); scrollToSelection(); };
document.getElementById("zoomOutBtn").onclick = () => { state.zoom = Math.max(0.05, Math.round((state.zoom / 1.001) * 100000) / 100000); applyZoom(); scrollToSelection(); };
document.getElementById("zoomResetBtn").onclick = () => { state.zoom = 1; applyZoom(); scrollToSelection(); };
document.getElementById("zoomSlider").oninput = (e) => { state.zoom = e.target.value / 100; applyZoom(); scrollToSelection(); };

// Trackpad pinch-zoom / Ctrl+scroll-wheel zoom.
// Preview: CSS transform (GPU compositor, zero layout cost).
// Commit: full applyZoom() is debounced until the gesture settles.
let _zoomDebounce = null;
let _zoomBaseW = null; // canvasWrap width at the moment the gesture started
let _zoomBaseH = null;

canvasArea.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();

    const factor = Math.exp(-e.deltaY * 0.015);
    state.zoom = Math.min(20, Math.max(0.05, state.zoom * factor));

    // Capture base dimensions once per gesture (before any transform has been applied)
    if (_zoomBaseW === null) {
        _zoomBaseW = parseFloat(canvasWrap.style.width)  || canvasWrap.offsetWidth;
        _zoomBaseH = parseFloat(canvasWrap.style.height) || canvasWrap.offsetHeight;
    }

    // CSS transform preview — pure GPU operation, no layout recalculation
    const ratio = state.zoom / _committedZoom;
    svg.style.transformOrigin = "top left";
    svg.style.transform = `scale(${ratio})`;

    // Resize canvasWrap so the scrollbar tracks the apparent SVG size
    canvasWrap.style.width  = _zoomBaseW  * ratio + "px";
    canvasWrap.style.height = _zoomBaseH * ratio + "px";

    document.getElementById("zoomLevel").textContent = Math.round(state.zoom * 100) + "%";
    document.getElementById("zoomSlider").value = Math.round(state.zoom * 100);

    // Commit: re-render at true size once the gesture settles
    clearTimeout(_zoomDebounce);
    _zoomDebounce = setTimeout(() => {
        _zoomBaseW = null;
        _zoomBaseH = null;
        applyZoom();
    }, 120);
}, { passive: false });

// ============ Undo / Redo buttons ============
document.getElementById("undoBtn").onclick = undo;
document.getElementById("redoBtn").onclick = redo;

// ============ Save / Load project ============
function projectData() {
    return JSON.stringify({ slides: state.slides, current: state.current, slideW: SLIDE_W, slideH: SLIDE_H });
}

// Browsers rename re-downloaded files to avoid clobbering an existing one in
// Downloads (e.g. "Presentation (1).json"), so names are compared/stored with
// that suffix stripped - otherwise the same project picks up a different
// autosave key every time it's re-saved or re-loaded.
function normalizeAutosaveName(name) {
    return name.replace(/\s?\(\d+\)$/, "");
}

// Autosaving only starts once the user presses Save and picks/enters a file
// name. After that, every change is written back to that same file (via the
// File System Access API where available, or localStorage as a fallback).
let autosaveFileHandle = null;
let autosaveName = null;
let autosaveTimer = null;

// Shows a small pill in the header with a status message (used for autosave
// and for Save/Load feedback), flashing briefly to draw the eye.
function showStatus(html, ok = true) {
    const el = document.getElementById("autosaveStatus");
    el.classList.toggle("autosave-status-error", !ok);
    el.innerHTML = html;
    el.classList.remove("autosave-flash");
    requestAnimationFrame(() => {
        el.classList.add("autosave-flash");
        setTimeout(() => el.classList.remove("autosave-flash"), 700);
    });
}

// Renders the autosave indicator: a checkmark, the file name, and the time
// of the last save (or a warning icon + message on error).
function setAutosaveStatus(name, time, ok = true) {
    if (ok) {
        showStatus(`<span class="autosave-icon">&#10003;</span>Saved <span class="autosave-name">${escapeHtml(name)}</span><span class="autosave-time">${escapeHtml(time)}</span>`);
    } else {
        showStatus(`<span class="autosave-icon">&#9888;</span>${escapeHtml(time)}`, false);
    }
}

async function writeAutosave() {
    const data = projectData();
    try {
        if (!autosaveFileHandle && !autosaveName) return;
        if (autosaveFileHandle) {
            const writable = await autosaveFileHandle.createWritable();
            await writable.write(data);
            await writable.close();
        }
        // Always mirror to localStorage (even when writing to a real file via
        // the File System Access API) so a reloaded page can offer to
        // restore the latest autosave - file handles don't survive reloads.
        localStorage.setItem(`ldm-autosave:${autosaveName}`, data);
        localStorage.setItem("ldm-autosave-meta", JSON.stringify({ name: autosaveName, time: Date.now() }));
        setAutosaveStatus(autosaveName, new Date().toLocaleTimeString());
    } catch (err) {
        setAutosaveStatus(null, `Autosave failed: ${err.message}`, false);
    }
}

// Debounced so rapid edits (dragging, typing) collapse into one write.
function scheduleAutosave() {
    if (!autosaveFileHandle && !autosaveName) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(writeAutosave, 1500);
}

// If the page is closed/reloaded before the debounced autosave fires, the
// pending write would be lost - the status pill would still show "Saved"
// from an earlier edit even though the latest change never made it to disk
// or localStorage. Synchronously mirror to localStorage right away so the
// "prefer newer autosave on load" and restore-on-reload logic still see it.
function flushPendingAutosave() {
    if (!autosaveTimer) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
    if (!autosaveFileHandle && !autosaveName) return;
    localStorage.setItem(`ldm-autosave:${autosaveName}`, projectData());
    localStorage.setItem("ldm-autosave-meta", JSON.stringify({ name: autosaveName, time: Date.now() }));
}
window.addEventListener("beforeunload", flushPendingAutosave);
window.addEventListener("pagehide", flushPendingAutosave);
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingAutosave();
});

document.getElementById("saveProjectBtn").onclick = async () => {
    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: `${autosaveName || "presentation"}.json`,
                types: [{ description: "LaTeX Document Maker project", accept: { "application/json": [".json"] } }],
            });
            autosaveFileHandle = handle;
            autosaveName = handle.name.replace(/\.json$/i, "");
            await writeAutosave();
        } catch (err) {
            if (err.name !== "AbortError") alert(`Could not save file: ${err.message}`);
        }
        return;
    }

    // Fallback for browsers without the File System Access API: ask for a
    // name once, download the file, then keep autosaving to localStorage
    // under that name so future changes don't need another prompt.
    const name = prompt("Enter a name for this presentation (autosave will continue under this name):", autosaveName || "presentation");
    if (!name) return;
    autosaveName = name;
    autosaveFileHandle = null;
    const data = projectData();
    const blob = new Blob([data], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    localStorage.setItem(`ldm-autosave:${autosaveName}`, data);
    setAutosaveStatus(autosaveName, new Date().toLocaleTimeString());
};

// Validates and applies a loaded project object (from a file or from the
// autosave restore prompt), replacing the current slides.
function applyProjectData(data) {
    if (!Array.isArray(data.slides) || !data.slides.length) throw new Error("file has no slides");
    pushHistory(true);
    state.slides = data.slides;
    state.current = Math.min(data.current || 0, state.slides.length - 1);
    state.selection = [];
    SLIDE_W = data.slideW || 960; SLIDE_H = data.slideH || 540;
    state.slideW = SLIDE_W; state.slideH = SLIDE_H;
    render(); renderProperties();
    updateSlideSizeControls();
}

const loadProjectInput = document.getElementById("loadProjectInput");
document.getElementById("loadProjectBtn").onclick = () => loadProjectInput.click();
loadProjectInput.onchange = () => {
    const file = loadProjectInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            let data = JSON.parse(reader.result);
            const loadedName = file.name.replace(/\.json$/i, "");
            const normalizedLoadedName = normalizeAutosaveName(loadedName);

            // In browsers without the File System Access API, autosaves only
            // ever update localStorage - the originally-downloaded file is
            // never rewritten. If a newer autosave exists under this same
            // name, load that instead so recent changes aren't lost.
            let source = "file";
            let resolvedName = normalizedLoadedName;
            try {
                const meta = JSON.parse(localStorage.getItem("ldm-autosave-meta") || "null");
                if (meta && normalizeAutosaveName(meta.name) === normalizedLoadedName && meta.time > file.lastModified) {
                    const autosaved = localStorage.getItem(`ldm-autosave:${meta.name}`);
                    if (autosaved) { data = JSON.parse(autosaved); source = "autosave"; resolvedName = meta.name; }
                }
            } catch { /* fall back to the file's contents */ }

            applyProjectData(data);
            autosaveName = resolvedName;
            autosaveFileHandle = null;
            const label = source === "autosave" ? "Loaded (newer autosave)" : "Loaded";
            showStatus(`<span class="autosave-icon">&#10003;</span>${label} <span class="autosave-name">${escapeHtml(resolvedName)}</span><span class="autosave-time">${data.slides.length} slide${data.slides.length === 1 ? "" : "s"}</span>`);
        } catch (e) {
            console.error("Failed to load project file:", e);
            showStatus(`<span class="autosave-icon">&#9888;</span>Could not load "${escapeHtml(file.name)}": ${escapeHtml(e.message)}`, false);
        }
    };
    reader.onerror = () => {
        console.error("Failed to read project file:", reader.error);
        showStatus(`<span class="autosave-icon">&#9888;</span>Could not read "${escapeHtml(file.name)}": ${escapeHtml(reader.error ? reader.error.message : "unknown error")}`, false);
    };
    reader.readAsText(file);
    loadProjectInput.value = "";
};

// ============ Export: PDF (via browser print) ============
document.getElementById("exportPdfBtn").onclick = exportPdf;

function buildSlideSvgString(slide, slideIndex = state.current) {
    const wrapper = document.createElementNS(svgNS, "svg");
    wrapper.setAttribute("xmlns", svgNS);
    wrapper.setAttribute("viewBox", `0 0 ${SLIDE_W} ${SLIDE_H}`);
    wrapper.setAttribute("width", SLIDE_W);
    wrapper.setAttribute("height", SLIDE_H);
    wrapper.setAttribute("style", "overflow: hidden");
    const defs = document.createElementNS(svgNS, "defs");
    wrapper.appendChild(defs);
    // Clip everything to the slide bounds so objects dragged partially off
    // the slide during editing don't show up in the slide show.
    const clipId = "slide-clip-" + slideIndex;
    const clipPath = document.createElementNS(svgNS, "clipPath");
    clipPath.setAttribute("id", clipId);
    const clipRect = document.createElementNS(svgNS, "rect");
    applyAttrs(clipRect, { x: 0, y: 0, width: SLIDE_W, height: SLIDE_H });
    clipPath.appendChild(clipRect);
    defs.appendChild(clipPath);
    const content = document.createElementNS(svgNS, "g");
    content.setAttribute("clip-path", `url(#${clipId})`);
    wrapper.appendChild(content);
    const bg = document.createElementNS(svgNS, "rect");
    applyAttrs(bg, { x: 0, y: 0, width: SLIDE_W, height: SLIDE_H, fill: resolveFill(slide, defs) });
    content.appendChild(bg);
    slide.objects.forEach(obj => content.appendChild(renderObject(obj, defs, true, slideIndex)));
    appendHeaderFooter(content);
    return new XMLSerializer().serializeToString(wrapper);
}

function exportPdf() {
    let printArea = document.getElementById("printArea");
    if (printArea) printArea.remove();
    let pageStyle = document.getElementById("printPageStyle");
    if (pageStyle) pageStyle.remove();

    // Match the PDF page size & orientation to the slide's actual dimensions,
    // so non-default slide sizes (A4, Letter, portrait, custom, etc.) export correctly.
    const wCm = (SLIDE_W * PX_TO_CM).toFixed(3);
    const hCm = (SLIDE_H * PX_TO_CM).toFixed(3);
    pageStyle = document.createElement("style");
    pageStyle.id = "printPageStyle";
    pageStyle.textContent = `@page { size: ${wCm}cm ${hCm}cm; margin: 0; }`;
    document.head.appendChild(pageStyle);

    printArea = document.createElement("div");
    printArea.id = "printArea";
    state.slides.forEach((slide, i) => {
        const page = document.createElement("div");
        page.className = "print-page";
        page.innerHTML = buildSlideSvgString(slide, i);
        printArea.appendChild(page);
    });
    document.body.appendChild(printArea);
    window.print();
    setTimeout(() => { printArea.remove(); pageStyle.remove(); }, 1000);
}

// ============ Spell-check toggle ============
document.getElementById("spellcheckToggle").addEventListener("change", (e) => {
    spellcheckEnabled = e.target.checked;
    // Update every text-edit-box currently in the DOM
    svg.querySelectorAll(".text-edit-box").forEach(div => {
        div.setAttribute("spellcheck", spellcheckEnabled ? "true" : "false");
        div.setAttribute("autocorrect", spellcheckEnabled ? "on" : "off");
        div.setAttribute("autocapitalize", spellcheckEnabled ? "sentences" : "off");
    });
    // If one is actively being edited, force the browser to re-evaluate by
    // briefly removing and restoring contenteditable (no blur, no re-render).
    const active = document.querySelector('.text-edit-box[contenteditable="true"]');
    if (active) {
        active.contentEditable = "false";
        active.contentEditable = "true";
    }
});

// ============ Export: LaTeX (TikZ) + images as .zip ============
document.getElementById("exportTexBtn").onclick = exportTex;

function cmX(px) { return (px * PX_TO_CM).toFixed(3); }
function cmY(px) { return ((SLIDE_H - px) * PX_TO_CM).toFixed(3); } // flip so tikz y-axis points up

let colorRegistry = {};
function colorName(hex) {
    if (!hex || hex === "none") return null;
    const clean = hex.replace("#", "").toUpperCase();
    const name = "c" + clean;
    colorRegistry[name] = clean;
    return name;
}

function escapeLatex(str) {
    return (str || "")
        .replace(/\\/g, "\\textbackslash{}")
        .replace(/([{}_#%&$])/g, "\\$1")
        .replace(/\n/g, " \\\\ ");
}

function rgbToHex(rgb) {
    const m = (rgb || "").match(/\d+/g);
    if (!m) return null;
    return "#" + m.slice(0, 3).map(n => parseInt(n).toString(16).padStart(2, "0")).join("");
}

function latexFontCmd(fontFamily) {
    const ff = (fontFamily || "").toLowerCase();
    if (ff.includes("courier") || ff.includes("mono") || ff.includes("code") || ff.includes("typewriter") || ff.includes("console")) return "\\ttfamily";
    if (ff.includes("times") || ff.includes("georgia") || ff.includes("garamond") || ff.includes("palatino") || ff === "serif") return "\\rmfamily";
    return "\\sffamily";
}

// Converts the simple inline HTML produced by the text-formatting context
// menu (b/i/u/span color, from execCommand) into LaTeX markup.
function htmlInlineToLatex(html) {
    const container = document.createElement("div");
    container.innerHTML = html || "";
    function walk(node) {
        if (node.nodeType === Node.TEXT_NODE) return escapeLatex(node.textContent).replace(/ \\\\ $/, "");
        if (node.nodeType !== Node.ELEMENT_NODE) return "";
        const inner = Array.from(node.childNodes).map(walk).join("");
        switch (node.tagName) {
            case "B": case "STRONG": return `\\textbf{${inner}}`;
            case "I": case "EM": return `\\textit{${inner}}`;
            case "U": return `\\underline{${inner}}`;
            case "BR": return " \\\\ ";
            case "SPAN": case "FONT": {
                const color = node.style && node.style.color ? rgbToHex(node.style.color) : (node.color ? "#" + node.color.replace("#", "") : null);
                if (color) return `\\textcolor{${colorName(color)}}{${inner}}`;
                return inner;
            }
            default: return inner;
        }
    }
    return Array.from(container.childNodes).map(walk).join("");
}

function objectToTikz(obj, imageFiles, slideIndex = state.current) {
    const lines = [];
    if (obj.type === "group") {
        (obj.children || []).forEach(child => lines.push(objectToTikz(child, imageFiles, slideIndex)));
        const groupResult = lines.join("\n");
        if (obj.rotation) {
            const cx = ((obj.x + obj.w / 2) * PX_TO_CM).toFixed(3);
            const cy = ((SLIDE_H - (obj.y + obj.h / 2)) * PX_TO_CM).toFixed(3);
            return `\\begin{scope}[shift={(${cx},${cy})},rotate={${(-obj.rotation).toFixed(2)}},shift={(-${cx},-${cy})}]\n${groupResult}\n\\end{scope}`;
        }
        return groupResult;
    }
    let fillC = null;
    if (obj.fill) {
        if (obj.fill.type === "solid" && obj.fill.color !== "none") fillC = colorName(obj.fill.color);
        else if (obj.fill.type === "parchment") fillC = colorName(obj.fill.color || "#e8d9b5");
        else if (obj.fill.type === "emoji") fillC = colorName(obj.fill.bgColor || "#ffffff");
    }
    const strokeC = (obj.stroke && solidColorOf(obj.stroke) !== "none") ? colorName(solidColorOf(obj.stroke)) : null;
    const lw = (strokeC && obj.stroke) ? `line width=${(obj.stroke.width * 0.35).toFixed(2)}pt` : "";
    let dashOpt = "";
    if (strokeC && obj.stroke && obj.stroke.dash === "dashed") dashOpt = ", dashed";
    else if (strokeC && obj.stroke && obj.stroke.dash === "dotted") dashOpt = ", dotted";

    const opacityOpt = (obj.opacity !== undefined && obj.opacity < 100) ? `opacity=${(obj.opacity / 100).toFixed(2)}` : null;

    let drawOpts = [];
    if (fillC) drawOpts.push(`fill=${fillC}`);
    if (strokeC) drawOpts.push(`draw=${strokeC}`);
    if (lw) drawOpts.push(lw);
    if (dashOpt) drawOpts.push(dashOpt.replace(", ", ""));
    if (opacityOpt) drawOpts.push(opacityOpt);
    // \path is invisible (no fill, no stroke) — avoids spurious black outlines from \draw
    const cmd = (fillC && strokeC) ? "\\filldraw" : (fillC ? "\\fill" : (strokeC ? "\\draw" : "\\path"));
    const optsStr = drawOpts.length ? `[${drawOpts.join(", ")}]` : "";

    // gradient approximation: use first/last stop as a left/right (or top/bottom) shading
    let gradientNote = null;
    let gradOpts = null;
    if (obj.fill && obj.fill.type === "gradient" && obj.fill.stops && obj.fill.stops.length >= 2) {
        const stops = obj.fill.stops;
        const c1 = colorName(stops[0].color), c2 = colorName(stops[stops.length - 1].color);
        const angle = obj.fill.angle || 0;
        const horizontal = (angle >= 315 || angle < 45 || (angle >= 135 && angle < 225));
        const dir = obj.fill.gradientType === "radial" ? "ball color" : (horizontal ? "left color" : "top color");
        const dir2 = obj.fill.gradientType === "radial" ? null : (horizontal ? "right color" : "bottom color");
        gradOpts = obj.fill.gradientType === "radial" ? [`ball color=${c1}`] : [`${dir}=${c1}`, `${dir2}=${c2}`];
        if (strokeC) gradOpts.push(`draw=${strokeC}`);
        if (lw) gradOpts.push(lw);
        if (opacityOpt) gradOpts.push(opacityOpt);
        gradientNote = `% NOTE: gradient approximated with two-color shading (full multi-stop gradients are not natively supported by TikZ)`;
    }
    if (obj.fill && (obj.fill.type === "parchment" || obj.fill.type === "emoji")) {
        gradientNote = `% NOTE: ${obj.fill.type} fill approximated as a solid color (recreate the texture/pattern manually in LaTeX if needed)`;
    }

    switch (obj.type) {
        case "freeform": {
            if (gradientNote) lines.push(gradientNote);
            if (obj.pathSegments && obj.pathSegments.length >= 2) {
                // Pen-drawn shape: render using TikZ bezier path syntax
                const ax = v => obj.x + v * obj.w, ay = v => obj.y + v * obj.h;
                let tPath = "";
                for (const s of obj.pathSegments) {
                    if (s.type === "M")      tPath += `(${cmX(ax(s.x))},${cmY(ay(s.y))})`;
                    else if (s.type === "L") tPath += ` -- (${cmX(ax(s.x))},${cmY(ay(s.y))})`;
                    else if (s.type === "C") tPath += ` .. controls (${cmX(ax(s.cp1x))},${cmY(ay(s.cp1y))}) and (${cmX(ax(s.cp2x))},${cmY(ay(s.cp2y))}) .. (${cmX(ax(s.x))},${cmY(ay(s.y))})`;
                }
                if (obj.pathClosed) tPath += " -- cycle";
                const freeOpts = obj.pathClosed ? drawOpts : [...drawOpts, "fill=none"];
                lines.push(`${cmd}[${freeOpts.join(", ")}] ${tPath};`);
            } else {
                const subpaths = (obj.regions || []).map(region =>
                    region.map(p => `(${cmX(obj.x + p.x * obj.w)},${cmY(obj.y + p.y * obj.h)})`).join(" -- ") + " -- cycle"
                ).join(" ");
                const pathOpts = [...drawOpts, "even odd rule"];
                lines.push(`\\path[${pathOpts.join(", ")}] ${subpaths};`);
            }
            break;
        }
        case "rect": {
            const useOpts = gradOpts ? `[${["shading=axis", ...gradOpts].join(", ")}]` : optsStr;
            const useCmd = gradOpts ? (strokeC ? "\\shadedraw" : "\\shade") : cmd;
            if (gradientNote) lines.push(gradientNote);
            lines.push(`${useCmd}${useOpts} (${cmX(obj.x)},${cmY(obj.y + obj.h)}) rectangle (${cmX(obj.x + obj.w)},${cmY(obj.y)});`);
            break;
        }
        case "ellipse": {
            const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
            const useOpts = gradOpts ? `[${["shading=ball", ...gradOpts].join(", ")}]` : optsStr;
            const useCmd = gradOpts ? (strokeC ? "\\shadedraw" : "\\shade") : cmd;
            if (gradientNote) lines.push(gradientNote);
            lines.push(`${useCmd}${useOpts} (${cmX(cx)},${cmY(cy)}) ellipse (${(obj.w / 2 * PX_TO_CM).toFixed(3)}cm and ${(obj.h / 2 * PX_TO_CM).toFixed(3)}cm);`);
            break;
        }
        case "triangle":
        case "equilTriangle":
        case "rightTriangle":
        case "star":
        case "diamond":
        case "pentagon":
        case "hexagon":
        case "heptagon":
        case "decagon":
        case "dodecagon": {
            const pts = getShapePoints(obj);
            if (gradientNote) lines.push(gradientNote);
            lines.push(`${cmd}${optsStr} ${pts.map(p => `(${cmX(p[0])},${cmY(p[1])})`).join(" -- ")} -- cycle;`);
            break;
        }
        case "roundrect": {
            const ratio = Math.max(0, Math.min(0.5, obj.cornerRadius ?? 0.15));
            const r = (Math.min(obj.w, obj.h) * ratio * PX_TO_CM).toFixed(3);
            const useOpts = optsStr ? optsStr.replace("]", `, rounded corners=${r}cm]`) : `[rounded corners=${r}cm]`;
            if (gradientNote) lines.push(gradientNote);
            lines.push(`${cmd}${useOpts} (${cmX(obj.x)},${cmY(obj.y + obj.h)}) rectangle (${cmX(obj.x + obj.w)},${cmY(obj.y)});`);
            break;
        }
        case "heart": {
            lines.push(`% NOTE: heart shape approximated as a diamond (TikZ has no built-in heart primitive)`);
            const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
            const pts = [[cx, obj.y], [obj.x + obj.w, cy], [cx, obj.y + obj.h], [obj.x, cy]];
            if (gradientNote) lines.push(gradientNote);
            lines.push(`${cmd}${optsStr} ${pts.map(p => `(${cmX(p[0])},${cmY(p[1])})`).join(" -- ")} -- cycle;`);
            break;
        }
        case "speech": {
            lines.push(`% NOTE: speech bubble approximated as a rounded rectangle (tail not included)`);
            const r = (Math.min(obj.w, obj.h) * 0.12 * PX_TO_CM).toFixed(3);
            const useOpts = optsStr ? optsStr.replace("]", `, rounded corners=${r}cm]`) : `[rounded corners=${r}cm]`;
            if (gradientNote) lines.push(gradientNote);
            lines.push(`${cmd}${useOpts} (${cmX(obj.x)},${cmY(obj.y + obj.h * 0.78)}) rectangle (${cmX(obj.x + obj.w)},${cmY(obj.y)});`);
            break;
        }
        case "parallelogram":
        case "trapezoid":
        case "octagon":
        case "cross":
        case "rightArrow":
        case "leftArrow":
        case "upArrow":
        case "downArrow":
        case "doubleArrow":
        case "chevron":
        case "lightningBolt": {
            const pts = getShapePoints(obj);
            if (gradientNote) lines.push(gradientNote);
            lines.push(`${cmd}${optsStr} ${pts.map(p => `(${cmX(p[0])},${cmY(p[1])})`).join(" -- ")} -- cycle;`);
            break;
        }
        case "donut": {
            const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
            const rx = (obj.w / 2 * PX_TO_CM).toFixed(3), ry = (obj.h / 2 * PX_TO_CM).toFixed(3);
            const irx = (obj.w / 2 * 0.55 * PX_TO_CM).toFixed(3), iry = (obj.h / 2 * 0.55 * PX_TO_CM).toFixed(3);
            if (gradientNote) lines.push(gradientNote);
            lines.push(`${cmd}${optsStr} (${cmX(cx)},${cmY(cy)}) ellipse (${rx}cm and ${ry}cm) (${cmX(cx)},${cmY(cy)}) ellipse (${irx}cm and ${iry}cm);`);
            break;
        }
        case "pie":
        case "blockArc": {
            lines.push(`% NOTE: ${obj.type} shape approximated as an ellipse`);
            const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
            const rx = (obj.w / 2 * PX_TO_CM).toFixed(3), ry = (obj.h / 2 * PX_TO_CM).toFixed(3);
            if (gradientNote) lines.push(gradientNote);
            lines.push(`${cmd}${optsStr} (${cmX(cx)},${cmY(cy)}) ellipse (${rx}cm and ${ry}cm);`);
            break;
        }
        case "moon": {
            lines.push(`% NOTE: moon shape approximated as an ellipse`);
            const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
            const rx = (obj.w / 2 * PX_TO_CM).toFixed(3), ry = (obj.h / 2 * PX_TO_CM).toFixed(3);
            if (gradientNote) lines.push(gradientNote);
            lines.push(`${cmd}${optsStr} (${cmX(cx)},${cmY(cy)}) ellipse (${rx}cm and ${ry}cm);`);
            break;
        }
        case "cloud": {
            lines.push(`% NOTE: cloud shape approximated as a rounded rectangle`);
            const r = (Math.min(obj.w, obj.h) * 0.2 * PX_TO_CM).toFixed(3);
            const useOpts = optsStr ? optsStr.replace("]", `, rounded corners=${r}cm]`) : `[rounded corners=${r}cm]`;
            if (gradientNote) lines.push(gradientNote);
            lines.push(`${cmd}${useOpts} (${cmX(obj.x)},${cmY(obj.y + obj.h)}) rectangle (${cmX(obj.x + obj.w)},${cmY(obj.y)});`);
            break;
        }
        case "noSymbol": {
            const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
            const rx = (obj.w / 2 * PX_TO_CM).toFixed(3), ry = (obj.h / 2 * PX_TO_CM).toFixed(3);
            if (gradientNote) lines.push(gradientNote);
            lines.push(`${cmd}${optsStr} (${cmX(cx)},${cmY(cy)}) ellipse (${rx}cm and ${ry}cm);`);
            lines.push(`\\draw${strokeC ? `[draw=${strokeC}, ${lw}]` : ""} (${cmX(obj.x)},${cmY(obj.y)}) -- (${cmX(obj.x + obj.w)},${cmY(obj.y + obj.h)});`);
            break;
        }
        case "leftBrace":
        case "rightBrace":
        case "leftBracket":
        case "rightBracket": {
            lines.push(`% NOTE: ${obj.type} approximated as a square bracket`);
            const isLeft = obj.type === "leftBrace" || obj.type === "leftBracket";
            const x1 = isLeft ? obj.x + obj.w : obj.x, x0 = isLeft ? obj.x : obj.x + obj.w;
            lines.push(`\\draw[${strokeC ? `draw=${strokeC}` : "draw=black"}${lw ? `, ${lw}` : ""}${dashOpt}] (${cmX(x1)},${cmY(obj.y)}) -- (${cmX(x0)},${cmY(obj.y)}) -- (${cmX(x0)},${cmY(obj.y + obj.h)}) -- (${cmX(x1)},${cmY(obj.y + obj.h)});`);
            break;
        }
        case "cylinder": {
            lines.push(`% NOTE: cylinder shape approximated with an ellipse top and rectangle body`);
            const rx = (obj.w / 2 * PX_TO_CM).toFixed(3), ry = (obj.h * 0.12 * PX_TO_CM).toFixed(3);
            const cx = obj.x + obj.w / 2;
            const topY = obj.y + obj.h * 0.12, bottomY = obj.y + obj.h * 0.88;
            if (gradientNote) lines.push(gradientNote);
            lines.push(`${cmd}${optsStr} (${cmX(obj.x)},${cmY(topY)}) -- (${cmX(obj.x)},${cmY(bottomY)}) arc (180:360:${rx}cm and ${ry}cm) -- (${cmX(obj.x + obj.w)},${cmY(topY)}) arc (0:180:${rx}cm and ${ry}cm);`);
            lines.push(`\\draw${optsStr.replace(/fill[^,\]]*,?\s*/, "")} (${cmX(cx)},${cmY(topY)}) ellipse (${rx}cm and ${ry}cm);`);
            break;
        }
        case "line":
        case "arrow": {
            const arrowOpt = obj.type === "arrow" ? "->, " : "";
            const opts = [`${arrowOpt}${strokeC ? `draw=${strokeC}` : "draw=black"}`, lw].filter(Boolean).join(", ");
            const { p1, p2 } = lineEndpoints(obj);
            lines.push(`\\draw[${opts}${dashOpt}] (${cmX(p1.x)},${cmY(p1.y)}) -- (${cmX(p2.x)},${cmY(p2.y)});`);
            break;
        }
        case "text": {
            const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
            const tc = colorName(obj.fontColor) || "black";
            let style = [];
            if (obj.bold) style.push("\\bfseries");
            if (obj.italic) style.push("\\itshape");
            const sizept = (obj.fontSize * 0.75).toFixed(1);
            const text = obj.field ? fieldText(obj, slideIndex) : obj.text;
            if (obj.isCode) {
                const bgColor = colorName((obj.fill && obj.fill.color) || "#1e1e2e") || "black";
                const x1 = cmX(obj.x), y1 = cmY(obj.y), x2 = cmX(obj.x + obj.w), y2 = cmY(obj.y + obj.h);
                lines.push(`\\draw[rounded corners=4pt, fill=${bgColor}, draw=none] (${x1},${y1}) rectangle (${x2},${y2});`);
                const codeSizept = (obj.fontSize * 0.75).toFixed(1);
                const codeLines = (text || "").split("\n").map(l => escapeLatex(l)).join(" \\\\ ");
                lines.push(`\\node[anchor=north west, text=${tc}, font=\\fontsize{${codeSizept}}{${(codeSizept * 1.2).toFixed(1)}}\\selectfont\\ttfamily, text width=${(obj.w * PX_TO_CM - 0.6).toFixed(2)}cm, align=left] at (${cmX(obj.x + 8)},${cmY(obj.y + 8)}) {${codeLines}};`);
                const badge = getCodeBadge(obj.codeLang);
                const badgeColor = colorName(badge.color) || "gray";
                const badgeTextColor = colorName(badge.text) || "white";
                const bw = 24, bh = 14, margin = 6;
                const bx1 = cmX(obj.x + obj.w - margin - bw), by1 = cmY(obj.y + margin);
                const bx2 = cmX(obj.x + obj.w - margin), by2 = cmY(obj.y + margin + bh);
                lines.push(`\\draw[rounded corners=1pt, fill=${badgeColor}, draw=none] (${bx1},${by1}) rectangle (${bx2},${by2});`);
                lines.push(`\\node[text=${badgeTextColor}, font=\\fontsize{6}{7}\\selectfont\\bfseries] at (${cmX(obj.x + obj.w - margin - bw / 2)},${cmY(obj.y + margin + bh / 2)}) {${escapeLatex(badge.abbr)}};`);
                break;
            }
            let txt;
            if (obj.isEquation) {
                txt = `$${equationToTex(text, obj.rawTex)}$`;
            } else if (obj.list && obj.list !== "none") {
                const env = LIST_ORDERED.has(obj.list) ? "enumerate" : "itemize";
                const items = (text || "").split("\n").map(line => `\\item ${htmlInlineToLatex(line)}`).join(" ");
                txt = `\\begin{${env}} ${items} \\end{${env}}`;
            } else {
                txt = htmlInlineToLatex(text);
                if (obj.underline) txt = `\\underline{${txt}}`;
            }
            if (obj.href) txt = `\\href{${obj.href}}{${txt}}`;
            const fontFam = latexFontCmd(obj.fontFamily);
            lines.push(`\\node[align=${obj.align === "centerH" ? "center" : (obj.align || "left")}, text=${tc}, font=\\fontsize{${sizept}}{${(sizept * 1.2).toFixed(1)}}\\selectfont${fontFam}${style.length ? " " + style.join(" ") : ""}, text width=${(obj.w * PX_TO_CM).toFixed(2)}cm] at (${cmX(cx)},${cmY(cy)}) {${txt}};`);
            break;
        }
        case "image": {
            const idx = imageFiles.length + 1;
            const fname = `image${idx}.png`;
            imageFiles.push({ name: fname, dataURL: obj.src });
            const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
            lines.push(`\\node at (${cmX(cx)},${cmY(cy)}) {\\includegraphics[width=${(obj.w * PX_TO_CM).toFixed(2)}cm,height=${(obj.h * PX_TO_CM).toFixed(2)}cm]{${fname}}};`);
            break;
        }
        case "chart": {
            const data = (obj.chartData && obj.chartData.length) ? obj.chartData : [1];
            const labels = obj.chartLabels || [];
            const chartType = obj.chartType || "bar";
            const padding = 8 * PX_TO_CM;
            const labelH = 16 * PX_TO_CM;
            const x0 = obj.x * PX_TO_CM + padding;
            const chartW = obj.w * PX_TO_CM - padding * 2;
            const chartH = obj.h * PX_TO_CM - padding - labelH;
            const axisYpx = obj.y + obj.h - 8 - 16;

            if (chartType === "line") {
                const max = Math.max(...data, 1);
                const min = Math.min(...data, 0);
                const range = (max - min) || 1;
                const n = data.length;
                const stepX = n > 1 ? chartW / (n - 1) : 0;
                const lineColor = colorName(obj.barColor || "#2454a0") || "blue";
                const pts = data.map((v, i) => [x0 + i * stepX, parseFloat(cmY(axisYpx)) + ((v - min) / range) * chartH]);
                lines.push(`\\draw[${lineColor}, thick] ${pts.map(p => `(${p[0].toFixed(3)},${p[1].toFixed(3)})`).join(" -- ")};`);
                pts.forEach(([px, py], i) => {
                    lines.push(`\\fill[${lineColor}] (${px.toFixed(3)},${py.toFixed(3)}) circle (0.05cm);`);
                    if (labels[i]) lines.push(`\\node[font=\\tiny, anchor=north] at (${px.toFixed(3)},${cmY(axisYpx)}) {${escapeLatex(labels[i])}};`);
                });
                lines.push(`\\draw[gray, thin] (${x0.toFixed(3)},${cmY(axisYpx)}) -- (${(x0 + chartW).toFixed(3)},${cmY(axisYpx)});`);
            } else if (chartType === "pie" || chartType === "donut") {
                const total = data.reduce((a, b) => a + b, 0) || 1;
                const hasLegend = labels.some(l => l);
                const legendWpx = hasLegend ? Math.min(obj.w * 0.35, 90) : 0;
                const plotWpx = obj.w - legendWpx;
                const cxpx = obj.x + plotWpx / 2, cypx = obj.y + obj.h / 2;
                const rpx = Math.max(Math.min(plotWpx, obj.h) / 2 - 8, 1);
                const rcm = (rpx * PX_TO_CM).toFixed(3);
                const cxcm = (cxpx * PX_TO_CM).toFixed(3), cycm = cmY(cypx);
                let cum = 0;
                data.forEach((v, i) => {
                    const frac = v / total;
                    const color = colorName(CHART_PALETTE[i % CHART_PALETTE.length]) || "blue";
                    if (data.length === 1) {
                        lines.push(`\\fill[${color}] (${cxcm},${cycm}) circle (${rcm}cm);`);
                    } else {
                        const startDeg = (90 - cum * 360).toFixed(2);
                        const endDeg = (90 - (cum + frac) * 360).toFixed(2);
                        lines.push(`\\fill[${color}] (${cxcm},${cycm}) -- ++(${startDeg}:${rcm}cm) arc (${startDeg}:${endDeg}:${rcm}cm) -- cycle;`);
                    }
                    cum += frac;
                });
                if (chartType === "donut") {
                    lines.push(`\\fill[white] (${cxcm},${cycm}) circle (${(parseFloat(rcm) * 0.5).toFixed(3)}cm);`);
                }
                if (hasLegend) {
                    const itemHpx = Math.min(18, obj.h / labels.length);
                    labels.forEach((lab, i) => {
                        if (!lab) return;
                        const lxpx = obj.x + plotWpx + 6;
                        const lypx = obj.y + 8 + i * itemHpx;
                        const color = colorName(CHART_PALETTE[i % CHART_PALETTE.length]) || "blue";
                        lines.push(`\\fill[${color}] (${(lxpx * PX_TO_CM).toFixed(3)},${cmY(lypx + 10)}) rectangle (${((lxpx + 10) * PX_TO_CM).toFixed(3)},${cmY(lypx)});`);
                        lines.push(`\\node[font=\\tiny, anchor=west] at (${((lxpx + 14) * PX_TO_CM).toFixed(3)},${cmY(lypx + 5)}) {${escapeLatex(lab)}};`);
                    });
                }
            } else {
                const max = Math.max(...data, 1);
                const n = data.length;
                const barColor = colorName(obj.barColor || "#2454a0") || "blue";
                const gap = chartW * 0.03;
                const barW = (chartW - gap * (n + 1)) / n;
                data.forEach((v, i) => {
                    const barHcm = (v / max) * chartH;
                    const bx = x0 + gap + i * (barW + gap);
                    lines.push(`\\fill[${barColor}] (${(bx).toFixed(3)},${cmY(axisYpx)}) rectangle (${(bx + barW).toFixed(3)},${(parseFloat(cmY(axisYpx)) + barHcm).toFixed(3)});`);
                    if (labels[i]) {
                        lines.push(`\\node[font=\\tiny, anchor=north] at (${(bx + barW / 2).toFixed(3)},${cmY(axisYpx)}) {${escapeLatex(labels[i])}};`);
                    }
                });
                lines.push(`\\draw[gray, thin] (${x0.toFixed(3)},${cmY(axisYpx)}) -- (${(x0 + chartW).toFixed(3)},${cmY(axisYpx)});`);
            }
            break;
        }
        case "zoom": {
            const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
            const r = (Math.min(obj.w, obj.h) * 0.12 * PX_TO_CM).toFixed(3);
            lines.push(`% NOTE: Zoom links are interactive in the editor only; this renders as a placeholder frame`);
            lines.push(`\\draw[${strokeC ? `draw=${strokeC}` : "draw=blue"}, dashed, rounded corners=${r}cm] (${cmX(obj.x)},${cmY(obj.y + obj.h)}) rectangle (${cmX(obj.x + obj.w)},${cmY(obj.y)});`);
            lines.push(`\\node at (${cmX(cx)},${cmY(cy)}) {Slide ${(obj.targetSlide ?? 0) + 1}};`);
            break;
        }
        case "object": {
            const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
            if (gradientNote) lines.push(gradientNote);
            lines.push(`${cmd}${optsStr} (${cmX(obj.x)},${cmY(obj.y + obj.h)}) rectangle (${cmX(obj.x + obj.w)},${cmY(obj.y)});`);
            lines.push(`\\node at (${cmX(cx)},${cmY(cy)}) {[${escapeLatex(obj.fileName || "Object")}]};`);
            break;
        }
        case "icon": {
            const ic = ICON_LIBRARY.find(i => i.id === obj.iconId);
            if (ic && fillC) {
                const sx = (obj.w / 24 * PX_TO_CM).toFixed(4);
                const sy = (obj.h / 24 * PX_TO_CM).toFixed(4);
                const tx = (obj.x * PX_TO_CM).toFixed(3);
                const ty = ((SLIDE_H - obj.y - obj.h) * PX_TO_CM).toFixed(3);
                lines.push(`\\begin{scope}[xshift=${tx}cm, yshift=${ty}cm, xscale=${sx}, yscale=-${sy}]`);
                lines.push(`\\fill[${fillC}] svg path{${ic.d}};`);
                lines.push(`\\end{scope}`);
            } else {
                lines.push(`% Icon ${obj.iconId || "unknown"} (requires \\usetikzlibrary{svg.path})`);
                if (fillC) lines.push(`\\fill[${fillC}] (${cmX(obj.x)},${cmY(obj.y + obj.h)}) rectangle (${cmX(obj.x + obj.w)},${cmY(obj.y)});`);
            }
            break;
        }
        case "video":
        case "audio": {
            const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
            const label = obj.type === "video" ? "Video" : "Audio";
            lines.push(`% NOTE: ${label} cannot be embedded in PDF/LaTeX output; rendered as a placeholder`);
            lines.push(`\\draw[fill=gray!15] (${cmX(obj.x)},${cmY(obj.y + obj.h)}) rectangle (${cmX(obj.x + obj.w)},${cmY(obj.y)});`);
            lines.push(`\\node at (${cmX(cx)},${cmY(cy)}) {${label}: ${escapeLatex(obj.fileName || "")}};`);
            break;
        }
    }

    // typed text label on a shape (rect, ellipse, etc.)
    if (TEXT_CAPABLE_SHAPES.includes(obj.type) && obj.text) {
        const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
        const tc = colorName(obj.fontColor) || "black";
        let style = [];
        if (obj.bold) style.push("\\bfseries");
        if (obj.italic) style.push("\\itshape");
        const sizept = (obj.fontSize * 0.75).toFixed(1);
        let txt = escapeLatex(obj.text);
        if (obj.underline) txt = `\\underline{${txt}}`;
        const shapeFontFam = latexFontCmd(obj.fontFamily);
        lines.push(`\\node[align=${obj.align === "centerH" ? "center" : (obj.align || "center")}, text=${tc}, font=\\fontsize{${sizept}}{${(sizept * 1.2).toFixed(1)}}\\selectfont${shapeFontFam}${style.length ? " " + style.join(" ") : ""}, text width=${(obj.w * 0.9 * PX_TO_CM).toFixed(2)}cm] at (${cmX(cx)},${cmY(cy)}) {${txt}};`);
    }

    const result = lines.join("\n");
    if (obj.rotation) {
        const cx = ((obj.x + obj.w / 2) * PX_TO_CM).toFixed(3);
        const cy = ((SLIDE_H - (obj.y + obj.h / 2)) * PX_TO_CM).toFixed(3);
        const rotated = result.replace(/\\node\[/g, "\\node[transform shape, ");
        return `\\begin{scope}[shift={(${cx},${cy})},rotate={${(-obj.rotation).toFixed(2)}},shift={(-${cx},-${cy})}]\n${rotated}\n\\end{scope}`;
    }
    return result;
}

function generateTex() {
    colorRegistry = {};
    const imageFiles = [];
    const slideBlocks = state.slides.map((slide, slideIndex) => {
        let bgLines = "";
        const bg = slide.fill || { type: "solid", color: "#ffffff" };
        if (!(bg.type === "solid" && bg.color.toLowerCase() === "#ffffff")) {
            bgLines = objectToTikz({ id: slide.id + "-bg", type: "rect", x: 0, y: 0, w: SLIDE_W, h: SLIDE_H,
                fill: bg, stroke: { color: "none" }, opacity: 100 }, imageFiles, slideIndex) + "\n";
        }
        const body = slide.objects.map(obj => objectToTikz(obj, imageFiles, slideIndex)).join("\n");
        let headerFooterLines = "";
        if (state.headerText) {
            headerFooterLines += `\\node[font=\\small, text=gray] at (${cmX(SLIDE_W / 2)},${cmY(16)}) {${escapeLatex(state.headerText)}};\n`;
        }
        if (state.footerText) {
            headerFooterLines += `\\node[font=\\small, text=gray] at (${cmX(SLIDE_W / 2)},${cmY(SLIDE_H - 8)}) {${escapeLatex(state.footerText)}};\n`;
        }
        const pageW = (SLIDE_W * PX_TO_CM).toFixed(2), pageH = (SLIDE_H * PX_TO_CM).toFixed(2);
        return `\\begin{tikzpicture}\n\\useasboundingbox (0,0) rectangle (${pageW},${pageH});\n\\clip (0,0) rectangle (${pageW},${pageH});\n${bgLines}${body}\n${headerFooterLines}\\end{tikzpicture}`;
    });

    const colorDefs = Object.entries(colorRegistry).map(([name, hex]) => `\\definecolor{${name}}{HTML}{${hex}}`).join("\n");

    const pageWcm = (SLIDE_W * PX_TO_CM).toFixed(2);
    const pageHcm = (SLIDE_H * PX_TO_CM).toFixed(2);

    const tex = `\\documentclass{article}
\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage{lmodern}
\\usepackage{helvet}
\\usepackage{courier}
\\usepackage[paperwidth=${pageWcm}cm,paperheight=${pageHcm}cm,margin=0pt]{geometry}
\\usepackage{tikz}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{amsmath}
\\usetikzlibrary{shadings,svg.path}
\\pagestyle{empty}
\\setlength{\\parindent}{0pt}

${colorDefs}

\\begin{document}

${slideBlocks.join("\n\n\\newpage\n\n")}

\\end{document}
`;
    return { tex, imageFiles };
}

function exportTex() {
    const { tex, imageFiles } = generateTex();
    const zip = new JSZip();
    zip.file("document.tex", tex);
    imageFiles.forEach(img => {
        const base64 = img.dataURL.split(",")[1];
        zip.file(img.name, base64, { base64: true });
    });
    zip.generateAsync({ type: "blob" }).then(blob => {
        const input = prompt("Name your zip file:", "latex-document");
        if (input === null) return;
        const name = (input.trim() || "latex-document").replace(/\.zip$/i, "") + ".zip";
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
}

// ============ Icon Picker ============
function insertIconObject(iconId) {
    const slide = curSlide();
    const obj = makeObject("icon", (SLIDE_W - 80) / 2, (SLIDE_H - 80) / 2, 80, 80);
    obj.iconId = iconId;
    slide.objects.push(obj);
    state.selection = [obj.id];
    render();
    renderProperties();
    pushHistory();
}

let iconPickerCat = "All";
let iconPickerSearch = "";

function buildIconGrid() {
    const grid = document.getElementById("iconPickerGrid");
    if (!grid) return;
    const search = iconPickerSearch.toLowerCase();
    const icons = ICON_LIBRARY.filter(ic =>
        (iconPickerCat === "All" || ic.cat === iconPickerCat) &&
        (!search || ic.label.toLowerCase().includes(search) || ic.id.includes(search))
    );
    grid.innerHTML = "";
    grid.scrollTop = 0;
    icons.forEach(ic => {
        const btn = document.createElement("button");
        btn.className = "icon-grid-btn";
        btn.title = ic.label;
        btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="${ic.d}" fill-rule="evenodd"/></svg><span>${ic.label}</span>`;
        btn.addEventListener("mousedown", e => e.stopPropagation());
        btn.addEventListener("click", () => {
            insertIconObject(ic.id);
            document.getElementById("iconsDropdownMenu").classList.remove("open");
        });
        grid.appendChild(btn);
    });
    if (!icons.length) {
        grid.innerHTML = '<p style="color:#999;font-size:0.78rem;padding:8px;margin:0">No icons found</p>';
    }
}

(function initIconPicker() {
    const searchInput = document.getElementById("iconSearchInput");
    const catBar = document.getElementById("iconCatBar");
    if (!searchInput || !catBar) return;

    searchInput.addEventListener("input", e => {
        iconPickerSearch = e.target.value;
        buildIconGrid();
    });
    searchInput.addEventListener("keydown", e => e.stopPropagation());
    searchInput.addEventListener("mousedown", e => e.stopPropagation());
    searchInput.addEventListener("click", e => e.stopPropagation());

    catBar.querySelectorAll(".icon-cat-btn").forEach(btn => {
        btn.addEventListener("mousedown", e => e.stopPropagation());
        btn.addEventListener("click", e => {
            e.stopPropagation();
            catBar.querySelectorAll(".icon-cat-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            iconPickerCat = btn.dataset.cat;
            buildIconGrid();
        });
    });

    // Rebuild grid every time the picker opens via MutationObserver
    const menu = document.getElementById("iconsDropdownMenu");
    if (menu) {
        const obs = new MutationObserver(() => {
            if (menu.classList.contains("open")) buildIconGrid();
        });
        obs.observe(menu, { attributes: true, attributeFilter: ["class"] });
    }
    buildIconGrid();
})();

// ============ Sidebar resizing ============
function setupSidebarResize(handle, panel, side) {
    const MIN_W = 120, MAX_W = 480;
    handle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = panel.getBoundingClientRect().width;
        handle.classList.add("resizing");
        document.body.style.cursor = "col-resize";

        const onMove = (me) => {
            const delta = side === "left" ? (me.clientX - startX) : (startX - me.clientX);
            const newW = Math.min(MAX_W, Math.max(MIN_W, startW + delta));
            panel.style.width = `${newW}px`;
        };
        const onUp = () => {
            handle.classList.remove("resizing");
            document.body.style.cursor = "";
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    });
}
setupSidebarResize(document.getElementById("slidesResizeHandle"), document.getElementById("slidesPanel"), "left");
setupSidebarResize(document.getElementById("propsResizeHandle"), document.getElementById("propertiesPanel"), "right");

// ============ Properties panel collapse ============
const propsToggleBtn = document.getElementById("propsToggleBtn");
const propertiesPanelEl = document.getElementById("propertiesPanel");
let propsLastWidth = "";
propsToggleBtn.onclick = () => {
    const collapsed = propertiesPanelEl.classList.toggle("collapsed");
    if (collapsed) {
        propsLastWidth = propertiesPanelEl.style.width;
        propsToggleBtn.innerHTML = "&#9666;";
        propsToggleBtn.title = "Expand panel";
    } else {
        propertiesPanelEl.style.width = propsLastWidth;
        propsToggleBtn.innerHTML = "&#9656;";
        propsToggleBtn.title = "Collapse panel";
    }
};

// ============ TEMP: header color picker ============
function hexToHsl(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    const d = max - min;
    if (d === 0) { h = 0; s = 0; }
    else {
        s = d / (1 - Math.abs(2 * l - 1));
        switch (max) {
            case r: h = ((g - b) / d) % 6; break;
            case g: h = (b - r) / d + 2; break;
            default: h = (r - g) / d + 4;
        }
        h *= 60;
        if (h < 0) h += 360;
    }
    return [h, s, l];
}
function hslToHex(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r, g, b;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
function applyHeaderColor(hex) {
    const [h, s, l] = hexToHsl(hex);
    const root = document.documentElement.style;
    root.setProperty("--header-bg", hex);
    root.setProperty("--header-bg-light", hslToHex(h, s, Math.min(1, l + 0.13)));
    root.setProperty("--header-bg-dark", hslToHex(h, s, Math.max(0, l - 0.08)));
    root.setProperty("--header-border", hslToHex(h, s, Math.max(0, l - 0.13)));
    document.getElementById("headerColorPicker").value = hex;
}
document.getElementById("headerColorPicker").addEventListener("input", (e) => {
    applyHeaderColor(e.target.value);
});

// ============ Init ============
render();
applyZoom();
renderProperties();
updateHistoryButtons();

// If a previous session left an autosave behind (e.g. the page was closed
// or refreshed without exporting), offer to pick up where it left off and
// resume autosaving under the same name. Shown as a dismissible pill rather
// than a confirm() dialog so it doesn't interrupt every reload, and once
// dismissed/restored it won't reappear for the same autosave (only for a
// newer one).
(function offerAutosaveRestore() {
    let meta;
    try {
        meta = JSON.parse(localStorage.getItem("ldm-autosave-meta") || "null");
    } catch {
        return;
    }
    if (!meta || !meta.name) return;
    const raw = localStorage.getItem(`ldm-autosave:${meta.name}`);
    if (!raw) return;
    if (Number(localStorage.getItem("ldm-autosave-seen")) >= meta.time) return;

    const when = new Date(meta.time).toLocaleString();
    showStatus(`<span class="autosave-icon">&#128190;</span>Autosave found: <span class="autosave-name">${escapeHtml(meta.name)}</span><span class="autosave-time">${escapeHtml(when)}</span><div class="autosave-actions"><button id="autosaveRestoreBtn" class="autosave-action">Restore</button><button id="autosaveDismissBtn" class="autosave-action">Dismiss</button></div>`);

    document.getElementById("autosaveDismissBtn").onclick = () => {
        localStorage.setItem("ldm-autosave-seen", String(meta.time));
        showStatus("");
    };
    document.getElementById("autosaveRestoreBtn").onclick = () => {
        localStorage.setItem("ldm-autosave-seen", String(meta.time));
        try {
            const data = JSON.parse(raw);
            applyProjectData(data);
            autosaveName = meta.name;
            autosaveFileHandle = null;
            showStatus(`<span class="autosave-icon">&#10003;</span>Restored <span class="autosave-name">${escapeHtml(meta.name)}</span><span class="autosave-time">autosaved ${escapeHtml(when)}</span>`);
        } catch (e) {
            console.error("Failed to restore autosave:", e);
            showStatus(`<span class="autosave-icon">&#9888;</span>Could not restore autosave: ${escapeHtml(e.message)}`, false);
        }
    };
})();

// ============ Slide show ============
const slideShowOverlay = document.getElementById("slideShowOverlay");
const slideShowStage = document.getElementById("slideShowStage");
let slideShowIndex = 0;

function renderSlideShowSlide() {
    const slide = state.slides[slideShowIndex];
    if (!slide) return;
    slideShowStage.innerHTML = buildSlideSvgString(slide, slideShowIndex);
}

function startSlideShow() {
    if (!state.slides.length) return;
    slideShowIndex = state.current;
    renderSlideShowSlide();
    slideShowOverlay.classList.add("active");
    if (slideShowOverlay.requestFullscreen) slideShowOverlay.requestFullscreen().catch(() => {});
}

function exitSlideShow() {
    slideShowOverlay.classList.remove("active");
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

function slideShowGo(delta) {
    const next = slideShowIndex + delta;
    if (next < 0 || next >= state.slides.length) return;
    slideShowIndex = next;
    renderSlideShowSlide();
}

document.getElementById("slideShowBtn").onclick = startSlideShow;
document.getElementById("slideShowCloseBtn").onclick = exitSlideShow;
document.getElementById("slideShowPrevBtn").onclick = () => slideShowGo(-1);
document.getElementById("slideShowNextBtn").onclick = () => slideShowGo(1);

slideShowOverlay.addEventListener("click", (e) => {
    if (e.target === slideShowOverlay || e.target === slideShowStage) slideShowGo(1);
});

document.addEventListener("keydown", (e) => {
    if (!slideShowOverlay.classList.contains("active")) {
        if (e.key === "F5") { e.preventDefault(); startSlideShow(); }
        return;
    }
    if (e.key === "Escape") { exitSlideShow(); return; }
    if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); slideShowGo(1); return; }
    if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); slideShowGo(-1); return; }
});

document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && slideShowOverlay.classList.contains("active")) {
        slideShowOverlay.classList.remove("active");
    }
});
