export default {
  cfg: {
    base: "http://localhost:8185",   // nginx CORS proxy to Nextcloud:8186
    user: "admin",
    pass: "admin"
  },
  _auth(){ return "Basic " + btoa(this.cfg.user + ":" + this.cfg.pass); },
  _enc(s){ return encodeURIComponent(s); },

  async upload () {
    const fid = ReviewActions.getFormId?.();
    const f   = FilePickerEvidence.files?.[0];
    if (!fid || !f) { showAlert("Missing form or file", "warning"); return; }

    // turn FilePicker data URL -> Blob (no 'new File' = no linter error)
    const blob = await (await fetch(f.data)).blob();

    // ensure /ofi/<fid>/ exists
    const folder = `/remote.php/dav/files/${this._enc(this.cfg.user)}/ofi/${this._enc(fid)}/`;
    await fetch(this.cfg.base + folder, {
      method: "MKCOL",
      headers: { Authorization: this._auth() }
    }).catch(() => {});  // ignore if already exists

    // PUT the file
    const put = await fetch(this.cfg.base + folder + this._enc(f.name), {
      method: "PUT",
      headers: {
        Authorization: this._auth(),
        "Content-Type": f.type || "application/octet-stream"
      },
      body: blob
    });
    if (!put.ok) {
      const txt = await put.text().catch(() => "");
      throw new Error(`Upload failed (${put.status}). ${txt}`);
    }

    // remember last uploaded file per form id (persisted)
    const map = Object.assign({}, appsmith.store.NC_LAST_UPLOADS || {});
    map[fid] = f.name;
    await storeValue("NC_LAST_UPLOADS", map);
    await storeValue("NC_LAST_FILE_NAME", f.name);  // handy global fallback

    showAlert(`Uploaded ${f.name}`, "success");
    return { fid, name: f.name };
  }
};
