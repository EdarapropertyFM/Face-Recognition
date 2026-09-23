"""One-camera STMC relay. Kept outside ai_model so the recognition core stays unchanged."""
from __future__ import annotations
import argparse, os, sys, time
from pathlib import Path
import requests

# The recognition core lives at the repository root here (src/facerec,
# config.yaml, data/), not in a separate ai_model/ checkout.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))
from facerec import FaceEngine, load_config
from facerec.gallery import Gallery
from facerec.live import LiveRecognizer, open_source

def send(url: str, token: str, camera: str, zone: int, track, result) -> None:
    face_type = 'unknown' if result.decision.value == 'unknown' else 'known'
    payload = {'aiPersonId': result.person_id, 'cam': camera, 'zone': zone, 'conf': round(result.similarity * 100, 2), 'similarity': result.similarity, 'decision': result.decision.value, 'type': face_type, 'quality': {'trackId': track.track_id}}
    response = requests.post(url, json=payload, headers={'X-STMC-AI-Token': token}, timeout=8)
    response.raise_for_status()

def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument('--source', default='dvr:1'); parser.add_argument('--camera', required=True); parser.add_argument('--zone', required=True, type=int); parser.add_argument('--stmc-url', default='http://127.0.0.1:3000/api/detections/ai-event'); args = parser.parse_args()
    token = os.environ.get('STMC_AI_EVENT_TOKEN')
    if not token: raise SystemExit('STMC_AI_EVENT_TOKEN is required')
    cfg = load_config(ROOT / 'config.yaml'); engine = FaceEngine(cfg); gallery = Gallery(cfg, engine.model_version); live = LiveRecognizer(engine, gallery, cfg, footer='')
    sent: dict[tuple[int, str], float] = {}
    cap = open_source(args.source, cfg)
    try:
      while True:
        ok, frame = cap.read()
        if not ok: raise RuntimeError('camera stream ended')
        live.process(frame)
        now = time.monotonic()
        for track, result in live.active_results():
          key = (track.track_id, result.person_id or 'unknown')
          if now - sent.get(key, 0) < 10: continue
          try: send(args.stmc_url, token, args.camera, args.zone, track, result); sent[key] = now
          except requests.RequestException as error: print(f'event delivery failed: {error}', flush=True)
    finally: cap.release(); gallery.close()

if __name__ == '__main__': main()
