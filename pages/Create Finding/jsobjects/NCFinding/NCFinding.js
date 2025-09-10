export default {
  // ── Config: same proxy+login you used for OFI ──────────────────────────────
  cfg: {
    base: "http://localhost:8185",   // nginx CORS proxy in front of Nextcloud:8186
    user: "admin",
    pass: "admin"
  },

  // ── helpers ────────────────────────────────────────────────────────────────
  _auth() { return "Basic " + btoa(this.cfg.user + ":" + this.cfg.pass); },
  _enc(s) { return encodeURIComponent(String(s || "")); },
  _formId() {
    try { return ReviewActions.getFormId(); } catch (e) {}
    return String(appsmith.store?.CURRENT_FORM_ID || "");
  },
  _folderPath(fid) {
    // e.g. /remote.php/dav/files/admin/finding/F7014/
    return `/remote.php/dav/files/${this._enc(this.cfg.user)}/finding/${this._enc(fid)}/`;
  },
  async _mkcol(urlPath) {
    const r = await fetch(this.cfg.base + urlPath, {
      method: "MKCOL", headers: { Authorization: this._auth() }
    });
    // 201 = created, 405/409 = already exists; only fail on other codes
    if (!r.ok && r.status !== 405 && r.status !== 409)
      throw new Error(`MKCOL failed (${r.status})`);
  },
  async _ensureFolders(fid) {
    // make /finding and /finding/<fid> if missing
    await this._mkcol(`/remote.php/dav/files/${this._enc(this.cfg.user)}/finding/`);
    await this._mkcol(this._folderPath(fid));
  },

  // ── 1) Upload the PICKED file as a "Finding" ───────────────────────────────
  async uploadFromPicker() {
    const fid = this._formId();
    const f = FilePickerFinding?.files?.[0];     // <— your Finding picker widget
    if (!fid || !f) { showAlert("Missing form or file", "warning"); return; }

    // Convert dataURL from the picker → Blob (avoid 'File is not defined' lint)
    const blob = await (await fetch(f.data)).blob();
    const filename = f.name || `finding-${Date.now()}.pdf`;

    await this._ensureFolders(fid);

    const putUrl = this.cfg.base + this._folderPath(fid) + this._enc(filename);
    const resp = await fetch(putUrl, {
      method: "PUT",
      headers: { Authorization: this._auth(), "Content-Type": "application/octet-stream" },
      body: blob
    });
    if (!resp.ok) throw new Error("Upload failed " + resp.status);

    await storeValue("NC_FIND_LAST_FILE_NAME", filename, true);
    showAlert("Finding uploaded to Nextcloud.", "success");
  },

  // ── 2) List finding files for the form (Depth:1 PROPFIND) ──────────────────
  async list(fid) {
    const id = fid || this._formId();
    const r = await fetch(this.cfg.base + this._folderPath(id), {
      method: "PROPFIND",
      headers: { Authorization: this._auth(), Depth: "1" }
    });
    if (!r.ok) { await storeValue("NC_FINDING_FILE_LIST", [], true); return []; }

    const xml = await r.text();
    // Parse with DOMParser if available, otherwise a regex fallback
    const Parser = (globalThis && globalThis.DOMParser) ? globalThis.DOMParser : null;
    let files = [];
    if (Parser) {
      const doc = new Parser().parseFromString(xml, "text/xml");
      const nodes = Array.from(doc.getElementsByTagNameNS("DAV:", "response"));
      files = nodes.map(n => {
        const href = n.getElementsByTagNameNS("DAV:", "href")[0]?.textContent || "";
        if (href.endsWith("/")) return null;
        const name = decodeURIComponent(href.split("/").pop());
        const mod  = n.getElementsByTagNameNS("DAV:", "getlastmodified")[0]?.textContent || "";
        return { name, modified: mod };
      }).filter(Boolean);
    } else {
      const blocks = xml.split("<d:response>").slice(1);
      files = blocks.map(b => {
        const href = (b.match(/<[^:>]*:href>(.*?)<\/[^:>]*:href>/) || [])[1] || "";
        if (!href || href.endsWith("/")) return null;
        const name = decodeURIComponent(href.split("/").pop());
        const mod  = (b.match(/<[^:>]*:getlastmodified>(.*?)<\/[^:>]*:getlastmodified>/) || [])[1] || "";
        return { name, modified: mod };
      }).filter(Boolean);
    }
    await storeValue("NC_FINDING_FILE_LIST", files, true);
    return files;
  },

  // ── 3) Get blob URL for a specific finding file ────────────────────────────
  async viewByName(fid, fileName) {
    const id = fid || this._formId();
    const path = this._folderPath(id) + this._enc(fileName);
    const r = await fetch(this.cfg.base + path, { headers: { Authorization: this._auth() } });
    if (!r.ok) throw new Error("GET failed " + r.status);

    const blob = await r.blob();
    const URLapi = (globalThis && globalThis.URL) ? globalThis.URL : null;
    if (!URLapi || !URLapi.createObjectURL) throw new Error("Blob URL API unavailable");

    // Revoke previous URL to avoid leaks
    const prev = appsmith.store.NC_FINDING_URL;
    if (prev) { try { URLapi.revokeObjectURL(prev); } catch(_){} }

    const url = URLapi.createObjectURL(blob);
    await storeValue("NC_FINDING_URL", url, true);
    return url;
  },

  // ── 4) Open the latest finding file for the current form ───────────────────
  async viewLatestForCurrentForm() {
    const id = this._formId();
    const list = await this.list(id);
    if (!list.length) throw new Error("No finding files in this folder");
    list.sort((a, b) => new Date(b.modified || 0) - new Date(a.modified || 0));
    return this.viewByName(id, list[0].name);
  }
};
