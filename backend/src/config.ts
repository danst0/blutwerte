import { z } from 'zod';
import path from 'path';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.coerce.number().default(3000),

  // OIDC
  OIDC_ISSUER_URL: z.string().url().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  OIDC_REDIRECT_URI: z.string().url().optional(),
  OIDC_SCOPES: z.string().default('openid profile email'),

  // LLM
  LLM_PROVIDER: z
    .enum(['gemini', 'openai', 'anthropic', 'ollama', 'openai_compatible'])
    .default('gemini'),
  LLM_API_URL: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default('gemini-2.5-flash'),

  // App
  APP_SECRET: z.string().min(8).default('dev-secret-change-in-production-min32chars'),
  DATA_DIR: z.string().default('/app/data'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Dev mode: auto-login without OIDC
  DEV_AUTO_LOGIN: z.coerce.boolean().default(false),
  TRUST_PROXY: z.coerce.number().default(0),
  SECURE_COOKIES: z.coerce.boolean().default(false),
});

export type Config = z.infer<typeof configSchema>;

let _config: Config;

export function getConfig(): Config {
  if (_config) return _config;

  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Configuration error:', JSON.stringify(result.error.format(), null, 2));
    process.exit(1);
  }
  _config = result.data;

  // Validate OIDC config if not in dev auto-login mode
  if (!_config.DEV_AUTO_LOGIN) {
    if (!_config.OIDC_ISSUER_URL || !_config.OIDC_CLIENT_ID || !_config.OIDC_REDIRECT_URI) {
      console.error(
        'OIDC configuration required. Set OIDC_ISSUER_URL, OIDC_CLIENT_ID, OIDC_REDIRECT_URI or enable DEV_AUTO_LOGIN=true'
      );
      process.exit(1);
    }
  }

  // Resolve data dir
  _config.DATA_DIR = path.resolve(_config.DATA_DIR);

  return _config;
}
