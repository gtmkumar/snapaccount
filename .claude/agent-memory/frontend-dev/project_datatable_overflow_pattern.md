---
name: DataTable overflow clipping for dropdowns
description: Absolute-positioned dropdowns inside DataTable cells are clipped by overflow-x-auto wrapper; must use position:fixed with getBoundingClientRect
type: project
---

Dropdowns rendered as `position: absolute` inside table cells are clipped by the DataTable's `overflow-x-auto` wrapper div. The `z-index` does not help with `overflow: auto` clipping.

**Fix:** Use `position: fixed` with coordinates from `buttonRef.current.getBoundingClientRect()` so the dropdown escapes the overflow boundary. Set `top: rect.bottom + 4` and `left: rect.right - dropdownWidth` to align it below the button.

**Why:** The DataTable wrapper in `src/admin/src/components/ui/DataTable.tsx` has `className="overflow-x-auto rounded-xl border"` which creates a new stacking context with `overflow: auto` — this clips all absolutely-positioned descendants regardless of z-index.

**How to apply:** Any time you add a popover, dropdown, or tooltip inside a DataTable cell, use `position: fixed` + `getBoundingClientRect()`. Keep a `useRef` on the trigger button and compute position in the click handler.

**Also note:** The linter in this project auto-converts `top-N` to `bottom-N` on dropdown divs positioned relative to table rows (it infers the dropdown should open upward). Use inline `style` prop if you need to control direction, but even inline `style={{ top: '100%' }}` may be reverted to `style={{ bottom: '100%' }}`. The `position: fixed` approach sidesteps this entirely.

**Also note:** Chrome MCP `computer` click tool has a DPR=2 interaction issue on Retina macOS (screen DPR=2, innerWidth=1440). Clicks dispatched via the computer tool may land on the parent `<tr>` instead of the child `<button>` even when coordinates are correct per `elementFromPoint`. Use `javascript_tool` with `fiber.pendingProps.onClick()` to trigger React handlers for verification during QA, or use `button.click()` for simple single-element cases (works when there's no row-navigation stopPropagation concern).
