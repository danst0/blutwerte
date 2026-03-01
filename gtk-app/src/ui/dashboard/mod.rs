pub mod summary_bar;
pub mod category_group;
pub mod value_card;

use gtk4::prelude::*;
use libadwaita::prelude::*;
use libadwaita as adw;

use crate::api::types::*;
use super::value_detail::build_value_detail_page;

pub fn build_dashboard_page(
    nav_view: &adw::NavigationView,
    user_data: &UserData,
    reference_db: &[ReferenceValue],
    gender: Option<&str>,
) -> adw::NavigationPage {
    let page = adw::NavigationPage::new(
        &gtk4::Label::new(None), // placeholder child, replaced below
        "Dashboard",
    );

    let scrolled = gtk4::ScrolledWindow::new();
    scrolled.set_hscrollbar_policy(gtk4::PolicyType::Never);
    scrolled.set_vexpand(true);

    let vbox = gtk4::Box::new(gtk4::Orientation::Vertical, 16);
    vbox.set_margin_top(16);
    vbox.set_margin_bottom(16);
    vbox.set_margin_start(16);
    vbox.set_margin_end(16);

    // Collect latest values across all entries
    let latest_values = collect_latest_values(user_data);

    // Summary bar
    let summary_counts = compute_summary_counts(&latest_values, reference_db, gender);
    let summary_bar = summary_bar::build_summary_bar(summary_counts);
    vbox.append(&summary_bar);

    // Alert banner for critical values
    let critical: Vec<_> = latest_values.iter().filter(|bv| {
        if let Some(ref_val) = find_reference(reference_db, &bv.name) {
            let status = get_value_status(bv.value, ref_val, gender);
            matches!(status, ValueStatus::CriticalHigh | ValueStatus::CriticalLow)
        } else {
            false
        }
    }).collect();

    if !critical.is_empty() {
        let names: Vec<_> = critical.iter().map(|v| v.name.as_str()).collect();
        let banner = adw::Banner::new(&format!(
            "Kritische Werte: {}",
            names.join(", ")
        ));
        banner.set_revealed(true);
        banner.add_css_class("error");
        vbox.append(&banner);
    }

    // Group by category
    let mut categories: Vec<String> = Vec::new();
    let mut by_category: std::collections::HashMap<String, Vec<&BloodValue>> =
        std::collections::HashMap::new();

    for bv in &latest_values {
        by_category.entry(bv.category.clone()).or_default().push(bv);
        if !categories.contains(&bv.category) {
            categories.push(bv.category.clone());
        }
    }

    for cat in &categories {
        if let Some(values) = by_category.get(cat) {
            let group = category_group::build_category_group(
                cat,
                values,
                reference_db,
                gender,
                nav_view,
                user_data,
            );
            vbox.append(&group);
        }
    }

    if latest_values.is_empty() {
        let empty_label = gtk4::Label::new(Some("Keine Blutwerte vorhanden.\nGib Werte im Web-UI ein."));
        empty_label.add_css_class("dim-label");
        empty_label.set_justify(gtk4::Justification::Center);
        empty_label.set_vexpand(true);
        empty_label.set_valign(gtk4::Align::Center);
        vbox.append(&empty_label);
    }

    scrolled.set_child(Some(&vbox));
    page.set_child(Some(&scrolled));
    page.set_tag(Some("dashboard"));
    page
}

pub fn collect_latest_values(user_data: &UserData) -> Vec<BloodValue> {
    let mut map: std::collections::HashMap<String, BloodValue> = std::collections::HashMap::new();
    let mut order: Vec<String> = Vec::new();

    // entries are assumed sorted oldest→newest; last one wins per name
    for entry in &user_data.entries {
        for bv in &entry.values {
            if !order.contains(&bv.name) {
                order.push(bv.name.clone());
            }
            map.insert(bv.name.clone(), bv.clone());
        }
    }

    order.into_iter().filter_map(|name| map.remove(&name)).collect()
}

pub fn find_reference<'a>(db: &'a [ReferenceValue], name: &str) -> Option<&'a ReferenceValue> {
    db.iter().find(|r| {
        r.name.eq_ignore_ascii_case(name)
            || r.aliases.iter().any(|a| a.eq_ignore_ascii_case(name))
    })
}

#[derive(Debug, Default)]
pub struct StatusCounts {
    pub normal: usize,
    pub warning: usize,
    pub abnormal: usize,
    pub critical: usize,
    pub total: usize,
}

fn compute_summary_counts(
    values: &[BloodValue],
    reference_db: &[ReferenceValue],
    gender: Option<&str>,
) -> StatusCounts {
    let mut counts = StatusCounts::default();
    for bv in values {
        counts.total += 1;
        if let Some(ref_val) = find_reference(reference_db, &bv.name) {
            match get_value_status(bv.value, ref_val, gender) {
                ValueStatus::Normal => counts.normal += 1,
                ValueStatus::Warning => counts.warning += 1,
                ValueStatus::CriticalHigh | ValueStatus::CriticalLow => counts.critical += 1,
                ValueStatus::High | ValueStatus::Low => counts.abnormal += 1,
                ValueStatus::Unknown => counts.normal += 1,
            }
        } else {
            counts.normal += 1;
        }
    }
    counts
}
