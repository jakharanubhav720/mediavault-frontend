"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Media = {
  id: number; filename: string; media_type: string; size_bytes?: number;
  created_at?: string; description?: string; url?: string; similarity?: number; match_percent?: number;
};
const API = (process.env.NEXT_PUBLIC_MEDIAVAULT_API_URL || "https://mediavault-mpp4.onrender.com").replace(/\/$/, "");
const pages = ["Home", "Media Library", "Upload Media", "AI Search", "About"] as const;
type Page = typeof pages[number];

export default function Home() {
  const [page, setPage] = useState<Page>("Home");
  const [items, setItems] = useState<Media[]>([]);
  const [status, setStatus] = useState("");
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [aiQuery, setAiQuery] = useState("");
  const [aiResults, setAiResults] = useState<Media[]>([]);
  const [visualFile, setVisualFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [editorItem, setEditorItem] = useState<Media | null>(null);
  const [editRotation, setEditRotation] = useState(0);
  const [editFlip, setEditFlip] = useState(false);
  const [editBrightness, setEditBrightness] = useState(100);
  const [editContrast, setEditContrast] = useState(100);
  const [editSaturation, setEditSaturation] = useState(100);
  const [editCrop, setEditCrop] = useState("Original");
  const [videoEditorItem, setVideoEditorItem] = useState<Media | null>(null);
  const [videoObjectUrl, setVideoObjectUrl] = useState("");
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoTrimStart, setVideoTrimStart] = useState(0);
  const [videoTrimEnd, setVideoTrimEnd] = useState(0);
  const [videoRotation, setVideoRotation] = useState(0);
  const [videoBrightness, setVideoBrightness] = useState(100);
  const [videoContrast, setVideoContrast] = useState(100);
  const [videoSaturation, setVideoSaturation] = useState(100);
  const [videoMuted, setVideoMuted] = useState(false);
  const [videoExporting, setVideoExporting] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoCanvasRef = useRef<HTMLCanvasElement | null>(null);

  async function loadMedia() {
    try {
      const r = await fetch(`${API}/media`, { cache: "no-store" });
      if (!r.ok) throw new Error(`API returned ${r.status}`);
      const data = await r.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      setApiOk(true);
    } catch (e) {
      setApiOk(false);
      setStatus(`Can't reach the backend (${e instanceof Error ? e.message : "connection error"}). Check the Render service and its CORS_ORIGINS setting.`);
    }
  }
  useEffect(() => { void loadMedia(); }, []);

  const filtered = useMemo(() => items.filter((item) => {
    const matchesType = filter === "All" || item.media_type === filter;
    const q = search.toLowerCase();
    return matchesType && (!q || `${item.filename} ${item.description || ""}`.toLowerCase().includes(q));
  }), [items, search, filter]);
  const images = items.filter((x) => x.media_type === "Image").length;
  const videos = items.filter((x) => x.media_type === "Video").length;
  const bytes = items.reduce((n, x) => n + (x.size_bytes || 0), 0);
  const mediaUrl = (item: Media) => item.url?.startsWith("http") ? item.url : `${API}${item.url || ""}`;

  async function uploadFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true); setStatus("");
    let success = 0; const errors: string[] = [];
    for (const file of files) {
      const form = new FormData(); form.append("file", file);
      try {
        const r = await fetch(`${API}/media`, { method: "POST", body: form });
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || `HTTP ${r.status}`); }
        success++;
      } catch (err) { errors.push(`${file.name}: ${err instanceof Error ? err.message : "upload failed"}`); }
    }
    setStatus(`${success} file(s) uploaded.${errors.length ? ` Errors: ${errors.join("; ")}` : ""}`);
    await loadMedia(); setBusy(false); e.target.value = "";
  }
  async function runAiSearch() {
    if (!aiQuery.trim()) { setStatus("Enter a description to search."); return; }
    setBusy(true); setStatus("Searching indexed media…");
    try {
      const r = await fetch(`${API}/search/ai?q=${encodeURIComponent(aiQuery.trim())}`);
      const data = await r.json(); if (!r.ok) throw new Error(data.detail || `HTTP ${r.status}`);
      setAiResults(data.items || []); setStatus(`${data.count ?? (data.items || []).length} result(s) found.`);
    } catch (e) { setStatus(`AI search failed: ${e instanceof Error ? e.message : "connection error"}`); }
    setBusy(false);
  }
  async function runVisualSearch() {
    if (!visualFile) { setStatus("Choose a reference image first."); return; }
    setBusy(true); setStatus("Analyzing reference image…");
    const form = new FormData(); form.append("file", visualFile);
    try {
      const r = await fetch(`${API}/search/visual`, { method: "POST", body: form });
      const data = await r.json(); if (!r.ok) throw new Error(data.detail || `HTTP ${r.status}`);
      const list: Media[] = ((data.items || []) as Media[]).slice().sort((a, b) => (b.match_percent ?? 0) - (a.match_percent ?? 0));
      setAiResults(list);
      if (!list.length) setStatus(data.not_indexed ? `No comparable images found. ${data.not_indexed} saved image(s) are not indexed yet - press "Re-index saved images".` : "No matching images found. Upload some images first.");
      else setStatus(`${list.length} image(s) ranked by visual similarity (highest match first).${data.not_indexed ? ` ${data.not_indexed} saved image(s) are not indexed yet.` : ""}`);
    } catch (e) { setStatus(`Visual search failed: ${e instanceof Error ? e.message : "connection error"}`); }
    setBusy(false);
  }
  async function runReindex() {
    setBusy(true); setStatus("Re-indexing saved images…");
    try {
      const r = await fetch(`${API}/media/reindex`, { method: "POST" });
      const data = await r.json(); if (!r.ok) throw new Error(data.detail || `HTTP ${r.status}`);
      setStatus(`Re-indexed ${data.updated} image(s).${data.failed_ids?.length ? ` ${data.failed_ids.length} could not be read (missing or invalid files).` : ""}`);
    } catch (e) { setStatus(`Re-index failed: ${e instanceof Error ? e.message : "connection error"}`); }
    setBusy(false);
  }
  function openEditor(item: Media) {
    setEditorItem(item);
    setEditRotation(0); setEditFlip(false);
    setEditBrightness(100); setEditContrast(100); setEditSaturation(100);
    setEditCrop("Original");
  }

  function resetEditor() {
    setEditRotation(0); setEditFlip(false);
    setEditBrightness(100); setEditContrast(100); setEditSaturation(100);
    setEditCrop("Original");
  }

  async function saveEditedImage(downloadOnly = false) {
    if (!editorItem) return;
    setBusy(true); setStatus("Rendering your edited photo…");
    let sourceUrl = "";
    try {
      // Fetch the original into a local blob so canvas export does not taint the canvas.
      const response = await fetch(mediaUrl(editorItem));
      if (!response.ok) throw new Error("Could not load the original image.");
      const sourceBlob = await response.blob();
      sourceUrl = URL.createObjectURL(sourceBlob);
      const image = new Image();
      image.src = sourceUrl;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("The image could not be decoded."));
      });

      const angle = ((editRotation % 360) + 360) % 360;
      const rotatedWidth = angle % 180 === 0 ? image.naturalWidth : image.naturalHeight;
      const rotatedHeight = angle % 180 === 0 ? image.naturalHeight : image.naturalWidth;
      const stage = document.createElement("canvas");
      stage.width = rotatedWidth; stage.height = rotatedHeight;
      const stageContext = stage.getContext("2d");
      if (!stageContext) throw new Error("Your browser could not create an image editor.");
      stageContext.translate(rotatedWidth / 2, rotatedHeight / 2);
      stageContext.rotate(angle * Math.PI / 180);
      stageContext.scale(editFlip ? -1 : 1, 1);
      stageContext.filter = `brightness(${editBrightness}%) contrast(${editContrast}%) saturate(${editSaturation}%)`;
      stageContext.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);

      // Crop from the centre to the selected aspect ratio.
      let cropWidth = stage.width; let cropHeight = stage.height;
      const ratios: Record<string, number> = { "1:1": 1, "4:3": 4 / 3, "16:9": 16 / 9 };
      const targetRatio = ratios[editCrop];
      if (targetRatio) {
        if (cropWidth / cropHeight > targetRatio) cropWidth = cropHeight * targetRatio;
        else cropHeight = cropWidth / targetRatio;
      }
      const cropX = (stage.width - cropWidth) / 2;
      const cropY = (stage.height - cropHeight) / 2;
      const output = document.createElement("canvas");
      output.width = Math.max(1, Math.round(cropWidth));
      output.height = Math.max(1, Math.round(cropHeight));
      const outputContext = output.getContext("2d");
      if (!outputContext) throw new Error("Could not export the edited image.");
      outputContext.drawImage(stage, cropX, cropY, cropWidth, cropHeight, 0, 0, output.width, output.height);

      const editedBlob = await new Promise<Blob>((resolve, reject) => {
        output.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image export failed.")), "image/jpeg", .94);
      });
      const editedName = `edited-${editorItem.filename.replace(/\.[^.]+$/, "")}.jpg`;
      if (downloadOnly) {
        const downloadUrl = URL.createObjectURL(editedBlob);
        const link = document.createElement("a");
        link.href = downloadUrl; link.download = editedName; link.click();
        URL.revokeObjectURL(downloadUrl);
        setStatus("Edited photo downloaded. Your original is unchanged.");
      } else {
        // Save the edited result as a new library item; the original is never overwritten.
        const form = new FormData();
        form.append("file", editedBlob, editedName);
        const upload = await fetch(`${API}/media`, { method: "POST", body: form });
        const data = await upload.json().catch(() => ({}));
        if (!upload.ok) throw new Error(data.detail || `Upload failed with status ${upload.status}`);
        setStatus("Edited photo saved as a new item. Your original is unchanged.");
        setEditorItem(null);
        await loadMedia();
      }
    } catch (error) {
      setStatus(`Photo edit failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      setBusy(false);
    }
  }


  async function openVideoEditor(item: Media) {
    setVideoEditorItem(item);
    setVideoDuration(0); setVideoTrimStart(0); setVideoTrimEnd(0);
    setVideoRotation(0); setVideoBrightness(100); setVideoContrast(100);
    setVideoSaturation(100); setVideoMuted(false);
    setVideoObjectUrl("");
    try {
      // Use a local blob URL so canvas-based video export can read the frames.
      const response = await fetch(mediaUrl(item));
      if (!response.ok) throw new Error("Could not load this video.");
      const blob = await response.blob();
      setVideoObjectUrl(URL.createObjectURL(blob));
    } catch (error) {
      setStatus(`Video editor could not load the file: ${error instanceof Error ? error.message : "network error"}`);
      setVideoEditorItem(null);
    }
  }

  function closeVideoEditor() {
    setVideoEditorItem(null);
    if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
    setVideoObjectUrl("");
  }

  async function exportEditedVideo(saveToLibrary: boolean) {
    const video = videoRef.current;
    const canvas = videoCanvasRef.current;
    if (!video || !canvas || !videoObjectUrl) return;
    // captureStream() on HTMLVideoElement is supported by modern browsers,
    // but is not included in every TypeScript DOM library version.
    const captureVideo = video as HTMLVideoElement & { captureStream?: () => MediaStream };
    if (!("MediaRecorder" in window) || typeof canvas.captureStream !== "function" || typeof captureVideo.captureStream !== "function") {
      setStatus("Video export is not supported by this browser. Try the latest Chrome or Edge.");
      return;
    }
    if (videoTrimEnd <= videoTrimStart) {
      setStatus("Choose a valid trim range. End time must be after start time.");
      return;
    }
    setVideoExporting(true); setStatus("Rendering edited video in your browser…");
    let animation = 0;
    try {
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      const rotated = videoRotation % 180 !== 0;
      canvas.width = rotated ? height : width;
      canvas.height = rotated ? width : height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not initialize the video editor canvas.");

      const drawFrame = () => {
        if (!ctx || !video) return;
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(videoRotation * Math.PI / 180);
        ctx.filter = `brightness(${videoBrightness}%) contrast(${videoContrast}%) saturate(${videoSaturation}%)`;
        ctx.drawImage(video, -width / 2, -height / 2, width, height);
        ctx.restore();
        if (!video.paused && !video.ended) animation = requestAnimationFrame(drawFrame);
      };

      await new Promise<void>((resolve, reject) => {
        const onSeeked = () => { video.removeEventListener("seeked", onSeeked); resolve(); };
        video.addEventListener("seeked", onSeeked);
        video.currentTime = videoTrimStart;
        if (Math.abs(video.currentTime - videoTrimStart) < .05) {
          video.removeEventListener("seeked", onSeeked); resolve();
        }
        window.setTimeout(() => reject(new Error("Video seek timed out.")), 10000);
      });

      const canvasStream = canvas.captureStream(30);
      const sourceStream = captureVideo.captureStream();
      const tracks = [...canvasStream.getVideoTracks(), ...(videoMuted ? [] : sourceStream.getAudioTracks())];
      const outputStream = new MediaStream(tracks);
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus") ? "video/webm;codecs=vp8,opus" : "video/webm";
      const recorder = new MediaRecorder(outputStream, { mimeType });
      const chunks: BlobPart[] = [];
      const finished = new Promise<Blob>((resolve, reject) => {
        recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
        recorder.onerror = () => reject(new Error("Video rendering failed."));
        recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
      });
      video.onended = () => { if (recorder.state !== "inactive") recorder.stop(); };
      video.ontimeupdate = () => {
        if (video.currentTime >= videoTrimEnd && recorder.state !== "inactive") {
          video.pause(); recorder.stop();
        }
      };
      recorder.start(250);
      await video.play();
      drawFrame();
      await finished;
      cancelAnimationFrame(animation);
      video.ontimeupdate = null; video.onended = null;
      video.pause();
      tracks.forEach((track) => track.stop());
      sourceStream.getTracks().forEach((track) => track.stop());
      const outputBlob = new Blob(chunks, { type: "video/webm" });
      const baseName = videoEditorItem?.filename.replace(/\.[^.]+$/, "") || "mediavault-video";
      const outputName = `edited-${baseName}.webm`;
      if (saveToLibrary) {
        const form = new FormData();
        form.append("file", outputBlob, outputName);
        const response = await fetch(`${API}/media`, { method: "POST", body: form });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || `Upload failed with status ${response.status}`);
        setStatus("Edited video saved as a new library item. The original is unchanged.");
        closeVideoEditor();
        await loadMedia();
      } else {
        const url = URL.createObjectURL(outputBlob);
        const link = document.createElement("a");
        link.href = url; link.download = outputName; link.click();
        URL.revokeObjectURL(url);
        setStatus("Edited video downloaded as a WebM copy. The original is unchanged.");
      }
    } catch (error) {
      setStatus(`Video edit failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      cancelAnimationFrame(animation);
      setVideoExporting(false);
    }
  }

  async function deleteItem(item: Media) {
    if (!confirm(`Remove ${item.filename}?`)) return;
    try {
      const r = await fetch(`${API}/media/${item.id}`, { method: "DELETE" });
      const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.detail || `HTTP ${r.status}`);
      setStatus(`${item.filename} removed.`); await loadMedia();
    } catch (e) { setStatus(`Delete failed: ${e instanceof Error ? e.message : "error"}`); }
  }

  function cards(list: Media[]) {
    if (!list.length) return <div className="empty">No matching media found. Upload some files to get started.</div>;
    return <div className="media-grid">{list.map((item) => <article className="media-card" key={item.id}>
      {item.media_type === "Image" ? <img className="preview" src={mediaUrl(item)} alt={item.filename} /> : <video className="preview" src={mediaUrl(item)} controls />}
      <div className="card-body"><strong>{item.filename}</strong><p>{item.media_type} · {((item.size_bytes || 0) / 1024).toFixed(1)} KB</p>
      {item.description && item.description !== item.filename && <details><summary>AI description</summary><p>{item.description}</p></details>}
      {item.match_percent !== undefined && <div className="match"><strong>Match: {Number(item.match_percent).toFixed(1)}%</strong><div className="match-bar"><span style={{ width: `${Math.min(100, Math.max(0, Number(item.match_percent)))}%` }} /></div></div>}
      {item.media_type === "Image" && <button className="button secondary small" onClick={() => openEditor(item)}>✦ Edit photo</button>}
      {item.media_type === "Video" && <button className="button secondary small" onClick={() => void openVideoEditor(item)}>✦ Edit video</button>}
      <button className="button secondary small" onClick={() => void deleteItem(item)}>Remove</button></div>
    </article>)}</div>;
  }

  return <main className="shell">
    <header className="topbar"><div className="brand"><div className="brand-title">◈ Media<span>Vault</span></div><div className="brand-caption">MULTIMEDIA DATABASE SYSTEM</div></div>
      <nav>{pages.map((p) => <button key={p} onClick={() => { setPage(p); setStatus(""); }} className={`nav-button ${page === p ? "active" : ""}`}>{p}</button>)}</nav>
    </header>
    <div className="rule" />
    {apiOk === false && <div className="notice error">Backend connection issue: {status || "Render API is not responding."}</div>}
    {status && page !== "Home" && <div className={`notice ${status.toLowerCase().includes("failed") || status.toLowerCase().includes("can't") ? "error" : ""}`}>{status}</div>}

    {page === "Home" && <>
      <section className="home-hero"><div className="hero-copy"><div className="eyebrow">YOUR DIGITAL ASSET HUB</div><h1>Your Media.<br/><span>Organized Smarter.</span></h1><p>Upload, discover, preview and organize images and videos in a persistent multimedia workspace powered by SQLite and AI search.</p>
        <div className="actions"><button className="button primary" onClick={() => setPage("Media Library")}>Explore Media →</button><button className="button secondary" onClick={() => setPage("Upload Media")}>＋ Upload Your Files</button><button className="button secondary" onClick={() => setPage("AI Search")}>✨ Try AI Search</button></div></div>
        <div className="hero-art-card"><div className="big-icon">▣</div><h2>MediaVault</h2><div className="eyebrow">STORE · DISCOVER · ORGANIZE</div></div></section>
      <section><h2 className="section-title">Dashboard Overview</h2><p className="section-sub">A live snapshot of your saved media collection.</p>
        <div className="metrics"><Metric icon="🗂️" label="Total Assets" value={items.length} note="Files in database"/><Metric icon="🖼️" label="Images" value={images} note="Image assets"/><Metric icon="🎬" label="Videos" value={videos} note="Video assets"/><Metric icon="💾" label="Storage Used" value={`${(bytes / (1024 * 1024)).toFixed(2)} MB`} note="Uploaded file size"/></div></section>
      <section><h2 className="section-title">Your Workspace</h2><div className="feature-grid"><Feature icon="🔎" title="Explore Your Media" text="Search filenames, inspect AI descriptions and filter by media type." action="Open Library →" onClick={() => setPage("Media Library")}/><Feature icon="📤" title="Upload Center" text="Save images and videos to disk storage with SQLite metadata." action="Upload Media →" onClick={() => setPage("Upload Media")}/><Feature icon="🧠" title="AI Visual Search" text="Find media by description or visual similarity." action="Search with AI →" onClick={() => setPage("AI Search")}/></div></section>
    </>}

    {page === "Media Library" && <><Hero eyebrow="YOUR DIGITAL COLLECTION" title={<>Explore Your <span>Media.</span></>} text="Browse your saved photos and videos in separate, organized libraries."/>
      <div className="library-switcher" role="tablist" aria-label="Media library type">
        <button type="button" role="tab" aria-selected={filter === "Image"} className={`library-tab ${filter === "Image" ? "active" : ""}`} onClick={() => setFilter("Image")}>
          <span className="library-tab-icon">▧</span><span className="library-tab-copy"><strong>Photo Library</strong><small>{images} {images === 1 ? "photo" : "photos"}</small></span>
        </button>
        <button type="button" role="tab" aria-selected={filter === "Video"} className={`library-tab ${filter === "Video" ? "active" : ""}`} onClick={() => setFilter("Video")}>
          <span className="library-tab-icon">▷</span><span className="library-tab-copy"><strong>Video Library</strong><small>{videos} {videos === 1 ? "video" : "videos"}</small></span>
        </button>
      </div>
      <div className="toolbar"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={filter === "Video" ? "Search video filename or description…" : "Search photo filename or description…"}/><button className="button secondary" onClick={() => void loadMedia()}>Refresh</button></div>
      <div className="library-heading"><div><h2>{filter === "Video" ? "Your Videos" : "Your Photos"}</h2><p className="section-sub">{filtered.length} {filter === "Video" ? "video" : "photo"} asset(s)</p></div><span className="library-count">{filter === "Video" ? "VIDEO COLLECTION" : "PHOTO COLLECTION"}</span></div>
      {cards(filtered)}
    </>}

    {page === "Upload Media" && <><Hero eyebrow="UPLOAD CENTER" title={<>Add Your <span>Media.</span></>} text="Upload images and videos to your MediaVault library. Supported formats: PNG, JPG, JPEG, WEBP, GIF, MP4, MOV, WEBM and AVI."/><div className="panel upload-panel"><label className="upload-box"><span className="upload-icon">⇧</span><strong>{busy ? "Uploading files…" : "Choose images or videos"}</strong><span>Click to select one or more files · up to 50 MB each</span><input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm,video/x-msvideo" onChange={(e) => void uploadFiles(e)} disabled={busy}/></label>{status && <p className="status-text">{status}</p>}</div></>}

    {page === "AI Search" && <><Hero eyebrow="AI-POWERED DISCOVERY" title={<>Search by <span>Meaning.</span></>} text="Find media using filenames, descriptions, and lightweight visual similarity. Text search uses optional Gemini embeddings when configured, with keyword matching as a fallback."/><div className="panel"><h2>🔎 Search media by description</h2><p className="muted">Search filenames and saved descriptions. When Gemini is configured, MediaVault also uses text embeddings; otherwise it falls back to keyword matching.</p><div className="search-row"><input value={aiQuery} onChange={(e) => setAiQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void runAiSearch(); }} placeholder="Describe the media you want to find…"/><button className="button primary" disabled={busy} onClick={() => void runAiSearch()}>Search media</button></div><hr className="divider"/><h2>🖼️ Find visually similar photos</h2><p className="muted">Upload a reference photo. MediaVault uses a lightweight local visual descriptor to rank similar saved photos. Similarity scores are ranking indicators, not probabilities.</p><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => setVisualFile(e.target.files?.[0] || null)}/><button className="button primary" disabled={busy} onClick={() => void runVisualSearch()}>{busy ? "Searching…" : "Find Similar Photos"}</button> <button className="button secondary" disabled={busy} onClick={() => void runReindex()}>Re-index saved images</button></div>{aiResults.length > 0 && <><h2 className="section-title">Search Results</h2>{cards(aiResults)}</>}</>}

    {page === "About" && <><Hero eyebrow="ABOUT THE PROJECT" title={<>Multimedia Database<br/><span>Management System</span></>} text="A multimedia management platform combining database storage with AI-assisted discovery."/><div className="panel about"><h2>Project Overview</h2><p>MediaVault stores uploaded images and videos, records their metadata in SQLite, and exposes a FastAPI backend. Optional AI features generate image descriptions and embeddings for natural-language and reference-image search.</p><h2>Main Features</h2><ul><li>Persistent SQLite metadata storage</li><li>Upload, preview, browse and delete media</li><li>Search and filter by filename, description and media type</li><li>AI-generated image descriptions</li><li>Semantic search using natural-language queries</li><li>Reference-image visual similarity search</li></ul><h2>Technology Stack</h2><p>Next.js frontend · FastAPI backend · SQLite database · file storage · local image-similarity matching with optional Gemini text search</p></div></>}
    {videoEditorItem && <div className="editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !videoExporting) closeVideoEditor(); }}>
      <section className="photo-editor video-editor" role="dialog" aria-modal="true" aria-label="Video editor">
        <header className="editor-header"><div><span className="editor-kicker">MEDIAVAULT STUDIO</span><h2>Edit video</h2><p>{videoEditorItem.filename} · Original file stays untouched</p></div><button className="editor-close" onClick={closeVideoEditor} aria-label="Close editor" disabled={videoExporting}>×</button></header>
        <div className="editor-layout">
          <div className="video-editor-preview-column">
            {videoObjectUrl ? <video ref={videoRef} className="video-editor-preview" src={videoObjectUrl} controls playsInline onLoadedMetadata={(event) => { const duration = event.currentTarget.duration; setVideoDuration(duration); setVideoTrimEnd(duration); }} style={{ filter: `brightness(${videoBrightness}%) contrast(${videoContrast}%) saturate(${videoSaturation}%)`, transform: `rotate(${videoRotation}deg)` }}/> : <div className="editor-preview-wrap">Loading video…</div>}
            <canvas ref={videoCanvasRef} className="video-export-canvas"/>
            <div className="video-trim-panel">
              <h3><span>✂</span> Trim video</h3>
              <div className="video-time-inputs">
                <label>Start (seconds)<input type="number" min="0" max={Math.max(0, videoDuration)} step=".1" value={videoTrimStart} onChange={(e) => setVideoTrimStart(Math.max(0, Math.min(Number(e.target.value), videoDuration)))}/></label>
                <label>End (seconds)<input type="number" min="0" max={Math.max(0, videoDuration)} step=".1" value={videoTrimEnd} onChange={(e) => setVideoTrimEnd(Math.max(0, Math.min(Number(e.target.value), videoDuration)))}/></label>
              </div>
              <div className="video-trim-range"><input aria-label="Trim start" type="range" min="0" max={Math.max(0, videoDuration)} step=".1" value={Math.min(videoTrimStart, videoDuration)} onChange={(e) => setVideoTrimStart(Math.min(Number(e.target.value), videoTrimEnd))}/><input aria-label="Trim end" type="range" min="0" max={Math.max(0, videoDuration)} step=".1" value={Math.min(videoTrimEnd, videoDuration)} onChange={(e) => setVideoTrimEnd(Math.max(Number(e.target.value), videoTrimStart))}/></div>
              <p className="video-duration-note">Selected duration: {Math.max(0, videoTrimEnd - videoTrimStart).toFixed(1)}s · Total: {videoDuration.toFixed(1)}s</p>
            </div>
          </div>
          <div className="editor-controls">
            <div className="editor-group"><h3>Quick tools</h3><div className="editor-tool-row">
              <button className="editor-tool" onClick={() => setVideoRotation((v) => (v - 90 + 360) % 360)}>↶<span>Rotate left</span></button>
              <button className="editor-tool" onClick={() => setVideoRotation((v) => (v + 90) % 360)}>↷<span>Rotate right</span></button>
              <button className={`editor-tool ${videoMuted ? "selected" : ""}`} onClick={() => setVideoMuted((v) => !v)}>{videoMuted ? "×" : "♪"}<span>{videoMuted ? "Muted" : "Mute audio"}</span></button>
            </div></div>
            <div className="editor-group"><h3>Adjust video</h3>
              <label className="editor-slider">Brightness <output>{videoBrightness}%</output><input type="range" min="50" max="150" value={videoBrightness} onChange={(e) => setVideoBrightness(Number(e.target.value))}/></label>
              <label className="editor-slider">Contrast <output>{videoContrast}%</output><input type="range" min="50" max="150" value={videoContrast} onChange={(e) => setVideoContrast(Number(e.target.value))}/></label>
              <label className="editor-slider">Saturation <output>{videoSaturation}%</output><input type="range" min="0" max="200" value={videoSaturation} onChange={(e) => setVideoSaturation(Number(e.target.value))}/></label>
            </div>
            <div className="editor-actions">
              <button className="button secondary" disabled={videoExporting} onClick={() => { setVideoTrimStart(0); setVideoTrimEnd(videoDuration); setVideoRotation(0); setVideoBrightness(100); setVideoContrast(100); setVideoSaturation(100); setVideoMuted(false); }}>Reset edits</button>
              <button className="button secondary" disabled={videoExporting || !videoObjectUrl} onClick={() => void exportEditedVideo(false)}>{videoExporting ? "Rendering…" : "Download edited video"}</button>
              <button className="button primary" disabled={videoExporting || !videoObjectUrl} onClick={() => void exportEditedVideo(true)}>{videoExporting ? "Rendering…" : "Save as new video"}</button>
            </div>
          </div>
        </div>
      </section>
    </div>}
    {editorItem && <div className="editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditorItem(null); }}>
      <section className="photo-editor" role="dialog" aria-modal="true" aria-label="Photo editor">
        <header className="editor-header"><div><span className="editor-kicker">MEDIAVAULT STUDIO</span><h2>Edit photo</h2><p>{editorItem.filename} · Original file stays untouched</p></div><button className="editor-close" onClick={() => setEditorItem(null)} aria-label="Close editor">×</button></header>
        <div className="editor-layout">
          <div className="editor-preview-wrap"><img className="editor-preview" src={mediaUrl(editorItem)} alt="Photo editing preview" style={{ filter: `brightness(${editBrightness}%) contrast(${editContrast}%) saturate(${editSaturation}%)`, transform: `rotate(${editRotation}deg) scaleX(${editFlip ? -1 : 1})` }}/></div>
          <div className="editor-controls">
            <div className="editor-group"><h3>Quick tools</h3><div className="editor-tool-row">
              <button className="editor-tool" onClick={() => setEditRotation((v) => (v - 90 + 360) % 360)}>↶<span>Rotate left</span></button>
              <button className="editor-tool" onClick={() => setEditRotation((v) => (v + 90) % 360)}>↷<span>Rotate right</span></button>
              <button className={`editor-tool ${editFlip ? "selected" : ""}`} onClick={() => setEditFlip((v) => !v)}>⇋<span>Flip</span></button>
            </div></div>
            <div className="editor-group"><h3>Crop ratio</h3><div className="editor-presets">{["Original","1:1","4:3","16:9"].map((ratio) => <button key={ratio} className={`editor-chip ${editCrop === ratio ? "selected" : ""}`} onClick={() => setEditCrop(ratio)}>{ratio}</button>)}</div></div>
            <div className="editor-group"><h3>Adjust</h3>
              <label className="editor-slider">Brightness <output>{editBrightness}%</output><input type="range" min="50" max="150" value={editBrightness} onChange={(e) => setEditBrightness(Number(e.target.value))}/></label>
              <label className="editor-slider">Contrast <output>{editContrast}%</output><input type="range" min="50" max="150" value={editContrast} onChange={(e) => setEditContrast(Number(e.target.value))}/></label>
              <label className="editor-slider">Saturation <output>{editSaturation}%</output><input type="range" min="0" max="200" value={editSaturation} onChange={(e) => setEditSaturation(Number(e.target.value))}/></label>
            </div>
            <div className="editor-actions"><button className="button secondary" onClick={resetEditor}>Reset edits</button><button className="button secondary" disabled={busy} onClick={() => void saveEditedImage(true)}>Download copy</button><button className="button primary" disabled={busy} onClick={() => void saveEditedImage(false)}>{busy ? "Saving…" : "Save as new photo"}</button></div>
          </div>
        </div>
      </section>
    </div>}
    <footer className="footer">◈ MediaVault · Multimedia Database Management System <span>Store · Discover · Organize</span></footer>
  </main>;
}
function Metric({icon,label,value,note}:{icon:string;label:string;value:string|number;note:string}) { return <div className="metric"><div className="metric-icon">{icon}</div><div className="metric-label">{label}</div><div className="metric-number">{value}</div><div className="metric-note">{note}</div></div>; }
function Feature({icon,title,text,action,onClick}:{icon:string;title:string;text:string;action:string;onClick:()=>void}) { return <div className="feature-card"><div className="feature-icon">{icon}</div><div className="feature-name">{title}</div><p>{text}</p><button className="button secondary small" onClick={onClick}>{action}</button></div>; }
function Hero({eyebrow,title,text}:{eyebrow:string;title:React.ReactNode;text:string}) { return <section className="page-hero"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{text}</p></section>; }
