use gtk4::prelude::*;

/// Returns (container_widget, text_view, send_button)
pub fn build_input_bar() -> (gtk4::Box, gtk4::TextView, gtk4::Button) {
    let container = gtk4::Box::new(gtk4::Orientation::Vertical, 4);
    container.set_margin_start(16);
    container.set_margin_end(16);
    container.set_margin_top(8);
    container.set_margin_bottom(12);

    let input_row = gtk4::Box::new(gtk4::Orientation::Horizontal, 8);
    input_row.set_vexpand(false);

    // Text view for multi-line input
    let scrolled = gtk4::ScrolledWindow::new();
    scrolled.set_hscrollbar_policy(gtk4::PolicyType::Never);
    scrolled.set_vscrollbar_policy(gtk4::PolicyType::Automatic);
    scrolled.set_min_content_height(48);
    scrolled.set_max_content_height(120);
    scrolled.set_hexpand(true);
    scrolled.add_css_class("card");

    let text_view = gtk4::TextView::new();
    text_view.set_wrap_mode(gtk4::WrapMode::WordChar);
    text_view.set_accepts_tab(false);
    text_view.set_pixels_above_lines(4);
    text_view.set_pixels_below_lines(4);
    text_view.set_left_margin(8);
    text_view.set_right_margin(8);

    // Placeholder via overlay
    let overlay = gtk4::Overlay::new();
    let placeholder = gtk4::Label::new(Some("Deine Frage... (Enter zum Senden, Shift+Enter für neue Zeile)"));
    placeholder.add_css_class("dim-label");
    placeholder.set_halign(gtk4::Align::Start);
    placeholder.set_valign(gtk4::Align::Start);
    placeholder.set_margin_start(10);
    placeholder.set_margin_top(8);
    placeholder.set_sensitive(false);

    // Hide placeholder when text is entered
    {
        let placeholder = placeholder.clone();
        let buf = text_view.buffer();
        buf.connect_changed(move |buf| {
            let has_text = buf.char_count() > 0;
            placeholder.set_visible(!has_text);
        });
    }

    overlay.set_child(Some(&text_view));
    overlay.add_overlay(&placeholder);
    scrolled.set_child(Some(&overlay));

    // Send button
    let send_btn = gtk4::Button::new();
    send_btn.set_icon_name("mail-send-symbolic");
    send_btn.add_css_class("suggested-action");
    send_btn.add_css_class("circular");
    send_btn.set_valign(gtk4::Align::End);
    send_btn.set_tooltip_text(Some("Senden (Enter)"));

    input_row.append(&scrolled);
    input_row.append(&send_btn);

    container.append(&input_row);

    (container, text_view, send_btn)
}
