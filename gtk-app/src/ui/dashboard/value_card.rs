use gtk4::prelude::*;
use libadwaita::prelude::*;
use libadwaita as adw;

use crate::api::types::*;

pub fn build_value_card(
    bv: &BloodValue,
    ref_val: Option<&ReferenceValue>,
    gender: Option<&str>,
    history: &[ValueHistoryPoint],
) -> adw::ActionRow {
    let status = ref_val
        .map(|r| get_value_status(bv.value, r, gender))
        .unwrap_or(ValueStatus::Unknown);

    let trend = get_trend(history);

    let row = adw::ActionRow::new();
    row.set_title(&bv.name);
    row.set_activatable(true);

    // Status dot (colored circle)
    let dot = gtk4::DrawingArea::new();
    dot.set_size_request(12, 12);
    dot.set_valign(gtk4::Align::Center);
    let (r, g, b) = status.color();
    dot.set_draw_func(move |_, cr, w, h| {
        cr.set_source_rgb(r, g, b);
        cr.arc(w as f64 / 2.0, h as f64 / 2.0, 5.0, 0.0, 2.0 * std::f64::consts::PI);
        let _ = cr.fill();
    });
    row.add_prefix(&dot);

    // Value + unit label
    let value_str = format_value(bv.value);
    let suffix_label = gtk4::Label::new(Some(&format!("{} {}", value_str, bv.unit)));
    suffix_label.add_css_class("numeric");
    suffix_label.add_css_class("dim-label");
    row.add_suffix(&suffix_label);

    // Trend arrow
    let trend_icon = match trend {
        Some(Trend::Up) => "go-up-symbolic",
        Some(Trend::Down) => "go-down-symbolic",
        Some(Trend::Stable) => "go-next-symbolic",
        None => "",
    };
    if !trend_icon.is_empty() {
        let icon = gtk4::Image::from_icon_name(trend_icon);
        icon.set_pixel_size(16);
        icon.add_css_class("dim-label");
        row.add_suffix(&icon);
    }

    // Chevron for navigation
    row.set_subtitle(status.label());

    row
}

fn format_value(v: f64) -> String {
    if v.fract().abs() < f64::EPSILON {
        format!("{}", v as i64)
    } else {
        format!("{:.2}", v)
            .trim_end_matches('0')
            .trim_end_matches('.')
            .to_string()
    }
}
