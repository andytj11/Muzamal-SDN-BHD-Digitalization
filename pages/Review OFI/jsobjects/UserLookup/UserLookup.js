export default {
  // Build a small index so lookups are fast and tolerant of different key names
  _ix: null,

  _build() {
    const rows = Users_GetAll.data || [];
    this._ix = {};
    rows.forEach(u => {
      // accept multiple possible id fields
      const keys = [
        u.user_id, u.id, u.ID, u.emp_id, u.employee_id, u.email
      ].filter(v => v !== undefined && v !== null);

      keys.forEach(k => {
        const key = String(k).trim().toLowerCase();
        if (key) this._ix[key] = u;
      });
    });
  },

  _get(id) {
    if (!this._ix) this._build();
    const key = String(id ?? "").trim().toLowerCase();
    return this._ix[key] || {};
  },

  name(id)     { return this._get(id).name || ""; },
  position(id) {
    const u = this._get(id);
    // prefer explicit position, fall back to role/title if your sheet uses those
    return u.position || u.title || u.role || "";
  }
};
