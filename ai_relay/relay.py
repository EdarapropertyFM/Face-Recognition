"""One-camera STMC relay. Kept outside ai_model so the recognition core stays unchanged."""
from __future__ import annotations
import argparse, os, sys, time
from pathlib import Path
import cv2
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

def send_motion(url: str, token: str, camera: str, zone: int, area_pct: float) -> None:
    # No face was recognised, but something person-sized moved: still worth an alert.
    payload = {'cam': camera, 'zone': zone, 'conf': round(min(area_pct, 100), 2), 'decision': 'motion', 'type': 'motion'}
    response = requests.post(url, json=payload, headers={'X-STMC-AI-Token': token}, timeout=8)
    response.raise_for_status()


class MotionDetector:
    """Background subtraction on a small grey copy of the frame.

    Ignores the top strip, where DVRs burn in a ticking clock, and anything
    smaller than `min_area_pct` of the frame (noise, flicker, a moth), so it
    reports a sizeable moving shape such as a person walking.
    """
    def __init__(self, min_area_pct: float = 1.5, ignore_top: float = 0.12):
        self.sub = cv2.createBackgroundSubtractorMOG2(history=300, varThreshold=32, detectShadows=False)
        self.min_area_pct, self.ignore_top, self.frames = min_area_pct, ignore_top, 0

    def largest_moving_pct(self, frame) -> float:
        small = cv2.resize(frame, (320, int(320 * frame.shape[0] / frame.shape[1])))
        grey = cv2.GaussianBlur(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY), (5, 5), 0)
        grey[: int(grey.shape[0] * self.ignore_top)] = 0
        mask = self.sub.apply(grey)
        self.frames += 1
        if self.frames < 50: return 0.0                # still learning the empty scene
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours: return 0.0
        pct = 100 * max(cv2.contourArea(c) for c in contours) / (mask.shape[0] * mask.shape[1])
        return pct if pct >= self.min_area_pct else 0.0


def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument('--source', default='dvr:1'); parser.add_argument('--camera', required=True); parser.add_argument('--zone', required=True, type=int); parser.add_argument('--stmc-url', default='http://127.0.0.1:3000/api/detections/ai-event'); args = parser.parse_args()
    token = os.environ.get('STMC_AI_EVENT_TOKEN')
    if not token: raise SystemExit('STMC_AI_EVENT_TOKEN is required')
    cfg = load_config(ROOT / 'config.yaml'); engine = FaceEngine(cfg); gallery = Gallery(cfg, engine.model_version); live = LiveRecognizer(engine, gallery, cfg, footer='')
    sent: dict[tuple[int, str], float] = {}
    motion = MotionDetector(); last_motion = 0.0; last_face = 0.0
    cap = open_source(args.source, cfg)
    try:
      while True:
        ok, frame = cap.read()
        if not ok:
            # DVR streams drop (timeouts, corrupt HEVC frames). Reconnect
            # instead of exiting, so alerts keep flowing unattended.
            print('camera stream lost; reconnecting in 3 s', flush=True)
            cap.release(); time.sleep(3); cap = open_source(args.source, cfg)
            continue
        live.process(frame)
        now = time.monotonic()
        moving = motion.largest_moving_pct(frame)
        results = live.active_results()
        if results: last_face = now
        # Movement with no face in view for a few seconds: report it, at most every 15 s.
        if moving and now - last_face > 3 and now - last_motion > 15:
          try: send_motion(args.stmc_url, token, args.camera, args.zone, moving); last_motion = now; print(f'motion reported ({moving:.1f}% of frame)', flush=True)
          except requests.RequestException as error: print(f'event delivery failed: {error}', flush=True)
        for track, result in results:
          key = (track.track_id, result.person_id or 'unknown')
          if now - sent.get(key, 0) < 10: continue
          try: send(args.stmc_url, token, args.camera, args.zone, track, result); sent[key] = now
          except requests.RequestException as error: print(f'event delivery failed: {error}', flush=True)
    finally: cap.release(); gallery.close()

if __name__ == '__main__': main()
