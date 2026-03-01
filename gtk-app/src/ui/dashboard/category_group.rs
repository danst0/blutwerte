use gtk4::prelude::*;
use libadwaita::prelude::*;
use libadwaita as adw;
use glib::clone;

use crate::api::types::*;
use crate::ui::value_detail::build_value_detail_page;
use super::{find_reference, value_card::build_value_card};

pub fn build_category_group(
    category: &str,
    values: &[&BloodValue],
    reference_db: &[ReferenceValue],
    gender: Option<&str>,
    nav_view: &adw::NavigationView,
    user_data: &UserData,
) -> adw::PreferencesGroup {
    let group = adw::PreferencesGroup::new();
    group.set_title(category);

    for &bv in values {
        let ref_val = find_reference(reference_db, &bv.name);

        // Build history for trend
        let history = collect_history_for(user_data, &bv.name);
        let row = build_value_card(bv, ref_val, gender, &history);

        // Navigate to detail on click
        let bv_name = bv.name.clone();
        let ref_val_owned: Option<ReferenceValue> = ref_val.cloned();
        let user_data_clone = user_data.clone();
        let gender_owned = gender.map(|s| s.to_string());
        let nav_view_clone = nav_view.clone();
        let history_clone = history.clone();

        row.connect_activated(move |_| {
            let detail_page = build_value_detail_page(
                &bv_name,
                &history_clone,
                ref_val_owned.as_ref(),
                gender_owned.as_deref(),
            );
            nav_view_clone.push(&detail_page);
        });

        group.add(&row);
    }

    group
}

fn collect_history_for(user_data: &UserData, name: &str) -> Vec<ValueHistoryPoint> {
    user_data
        .entries
        .iter()
        .filter_map(|entry| {
            entry.values.iter().find(|v| v.name == name).map(|v| ValueHistoryPoint {
                date: entry.date.clone(),
                value: v.value,
                unit: v.unit.clone(),
                entry_id: entry.id.clone(),
            })
        })
        .collect()
}
