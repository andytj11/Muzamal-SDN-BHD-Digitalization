export default {
  // ── Config (same as OFI) ───────────────────────────────────────────────────
  cfg: {
    base: "http://localhost:8185",     // nginx CORS proxy → Nextcloud:8186
    user: "admin",
    pass: "admin",
  },

  // ── Helpers ────────────────────────────────────────────────────────────────
  _auth() { return "Basic " + btoa(this.cfg.user + ":" + this.cfg.pass); },
  _enc(s) { return encodeURIComponent(String(s || "")); },
  _ok(r)  { return !!r && (r.status === 207 || (r.status >= 200 && r.status < 300)); },

  _formId() {
    try { return ReviewActions.getFormId(); } catch (_) {}
    return String(appsmith.store?.CURRENT_FORM_ID || "");
  },

  _folderPath(fid) {
    // e.g. /remote.php/dav/files/admin/finding/F7014/
    return `/remote.php/dav/files/${this._enc(this.cfg.user)}/finding/${this._enc(fid)}/`;
  },

  async _mkcol(path) {
    const r = await fetch(this.cfg.base + path, {
      method: "MKCOL",
      headers: { Authorization: this._auth() }
    });
    // 201 = created, 405/409 = already exists
    if (!this._ok(r) && r.status !== 405 && r.status !== 409) {
      throw new Error(`MKCOL failed (${r.status})`);
    }
  },

  async _ensureFolders(fid) {
    await this._mkcol(`/remote.php/dav/files/${this._enc(this.cfg.user)}/finding/`);
    await this._mkcol(this._folderPath(fid));
  },

  // ── 1) Upload the file picked in FilePickerFinding ────────────────────────
  async uploadFromPicker() {
    const fid = this._formId();
    const f   = FilePickerFinding?.files?.[0];
    if (!fid || !f) { showAlert("Missing form or file", "warning"); return; }

    const blob     = await (await fetch(f.data)).blob();      // dataURL → Blob
    const filename = f.name || `finding-${Date.now()}.pdf`;

    await this._ensureFolders(fid);

    const putUrl = this.cfg.base + this._folderPath(fid) + this._enc(filename);
    const resp   = await fetch(putUrl, {
      method: "PUT",
      headers: { Authorization: this._auth(), "Content-Type": "application/octet-stream" },
      body: blob
    });
    if (!this._ok(resp)) throw new Error("Upload failed " + resp.status);

    // Remember the last uploaded file per form (useful for quick "open last")
    const map = Object.assign({}, appsmith.store.NC_FIND_LAST_UPLOADS || {});
    map[fid]  = filename;
    await storeValue("NC_FIND_LAST_UPLOADS", map, true);

    showAlert("Finding uploaded to Nextcloud.", "success");
  },

  // ── 2) List files in /finding/<formId>/ (Depth: 1) ─────────────────────────
  async list(fid) {
    const id = fid || this._formId();
    const url = this.cfg.base + this._folderPath(id);
    const r = await fetch(url, { method: "PROPFIND", headers: { Authorization: this._auth(), Depth: "1" }});
    if (!this._ok(r)) { await storeValue("NC_FINDING_FILE_LIST", [], true); return []; }

    const xml = await r.text();
    const Parser = (globalThis && globalThis.DOMParser) ? globalThis.DOMParser : null;

    let files = [];
    if (Parser) {
      const doc   = new Parser().parseFromString(xml, "text/xml");
      const nodes = Array.from(doc.getElementsByTagNameNS("DAV:", "response"));
      files = nodes.map(n => {
        const href = n.getElementsByTagNameNS("DAV:", "href")[0]?.textContent || "";
        if (!href || href.endsWith("/")) return null;         // skip folder itself
        const name = decodeURIComponent(href.split("/").pop());
        const mod  = n.getElementsByTagNameNS("DAV:", "getlastmodified")[0]?.textContent || "";
        return { name, modified: mod };
      }).filter(Boolean);
    } else {
      // Fallback parser
      const parts = xml.split("<d:response>").slice(1);
      files = parts.map(p => {
        const href = (p.match(/<[^:>]*:href>(.*?)<\/[^:>]*:href>/) || [])[1] || "";
        if (!href || href.endsWith("/")) return null;
        const name = decodeURIComponent(href.split("/").pop());
        const mod  = (p.match(/<[^:>]*:getlastmodified>(.*?)<\/[^:>]*:getlastmodified>/) || [])[1] || "";
        return { name, modified: mod };
      }).filter(Boolean);
    }

    await storeValue("NC_FINDING_FILE_LIST", files, true);
    return files;
  },

  // ── 3) Create a blob URL for a specific finding file ───────────────────────
  async viewByName(fid, fileName) {
    const id   = fid || this._formId();
    const path = this._folderPath(id) + this._enc(fileName);
    const r    = await fetch(this.cfg.base + path, { headers: { Authorization: this._auth() }});
    if (!this._ok(r)) throw new Error("GET failed " + r.status);

    const blob   = await r.blob();
    const URLapi = (globalThis && globalThis.URL) ? globalThis.URL : null;
    if (!URLapi || !URLapi.createObjectURL) throw new Error("Blob URL API unavailable");

    // Revoke previous to avoid leaks
    const prev = appsmith.store.NC_FINDING_URL;
    if (prev) { try { URLapi.revokeObjectURL(prev); } catch(_){} }

    const url = URLapi.createObjectURL(blob);
    await storeValue("NC_FINDING_URL", url, true);
    return url;
  },

  // ── 4) Open the latest finding file for the current form ───────────────────
  async viewLatestForCurrentForm() {
    const id = this._formId();

    // Prefer the last uploaded name (fast path)
    const lastName = (appsmith.store.NC_FIND_LAST_UPLOADS || {})[id];
    if (lastName) return this.viewByName(id, lastName);

    // Otherwise, list and pick the newest by modified time
    const list = await this.list(id);
    if (!list.length) throw new Error("No finding files in this folder");
    list.sort((a, b) => new Date(b.modified || 0) - new Date(a.modified || 0));
    return this.viewByName(id, list[0].name);
  },
};
