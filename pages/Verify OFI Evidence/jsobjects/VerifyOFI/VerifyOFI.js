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

  /* ---------- YELLOW (EVIDENCE VERIFY)  ---------- */
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
  async commentYellow(role, text){
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
    await this.syncHeaderStatus();
  },

  /* -------------------- STATUS (ORDERED) -------------------- */
  computedStatus(){
    // Highest priority: Yellow (evidence) both approved
    if (this.isYellowReviewerApproved() && this.isYellowApproverApproved()) {
      return "OFI EVIDENCE APPROVED";
    }
    // Next: Black (plan) both approved
    if (this.isReviewerApproved() && this.isApproverApproved()) {
      return "OFI PLAN APPROVED";
    }
    // Next: Blue attention approved
    if (this.blueAttentionApproved()) {
      return "OFI APPROVED";
    }
    // Optionally you can keep FINDING APPROVED or OPEN below if you still use red
    return "OPEN";
  },
  statusForHeader(){
    return this.computedStatus(); // mapped already as plain text
  },

  async syncHeaderStatus(){
    const fid = this.getFormId();
    if(!fid) return;
    const desired = this.statusForHeader();
    const current = this.header().status || "";
    if (!desired || desired === current) return;

    // Find row index for this form_id, then update by rowIndex
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
  }
};
