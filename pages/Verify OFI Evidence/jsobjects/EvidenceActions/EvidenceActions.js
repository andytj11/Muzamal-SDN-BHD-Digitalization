export default {
  picker() { return FilePickerEvidence; }, // change if different
	
	// async uploadViaBrowser() {
    // const fid = ReviewActions.getFormId();
    // const f   = FilePickerEvidence.files?.[0];
    // if (!fid) { showAlert("No form loaded.", "warning"); return; }
    // if (!f)   { showAlert("Pick a file first.", "warning"); return; }
// 
    // // Convert FilePicker data-URL -> Blob -> File
    // const blob = await (await fetch(f.data)).blob();
    // const file = new File([blob], f.name, { type: f.type || "application/pdf" });
// 
    // const fd = new FormData();
    // fd.append("files", file); // FileBrowser accepts 'files' (or 'files[]')
// 
    // const url = `http://localhost:8182/api/resources/ofi/${encodeURIComponent(fid)}?override=true`;
    // const resp = await fetch(url, {
      // method: "POST",
      // headers: { "X-Auth": appsmith.store.FB_TOKEN },
      // body: fd
    // });
// 
    // if (!resp.ok) throw new Error(await resp.text());
    // showAlert("Evidence uploaded.", "success");
  // },

  _extractToken(raw) {
    try {
      if (!raw) return "";
      if (typeof raw === "string") return raw;
      if (Array.isArray(raw) && raw.length) {
        if (typeof raw[0] === "string") return raw[0];
        if (raw[0]?.response) return String(raw[0].response);
        if (raw[0]?.token)    return String(raw[0].token);
        if (raw[0]?.jwt)      return String(raw[0].jwt);
      }
      if (raw.response) return String(raw.response);
      if (raw.token)    return String(raw.token);
      if (raw.jwt)      return String(raw.jwt);
    } catch (_) {}
    return "";
  },

  async _login() {
    if (typeof FB_Login === "undefined") return ""; // no-auth mode
    const res = await FB_Login.run();
    const token = this._extractToken(res) || this._extractToken(FB_Login.data);
    if (!token) throw new Error("Missing token from /api/login");
    await storeValue("FB_TOKEN", token);
    return token;
  },

  async _ensureToken() {
    if (appsmith.store.FB_TOKEN) return appsmith.store.FB_TOKEN;
    return await this._login();
  },

  _rawUrl(fid, name) {
    return "http://host.docker.internal:8182/api/raw/ofi/" +
           encodeURIComponent(fid) + "/" + encodeURIComponent(name) + "?inline=true";
  },

  _statusCodeFromError(e) {
    // Appsmith sets responseMeta on thrown errors; fall back to parsing message
    const meta = e?.responseMeta;
    if (meta?.statusCode) return Number(meta.statusCode);
    const m = String(e?.message || e || "").match(/\b(\d{3})\b/);
    return m ? Number(m[1]) : 0;
  },

  async _runWithAuth(runFn, { ignore409=false } = {}) {
    try {
      return await runFn();
    } catch (e) {
      const code = this._statusCodeFromError(e);
      if (ignore409 && code === 409) return; // folder already exists → OK

      // If unauthorized, refresh token once and retry
      if (code === 401 || String(e).toLowerCase().includes("unauthorized")) {
        await storeValue("FB_TOKEN", undefined);
        await this._login();
        return await runFn();
      }
      throw e;
    }
  },

  // Bind this in FilePicker → onFilesSelected
  async onFilesSelected() {
    const fid = ReviewActions.getFormId();
    const f   = this.picker().files?.[0];

    if (!fid) { showAlert("No form loaded.", "warning"); return; }
    if (!f)   { showAlert("Please choose a file.", "warning"); return; }
    if (f.type !== "application/pdf") { showAlert("Only PDF is allowed.", "warning"); return; }

    // 1) Ensure token
    try { await this._ensureToken(); } catch { showAlert("Login failed.", "error"); return; }

    // 2) Ensure /ofi and /ofi/<form_id> exist
    await this._runWithAuth(async () => { await FB_Mkdir.run(); }, { ignore409: true });

    // 3) Upload file to /ofi/<form_id>
    await this._runWithAuth(async () => { await FB_UploadEvidence.run(); });

    // 4) Build final link and store it
    const url = this._rawUrl(fid, f.name);
    await storeValue("LAST_EVIDENCE_URL", url);
    showAlert("Evidence uploaded.", "success");
    return url;
  },
	
	async uploadViaBrowser() {
    const fid = ReviewActions.getFormId();
    const f   = FilePickerEvidence.files?.[0];
    if (!fid) { showAlert("No form loaded.", "warning"); return; }
    if (!f)   { showAlert("Please choose a file.", "warning"); return; }

    // Make sure we have a fresh token first (your existing _ensureToken() is fine)
    try { await this._ensureToken?.(); } catch { showAlert("Login failed.", "error"); return; }

    // Convert the FilePicker data-URL to a Blob, then to a File
    const blob = await (await fetch(f.data)).blob();
    const file = new File([blob], f.name, { type: f.type || "application/pdf" });

    // Build multipart/form-data
    const fd = new FormData();
    // FileBrowser accepts either 'files' or 'files[]' – use 'files' here
    fd.append("files", file);

    // POST directly from the browser
    const url = `http://localhost:8182/api/resources/ofi/${encodeURIComponent(fid)}?override=true`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "X-Auth": appsmith.store.FB_TOKEN },
      body: fd
    });

    if (!resp.ok) throw new Error(await resp.text());
    showAlert("Evidence uploaded.", "success");
    return await resp.text();
  }
};
