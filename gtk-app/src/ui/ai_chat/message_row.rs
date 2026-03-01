use gtk4::prelude::*;

use crate::api::types::ChatMessage;

pub fn build_message_row(msg: &ChatMessage) -> gtk4::Box {
    let is_user = msg.role == "user";

    let row_box = gtk4::Box::new(gtk4::Orientation::Horizontal, 8);
    row_box.set_margin_top(4);
    row_box.set_margin_bottom(4);

    // Avatar
    let avatar_icon = if is_user { "avatar-default-symbolic" } else { "system-help-symbolic" };
    let avatar = gtk4::Image::from_icon_name(avatar_icon);
    avatar.set_pixel_size(32);
    avatar.set_valign(gtk4::Align::Start);
    if is_user {
        avatar.add_css_class("accent");
    }

    // Bubble
    let bubble_box = gtk4::Box::new(gtk4::Orientation::Vertical, 4);
    bubble_box.set_hexpand(true);

    let text_label = gtk4::Label::new(Some(&msg.content));
    text_label.set_wrap(true);
    text_label.set_xalign(0.0);
    text_label.set_selectable(true);

    // Apply basic markdown-like formatting
    let markup = simple_markdown(&msg.content);
    text_label.set_markup(&markup);

    let frame = gtk4::Frame::new(None);
    frame.add_css_class("card");
    if is_user {
        frame.add_css_class("accent");
    }
    frame.set_child(Some(&text_label));
    text_label.set_margin_top(10);
    text_label.set_margin_bottom(10);
    text_label.set_margin_start(12);
    text_label.set_margin_end(12);

    // Timestamp
    let time_label = gtk4::Label::new(Some(&format_time(&msg.timestamp)));
    time_label.add_css_class("caption");
    time_label.add_css_class("dim-label");

    bubble_box.append(&frame);
    bubble_box.append(&time_label);

    if is_user {
        // User messages on right
        let spacer = gtk4::Box::new(gtk4::Orientation::Horizontal, 0);
        spacer.set_hexpand(true);
        row_box.append(&spacer);
        row_box.append(&bubble_box);
        row_box.append(&avatar);
        time_label.set_halign(gtk4::Align::End);
        bubble_box.set_halign(gtk4::Align::End);
    } else {
        // AI messages on left
        row_box.append(&avatar);
        row_box.append(&bubble_box);
        time_label.set_halign(gtk4::Align::Start);
        bubble_box.set_halign(gtk4::Align::Start);
    }

    row_box
}

fn format_time(timestamp: &str) -> String {
    // Parse ISO 8601 and format as HH:MM
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(timestamp) {
        use chrono::Timelike;
        format!("{:02}:{:02}", dt.hour(), dt.minute())
    } else {
        timestamp.to_string()
    }
}

fn simple_markdown(text: &str) -> String {
    // Escape XML special chars first
    let escaped = glib::markup_escape_text(text);

    // Apply very basic markdown
    let mut result = escaped.to_string();

    // Bold: **text**
    result = regex_replace_bold(&result);

    // We keep it simple to avoid regex dependency;
    // just escape and wrap
    result
}

fn regex_replace_bold(text: &str) -> String {
    // Simple state-machine based **bold** replacement
    let mut output = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    let mut in_bold = false;

    while let Some(c) = chars.next() {
        if c == '*' {
            if chars.peek() == Some(&'*') {
                chars.next(); // consume second *
                if in_bold {
                    output.push_str("</b>");
                    in_bold = false;
                } else {
                    output.push_str("<b>");
                    in_bold = true;
                }
            } else {
                output.push(c);
            }
        } else {
            output.push(c);
        }
    }

    if in_bold {
        output.push_str("</b>"); // close unclosed bold
    }

    output
}
