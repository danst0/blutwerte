use cairo::Context;
use crate::api::types::*;

pub fn build_chart(
    cr: &Context,
    width: i32,
    height: i32,
    history: &[ValueHistoryPoint],
    ref_val: Option<&ReferenceValue>,
    gender: Option<&str>,
) {
    let w = width as f64;
    let h = height as f64;

    // Margins
    let margin_left = 60.0;
    let margin_right = 20.0;
    let margin_top = 16.0;
    let margin_bottom = 40.0;

    let plot_w = w - margin_left - margin_right;
    let plot_h = h - margin_top - margin_bottom;

    if plot_w <= 0.0 || plot_h <= 0.0 || history.is_empty() {
        // Draw empty state
        cr.set_source_rgb(0.5, 0.5, 0.5);
        let _ = cr.select_font_face("Sans", cairo::FontSlant::Normal, cairo::FontWeight::Normal);
        cr.set_font_size(13.0);
        let text = "Keine Daten im gewählten Zeitraum";
        let text_w = cr.text_extents(text).map(|e| e.width()).unwrap_or(0.0);
        let _ = cr.move_to(w / 2.0 - text_w / 2.0, h / 2.0);
        let _ = cr.show_text(text);
        return;
    }

    // Compute Y domain
    let values: Vec<f64> = history.iter().map(|h| h.value).collect();
    let data_min = values.iter().cloned().fold(f64::INFINITY, f64::min);
    let data_max = values.iter().cloned().fold(f64::NEG_INFINITY, f64::max);

    let (ref_min, ref_max) = ref_val
        .map(|r| get_effective_range(r, gender))
        .unwrap_or((None, None));

    let y_min_raw = [
        data_min,
        ref_min.unwrap_or(data_min),
        ref_val.and_then(|r| r.critical_low).unwrap_or(data_min),
    ]
    .iter()
    .cloned()
    .fold(f64::INFINITY, f64::min);

    let y_max_raw = [
        data_max,
        ref_max.unwrap_or(data_max),
        ref_val.and_then(|r| r.critical_high).unwrap_or(data_max),
    ]
    .iter()
    .cloned()
    .fold(f64::NEG_INFINITY, f64::max);

    let pad = (y_max_raw - y_min_raw) * 0.15;
    let pad = if pad < 0.001 { 1.0 } else { pad };
    let y_min = y_min_raw - pad;
    let y_max = y_max_raw + pad;

    let to_x = |idx: usize| -> f64 {
        if history.len() == 1 {
            margin_left + plot_w / 2.0
        } else {
            margin_left + idx as f64 / (history.len() - 1) as f64 * plot_w
        }
    };

    let to_y = |val: f64| -> f64 {
        let frac = (val - y_min) / (y_max - y_min);
        margin_top + (1.0 - frac) * plot_h
    };

    // Background
    cr.set_source_rgb(1.0, 1.0, 1.0);
    let _ = cr.paint();

    // Grid lines & Y axis labels
    cr.set_source_rgba(0.0, 0.0, 0.0, 0.1);
    cr.set_line_width(1.0);
    let _ = cr.select_font_face("Sans", cairo::FontSlant::Normal, cairo::FontWeight::Normal);
    cr.set_font_size(10.0);

    let grid_steps = 5;
    for i in 0..=grid_steps {
        let val = y_min + (y_max - y_min) * i as f64 / grid_steps as f64;
        let y = to_y(val);

        // Grid line
        cr.set_source_rgba(0.0, 0.0, 0.0, 0.08);
        let _ = cr.move_to(margin_left, y);
        let _ = cr.line_to(margin_left + plot_w, y);
        let _ = cr.stroke();

        // Y label
        cr.set_source_rgb(0.4, 0.4, 0.4);
        let label = format_axis_val(val);
        let (lbl_w, lbl_h) = cr.text_extents(&label)
            .map(|e| (e.width(), e.height()))
            .unwrap_or((0.0, 0.0));
        let _ = cr.move_to(margin_left - lbl_w - 6.0, y + lbl_h / 2.0);
        let _ = cr.show_text(&label);
    }

    // Reference range shaded area
    if let (Some(mn), Some(mx)) = (ref_min, ref_max) {
        let y1 = to_y(mx);
        let y2 = to_y(mn);
        cr.set_source_rgba(0.133, 0.773, 0.369, 0.12); // green
        cr.rectangle(margin_left, y1, plot_w, y2 - y1);
        let _ = cr.fill();

        // Reference range borders
        cr.set_source_rgba(0.133, 0.773, 0.369, 0.6);
        cr.set_line_width(1.0);
        cr.set_dash(&[4.0, 4.0], 0.0);
        let _ = cr.move_to(margin_left, y1);
        let _ = cr.line_to(margin_left + plot_w, y1);
        let _ = cr.stroke();
        let _ = cr.move_to(margin_left, y2);
        let _ = cr.line_to(margin_left + plot_w, y2);
        let _ = cr.stroke();
        cr.set_dash(&[], 0.0);
    }

    // Critical lines
    if let Some(r) = ref_val {
        cr.set_source_rgba(0.937, 0.267, 0.267, 0.8);
        cr.set_line_width(1.5);
        cr.set_dash(&[4.0, 4.0], 0.0);

        if let Some(cl) = r.critical_low {
            let y = to_y(cl);
            let _ = cr.move_to(margin_left, y);
            let _ = cr.line_to(margin_left + plot_w, y);
            let _ = cr.stroke();
        }
        if let Some(ch) = r.critical_high {
            let y = to_y(ch);
            let _ = cr.move_to(margin_left, y);
            let _ = cr.line_to(margin_left + plot_w, y);
            let _ = cr.stroke();
        }
        cr.set_dash(&[], 0.0);
    }

    // Data line
    cr.set_source_rgb(0.231, 0.510, 0.965); // blue-500
    cr.set_line_width(2.0);

    for (i, point) in history.iter().enumerate() {
        let x = to_x(i);
        let y = to_y(point.value);
        if i == 0 {
            let _ = cr.move_to(x, y);
        } else {
            let _ = cr.line_to(x, y);
        }
    }
    let _ = cr.stroke();

    // Data points (colored by status)
    for (i, point) in history.iter().enumerate() {
        let x = to_x(i);
        let y = to_y(point.value);

        let status = ref_val
            .map(|r| get_value_status(point.value, r, gender))
            .unwrap_or(ValueStatus::Unknown);
        let (r, g, b) = status.color();

        // Outer white ring
        cr.set_source_rgb(1.0, 1.0, 1.0);
        cr.arc(x, y, 6.0, 0.0, 2.0 * std::f64::consts::PI);
        let _ = cr.fill();

        // Colored dot
        cr.set_source_rgb(r, g, b);
        cr.arc(x, y, 5.0, 0.0, 2.0 * std::f64::consts::PI);
        let _ = cr.fill();
    }

    // X axis date labels (rotated)
    cr.set_source_rgb(0.4, 0.4, 0.4);
    cr.set_font_size(9.0);

    let max_labels = 8;
    let step = (history.len() / max_labels).max(1);

    for (i, point) in history.iter().enumerate().step_by(step) {
        let x = to_x(i);
        let label = format_date_short(&point.date);

        cr.save().ok();
        let _ = cr.translate(x, margin_top + plot_h + 6.0);
        let _ = cr.rotate(-std::f64::consts::PI / 4.0);
        let _ = cr.move_to(0.0, 0.0);
        let _ = cr.show_text(&label);
        cr.restore().ok();
    }
}

fn format_axis_val(v: f64) -> String {
    if v.abs() >= 100.0 {
        format!("{:.0}", v)
    } else if v.abs() >= 10.0 {
        format!("{:.1}", v)
    } else {
        format!("{:.2}", v)
    }
}

fn format_date_short(date_str: &str) -> String {
    let parts: Vec<&str> = date_str.split('-').collect();
    if parts.len() == 3 {
        format!("{}.{}", parts[2], parts[1])
    } else {
        date_str.to_string()
    }
}
