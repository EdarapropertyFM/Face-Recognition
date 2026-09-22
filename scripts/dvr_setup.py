"""Connect to a DVR/NVR from the terminal and test its channels.

    python -m scripts.dvr_setup --host 192.168.1.108 --user admin --password '...' --brand hikvision --channels 8
    python -m scripts.dvr_setup --test                 # re-test the saved DVR
    python -m scripts.dvr_setup --show                 # print saved settings (password masked)
    python -m scripts.dvr_setup --forget

Afterwards use  dvr:<channel>  as a source anywhere:
    python -m scripts.live_demo --source dvr:3
    http://127.0.0.1:8000/live?source=dvr:3
"""
from __future__ import annotations

import argparse
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from facerec import load_config  # noqa: E402
from facerec.dvr import (  # noqa: E402
    URL_TEMPLATES, DVRConfig, clear_dvr, dvr_path, load_dvr, probe_channel, save_dvr,
)


def show(d: DVRConfig) -> None:
    print(f"DVR {d.name or ''} {d.username}@{d.host}:{d.port}  brand={d.brand}  "
          f"channels={d.channels}  stream={d.stream}")
    print(f"  example: {d.masked_url(1)}")


def test_channels(d: DVRConfig, first: int, last: int, timeout: float) -> int:
    chans = list(range(first, last + 1))
    print(f"testing channels {first}..{last} on {d.host} ({d.stream} stream, {timeout:.0f}s each)...")
    with ThreadPoolExecutor(max_workers=min(8, len(chans))) as ex:
        results = list(ex.map(lambda ch: probe_channel(d, ch, timeout)[0], chans))
    ok = 0
    for r in results:
        if r.ok:
            ok += 1
            print(f"  ch{r.channel:<3} OK    {r.width}x{r.height} @ {r.fps} fps   ({r.seconds}s)   -> dvr:{r.channel}")
        else:
            print(f"  ch{r.channel:<3} FAIL  {r.error}   ({r.seconds}s)")
    print(f"{ok}/{len(results)} channels responded")
    if ok == 0:
        print("\nnothing responded. Check: IP reachable (ping), RTSP enabled on the DVR and port "
              "(usually 554), username/password are the DVR's RTSP credentials, brand/URL pattern. "
              "Try --stream main, or another --brand; run --brands to see the URL patterns.")
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host")
    ap.add_argument("--port", type=int, default=554)
    ap.add_argument("--user", default="admin")
    ap.add_argument("--password")
    ap.add_argument("--brand", default="hikvision", choices=sorted(URL_TEMPLATES))
    ap.add_argument("--url-template", default="", help="for --brand custom")
    ap.add_argument("--channels", type=int, default=8)
    ap.add_argument("--stream", default="sub", choices=["sub", "main"])
    ap.add_argument("--name", default="")
    ap.add_argument("--test", action="store_true", help="probe the channels of the saved DVR")
    ap.add_argument("--first", type=int, default=1)
    ap.add_argument("--last", type=int)
    ap.add_argument("--timeout", type=float, default=6.0)
    ap.add_argument("--show", action="store_true")
    ap.add_argument("--brands", action="store_true", help="list known RTSP URL patterns")
    ap.add_argument("--forget", action="store_true", help="delete the saved credentials")
    args = ap.parse_args()
    cfg = load_config()

    if args.brands:
        for k, v in URL_TEMPLATES.items():
            print(f"{k:<10} {v or '(supply --url-template)'}")
        return 0
    if args.forget:
        clear_dvr(cfg)
        print(f"removed {dvr_path(cfg)}")
        return 0

    if args.host:
        if args.password is None:
            ap.error("--password is required with --host")
        d = DVRConfig(host=args.host, username=args.user, password=args.password, port=args.port,
                      brand=args.brand, channels=args.channels, stream=args.stream,
                      url_template=args.url_template, name=args.name)
        try:
            d.rtsp_url(1)
        except ValueError as e:
            ap.error(str(e))
        save_dvr(cfg, d)
        print(f"saved to {dvr_path(cfg)} (git-ignored; password stored in plain text)")
        show(d)
        return test_channels(d, args.first, args.last or d.channels, args.timeout)

    d = load_dvr(cfg)
    if d is None:
        print("no DVR saved yet; run with --host/--user/--password")
        return 1
    show(d)
    if args.test:
        return test_channels(d, args.first, args.last or d.channels, args.timeout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
