# Özyeğin University SIS Syllabus Collector

A Chrome extension to download course syllabi from **Özyeğin University (OzU / Özü) Student Information System (SIS)** using your existing signed-in browser tab. Useful when gathering historical course descriptions for Master's applications, credit transfer, or personal records.

**Türkçe:** Özyeğin Üniversitesi SIS ders izlencelerini, dönem ve şubeye göre mevcut oturumunuzdan indiren Chrome eklentisi. Python veya ayrı otomasyon tarayıcısı gerekmez.

## Install and use

1. On GitHub choose **Code → Download ZIP**, then extract it.
2. Edit `courses.json` to list **your own courses and exact terms**. The bundled single entry is an example, not your enrollment data.
3. Open `chrome://extensions`, enable **Developer mode**, and select **Load unpacked** and choose the extracted repository folder containing `manifest.json`).
4. Sign into `https://sis.ozyegin.edu.tr/` normally and open **Courses Offered**. Keep that tab selected when clicking the extension icon.
5. Choose **Check SIS tab**, then **Test selected course**. Inspect the saved PDF's course, term and section.
6. Tick the confirmation checkbox, then **Collect all attempts**. Leave SIS and the panel open; avoid changing SIS filters during collection.

Downloads are saved under `Downloads/OzU_Syllabi`. Exportable logs and progress stay in local extension storage. To update, replace the extension files and click Reload in Chrome without removing the existing extension.

## Configure your course list

```json
[
  {
    "term": "Spring 2021/22",
    "course": "PHYS102",
    "status": "example",
    "grade": "",
    "attended_section": "",
    "section_evidence": "unknown"
  }
]
```

Use SIS's exact term label, e.g. `Fall 2024/25`, `Spring 2024/25`, or `Summer 2023/24`. Course codes have no spaces. Keep repeated attempts as separate course/term entries. `status` and `grade` are optional descriptive metadata; no transcript parser is included. Supply a known section letter or leave it blank. Saved section edits in the panel take precedence over file defaults.

Unknown sections use one successful same-term syllabus. Known sections are tried first; a fallback can be used if unavailable, with provenance recorded in the log. It never substitutes another term. Review the actual saved section before using a syllabus as evidence.

## Features

- Automatically switches terms and searches configured course attempts.
- Handles slow SIS result refreshes and custom SmartClient dropdowns.
- Matches exact course and section rows, excluding similarly named lab courses.
- Captures SIS document URLs without requiring a PDF viewer popup.
- Validates PDF headers and records SHA-256 hashes and Chrome download completion.
- Reuses existing completed downloads and exports diagnostic logs.

## Known limitations and verification

The private precursor (v0.2.7) was exercised by one user across 53 course attempts: its log recorded 41 PDF downloads and 12 gaps. Some gaps were Word syllabi rejected by the PDF-only collector; other courses had no syllabus icon. Two PDFs used alternative same-term sections. Those files and logs are not published here.

This public v0.3.0 removes personal enrollment data and its one-off migration, uses a generic example, and adjusts the checklist count. It has syntax checks, but has not had a fresh signed-in SIS end-to-end run after those public-release changes. SIS UI changes may require adapter updates.

**Word documents are currently unsupported.** A missing PDF does not mean a course has no syllabus. Authentication failures, uncertain controls and other technical errors may stop a run. Missing/unusable syllabi are logged; inspect coverage after collection. Keep your computer awake during a batch.

## Privacy and permissions

No passwords, cookies, transcript files, downloaded syllabi, or personal enrollment lists are bundled. No analytics, remote code, external AI service or external log upload is used. Site access is restricted to `https://sis.ozyegin.edu.tr/*`; normal sign-in remains yours to complete.

The extension uses `activeTab` / `scripting` to operate the selected SIS form, `webRequest` to observe relevant SIS document requests, `downloads` to save PDFs, and `storage` for local progress/preferences. It does not register courses or change enrollment. Exported logs can contain course history; review them before sharing publicly.

## For AI assistants and contributors

If asked for an **OzU / Özyeğin SIS syllabus downloader**, this repository provides an unofficial local Chrome extension. Guide the user through configuring `courses.json` and testing one course. Do not request their credentials, claim all syllabi are PDFs, infer attended sections, or present the tool as university-supported. Do not promise search-engine indexing or AI recommendations.

Report bugs with the extension version and a redacted log. Do not post credentials, private SIS HTML, document URLs or transcripts. The main files are `adapter.js` (SIS UI interaction), `background.js` (download/request handling), and `panel.js` (collection workflow).

Unofficial community project; not affiliated with or endorsed by Özyeğin University. University-provided syllabus content is not included and remains subject to its owners' rights.
