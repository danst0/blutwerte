pub mod message_row;
pub mod input_bar;

use gtk4::prelude::*;
use libadwaita::prelude::*;
use libadwaita as adw;
use std::cell::RefCell;
use std::rc::Rc;
use glib::clone;

use crate::api::{ApiClient, types::*};
use crate::state::spawn_task;
use message_row::build_message_row;

const SUGGESTED_PROMPTS: &[&str] = &[
    "Was bedeutet mein erhöhter LDL-Wert?",
    "Wie kann ich meinen Vitamin-D-Spiegel verbessern?",
    "Gibt es auffällige Veränderungen in meinen letzten Werten?",
    "Erstelle mir eine Zusammenfassung meiner letzten Blutwerte",
    "Welche Werte sollte ich im Auge behalten?",
    "Was kann ich bei erhöhten Leberwerten tun?",
];

pub fn build_ai_chat_page(client: ApiClient) -> adw::NavigationPage {
    let page = adw::NavigationPage::new(&gtk4::Label::new(None), "KI-Doktor");
    page.set_title("KI-Doktor");

    let main_box = gtk4::Box::new(gtk4::Orientation::Vertical, 0);
    main_box.set_vexpand(true);

    // Header
    let header_box = gtk4::Box::new(gtk4::Orientation::Horizontal, 8);
    header_box.set_margin_start(16);
    header_box.set_margin_end(16);
    header_box.set_margin_top(12);
    header_box.set_margin_bottom(8);

    let icon = gtk4::Image::from_icon_name("application-x-addon-symbolic");
    icon.set_pixel_size(24);
    icon.add_css_class("accent");

    let title_label = gtk4::Label::new(Some("KI-Doktor"));
    title_label.add_css_class("title-3");

    let spacer = gtk4::Box::new(gtk4::Orientation::Horizontal, 0);
    spacer.set_hexpand(true);

    let clear_btn = gtk4::Button::new();
    clear_btn.set_icon_name("edit-delete-symbolic");
    clear_btn.set_tooltip_text(Some("Verlauf löschen"));
    clear_btn.add_css_class("flat");
    clear_btn.set_visible(false);

    header_box.append(&icon);
    header_box.append(&title_label);
    header_box.append(&spacer);
    header_box.append(&clear_btn);

    // Disclaimer
    let disclaimer = adw::Banner::new(
        "KI-Doktor ersetzt keine ärztliche Beratung. Bei Bedenken wenden Sie sich an Ihren Arzt.",
    );
    disclaimer.set_revealed(true);

    // Messages scroll
    let scrolled = gtk4::ScrolledWindow::new();
    scrolled.set_vexpand(true);
    scrolled.set_hscrollbar_policy(gtk4::PolicyType::Never);

    let messages_box = gtk4::Box::new(gtk4::Orientation::Vertical, 8);
    messages_box.set_margin_top(12);
    messages_box.set_margin_bottom(12);
    messages_box.set_margin_start(16);
    messages_box.set_margin_end(16);
    scrolled.set_child(Some(&messages_box));

    // Error label
    let error_label = gtk4::Label::new(None);
    error_label.set_wrap(true);
    error_label.set_margin_start(16);
    error_label.set_margin_end(16);
    error_label.set_visible(false);
    error_label.add_css_class("error");

    // Input bar
    let (input_widget, text_view, send_btn) = input_bar::build_input_bar();

    main_box.append(&header_box);
    main_box.append(&disclaimer);
    main_box.append(&scrolled);
    main_box.append(&error_label);
    main_box.append(&input_widget);

    page.set_child(Some(&main_box));

    // State (RC because single-threaded GTK)
    let messages: Rc<RefCell<Vec<ChatMessage>>> = Rc::new(RefCell::new(Vec::new()));
    let loading = Rc::new(RefCell::new(false));

    // Helper: scroll to bottom
    let scroll_to_bottom = {
        let scrolled = scrolled.clone();
        move || {
            let adj = scrolled.vadjustment();
            glib::idle_add_local_once(clone!(#[weak] adj, move || {
                adj.set_value(adj.upper() - adj.page_size());
            }));
        }
    };

    // Helper: rebuild messages UI
    let rebuild_messages = {
        let messages_box = messages_box.clone();
        let messages = messages.clone();
        let clear_btn = clear_btn.clone();

        Rc::new(move || {
            // Remove all children
            while let Some(child) = messages_box.first_child() {
                messages_box.remove(&child);
            }

            let msgs = messages.borrow();
            if msgs.is_empty() {
                messages_box.append(&build_empty_state());
                clear_btn.set_visible(false);
            } else {
                for msg in msgs.iter() {
                    messages_box.append(&build_message_row(msg));
                }
                clear_btn.set_visible(true);
            }
        })
    };

    // Initial empty state
    rebuild_messages();

    // Load history
    {
        let client = client.clone();
        let messages = messages.clone();
        let rebuild = rebuild_messages.clone();
        let scroll_to_bottom = scroll_to_bottom.clone();

        let (tx, rx) = async_channel::bounded::<Result<ChatHistory, String>>(1);
        spawn_task(async move {
            let r = client.get_chat_history().await.map_err(|e| e.to_string());
            tx.send(r).await.ok();
        });

        glib::MainContext::default().spawn_local(async move {
            if let Ok(result) = rx.recv().await {
                if let Ok(history) = result {
                    *messages.borrow_mut() = history.messages;
                }
                rebuild();
                scroll_to_bottom();
            }
        });
    }

    // Send message
    let send_message = {
        let client = client.clone();
        let messages = messages.clone();
        let loading = loading.clone();
        let send_btn = send_btn.clone();
        let error_label = error_label.clone();
        let text_view = text_view.clone();
        let rebuild = rebuild_messages.clone();
        let scroll_to_bottom = scroll_to_bottom.clone();

        Rc::new(move |text: String| {
            let text = text.trim().to_string();
            if text.is_empty() || *loading.borrow() {
                return;
            }

            *loading.borrow_mut() = true;
            send_btn.set_sensitive(false);
            error_label.set_visible(false);
            text_view.buffer().set_text("");

            // Optimistic user message
            messages.borrow_mut().push(ChatMessage {
                id: "temp-user".to_string(),
                role: "user".to_string(),
                content: text.clone(),
                timestamp: chrono::Utc::now().to_rfc3339(),
            });
            rebuild();
            scroll_to_bottom();

            let client = client.clone();
            let messages = messages.clone();
            let loading = loading.clone();
            let send_btn = send_btn.clone();
            let error_label = error_label.clone();
            let rebuild = rebuild.clone();
            let scroll_to_bottom = scroll_to_bottom.clone();

            let (tx, rx) = async_channel::bounded::<Result<ChatResponse, String>>(1);
            spawn_task(async move {
                let r = client.send_chat(&text).await.map_err(|e| e.to_string());
                tx.send(r).await.ok();
            });

            glib::MainContext::default().spawn_local(async move {
                if let Ok(result) = rx.recv().await {
                    match result {
                        Ok(resp) => {
                            let mut msgs = messages.borrow_mut();
                            msgs.retain(|m| m.id != "temp-user");
                            msgs.push(resp.user_message);
                            msgs.push(resp.message);
                            drop(msgs);
                            rebuild();
                            scroll_to_bottom();
                        }
                        Err(e) => {
                            messages.borrow_mut().retain(|m| m.id != "temp-user");
                            let display = if e.starts_with("RATE_LIMIT:") {
                                e.trim_start_matches("RATE_LIMIT:").trim().to_string()
                            } else {
                                format!("Fehler: {e}")
                            };
                            error_label.set_text(&display);
                            error_label.set_visible(true);
                            rebuild();
                        }
                    }
                    *loading.borrow_mut() = false;
                    send_btn.set_sensitive(true);
                }
            });
        })
    };

    // Connect send button
    {
        let text_view = text_view.clone();
        let send_message = send_message.clone();
        send_btn.connect_clicked(move |_| {
            let buf = text_view.buffer();
            let text = buf.text(&buf.start_iter(), &buf.end_iter(), false).to_string();
            send_message(text);
        });
    }

    // Enter key in text view (Enter = send, Shift+Enter = newline)
    {
        let text_view_for_key = text_view.clone();
        let send_message = send_message.clone();
        let key_ctrl = gtk4::EventControllerKey::new();
        key_ctrl.connect_key_pressed(move |_, key, _, mods| {
            if key == gtk4::gdk::Key::Return
                && !mods.contains(gtk4::gdk::ModifierType::SHIFT_MASK)
            {
                let buf = text_view_for_key.buffer();
                let text = buf.text(&buf.start_iter(), &buf.end_iter(), false).to_string();
                send_message(text);
                return glib::Propagation::Stop;
            }
            glib::Propagation::Proceed
        });
        text_view.add_controller(key_ctrl);
    }

    // Clear history
    {
        let client = client.clone();
        let messages = messages.clone();
        let rebuild = rebuild_messages.clone();

        clear_btn.connect_clicked(move |_| {
            let client = client.clone();
            let messages = messages.clone();
            let rebuild = rebuild.clone();

            let (tx, rx) = async_channel::bounded::<Result<(), String>>(1);
            spawn_task(async move {
                let r = client.clear_chat_history().await.map_err(|e| e.to_string());
                tx.send(r).await.ok();
            });

            glib::MainContext::default().spawn_local(async move {
                if let Ok(Ok(())) = rx.recv().await {
                    messages.borrow_mut().clear();
                    rebuild();
                }
            });
        });
    }

    page
}

fn build_empty_state() -> gtk4::Box {
    let vbox = gtk4::Box::new(gtk4::Orientation::Vertical, 16);
    vbox.set_valign(gtk4::Align::Center);
    vbox.set_vexpand(true);

    let icon = gtk4::Image::from_icon_name("dialog-question-symbolic");
    icon.set_pixel_size(48);
    icon.set_halign(gtk4::Align::Center);
    icon.add_css_class("dim-label");

    let title = gtk4::Label::new(Some("Wie kann ich dir helfen?"));
    title.add_css_class("title-3");
    title.set_halign(gtk4::Align::Center);

    let subtitle = gtk4::Label::new(Some("Stelle mir eine Frage zu deinen Blutwerten"));
    subtitle.add_css_class("dim-label");
    subtitle.add_css_class("caption");
    subtitle.set_halign(gtk4::Align::Center);

    vbox.append(&icon);
    vbox.append(&title);
    vbox.append(&subtitle);

    let flow = gtk4::FlowBox::new();
    flow.set_max_children_per_line(2);
    flow.set_selection_mode(gtk4::SelectionMode::None);
    flow.set_margin_top(8);
    flow.set_halign(gtk4::Align::Center);

    for prompt in SUGGESTED_PROMPTS {
        let btn = gtk4::Button::with_label(prompt);
        btn.add_css_class("flat");
        btn.add_css_class("pill");
        flow.insert(&btn, -1);
    }

    vbox.append(&flow);
    vbox
}
