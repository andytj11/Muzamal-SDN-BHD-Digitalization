export default {
  // ── CONFIG ────────────────────────────────────────────────────────────────
  cfg: {
    base: "http://localhost:8185",   // nginx CORS proxy in front of Nextcloud:8186
    user: "admin",                   // use a dedicated Nextcloud user in prod
    pass: "admin"
  },

  _auth() { return "Basic " + btoa(this.cfg.user + ":" + this.cfg.pass); },
  _enc(s) { return encodeURIComponent(s); },

  // ── LIST FILES in /ofi/<formId>/ (stores NC_FILE_LIST as a convenience)
  async list(fid) {
    const url = `${this.cfg.base}/remote.php/dav/files/${this._enc(this.cfg.user)}/ofi/${this._enc(fid)}/`;
    const r = await fetch(url, { method: "PROPFIND", headers: { Authorization: this._auth(), Depth: "1" }});
    if (!r.ok) throw new Error("PROPFIND failed " + r.status);
    const xml = await r.text();

    // Prefer DOMParser; fall back to simple regex if not available.
    const Parser = (globalThis && globalThis.DOMParser) ? globalThis.DOMParser : null;
    let files = [];
    if (Parser) {
      const doc = new Parser().parseFromString(xml, "text/xml");
      const nodes = Array.from(doc.getElementsByTagNameNS("DAV:", "response"));
      files = nodes.map(n => {
        const href = n.getElementsByTagNameNS("DAV:", "href")[0]?.textContent || "";
        if (href.endsWith("/")) return null;           // skip folders
        const name = decodeURIComponent(href.split("/").pop());
        const len  = n.getElementsByTagNameNS("DAV:", "getcontentlength")[0]?.textContent || "0";
        const mod  = n.getElementsByTagNameNS("DAV:", "getlastmodified")[0]?.textContent || "";
        return { name, size: Number(len), modified: mod };
      }).filter(Boolean);
    } else {
      const hrefs = Array.from(xml.matchAll(/<[^:>]*:href>(.*?)<\/[^:>]*:href>/g)).map(m => m[1]);
      files = hrefs.filter(h => !h.endsWith("/")).map(h => ({ name: decodeURIComponent(h.split("/").pop()) }));
    }

    await storeValue("NC_FILE_LIST", files);
    return files;
  },

  // ── VIEW a specific file by name: creates a blob: URL and stores NC_EVIDENCE_URL
  async view(fid, fileName) {
    const path = `/remote.php/dav/files/${this._enc(this.cfg.user)}/ofi/${this._enc(fid)}/${this._enc(fileName)}`;
    const r = await fetch(this.cfg.base + path, { headers: { Authorization: this._auth() }});
    if (!r.ok) throw new Error("GET failed " + r.status);

    const blob = await r.blob();
    const URLapi = (globalThis && globalThis.URL) ? globalThis.URL : null;
    if (!URLapi || !URLapi.createObjectURL) throw new Error("Blob URL API unavailable");

    // clean up previous blob URL to avoid leaks
    const prev = appsmith.store.NC_EVIDENCE_URL;
    if (prev) { try { URLapi.revokeObjectURL(prev); } catch (_) {} }

    const url = URLapi.createObjectURL(blob);
    await storeValue("NC_EVIDENCE_URL", url);
    return url;
  },

  // ── VIEW the most recently modified file in the folder
  async viewLatest(fid) {
    const list = await this.list(fid);
    if (!list.length) throw new Error("No files in this folder");
    list.sort((a, b) => new Date(b.modified || 0) - new Date(a.modified || 0));
    return this.view(fid, list[0].name);
  },
	
	// Inside NCViewer
	formId() {
		try { return ReviewActions.getFormId(); } catch(e) { return ""; }
	},

  // ── Clear current blob URL (optional)
  async clearUrl() {
    const URLapi = (globalThis && globalThis.URL) ? globalThis.URL : null;
    const prev = appsmith.store.NC_EVIDENCE_URL;
    if (URLapi && prev) { try { URLapi.revokeObjectURL(prev); } catch (_) {} }
    return storeValue("NC_EVIDENCE_URL", "");
  }
};
