use gtk4::prelude::*;
use libadwaita::prelude::*;
use libadwaita as adw;
use glib::clone;

use crate::api::ApiClient;
use crate::config::{save_config, Config};
use crate::state::spawn_task;

pub fn show_setup_dialog(
    parent: &adw::ApplicationWindow,
    initial_url: &str,
    initial_token: &str,
    on_saved: impl Fn(Config) + 'static,
) {
    let dialog = adw::Dialog::new();
    dialog.set_title("Blutwerte einrichten");
    dialog.set_content_width(420);

    let toolbar_view = adw::ToolbarView::new();
    let header = adw::HeaderBar::new();
    toolbar_view.add_top_bar(&header);

    let content_box = gtk4::Box::new(gtk4::Orientation::Vertical, 24);
    content_box.set_margin_top(24);
    content_box.set_margin_bottom(24);
    content_box.set_margin_start(24);
    content_box.set_margin_end(24);

    let icon = gtk4::Image::from_icon_name("preferences-system-network-symbolic");
    icon.set_pixel_size(64);
    icon.add_css_class("accent");

    let title_label = gtk4::Label::new(Some("Server verbinden"));
    title_label.add_css_class("title-1");

    let subtitle = gtk4::Label::new(Some(
        "Gib die URL deines Blutwerte-Servers und einen API-Token ein.\nAPI-Tokens erstellst du im Web-UI unter Profil.",
    ));
    subtitle.set_wrap(true);
    subtitle.set_justify(gtk4::Justification::Center);
    subtitle.add_css_class("dim-label");

    let header_box = gtk4::Box::new(gtk4::Orientation::Vertical, 8);
    header_box.set_halign(gtk4::Align::Center);
    header_box.append(&icon);
    header_box.append(&title_label);
    header_box.append(&subtitle);

    let prefs_group = adw::PreferencesGroup::new();

    let url_row = adw::EntryRow::new();
    url_row.set_title("Server-URL");
    url_row.set_text(initial_url);
    url_row.set_input_hints(gtk4::InputHints::NO_SPELLCHECK | gtk4::InputHints::LOWERCASE);
    prefs_group.add(&url_row);

    let token_row = adw::PasswordEntryRow::new();
    token_row.set_title("API-Token");
    token_row.set_text(initial_token);
    prefs_group.add(&token_row);

    let status_label = gtk4::Label::new(None);
    status_label.set_wrap(true);
    status_label.set_halign(gtk4::Align::Start);

    let btn_box = gtk4::Box::new(gtk4::Orientation::Horizontal, 8);
    btn_box.set_halign(gtk4::Align::End);

    let test_btn = gtk4::Button::with_label("Verbindung testen");
    test_btn.add_css_class("flat");

    let save_btn = gtk4::Button::with_label("Speichern");
    save_btn.add_css_class("suggested-action");

    btn_box.append(&test_btn);
    btn_box.append(&save_btn);

    content_box.append(&header_box);
    content_box.append(&prefs_group);
    content_box.append(&status_label);
    content_box.append(&btn_box);

    toolbar_view.set_content(Some(&content_box));
    dialog.set_child(Some(&toolbar_view));

    // Connection test using async_channel + spawn_local
    {
        let status_label = status_label.clone();
        let test_btn = test_btn.clone();
        let url_row = url_row.clone();
        let token_row = token_row.clone();

        test_btn.connect_clicked(clone!(#[weak] status_label, #[weak] test_btn, move |_| {
            let url = url_row.text().to_string();
            let token = token_row.text().to_string();

            if url.is_empty() || token.is_empty() {
                status_label.set_text("Bitte URL und Token eingeben.");
                return;
            }

            test_btn.set_sensitive(false);
            test_btn.set_label("Teste...");
            status_label.set_text("");

            let (tx, rx) = async_channel::bounded::<Result<String, String>>(1);

            spawn_task(async move {
                let result = match ApiClient::new(url, token) {
                    Ok(client) => client.get_me().await
                        .map(|u| u.display_name.unwrap_or_else(|| "Unbekannt".to_string()))
                        .map_err(|e| e.to_string()),
                    Err(e) => Err(e.to_string()),
                };
                tx.send(result).await.ok();
            });

            glib::MainContext::default().spawn_local(async move {
                if let Ok(result) = rx.recv().await {
                    match result {
                        Ok(name) => {
                            status_label.set_markup(&format!(
                                "<span foreground='green'>✓ Verbunden als <b>{name}</b></span>"
                            ));
                        }
                        Err(e) => {
                            status_label.set_markup(&format!(
                                "<span foreground='red'>✗ Fehler: {}</span>",
                                glib::markup_escape_text(&e)
                            ));
                        }
                    }
                    test_btn.set_sensitive(true);
                    test_btn.set_label("Verbindung testen");
                }
            });
        }));
    }

    // Save
    {
        let url_row = url_row.clone();
        let token_row = token_row.clone();
        let dialog_clone = dialog.clone();
        let status_label = status_label.clone();

        save_btn.connect_clicked(move |_| {
            let url = url_row.text().to_string().trim().to_string();
            let token = token_row.text().to_string().trim().to_string();

            if url.is_empty() {
                status_label.set_markup("<span foreground='red'>Bitte Server-URL eingeben.</span>");
                return;
            }
            if token.is_empty() {
                status_label.set_markup("<span foreground='red'>Bitte API-Token eingeben.</span>");
                return;
            }

            let config = Config { server_url: url, api_token: token };

            if let Err(e) = save_config(&config) {
                status_label.set_markup(&format!(
                    "<span foreground='red'>Fehler beim Speichern: {}</span>",
                    glib::markup_escape_text(&e.to_string())
                ));
                return;
            }

            on_saved(config);
            dialog_clone.close();
        });
    }

    dialog.present(Some(parent));
}
