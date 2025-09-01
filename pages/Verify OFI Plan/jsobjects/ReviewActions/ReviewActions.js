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
  ofiLatest() {
    // Picks the newest OFI row (by updated_at → created_at → reply_date)
    const rows = (PlanReply_GetByForm.data || []).slice();
    if (!rows.length) return {};
    rows.sort((a,b) => {
      const va = moment(a.updated_at || a.created_at || a.reply_date).valueOf();
      const vb = moment(b.updated_at || b.created_at || b.reply_date).valueOf();
      return vb - va; // newest first
    });
    return rows[0] || {};
  },
  ofiText() {
    return (this.ofiLatest().reply_text || "").trim();
  },
  ofiTargetDate() {
    const r = this.ofiLatest();
    const d = r.target_date || r.reply_date;
    return d ? moment(d).format("YYYY-MM-DD") : "";
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

	/* -------------------- STATUS (GATED: bottom → top) -------------------- */
	computedStatus(){
		// Evaluate prerequisites from earliest stage upward
		const blueOK   = this.blueAttentionApproved();                       // blue acknowledged
		const blackOK  = this.isReviewerApproved() && this.isApproverApproved(); // plan approved (both)
		const yellowOK = this.isYellowReviewerApproved() && this.isYellowApproverApproved(); // evidence approved (both)

		if (!blueOK)   return "OPEN";                 // nothing can progress without blue
		if (!blackOK)  return "OFI APPROVED";         // blue done, plan not fully approved
		if (!yellowOK) return "OFI PLAN APPROVED";    // blue + black done, evidence not fully approved

		return "OFI EVIDENCE APPROVED";               // all stages satisfied
	},

	statusForHeader(){
		// Directly store the human-readable status string
		return this.computedStatus();
	},

	async syncHeaderStatus(){
		const fid = this.getFormId();
		if (!fid) return;

		const desired = this.statusForHeader();        // gated result
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
