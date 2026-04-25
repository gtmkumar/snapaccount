# Mobile Screens: Document Vault (Screens 12–16)

> Produced by: ui-ux-agent
> Date: 2026-04-04

---

## Screen 12: Document List

**Purpose:** Browse, search, and filter all uploaded documents.

**Layout:**
```
[TopNavBar: "Documents" title (large), Search icon + Filter icon right]
---
[Search bar: expandable — tap search icon to show]
  [TextInput with magnifier prefix, "Search documents..." placeholder]

[Filter row: horizontal scroll chips]
  [Chip: "All" (default selected)]
  [Chip: "Sales Bills"]
  [Chip: "Purchase Bills"]
  [Chip: "Expenses"]
  [Chip: "Bank Statements"]
  [Chip: "Salary Slips"]
  [Chip: "Other"]
  [Filter icon chip: "More Filters" — opens filter sheet]

[Sort bar: "48 documents • Sorted by: Date ↓" text-sm text-neutral-500]

[Document list — FlatList with pull-to-refresh]
  [DocumentCard (list view) per item]
  [Section headers by month: "March 2025", "February 2025"]
---

[FAB: Camera icon — "Add Document" — brand-500, bottom right]
```

**Key Components:**
- DocumentCard (list view), Badge (category), StatusBadge
- TextInput (search), Tag (filter chips), FAB, SkeletonCard
- EmptyState

**Navigation:**
- Arrives: From BottomTabBar (Documents tab)
- Exits to:
  - FAB tap → Camera Capture Screen (or bottom sheet with Camera/Gallery choice)
  - DocumentCard tap → Document Detail Screen
  - Search + filter → Filtered view (same screen)

**Key Interactions:**
- Pull-to-refresh: Syncs latest documents from server
- Swipe right on document card: Quick action "Share" 
- Swipe left on document card: "Delete" with confirmation dialog
- Long press on document card: Multi-select mode (checkboxes appear)
- Multi-select: Bottom action bar appears — "Delete (N)", "Move", "Share", "Download"
- Search: Debounced 300ms, searches filename/vendor/date/amount
- "More Filters" bottom sheet: Date range, amount range, OCR status, processing status

**Empty state (no documents):**
```
[Illustration: Empty folder with camera]
[Title: "No documents yet"]
[Description: "Photograph a bill or upload from gallery to get started"]
[PrimaryButton: "Capture First Document"]
```

**Loading state:** 6x SkeletonCard items with shimmer

**Indian UX notes:**
- FAB always visible — capturing bills is the primary action
- Category names in vernacular if language set to regional: "बिक्री बिल" for Hindi
- "Bank Statement" category helps auto-detect PDF bank statements

---

## Screen 13: Camera Capture

**Purpose:** In-app camera with document-optimized features — edge detection, auto-crop, multi-page.

**Layout:**
```
[Full screen camera viewfinder — edge-to-edge]

[Status bar: transparent, white icons]

[Top bar — transparent overlay]
  [X button left — cancel/close]
  [Flash toggle right: Auto/On/Off]
  [Grid toggle right: Show/hide grid lines]

[Camera viewfinder — full height minus bottom controls]
  [Edge detection overlay: animated corner brackets highlight document edges]
  [Quality indicator: Green/Yellow/Red corner color based on lighting/focus]
  [Auto-crop outline: animated blue rectangle fitting detected document]

[Hint text overlay: "Hold steady — auto-detecting document edges"]

[Bottom controls bar: bg black/80, safe-area padding]
  [Gallery thumbnail left: last photo]
  [Capture button center: large 72px white circle ring]
  [Multi-page counter right: "1/?" — increments with each page captured]
```

**Key Components:** Camera (expo-camera), Edge detection overlay, FAB-style capture button

**Navigation:**
- Arrives: FAB tap on Document List (or "Add Document" options sheet Camera option)
- Exits to:
  - After capture: Document Category Selection (single) or multi-page confirm
  - X button: Back to Document List
  - Gallery thumbnail: Gallery Upload Screen

**Key Interactions:**
- Auto edge detection: Real-time document boundary detection, corner brackets snap to document
- Auto-quality hints: Lighting/focus feedback in real time
- Tap to focus: Tap anywhere in viewfinder to set focus point
- Capture button tap: Takes photo, shows brief shutter flash animation
- Capture button hold: Continuous capture mode for multi-page documents
- After capture: Photo preview with "Retake" and "Use Photo" buttons
- Multi-page: After each page, "+ Add Page" and "Done" buttons appear
- Gallery button: Navigate to Gallery Upload Screen

**Loading state:** After capture, brief spinner while processing edge detection + enhancement

**Indian UX notes:**
- Edge detection accounts for common Indian bill formats: thermal printed receipts, handwritten bills
- Auto-enhance improves low-light captures (common in Indian shops/restaurants)
- Support for Hindi/regional text on bills — OCR language auto-detected
- Warn user if image is blurry, too dark, or document not detected

---

## Screen 14: Gallery Upload

**Purpose:** Multi-select document upload from device gallery.

**Layout:**
```
[TopNavBar: X (close), "Select Documents" title, "Done (N)" right (disabled until selection)]
---
[Info banner: "Select up to 10 files. JPG, PNG, or PDF. Max 5MB each."]

[Media type tabs: Photos | PDFs]

[Photo grid: 3-column thumbnail grid]
  [Each thumbnail: image + checkbox overlay top-right]
  [Selected: blue check + border-brand-500 overlay]
  [PDF items: PDF icon with filename, not thumbnail]

[Selection count bar: sticky bottom]
  ["3 selected" text + PrimaryButton: "Upload (3)"]
```

**Key Components:** MediaGrid (expo-media-library), Checkbox overlays, PrimaryButton

**Navigation:**
- Arrives: From Camera Screen (gallery icon) or Document List add options
- Exits to: Document Category Selection (after Upload tap) or back to Document List

**Key Interactions:**
- Tap photo: Toggles selection
- Long press photo: Opens large preview
- Select All / Deselect All header option
- Bulk PDFs from Files app accessible via "PDFs" tab
- "Upload" button disabled if no selection or selection exceeds limits

**Error states:**
- File too large: "photo_name.jpg exceeds 5MB limit" — deselects file
- Unsupported format: "Only JPG, PNG, PDF supported"

**Indian UX note:**
- Many Indian SME owners receive bills via WhatsApp. Add "Upload from WhatsApp" integration — opens WhatsApp Media folder in gallery view.

---

## Screen 15: Document Detail

**Purpose:** Full view of a document with OCR results, metadata, status, and actions.

**Layout:**
```
[TopNavBar: Back arrow, document category title, Share icon + More (…) icon right]
---
[Document image: full-width, max 40% screen height]
  [Pinch-to-zoom enabled]
  [Multi-page: horizontal swipe through pages, page dots indicator]

[OCR Confidence Banner]
  [Green: "High confidence — auto-processed" | Yellow: "Medium — verify data" | Red: "Low — needs review"]

[Status section]
  [StatusBadge: e.g. "IN_REVIEW"]
  [StatusTimeline: Upload → OCR → Review → Processed]

[Extracted Data section]
  [Each OCR field as read-only row: label + value]
  [Date, Vendor, Amount, GST Rate, Invoice Number, etc.]
  [Yellow highlighted fields = medium confidence]
  [Red highlighted fields = low confidence]

[Metadata section]
  [Category badge, Upload date, File size, Document ID]
  [Tags: custom tags with + Add Tag button]

[Actions section]
  [SecondaryButton: "Share Document"]
  [SecondaryButton: "Download PDF"]
  [GhostButton + red text: "Delete Document" — confirmation required]

[Bottom padding: 16px]
```

**Key Components:**
- Image viewer (pinch-zoom), StatusTimeline, StatusBadge
- AmountDisplay, GSTRateChip, Tag, DocumentCard
- AlertBanner (OCR confidence), SecondaryButton, GhostButton

**Navigation:**
- Arrives: Document List tap
- Exits to:
  - Share → PDF Preview / Share Sheet
  - Delete → Confirmation dialog → Document List
  - Edit → OCR data edit (if admin/operator — not available to end users)

**Key Interactions:**
- Swipe between pages on document image
- Double-tap image: Zoom to fit / zoom to 2x
- Tap OCR field: Copy value to clipboard (toast confirmation)
- Tag field: Inline add/remove tags
- Pull-to-refresh: Updates status if processing

**Loading state:**
- Image: Low-res blur placeholder → full-res load
- OCR data: Skeleton rows while loading

**Indian UX notes:**
- OCR confidence color system is critical for Indian documents which may be handwritten or faded
- Document status updates via background push notification — badge on screen if updated while open

---

## Screen 16: Document Category Selection

**Purpose:** Assign category to newly captured/uploaded document(s).

**Layout:**
```
[TopNavBar: Back (retake/reselect), "Categorize Document" title]
[Subtext: "Help us process your document faster"]
---
[Document thumbnail: small preview top]
---
[Category options: large touch-target cards, 2 columns]

[Category Card: Sales Bill]
  [Icon: receipt-text, success-colored bg]
  [Label: "Sales Bill"]
  [Hint: "Bills you've issued to customers"]

[Category Card: Purchase Bill]
  [Icon: shopping-bag, brand-colored bg]
  [Label: "Purchase Bill"]
  [Hint: "Bills from your suppliers"]

[Category Card: Expense Receipt]
  [Icon: credit-card, warning-colored bg]
  [Label: "Expense Receipt"]
  [Hint: "Travel, office, and business expenses"]

[Category Card: Bank Statement]
  [Icon: building-columns, info-colored bg]
  [Label: "Bank Statement"]
  [Hint: "Monthly bank statements (PDF)"]

[Category Card: Salary Slip]
  [Icon: user-circle, gst-colored bg]
  [Label: "Salary Slip"]
  [Hint: "For employee ITR documents"]

[Category Card: Other]
  [Icon: document, neutral-colored bg]
  [Label: "Other"]
  [Hint: "Misc. documents — you can re-categorize later"]
---
[AI suggestion banner — if AI detected category]
  [Info-type: "AI detected: Purchase Bill — is this correct?"]
  [GhostButton: "Yes, use this" | GhostButton: "No, I'll choose"]
```

**Key Components:** Card (category grid), Badge (AI suggestion), AlertBanner, GhostButton

**Navigation:**
- Arrives: After Camera Capture or Gallery Upload
- Exits to: Document Detail Screen (processing begins), or if bulk upload, back to Document List

**Key Interactions:**
- Tap category card: Selects and immediately proceeds (no "Confirm" step for speed)
- AI suggestion: Shown if confidence > 70%; one tap to confirm
- For bulk upload (multiple docs): Allows applying one category to all, or categorize individually

**Indian UX note:**
- AI auto-categorization is especially valuable for SMEs who mix business/personal receipts
- "Other" category always available — don't force incorrect category
