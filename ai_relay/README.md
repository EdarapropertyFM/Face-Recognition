# STMC AI Event Relay

Runs separately from `ai_model` and sends a single camera's recognition events to STMC.

Set `STMC_AI_EVENT_TOKEN` to the same secret configured for the STMC backend, then run:

```powershell
$env:STMC_AI_EVENT_TOKEN = 'replace-with-a-secret'
..\ai_model\.venv\Scripts\python.exe relay.py --source dvr:1 --camera CAM-DVR-01 --zone 0
```
