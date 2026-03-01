use anyhow::{anyhow, Result};
use reqwest::{Client, StatusCode};
use serde_json::json;

use super::types::*;

#[derive(Debug, Clone)]
pub struct ApiClient {
    client: Client,
    base_url: String,
    token: String,
}

impl ApiClient {
    pub fn new(base_url: String, token: String) -> Result<Self> {
        let client = Client::builder()
            .build()
            .map_err(|e| anyhow!("Failed to create HTTP client: {e}"))?;
        Ok(Self { client, base_url, token })
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url.trim_end_matches('/'), path)
    }

    fn auth_header(&self) -> String {
        format!("Bearer {}", self.token)
    }

    pub async fn get_me(&self) -> Result<AuthUser> {
        let resp = self
            .client
            .get(self.url("/api/auth/me"))
            .header("Authorization", self.auth_header())
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(anyhow!("Auth failed: HTTP {}", resp.status()));
        }
        Ok(resp.json().await?)
    }

    pub async fn get_blood_values(&self) -> Result<UserData> {
        let resp = self
            .client
            .get(self.url("/api/bloodvalues"))
            .header("Authorization", self.auth_header())
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(anyhow!("Failed to fetch blood values: HTTP {}", resp.status()));
        }
        Ok(resp.json().await?)
    }

    pub async fn get_history(&self, name: &str) -> Result<ValueHistory> {
        let encoded = urlencoding::encode(name);
        let resp = self
            .client
            .get(self.url(&format!("/api/bloodvalues/history/{encoded}")))
            .header("Authorization", self.auth_header())
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(anyhow!("Failed to fetch history: HTTP {}", resp.status()));
        }
        Ok(resp.json().await?)
    }

    pub async fn get_reference(&self) -> Result<ReferenceDatabase> {
        let resp = self
            .client
            .get(self.url("/api/reference"))
            .header("Authorization", self.auth_header())
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(anyhow!("Failed to fetch reference DB: HTTP {}", resp.status()));
        }
        Ok(resp.json().await?)
    }

    pub async fn get_chat_history(&self) -> Result<ChatHistory> {
        let resp = self
            .client
            .get(self.url("/api/ai/history"))
            .header("Authorization", self.auth_header())
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(anyhow!("Failed to fetch chat history: HTTP {}", resp.status()));
        }
        Ok(resp.json().await?)
    }

    pub async fn clear_chat_history(&self) -> Result<()> {
        let resp = self
            .client
            .delete(self.url("/api/ai/history"))
            .header("Authorization", self.auth_header())
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(anyhow!("Failed to clear chat history: HTTP {}", resp.status()));
        }
        Ok(())
    }

    pub async fn send_chat(&self, message: &str) -> Result<ChatResponse> {
        let resp = self
            .client
            .post(self.url("/api/ai/chat"))
            .header("Authorization", self.auth_header())
            .json(&json!({ "message": message }))
            .send()
            .await?;

        match resp.status() {
            StatusCode::TOO_MANY_REQUESTS => {
                Err(anyhow!("RATE_LIMIT: Tägliches Limit erreicht (50 Anfragen/Tag). Bitte versuche es morgen wieder."))
            }
            s if !s.is_success() => {
                Err(anyhow!("Chat request failed: HTTP {s}"))
            }
            _ => Ok(resp.json().await?),
        }
    }
}
