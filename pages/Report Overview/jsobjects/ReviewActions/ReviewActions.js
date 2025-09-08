export default {
  header(){ return ObservationForms_ByNo.data?.[0] || {}; },
  signoffs(){ return Approvals_GetByForm.data || []; },
  _norm(s){ return String(s ?? "").replace(/\s+/g," ").trim().toLowerCase(); },

  _latest(stage, role){
    const rows=(this.signoffs()||[]).filter(r =>
      this._norm(r.stage)===this._norm(stage) && this._norm(r.role)===this._norm(role)
    );
    if(!rows.length) return {};
    return _.maxBy(rows, r => moment(r.approved_at || r.commented_at || r.created_at).valueOf()) || {};
  },
	
	// ReviewActions
	getFormId() {
		// header() already returns the current row from ObservationForms_ByNo
		const h = this.header ? (this.header() || {}) : {};
		// Prefer form_id from the query row. Fall back to URL ?id= or store.
		const fromHeader = String(h.form_id || h.formid || h.id || "").trim();
		const fromQuery  = String(appsmith?.URL?.queryParams?.id || appsmith?.URL?.queryParams?.form_id || "").trim();
		const fromStore  = String(appsmith?.store?.CURRENT_FORM_ID || "").trim();
		const id = fromHeader || fromQuery || fromStore;

		// (Optional) keep it in store so other JS can reuse it
		if (id && appsmith.store?.CURRENT_FORM_ID !== id) { storeValue("CURRENT_FORM_ID", id, true); }

		return id;           // e.g., "F7014"
	},

  isYellowReviewerApproved(){ return this._norm(this._latest("yellow","reviewer").decision)==="approved"; },
  isYellowApproverApproved(){ return this._norm(this._latest("yellow","approver").decision)==="approved"; },

  isReviewerApproved(){  return this._norm(this._latest("black","reviewer").decision)==="approved"; },
  isApproverApproved(){  return this._norm(this._latest("black","approver").decision)==="approved"; },
  blueAttentionApproved(){ return this._norm(this._latest("blue","attention_to").decision)==="approved"; },

  /* -------------------- STATUS (GATED: bottom → top) -------------------- */
	computedStatus(){
		const blueOK   = this.blueAttentionApproved();
		const blackOK  = this.isReviewerApproved() && this.isApproverApproved();
		const yellowOK = this.isYellowReviewerApproved() && this.isYellowApproverApproved();

		if (!blueOK)   return "OPEN";                 // nothing can progress without blue
		if (!blackOK)  return "OFI APPROVED";         // blue done, plan not fully approved
		if (!yellowOK) return "OFI PLAN APPROVED";    // blue + black done, evidence not fully approved

		return "OFI EVIDENCE APPROVED";               // all stages satisfied
	},
	statusForHeader(){
		return this.computedStatus(); // unchanged
	}

};
