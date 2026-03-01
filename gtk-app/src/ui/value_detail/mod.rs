pub mod chart;
pub mod history_table;

use gtk4::prelude::*;
use libadwaita::prelude::*;
use libadwaita as adw;
use std::cell::RefCell;
use std::rc::Rc;

use crate::api::types::*;
use chart::build_chart;
use history_table::build_history_table;

#[derive(Clone, Copy, PartialEq)]
enum TimeRange {
    SixMonths,
    OneYear,
    ThreeYears,
    All,
}

impl TimeRange {
    fn months(&self) -> Option<i64> {
        match self {
            TimeRange::SixMonths => Some(6),
            TimeRange::OneYear => Some(12),
            TimeRange::ThreeYears => Some(36),
            TimeRange::All => None,
        }
    }

    fn label(&self) -> &'static str {
        match self {
            TimeRange::SixMonths => "6 Monate",
            TimeRange::OneYear => "1 Jahr",
            TimeRange::ThreeYears => "3 Jahre",
            TimeRange::All => "Alle",
        }
    }
}

pub fn build_value_detail_page(
    name: &str,
    history: &[ValueHistoryPoint],
    ref_val: Option<&ReferenceValue>,
    gender: Option<&str>,
) -> adw::NavigationPage {
    let page = adw::NavigationPage::new(&gtk4::Label::new(None), name);
    page.set_title(name);

    let scrolled = gtk4::ScrolledWindow::new();
    scrolled.set_hscrollbar_policy(gtk4::PolicyType::Never);
    scrolled.set_vexpand(true);

    let vbox = gtk4::Box::new(gtk4::Orientation::Vertical, 16);
    vbox.set_margin_top(16);
    vbox.set_margin_bottom(16);
    vbox.set_margin_start(16);
    vbox.set_margin_end(16);

    // Header: latest value + trend
    let latest = history.last();
    let latest_status = latest.and_then(|l| {
        ref_val.map(|r| get_value_status(l.value, r, gender))
    }).unwrap_or(ValueStatus::Unknown);
    let trend = get_trend(history);

    let header_box = gtk4::Box::new(gtk4::Orientation::Horizontal, 12);
    header_box.set_hexpand(true);

    let title_vbox = gtk4::Box::new(gtk4::Orientation::Vertical, 4);
    title_vbox.set_hexpand(true);

    let title_label = gtk4::Label::new(Some(name));
    title_label.add_css_class("title-2");
    title_label.set_halign(gtk4::Align::Start);
    title_vbox.append(&title_label);

    if let Some(r) = ref_val {
        if !r.aliases.is_empty() {
            let alias_label = gtk4::Label::new(Some(&r.aliases.join(", ")));
            alias_label.add_css_class("caption");
            alias_label.add_css_class("dim-label");
            alias_label.set_halign(gtk4::Align::Start);
            alias_label.set_ellipsize(gtk4::pango::EllipsizeMode::End);
            title_vbox.append(&alias_label);
        }
    }
    header_box.append(&title_vbox);

    if let Some(l) = latest {
        let val_box = gtk4::Box::new(gtk4::Orientation::Vertical, 4);
        val_box.set_halign(gtk4::Align::End);

        let val_row = gtk4::Box::new(gtk4::Orientation::Horizontal, 6);
        val_row.set_halign(gtk4::Align::End);

        let val_label = gtk4::Label::new(Some(&format_value_unit(l.value, &l.unit)));
        val_label.add_css_class("title-1");
        val_row.append(&val_label);

        if let Some(t) = trend {
            let icon_name = match t {
                Trend::Up => "go-up-symbolic",
                Trend::Down => "go-down-symbolic",
                Trend::Stable => "go-next-symbolic",
            };
            let icon = gtk4::Image::from_icon_name(icon_name);
            icon.set_pixel_size(20);
            val_row.append(&icon);
        }

        val_box.append(&val_row);

        let status_label = gtk4::Label::new(Some(latest_status.label()));
        let (r_c, g_c, b_c) = latest_status.color();
        status_label.set_markup(&format!(
            "<span foreground='#{:02x}{:02x}{:02x}'>{}</span>",
            (r_c * 255.0) as u8,
            (g_c * 255.0) as u8,
            (b_c * 255.0) as u8,
            latest_status.label()
        ));
        status_label.set_halign(gtk4::Align::End);
        status_label.add_css_class("caption");

        let date_label = gtk4::Label::new(Some(&format_date(&l.date)));
        date_label.add_css_class("caption");
        date_label.add_css_class("dim-label");
        date_label.set_halign(gtk4::Align::End);

        val_box.append(&status_label);
        val_box.append(&date_label);
        header_box.append(&val_box);
    }
    vbox.append(&header_box);

    // Time filter buttons
    let current_range = Rc::new(RefCell::new(TimeRange::OneYear));
    let time_box = gtk4::Box::new(gtk4::Orientation::Horizontal, 4);

    let chart_area = gtk4::DrawingArea::new();
    chart_area.set_size_request(-1, 280);
    chart_area.set_hexpand(true);

    let chart_frame = gtk4::Frame::new(None);
    chart_frame.add_css_class("card");
    chart_frame.set_child(Some(&chart_area));

    let history_owned = history.to_vec();
    let ref_val_owned = ref_val.cloned();
    let gender_owned = gender.map(|s| s.to_string());

    // Draw function (called when range changes or chart is drawn)
    let setup_draw_func = {
        let history = history_owned.clone();
        let ref_val = ref_val_owned.clone();
        let gender = gender_owned.clone();
        let current_range = current_range.clone();

        move |area: &gtk4::DrawingArea| {
            let history = history.clone();
            let ref_val = ref_val.clone();
            let gender = gender.clone();
            let current_range = current_range.clone();

            area.set_draw_func(move |_, cr, width, height| {
                let range = *current_range.borrow();
                let filtered = filter_history(&history, range);
                build_chart(cr, width, height, &filtered, ref_val.as_ref(), gender.as_deref());
            });
        }
    };

    setup_draw_func(&chart_area);

    let time_ranges = [
        TimeRange::SixMonths,
        TimeRange::OneYear,
        TimeRange::ThreeYears,
        TimeRange::All,
    ];

    for tr in time_ranges {
        let btn = gtk4::ToggleButton::with_label(tr.label());
        if *current_range.borrow() == tr {
            btn.set_active(true);
        }
        btn.add_css_class("pill");
        btn.add_css_class("flat");

        let current_range_clone = current_range.clone();
        let chart_area_clone = chart_area.clone();

        btn.connect_toggled(move |b| {
            if b.is_active() {
                *current_range_clone.borrow_mut() = tr;
                chart_area_clone.queue_draw();
            }
        });

        time_box.append(&btn);
    }

    vbox.append(&time_box);
    vbox.append(&chart_frame);

    // Reference range info
    if let Some(r) = &ref_val_owned {
        let (ref_min, ref_max) = get_effective_range(r, gender_owned.as_deref());
        let ref_group = adw::PreferencesGroup::new();
        ref_group.set_title("Referenzbereiche");

        if let (Some(mn), Some(mx)) = (ref_min, ref_max) {
            let row = adw::ActionRow::new();
            row.set_title("Referenzbereich");
            let suffix = gtk4::Label::new(Some(&format!("{mn} – {mx} {}", r.unit)));
            suffix.add_css_class("numeric");
            row.add_suffix(&suffix);
            ref_group.add(&row);
        }
        if let (Some(mn), Some(mx)) = (r.optimal_min, r.optimal_max) {
            let row = adw::ActionRow::new();
            row.set_title("Optimaler Bereich");
            let suffix = gtk4::Label::new(Some(&format!("{mn} – {mx} {}", r.unit)));
            suffix.add_css_class("numeric");
            row.add_suffix(&suffix);
            ref_group.add(&row);
        }
        if let Some(cl) = r.critical_low {
            let row = adw::ActionRow::new();
            row.set_title("Kritisch niedrig");
            let suffix = gtk4::Label::new(Some(&format!("≤ {cl} {}", r.unit)));
            suffix.add_css_class("numeric");
            suffix.add_css_class("error");
            row.add_suffix(&suffix);
            ref_group.add(&row);
        }
        if let Some(ch) = r.critical_high {
            let row = adw::ActionRow::new();
            row.set_title("Kritisch hoch");
            let suffix = gtk4::Label::new(Some(&format!("≥ {ch} {}", r.unit)));
            suffix.add_css_class("numeric");
            suffix.add_css_class("error");
            row.add_suffix(&suffix);
            ref_group.add(&row);
        }
        vbox.append(&ref_group);

        // Info section
        let info_group = adw::PreferencesGroup::new();
        info_group.set_title("Info");

        let desc_row = adw::ExpanderRow::new();
        desc_row.set_title("Beschreibung");
        let desc_label = gtk4::Label::new(Some(&r.description));
        desc_label.set_wrap(true);
        desc_label.set_margin_start(12);
        desc_label.set_margin_end(12);
        desc_label.set_margin_top(8);
        desc_label.set_margin_bottom(8);
        desc_label.set_halign(gtk4::Align::Start);
        desc_row.add_row(&desc_label);
        info_group.add(&desc_row);

        if !r.recommendations.is_empty() {
            let rec_row = adw::ExpanderRow::new();
            rec_row.set_title("Empfehlungen");
            let rec_label = gtk4::Label::new(Some(&r.recommendations));
            rec_label.set_wrap(true);
            rec_label.set_margin_start(12);
            rec_label.set_margin_end(12);
            rec_label.set_margin_top(8);
            rec_label.set_margin_bottom(8);
            rec_label.set_halign(gtk4::Align::Start);
            rec_row.add_row(&rec_label);
            info_group.add(&rec_row);
        }

        vbox.append(&info_group);
    }

    // History table
    let table_group = adw::PreferencesGroup::new();
    table_group.set_title("Messverlauf");
    let table = history_table::build_history_table(history, ref_val_owned.as_ref(), gender_owned.as_deref());
    table_group.add(&table);
    vbox.append(&table_group);

    scrolled.set_child(Some(&vbox));
    page.set_child(Some(&scrolled));
    page
}

pub fn filter_history(history: &[ValueHistoryPoint], range: TimeRange) -> Vec<ValueHistoryPoint> {
    let months = match range.months() {
        None => return history.to_vec(),
        Some(m) => m,
    };

    let now = chrono::Utc::now();
    history
        .iter()
        .filter(|h| {
            if let Ok(date) = chrono::NaiveDate::parse_from_str(&h.date, "%Y-%m-%d") {
                let date_dt = date.and_hms_opt(0, 0, 0).unwrap().and_utc();
                let diff_months =
                    (now.year() - date_dt.year()) * 12 + now.month() as i32 - date_dt.month() as i32;
                diff_months <= months as i32
            } else {
                true
            }
        })
        .cloned()
        .collect()
}

fn format_value_unit(v: f64, unit: &str) -> String {
    let val_str = if v.fract().abs() < f64::EPSILON {
        format!("{}", v as i64)
    } else {
        let s = format!("{:.2}", v);
        s.trim_end_matches('0').trim_end_matches('.').to_string()
    };
    format!("{val_str} {unit}")
}

pub fn format_date(date_str: &str) -> String {
    let parts: Vec<&str> = date_str.split('-').collect();
    if parts.len() == 3 {
        format!("{}.{}.{}", parts[2], parts[1], parts[0])
    } else {
        date_str.to_string()
    }
}

use chrono::Datelike;
