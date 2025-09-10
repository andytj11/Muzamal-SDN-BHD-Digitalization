export default {
  /* -------------------- OBS / HEADER -------------------- */
  obsNo() {
    return (
      (appsmith.URL.queryParams.obs || "").trim() ||
      (typeof ObservationNoInput !== "undefined"
        ? (ObservationNoInput.text || "").trim()
        : "") ||
      (ObservationForms_ByNo.data?.[0]?.observation_no || "")
    );
  },
  header() { return ObservationForms_ByNo.data?.[0] || {}; },
  getFormId() { return this.header().form_id || ""; },

  /* -------------------- USERS (positions) -------------------- */
  _userIx: null,
  _norm(s){ return String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase(); },
  _buildUserIndex(){
    const ix = {};
    (Users_GetAll.data || []).forEach(u=>{
      const idK   = this._norm(u.id ?? u.user_id);
      const nameK = this._norm(u.name);
      const mailK = this._norm(u.email);
      if (idK)   ix["id:"+idK] = u;
      if (nameK) ix["name:"+nameK] = u;
      if (mailK) ix["email:"+mailK] = u;
    });
    this._userIx = ix;
    return ix;
  },
  _getUserByIdOrName(userId, name){
    const ix = this._userIx || this._buildUserIndex();
    const idK = this._norm(userId);
    if (idK && ix["id:"+idK]) return ix["id:"+idK];
    if (userId) {
      const d = String(userId).match(/\d+/g);
      if (d) {
        const compact = String(parseInt(d.join(""),10));
        if (ix["id:"+compact]) return ix["id:"+compact];
      }
    }
    const nameK = this._norm(name);
    if (nameK && ix["name:"+nameK]) return ix["name:"+nameK];
    return {};
  },
  _pos(u){ return u.position || u.title || u.role || ""; },

  reviewerName(){ return this.header().reviewer_name  || ""; },
  approverName(){ return this.header().approver_name  || ""; },
  reviewerPosition(){
    const h=this.header();
    const u=this._getUserByIdOrName(h.reviewer_user_id,h.reviewer_name);
    return this._pos(u);
  },
  approverPosition(){
    const h=this.header();
    const u=this._getUserByIdOrName(h.approver_user_id,h.approver_name);
    return this._pos(u);
  },

  /* -------------------- SIGNOFFS COMMON -------------------- */
  signoffs(){ return Approvals_GetByForm.data || []; },
  latest(stage, role){
    const rows=this.signoffs().filter(r=>(r.stage||"")===stage && (r.role||"")===role);
    if(!rows.length) return {};
    return _.maxBy(rows, r => moment(r.approved_at || r.commented_at || r.created_at).valueOf()) || {};
  },

  /* ---------- BLUE (OFI) ACK ---------- */
  blueAttentionApproved(){
    return (this.latest("blue", "attention_to").decision || "").toLowerCase()==="approved";
  },
  attentionOfiStatus(){
    const d=(this.latest("blue","attention_to").decision||"").toLowerCase();
    if(d==="approved") return "Approved";
    if(d==="not approved") return "Not Approved";
    return "Pending";
  },
  assigneeOfiStatus(){
    if(this.blueAttentionApproved()) return "Approved";
    const d=(this.latest("blue","attention_to").decision||"");
    return d ? "Not Approved" : "Pending";
  },

  /* ---------- BLACK (PLAN VERIFY) ---------- */
  isReviewerApproved(){  // black reviewer
    return (this.latest("black","reviewer").decision||"").toLowerCase()==="approved";
  },
  isApproverApproved(){  // black approver
    return (this.latest("black","approver").decision||"").toLowerCase()==="approved";
  },

  async approve(role){ // black approve
    const fid=this.getFormId();
    if(!fid){ showAlert("No observation loaded.","error"); return; }
    const h=this.header();
    const who = role==="reviewer"
      ? { id:h.reviewer_user_id, name:h.reviewer_name, position:this.reviewerPosition() }
      : { id:h.approver_user_id, name:h.approver_name, position:this.approverPosition() };
    if(!who.position){
      showAlert(`Position not found for ${role}. Check users table.`,"error");
      return;
    }
    await Approvals_InsertOne.run({
      form_id: fid, stage:"black", role,
      required_user_id: who.id || "", required_user_name: who.name || "",
      name: who.name || "", position: who.position || "",
      action_date: moment().format("YYYY-MM-DD"),
      decision:"Approved", comment:"",
      approved_at: moment().format("YYYY-MM-DD HH:mm:ss"),
      commented_at:"", signed_by_user_id: appsmith.user.email,
      created_at: moment().format("YYYY-MM-DD HH:mm:ss"),
      updated_at: moment().format("YYYY-MM-DD HH:mm:ss")
    });
    await Approvals_GetByForm.run({ form_id: fid });
    await this.syncHeaderStatus();
  },

  async comment(role, text){ // black comment
    const fid=this.getFormId();
    if(!fid){ showAlert("No observation loaded.","error"); return; }
    const c=(text||"").trim(); if(!c){ showAlert("Please enter a comment.","warning"); return; }
    const h=this.header();
    const who = role==="reviewer"
      ? { id:h.reviewer_user_id, name:h.reviewer_name, position:this.reviewerPosition() }
      : { id:h.approver_user_id, name:h.approver_name, position:this.approverPosition() };
    await Approvals_InsertOne.run({
      form_id: fid, stage:"black", role,
      required_user_id: who.id || "", required_user_name: who.name || "",
      name: who.name || "", position: who.position || "",
      action_date:"", decision:"Not Approved", comment:c,
      approved_at:"", commented_at: moment().format("YYYY-MM-DD HH:mm:ss"),
      signed_by_user_id: appsmith.user.email,
      created_at: moment().format("YYYY-MM-DD HH:mm:ss"),
      updated_at: moment().format("YYYY-MM-DD HH:mm:ss")
    });
    await Approvals_GetByForm.run({ form_id: fid });
    await this.syncHeaderStatus();
  },

  /* ---------- OFI CONTENT (latest row from planreply) ---------- */
  /** Return only OFI rows for the current form_id */
  ofiRows() {
    const fid = this.getFormId();
    const rows = (PlanReply_GetByForm.data || []).filter(r => {
      const rid = String(r.form_id || "").trim();
      return fid && rid && rid.toLowerCase() === String(fid).toLowerCase();
    });
    return rows;
  },

  /** Pick newest OFI row (updated_at > created_at > reply_date/target_date) */
  ofiLatest() {
    const rows = this.ofiRows().slice();
    if (!rows.length) return {};
    return _.maxBy(
      rows,
      r => moment(
        r.updated_at || r.created_at || r.reply_date || r.target_date
      ).valueOf()
    ) || {};
  },

  /** Target date (falls back to reply_date if needed). Also checks store so UI updates instantly. */
  ofiTargetDate() {
    const fid = this.getFormId();
    const fromStore = (appsmith.store?.OFI_TARGET_BY_FORM || {})[fid];
    if (fromStore) return moment(fromStore).isValid() ? moment(fromStore).format("YYYY-MM-DD") : String(fromStore);
    const r = this.ofiLatest();
    const d = r.target_date || r.reply_date;
    return d ? moment(d).format("YYYY-MM-DD") : "";
  },

  /** Text of OFI (supports both ofi_text and older reply_text) */
  ofiText() {
    const r = this.ofiLatest();
    return (r.ofi_text || r.reply_text || "").trim();
  },

  /* ---------- New: save target date from DatePicker ------------------------ */
  _fmtDate(v){
    if (!v) return "";
    try {
      // Accept Date object, ISO string, or YYYY-MM-DD
      let m = moment(v);
      if (!m.isValid() && typeof v === "string") {
        const dayOnly = v.split("T")[0];
        m = moment(dayOnly, ["YYYY-MM-DD","DD/MM/YYYY","MM/DD/YYYY", moment.ISO_8601], true);
        if (!m.isValid()) m = moment(v); // last resort parse
      }
      return m.isValid() ? m.format("YYYY-MM-DD") : "";
    } catch(_) { return ""; }
  },
  _findQuery(candidates){
    for (const name of candidates) {
      const q = (typeof globalThis !== "undefined") ? globalThis[name] : undefined;
      if (q && typeof q.run === "function") return q;
    }
    return null;
  },
  async saveTargetDate(rawDate){
    const fid = this.getFormId();
    if (!fid) { showAlert("No observation loaded.","error"); return; }

    // Prefer the param; fall back to widget value if present
    const picked = rawDate || (typeof TargetDateInput !== "undefined" ? TargetDateInput.selectedDate : "");
    const d = this._fmtDate(picked);
    if (!d) { showAlert("Please select a valid date.","warning"); return; }

    // Persist to backend if a suitable query exists; otherwise cache in store
    const now = moment().format("YYYY-MM-DD HH:mm:ss");
    const q = this._findQuery([
      "PlanReply_UpsertTargetDate",
      "PlanReply_SaveTargetDate",
      "PlanReply_UpsertOne",
      "PlanReply_InsertOne",
      "PlanReply_Save",
      "PlanReply_Insert"
    ]);

    if (q) {
      // Try common field names; swallow secondary failure quietly (works across Sheet/DB variants)
      try {
        await q.run({ form_id: fid, target_date: d, updated_at: now, created_at: now });
      } catch(e1) {
        try {
          await q.run({ Form_ID: fid, Target_Date: d, Updated_At: now, Created_At: now });
        } catch(e2) {
          throw e1; // bubble first error if none of the shapes work
        }
      }
    }

    // Always cache in store for instant UI feedback and cross‑page reuse
    const map = Object.assign({}, appsmith.store?.OFI_TARGET_BY_FORM || {});
    map[fid] = d;
    await storeValue("OFI_TARGET_BY_FORM", map, true);

    // Refresh the source used by ofiTargetDate()
    try { await PlanReply_GetByForm.run({ form_id: fid }); } catch(_) {}

    showAlert("Target date saved.", "success");
  },

  /* ---------- YELLOW (EVIDENCE VERIFY) ---------- */
  isYellowReviewerApproved(){
    return (this.latest("yellow","reviewer").decision||"").toLowerCase()==="approved";
  },
  isYellowApproverApproved(){
    return (this.latest("yellow","approver").decision||"").toLowerCase()==="approved";
  },

  async approveYellow(role){
    const fid=this.getFormId();
    if(!fid){ showAlert("No observation loaded.","error"); return; }
    const h=this.header();
    const who = role==="reviewer"
      ? { id:h.reviewer_user_id, name:h.reviewer_name, position:this.reviewerPosition() }
      : { id:h.approver_user_id, name:h.approver_name, position:this.approverPosition() };
    if(!who.position){
      showAlert(`Position not found for ${role}. Check users table.`,"error");
      return;
    }
    await Approvals_InsertOne.run({
      form_id: fid, stage:"yellow", role,
      required_user_id: who.id || "", required_user_name: who.name || "",
      name: who.name || "", position: who.position || "",
      action_date: moment().format("YYYY-MM-DD"),
      decision:"Approved", comment:"",
      approved_at: moment().format("YYYY-MM-DD HH:mm:ss"),
      commented_at:"", signed_by_user_id: appsmith.user.email,
      created_at: moment().format("YYYY-MM-DD HH:mm:ss"),
      updated_at: moment().format("YYYY-MM-DD HH:mm:ss")
    });
    await Approvals_GetByForm.run({ form_id: fid });
    await this.syncHeaderStatus();
  },

  // (Augmented) accepts optional resetWidgetName to force re-read default after submit
  async commentYellow(role, text, resetWidgetName){
    const fid=this.getFormId();
    if(!fid){ showAlert("No observation loaded.","error"); return; }
    const c=(text||"").trim(); if(!c){ showAlert("Please enter a comment.","warning"); return; }
    const h=this.header();
    const who = role==="reviewer"
      ? { id:h.reviewer_user_id, name:h.reviewer_name, position:this.reviewerPosition() }
      : { id:h.approver_user_id, name:h.approver_name, position:this.approverPosition() };
    await Approvals_InsertOne.run({
      form_id: fid, stage:"yellow", role,
      required_user_id: who.id || "", required_user_name: who.name || "",
      name: who.name || "", position: who.position || "",
      action_date:"", decision:"Not Approved", comment:c,
      approved_at:"", commented_at: moment().format("YYYY-MM-DD HH:mm:ss"),
      signed_by_user_id: appsmith.user.email,
      created_at: moment().format("YYYY-MM-DD HH:mm:ss"),
      updated_at: moment().format("YYYY-MM-DD HH:mm:ss")
    });
    await Approvals_GetByForm.run({ form_id: fid });

    // re-evaluate default text after saving a comment
    if (resetWidgetName) { try { resetWidget(resetWidgetName, true); } catch(_) {} }

    await this.syncHeaderStatus();
  },

  /* -------------------- STATUS (ORDERED) -------------------- */
  computedStatus(){
    if (this.isYellowReviewerApproved() && this.isYellowApproverApproved()) {
      return "OFI EVIDENCE APPROVED";
    }
    if (this.isReviewerApproved() && this.isApproverApproved()) {
      return "OFI PLAN APPROVED";
    }
    if (this.blueAttentionApproved()) {
      return "OFI APPROVED";
    }
    return "OPEN";
  },
  statusForHeader(){
    return this.computedStatus();
  },

  async syncHeaderStatus(){
    const fid = this.getFormId();
    if(!fid) return;
    const desired = this.statusForHeader();
    const current = this.header().status || "";
    if (!desired || desired === current) return;

    await ObservationForms_FindRowIndex.run({ form_id: fid });
    const idx = ObservationForms_FindRowIndex.data?.[0]?.rowIndex;
    if (idx === undefined || idx === null || Number.isNaN(Number(idx))) return;

    await ObservationForms_UpdateByIndex.run({ rowIndex: idx, status: desired });
    await ObservationForms_ByNo.run();
  },

  /* -------------------- INIT / REFRESH -------------------- */
  async init(){
    await Users_GetAll.run();
    const currentObs=this.obsNo();
    if(!currentObs) return;
    await this.refresh();
  },
  async refresh(){
    await ObservationForms_ByNo.run();
    const fid=this.getFormId();
    if(!fid) return;
    await Approvals_GetByForm.run({ form_id: fid });
    await PlanReply_GetByForm.run();
    await this.syncHeaderStatus();
  },

  /* =========================
   *  APPENDED HELPERS (yellow)
   * ========================= */

  // latest row with a non-empty comment for given stage/role
  _latestCommentRow(stage, role) {
    const rows = (this.signoffs() || []).filter(r =>
      (r.stage || "") === stage &&
      (r.role  || "") === role &&
      String(r.comment || "").trim() !== ""
    );
    if (!rows.length) return {};
    return _.maxBy(rows, r => moment(r.commented_at || r.created_at).valueOf()) || {};
  },

  // default text for reviewer/approver yellow comment boxes
  yellowLatestComment(role) {
    return this._latestCommentRow("yellow", role).comment || "";
  },
  yellowLatestCommentDate(role, fmt="YYYY-MM-DD HH:mm:ss") {
    const row = this._latestCommentRow("yellow", role);
    const m = moment(row.commented_at || row.created_at);
    return m.isValid() ? m.format(fmt) : "";
  },

  // convenience: has this yellow role already approved?
  isYellowApproved(role){
    return (this.latest("yellow", role).decision || "").toLowerCase() === "approved";
  }
};
