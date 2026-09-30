import { useEffect, useRef, useState } from 'react';
import { Camera, ScanFace, Square, RefreshCw, Activity, CheckCircle, XCircle } from 'lucide-react';
import { apiFetch } from '../api';
import { displayName } from '../utils/display';
import { useTranslation } from 'react-i18next';

export default function FaceTestPage() {
  const { i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 1 : 0;
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const stop = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setActive(false);
  };
  useEffect(() => () => stop(), []);

  useEffect(() => {
    if (active && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [active]);

  const start = async () => {
    setError(''); setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 640 }, audio: false });
      streamRef.current = stream;
      setActive(true);
    } catch (e) { 
      console.error(e);
      setError('Camera permission was denied or no camera is available.'); 
    }
  };
  const testFace = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return setError('Start the camera first.');
    setBusy(true); setError('');
    const side = Math.min(video.videoWidth, video.videoHeight);
    const canvas = document.createElement('canvas');
    // Match the enrollment capture: never upscale, cap at 640 (see useFaceCapture).
    const size = Math.min(640, Math.round(side));
    canvas.width = canvas.height = size;
    canvas.getContext('2d').drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, size, size);
    try {
      const res = await apiFetch('/ai/recognize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_b64: canvas.toDataURL('image/jpeg', .9) }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'AI recognition failed');
      setResult(body.faces?.[0] || null);
      if (!body.faces?.length) setError('No face detected. Center one face in the frame.');
    } catch (err) { setError(err.message || 'Could not reach the AI service.'); }
    finally { setBusy(false); }
  };

  const quality = result?.quality;
  const identity = result?.identity ?? null;
  return <>
    <div className="ph"><div><h1><Activity size={24} style={{ verticalAlign: 'middle', color: 'var(--accent)', marginRight: 8, marginBottom: 4 }} />Face Test</h1><div className="sub">Admin-only live test — does not enroll or alter any face data.</div></div></div>
    <div className="two" style={{ alignItems: 'start' }}>
      <div className="panel glass-panel">
        <div style={{ aspectRatio: '1', background: 'var(--stat-bg)', border: '1px solid var(--glass-border)', borderRadius: 16, overflow: 'hidden', display: 'grid', placeItems: 'center', position: 'relative' }}>
          {active ? <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} /> : <div className="sub" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 0.5 }}><Camera size={48} style={{ display: 'block', marginBottom: 12 }} />Camera is off</div>}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          {!active ? <button className="btn" style={{ flex: 1, padding: 12 }} onClick={start}><Camera size={16} style={{ marginRight: 6 }} /> Start camera</button> : <button className="btn ghost" style={{ flex: 1, padding: 12 }} onClick={stop}><Square size={16} style={{ marginRight: 6 }} /> Stop</button>}
          <button className="btn" disabled={!active || busy} style={{ flex: 1, padding: 12 }} onClick={testFace}>{busy ? <RefreshCw size={16} className="spin" style={{ marginRight: 6 }} /> : <ScanFace size={16} style={{ marginRight: 6 }} />} {busy ? 'Testing…' : 'Test face'}</button>
        </div>
        {error && <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', color: 'var(--red)', borderRadius: 12, fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}><XCircle size={16} /> {error}</div>}
      </div>
      <div className="panel glass-panel">
        <h3 style={{ marginTop: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><ScanFace size={18} color="var(--accent)" /> AI result</h3>
        {!result ? <div className="sub" style={{ opacity: 0.6, fontSize: 13, lineHeight: 1.5 }}>Capture a frame to see identity, similarity and image quality details.</div> : <div className="kv">
          {/* 'Decision' is how sure the match is, not who the person is.
              Labelled explicitly because CONFIRMED / TENTATIVE sitting above
              a name reads like a role. */}
          <div><span>Match confidence</span><b style={{ color: result.decision === 'confirmed' ? 'var(--green)' : 'var(--amber)' }}>
            {result.decision === 'confirmed' ? 'CONFIRMED' : result.decision === 'tentative' ? 'UNCERTAIN' : 'NO MATCH'}
          </b></div>
          <div><span>Person</span><b style={{ color: '#fff', fontSize: 16 }}>{identity ? displayName(identity, lang, result.name) : (result.name || 'Unknown')}</b></div>
          {/* Who they are in the register: the AI only knows the name it was
              enrolled under, not whether that person is an owner, a tenant
              or somebody's son. */}
          <div><span>Role</span><b style={{ color: identity ? 'var(--accent)' : 'var(--muted)' }}>
            {identity ? (displayName({ name: identity.role }, lang, '—') || '—') : 'Not in the register'}
          </b></div>
          {identity?.unit || identity?.building ? (
            <div><span>Unit</span><b className="mono">{[identity.building, identity.unit].filter(Boolean).join(' · ')}</b></div>
          ) : null}
          <div><span>Similarity</span><b style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 12 }}>{Math.round((result.similarity || 0) * 100)}%</b></div>
          <div><span>Face quality</span><b style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: quality?.passed ? 'var(--green)' : 'var(--red)' }}>{quality?.passed ? <CheckCircle size={14} /> : <XCircle size={14} />} {quality?.passed ? 'Passed' : 'Needs adjustment'}</b></div>
          <div><span>Face width</span><b className="mono">{quality?.face_width_px ?? '—'} px</b></div>
          <div><span>Yaw / Pitch</span><b className="mono">{quality ? `${quality.yaw_deg}° / ${quality.pitch_deg}°` : '—'}</b></div>
          {quality?.reasons?.length > 0 && <div><span>Guidance</span><b style={{ color: 'var(--amber)', fontSize: 12 }}>{quality.reasons.join(', ')}</b></div>}
        </div>}
      </div>
    </div>
    <style>{`
      .kv > div { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding: 14px 0; font-size: 13px; }
      .kv > div:last-child { border-bottom: none; }
      .kv > div > span { color: var(--muted); }
    `}</style>
  </>;
}
