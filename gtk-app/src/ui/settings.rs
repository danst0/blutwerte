use gtk4::prelude::*;
use libadwaita::prelude::*;
use libadwaita as adw;
use glib::clone;

use crate::api::ApiClient;
use crate::config::{save_config, Config};
use crate::state::spawn_task;

pub fn show_settings_window(
    parent: &adw::ApplicationWindow,
    config: Config,
    on_saved: impl Fn(Config) + 'static,
) {
    let window = adw::PreferencesDialog::new();
    window.set_title("Einstellungen");

    let page = adw::PreferencesPage::new();
    page.set_title("Verbindung");
    page.set_icon_name(Some("network-wired-symbolic"));

    let group = adw::PreferencesGroup::new();
    group.set_title("Server");
    group.set_description(Some(
        "API-Tokens erstellst du im Web-UI unter Profil → API-Tokens.",
    ));

    let url_row = adw::EntryRow::new();
    url_row.set_title("Server-URL");
    url_row.set_text(&config.server_url);
    url_row.set_input_hints(gtk4::InputHints::NO_SPELLCHECK | gtk4::InputHints::LOWERCASE);
    group.add(&url_row);

    let token_row = adw::PasswordEntryRow::new();
    token_row.set_title("API-Token");
    token_row.set_text(&config.api_token);
    group.add(&token_row);

    page.add(&group);

    let actions_group = adw::PreferencesGroup::new();
    actions_group.set_title("Aktionen");

    let status_row = adw::ActionRow::new();
    status_row.set_title("Verbindungsstatus");
    status_row.set_subtitle("Noch nicht getestet");

    let test_btn = gtk4::Button::with_label("Testen");
    test_btn.set_valign(gtk4::Align::Center);
    test_btn.add_css_class("flat");
    status_row.add_suffix(&test_btn);
    actions_group.add(&status_row);

    let save_row = adw::ActionRow::new();
    save_row.set_title("Einstellungen speichern");
    let save_btn = gtk4::Button::with_label("Speichern");
    save_btn.set_valign(gtk4::Align::Center);
    save_btn.add_css_class("suggested-action");
    save_row.add_suffix(&save_btn);
    actions_group.add(&save_row);

    page.add(&actions_group);
    window.add(&page);

    // Connection test
    {
        let url_row = url_row.clone();
        let token_row = token_row.clone();
        let test_btn = test_btn.clone();
        let status_row = status_row.clone();

        test_btn.connect_clicked(clone!(#[weak] test_btn, #[weak] status_row, move |_| {
            let url = url_row.text().to_string();
            let token = token_row.text().to_string();
            test_btn.set_sensitive(false);
            test_btn.set_label("...");
            status_row.set_subtitle("Verbinde...");

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
                        Ok(name) => status_row.set_subtitle(&format!("✓ Verbunden als {name}")),
                        Err(e) => status_row.set_subtitle(&format!("✗ {e}")),
                    }
                    test_btn.set_sensitive(true);
                    test_btn.set_label("Testen");
                }
            });
        }));
    }

    // Save
    {
        let url_row = url_row.clone();
        let token_row = token_row.clone();
        let window_clone = window.clone();

        save_btn.connect_clicked(move |_| {
            let config = Config {
                server_url: url_row.text().to_string().trim().to_string(),
                api_token: token_row.text().to_string().trim().to_string(),
            };

            if let Err(e) = save_config(&config) {
                eprintln!("Failed to save config: {e}");
                return;
            }

            on_saved(config);
            window_clone.close();
        });
    }

    window.present(Some(parent));
}
