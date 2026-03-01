import express from 'express';
import session from 'express-session';
import FileStoreFactory from 'session-file-store';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { getConfig } from './config';
import { authRouter } from './routes/auth';
import { bloodValuesRouter } from './routes/bloodvalues';
import { referenceRouter } from './routes/reference';
import { aiRouter } from './routes/ai';
import { tokensRouter } from './routes/tokens';
import { adminReferenceRouter } from './routes/adminReference';
import { userRouter } from './routes/user';

const FileStore = FileStoreFactory(session);
const config = getConfig();

// Ensure data directories exist
const dataDir = config.DATA_DIR;
const sessionDir = path.join(dataDir, 'sessions');
[dataDir, path.join(dataDir, 'users'), sessionDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const app = express();

// Trust proxy (for running behind Traefik/Nginx)
if (config.TRUST_PROXY > 0) {
  app.set('trust proxy', config.TRUST_PROXY);
}

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
      },
    },
  })
);

// CORS (only needed in dev when frontend runs on different port)
if (config.NODE_ENV === 'development') {
  app.use(
    cors({
      origin: ['http://localhost:5173', 'http://localhost:3000'],
      credentials: true,
    })
  );
}

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Session
app.use(
  session({
    store: new FileStore({
      path: sessionDir,
      ttl: 7 * 24 * 60 * 60, // 7 days in seconds
      reapInterval: 60 * 60, // cleanup every hour
      logFn: () => {}, // suppress logs
    }),
    secret: config.APP_SECRET,
    resave: false,
    saveUninitialized: false,
    name: 'bt.sid',
    cookie: {
      httpOnly: true,
      secure: config.SECURE_COOKIES,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    },
  })
);

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use('/api/auth', authRouter);
app.use('/api/bloodvalues', bloodValuesRouter);
app.use('/api/reference', referenceRouter);
app.use('/api/ai', aiRouter);
app.use('/api/tokens', tokensRouter);
app.use('/api/admin/reference', adminReferenceRouter);
app.use('/api/user', userRouter);

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Serve Frontend ───────────────────────────────────────────────────────────

const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  app.get('*', (_req, res) => {
    res.status(200).send(`
      <h1>Blutwerte Backend läuft</h1>
      <p>Frontend nicht gebaut. Im Development-Modus läuft das Frontend auf Port 5173.</p>
      <p>API verfügbar unter <a href="/api/auth/me">/api/auth/me</a></p>
    `);
  });
}

// ─── Error Handler ────────────────────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err.message);
  if (config.NODE_ENV === 'development') {
    res.status(500).json({ error: err.message, stack: err.stack });
  } else {
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(config.PORT, () => {
  console.log(`🩸 Blutwerte-App läuft auf Port ${config.PORT}`);
  console.log(`   Umgebung: ${config.NODE_ENV}`);
  console.log(`   LLM Provider: ${config.LLM_PROVIDER} (${config.LLM_MODEL})`);
  console.log(`   OIDC: ${config.DEV_AUTO_LOGIN ? 'DEV AUTO-LOGIN' : config.OIDC_ISSUER_URL || 'nicht konfiguriert'}`);
  console.log(`   Datenverzeichnis: ${config.DATA_DIR}`);
});
