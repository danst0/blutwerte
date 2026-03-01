use gtk4::prelude::*;
use libadwaita::prelude::*;
use libadwaita as adw;

use crate::api::types::*;
use super::format_date;

pub fn build_history_table(
    history: &[ValueHistoryPoint],
    ref_val: Option<&ReferenceValue>,
    gender: Option<&str>,
) -> gtk4::Widget {
    let list_box = gtk4::ListBox::new();
    list_box.set_selection_mode(gtk4::SelectionMode::None);
    list_box.add_css_class("boxed-list");

    if history.is_empty() {
        let row = adw::ActionRow::new();
        row.set_title("Keine Messwerte vorhanden");
        list_box.append(&row);
        return list_box.upcast();
    }

    // Reverse order (newest first)
    let mut sorted = history.to_vec();
    sorted.sort_by(|a, b| b.date.cmp(&a.date));

    for point in &sorted {
        let status = ref_val
            .map(|r| get_value_status(point.value, r, gender))
            .unwrap_or(ValueStatus::Unknown);

        let row = adw::ActionRow::new();
        row.set_title(&format_date(&point.date));

        let val_str = format_value(point.value, &point.unit);
        let value_label = gtk4::Label::new(Some(&val_str));
        value_label.add_css_class("numeric");
        value_label.set_valign(gtk4::Align::Center);
        row.add_suffix(&value_label);

        let status_label = gtk4::Label::new(Some(status.label()));
        let (r, g, b) = status.color();
        status_label.set_markup(&format!(
            "<span foreground='#{:02x}{:02x}{:02x}'>{}</span>",
            (r * 255.0) as u8,
            (g * 255.0) as u8,
            (b * 255.0) as u8,
            status.label()
        ));
        status_label.add_css_class("caption");
        status_label.set_valign(gtk4::Align::Center);
        row.add_suffix(&status_label);

        list_box.append(&row);
    }

    list_box.upcast()
}

fn format_value(v: f64, unit: &str) -> String {
    let val_str = if v.fract().abs() < f64::EPSILON {
        format!("{}", v as i64)
    } else {
        let s = format!("{:.2}", v);
        s.trim_end_matches('0').trim_end_matches('.').to_string()
    };
    format!("{val_str} {unit}")
}
