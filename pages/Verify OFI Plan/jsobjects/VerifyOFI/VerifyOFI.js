export default {
  /* -------------------- Where we read the observation no -------------------- */
  obsNo() {
    return (
      (appsmith.URL.queryParams.obs || "").trim() ||
      (typeof ObservationNoInput !== "undefined"
        ? (ObservationNoInput.text || "").trim()
        : "") ||
      (ObservationForms_ByNo.data?.[0]?.observation_no || "")
    );
  },

  /* -------------------- Header helpers -------------------- */
  header() { return ObservationForms_ByNo.data?.[0] || {}; },
  getFormId() { return this.header().form_id || ""; },

  /* Cache for plan rows so UI never blanks while queries re-run */
  _planRows: [],

  /* -------------------- Users lookup (positions) -------------------- */
  _userIx: null,
  _norm(s){ return String(s ?? "").replace(/\s+/g," ").trim().toLowerCase(); },
  _buildUserIndex(){
    const ix = {};
    (Users_GetAll.data || []).forEach(u=>{
      const idKey   = this._norm(u.id ?? u.user_id);
      const nameKey = this._norm(u.name);
      const emailKey= this._norm(u.email);
      if (idKey)    ix["id:"+idKey]      = u;
      if (nameKey)  ix["name:"+nameKey]  = u;
      if (emailKey) ix["email:"+emailKey]= u;
    });
    this._userIx = ix;
    return ix;
  },
  _getUserByIdOrName(userId, name){
    const ix = this._userIx || this._buildUserIndex();
    const idKey = this._norm(userId);
    if (idKey && ix["id:"+idKey]) return ix["id:"+idKey];

    if (userId) {
      const digits = String(userId).match(/\d+/g);
      if (digits) {
        const compact = String(parseInt(digits.join(""),10));
        if (ix["id:"+compact]) return ix["id:"+compact];
      }
    }
    const nameKey = this._norm(name);
    if (nameKey && ix["name:"+nameKey]) return ix["name:"+nameKey];
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

  /* -------------------- Sign-offs (formsignedoff) -------------------- */
  signoffs(){ return Approvals_GetByForm.data || []; },

  // Latest row by stage+role (optionally only rows with comment)
  _latestRow(stage, role, onlyComment=false){
    const rows=(this.signoffs()||[]).filter(r =>
      (r.stage||"")===stage &&
      (r.role||"")===role &&
      (!onlyComment || (String(r.comment||"").trim()!==""))
    );
    if(!rows.length) return {};
    return _.maxBy(rows,r=>moment(r.approved_at||r.commented_at||r.created_at).valueOf())||{};
  },

  latest(stage, role){ return this._latestRow(stage,role,false); },

  // === Black stage helpers ===
  isReviewerApproved(){
    return (this._latestRow("black","reviewer").decision||"").toLowerCase()==="approved";
  },
  isApproverApproved(){
    return (this._latestRow("black","approver").decision||"").toLowerCase()==="approved";
  },
  isBlackApproved(role){
    return (this._latestRow("black", role).decision || "").toLowerCase() === "approved";
  },

  // Prefill the comment boxes (latest black-stage comment per role)
  blackLatestComment(role){
    return this._latestRow("black", role, true).comment || "";
  },
  blackLatestCommentDate(role, fmt="YYYY-MM-DD HH:mm:ss"){
    const row = this._latestRow("black", role, true);
    const m = moment(row.commented_at || row.created_at);
    return m.isValid() ? m.format(fmt) : "";
  },

  // === Blue attention status (used in status computation) ===
  blueAttentionApproved(){
    return (this._latestRow("blue","attention_to").decision||"").toLowerCase()==="approved";
  },
  attentionOfiStatus(){
    const d=(this._latestRow("blue","attention_to").decision||"").toLowerCase();
    if(d==="approved") return "Approved";
    if(d==="not approved") return "Not Approved";
    return "Pending";
  },
  assigneeOfiStatus(){
    if(this.blueAttentionApproved()) return "Approved";
    const d=(this._latestRow("blue","attention_to").decision||"");
    return d ? "Not Approved" : "Pending";
  },

  /* -------------------- OFI plan (planreply) -------------------- */
  plans(){
    return (this._planRows && this._planRows.length)
      ? this._planRows
      : (PlanReply_GetByForm.data || []);
  },
  latestPlan(){
    const rows=this.plans();
    if(!rows.length) return {};
    const score=r=>{
      const m1=r.updated_at    ? moment(r.updated_at)    : null;
      const m2=r.created_at    ? moment(r.created_at)    : null;
      const m3=r.reply_by_date ? moment(r.reply_by_date) : null;
      return (m1&&m1.isValid()&&+m1) || (m2&&m2.isValid()&&+m2) || (m3&&m3.isValid()&&+m3) || 0;
    };
    return _.maxBy(rows,score)||{};
  },
  ofiText(){ return this.latestPlan().ofi_text || ""; },
  ofiTargetDate(){
    const d=this.latestPlan().target_date;
    return d ? moment(d).format("YYYY-MM-DD") : "";
  },

  /* -------------------- Page bootstrap & refresh chain -------------------- */
  async init(){
    await Users_GetAll.run();
    const currentObs=this.obsNo();
    if(!currentObs) return;
    await this.refresh();
  },

  async refresh(){
    await ObservationForms_ByNo.run();

    const fid=this.getFormId();
    if(!fid){
      this._planRows=[];
      try { OFIInfo?.setValue?.(""); } catch(_) {}
      try { OFITargetDate?.setValue?.(""); } catch(_) {}
      return;
    }

    await Approvals_GetByForm.run({ form_id: fid });
    await PlanReply_GetByForm.run();

    this._planRows = _.cloneDeep(PlanReply_GetByForm.data || []);
    try { OFIInfo?.setValue?.(this.ofiText()); } catch(_) {}
    try { OFITargetDate?.setValue?.(this.ofiTargetDate()); } catch(_) {}

    await this.syncHeaderStatus();
  },

  /* -------------------- AUTH helpers for the BLACK box -------------------- */
  _pwWidgetBlack(role){
    const map = {
      reviewer:  (typeof BlackReviewerPassword !== "undefined") ? BlackReviewerPassword : undefined,
      approver:  (typeof BlackApproverPassword !== "undefined") ? BlackApproverPassword : undefined
    };
    return map[role];
  },
  _commentWidgetBlack(role){
    const map = {
      reviewer: (typeof ReviewerComment !== "undefined") ? ReviewerComment : undefined,
      approver: (typeof ApproverComment !== "undefined") ? ApproverComment : undefined
    };
    return map[role];
  },
  _enteredBlackPassword(role){
    const w = this._pwWidgetBlack(role);
    return w ? (w.text || "").trim() : "";
  },
  _resetBlackInputs(role){
    try {
      const pw = this._pwWidgetBlack(role);
      if (pw?.widgetName) resetWidget(pw.widgetName, true);
      const cmt = this._commentWidgetBlack(role);
      if (cmt?.widgetName) resetWidget(cmt.widgetName, true);
    } catch(_) {}
  },
  async _requireBlackAuth(role){
    const pw = this._enteredBlackPassword(role);
    if (!pw) { showAlert("Please enter your password.", "warning"); return false; }

    const h = this.header();
    const uid = role === "reviewer" ? (h.reviewer_user_id || "") : (h.approver_user_id || "");
    try { await Auth_GetByUser.run({ user_id: uid }); } catch(_) {}
    const rec = (Auth_GetByUser.data && Auth_GetByUser.data[0]) || {};
    const ok  = pw === (rec.password_plain || "");
    if (!ok) { showAlert("Authentication failed. Please check your password.", "error"); }
    return ok;
  },

  /* -------------------- Actions in black box (AUTH ENFORCED) -------------------- */
  async approve(role){
    const fid=this.getFormId();
    if(!fid){ showAlert("No observation loaded.","error"); return; }

    // Password check
    const authed = await this._requireBlackAuth(role);
    if (!authed) return;

    const h=this.header();
    const who = role==="reviewer"
      ? { id:h.reviewer_user_id, name:h.reviewer_name, position:this.reviewerPosition() }
      : { id:h.approver_user_id, name:h.approver_name, position:this.approverPosition() };

    if(!who.position){
      showAlert(`Position not found for ${role}. Check users table.`,"error");
      return;
    }

    await Approvals_InsertOne.run({
      form_id: fid,
      stage: "black",
      role,
      required_user_id:   who.id || "",
      required_user_name: who.name || "",
      name:               who.name || "",
      position:           who.position || "",
      action_date:        moment().format("YYYY-MM-DD"),
      decision:           "Approved",
      comment:            "",
      approved_at:        moment().format("YYYY-MM-DD HH:mm:ss"),
      commented_at:       "",
      signed_by_user_id:  appsmith.user.email,
      created_at:         moment().format("YYYY-MM-DD HH:mm:ss"),
      updated_at:         moment().format("YYYY-MM-DD HH:mm:ss")
    });

    this._resetBlackInputs(role);
    await Approvals_GetByForm.run({ form_id: fid });
    await this.syncHeaderStatus();
    showAlert(`${_.startCase(role)} approved OFI plan.`,"success");
  },

  // Optional resetWidgetName remains supported; if omitted we reset via mapping.
  async comment(role, commentText, resetWidgetName){
    const fid=this.getFormId();
    if(!fid){ showAlert("No observation loaded.","error"); return; }

    // Password check
    const authed = await this._requireBlackAuth(role);
    if (!authed) return;

    const text=(commentText||"").trim();
    if(!text){ showAlert("Please enter a comment.","warning"); return; }

    const h=this.header();
    const who = role==="reviewer"
      ? { id:h.reviewer_user_id, name:h.reviewer_name, position:this.reviewerPosition() }
      : { id:h.approver_user_id, name:h.approver_name, position:this.approverPosition() };

    await Approvals_InsertOne.run({
      form_id: fid,
      stage: "black",
      role,
      required_user_id:   who.id || "",
      required_user_name: who.name || "",
      name:               who.name || "",
      position:           who.position || "",
      action_date:        "",
      decision:           "Not Approved",
      comment:            text,
      approved_at:        "",
      commented_at:       moment().format("YYYY-MM-DD HH:mm:ss"),
      signed_by_user_id:  appsmith.user.email,
      created_at:         moment().format("YYYY-MM-DD HH:mm:ss"),
      updated_at:         moment().format("YYYY-MM-DD HH:mm:ss")
    });

    await Approvals_GetByForm.run({ form_id: fid });

    if (resetWidgetName) {
      try { resetWidget(resetWidgetName, true); } catch(_) {}
    } else {
      this._resetBlackInputs(role);
    }

    await this.syncHeaderStatus();
    showAlert(`${_.startCase(role)} comment submitted.`,"success");
  },

  /* -------------------- Status logic & sync -------------------- */
  computedStatus(){
    if (this.isReviewerApproved() && this.isApproverApproved()) return "OFI_PLAN_APPROVED";
    if (this.blueAttentionApproved()) return "OFI_APPROVED";
    return "OPEN";
  },

  // Map the display code to what you want stored in the sheet
  statusForHeader(){
    const code = this.computedStatus();
    if (code === "OFI_APPROVED")       return "OFI APPROVED";
    if (code === "OFI_PLAN_APPROVED")  return "OFI PLAN APPROVED";
    return "OPEN";
  },

  async syncHeaderStatus() {
    const fid = this.getFormId();
    if (!fid) return;

    const desired = this.statusForHeader();
    const current = this.header().status || "";
    if (!desired || desired === current) return;

    await ObservationForms_FindRowIndex.run({ form_id: fid });
    const idx = ObservationForms_FindRowIndex.data?.[0]?.rowIndex;
    if (idx === undefined || idx === null || Number.isNaN(Number(idx))) return;

    await ObservationForms_UpdateByIndex.run({ rowIndex: idx, status: desired });
    await ObservationForms_ByNo.run();
  }
};
