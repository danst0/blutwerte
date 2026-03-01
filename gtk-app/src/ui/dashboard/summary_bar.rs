use gtk4::prelude::*;

use super::StatusCounts;

pub fn build_summary_bar(counts: StatusCounts) -> gtk4::Box {
    let hbox = gtk4::Box::new(gtk4::Orientation::Horizontal, 8);
    hbox.set_homogeneous(true);

    hbox.append(&make_card(
        "Normal",
        counts.normal,
        "success",
        "emblem-ok-symbolic",
    ));
    hbox.append(&make_card(
        "Grenzwertig",
        counts.warning,
        "warning",
        "dialog-warning-symbolic",
    ));
    hbox.append(&make_card(
        "Auffällig",
        counts.abnormal,
        "error",
        "dialog-error-symbolic",
    ));
    hbox.append(&make_card(
        "Gesamt",
        counts.total,
        "accent",
        "view-list-symbolic",
    ));

    hbox
}

fn make_card(label: &str, count: usize, css_class: &str, icon_name: &str) -> gtk4::Frame {
    let frame = gtk4::Frame::new(None);
    frame.add_css_class("card");

    let vbox = gtk4::Box::new(gtk4::Orientation::Vertical, 4);
    vbox.set_margin_top(12);
    vbox.set_margin_bottom(12);
    vbox.set_margin_start(12);
    vbox.set_margin_end(12);
    vbox.set_halign(gtk4::Align::Center);

    let icon = gtk4::Image::from_icon_name(icon_name);
    icon.add_css_class(css_class);
    icon.set_pixel_size(20);

    let count_label = gtk4::Label::new(Some(&count.to_string()));
    count_label.add_css_class("title-2");
    count_label.add_css_class(css_class);

    let name_label = gtk4::Label::new(Some(label));
    name_label.add_css_class("caption");
    name_label.add_css_class("dim-label");

    vbox.append(&icon);
    vbox.append(&count_label);
    vbox.append(&name_label);

    frame.set_child(Some(&vbox));
    frame
}
