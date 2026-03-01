# Blutwerte-App

Eine selbst gehostete Web-App zur Verwaltung und Auswertung von Blutwerten mit KI-Unterstützung.

## Features

- **Blutwerte erfassen** — Laborwerte manuell eingeben, mit Datum und Laborname
- **Auswertung** — Ampel-System (Normal / Grenzwertig / Erhöht / Kritisch) mit geschlechtsspezifischen Referenzbereichen
- **Verlaufscharts** — Zeitlicher Verlauf einzelner Werte mit Referenzbereich-Overlay
- **KI-Doktor** — Chat mit einem LLM-gestützten Assistenten, der die eigenen Blutwerte kennt
- **Referenzdatenbank** — 39+ Blutwerte mit deutschen Laboreinheiten, Beschreibungen und Empfehlungen
- **API-Tokens** — Programmatischer Zugriff für Import-Skripte
- **Admin-Bereich** — Referenzwerte verwalten (CRUD)
- **Dark Mode** — systemseitig oder manuell umschaltbar

## Voraussetzungen

- Docker & Docker Compose
- Ein OIDC-Provider (Authentik, Keycloak, Authelia, …) **oder** `DEV_AUTO_LOGIN=true` für lokale Entwicklung

## Schnellstart

```bash
git clone https://github.com/danst0/blutwerte.git
cd blutwerte
cp .env.example .env
# .env anpassen (APP_SECRET, OIDC-Daten, LLM-Provider)
docker compose up -d
```

Die App ist danach unter `http://localhost:3000` erreichbar.

## Konfiguration

Alle Einstellungen werden über Umgebungsvariablen gesetzt (siehe `.env.example`).

### Pflichtfelder

| Variable | Beschreibung |
|---|---|
| `APP_SECRET` | Zufälliger String ≥ 32 Zeichen für Session-Verschlüsselung |
| `OIDC_ISSUER_URL` | Issuer-URL des OIDC-Providers |
| `OIDC_CLIENT_ID` | Client-ID beim OIDC-Provider |
| `OIDC_REDIRECT_URI` | Muss auf `https://deine-domain.com/api/auth/callback` enden |

### LLM-Provider

| Provider | `LLM_PROVIDER` | Hinweis |
|---|---|---|
| Google Gemini | `gemini` | Standard, `gemini-2.5-flash` empfohlen |
| OpenAI | `openai` | GPT-4o o.ä. |
| Anthropic | `anthropic` | Claude-Modelle |
| Ollama (lokal) | `ollama` | Kein API-Key nötig |
| OpenAI-kompatibel | `openai_compatible` | LM Studio, vLLM, … |

### Entwicklung ohne Docker

```bash
# Backend
cd backend && npm install
DEV_AUTO_LOGIN=true SECURE_COOKIES=false DATA_DIR=../data npm run dev

# Frontend (zweites Terminal)
cd frontend && npm install && npm run dev
```

Frontend läuft auf Port 5173 und proxyt `/api` → Backend auf Port 3000.

### Admin-Zugang

In `.env` kommagetrennte OIDC-`sub`-Claims oder E-Mail-Adressen eintragen:

```
ADMIN_USER_IDS=dev-user,max@example.com
```

Im Dev-Modus (`DEV_AUTO_LOGIN=true`) ist die User-ID immer `dev-user`.

## Datenhaltung

Alle Daten liegen als JSON-Dateien im `data/`-Verzeichnis — kein Datenbankserver nötig.

```
data/
├── users/{userId}/
│   ├── bloodvalues.json     # Profil, Einträge, API-Tokens
│   └── chat_history.json    # KI-Chat-Verlauf
├── reference_values.json    # Referenzwerte-Datenbank
├── sessions/                # Session-Dateien
└── ai_rate_limits.json      # Rate-Limiting (50 KI-Anfragen/Nutzer/Tag)
```

Das `data/`-Verzeichnis wird per Volume in den Container gemountet und überlebt Updates.

## Hinter einem Reverse Proxy (Traefik/Nginx)

```env
TRUST_PROXY=1
SECURE_COOKIES=true
```

Traefik-Labels sind im `docker-compose.yml` als Kommentar vorbereitet.

## Tech Stack

| Bereich | Technologie |
|---|---|
| Backend | Node.js 20, TypeScript, Express 4 |
| Frontend | React 18, TypeScript, Vite 5, Tailwind CSS 3, Recharts |
| Auth | OIDC PKCE Authorization Code Flow (ohne externe Library) |
| Storage | JSON-Dateien pro Nutzer |
| Deployment | Docker, 4-Stage Multi-Stage Build |

## Lizenz

MIT
