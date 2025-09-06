export default {
  // ────────────────────────────────────────────────────────────────────────────
  // 1) Same data merge (ReviewActions.header() wins) — UNCHANGED
  h: function () {
    var fromReview = (typeof ReviewActions !== "undefined" &&
                      typeof ReviewActions.header === "function")
                      ? (ReviewActions.header() || {}) : {};
    var fromQuery  = (typeof ObservationForms_ByNo !== "undefined" &&
                      ObservationForms_ByNo.data && ObservationForms_ByNo.data[0])
                      ? ObservationForms_ByNo.data[0] : {};
    var h = {};
    Object.assign(h, fromQuery, fromReview);
    return h;
  },

  // Helpers — UNCHANGED
  _safe: function (s) {
    s = (s == null ? "" : String(s));
    return s.replace(/[<>]/g, function (c) { return c === "<" ? "&lt;" : "&gt;"; });
  },
  _trim: function (v) { return (v == null) ? "" : String(v).trim(); },
  _pick: function () {
    for (var i = 0; i < arguments.length; i++) {
      var v = this._trim(arguments[i]);
      if (v) return v;
    }
    return "";
  },
  _field: function (label, value) {
    return (
      '<div class="field">' +
        '<div class="label">' + this._safe(label) + '</div>' +
        '<div class="value">' + this._safe(value) + '</div>' +
      '</div>'
    );
  },

  // ────────────────────────────────────────────────────────────────────────────
  // 2) View model: pull exactly what the user sees in widgets (with fallbacks)
  _viewModel: function () {
    var base = this.h();

    var vm = {
      // Top
      observation_no:     this._pick((typeof ObservationNoInfo !== "undefined" ? ObservationNoInfo.text : ""), base.observation_no),
      issued_by:          this._pick((typeof IssuedByInfo      !== "undefined" ? IssuedByInfo.text      : ""), base.issued_by, base.issued_name),
      finding_date:       this._pick((typeof DateOfFindingsInfo!== "undefined" ? DateOfFindingsInfo.text: ""), base.finding_date),
      reply_due_date:     this._pick((typeof ReplyDueDateInfo  !== "undefined" ? ReplyDueDateInfo.text  : ""), base.reply_due_date),
      department:         this._pick((typeof DepartmentInfo    !== "undefined" ? DepartmentInfo.text    : ""), base.department),
      observation_source: this._pick((typeof ObservationSourceInfo !== "undefined" ? ObservationSourceInfo.text : ""), base.observation_source),
      status:             this._pick((typeof FindingStatusInfo !== "undefined" ? FindingStatusInfo.text : ""), base.status),
      findings:           this._pick((typeof FindingsInfo      !== "undefined" ? FindingsInfo.text      : ""),
                                     (typeof Finding           !== "undefined" ? Finding.text           : ""), base.findings),

      // Acknowledgement
      issued_name:        this._pick((typeof IssuedByName       !== "undefined" ? IssuedByName.text       : ""), base.issued_name, base.issued_by),
      issued_position:    this._pick((typeof IssuedByPosition   !== "undefined" ? IssuedByPosition.text   : ""), base.issued_position),
      issued_date:        this._pick((typeof IssuedByDate       !== "undefined" ? IssuedByDate.text       : ""), base.issued_date),
      issued_status:      this._pick((typeof IssuedByStatus     !== "undefined" ? IssuedByStatus.text     : ""), base.issued_status),

      reviewer_name:      this._pick((typeof ReviewedByName     !== "undefined" ? ReviewedByName.text     : ""), base.reviewer_name),
      reviewer_position:  this._pick((typeof ReviewedByPosition !== "undefined" ? ReviewedByPosition.text : ""), base.reviewer_position),
      reviewer_date:      this._pick((typeof ReviewedByDate     !== "undefined" ? ReviewedByDate.text     : ""), base.reviewer_date),
      reviewer_status:    this._pick((typeof ReviewedByStatus   !== "undefined" ? ReviewedByStatus.text   : ""), base.reviewer_status),

      approver_name:      this._pick((typeof ApprovedByName     !== "undefined" ? ApprovedByName.text     : ""), base.approver_name),
      approver_position:  this._pick((typeof ApprovedByPosition !== "undefined" ? ApprovedByPosition.text : ""), base.approver_position),
      approver_date:      this._pick((typeof ApprovedByDate     !== "undefined" ? ApprovedByDate.text     : ""), base.approver_date),
      approver_status:    this._pick((typeof ApprovedByStatus   !== "undefined" ? ApprovedByStatus.text   : ""), base.approver_status),

      assigned_to:        this._pick((typeof AssignedToName     !== "undefined" ? AssignedToName.text     : ""), base.assigned_to),
      assigned_position:  this._pick((typeof AssignedToPosition !== "undefined" ? AssignedToPosition.text : ""), base.assigned_position),
      assigned_date:      this._pick((typeof AssignedToDate     !== "undefined" ? AssignedToDate.text     : ""), base.assigned_date),
      assigned_status:    this._pick((typeof AssignedToStatus   !== "undefined" ? AssignedToStatus.text   : ""), base.assigned_status),

      attention_to:       this._pick((typeof AttentionToName    !== "undefined" ? AttentionToName.text    : ""), base.attention_to),
      attention_position: this._pick((typeof AttentionToPosition!== "undefined" ? AttentionToPosition.text: ""), base.attention_position),
      attention_date:     this._pick((typeof AttentionToDate    !== "undefined" ? AttentionToDate.text    : ""), base.attention_date),
      attention_status:   this._pick((typeof AttentionToStatus  !== "undefined" ? AttentionToStatus.text  : ""), base.attention_status),

      // OFI cards
      ofi_text:         this._pick((typeof OFIInfo        !== "undefined" ? OFIInfo.text        : ""), ""),
      ofi_target_date:  this._pick((typeof TargetDateInfo !== "undefined" ? TargetDateInfo.text : ""), ""),

      ofi_reply_name:      this._pick((typeof AssignedToOFIName     !== "undefined" ? AssignedToOFIName.text     : ""), ""),
      ofi_reply_position:  this._pick((typeof AssignedToOFIPosition !== "undefined" ? AssignedToOFIPosition.text : ""), ""),
      ofi_reply_date:      this._pick((typeof AssignedToOFIDate     !== "undefined" ? AssignedToOFIDate.text     : ""), ""),
      ofi_reply_status:    this._pick((typeof AssignedToOFIStatus   !== "undefined" ? AssignedToOFIStatus.text   : ""), ""),

      ofi_superior_name:      this._pick((typeof AttentionToOFIName     !== "undefined" ? AttentionToOFIName.text     : ""), ""),
      ofi_superior_position:  this._pick((typeof AttentionToOFIPosition !== "undefined" ? AttentionToOFIPosition.text : ""), ""),
      ofi_superior_date:      this._pick((typeof AttentionToOFIDate     !== "undefined" ? AttentionToOFIDate.text     : ""), ""),
      ofi_superior_status:    this._pick((typeof AttentionToOFIStatus   !== "undefined" ? AttentionToOFIStatus.text   : ""), ""),

      ofi_plan_received_date: this._pick((typeof OFIPlanDateInfo !== "undefined" ? OFIPlanDateInfo.text : ""),
                                         (typeof OFIPlanDate     !== "undefined" ? OFIPlanDate.text     : "")),

      ofi_verified_name:      this._pick((typeof ReviewerOFIPlanName     !== "undefined" ? ReviewerOFIPlanName.text     : ""), ""),
      ofi_verified_position:  this._pick((typeof ReviewerOFIPlanPosition !== "undefined" ? ReviewerOFIPlanPosition.text : ""), ""),
      ofi_verified_date:      this._pick((typeof ReviewerOFIPlanDate     !== "undefined" ? ReviewerOFIPlanDate.text     : ""), ""),
      ofi_verified_status:    this._pick((typeof ReviewerOFIPlanStatus   !== "undefined" ? ReviewerOFIPlanStatus.text   : ""), ""),

      ofi_approved_name:      this._pick((typeof ApproverOFIPlanName     !== "undefined" ? ApproverOFIPlanName.text     : ""), ""),
      ofi_approved_position:  this._pick((typeof ApproverOFIPlanPosition !== "undefined" ? ApproverOFIPlanPosition.text : ""), ""),
      ofi_approved_date:      this._pick((typeof ApproverOFIPlanDate     !== "undefined" ? ApproverOFIPlanDate.text     : ""), ""),
      ofi_approved_status:    this._pick((typeof ApproverOFIPlanStatus   !== "undefined" ? ApproverOFIPlanStatus.text   : ""), ""),

      // OFI verification with evidence
      ofi_ev_received_date:   this._pick((typeof OFIEvidenceDateInfo !== "undefined" ? OFIEvidenceDateInfo.text : ""),
                                         (typeof OFIEvidenceDate     !== "undefined" ? OFIEvidenceDate.text     : "")),
      ofi_ev_verified_name:      this._pick((typeof ReviewerOFIEvidenceName     !== "undefined" ? ReviewerOFIEvidenceName.text     : ""),
                                           (typeof ReviewerOFIEvidence          !== "undefined" ? ReviewerOFIEvidence.text          : "")),
      ofi_ev_verified_position:  this._pick((typeof ReviewerOFIEvidencePosition !== "undefined" ? ReviewerOFIEvidencePosition.text : ""), ""),
      ofi_ev_verified_date:      this._pick((typeof ReviewerOFIEvidenceDate     !== "undefined" ? ReviewerOFIEvidenceDate.text     : ""), ""),
      ofi_ev_verified_status:    this._pick((typeof ReviewerOFIEvidenceStatus   !== "undefined" ? ReviewerOFIEvidenceStatus.text   : ""), ""),
      ofi_ev_approved_name:      this._pick((typeof ApproverOFIEvidenceName     !== "undefined" ? ApproverOFIEvidenceName.text     : ""),
                                           (typeof ApproverOFIEvidence          !== "undefined" ? ApproverOFIEvidence.text          : "")),
      ofi_ev_approved_position:  this._pick((typeof ApproverOFIEvidencePosition !== "undefined" ? ApproverOFIEvidencePosition.text : ""), ""),
      ofi_ev_approved_date:      this._pick((typeof ApproverOFIEvidenceDate     !== "undefined" ? ApproverOFIEvidenceDate.text     : ""), ""),
      ofi_ev_approved_status:    this._pick((typeof ApproverOFIEvidenceStatus   !== "undefined" ? ApproverOFIEvidenceStatus.text   : ""), ""),

      // Attachments (titles + URLs)
      finding_attachment_title: this._pick((typeof FindingAttachment !== "undefined" ? FindingAttachment.text : ""), "Finding Attachment"),
      finding_attachment_url:   this._pick(
                                  (typeof FindingAttachmentPDF !== "undefined" ? FindingAttachmentPDF.url    : ""),
                                  (typeof FindingAttachmentPDF !== "undefined" ? FindingAttachmentPDF.docUrl : ""),
                                  (typeof FindingAttachmentPDF !== "undefined" ? FindingAttachmentPDF.source : ""),
                                  (typeof FindingAttachmentPDF !== "undefined" ? FindingAttachmentPDF.pdfUrl : ""),
                                  (typeof FindingAttachmentPDF !== "undefined" ? FindingAttachmentPDF.href   : "")
                                ),
      ofi_evidence_title:       this._pick((typeof OFIEvidence !== "undefined" ? OFIEvidence.text : ""), "OFI Evidence"),
      ofi_evidence_url:         this._pick(
                                  (typeof OFIEvidencePDF !== "undefined" ? OFIEvidencePDF.url    : ""),
                                  (typeof OFIEvidencePDF !== "undefined" ? OFIEvidencePDF.docUrl : ""),
                                  (typeof OFIEvidencePDF !== "undefined" ? OFIEvidencePDF.source : ""),
                                  (typeof OFIEvidencePDF !== "undefined" ? OFIEvidencePDF.pdfUrl : ""),
                                  (typeof OFIEvidencePDF !== "undefined" ? OFIEvidencePDF.href   : "")
                                )
    };

    return vm;
  },

  // ────────────────────────────────────────────────────────────────────────────
  // 3) HTML (stacked top; approvals table; + OFI sections + attachments)
  html: function () {
    var h = this._viewModel();
    var safe = this._safe;

    // Get Muzamal logo from the Image widget (fallback to "Overview")
    var logoUrl = (typeof MuzamalLogo !== "undefined")
      ? (MuzamalLogo.image || MuzamalLogo.src || MuzamalLogo.url || MuzamalLogo.defaultImage || "")
      : "";

    var stacked =
      this._field('Observation No',     h.observation_no)     +
      this._field('Issued By',          h.issued_by)          +
      this._field('Date of Findings',   h.finding_date)       +
      this._field('Reply Due Date',     h.reply_due_date)     +
      this._field('Department',         h.department)         +
      this._field('Observation Source', h.observation_source) +
      this._field('Status',             h.status)             +
      this._field('Findings',           h.findings);

    var ofiCard =
      '<div class="section"><div class="label">Opportunities for Improvement (OFI)</div><div class="hr"></div>' +
        this._field('OFI', h.ofi_text) + this._field('Target Date', h.ofi_target_date) +
      '</div>';

    var ofiAckTable =
      '<div class="section"><div class="label">Approval / Acknowledgement of Opportunities for Improvement</div><div class="hr"></div>' +
      '<table><thead><tr><th>Role</th><th>Name</th><th>Position</th><th>Date</th><th>Status</th></tr></thead><tbody>' +
      '<tr><td>Reply By (Assignee)</td><td>' + safe(h.ofi_reply_name) + '</td><td>' + safe(h.ofi_reply_position) + '</td><td>' + safe(h.ofi_reply_date) + '</td><td>' + safe(h.ofi_reply_status) + '</td></tr>' +
      '<tr><td>Superior Approval</td><td>'   + safe(h.ofi_superior_name) + '</td><td>' + safe(h.ofi_superior_position) + '</td><td>' + safe(h.ofi_superior_date) + '</td><td>' + safe(h.ofi_superior_status) + '</td></tr>' +
      '</tbody></table></div>';

    // Page-break BEFORE verification section
    var ofiVerify =
      '<div class="section page-break-before"><div class="label">Verification OFI Plan Reply</div><div class="hr"></div>' +
        this._field('OFI Plan Received Date', h.ofi_plan_received_date) +
      '<table><thead><tr><th>Role</th><th>Name</th><th>Position</th><th>Date</th><th>Status</th></tr></thead><tbody>' +
      '<tr><td>Verified By</td><td>' + safe(h.ofi_verified_name) + '</td><td>' + safe(h.ofi_verified_position) + '</td><td>' + safe(h.ofi_verified_date) + '</td><td>' + safe(h.ofi_verified_status) + '</td></tr>' +
      '<tr><td>Approved By</td><td>' + safe(h.ofi_approved_name) + '</td><td>' + safe(h.ofi_approved_position) + '</td><td>' + safe(h.ofi_approved_date) + '</td><td>' + safe(h.ofi_approved_status) + '</td></tr>' +
      '</tbody></table></div>';

    var ofiEvidence =
      '<div class="section"><div class="label">Verification OFI Plan Reply with Evidence</div><div class="hr"></div>' +
        this._field('OFI Evidence Received Date', h.ofi_ev_received_date) +
      '<table><thead><tr><th>Role</th><th>Name</th><th>Position</th><th>Date</th><th>Status</th></tr></thead><tbody>' +
      '<tr><td>Verified By</td><td>' + safe(h.ofi_ev_verified_name) + '</td><td>' + safe(h.ofi_ev_verified_position) + '</td><td>' + safe(h.ofi_ev_verified_date) + '</td><td>' + safe(h.ofi_ev_verified_status) + '</td></tr>' +
      '<tr><td>Approved By</td><td>' + safe(h.ofi_ev_approved_name) + '</td><td>' + safe(h.ofi_ev_approved_position) + '</td><td>' + safe(h.ofi_ev_approved_date) + '</td><td>' + safe(h.ofi_ev_approved_status) + '</td></tr>' +
      '</tbody></table></div>';

    // Attachments (two separate sections: Finding → new page, OFI Evidence → new page)
    var hasFinding = !!h.finding_attachment_url;
    var hasOFI     = !!h.ofi_evidence_url;
    var hasAtt     = hasFinding || hasOFI;

    var urlFind = JSON.stringify(h.finding_attachment_url || "");
    var urlOfi  = JSON.stringify(h.ofi_evidence_url       || "");

    var attachmentsHtml = '';
    if (hasAtt) {
      attachmentsHtml =
        // Section 1: Finding Attachment
        (hasFinding
          ? '<div class="section page-break-before att-block">' +
              '<div class="label">Attachments</div><div class="hr"></div>' +
              '<div class="label">Finding Attachment</div>' +
              '<div id="__att_find"></div>' +
            '</div>'
          : ''
        ) +
        // Section 2: OFI Evidence (always on a new page, independent block)
        (hasOFI
          ? '<div class="section page-break-before att-block">' +
              '<div class="label">Attachments</div><div class="hr"></div>' +
              '<div class="label">OFI Evidence</div>' +
              '<div id="__att_ofi"></div>' +
            '</div>'
          : ''
        ) +
        // Defer print & render PDFs
        '<script>window.__deferPrint=true;</script>' +
        '<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>' +
        '<script>' +
        '  try{pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";}catch(e){}' +
        '  async function renderTo(containerId, url){' +
        '    if(!url) return;' +
        '    try{' +
        '      const pdf=await pdfjsLib.getDocument({url:url}).promise;' +
        '      for(let p=1;p<=pdf.numPages;p++){' +
        '        const page=await pdf.getPage(p);' +
        '        const vp=page.getViewport({scale:1.2});' +
        '        const c=document.createElement("canvas"); c.width=vp.width; c.height=vp.height;' +
        '        await page.render({canvasContext:c.getContext("2d"), viewport:vp}).promise;' +
        '        const img=new Image(); img.src=c.toDataURL("image/png"); img.style.width="100%";' +
        '        img.style.pageBreakAfter=(p<pdf.numPages)?"always":"auto";' +
        '        document.getElementById(containerId).appendChild(img);' +
        '      }' +
        '    }catch(err){' +
        '      const d=document.getElementById(containerId);' +
        '      const msg=document.createElement("div"); msg.className="value";' +
        '      msg.innerHTML="Unable to inline this PDF. <a target=\\"_blank\\" href="+JSON.stringify(url)+">Open attachment</a>.";' +
        '      d.appendChild(msg);' +
        '    }' +
        '  }' +
        '  (async function(){' +
        (hasFinding ? ('    await renderTo("__att_find",' + urlFind + ');') : '') +
        (hasOFI     ? ('    await renderTo("__att_ofi",'  + urlOfi  + ');') : '') +
        '    window.__deferPrint=false; window.print();' +
        '  })();' +
        '</script>';
    }

    return (
'<!doctype html>' +
'<html><head><meta charset="utf-8"/>' +
'<title>Observation ' + safe(h.observation_no || "") + '</title>' +
'<style>' +
'  @page { size: A4; margin: 16mm; }' +
'  html, body { height: 100%; }' +
'  body { font: 12px Arial, Helvetica, sans-serif; color:#111; }' +
'  .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }' +
'  .brand { font-weight:700; letter-spacing:.5px; }' +
'  .title { font-size:16px; font-weight:700; text-align:right; }' +
'  .title img.logo-img { max-height: 36px; width:auto; object-fit:contain; }' +
'  .section { border:1px solid #ddd; border-radius:6px; padding:12px; margin:10px 0; }' +
'  .field { margin: 0 0 12px 0; }' +
'  .label { display:block; color:#555; font-weight:600; }' +
'  .value { display:block; margin-top:2px; white-space:pre-wrap; }' +
'  .hr { height:1px; background:#eee; margin:12px 0; }' +
'  table { width:100%; border-collapse:collapse; margin-top:6px; }' +
'  th, td { border:1px solid #e6e6e6; padding:6px 8px; text-align:left; }' +
'  th { background:#fafafa; font-weight:700; }' +
'  .page-break-before { page-break-before: always; break-before: page; }' +
'  .att-block { break-inside: avoid; page-break-inside: avoid; }' +
'  /* Footer shown on every page (no page numbers) */' +
'  .footer { position: fixed; left: 16mm; right: 16mm; bottom: 8mm; font-size: 10px; color:#666; text-align:center; }' +
'  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding-bottom: 22mm; } a { color:inherit; text-decoration:none; } }' +
'</style></head><body>' +

'<div class="header"><div class="brand">MUZAMAL • OBSERVATION REPORT</div>' +
  '<div class="title">' + (logoUrl ? ('<img class="logo-img" src="' + safe(logoUrl) + '" alt="Muzamal Logo">') : 'Overview') + '</div></div>' +

'<div class="section"><div class="stack">' + stacked + '</div></div>' +

'<div class="section"><div class="label">Approval / Acknowledgement</div><div class="hr"></div>' +
'<table><thead><tr><th>Role</th><th>Name</th><th>Position</th><th>Date</th><th>Status</th></tr></thead><tbody>' +
'  <tr><td>Issued By</td><td>'    + safe(h.issued_name)      + '</td><td>' + safe(h.issued_position)    + '</td><td>' + safe(h.issued_date)    + '</td><td>' + safe(h.issued_status)    + '</td></tr>' +
'  <tr><td>Reviewed By</td><td>'  + safe(h.reviewer_name)    + '</td><td>' + safe(h.reviewer_position)  + '</td><td>' + safe(h.reviewer_date)  + '</td><td>' + safe(h.reviewer_status)  + '</td></tr>' +
'  <tr><td>Approved By</td><td>'  + safe(h.approver_name)    + '</td><td>' + safe(h.approver_position)  + '</td><td>' + safe(h.approver_date)  + '</td><td>' + safe(h.approver_status)  + '</td></tr>' +
'  <tr><td>Assigned To</td><td>'  + safe(h.assigned_to)      + '</td><td>' + safe(h.assigned_position)  + '</td><td>' + safe(h.assigned_date)  + '</td><td>' + safe(h.assigned_status)  + '</td></tr>' +
'  <tr><td>Attention To</td><td>' + safe(h.attention_to)     + '</td><td>' + safe(h.attention_position) + '</td><td>' + safe(h.attention_date) + '</td><td>' + safe(h.attention_status) + '</td></tr>' +
'</tbody></table></div>' +

ofiCard + ofiAckTable + ofiVerify + ofiEvidence + attachmentsHtml +

'<!-- Repeating footer (copyright only, no page numbers) -->' +
'<div class="footer">© Muzamal Industries • All Rights Reserved • Muzamal Industries Sdn Bhd (137351-X)</div>' +

'<script>' +
// Default print on load, unless attachments are deferring it
'  window.addEventListener("load", function(){ if(!window.__deferPrint) setTimeout(function(){ window.print(); }, 250); });' +
'</script>' +
'</body></html>'
    );
  },

  // ────────────────────────────────────────────────────────────────────────────
  // 4) Open in new tab (Blob preferred; data URL fallback) — UNCHANGED
  printReport: function () {
    var html = this.html();
    var HasBlob = !!(window && window.Blob);
    var URLapi  = (window && (window.URL || window.webkitURL)) || null;

    if (HasBlob && URLapi) {
      var blob = new window.Blob([html], { type: "text/html" });
      var url  = URLapi.createObjectURL(blob);
      navigateTo(url, {}, "NEW_WINDOW");
      setTimeout(function(){ try { URLapi.revokeObjectURL(url); } catch(e) {} }, 60000);
    } else {
      var dataUrl = "data:text/html;charset=utf-8," + encodeURIComponent(html);
      navigateTo(dataUrl, {}, "NEW_WINDOW");
    }
  }
};
