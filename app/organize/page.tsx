"use client";

import { useEffect, useState } from "react";

const API = (process.env.NEXT_PUBLIC_MEDIAVAULT_API_URL || "https://mediavault-mpp4.onrender.com").replace(/\/$/, "");
type Media = { id:number; filename:string; media_type:string; url:string; size_bytes?:number; tags?:{tag:string;album:string;score:number}[] };
type Album = { name:string; slug:string; count:number; items:Media[] };
type DuplicateGroup = { kind:string; distance:number; items:Media[] };

export default function OrganizePage() {
  const [albums,setAlbums]=useState<Album[]>([]);
  const [groups,setGroups]=useState<DuplicateGroup[]>([]);
  const [tab,setTab]=useState<"albums"|"duplicates">("albums");
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");
  const mediaUrl=(item:Media)=>item.url?.startsWith("http")?item.url:`${API}${item.url||""}`;

  async function loadAlbums() {
    const r=await fetch(`${API}/albums`,{cache:"no-store"});
    const d=await r.json(); if(!r.ok) throw new Error(d.detail||"Could not load smart albums");
    setAlbums(d.albums||[]);
  }
  async function loadDuplicates() {
    const r=await fetch(`${API}/duplicates`,{cache:"no-store"});
    const d=await r.json(); if(!r.ok) throw new Error(d.detail||"Could not load duplicates");
    setGroups(d.groups||[]);
  }
  useEffect(()=>{ void Promise.all([loadAlbums(),loadDuplicates()]).catch(e=>setStatus(e.message)); },[]);

  async function scanDuplicates() {
    setBusy(true);setStatus("Scanning images for exact and visual duplicates…");
    try {
      const r=await fetch(`${API}/duplicates/scan`,{method:"POST"});
      const d=await r.json();if(!r.ok)throw new Error(d.detail||"Duplicate scan failed");
      setGroups(d.groups||[]);
      setStatus(`Scanned ${d.scanned} images. Found ${d.group_count} duplicate group(s).${d.failed_ids?.length? ` ${d.failed_ids.length} image(s) could not be scanned.`:""}`);
    } catch(e){setStatus(e instanceof Error?e.message:"Duplicate scan failed");}
    finally{setBusy(false);}
  }
  async function reindexTags() {
    setBusy(true);setStatus("Generating AI tags and refreshing image indexes…");
    try {
      const r=await fetch(`${API}/media/reindex`,{method:"POST"});
      const d=await r.json();if(!r.ok)throw new Error(d.detail||"Re-index failed");
      await loadAlbums();
      setStatus(`Updated ${d.updated} media item(s). AI tags and smart albums refreshed.${d.failed_ids?.length? ` ${d.failed_ids.length} failed.`:""}`);
    } catch(e){setStatus(e instanceof Error?e.message:"Re-index failed");}
    finally{setBusy(false);}
  }
  async function removeItem(item:Media) {
    if(!window.confirm(`Permanently remove ${item.filename}?`))return;
    const r=await fetch(`${API}/media/${item.id}`,{method:"DELETE"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){setStatus(d.detail||"Could not remove file");return;}
    setStatus(`${item.filename} removed.`);
    await Promise.all([loadAlbums(),loadDuplicates()]);
  }

  return <main className="shell mv-organize">
    <header className="topbar"><a className="brand" href="/"><div className="brand-title">◈ Media<span>Vault</span></div><div className="brand-caption">SMART ORGANIZATION</div></a><nav><a className="nav-button" href="/">Home</a><a className="nav-button active" href="/organize">Organize</a></nav></header>
    <div className="rule"/>
    <section className="page-hero"><div className="eyebrow">AI-POWERED ORGANIZATION</div><h1>Your memories,<br/><span>beautifully sorted.</span></h1><p>MediaVault uses local SigLIP 2 tags and image fingerprints to organize your library. Review duplicate groups before removing anything.</p></section>
    {status&&<div className="notice">{status}</div>}
    <div className="mv-org-toolbar"><div className="mv-org-tabs"><button className={tab==="albums"?"selected":""} onClick={()=>setTab("albums")}>✦ Smart Albums</button><button className={tab==="duplicates"?"selected":""} onClick={()=>setTab("duplicates")}>⧉ Duplicate Finder</button></div><div className="mv-org-actions"><button className="button secondary" disabled={busy} onClick={()=>void reindexTags()}>{busy?"Working…":"Refresh AI tags"}</button><button className="button primary" disabled={busy} onClick={()=>void scanDuplicates()}>{busy?"Scanning…":"Scan duplicates"}</button></div></div>
    {tab==="albums"&&<section><div className="mv-org-heading"><div><h2>Smart Albums</h2><p>Albums are created automatically from image tags.</p></div><span>{albums.length} ALBUMS</span></div>
      {!albums.length?<div className="empty">No smart albums yet. Select “Refresh AI tags” to analyze your saved photos.</div>:<div className="mv-album-grid">{albums.map(album=><article className="mv-album-card" key={album.slug} onClick={()=>document.getElementById(`album-${album.slug}`)?.scrollIntoView({behavior:"smooth"})}><div className="mv-album-cover">{album.items[0]&&<img src={mediaUrl(album.items[0])} alt=""/>}<span>✦</span></div><div><strong>{album.name}</strong><small>{album.count} {album.count===1?"photo":"photos"}</small></div></article>)}</div>}
      {albums.map(album=><section className="mv-album-section" id={`album-${album.slug}`} key={album.slug}><div className="mv-org-heading"><div><h2>{album.name}</h2><p>Automatically grouped by AI</p></div><span>{album.count} ITEMS</span></div><div className="media-grid">{album.items.map(item=><article className="media-card" key={item.id}><img className="preview" src={mediaUrl(item)} alt={item.filename}/><div className="card-body"><strong>{item.filename}</strong><div className="mv-tag-list">{(item.tags||[]).filter(t=>t.album===album.name).map(t=><span className="mv-tag" key={t.tag}>{t.tag}</span>)}</div><button className="button secondary small" onClick={()=>void removeItem(item)}>Remove</button></div></article>)}</div></section>)}
    </section>}
    {tab==="duplicates"&&<section><div className="mv-org-heading"><div><h2>Duplicate Finder</h2><p>Exact matches use SHA-256. Similar photos use a perceptual image hash.</p></div><span>{groups.length} GROUPS</span></div>
      <div className="notice">Nothing is deleted automatically. Review each group and remove only the copies you no longer need.</div>
      {!groups.length?<div className="empty">No duplicate groups found. Run “Scan duplicates” to analyze your saved images.</div>:groups.map((group,index)=><article className="mv-duplicate-group" key={index}><header><div><strong>{group.kind}</strong><p>{group.items.length} images · {group.distance===0?"Exact file match":`Visual hash distance: ${group.distance}/64`}</p></div><span>REVIEW</span></header><div className="media-grid">{group.items.map((item,i)=><article className="media-card" key={item.id}><img className="preview" src={mediaUrl(item)} alt={item.filename}/><div className="card-body"><strong>{item.filename}</strong><p>{i===0?"Suggested original to keep":"Possible duplicate"}</p><button className="button secondary small" onClick={()=>void removeItem(item)}>Remove this copy</button></div></article>)}</div></article>)}
    </section>}
    <footer className="footer">◈ MediaVault · Store · Discover · Organize <a href="/">Back to library →</a></footer>
  </main>;
}
