export default {
  // --- Upload the file selected in FilePickerEvidence to Nextcloud via the CORS proxy (8185) ---
  async uploadToNextcloud() {
    try {
      // 1) Resolve form id and file from your existing widgets
      const fid =
        (typeof ReviewActions?.getFormId === "function" && ReviewActions.getFormId()) ||
        (typeof ObservationNoInfo !== "undefined" ? ObservationNoInfo.text : "") ||
        "";

      const picked = (typeof FilePickerEvidence !== "undefined" ? FilePickerEvidence.files?.[0] : null);

      if (!fid) { showAlert("No form ID. Please enter/select an Observation No first.", "warning"); return; }
      if (!picked) { showAlert("Please choose a file to upload.", "warning"); return; }

      // 2) Credentials + endpoints (use your working admin creds for now)
      //    TIP: once verified, create an App Password in Nextcloud (Settings → Security) and use it here.
      const user = "admin";
      const pass = "admin";
      const base = "http://localhost:8185";  // your Nginx CORS proxy in front of Nextcloud:8186
      const creds = "Basic " + btoa(user + ":" + pass);

      // 3) Convert FilePicker data URL to a Blob (no need to construct a File object)
      const blob = await (await fetch(picked.data)).blob();

      // 4) WebDAV paths
      const rootFolder   = `/remote.php/dav/files/${encodeURIComponent(user)}/ofi/`;
      const targetFolder = rootFolder + encodeURIComponent(fid) + "/";
      const targetFile   = targetFolder + encodeURIComponent(picked.name);

      // 5) Ensure folders exist (MKCOL). 201 Created, 405/409 = already exists → OK.
      const mk = async (url, label) => {
        const r = await fetch(base + url, { method: "MKCOL", headers: { Authorization: creds } });
        if (!(r.ok || r.status === 405 || r.status === 409)) {
          const t = await r.text().catch(() => "");
          throw new Error(`MKCOL ${label} failed (${r.status}). ${t}`);
        }
      };
      await mk(rootFolder,   "/ofi");
      await mk(targetFolder, `/ofi/${fid}`);

      // 6) PUT upload
      const putResp = await fetch(base + targetFile, {
        method: "PUT",
        headers: { Authorization: creds, "Content-Type": "application/octet-stream" },
        body: blob
      });
      if (!putResp.ok) {
        const t = await putResp.text().catch(() => "");
        throw new Error(`Upload failed (${putResp.status}). ${t}`);
      }

      // 7) Optional: create a public share link via OCS
      let shareUrl = "";
      try {
        const ocs = await fetch(base + "/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json", {
          method: "POST",
          headers: {
            Authorization: creds,
            "OCS-APIRequest": "true",
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: `path=${encodeURIComponent(`/ofi/${fid}/${picked.name}`)}&shareType=3&permissions=1`
        });

        // Prefer JSON; fall back to XML if server responds with XML
        if (ocs.ok) {
          let text = await ocs.text();
          try {
            const json = JSON.parse(text);
            shareUrl = json?.ocs?.data?.url || "";
          } catch {
            const m = text.match(/<url>([^<]+)<\/url>/i);
            shareUrl = m ? m[1] : "";
            await storeValue("NC_LAST_SHARE_XML", text);
          }
        }
      } catch (_) {
        // Share link is optional; ignore errors here
      }

      // 8) Store links for later use (e.g., show in UI or save to your sheet)
      await storeValue("NC_LAST_FILE_DAV", base + targetFile);
      if (shareUrl) await storeValue("NC_LAST_SHARE_URL", shareUrl);

      showAlert("Uploaded to Nextcloud.", "success");
      return { dav: base + targetFile, share: shareUrl };

    } catch (e) {
      console.error("uploadToNextcloud error:", e);
      showAlert(String(e?.message || e || "Upload error"), "error");
      throw e;
    }
  }
};
