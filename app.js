/* global pdfjsLib, PDFLib, Tesseract, JSZip */
"use strict";

const domDocument = window.document;
const $ = (id) => domDocument.getElementById(id);
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const DOCUMENT_TYPES = [
  "ใบสั่งซื้อ (PO)",
  "ใบขอซื้อ (PR)",
  "ใบกำกับภาษี/ใบเสร็จรับเงิน",
  "ใบกำกับภาษี",
  "ใบแจ้งหนี้",
  "ใบเสร็จรับเงิน",
  "ใบส่งสินค้า",
  "ใบวางบิล",
  "ใบลดหนี้",
  "ใบเพิ่มหนี้",
  "อื่น ๆ",
  "ไม่แน่ใจ"
];
const TYPE_TERMS = [
  ["ใบสั่งซื้อ (PO)", /ใบสั่งซื้อ|ใบสั่ง.?ซื้อ|purchase\s+(?:order|orders)|\b(?:purchase\s+)?order\b|\bp[\s.]*o\b(?=.*(?:number|no|เลขที่|vendor|supplier|date|to))/i],
  ["ใบขอซื้อ (PR)", /ใบขอซื้อ|ใบขอ.?ซื้อ|purchase\s+(?:requisition|request)|(?:requisition|request\s+for\s+purchase)|\bp[\s.]*r\b(?=.*(?:number|no|เลขที่|requestor|department|date))/i],
  ["ใบกำกับภาษี/ใบเสร็จรับเงิน", /ใบกำกับภาษี\s*[/／]\s*ใบเสร็จ(?:รับเงิน)?|ใบเสร็จ(?:รับเงิน)?\s*[/／]\s*ใบกำกับภาษี|tax invoice\s*(?:\/|and)\s*receipt|receipt\s*(?:\/|and)\s*tax invoice/i],
  ["ใบกำกับภาษี", /ใบกำกับภาษี|tax invoice/i],
  ["ใบแจ้งหนี้", /ใบแจ้งหนี้|ใบแจ้ง.?หนี้|(?:tax|commercial)?\s*(?:invoice)|i[\s.]*n[\s.]*v[\s.]*o[\s.]*i[\s.]*c[\s.]*e|\binv(?:oice)?\b|invoice/i],
  ["ใบเสร็จรับเงิน", /ใบเสร็จ(?:รับเงิน)?|\breceipt\b/i],
  ["ใบส่งสินค้า", /ใบส่งสินค้า|delivery note|delivery order/i],
  ["ใบวางบิล", /ใบวางบิล|billing statement/i],
  ["ใบลดหนี้", /ใบลดหนี้|credit note/i],
  ["ใบเพิ่มหนี้", /ใบเพิ่มหนี้|debit note/i]
];

const state = {
  pdf: null,
  bytes: null,
  sourceName: "document.pdf",
  pages: [],
  documents: [],
  currentPage: 1,
  zoom: 1,
  rotation: 0,
  worker: null,
  workerLanguage: "",
  translator: null,
  translatorPair: "",
  pageTranslationWarnings: new Set(),
  history: [],
  processing: false,
  batchProcessing: false,
  exporting: false,
  exported: false,
  jobs: [],
  activeJobId: null,
  theme: "light",
  language: "th",
  workspaceStep: "upload"
};

const translations = {
  th: {
    workspaceLabel: "DOCUMENT WORKSPACE",
    heroTitle: "จัดระเบียบเอกสาร PDF<br><span>อย่างมั่นใจ</span>",
    heroSubtitle: "ข้อความ ตรวจหาจุดแบ่ง และตรวจภาพจากเอกสารต้นฉบับก่อนส่งออก",
    themeLight: "สว่าง",
    themeDark: "มืด",
    langTh: "ไทย",
    langEn: "EN",
    navUpload: "01 อัปโหลดและตรวจสอบ",
    navReview: "02 เอกสารที่ตรวจพบ",
    navExport: "03 ส่งออกไฟล์",
    navUploadShort: "อัปโหลดและตรวจสอบ",
    navReviewShort: "เอกสารที่ตรวจพบ",
    navExportShort: "ส่งออกไฟล์",
    stepCurrent: "กำลังดำเนินการ",
    stepCompleted: "เสร็จแล้ว",
    stepWaiting: "รอดำเนินการ",
    stepReady: "พร้อมตรวจสอบ",
    sidebarInfoTitle: "ข้อมูลของคุณ",
    sidebarInfoBody: "ไฟล์ PDF อยู่ในเครื่องและไม่ถูกส่งไปยังเซิร์ฟเวอร์ แอปโหลดไลบรารี OCR/PDF จาก CDN จึงต้องใช้อินเทอร์เน็ต",
    uploadTitle: "เพิ่มไฟล์ PDF",
    uploadText: "เพิ่มได้หลายไฟล์โดยไม่มีเพดานจำนวน · จำกัดไม่เกิน 100 MiB ต่อไฟล์ตามทรัพยากรเบราว์เซอร์",
    dropZoneTitle: "ลากไฟล์ PDF หลายไฟล์มาวางที่นี่",
    dropZoneHint: "หรือ <u>เลือกหลายไฟล์จากอุปกรณ์</u>",
    dropZoneMeta: "ไม่มีการจำกัดจำนวนไฟล์โดยแอป · PDF ไม่เกิน 100 MiB ต่อไฟล์",
    queueTitle: "ไฟล์ในงานนี้",
    queueEmpty: "ยังไม่มีไฟล์",
    removeAllFiles: "ลบทั้งหมด",
    fileStatusWaiting: "รอไฟล์",
    fileStatusOpen: "เปิดไฟล์แล้ว",
    fileStatusReady: "พร้อมตรวจผล",
    fileStatusAnalyzed: "วิเคราะห์แล้ว · รอตรวจ",
    fileStatusProcessing: "กำลังวิเคราะห์",
    fileStatusError: "มีข้อผิดพลาด",
    queueQueued: "รอวิเคราะห์",
    queueLoading: "กำลังเปิด",
    queueProcessing: "กำลังวิเคราะห์",
    queueReview: "รอตรวจ",
    queueError: "มีข้อผิดพลาด",
    queueSummary: (count, total) => `${count} ไฟล์ · อ่านแล้ว ${total.toLocaleString()} หน้า`,
    queuePages: (count) => `${count} หน้า`,
    confirmDeleteTitle: "ยืนยันการลบไฟล์",
    confirmDeleteAllTitle: "ยืนยันการลบไฟล์ทั้งหมด",
    confirmDeleteMessage: (name) => `ต้องการนำ “${name}” ออกจากรายการใช่ไหม?`,
    confirmDeleteAllMessage: (count) => `ต้องการนำไฟล์ทั้ง ${count} ไฟล์ออกจากรายการใช่ไหม? การกระทำนี้จะล้างผลวิเคราะห์ในหน้านี้ด้วย`,
    confirmCancel: "ยกเลิก",
    confirmDelete: "ลบไฟล์",
    confirmDeleteAll: "ลบทั้งหมด",
    removeFileLabel: "นำออก",
    removeFailed: "นำไฟล์ออกไม่สำเร็จ",
    processIdle: "เลือก PDF เพื่อเริ่มต้น",
    processReady: "ไฟล์เปิดได้แล้ว — กดวิเคราะห์ไฟล์ที่รอ",
    processReviewFile: (name) => `กำลังตรวจ ${name}`,
    processCompleted: "วิเคราะห์ไฟล์ที่รอครบแล้ว — ตรวจผลแต่ละไฟล์ก่อนส่งออก",
    processCompletedWithFailures: (count) => `เสร็จแล้ว มี ${count} ไฟล์ที่เปิด/วิเคราะห์ไม่สำเร็จ ตรวจสถานะในรายการไฟล์`,
    exportProgressLabel: "ความคืบหน้าการส่งออก",
    exportStatusIdle: "ตรวจสอบผลลัพธ์ก่อนส่งออก",
    preparingOcr: "กำลังเตรียมข้อมูลภาษา OCR …",
    analyzingPdfText: "กำลังอ่านข้อความ PDF และตรวจหน้าที่ไม่มี Text Layer …",
    analyzingPage: (page, total) => `กำลังวิเคราะห์หน้า ${page}/${total} …`,
    analysisFailed: (error) => `วิเคราะห์ไม่สำเร็จ: ${error}`,
    noQueuedFiles: "ไม่มีไฟล์ที่รอวิเคราะห์",
    noReviewedFiles: "ยังไม่มีไฟล์ที่วิเคราะห์และตรวจแล้ว",
    incompleteExportJobs: (count, names) => `ยังไม่ส่งออก: มี ${count} ไฟล์ที่วิเคราะห์ไม่ครบ — ${names}`,
    analysisComplete: "วิเคราะห์เสร็จแล้ว — ตรวจภาพจริงและยืนยันจุดแบ่งก่อนส่งออก",
    multiFileAnalysisComplete: (count, perFile, detectedTypes) => `วิเคราะห์ครบ ${count} ไฟล์ · ${perFile} · พบประเภท: ${detectedTypes.join(" · ") || "ไม่แน่ใจ"}`,
    fileOpenFailed: (message) => `เปิดไฟล์ไม่ได้: ${message}`,
    filesAdded: (added, queued) => `เพิ่ม ${added} ไฟล์แล้ว — มี ${queued} ไฟล์รอวิเคราะห์`,
    fileAnalysisFailed: (name, error) => `วิเคราะห์ ${name} ไม่สำเร็จ: ${error}`,
    pdfCreated: (name) => `สร้าง PDF "${name}" สำเร็จ`,
    pdfCreateFailed: (error) => `สร้าง PDF ไม่สำเร็จ: ${error}`,
    ocrCopied: "คัดลอกข้อความ OCR ที่จัดรูปแบบแล้ว",
    ocrCopyBlocked: "เบราว์เซอร์ไม่อนุญาตให้คัดลอกอัตโนมัติ กรุณาเลือกข้อความในแผง OCR",
    reportDownloaded: "ดาวน์โหลดรายงาน JSON แล้ว",
    reportCreateFailed: (error) => `สร้างรายงานไม่สำเร็จ: ${error}`,
    exportPrepare: (current, total, name) => `กำลังเตรียม ${current}/${total}: ${name}`,
    exportZip: "กำลังสร้าง ZIP…",
    exportSuccess: (documents, jobs, pages) => `สร้าง ZIP สำเร็จ: ${documents} PDF จาก ${jobs} ไฟล์ · ${pages.toLocaleString()} หน้า`,
    exportFailed: (error) => `สร้าง ZIP ไม่สำเร็จ: ${error}`,
    ocrLanguageLabel: "ภาษา OCR",
    analyze: "วิเคราะห์ไฟล์ที่รอ",
    viewerTitle: "ตรวจหน้าเอกสารจริง",
    viewerSubtext: "ภาพแสดงจาก PDF ต้นฉบับ",
    viewerPrevious: "หน้าก่อนหน้า",
    viewerNext: "หน้าถัดไป",
    viewerRotate: "หมุน ↻",
    viewerZoomOut: "ซูมออก",
    viewerZoomIn: "ซูมเข้า",
    sourceBadge: "SOURCE PDF",
    splitCurrent: "แบ่งเอกสารก่อนหน้านี้",
    moveCurrent: "ย้ายหน้าที่เลือก",
    movePageUp: "↑ เรียงก่อน",
    movePageDown: "↓ เรียงหลัง",
    ocrBlockTitle: "ข้อความที่อ่านได้",
    reviewTitle: "เอกสารที่ตรวจพบ",
    reviewText: "ระบบเสนอจุดแบ่งจากหัวเอกสาร เลขที่ วันที่ และหลักฐานต่อเนื่อง ตรวจสอบก่อนดาวน์โหลด",
    undo: "↶ ย้อนกลับ",
    exportTitle: "ส่งออกเอกสาร",
    exportText: "สร้างไฟล์ PDF แบบภาพหน้าเอกสารจากช่วงหน้าที่ตรวจแล้ว ระบบจะตัดชุดเฉพาะเมื่อมีหลักฐานชัดเจน และข้อความต้นฉบับจะไม่อยู่ในไฟล์ดาวน์โหลด",
    zipButton: "ดาวน์โหลด PDF ทั้งหมดเป็น ZIP",
    reportButton: "ดาวน์โหลดรายงาน JSON",
    includeCurrentPage: "ใช้หน้าปัจจุบันในการส่งออก",
    selectAllPages: "เลือกทุกหน้า",
    clearAllPages: "ไม่เลือกทุกหน้า",
    pagesToExport: "หน้าที่ใช้ส่งออก",
    selectPagesHint: "เลือกดูหน้าที่ต้องการ",
    clearSelectedPages: "ล้างหน้าที่เลือกทั้งหมด",
    excludedPages: "หน้าที่ถูกลบออก:",
    restoreAllPages: "คืนทุกหน้า",
    reviewAlertTitle: "ผลวิเคราะห์เป็นข้อเสนอ ไม่รับประกันความถูกต้อง 100%",
    reviewAlertBody: "คะแนนเป็นหลักฐานจากกฎ ไม่ใช่ความน่าจะเป็น ทุกหน้าจะยังอยู่ในชุดเพื่อป้องกันหน้าหาย แต่ควรตรวจหน้าที่ขึ้นสถานะ “ไม่แน่ใจ” ก่อนส่งออก",
    pagePreviewEmpty: "ภาพ PDF จะปรากฏที่นี่",
    ocrNotAnalyzed: "ยังไม่วิเคราะห์",
    ocrPlaceholder: "หลังวิเคราะห์แล้ว ข้อความของหน้าที่เลือกจะแสดงที่นี่",
    downloadCurrentOcr: "ดาวน์โหลด OCR หน้านี้ (JSON)",
    copyCurrentOcr: "คัดลอกข้อความจัดรูปแบบ",
    footer: "LOCAL-FIRST PDF REVIEW · ตรวจสอบผลก่อนใช้เป็นเอกสารทางการ"
  },
  en: {
    workspaceLabel: "DOCUMENT WORKSPACE",
    heroTitle: "Organize PDF documents<br><span>with confidence</span>",
    heroSubtitle: "Extract text, detect split points, and review the original pages before export.",
    themeLight: "Light",
    themeDark: "Dark",
    langTh: "TH",
    langEn: "EN",
    navUpload: "01 Upload & review",
    navReview: "02 Detected documents",
    navExport: "03 Export files",
    navUploadShort: "Upload & review",
    navReviewShort: "Detected documents",
    navExportShort: "Export files",
    stepCurrent: "In progress",
    stepCompleted: "Completed",
    stepWaiting: "Waiting",
    stepReady: "Ready to review",
    sidebarInfoTitle: "Your data",
    sidebarInfoBody: "PDF files stay on your device and are not sent to a server. The app loads OCR/PDF libraries from a CDN, so an internet connection is required.",
    uploadTitle: "Add PDF files",
    uploadText: "Add multiple files with no hard cap · each file is limited to 100 MiB depending on browser resources.",
    dropZoneTitle: "Drag multiple PDF files here",
    dropZoneHint: "or <u>choose multiple files from your device</u>",
    dropZoneMeta: "The app does not limit the number of files · PDFs should stay under 100 MiB each",
    queueTitle: "Files in this job",
    queueEmpty: "No files yet",
    removeAllFiles: "Remove all",
    fileStatusWaiting: "Waiting for file",
    fileStatusOpen: "File opened",
    fileStatusReady: "Ready to review",
    fileStatusAnalyzed: "Analyzed · review needed",
    fileStatusProcessing: "Analyzing",
    fileStatusError: "Error",
    queueQueued: "Queued",
    queueLoading: "Opening",
    queueProcessing: "Analyzing",
    queueReview: "Review",
    queueError: "Error",
    queueSummary: (count, total) => `${count} file(s) · ${total.toLocaleString()} pages processed`,
    queuePages: (count) => `${count} page(s)`,
    confirmDeleteTitle: "Confirm file removal",
    confirmDeleteAllTitle: "Confirm removing all files",
    confirmDeleteMessage: (name) => `Remove “${name}” from the list?`,
    confirmDeleteAllMessage: (count) => `Remove all ${count} file(s) from the list? This also clears the analysis results on this page.`,
    confirmCancel: "Cancel",
    confirmDelete: "Remove file",
    confirmDeleteAll: "Remove all",
    removeFileLabel: "Remove",
    removeFailed: "Could not remove file(s)",
    processIdle: "Select a PDF to begin",
    processReady: "File opened — analyze queued files to continue",
    processReviewFile: (name) => `Reviewing ${name}`,
    processCompleted: "All queued files analyzed — review each file before exporting",
    processCompletedWithFailures: (count) => `Done. ${count} file(s) could not be opened or analyzed. Check the file list.`,
    exportProgressLabel: "Export progress",
    exportStatusIdle: "Review results before export",
    preparingOcr: "Preparing OCR language data…",
    analyzingPdfText: "Extracting PDF text and checking pages without a text layer…",
    analyzingPage: (page, total) => `Analyzing page ${page}/${total} …`,
    analysisFailed: (error) => `Analysis failed: ${error}`,
    noQueuedFiles: "No queued files",
    noReviewedFiles: "No reviewed files are ready for export yet",
    incompleteExportJobs: (count, names) => `Export is not ready yet: ${count} file(s) are incomplete — ${names}`,
    analysisComplete: "Analysis complete — review the page images and confirm split points before export",
    multiFileAnalysisComplete: (count, perFile, detectedTypes) => `Analysis complete for ${count} file(s) · ${perFile} · Types found: ${detectedTypes.join(" · ") || "Uncertain"}`,
    fileOpenFailed: (message) => `Could not open file: ${message}`,
    filesAdded: (added, queued) => `${added} file(s) added — ${queued} file(s) remaining to analyze`,
    fileAnalysisFailed: (name, error) => `Analysis of ${name} failed: ${error}`,
    pdfCreated: (name) => `Created PDF "${name}" successfully`,
    pdfCreateFailed: (error) => `Could not create PDF: ${error}`,
    ocrCopied: "Copied formatted OCR text",
    ocrCopyBlocked: "The browser blocked automatic copying. Please select the OCR text manually.",
    reportDownloaded: "JSON report downloaded",
    reportCreateFailed: (error) => `Could not create report: ${error}`,
    exportPrepare: (current, total, name) => `Preparing ${current}/${total}: ${name}`,
    exportZip: "Creating ZIP…",
    exportSuccess: (documents, jobs, pages) => `ZIP created: ${documents} PDF(s) from ${jobs} file(s) · ${pages.toLocaleString()} pages`,
    exportFailed: (error) => `Could not create ZIP: ${error}`,
    ocrLanguageLabel: "OCR language",
    analyze: "Analyze queued files",
    viewerTitle: "Review actual document pages",
    viewerSubtext: "Original PDF page preview",
    viewerPrevious: "Previous page",
    viewerNext: "Next page",
    viewerRotate: "Rotate ↻",
    viewerZoomOut: "Zoom out",
    viewerZoomIn: "Zoom in",
    sourceBadge: "SOURCE PDF",
    splitCurrent: "Split before this page",
    moveCurrent: "Move selected page",
    movePageUp: "↑ Move up",
    movePageDown: "↓ Move down",
    ocrBlockTitle: "Extracted text",
    reviewTitle: "Detected documents",
    reviewText: "The system suggests split points based on headings, document numbers, dates, and continuity. Confirm before export.",
    undo: "↶ Undo",
    exportTitle: "Export documents",
    exportText: "Create image-based PDF files from the reviewed page ranges. Original selectable text is removed from downloads.",
    zipButton: "Download all PDFs as ZIP",
    reportButton: "Download JSON report",
    includeCurrentPage: "Include current page in export",
    selectAllPages: "Select all pages",
    clearAllPages: "Clear selection",
    pagesToExport: "Pages to export",
    selectPagesHint: "Choose the pages you need",
    clearSelectedPages: "Clear selected pages",
    excludedPages: "Excluded pages:",
    restoreAllPages: "Restore all pages",
    reviewAlertTitle: "Analysis results are suggestions and are not guaranteed to be 100% accurate",
    reviewAlertBody: "Scores are rule-based evidence, not probabilities. Every page remains in a set to prevent missing pages; review pages marked “Uncertain” before export.",
    ocrNotAnalyzed: "Not analyzed",
    ocrPlaceholder: "OCR text from the selected page will appear here after analysis",
    downloadCurrentOcr: "Download current page OCR (JSON)",
    copyCurrentOcr: "Copy formatted text",
    footer: "LOCAL-FIRST PDF REVIEW · Verify before using as official documentation"
  }
};

function t(key, fallback = "") {
  return translations[state.language]?.[key] ?? translations.th?.[key] ?? fallback;
}

const DOCUMENT_TYPE_TRANSLATIONS = {
  th: {},
  en: {
    "ใบสั่งซื้อ (PO)": "Purchase Order (PO)",
    "ใบขอซื้อ (PR)": "Purchase Requisition (PR)",
    "ใบกำกับภาษี/ใบเสร็จรับเงิน": "Tax Invoice / Receipt",
    "ใบกำกับภาษี": "Tax Invoice",
    "ใบแจ้งหนี้": "Invoice",
    "ใบเสร็จรับเงิน": "Receipt",
    "ใบส่งสินค้า": "Delivery Note",
    "ใบวางบิล": "Billing Statement",
    "ใบลดหนี้": "Credit Note",
    "ใบเพิ่มหนี้": "Debit Note",
    "อื่น ๆ": "Other",
    "ไม่แน่ใจ": "Uncertain"
  }
};

function translateDocumentType(type) {
  return DOCUMENT_TYPE_TRANSLATIONS[state.language]?.[type] || type;
}

function focusWorkspaceStep(step, options = {}) {
  const allowed = ["upload", "results", "export"];
  if (!allowed.includes(step)) return;
  const target = window.document.getElementById(step);
  if (!target || target.classList.contains("hidden")) return;

  state.workspaceStep = step;
  history.replaceState(null, "", `#${step}`);
  updateWorkspaceProgress();
  if (options.scroll !== false) {
    target.scrollIntoView({ behavior: options.behavior || "smooth", block: "start" });
  }
}

function detectWorkspaceStep() {
  const stepIds = ["upload", "results", "export"];
  const anchorLine = Math.min(window.innerHeight * 0.38, 240);
  let current = "upload";

  for (const id of stepIds) {
    const section = document.getElementByById(id);
    if (!section || section.classList.contains("hidden") || section.getClientRects().length === 0) continue;
    const rect = section.getBoundingClientRect();
    if (rect.top <= anchorLine) current = id;
  }
  return current;
}

function updateWorkspaceProgress() {
  const current = state.workspaceStep || "upload";
  const uploaded = state.jobs.length > 0;
  const reviewed = state.jobs.some((job) => job.status === "review" || job.documents?.length);

  document.querySelectorAll(".nav-link[data-step]").forEach((link) => {
    const step = link.dataset.step;
    const status = link.querySelector("[data-nav-status]");
    const isCurrent = step === current;
    const isCompleted = step === "upload"
      ? uploaded && reviewed
      : step === "results"
        ? state.exported || (reviewed && current === "export")
        : state.exported;

    link.classList.toggle("active", isCurrent);
    link.classList.toggle("current", isCurrent);
    link.classList.toggle("completed", isCompleted && !isCurrent);
    link.toggleAttribute("aria-current", isCurrent);
    if (status) {
      status.textContent = isCurrent
        ? translations[state.language]?.stepCurrent
        : isCompleted
          ? translations[state.language]?.stepCompleted
          : (step === "results" && uploaded)
            ? translations[state.language]?.stepReady
            : translations[state.language]?.stepWaiting;
    }
  });
}

function applyTheme(theme) {
  state.theme = theme;
  document.body.dataset.theme = theme;
  const themeButton = document.querySelector("[data-theme-btn]");
  if (themeButton) {
    themeButton.dataset.themeBtn = theme;
    const label = theme === "dark" ? translations[state.language]?.themeDark : translations[state.language]?.themeLight;
    themeButton.querySelector(".toggle-label").textContent = label || theme;
    themeButton.setAttribute("aria-label", theme === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด");
  }
}

function applyLanguage(language) {
  state.language = language;
  document.documentElement.lang = language;
  document.body.dataset.lang = language;
  const languageToggle = document.querySelector("[data-lang-btn]");
  if (languageToggle) {
    languageToggle.dataset.langBtn = language;
    languageToggle.querySelector(".toggle-label").textContent = translations[language]?.[language === "th" ? "langTh" : "langEn"] || language;
    languageToggle.setAttribute("aria-label", language === "th" ? "เปลี่ยนภาษาเป็นอังกฤษ" : "Switch language to Thai");
    languageToggle.title = language === "th" ? "เปลี่ยนภาษาเป็นอังกฤษ" : "Switch language to Thai";
  }
  const themeButton = document.querySelector("[data-theme-btn]");
  if (themeButton) {
    const themeLabel = themeButton.dataset.themeBtn === "dark" ? translations[language]?.themeDark : translations[language]?.themeLight;
    themeButton.querySelector(".toggle-label").textContent = themeLabel || themeButton.dataset.themeBtn;
    themeButton.setAttribute("aria-label", language === "th"
      ? (state.theme === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด")
      : (state.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"));
  }

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    const value = translations[language]?.[key];
    if (!value) return;
    element.innerHTML = value;
  });

  $("previousPage")?.setAttribute("aria-label", language === "en" ? "Previous page" : "หน้าก่อนหน้า");
  $("nextPage")?.setAttribute("aria-label", language === "en" ? "Next page" : "หน้าถัดไป");
  $("zoomOut")?.setAttribute("aria-label", language === "en" ? "Zoom out" : "ซูมออก");
  $("zoomIn")?.setAttribute("aria-label", language === "en" ? "Zoom in" : "ซูมเข้า");
  $("moveTarget")?.setAttribute("aria-label", language === "en" ? "Select destination document" : "เลือกเอกสารปลายทาง");

  const languageButton = $("ocrLanguage");
  if (languageButton) {
    const optionLabels = {
      th: { "tha+eng": "ไทย + English (อ่านและแสดงทั้งสองภาษา)", tha: "ไทย — แปลผลภาษาอังกฤษเป็นไทย", eng: "English — แปลผลภาษาไทยเป็น English" },
      en: { "tha+eng": "Thai + English", tha: "Thai — translate English into Thai", eng: "English — translate Thai into English" }
    };
    const selected = optionLabels[language] || optionLabels.th;
    Array.from(languageButton.options).forEach((option) => {
      const label = selected[option.value];
      if (label) option.textContent = label;
    });
  }

  updateFileStatus();

  const processStatus = $("processStatus");
  if (processStatus && !state.pdf && !processStatus.dataset.state) {
    processStatus.textContent = translations[language]?.processIdle || "เลือก PDF เพื่อเริ่มต้น";
  } else if (processStatus && ["success", "warning"].includes(processStatus.dataset.state)) {
    const failed = state.jobs.filter((job) => job.status === "error").length;
    processStatus.textContent = failed
      ? translations[language].processCompletedWithFailures(failed)
      : translations[language].processCompleted;
  } else if (processStatus && !processStatus.dataset.state && getActiveJob()?.status === "review") {
    processStatus.textContent = translations[language].processReviewFile(getActiveJob().file.name);
  } else if (processStatus && !processStatus.dataset.state && getActiveJob()?.status === "queued") {
    processStatus.textContent = translations[language]?.processReady || translations.th.processReady;
  }

  const queueSummary = $("queueSummary");
  if (queueSummary && !state.jobs.length) {
    queueSummary.textContent = translations[language]?.queueEmpty || "ยังไม่มีไฟล์";
  }

  const exportStatus = $("exportStatus");
  if (exportStatus && !exportStatus.dataset.state) {
    exportStatus.textContent = language === "en" ? "Review the results before export" : "ตรวจสอบผลลัพธ์ก่อนส่งออก";
  }
  const footer = document.querySelector(".content-footer");
  if (footer) footer.textContent = translations[language]?.footer || footer.textContent;
  $("exportProgressTrack").setAttribute("aria-label", translations[language]?.exportProgressLabel || translations.th.exportProgressLabel);
  renderQueue();
  updatePageSelectionControls();
  if ($("pageCounter") && state.pages.length) {
    $("pageCounter").textContent = language === "en"
      ? `Page ${state.currentPage} / ${state.pages.length} · ${Math.round(state.zoom * 100)}%`
      : `หน้า ${state.currentPage} / ${state.pages.length} · ${Math.round(state.zoom * 100)}%`;
  }
  renderDocuments();
  renderBatchReview();
  updateExportSummary();
  updateWorkspaceProgress();
}

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    new URL("vendor/pdf.worker.min.js", window.location.href).toString();
}

window.addEventListener("DOMContentLoaded", () => {
  const missingLibraries = [
    ["pdfjsLib", window.pdfjsLib],
    ["PDFLib", window.PDFLib],
    ["Tesseract", window.Tesseract],
    ["JSZip", window.JSZip],
  ].filter(([, loaded]) => !loaded).map(([name]) => name);
  if (missingLibraries.length) {
    setStatus(
      "processStatus",
      `ไม่สามารถโหลดระบบได้: ไลบรารี ${missingLibraries.join(", ")} ไม่พร้อม กรุณารีเฟรชหน้าอีกครั้ง`,
      "error"
    );
    $("pdfFile").disabled = true;
  }
});

function createId() {
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  return `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getSelectedPages(job = getActiveJob()) {
  if (!job) return new Set();
  if (!Array.isArray(job.selectedPages)) {
    job.selectedPages = Array.from({ length: job.pageCount || job.pages.length || 0 }, (_, index) => index + 1);
  }
  return new Set(job.selectedPages);
}

function reconcileSelectedPages() {
  const job = getActiveJob();
  if (!job) return;
  try {
    createDocumentsFromBoundaries();
    job.documents = state.documents;
  } catch (error) {
    setStatus("processStatus", error.message, "error");
  }
  updateExportSummary();
  renderDocuments();
  renderMoveTargets();
}

function updatePageSelectionControls() {
  const checkbox = $("includeCurrentPage");
  if (!checkbox) return;
  const selected = getSelectedPages();
  checkbox.checked = selected.has(state.currentPage);
  const selectedCount = selected.size;
  const pageCount = state.pages.length;
  $("selectAllPages").disabled = selectedCount === pageCount;
  $("clearAllPages").disabled = selectedCount === 0;
  $("selectAllPagesTop").disabled = selectedCount === pageCount;
  $("clearAllPagesTop").disabled = selectedCount === 0;
  $("pageCounter").title = state.language === "en"
    ? `${selectedCount} of ${pageCount} pages selected for export`
    : `${selectedCount} / ${pageCount} หน้าได้รับเลือกสำหรับส่งออก`;
  renderPageSelector();
}

async function renderPageSelector() {
  const strip = $("selectedPageStrip");
  if (!strip || !state.pdf) return;
  const selected = getSelectedPages();
  const selectedNumbers = [...selected].sort((a, b) => a - b);
  const excludedNumbers = Array.from({ length: state.pages.length }, (_, index) => index + 1)
    .filter((page) => !selected.has(page));
  $("selectedPageSummary").textContent = state.language === "en"
    ? `${selectedNumbers.length} of ${state.pages.length} pages will be exported`
    : `${selectedNumbers.length} จาก ${state.pages.length} หน้าจะส่งออก`;
  strip.innerHTML = selectedNumbers.map((page) => `
    <article class="selected-page-card ${page === state.currentPage ? "active" : ""}" data-select-page="${page}" title="${state.language === "en" ? "Open page" : "เปิดหน้าที่"} ${page}">
      <canvas id="select-thumb-${page}" width="112" height="132"></canvas>
      <div class="selected-page-card-footer"><span>หน้า ${page}</span><button type="button" class="selected-page-remove" data-remove-page="${page}" aria-label="ลบหน้า ${page} จากรายการส่งออก" title="ลบออก">×</button></div>
    </article>`).join("") || `<div class="empty-stage">ไม่ได้เลือกหน้าสำหรับส่งออก</div>`;
  $("excludedPageBar").classList.toggle("hidden", !excludedNumbers.length);
  $("excludedPageList").innerHTML = excludedNumbers.map((page) => `<button type="button" class="restore-page-button" data-restore-page="${page}">${state.language === "en" ? "Restore page" : "คืนหน้า"} ${page}</button>`).join("");

  strip.querySelectorAll("[data-select-page]").forEach((card) => {
    card.addEventListener("click", async (event) => {
      if (event.target.closest("[data-remove-page]")) return;
      state.currentPage = Number(card.dataset.selectPage);
      await renderCurrentPage();
    });
  });
  strip.querySelectorAll("[data-remove-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const job = getActiveJob();
      const selectedPages = getSelectedPages(job);
      selectedPages.delete(Number(button.dataset.removePage));
      job.selectedPages = [...selectedPages].sort((a, b) => a - b);
      reconcileSelectedPages();
      updatePageSelectionControls();
    });
  });
  $("excludedPageList").querySelectorAll("[data-restore-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const job = getActiveJob();
      const selectedPages = getSelectedPages(job);
      selectedPages.add(Number(button.dataset.restorePage));
      job.selectedPages = [...selectedPages].sort((a, b) => a - b);
      reconcileSelectedPages();
      updatePageSelectionControls();
    });
  });

  await Promise.all(selectedNumbers.map(async (page) => {
    try {
      const pdfPage = await state.pdf.getPage(page);
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min(112 / base.width, 132 / base.height);
      const viewport = pdfPage.getViewport({ scale });
      const canvas = $(`select-thumb-${page}`);
      const context = canvas.getContext("2d", { alpha: false });
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await pdfPage.render({ canvasContext: context, viewport }).promise;
    } catch (_) { /* Keep the page selector usable if one thumbnail cannot render. */ }
  }));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function setStatus(id, message, kind = "") {
  const element = $(id);
  element.textContent = message;
  element.dataset.state = kind;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function safeFilename(value) {
  return String(value || "document")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 100);
}

function updateProgress(done, total) {
  $("progressTrack").classList.remove("hidden");
  $("progressBar").style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
}

function confirmAction({ title, message, confirmLabel }) {
  const dialog = $("confirmDialog");
  const cancelButton = $("cancelConfirmation");
  const acceptButton = $("acceptConfirmation");
  $("confirmDialogTitle").textContent = title;
  $("confirmDialogMessage").textContent = message;
  cancelButton.textContent = translations[state.language].confirmCancel;
  acceptButton.textContent = confirmLabel;
  dialog.returnValue = "";

  return new Promise((resolve) => {
    let finished = false;
    const finish = (confirmed) => {
      if (finished) return;
      finished = true;
      cancelButton.removeEventListener("click", onCancel);
      acceptButton.removeEventListener("click", onAccept);
      dialog.removeEventListener("click", onBackdrop);
      dialog.removeEventListener("cancel", onEscape);
      if (dialog.open) dialog.close(confirmed ? "confirm" : "cancel");
      resolve(confirmed);
    };
    const onCancel = () => finish(false);
    const onAccept = () => finish(true);
    const onEscape = (event) => {
      event.preventDefault();
      finish(false);
    };
    const onBackdrop = (event) => {
      if (event.target === dialog) finish(false);
    };

    cancelButton.addEventListener("click", onCancel);
    acceptButton.addEventListener("click", onAccept);
    dialog.addEventListener("click", onBackdrop);
    dialog.addEventListener("cancel", onEscape);
    dialog.showModal();
    cancelButton.focus();
  });
}

function setExportProgress(percent, message, kind = "") {
  const progress = Math.max(0, Math.min(100, Math.round(percent)));
  $("exportProgressTrack").classList.remove("hidden");
  $("exportProgressTrack").setAttribute("aria-valuenow", String(progress));
  $("exportProgressBar").style.width = `${progress}%`;
  setStatus("exportStatus", message, kind);
}

function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 16));
}

function getCurrentDocument() {
  return state.documents.find((document) => document.pages.includes(state.currentPage)) || null;
}

function getActiveJob() {
  return state.jobs.find((job) => job.id === state.activeJobId) || null;
}

function updateFileStatus() {
  const fileStatus = $("fileStatus");
  if (!fileStatus) return;
  const labels = translations[state.language] || translations.th;
  const activeJob = getActiveJob();
  if (!activeJob) {
    fileStatus.textContent = labels.fileStatusWaiting;
  } else if (activeJob.status === "review" || state.documents.length) {
    fileStatus.textContent = labels.fileStatusAnalyzed;
  } else if (activeJob.status === "processing" || activeJob.status === "loading") {
    fileStatus.textContent = labels.fileStatusProcessing;
  } else if (activeJob.status === "error") {
    fileStatus.textContent = labels.fileStatusError;
  } else {
    fileStatus.textContent = labels.fileStatusOpen;
  }
}

function saveActiveJob() {
  const job = getActiveJob();
  if (!job) return;
  job.pages = state.pages;
  job.documents = state.documents;
  job.currentPage = state.currentPage;
  job.zoom = state.zoom;
  job.rotation = state.rotation;
  job.history = state.history;
  job.selectedPages = [...getSelectedPages()].sort((a, b) => a - b);
}

function renderQueue() {
  const root = $("fileQueue");
  const panel = $("queuePanel");
  panel.classList.toggle("hidden", state.jobs.length === 0);
  const pageCount = state.jobs.reduce((sum, job) => sum + (job.pages?.length || 0), 0);
  const currentLabels = translations[state.language] || translations.th;
  $("queueSummary").textContent = state.jobs.length
    ? currentLabels.queueSummary(state.jobs.length, pageCount)
    : currentLabels.queueEmpty;
  $("removeAllFiles").disabled = state.batchProcessing || state.exporting || state.jobs.length === 0;
  updateFileStatus();
  root.innerHTML = state.jobs.map((job) => {
    const active = job.id === state.activeJobId;
    const queueStatusText = currentLabels[`queue${job.status[0].toUpperCase()}${job.status.slice(1)}`] || currentLabels.queueQueued;
    const pageText = currentLabels.queuePages(job.pages?.length || 0);
    const removeText = currentLabels.removeFileLabel;
    return `<div class="queue-item ${active ? "active" : ""}">
      <button class="queue-open" data-open-job="${escapeHtml(job.id)}" ${state.batchProcessing || state.exporting ? "disabled" : ""}>${escapeHtml(job.file.name)}</button>
      <span class="queue-meta">${(job.file.size / (1024 * 1024)).toFixed(2)} MiB${job.pages?.length ? ` · ${pageText}` : ""}</span>
      <span class="queue-types">${job.documentTypes?.length ? escapeHtml(job.documentTypes.join(" · ")) : ""}</span>
      <span class="queue-state" data-status="${escapeHtml(job.status)}">${queueStatusText}</span>
      <button class="queue-remove" data-remove-job="${escapeHtml(job.id)}" aria-label="${removeText} ${escapeHtml(job.file.name)}" ${state.batchProcessing || state.exporting ? "disabled" : ""}>${removeText}</button>
    </div>`;
  }).join("");

  root.querySelectorAll("[data-open-job]").forEach((button) => {
    button.addEventListener("click", async () => {
      const job = state.jobs.find((item) => item.id === button.dataset.openJob);
      if (!job || state.batchProcessing || state.exporting) return;
      try {
        await activateJob(job);
      } catch (error) {
        job.status = "error";
        job.error = error.message;
        setStatus("processStatus", `เปิด ${job.file.name} ไม่สำเร็จ: ${error.message}`, "error");
        renderQueue();
      }
    });
  });
  root.querySelectorAll("[data-remove-job]").forEach((button) => {
    button.addEventListener("click", async () => {
      await removeQueuedJob(button.dataset.removeJob);
    });
  });
  updateWorkspaceProgress();
}

function resetActiveJobView() {
  state.pdf = null;
  state.bytes = null;
  state.activeJobId = null;
  state.pages = [];
  state.documents = [];
  state.history = [];
  state.currentPage = 1;
  state.zoom = 1;
  state.rotation = 0;
  $("viewerPanel").classList.add("hidden");
  $("results").classList.add("hidden");
  $("export").classList.add("hidden");
  $("fileSummary").classList.add("hidden");
  $("fileSummary").textContent = "";
  $("ocrLanguage").disabled = true;
  $("progressTrack").classList.add("hidden");
  $("progressBar").style.width = "0%";
  $("exportStatus").textContent = translations[state.language].exportStatusIdle;
  $("exportStatus").removeAttribute("data-state");
  $("exportSummary").textContent = "";
  $("reviewSummary").textContent = "";
  $("analyze").disabled = true;
  state.exported = false;
  state.workspaceStep = "upload";
  history.replaceState(null, "", "#upload");
  setStatus("processStatus", translations[state.language].processIdle);
  updateFileStatus();
  updateWorkspaceProgress();
}

async function removeQueuedJob(jobId) {
  if (state.batchProcessing || state.exporting) return;
  const index = state.jobs.findIndex((job) => job.id === jobId);
  if (index < 0) return;
  const job = state.jobs[index];
  if (!await confirmAction({
    title: translations[state.language].confirmDeleteTitle,
    message: translations[state.language].confirmDeleteMessage(job.file.name),
    confirmLabel: translations[state.language].confirmDelete
  })) return;
  const wasActive = job.id === state.activeJobId;
  try {
    if (wasActive && state.pdf) await state.pdf.destroy();
    state.jobs.splice(index, 1);
    if (wasActive) {
      state.pdf = null;
      state.bytes = null;
      state.activeJobId = null;
      if (state.jobs.length) {
        await activateJob(state.jobs[Math.min(index, state.jobs.length - 1)]);
      } else {
        resetActiveJobView();
      }
    }
    renderQueue();
    updateExportSummary();
    $("analyze").disabled = !state.jobs.some((item) => item.status === "queued");
    if (!state.jobs.length) {
      resetActiveJobView();
    } else if (state.jobs.some((item) => item.status === "review")) {
      state.workspaceStep = "results";
      history.replaceState(null, "", "#results");
      updateWorkspaceProgress();
    } else {
      state.workspaceStep = "upload";
      history.replaceState(null, "", "#upload");
      updateWorkspaceProgress();
    }
  } catch (error) {
    setStatus("processStatus", `${translations[state.language].removeFailed}: ${error.message}`, "error");
  }
}

async function removeAllQueuedJobs() {
  if (state.batchProcessing || state.exporting || !state.jobs.length) return;
  if (!await confirmAction({
    title: translations[state.language].confirmDeleteAllTitle,
    message: translations[state.language].confirmDeleteAllMessage(state.jobs.length),
    confirmLabel: translations[state.language].confirmDeleteAll
  })) return;
  try {
    if (state.worker) await state.worker.terminate();
    state.worker = null;
    state.workerLanguage = "";
    if (state.pdf) await state.pdf.destroy();
    state.jobs = [];
    resetActiveJobView();
    renderQueue();
    updateExportSummary();
  } catch (error) {
    setStatus("processStatus", `${translations[state.language].removeFailed}: ${error.message}`, "error");
  }
}

function addUploadErrors(errors) {
  const root = $("uploadErrors");
  if (!errors.length) {
    root.classList.add("hidden");
    root.textContent = "";
    return;
  }
  root.textContent = errors.join(" · ");
  root.classList.remove("hidden");
}

async function loadPdf(job) {
  const file = job.file;
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("ไฟล์ที่เลือกไม่ใช่ PDF");
  }
  if (file.size === 0) throw new Error("ไฟล์ว่าง");
  if (file.size > MAX_FILE_BYTES) throw new Error("ไฟล์มีขนาดเกิน 100 MiB");

  const bytes = await file.arrayBuffer();
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new Error("ไม่พบลายเซ็นไฟล์ PDF ที่ถูกต้อง");
  }
  if (!window.pdfjsLib || !window.PDFLib || !window.Tesseract || !window.JSZip) {
    throw new Error("โหลดไลบรารี PDF/OCR ไม่ครบ โปรดตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วโหลดหน้าใหม่");
  }

  const loadingTask = pdfjsLib.getDocument({ data: bytes.slice(0) });
  const pdf = await loadingTask.promise;
  if (!Number.isInteger(pdf.numPages) || pdf.numPages < 1) {
    await pdf.destroy();
    throw new Error("PDF ไม่มีหน้าที่อ่านได้");
  }

  if (state.pdf) await state.pdf.destroy();
  state.pdf = pdf;
  state.bytes = bytes;
  state.sourceName = file.name;
  state.activeJobId = job.id;
  state.currentPage = job.currentPage || 1;
  state.zoom = job.zoom || 1;
  state.rotation = job.rotation || 0;
  state.history = job.history || [];
  state.pages = job.pages?.length
    ? job.pages
    : Array.from({ length: pdf.numPages }, (_, index) => ({
      page: index + 1,
      text: "",
      method: "ยังไม่อ่าน",
      ocrConfidence: null,
      evidenceScore: 0,
      reason: "ยังไม่วิเคราะห์",
      documentType: "ไม่แน่ใจ",
      documentNumber: "",
      company: "",
      date: "",
      start: false,
      error: ""
    }));
  state.documents = job.documents || [];
  job.pages = state.pages;
  job.documents = state.documents;
  job.history = state.history;
  job.selectedPages = Array.isArray(job.selectedPages)
    ? job.selectedPages.filter((page) => page >= 1 && page <= pdf.numPages)
    : Array.from({ length: pdf.numPages }, (_, index) => index + 1);
  job.pageCount = pdf.numPages;
  job.status = job.documents?.length ? "review" : "queued";

  $("fileSummary").textContent = `${file.name} · ${(file.size / (1024 * 1024)).toFixed(2)} MiB · ${pdf.numPages.toLocaleString()} หน้า`;
  $("fileSummary").classList.remove("hidden");
  updateFileStatus();
  $("viewerPanel").classList.remove("hidden");
  $("results").classList.toggle("hidden", !job.documents.length);
  $("export").classList.toggle("hidden", !job.documents.length);
  $("ocrLanguage").disabled = false;
  $("analyze").disabled = !state.jobs.some((item) => item.status === "queued");
  $("progressTrack").classList.add("hidden");
  $("progressBar").style.width = "0%";
  setStatus(
    "processStatus",
    job.documents.length
      ? translations[state.language].processReviewFile(file.name)
      : translations[state.language].processReady
  );
  setStatus("exportStatus", translations[state.language].exportStatusIdle);
  await renderCurrentPage();
  if (job.documents.length) renderDocuments();
  renderBatchReview();
  renderQueue();
}

async function activateJob(job) {
  if (job.id === state.activeJobId && state.pdf) return;
  saveActiveJob();
  await loadPdf(job);
}

async function extractPdfText(pageNumber) {
  const page = await state.pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items
    .filter((item) => typeof item.str === "string")
    .map((item) => item.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function getOcrRecognitionLanguage() {
  const selected = $("ocrLanguage")?.value || "tha+eng";
  if (selected === "tha") return "tha+eng";
  if (selected === "eng") return "eng";
  return "tha+eng";
}

async function getOcrWorker(pageNumber) {
  const language = getOcrRecognitionLanguage();
  if (state.worker && state.workerLanguage !== language) {
    await state.worker.terminate();
    state.worker = null;
  }
  if (!state.worker) {
    state.worker = await Tesseract.createWorker(language, 1, {
      workerPath: new URL("vendor/tesseract-worker.min.js", window.location.href).toString(),
      corePath: new URL("vendor/", window.location.href).toString(),
      langPath: new URL("vendor/ocr-data/", window.location.href).toString(),
      workerBlobURL: false,
      gzip: true,
      logger(message) {
        if (message.status === "recognizing text") {
          setStatus("processStatus", `OCR หน้า ${pageNumber}/${state.pages.length}: ${Math.round((message.progress || 0) * 100)}%`);
        } else if (message.status === "loading language traineddata") {
          setStatus("processStatus", translations[state.language].preparingOcr);
        }
      }
    });
    state.workerLanguage = language;
  }
  return state.worker;
}

async function translateExtractedText(originalText) {
  if (!originalText) return originalText;
  const selected = $("ocrLanguage")?.value || "tha+eng";
  const targetLanguage = selected === "tha" ? "th" : selected === "eng" ? "en" : null;
  if (!targetLanguage) return originalText;
  try {
    const sourceLanguage = targetLanguage === "th" ? "en" : "th";
    const translator = await getBrowserTranslator(sourceLanguage, targetLanguage);
    return await translateLongText(translator, originalText);
  } catch (error) {
    state.pageTranslationWarnings.add(error.message);
    return originalText;
  }
}

async function runOcr(pageNumber) {
  const page = await state.pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.8 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("สร้างภาพสำหรับ OCR ไม่สำเร็จ");
  await page.render({ canvasContext: context, viewport }).promise;
  const worker = await getOcrWorker(pageNumber);
  const result = await worker.recognize(canvas);
  const originalText = result.data.text.replace(/\s+/g, " ").trim();
  const lines = Array.isArray(result.data.lines)
    ? result.data.lines.map((line) => ({
      text: String(line.text || "").replace(/\s+/g, " ").trim(),
      confidence: Number.isFinite(line.confidence) ? Number((line.confidence / 100).toFixed(4)) : null,
      boundingBox: line.bbox || null
    })).filter((line) => line.text)
    : [];
  const words = Array.isArray(result.data.words)
    ? result.data.words.map((word) => ({
      text: String(word.text || "").trim(),
      confidence: Number.isFinite(word.confidence) ? Number((word.confidence / 100).toFixed(4)) : null,
      boundingBox: word.bbox || null
    })).filter((word) => word.text)
    : [];
  let outputText = originalText;
  let translationStatus = "not_requested";
  const selected = $("ocrLanguage")?.value || "tha+eng";
  const targetLanguage = selected === "tha" ? "th" : selected === "eng" ? "en" : null;
  if (targetLanguage && originalText) {
    try {
      const sourceLanguage = targetLanguage === "th" ? "en" : "th";
      const translator = await getBrowserTranslator(sourceLanguage, targetLanguage);
      outputText = await translateLongText(translator, originalText);
      translationStatus = "translated";
    } catch (error) {
      translationStatus = `translation_unavailable: ${error.message}`;
    }
  }
  return {
    text: outputText,
    originalText,
    lines,
    words,
    translationStatus,
    confidence: Number.isFinite(result.data.confidence) ? result.data.confidence / 100 : null
  };
}

async function getBrowserTranslator(sourceLanguage, targetLanguage) {
  if (!window.Translator || typeof window.Translator.create !== "function") {
    throw new Error("เบราว์เซอร์นี้ยังไม่รองรับ Translation API แบบออฟไลน์");
  }
  const pair = `${sourceLanguage}:${targetLanguage}`;
  if (state.translator && state.translatorPair === pair) return state.translator;
  if (typeof window.Translator.availability === "function") {
    const availability = await window.Translator.availability({ sourceLanguage, targetLanguage });
    if (availability === "unavailable") throw new Error("ไม่มีชุดแปลภาษาสำหรับคู่ภาษานี้");
  }
  state.translator = await window.Translator.create({ sourceLanguage, targetLanguage });
  state.translatorPair = pair;
  return state.translator;
}

async function translateLongText(translator, text) {
  const chunks = text.match(/[\s\S]{1,4000}/g) || [text];
  const translated = [];
  for (const chunk of chunks) translated.push(await translator.translate(chunk));
  return translated.join("").trim();
}

function normalizeDocumentNumber(value) {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "")
    .replace(/[.,;:]+$/g, "")
    .toUpperCase();
}

function extractDocumentNumber(text) {
  const labeledPatterns = [
    /(?:purchase\s+(?:order|requisition)(?:\s+(?:no\.?|number))?|p\.\s*o\.\s*(?:no\.?|number)?|po\s*(?:no\.?|number)?|p\.\s*r\.\s*(?:no\.?|number)?|pr\s*(?:no\.?|number)?|reference|invoice(?:\s+(?:no\.?|number))?|reference\s*(?:no\.?|number)?|เลขที่(?:เอกสาร|ใบสั่งซื้อ|ใบขอซื้อ|ใบกำกับภาษี|ใบแจ้งหนี้|ใบเสร็จรับเงิน)?)\s*[:#.-]?\s*([A-Z]{1,5}[./_-][A-Z0-9][A-Z0-9._/-]{2,})/gi,
    /(?:purchase\s+(?:order|requisition)(?:\s+(?:no\.?|number))?|p\.\s*o\.\s*(?:no\.?|number)?|po\s*(?:no\.?|number)?|p\.\s*r\.\s*(?:no\.?|number)?|pr\s*(?:no\.?|number)?|invoice(?:\s+(?:no\.?|number))?|reference\s*(?:no\.?|number)?|เลขที่(?:เอกสาร|ใบสั่งซื้อ|ใบขอซื้อ|ใบกำกับภาษี|ใบแจ้งหนี้|ใบเสร็จรับเงิน)?|document\s+(?:no\.?|number))\s*[:#.-]?\s*([A-Z0-9][A-Z0-9/_-]{3,})/gi
  ];
  for (const pattern of labeledPatterns) {
    const match = [...text.matchAll(pattern)].find((item) => !/^(?:DN|SO)[./_-]/i.test(item[1]));
    if (match?.[1]) return normalizeDocumentNumber(match[1]);
  }

  const standalone = [...text.matchAll(/\b(?:INV|TAX|CN|PO|PR)[./_-][A-Z0-9][A-Z0-9./_-]{2,}\b/gi)]
    .map((match) => normalizeDocumentNumber(match[0]))
    .filter((value, index, values) => values.indexOf(value) === index);
  return standalone.length === 1 ? standalone[0] : "";
}

function isContinuationPage(text) {
  return /(INVOICE\s+CONTINUATION|CONTINUATION\s+(?:PAGE|SHEET)|ใบแจ้งหนี้\s*(?:ต่อ|ส่วนต่อ)|หน้าต่อของใบแจ้งหนี้|THIS PAGE (?:IS )?PART OF THE SAME)/i.test(text);
}

function normalizeDocumentText(value) {
  let normalized = String(value || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[_–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  normalized = normalized.replace(/\b(?:[A-Za-z]\s){2,}[A-Za-z]\b/g, (match) => match.replace(/\s+/g, ""));
  return normalized;
}

function classifyDocumentName(filename) {
  const normalized = normalizeDocumentText(filename).toUpperCase();
  const compact = normalized.replace(/[^A-Z0-9ก-๙]/g, "");
  if (/ใบแจ้ง.?หนี้|TAX[_\s.-]*(INVOICE)?|E[_\s.-]*TAX|COMMERCIAL[_\s.-]*INVOICE|\bINVOICE\b|\bINV\b|ETAX/.test(normalized) || /TAXINVOICE|ETAX/.test(compact)) return "ใบแจ้งหนี้";
  if (/ใบสั่ง.?ซื้อ|PURCHASE[_\s.-]*ORDER|PURCHASEORDER|\bPO\b|P\s*\.\s*O\s*\./.test(normalized) || /PURCHASEORDER/.test(compact)) return "ใบสั่งซื้อ (PO)";
  if (/ใบขอ.?ซื้อ|PURCHASE[_\s.-]*(REQUISITION|REQUEST)|PURCHASEREQUISITION|REQUISITION|\bPR\b|P\s*\.\s*R\s*\./.test(normalized) || /REQUISITION/.test(compact)) return "ใบขอซื้อ (PR)";
  return "ไม่แน่ใจ";
}

function detectDocumentType(header) {
  const searchableHeader = normalizeDocumentText(header).toUpperCase();
  const compactHeader = searchableHeader.replace(/[^A-Zก-๙]/g, "");

  if (/ใบแจ้ง.?หนี้|TAX\s*(INVOICE)?|E[_\s.-]*TAX|ETAX|COMMERCIAL\s*INVOICE|INVOICE|\bINV\b/.test(searchableHeader) || /INVOICE/.test(compactHeader)) return "ใบแจ้งหนี้";
  if (/ใบสั่ง.?ซื้อ|PURCHASE\s*(ORDER|ORDERS)|PURCHASEORDER|ORDER\s*(FORM)?|\bP\.?O\.?\b/.test(searchableHeader)) return "ใบสั่งซื้อ (PO)";
  if (/ใบขอ.?ซื้อ|PURCHASE\s*(REQUISITION|REQUEST)|PURCHASEREQUISITION|REQUISITION\s*(FORM)?|OCUREMENT|\bP\.?R\.?\b/.test(searchableHeader)) return "ใบขอซื้อ (PR)";
  for (const [type, pattern] of TYPE_TERMS.slice(2)) {
    if (pattern.test(searchableHeader)) return type;
  }
  return "ไม่แน่ใจ";
}

function analyzePage(page, previousPage) {
  const text = page.originalText || page.text || "";
  const header = text.slice(0, 2500);
  const filenameHint = state.sourceName || "";
  let documentType = detectDocumentType(header);
  if (page.page === 1) {
    const filenameType = classifyDocumentName(filenameHint);
    if (filenameType !== "ไม่แน่ใจ") documentType = filenameType;
  }
  if (documentType === "ไม่แน่ใจ") {
    const normalizedText = normalizeDocumentText(text);
    const compactText = normalizedText.replace(/\s+/g, "").toUpperCase();
    if (/INVOICE|COMMERCIALINVOICE|TAXINVOICE|E\s*[-.]?\s*TAX|ETAX/.test(compactText) || /I\s*N\s*V\s*O\s*I\s*C\s*E/.test(normalizedText.toUpperCase()) || /ใบแจ้ง.?หนี้/.test(normalizedText)) documentType = "ใบแจ้งหนี้";
    else if (/PURCHASEORDER|PO(?:NUMBER|NO)|P\.O\.?(?:NUMBER|NO|#)|ใบสั่ง.?ซื้อ/.test(compactText) || /ใบสั่งซื้อ/.test(normalizedText)) documentType = "ใบสั่งซื้อ (PO)";
    else if (/PURCHASEREQUISITION|PURCHASEREQUEST|PR(?:NUMBER|NO)|P\.R\.?(?:NUMBER|NO|#)|REQUISITION|OCUREMENT|ใบขอ.?ซื้อ/.test(compactText) || /ใบขอซื้อ/.test(normalizedText)) documentType = "ใบขอซื้อ (PR)";
  }
  const documentNumber = extractDocumentNumber(text);
  const companyMatch = text.match(/([A-Z][A-Za-z0-9&.,' -]{2,}?(?:Co\.?,?\s*Ltd\.?|Company Limited|Ltd\.?))/);
  const thaiCompanyMatch = text.match(/(บริษัท.{2,50}?(?:จำกัด|มหาชน))/);
  const company = companyMatch?.[1]?.trim() || thaiCompanyMatch?.[1]?.trim() || "";
  const dateMatch = text.match(/\b(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/](?:20)?\d{2})\b/);
  const date = dateMatch?.[0] || "";
  const hasTitle = documentType !== "ไม่แน่ใจ";
  const sameNumber = Boolean(documentNumber && previousPage?.documentNumber === documentNumber);
  const changedNumber = Boolean(documentNumber && previousPage?.documentNumber && previousPage.documentNumber !== documentNumber);
  const changedType = Boolean(
    page.page > 1 &&
    hasTitle &&
    previousPage?.documentType &&
    previousPage.documentType !== "ไม่แน่ใจ" &&
    previousPage.documentType !== documentType
  );
  const continuation = isContinuationPage(text);
  const evidence = Number(hasTitle) + (documentNumber ? 2 : 0) + Number(Boolean(company)) + Number(Boolean(date));
  let start = false;
  let reason = "หลักฐานเริ่มต้นไม่ครบ — ตรวจสอบด้วยตนเอง";

  if (page.page === 1) {
    start = true;
    reason = "หน้าแรกของไฟล์ — จัดเข้าชุดแรกเพื่อป้องกันหน้าสูญหาย";
  } else if (changedType) {
    start = true;
    reason = `พบประเภทเอกสารเปลี่ยนจาก ${previousPage.documentType} เป็น ${documentType}${documentNumber ? ` · เลขที่ ${documentNumber}` : ""}`;
  } else if (changedNumber) {
    start = true;
    reason = `พบเลขที่เอกสารเปลี่ยนจาก ${previousPage.documentNumber} เป็น ${documentNumber}`;
  } else if (continuation) {
    reason = documentNumber && previousPage?.documentNumber && sameNumber
      ? "ระบุว่าเป็นหน้าต่อเนื่องของเลขที่เอกสารเดิม — คงไว้ในชุดเดิม"
      : "พบข้อความระบุว่าหน้านี้เป็นหน้าต่อเนื่อง — รอการยืนยันก่อนตัดชุด";
  } else if (sameNumber) {
    reason = "พบเลขที่เอกสารเดียวกับหน้าก่อน — น่าจะเป็นหน้าต่อเนื่อง";
  } else if (hasTitle && documentNumber && (company || date || changedNumber)) {
    start = true;
    reason = `พบหลักฐานหลายด้าน: ${[
      "หัวเอกสาร",
      "เลขที่เอกสาร",
      company ? "ชื่อบริษัท" : "",
      date ? "วันที่" : "",
      changedNumber ? "เลขที่ต่างจากหน้าก่อน" : ""
    ].filter(Boolean).join(", ")}`;
  } else if (!text) {
    reason = page.error || "อ่านข้อความไม่ได้ — ต้องตรวจด้วยตนเอง";
  } else if (documentType !== "ไม่แน่ใจ") {
    reason = "พบประเภทเอกสาร แต่ยังไม่มีหลักฐานพอจะยืนยันจุดเริ่ม";
  }

  return {
    start,
    reason,
    evidenceScore: Math.min(1, evidence / 5),
    documentType,
    documentNumber,
    company,
    date
  };
}

async function analyzeActivePdf() {
  if (!state.pdf || state.processing) return false;
  state.processing = true;
  $("analyze").disabled = true;
  $("ocrLanguage").disabled = true;
  setStatus("processStatus", translations[state.language].analyzingPdfText);
  let succeeded = false;
  try {
    let lastDocumentType = "";
    let lastDocumentNumber = "";
    for (let index = 0; index < state.pages.length; index += 1) {
      const page = state.pages[index];
      setStatus("processStatus", translations[state.language].analyzingPage(page.page, state.pages.length));
      try {
        page.originalText = await extractPdfText(page.page);
        page.text = await translateExtractedText(page.originalText);
        page.method = "PDF text";
      } catch (error) {
        page.text = "";
        page.method = "อ่าน PDF ไม่สำเร็จ";
        page.error = `อ่านหน้าจาก PDF ไม่สำเร็จ: ${error.message}`;
      }

      if (page.text.length < 25) {
        try {
          const result = await runOcr(page.page);
          page.originalText = result.originalText;
          page.text = result.text;
          page.lines = result.lines;
          page.words = result.words;
          page.translationStatus = result.translationStatus;
          page.method = "OCR";
          page.ocrConfidence = result.confidence;
          if (!page.text) page.error = "OCR ไม่พบข้อความที่อ่านได้ — ตรวจภาพด้วยตนเอง";
        } catch (error) {
          page.method = "OCR ไม่สำเร็จ";
          page.error = `OCR หน้า ${page.page} ไม่สำเร็จ: ${error.message}`;
        }
      }

      const previousPage = state.pages[index - 1];
      const previousContext = previousPage
        ? {
          ...previousPage,
          documentType: lastDocumentType || previousPage.documentType,
          documentNumber: lastDocumentNumber || previousPage.documentNumber
        }
        : null;
      const detected = analyzePage(page, previousContext);
      Object.assign(page, detected);
      if (detected.start) {
        lastDocumentType = detected.documentType === "ไม่แน่ใจ" ? "" : detected.documentType;
        lastDocumentNumber = detected.documentNumber;
      } else {
        if (detected.documentType !== "ไม่แน่ใจ") lastDocumentType = detected.documentType;
        if (detected.documentNumber) lastDocumentNumber = detected.documentNumber;
      }
      updateProgress(index + 1, state.pages.length);
      if (page.page === state.currentPage) renderViewerText();
    }

    createDocumentsFromBoundaries();
    const activeJob = getActiveJob();
    if (activeJob) {
      activeJob.pages = state.pages;
      activeJob.documents = state.documents;
      activeJob.pageCount = state.pages.length;
    }
    $("results").classList.remove("hidden");
    $("export").classList.remove("hidden");
    renderDocuments();
    renderMoveTargets();
    setStatus(
      "processStatus",
      translations[state.language].analysisComplete,
      "success"
    );
    updateFileStatus();
    succeeded = true;
  } catch (error) {
    setStatus("processStatus", translations[state.language].analysisFailed(error.message), "error");
  } finally {
    state.processing = false;
    $("analyze").disabled = state.batchProcessing || !state.jobs.some((job) => job.status === "queued");
    $("ocrLanguage").disabled = false;
    saveActiveJob();
  }
  return succeeded;
}

async function processPendingJobs() {
  if (state.batchProcessing || state.exporting) return;
  const pending = state.jobs.filter((job) => job.status === "queued");
  if (!pending.length) {
    setStatus("processStatus", translations[state.language].noQueuedFiles, "warning");
    return;
  }
  state.batchProcessing = true;
  $("analyze").disabled = true;
  $("downloadZip").disabled = true;
  $("downloadReport").disabled = true;
  for (const job of pending) {
    job.status = "loading";
    renderQueue();
    try {
      await activateJob(job);
      job.status = "processing";
      renderQueue();
      const succeeded = await analyzeActivePdf();
      job.status = succeeded ? "review" : "error";
      if (succeeded && state.documents.length && state.documents.reduce((sum, document) => sum + document.pages.length, 0) === state.pages.length) {
        job.documentTypes = [...new Set(state.documents.map((document) => document.type).filter(Boolean))];
        job.documentCount = state.documents.length;
        job.documentsPerType = Object.fromEntries(DOCUMENT_TYPES.map((type) => [
          type,
          state.documents.filter((document) => document.type === type).length
        ]).filter(([, count]) => count > 0));
      } else if (succeeded) {
        succeeded = false;
        job.error = "หน้าของไฟล์ไม่ครบตามการจัดชุด — ระบบไม่ส่งออกไฟล์นี้";
      }
      if (!succeeded) job.error = $("processStatus").textContent;
    } catch (error) {
      job.status = "error";
      job.error = error.message;
      setStatus("processStatus", translations[state.language].fileAnalysisFailed(job.file.name, error.message), "error");
    }
    saveActiveJob();
    renderQueue();
    updateExportSummary();
  }
  state.batchProcessing = false;
  renderQueue();
  $("analyze").disabled = !state.jobs.some((job) => job.status === "queued");
  const hasReviewedJobs = state.jobs.some((job) => job.status === "review");
  $("downloadZip").disabled = !hasReviewedJobs;
  $("downloadReport").disabled = !hasReviewedJobs;
  const failed = state.jobs.filter((job) => job.status === "error").length;
  const reviewedJobs = state.jobs.filter((job) => job.status === "review");
  const detectedTypes = [...new Set(reviewedJobs.flatMap((job) => job.documentTypes || []))];
  if (reviewedJobs.length) {
    window.setTimeout(() => focusWorkspaceStep("results"), 150);
  }
  if (reviewedJobs.length === state.jobs.length && state.jobs.length >= 2) {
    const perFile = reviewedJobs.map((job) => `${job.file.name}: ${job.documentCount || 0} ชุด`).join(" · ");
    setStatus("processStatus", translations[state.language].multiFileAnalysisComplete(state.jobs.length, perFile, detectedTypes), "success");
  } else {
    setStatus(
      "processStatus",
      failed
        ? translations[state.language].processCompletedWithFailures(failed)
        : translations[state.language].processCompleted,
      failed ? "warning" : "success"
    );
  }
}

function enforceDocumentTypeBoundaries() {
  for (let index = 1; index < state.pages.length; index += 1) {
    const previous = state.pages[index - 1];
    const current = state.pages[index];
    if (previous.documentType !== "ไม่แน่ใจ" && current.documentType !== "ไม่แน่ใจ" && previous.documentType !== current.documentType) {
      current.start = true;
      current.reason = `พบเปลี่ยนประเภทเอกสารจาก ${previous.documentType} เป็น ${current.documentType} — ตัดชุดทันที`;
    }
  }
}

function createDocumentsFromBoundaries() {
  state.documents = [];
  const selected = getSelectedPages();
  let previousSelectedPage = null;
  for (const page of state.pages) {
    if (!selected.has(page.page)) continue;
    const startsNewDocument = previousSelectedPage === null || page.start === true;
    if (startsNewDocument) {
      state.documents.push({
        id: createId(),
        name: page.documentNumber || `${page.documentType} · หน้า ${page.page}`,
        type: page.documentType,
        pages: []
      });
    }
    const current = state.documents[state.documents.length - 1];
    if (current) current.pages.push(page.page);
    previousSelectedPage = page.page;
  }
  const assignedCount = state.documents.flatMap((document) => document.pages).length;
  if (assignedCount !== selected.size) {
    throw new Error(`ไม่สามารถจัดหน้าที่เลือกได้ครบ — พบ ${assignedCount}/${selected.size} หน้าในชุด`);
  }
  syncPageBoundaryFlags();
}

function syncPageBoundaryFlags() {
  for (const page of state.pages) page.start = false;
  for (const document of state.documents) {
    if (document.pages.length) state.pages[document.pages[0] - 1].start = true;
  }
}

function takeSnapshot() {
  state.history.push(JSON.stringify({
    pages: state.pages,
    documents: state.documents
  }));
  if (state.history.length > 30) state.history.shift();
  $("undo").disabled = false;
}

function undoLastChange() {
  const snapshot = state.history.pop();
  if (!snapshot) return;
  const parsed = JSON.parse(snapshot);
  state.pages = parsed.pages;
  state.documents = parsed.documents;
  syncPageBoundaryFlags();
  $("undo").disabled = state.history.length === 0;
  renderDocuments();
  renderCurrentPage();
  renderMoveTargets();
}

function findDocumentIndex(pageNumber) {
  return state.documents.findIndex((document) => document.pages.includes(pageNumber));
}

function splitOrMergeAt(pageNumber) {
  const documentIndex = findDocumentIndex(pageNumber);
  if (documentIndex < 0) throw new Error("ไม่พบชุดเอกสารของหน้านี้");
  const document = state.documents[documentIndex];
  const pageIndex = document.pages.indexOf(pageNumber);
  if (pageIndex === 0) {
    if (documentIndex === 0) throw new Error("หน้าแรกของไฟล์ต้องคงอยู่ในชุดแรก");
    if (!confirm("นำชุดนี้ไปรวมกับชุดก่อนหน้าใช่หรือไม่? หน้าจะยังอยู่ครบ")) return false;
    const previous = state.documents[documentIndex - 1];
    previous.pages.push(...document.pages);
    state.documents.splice(documentIndex, 1);
  } else {
    const nextPages = document.pages.splice(pageIndex);
    const first = state.pages[nextPages[0] - 1];
    state.documents.splice(documentIndex + 1, 0, {
      id: createId(),
      name: first.documentNumber || `${first.documentType} · หน้า ${first.page}`,
      type: first.documentType,
      pages: nextPages
    });
  }
  syncPageBoundaryFlags();
  return true;
}

function renderDocuments() {
  const root = $("documentList");
  const selected = getSelectedPages();
  const totalAssigned = state.documents.reduce((sum, document) => sum + document.pages.filter((page) => selected.has(page)).length, 0);
  const uncertain = state.pages.filter((page) => selected.has(page.page) && (page.documentType === "ไม่แน่ใจ" || page.evidenceScore < 0.4)).length;
  $("reviewSummary").textContent = state.language === "en"
    ? `${state.documents.length} document(s) · ${totalAssigned}/${selected.size} pages organized · ${uncertain} page(s) need special review`
    : `${state.documents.length} เอกสาร · ${totalAssigned}/${selected.size} หน้าถูกจัดแล้ว · ${uncertain} หน้าควรตรวจเป็นพิเศษ`;

  root.innerHTML = state.documents.map((document, index) => {
    const orderedPages = document.pages;
    const firstPage = orderedPages[0];
    const confidence = orderedPages.length
      ? orderedPages.reduce((sum, page) => sum + (state.pages[page - 1].evidenceScore || 0), 0) / orderedPages.length
      : 0;
    const visiblePages = orderedPages.slice(0, 14).map((page) =>
      `<button class="button button-quiet" data-open-page="${page}">${state.language === "en" ? "Page" : "หน้า"} ${page}</button>`
    ).join("");
    const remaining = orderedPages.length > 14
      ? `<span class="tiny">+${orderedPages.length - 14} ${state.language === "en" ? "pages" : "หน้า"}</span>`
      : "";
    const contiguous = orderedPages.every((page, pageIndex) =>
      pageIndex === 0 || page === orderedPages[pageIndex - 1] + 1
    );
    const pageLabel = contiguous && orderedPages.length > 1
      ? `${state.language === "en" ? "Pages" : "หน้า"} ${orderedPages[0]}–${orderedPages[orderedPages.length - 1]}`
      : `${state.language === "en" ? "Pages" : "หน้า"} ${orderedPages.join(", ")}`;
    const typeOptions = DOCUMENT_TYPES.map((type) =>
      `<option value="${escapeHtml(type)}" ${document.type === type ? "selected" : ""}>${escapeHtml(translateDocumentType(type))}</option>`
    ).join("");
    return `<article class="document-card" data-document-id="${escapeHtml(document.id)}">
      <div class="document-head">
        <input type="text" data-document-name="${escapeHtml(document.id)}" value="${escapeHtml(document.name)}" aria-label="${state.language === "en" ? "Document name" : "ชื่อเอกสาร"} ${index + 1}">
        <select data-document-type="${escapeHtml(document.id)}" aria-label="${state.language === "en" ? "Document type" : "ประเภทเอกสาร"} ${index + 1}">${typeOptions}</select>
        <span class="confidence ${confidence < 0.4 ? "low" : ""}">${state.language === "en" ? "Evidence score" : "คะแนนหลักฐาน"} ${Math.round(confidence * 100)}%</span>
        <button class="button button-quiet" data-download-document="${escapeHtml(document.id)}">PDF</button>
      </div>
      <div class="document-preview">
        <canvas id="document-thumb-${escapeHtml(document.id)}" data-document-thumb="${escapeHtml(document.id)}" aria-label="${state.language === "en" ? "Source image from page" : "ภาพจริงจากหน้า"} ${firstPage}"></canvas>
        <span>${state.language === "en" ? "Source image from PDF" : "ภาพจริงจาก PDF ต้นฉบับ"}<br>${orderedPages.length} ${state.language === "en" ? "pages" : "หน้า"} · ${state.language === "en" ? "Reference pages" : "หน้าอ้างอิง"} ${orderedPages.join(", ")}</span>
      </div>
      <div class="document-pages">${visiblePages}${remaining}</div>
      <div class="document-actions">
        <span>${orderedPages.length ? pageLabel : (state.language === "en" ? "No pages in this set" : "ไม่มีหน้าในชุดนี้")}</span>
        <button class="button button-quiet" data-merge-document="${escapeHtml(document.id)}" ${state.documents.length < 2 ? "disabled" : ""}>${state.language === "en" ? "Merge with previous set" : "รวมกับชุดก่อนหน้า"}</button>
      </div>
    </article>`;
  }).join("");

  root.querySelectorAll("[data-open-page]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.currentPage = Number(button.dataset.openPage);
      await renderCurrentPage();
      $("viewerPanel").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  root.querySelectorAll("[data-document-name]").forEach((input) => {
    input.addEventListener("change", () => {
      const document = state.documents.find((item) => item.id === input.dataset.documentName);
      if (document) document.name = input.value.trim() || `เอกสาร ${state.documents.indexOf(document) + 1}`;
      updateExportSummary();
    });
  });
  root.querySelectorAll("[data-document-type]").forEach((select) => {
    select.addEventListener("change", () => {
      const document = state.documents.find((item) => item.id === select.dataset.documentType);
      if (document) document.type = select.value;
    });
  });
  root.querySelectorAll("[data-download-document]").forEach((button) => {
    button.addEventListener("click", async () => {
      const document = state.documents.find((item) => item.id === button.dataset.downloadDocument);
      if (!document) return;
      button.disabled = true;
      try {
        const bytes = await makePdf(document);
        download(new Blob([bytes], { type: "application/pdf" }), `${safeFilename(document.name)}.pdf`);
        setStatus("exportStatus", translations[state.language].pdfCreated(document.name), "success");
      } catch (error) {
        setStatus("exportStatus", translations[state.language].pdfCreateFailed(error.message), "error");
      } finally {
        button.disabled = false;
      }
    });
  });
  root.querySelectorAll("[data-merge-document]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = state.documents.findIndex((item) => item.id === button.dataset.mergeDocument);
      if (index < 0 || state.documents.length < 2) return;
      if (!confirm("รวมหน้าของชุดนี้เข้ากับชุดข้างเคียงใช่หรือไม่?")) return;
      takeSnapshot();
      const target = index === 0 ? 1 : index - 1;
      if (index === 0) state.documents[target].pages.unshift(...state.documents[index].pages);
      else state.documents[target].pages.push(...state.documents[index].pages);
      state.documents.splice(index, 1);
      syncPageBoundaryFlags();
      renderDocuments();
      renderMoveTargets();
      updateExportSummary();
    });
  });
  renderDocumentThumbnails();
  saveActiveJob();
  renderQueue();
  updateExportSummary();
}

async function renderDocumentThumbnails() {
  if (!state.pdf) return;
  const currentPdf = state.pdf;
  for (const document of state.documents) {
    const canvas = $(`document-thumb-${document.id}`);
    const firstPage = document.pages[0];
    if (!canvas || !firstPage) continue;
    try {
      const page = await currentPdf.getPage(firstPage);
      const viewport = page.getViewport({ scale: 0.2 });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("สร้างภาพตัวอย่างไม่สำเร็จ");
      await page.render({ canvasContext: context, viewport }).promise;
      canvas.onclick = async () => {
        state.currentPage = firstPage;
        await renderCurrentPage();
        $("viewerPanel").scrollIntoView({ behavior: "smooth", block: "start" });
      };
    } catch (error) {
      const wrapper = canvas.parentElement;
      if (wrapper) wrapper.insertAdjacentText("beforeend", ` แสดงภาพไม่ได้: ${error.message}`);
    }
  }
}

function renderMoveTargets() {
  const currentDocument = getCurrentDocument();
  const target = $("moveTarget");
  target.innerHTML = state.documents
    .filter((document) => document.id !== currentDocument?.id)
    .map((document) => `<option value="${escapeHtml(document.id)}">${escapeHtml(document.name)}</option>`)
    .join("");
  const canMove = Boolean(currentDocument && state.documents.length > 1);
  target.disabled = !canMove;
  $("moveCurrent").disabled = !canMove;
  const pageIndex = currentDocument?.pages.indexOf(state.currentPage) ?? -1;
  $("movePageUp").disabled = pageIndex <= 0;
  $("movePageDown").disabled = !currentDocument || pageIndex < 0 || pageIndex >= currentDocument.pages.length - 1;
  $("splitAtCurrent").disabled = !currentDocument || (pageIndex === 0 && state.documents.findIndex((doc) => doc.id === currentDocument.id) === 0);
  $("splitAtCurrent").textContent = pageIndex === 0
    ? (state.language === "en" ? "Merge with previous set" : "รวมกับชุดก่อนหน้า")
    : (state.language === "en" ? "Split document before this page" : "แบ่งเอกสารก่อนหน้านี้");
}

async function renderCurrentPage() {
  if (!state.pdf) return;
  const page = await state.pdf.getPage(state.currentPage);
  const viewport = page.getViewport({
    scale: Math.min(2.4, 1.1 * state.zoom),
    rotation: state.rotation
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("สร้างภาพ PDF ไม่สำเร็จ");
  await page.render({ canvasContext: context, viewport }).promise;
  $("pdfStage").replaceChildren(canvas);
  $("pageCounter").textContent = state.language === "en"
    ? `Page ${state.currentPage} / ${state.pages.length} · ${Math.round(state.zoom * 100)}%`
    : `หน้า ${state.currentPage} / ${state.pages.length} · ${Math.round(state.zoom * 100)}%`;
  updatePageSelectionControls();
  $("previousPage").disabled = state.currentPage <= 1;
  $("nextPage").disabled = state.currentPage >= state.pages.length;
  renderViewerText();
  renderMoveTargets();
}

function cleanOcrText(value) {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s*([,:;])\s*/g, "$1 ")
    .replace(/\s+([.)])/g, "$1")
    .replace(/THB\s*/gi, " THB ")
    .replace(/\s+/g, " ")
    .replace(/\s+([%,])/g, "$1")
    .trim();
}

function formatOcrSections(value) {
  const source = String(value || "").replace(/\r/g, "");
  let text = source.includes("\n") ? source : source.replace(
    /(Payment terms|Delivery details|Ship to|References|Terms|Additional line items|Purchase Order|INVOICE CONTINUATION|SAMPLE MOCKUP|Fictional|บาท)/gi,
    "\n$1"
  );
  const blocks = text.split(/\n+/).map(cleanOcrText).filter(Boolean);
  return blocks;
}

function renderViewerText() {
  const page = state.pages[state.currentPage - 1];
  if (!page) return;
  const output = $("ocrText");
  const text = page.text || (page.error ? page.error : "ยังไม่มีข้อความ — กด «วิเคราะห์เอกสาร» เพื่อเริ่มต้น");
  output.replaceChildren();
  for (const block of formatOcrSections(text)) {
    const row = document.createElement("div");
    row.className = /^(INVOICE|INVOICE CONTINUATION|Additional line items|Delivery details|References|Terms|SAMPLE|FICTIONAL)/i.test(block)
      ? "ocr-formatted-block ocr-formatted-heading"
      : "ocr-formatted-block";
    row.textContent = cleanOcrText(block);
    output.append(row);
  }
  const confidence = page.ocrConfidence === null ? "" : ` · OCR ${Math.round(page.ocrConfidence * 100)}%`;
  const translation = page.translationStatus === "translated"
    ? " · แปลภาษาแล้ว"
    : page.translationStatus?.startsWith("translation_unavailable")
      ? " · แปลภาษาไม่ได้ — แสดงข้อความต้นฉบับ"
      : "";
  $("ocrBadge").textContent = `${page.method}${confidence}${translation}${page.documentType ? ` · ${page.documentType}` : ""}`;
  const available = Boolean(page.method && page.method !== "ยังไม่อ่าน");
  $("downloadCurrentOcr").disabled = !available;
  $("copyCurrentOcr").disabled = !available;
}

function getCurrentOcrReport() {
  const page = state.pages[state.currentPage - 1];
  const job = getActiveJob();
  if (!page || !job) return null;
  const selected = $("ocrLanguage")?.value || "tha+eng";
  return {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    sourceFile: job.file.name,
    pageNumber: page.page,
    totalPages: state.pages.length,
    outputLanguage: selected === "tha" ? "th" : selected === "eng" ? "en" : "original",
    document: {
      type: page.documentType,
      number: page.documentNumber || null,
      company: page.company || null,
      date: page.date || null
    },
    ocr: {
      method: page.method,
      confidence: page.ocrConfidence,
      translationStatus: page.translationStatus || "not_requested",
      originalText: page.originalText || page.text || "",
      outputText: page.text || "",
      formattedText: formatOcrSections(page.text || "").join("\n\n"),
      lines: page.lines || [],
      words: page.words || []
    }
  };
}

function downloadCurrentOcr() {
  const report = getCurrentOcrReport();
  if (!report) return;
  const jobName = safeFilename(report.sourceFile.replace(/\.pdf$/i, "") || "document");
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" });
  download(blob, `${jobName}_page_${String(report.pageNumber).padStart(3, "0")}_ocr.json`);
}

async function copyCurrentOcr() {
  const report = getCurrentOcrReport();
  if (!report) return;
  try {
    await navigator.clipboard.writeText(report.ocr.formattedText);
    setStatus("exportStatus", translations[state.language].ocrCopied, "success");
  } catch (_) {
    setStatus("exportStatus", translations[state.language].ocrCopyBlocked, "error");
  }
}

function renderBatchReview() {
  const root = $("batchReviewList");
  if (!root) return;
  const readyJobs = state.jobs.filter((job) => job.documents?.length);
  root.innerHTML = readyJobs.length ? readyJobs.map((job) => {
    const types = [...new Set(job.documents.map((document) => document.type || "ไม่แน่ใจ"))];
    const pageCount = job.pages?.length || 0;
    const active = job.id === state.activeJobId ? " active" : "";
    return `<div class="batch-review-item${active}">
      <div>
        <div class="batch-review-file">${escapeHtml(job.file.name)}</div>
        <div class="batch-review-meta">${job.documents.length} ${state.language === "en" ? "document set(s)" : "ชุดเอกสาร"} · ${pageCount} ${state.language === "en" ? "pages" : "หน้า"}</div>
        <div class="batch-review-types">${state.language === "en" ? "Types" : "ประเภท"}: ${escapeHtml(types.map(translateDocumentType).join(" · "))}</div>
      </div>
      <button class="button button-quiet" data-review-job="${escapeHtml(job.id)}">${state.language === "en" ? "Review this file" : "ตรวจไฟล์นี้"}</button>
    </div>`;
  }).join("") : "";
  root.querySelectorAll("[data-review-job]").forEach((button) => {
    button.addEventListener("click", async () => {
      const job = state.jobs.find((item) => item.id === button.dataset.reviewJob);
      if (!job || state.batchProcessing || state.exporting) return;
      await activateJob(job);
      renderBatchReview();
    });
  });
}

function updateExportSummary() {
  renderBatchReview();
  const readyJobs = state.jobs.filter((job) => job.status === "review");
  const documentCount = readyJobs.reduce((sum, job) => sum + job.documents.length, 0);
  const pageCount = readyJobs.reduce((sum, job) => sum + getSelectedPages(job).size, 0);
  $("exportSummary").textContent = documentCount
    ? (state.language === "en"
      ? `${readyJobs.length} source file(s) · ${documentCount} PDF(s) detected · ${pageCount.toLocaleString()} pages · ZIP download includes all reviewed files`
      : `${readyJobs.length} ไฟล์ต้นฉบับ · ${documentCount} PDF ที่แยกได้ · ${pageCount.toLocaleString()} หน้า · ดาวน์โหลด ZIP จะรวมทุกไฟล์ที่ตรวจแล้ว`)
    : (state.language === "en" ? "No documents are ready for export" : "ยังไม่มีเอกสารสำหรับส่งออก");
}

function validateAssignment(documents = state.documents, pages = state.pages, selectedPages = null) {
  if (!documents.length) throw new Error("ยังไม่มีเอกสารสำหรับส่งออก");
  const selected = selectedPages ? new Set(selectedPages) : new Set(Array.from({ length: pages.length }, (_, index) => index + 1));
  const assigned = documents.flatMap((document) => document.pages).filter((page) => selected.has(page));
  if (assigned.length !== selected.size) throw new Error("จำนวนหน้าที่จัดไว้ไม่ตรงกับหน้าที่เลือกส่งออก");
  const unique = new Set(assigned);
  if (unique.size !== selected.size) throw new Error("พบหน้าซ้ำในชุดเอกสาร");
  for (const page of selected) {
    if (!unique.has(page)) throw new Error(`ไม่พบหน้า ${page} ในชุดเอกสาร`);
  }
  if (documents.some((document) => document.pages.every((page) => !selected.has(page)))) {
    throw new Error("มีชุดเอกสารที่ไม่มีหน้าที่เลือกส่งออก");
  }
}

const rasterPdfCache = new Map();

async function rasterizePage(job, pageNumber) {
  let pdf = rasterPdfCache.get(job.id);
  if (!pdf) {
    const bytes = job.id === state.activeJobId ? state.bytes : await job.file.arrayBuffer();
    pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
    rasterPdfCache.set(job.id, pdf);
  }
  const sourcePage = await pdf.getPage(pageNumber);
  const baseViewport = sourcePage.getViewport({ scale: 1 });
  const scale = Math.min(2, Math.max(1.5, 1800 / Math.max(baseViewport.width, baseViewport.height)));
  const viewport = sourcePage.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await sourcePage.render({ canvasContext: context, viewport }).promise;
  return {
    jpeg: await new Promise((resolve, reject) => canvas.toBlob(resolve, "image/jpeg", 0.92)),
    width: baseViewport.width,
    height: baseViewport.height
  };
}

async function makePdf(document, job = getActiveJob(), source = null) {
  if (!job) throw new Error("ไม่พบไฟล์ต้นฉบับของเอกสาร");
  validateAssignment(job.documents, job.pages, [...getSelectedPages(job)]);
  const output = await PDFLib.PDFDocument.create();
  const selectedPages = getSelectedPages(job);
  for (const pageNumber of document.pages.filter((page) => selectedPages.has(page))) {
    const rendered = await rasterizePage(job, pageNumber);
    if (!rendered.jpeg) throw new Error(`ไม่สามารถแปลงหน้า ${pageNumber} เป็นภาพได้`);
    const imageBytes = await rendered.jpeg.arrayBuffer();
    const image = await output.embedJpg(imageBytes);
    const page = output.addPage([rendered.width, rendered.height]);
    page.drawImage(image, { x: 0, y: 0, width: rendered.width, height: rendered.height });
  }
  return output.save();
}

async function downloadZip() {
  if (state.exporting || state.batchProcessing) return;
  focusWorkspaceStep("export");
  const zipButton = $("downloadZip");
  const reportButton = $("downloadReport");
  state.exporting = true;
  zipButton.disabled = true;
  reportButton.disabled = true;
  $("analyze").disabled = true;
  renderQueue();
  try {
    const jobs = state.jobs.filter((job) => job.status === "review" && job.documents?.length && job.pages?.length);
    const incompleteJobs = state.jobs.filter((job) => job.status !== "review" || !job.documents?.length || !job.pages?.length);
    if (!jobs.length) throw new Error(translations[state.language].noReviewedFiles || "ยังไม่มีไฟล์ที่วิเคราะห์และตรวจแล้ว");
    if (incompleteJobs.length) {
      throw new Error(translations[state.language].incompleteExportJobs(incompleteJobs.length, incompleteJobs.map((job) => job.file.name).join(", ")));
    }
    const zip = new JSZip();
    const totalDocuments = jobs.reduce((sum, job) => sum + job.documents.length, 0);
    let documentNumber = 0;
    let sourcePageCount = 0;
    let lastZipProgress = 0;
    let lastZipUpdate = 0;
    for (const job of jobs) {
      validateAssignment(job.documents, job.pages, [...getSelectedPages(job)]);
      sourcePageCount += getSelectedPages(job).size;
      const sourceName = safeFilename(job.file.name.replace(/\.pdf$/i, ""));
      setExportProgress(
        (documentNumber / totalDocuments) * 80,
        translations[state.language].exportPrepare(documentNumber + 1, totalDocuments, job.documents[0].name)
      );
      await yieldToBrowser();
      for (const document of job.documents) {
        documentNumber += 1;
        const message = translations[state.language].exportPrepare(documentNumber, totalDocuments, document.name);
        setExportProgress(((documentNumber - 1) / totalDocuments) * 80, message);
        await yieldToBrowser();
        const category = safeFilename(document.type || "ไม่แน่ใจ");
        const categoryFolder = zip.folder(category);
        const outputName = `${sourceName}_${String(documentNumber).padStart(3, "0")}_${safeFilename(document.name)}.pdf`;
        categoryFolder.file(outputName, await makePdf(document, job), { compression: "STORE" });
        setExportProgress((documentNumber / totalDocuments) * 80, message);
      }
      await yieldToBrowser();
    }
    setExportProgress(80, translations[state.language].exportZip);
    await yieldToBrowser();
    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" }, (progress) => {
      const now = performance.now();
      const rounded = Math.floor(progress.percent / 5) * 5;
      if (rounded >= lastZipProgress + 5 || now - lastZipUpdate >= 250 || progress.percent === 100) {
        lastZipProgress = rounded;
        lastZipUpdate = now;
        setExportProgress(80 + progress.percent * 0.2, translations[state.language].exportZip);
      }
    });
    download(blob, "document_desk_documents.zip");
    state.exported = true;
    updateWorkspaceProgress();
    setExportProgress(
      100,
      translations[state.language].exportSuccess(documentNumber, jobs.length, sourcePageCount),
      "success"
    );
  } catch (error) {
    setStatus("exportStatus", translations[state.language].exportFailed(error.message), "error");
  } finally {
    state.exporting = false;
    renderQueue();
    const hasReviewedJobs = state.jobs.some((job) => job.status === "review");
    zipButton.disabled = !hasReviewedJobs;
    reportButton.disabled = !hasReviewedJobs;
    $("analyze").disabled = !state.jobs.some((job) => job.status === "queued");
  }
}

function downloadReport() {
  try {
    focusWorkspaceStep("export");
    saveActiveJob();
    const jobs = state.jobs.filter((job) => job.status === "review");
    if (!jobs.length) throw new Error(translations[state.language].noReviewedFiles || "ยังไม่มีไฟล์ที่วิเคราะห์และตรวจแล้ว");
    for (const job of jobs) validateAssignment(job.documents, job.pages, [...getSelectedPages(job)]);
    const selectedOcrLanguage = $("ocrLanguage")?.value || "tha+eng";
    const report = {
      schemaVersion: "1.0",
      generatedAt: new Date().toISOString(),
      ocr: {
        recognitionLanguage: getOcrRecognitionLanguage(),
        outputLanguage: selectedOcrLanguage === "tha" ? "th" : selectedOcrLanguage === "eng" ? "en" : "original",
        pageFormat: true,
        formatDescription: "One OCR record per physical page, ordered by source page number"
      },
      reviewRequired: true,
      files: jobs.map((job, fileIndex) => ({
        fileIndex: fileIndex + 1,
        sourceFile: job.file.name,
        pageCount: job.pages.length,
        documents: job.documents.map((document, documentIndex) => ({
          documentIndex: documentIndex + 1,
          name: document.name,
          type: document.type,
          sourcePages: document.pages
        })),
        pages: job.pages.map((page) => ({
          pageNumber: page.page,
          documentType: page.documentType,
          documentNumber: page.documentNumber || null,
          company: page.company || null,
          date: page.date || null,
          evidenceScore: page.evidenceScore,
          ocr: {
            method: page.method,
            confidence: page.ocrConfidence,
            translationStatus: page.translationStatus || "not_requested",
            originalText: page.originalText || page.text || "",
            outputText: page.text || "",
            formattedText: formatOcrSections(page.text || ""),
            lines: page.lines || [],
            words: page.words || []
          }
        }))
      }))
    };
    download(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
      "document_desk_report.json"
    );
    state.exported = true;
    updateWorkspaceProgress();
    setStatus("exportStatus", translations[state.language].reportDownloaded, "success");
  } catch (error) {
    setStatus("exportStatus", translations[state.language].reportCreateFailed(error.message), "error");
  }
}

async function moveCurrentPage() {
  const fromIndex = findDocumentIndex(state.currentPage);
  const targetIndex = state.documents.findIndex((document) => document.id === $("moveTarget").value);
  if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) return;
  takeSnapshot();
  const [page] = state.documents[fromIndex].pages.splice(state.documents[fromIndex].pages.indexOf(state.currentPage), 1);
  state.documents[targetIndex].pages.push(page);
  if (!state.documents[fromIndex].pages.length) state.documents.splice(fromIndex, 1);
  syncPageBoundaryFlags();
  renderDocuments();
  renderMoveTargets();
  await renderCurrentPage();
}

function moveWithinDocument(offset) {
  const documentIndex = findDocumentIndex(state.currentPage);
  if (documentIndex < 0) return;
  const document = state.documents[documentIndex];
  const pageIndex = document.pages.indexOf(state.currentPage);
  const nextIndex = pageIndex + offset;
  if (nextIndex < 0 || nextIndex >= document.pages.length) return;
  takeSnapshot();
  [document.pages[pageIndex], document.pages[nextIndex]] = [document.pages[nextIndex], document.pages[pageIndex]];
  syncPageBoundaryFlags();
  renderDocuments();
  renderMoveTargets();
}

async function addSelectedFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const errors = [];
  let added = 0;
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      errors.push(`${file.name}: ไม่ใช่ไฟล์ PDF`);
      continue;
    }
    if (file.size === 0) {
      errors.push(`${file.name}: ไฟล์ว่าง`);
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      errors.push(`${file.name}: ขนาดเกิน 100 MiB ต่อไฟล์`);
      continue;
    }
    let signature;
    try {
      signature = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
    } catch (error) {
      errors.push(`${file.name}: อ่านส่วนหัวไฟล์ไม่ได้ (${error.message})`);
      continue;
    }
    if (signature !== "%PDF-") {
      errors.push(`${file.name}: ไม่พบลายเซ็น PDF`);
      continue;
    }
    const duplicate = state.jobs.some((job) =>
      job.file.name === file.name &&
      job.file.size === file.size &&
      job.file.lastModified === file.lastModified
    );
    if (duplicate) {
      errors.push(`${file.name}: ไฟล์นี้อยู่ในรายการแล้ว`);
      continue;
    }
    state.jobs.push({
      id: createId(),
      file,
      status: "queued",
      pages: [],
      documents: [],
      currentPage: 1,
      zoom: 1,
      rotation: 0,
      history: []
    });
    added += 1;
  }
  addUploadErrors(errors);
  renderQueue();
  updateExportSummary();
  if (added && !state.activeJobId) {
    const firstJob = state.jobs.find((job) => job.status === "queued");
    try {
      await activateJob(firstJob);
    } catch (error) {
      firstJob.status = "error";
      firstJob.error = error.message;
      renderQueue();
      setStatus("processStatus", translations[state.language].fileOpenFailed(error.message), "error");
    }
  } else if (added) {
    setStatus("processStatus", translations[state.language].filesAdded(added, state.jobs.filter((job) => job.status === "queued").length));
  }
  $("analyze").disabled = !state.jobs.some((job) => job.status === "queued");
}

$("pdfFile").addEventListener("change", (event) => {
  const files = Array.from(event.target.files);
  event.target.value = "";
  addSelectedFiles(files);
  focusWorkspaceStep("upload", { scroll: false });
});
$("dropZone").addEventListener("dragover", (event) => {
  event.preventDefault();
  $("dropZone").classList.add("dragover");
});
$("dropZone").addEventListener("dragleave", () => $("dropZone").classList.remove("dragover"));
$("dropZone").addEventListener("drop", (event) => {
  event.preventDefault();
  $("dropZone").classList.remove("dragover");
  addSelectedFiles(event.dataTransfer.files);
  focusWorkspaceStep("upload", { scroll: false });
});
$("analyze").addEventListener("click", processPendingJobs);
$("removeAllFiles").addEventListener("click", removeAllQueuedJobs);
$("previousPage").addEventListener("click", async () => {
  if (state.currentPage > 1) {
    state.currentPage -= 1;
    await renderCurrentPage();
  }
});
$("nextPage").addEventListener("click", async () => {
  if (state.currentPage < state.pages.length) {
    state.currentPage += 1;
    await renderCurrentPage();
  }
});
$("includeCurrentPage").addEventListener("change", (event) => {
  const job = getActiveJob();
  if (!job) return;
  const selected = getSelectedPages(job);
  if (event.target.checked) selected.add(state.currentPage);
  else selected.delete(state.currentPage);
  job.selectedPages = [...selected].sort((a, b) => a - b);
  reconcileSelectedPages();
  updatePageSelectionControls();
});
$("selectAllPages").addEventListener("click", () => {
  const job = getActiveJob();
  if (!job) return;
  job.selectedPages = Array.from({ length: state.pages.length }, (_, index) => index + 1);
  reconcileSelectedPages();
  updatePageSelectionControls();
});
$("clearAllPages").addEventListener("click", () => {
  const job = getActiveJob();
  if (!job) return;
  job.selectedPages = [];
  reconcileSelectedPages();
  updatePageSelectionControls();
});
$("selectAllPagesTop").addEventListener("click", () => {
  const job = getActiveJob();
  if (!job) return;
  job.selectedPages = Array.from({ length: state.pages.length }, (_, index) => index + 1);
  reconcileSelectedPages();
  updatePageSelectionControls();
});
$("clearAllPagesTop").addEventListener("click", () => {
  const job = getActiveJob();
  if (!job) return;
  job.selectedPages = [];
  reconcileSelectedPages();
  updatePageSelectionControls();
});
$("restoreAllPages").addEventListener("click", () => {
  const job = getActiveJob();
  if (!job) return;
  job.selectedPages = Array.from({ length: state.pages.length }, (_, index) => index + 1);
  reconcileSelectedPages();
  updatePageSelectionControls();
});
$("zoomIn").addEventListener("click", async () => {
  state.zoom = Math.min(2.2, state.zoom + 0.2);
  await renderCurrentPage();
});
$("zoomOut").addEventListener("click", async () => {
  state.zoom = Math.max(0.6, state.zoom - 0.2);
  await renderCurrentPage();
});
$("rotatePage").addEventListener("click", async () => {
  state.rotation = (state.rotation + 90) % 360;
  await renderCurrentPage();
});
$("ocrLanguage").addEventListener("change", async () => {
  if (state.worker) {
    await state.worker.terminate();
    state.worker = null;
    state.workerLanguage = "";
  }
});
$("undo").addEventListener("click", undoLastChange);
$("splitAtCurrent").addEventListener("click", () => {
  try {
    takeSnapshot();
    if (splitOrMergeAt(state.currentPage)) {
      renderDocuments();
      renderMoveTargets();
      updateExportSummary();
    } else {
      state.history.pop();
      $("undo").disabled = state.history.length === 0;
    }
  } catch (error) {
    setStatus("exportStatus", error.message, "warning");
  }
});
$("moveCurrent").addEventListener("click", moveCurrentPage);
$("movePageUp").addEventListener("click", () => moveWithinDocument(-1));
$("movePageDown").addEventListener("click", () => moveWithinDocument(1));
$("downloadZip").addEventListener("click", downloadZip);
$("downloadReport").addEventListener("click", downloadReport);
$("downloadCurrentOcr").addEventListener("click", downloadCurrentOcr);
$("copyCurrentOcr").addEventListener("click", copyCurrentOcr);
document.querySelector("[data-theme-btn]").addEventListener("click", () => {
  applyTheme(state.theme === "light" ? "dark" : "light");
});
let protectedDocumentFocused = false;
document.addEventListener("pointerdown", (event) => {
  protectedDocumentFocused = Boolean(event.target.closest("#pdfStage, .document-preview, .page-chip, .ocr-panel, canvas"));
});
document.addEventListener("contextmenu", (event) => {
  if (event.target.closest("#pdfStage, .document-preview, .page-chip, .ocr-panel, canvas")) {
    event.preventDefault();
  }
});
document.addEventListener("copy", (event) => {
  if (protectedDocumentFocused || event.target.closest("#pdfStage, .document-preview, .page-chip, .ocr-panel, canvas")) {
    const selection = window.getSelection();
    if (selection) selection.removeAllRanges();
    event.preventDefault();
  }
});
document.addEventListener("cut", (event) => {
  if (event.target.closest("#pdfStage, .document-preview, .page-chip, .ocr-panel, canvas")) event.preventDefault();
});
document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (protectedDocumentFocused && (event.ctrlKey || event.metaKey) && ["c", "x", "s"].includes(key)) {
    event.preventDefault();
  }
});
document.addEventListener("dragstart", (event) => {
  if (event.target.closest(".pdf-stage, .document-preview, .page-chip, canvas, .ocr-panel pre")) {
    event.preventDefault();
  }
});

document.querySelector("[data-lang-btn]").addEventListener("click", () => {
  applyLanguage(state.language === "th" ? "en" : "th");
});
document.querySelectorAll(".nav-link[data-step]").forEach((link) => {
  link.addEventListener("click", () => {
    const step = link.dataset.step;
    const target = document.getElementById(step);
    if (target && !target.classList.contains("hidden")) {
      state.workspaceStep = step;
      window.requestAnimationFrame(updateWorkspaceProgress);
    }
  });
});
let workspaceScrollFrame = 0;
window.addEventListener("scroll", () => {
  if (workspaceScrollFrame) return;
  workspaceScrollFrame = window.requestAnimationFrame(() => {
    workspaceScrollFrame = 0;
    state.workspaceStep = detectWorkspaceStep();
    updateWorkspaceProgress();
  });
}, { passive: true });
window.addEventListener("hashchange", () => {
  const step = window.location.hash.replace("#", "") || "upload";
  const target = document.getElementByById(step);
  if (target && !target.classList.contains("hidden")) {
    state.workspaceStep = step;
    updateWorkspaceProgress();
  }
});
applyTheme(state.theme);
applyLanguage(state.language);
state.workspaceStep = window.location.hash.replace("#", "") || "upload";
updateWorkspaceProgress();
