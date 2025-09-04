export default {
  // Your FilePicker widget name; change if different
  picker() { return FilePickerEvidence; },

  // Decode token from /api/login (your env returns [{response:"<jwt>"}])
  _extractToken(res) {
    try {
      if (Array.isArray(res) && res[0]?.response) return res[0].response;
      if (res?.token) return res.token;
    } catch (_) {}
    return "";
  },

  async _ensureLoginIfNeeded() {
    // If you run FileBrowser without auth (FB_NOAUTH=true), you can return early.
    if (appsmith.store.FB_TOKEN) return appsmith.store.FB_TOKEN;
    if (typeof FB_Login === "undefined") return ""; // no-auth scenario

    const res = await FB_Login.run();
    const token = this._extractToken(res);
    if (!token) {
      showAlert("Login to Evidence store failed.", "error");
      throw new Error("Missing token from /api/login");
    }
    await storeValue("FB_TOKEN", token);
    return token;
  },

  _rawUrl(formId, name) {
    // Direct-bytes endpoint that works in your instance
    return "http://host.docker.internal:8182/api/raw/ofi/" +
           encodeURIComponent(formId) + "/" +
           encodeURIComponent(name) + "?inline=true";
  },

  // === MAIN ENTRY: bind this to the FilePicker's onFilesSelected ===
  async onFilesSelected() {
    const fid = ReviewActions.getFormId();
    const f = this.picker().files?.[0];

    if (!fid) { showAlert("No form loaded.", "warning"); return; }
    if (!f)   { showAlert("Please choose a file.", "warning"); return; }
    if (f.type !== "application/pdf") { showAlert("Only PDF is allowed.", "warning"); return; }

    // 1) Silent login if auth enabled
    await this._ensureLoginIfNeeded();

    // 2) Ensure parent folder exists (ignore 409/conflict if it already exists)
    try { if (typeof FB_Mkdir !== "undefined") await FB_Mkdir.run(); } catch (_) {}

    // 3) Upload to FileBrowser (multipart; query reads FilePickerEvidence.files[0])
    await FB_UploadEvidence.run();

    // 4) Build the permanent URL and keep it somewhere handy
    const url = this._rawUrl(fid, f.name);
    await storeValue("LAST_EVIDENCE_URL", url);

    showAlert("Evidence uploaded.", "success");

    // Optionally return the URL so calling code can use it
    return url;
  }
};
