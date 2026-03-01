use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Config {
    pub server_url: String,
    pub api_token: String,
}

impl Config {
    pub fn is_configured(&self) -> bool {
        !self.server_url.is_empty() && !self.api_token.is_empty()
    }
}

pub fn config_path() -> PathBuf {
    let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("blutwerte-gtk").join("config.toml")
}

pub fn load_config() -> Result<Config> {
    let path = config_path();
    if !path.exists() {
        return Ok(Config::default());
    }
    let content = std::fs::read_to_string(&path)
        .with_context(|| format!("Failed to read config from {:?}", path))?;
    let config: Config = toml::from_str(&content).context("Failed to parse config.toml")?;
    Ok(config)
}

pub fn save_config(config: &Config) -> Result<()> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).context("Failed to create config directory")?;
    }
    let content = toml::to_string(config).context("Failed to serialize config")?;
    std::fs::write(&path, content)
        .with_context(|| format!("Failed to write config to {:?}", path))?;
    Ok(())
}
