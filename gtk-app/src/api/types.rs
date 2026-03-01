use serde::{Deserialize, Serialize};

// ─── Auth ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize, Default)]
pub struct AuthUser {
    pub authenticated: bool,
    #[serde(rename = "userId")]
    pub user_id: Option<String>,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    pub email: Option<String>,
    #[serde(rename = "isAdmin")]
    pub is_admin: Option<bool>,
    pub gender: Option<String>,
}

// ─── Blood Values ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct BloodValue {
    pub name: String,
    pub value: f64,
    pub unit: String,
    pub category: String,
    pub short_name: Option<String>,
    pub long_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BloodEntry {
    pub id: String,
    pub date: String,
    pub lab_name: Option<String>,
    pub notes: Option<String>,
    pub values: Vec<BloodValue>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UserData {
    pub user_id: String,
    pub display_name: String,
    pub email: String,
    pub gender: Option<String>,
    pub entries: Vec<BloodEntry>,
}

// ─── Reference Values ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct ReferenceValue {
    pub id: String,
    pub name: String,
    pub short_name: Option<String>,
    pub long_name: Option<String>,
    pub aliases: Vec<String>,
    pub category: String,
    pub unit: String,
    pub ref_min: Option<f64>,
    pub ref_max: Option<f64>,
    pub ref_min_female: Option<f64>,
    pub ref_max_female: Option<f64>,
    pub ref_min_male: Option<f64>,
    pub ref_max_male: Option<f64>,
    pub optimal_min: Option<f64>,
    pub optimal_max: Option<f64>,
    pub critical_low: Option<f64>,
    pub critical_high: Option<f64>,
    pub description: String,
    pub high_info: String,
    pub low_info: String,
    pub recommendations: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ReferenceDatabase {
    pub version: String,
    pub updated: String,
    pub values: Vec<ReferenceValue>,
}

// ─── Value Status ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ValueStatus {
    Normal,
    Warning,
    High,
    Low,
    CriticalHigh,
    CriticalLow,
    Unknown,
}

impl ValueStatus {
    pub fn label(&self) -> &'static str {
        match self {
            ValueStatus::Normal => "Normal",
            ValueStatus::Warning => "Grenzwertig",
            ValueStatus::High => "Erhöht",
            ValueStatus::Low => "Erniedrigt",
            ValueStatus::CriticalHigh => "Kritisch hoch",
            ValueStatus::CriticalLow => "Kritisch niedrig",
            ValueStatus::Unknown => "Unbekannt",
        }
    }

    /// RGB color for status indicator
    pub fn color(&self) -> (f64, f64, f64) {
        match self {
            ValueStatus::Normal => (0.133, 0.773, 0.369),      // green-500
            ValueStatus::Warning => (0.961, 0.620, 0.043),     // amber-500
            ValueStatus::High | ValueStatus::Low => (0.937, 0.267, 0.267), // red-500
            ValueStatus::CriticalHigh | ValueStatus::CriticalLow => (0.498, 0.110, 0.110), // red-800
            ValueStatus::Unknown => (0.612, 0.639, 0.659),     // gray-500
        }
    }
}

pub fn get_effective_range(
    ref_val: &ReferenceValue,
    gender: Option<&str>,
) -> (Option<f64>, Option<f64>) {
    let mut min = ref_val.ref_min;
    let mut max = ref_val.ref_max;

    if gender == Some("female") {
        if ref_val.ref_min_female.is_some() {
            min = ref_val.ref_min_female;
        }
        if ref_val.ref_max_female.is_some() {
            max = ref_val.ref_max_female;
        }
    } else if gender == Some("male") {
        if ref_val.ref_min_male.is_some() {
            min = ref_val.ref_min_male;
        }
        if ref_val.ref_max_male.is_some() {
            max = ref_val.ref_max_male;
        }
    }

    (min, max)
}

pub fn get_value_status(
    value: f64,
    ref_val: &ReferenceValue,
    gender: Option<&str>,
) -> ValueStatus {
    if let Some(cl) = ref_val.critical_low {
        if value <= cl {
            return ValueStatus::CriticalLow;
        }
    }
    if let Some(ch) = ref_val.critical_high {
        if value >= ch {
            return ValueStatus::CriticalHigh;
        }
    }

    let (min, max) = get_effective_range(ref_val, gender);

    match (min, max) {
        (Some(min), Some(max)) => {
            if value < min {
                return ValueStatus::Low;
            }
            if value > max {
                return ValueStatus::High;
            }
            let range = max - min;
            let buffer = range * 0.1;
            if value < min + buffer || value > max - buffer {
                return ValueStatus::Warning;
            }
            ValueStatus::Normal
        }
        (Some(min), None) => {
            if value < min {
                ValueStatus::Low
            } else {
                ValueStatus::Normal
            }
        }
        (None, Some(max)) => {
            if value > max {
                ValueStatus::High
            } else {
                ValueStatus::Normal
            }
        }
        _ => ValueStatus::Unknown,
    }
}

pub fn get_trend(history: &[ValueHistoryPoint]) -> Option<Trend> {
    if history.len() < 2 {
        return None;
    }
    let last = history[history.len() - 1].value;
    let prev = history[history.len() - 2].value;
    if prev.abs() < f64::EPSILON {
        return None;
    }
    let diff = ((last - prev) / prev.abs()) * 100.0;
    if diff.abs() < 5.0 {
        Some(Trend::Stable)
    } else if diff > 0.0 {
        Some(Trend::Up)
    } else {
        Some(Trend::Down)
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Trend {
    Up,
    Down,
    Stable,
}

// ─── History ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct ValueHistoryPoint {
    pub date: String,
    pub value: f64,
    pub unit: String,
    #[serde(rename = "entryId")]
    pub entry_id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ValueHistory {
    pub name: String,
    pub history: Vec<ValueHistoryPoint>,
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ChatMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatHistory {
    pub user_id: String,
    pub messages: Vec<ChatMessage>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatResponse {
    pub message: ChatMessage,
    #[serde(rename = "userMessage")]
    pub user_message: ChatMessage,
}
