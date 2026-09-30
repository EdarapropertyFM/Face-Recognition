# Deploying STMC on a server

STMC is a face-recognition access system for a residential community. It runs
as four containers: PostgreSQL, the Python recognition service, the NestJS
API, and the React frontend behind nginx.

A clean deployment starts with **an empty database and no residents**. The
tables are created automatically; the community's data is entered through the
app afterwards.

You need: a Linux server with Docker and the Compose plugin, roughly 8 GB of
RAM (the face model is the hungry part), 20 GB of disk, and network access
from the server to the building's DVR or cameras.

---

## 1. Clone and configure

```sh
git clone <this repo> stmc
cd stmc
cp .env.example .env
./scripts/generate-secrets.sh >> .env
```

`generate-secrets.sh` appends correctly generated values for every key. Then
open `.env` and set the four things it cannot guess:

| Setting | What to put |
|---|---|
| `FRONTEND_ORIGINS` | The exact address people will type, e.g. `http://10.0.0.50` or `https://stmc.company.com`. No trailing slash. |
| `HTTP_PORT` | `80`, unless something else on the server already uses it. |
| `ADMIN_USERNAME` | The first login name. `admin` is fine. |
| `DB_USER` / `DB_NAME` | `stmc` for both is fine. |

The generator already filled `ADMIN_PASSWORD` — find it in `.env`, you will
need it to log in the first time.

> **Back up `BIOMETRIC_ENCRYPTION_KEY` somewhere other than this server.**
> It encrypts every ID card, lease, vehicle licence and face image on disk.
> If it is lost, those files can never be read again. Losing it is not
> recoverable by us or by anyone.

Never commit `.env`. It is already in `.gitignore`.

## 2. Start

```sh
docker compose up -d --build
```

The first build takes 10–20 minutes, mostly compiling the Python imaging
wheels. The first start then downloads the ~280 MB face model into `./data`.
On a slow connection that alone can take 20 minutes, and the `ai` container
reports itself as `unhealthy` until it finishes — that is expected on a
first run, not a fault. Watch it progress with `du -sh data/`.

Nothing else waits for it: the app, the login and enrolment all work while
the model is still downloading. Only face recognition needs it.

Watch it come up:

```sh
docker compose logs -f backend
```

You are looking for, in order:

```
[entrypoint] waiting for the database at db:5432...
[entrypoint] running migrations...
Migration StmcBaseline... has been executed successfully
[entrypoint] starting the API
Created the first administrator account: admin
Nest application successfully started
```

The migrations run automatically on every start, so deploying a later version
that adds a column needs no manual step.

## 3. Check it

Open `http://<server>/` and log in with `ADMIN_USERNAME` and
`ADMIN_PASSWORD` from `.env`. **Change that password in the app immediately**
— it is sitting in a file on disk.

From the server itself:

```sh
curl -I http://localhost/                 # the app -> 200
curl -s http://localhost/api/units/enrollment-options   # -> []
```

An empty `[]` is correct on a fresh install: no projects exist yet.

## 4. Enter the community's data

In this order, as an administrator:

1. **Units** → create the project, its buildings, and the unit codes.
   Residents can only pick from these, so nothing can be mistyped.
2. **Cameras** → add each camera or DVR channel with its address and
   credentials. Passwords are encrypted before they are stored.
3. Send residents to `http://<server>/enroll` to register themselves.

Registration will not open until at least one building has its unit list.

---

## How it is wired

Only one port is published: the frontend's. nginx serves the app and proxies
`/api` to the backend inside the Docker network. The API and the recognition
service are **not** reachable from outside, so the firewall needs one port
open, not three.

```
browser --> :80 nginx ┬─ static files
                      └─ /api -> backend:3000 -> ai:8000
                                      └------> db:5432
```

## What to back up

Three things, together — a database restored without its storage directory
leaves records pointing at documents that no longer exist:

| What | Where |
|---|---|
| Database | `docker compose exec db pg_dump -U stmc stmc > dump.sql` |
| Encrypted documents | the `backend_storage` Docker volume |
| Face gallery, model, evidence clips | `./data` (a plain directory) |

And keep `.env` — specifically `BIOMETRIC_ENCRYPTION_KEY` — somewhere else
entirely.

## Updating

```sh
git pull
docker compose up -d --build
```

Migrations run on start. Nothing else to do.

## Serving it over HTTPS

Put a reverse proxy (nginx, Caddy, Traefik) in front, terminate TLS there,
and forward to `HTTP_PORT`. Then change `FRONTEND_ORIGINS` in `.env` to the
`https://` address and run `docker compose up -d` again. Everything already
travels on one origin, so nothing else changes.

## When something is wrong

**Pages load but no data appears, console shows CORS errors.**
`FRONTEND_ORIGINS` does not match the address in the browser's URL bar.
It must match exactly — scheme, host and port, no trailing slash.

**The backend keeps restarting.** `docker compose logs backend`. A startup
that refuses with a message about a secret is doing its job: in production
the server will not start with a weak or missing key.

**Cameras show as offline.** The server must be able to reach the DVR.
`docker compose exec ai curl -v telnet://<dvr-ip>:554`. Check the firewall
between the server and the camera network first.

**Nothing appears in Alerts or Track & Trace.** Check `CAMERA_MONITORING=true`
in `.env`, then `docker compose logs ai` for the line reporting which backend
URL and token it is using. It must say `http://backend:3000`, not `127.0.0.1`.

**Uploads fail on large registrations.** nginx accepts 32 MB per request. A
registration with many lease pages could exceed that; raise
`client_max_body_size` in `frontend/nginx.conf`.

## A limitation to know about before the handover

Recognition accuracy depends almost entirely on camera placement. On the
current installation the cameras look down from ceiling height, so faces
arrive small and at a steep angle and often cannot be identified — this is a
physical limit of the images, not a software setting, and no amount of
tuning fixes it. Cameras mounted at head height, facing people as they
approach, are what makes identification reliable.
