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
