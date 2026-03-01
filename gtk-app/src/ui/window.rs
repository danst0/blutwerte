use gtk4::prelude::*;
use libadwaita::prelude::*;
use libadwaita as adw;
use glib::clone;

use crate::api::ApiClient;
use crate::config::Config;
use crate::state::{spawn_task, DataBundle};
use crate::ui::dashboard::build_dashboard_page;
use crate::ui::ai_chat::build_ai_chat_page;
use crate::ui::settings::show_settings_window;

pub fn build_ui(app: &adw::Application, config: Config) {
    let window = adw::ApplicationWindow::new(app);
    window.set_title(Some("Blutwerte"));
    window.set_default_size(1000, 700);

    // Toast overlay wrapping everything
    let toast_overlay = adw::ToastOverlay::new();

    let split_view = adw::NavigationSplitView::new();
    split_view.set_min_sidebar_width(200.0);
    split_view.set_max_sidebar_width(280.0);

    // ── Sidebar ─────────────────────────────────────────────────────────────
    let sidebar_page = adw::NavigationPage::new(&gtk4::Label::new(None), "Blutwerte");
    let sidebar_toolbar = adw::ToolbarView::new();
    sidebar_toolbar.add_top_bar(&adw::HeaderBar::new());

    let sidebar_box = gtk4::Box::new(gtk4::Orientation::Vertical, 0);
    sidebar_box.set_vexpand(true);

    let list_box = gtk4::ListBox::new();
    list_box.set_selection_mode(gtk4::SelectionMode::Single);
    list_box.add_css_class("navigation-sidebar");
    list_box.set_vexpand(true);

    let dashboard_row = make_sidebar_row("Dashboard", "view-grid-symbolic");
    let ai_row = make_sidebar_row("KI-Doktor", "dialog-information-symbolic");
    list_box.append(&dashboard_row);
    list_box.append(&ai_row);

    let settings_btn = gtk4::Button::new();
    settings_btn.set_icon_name("preferences-system-symbolic");
    settings_btn.add_css_class("flat");
    settings_btn.set_tooltip_text(Some("Einstellungen"));
    settings_btn.set_halign(gtk4::Align::Center);
    settings_btn.set_margin_bottom(8);
    settings_btn.set_margin_top(4);

    sidebar_box.append(&list_box);
    sidebar_box.append(&settings_btn);
    sidebar_toolbar.set_content(Some(&sidebar_box));
    sidebar_page.set_child(Some(&sidebar_toolbar));
    split_view.set_sidebar(Some(&sidebar_page));

    // ── Content ──────────────────────────────────────────────────────────────
    let nav_view = adw::NavigationView::new();
    nav_view.set_pop_on_escape(true);
    let content_page = adw::NavigationPage::new(&nav_view, "Inhalt");
    split_view.set_content(Some(&content_page));

    toast_overlay.set_child(Some(&split_view));
    window.set_content(Some(&toast_overlay));
    window.present();

    // Keyboard shortcuts: Ctrl+W = close window, Ctrl+Q = quit app
    {
        let app_for_keys = app.clone();
        let window_for_keys = window.downgrade();
        let key_ctrl = gtk4::EventControllerKey::new();
        key_ctrl.set_propagation_phase(gtk4::PropagationPhase::Capture);
        key_ctrl.connect_key_pressed(move |_, key, _, mods| {
            if mods.contains(gtk4::gdk::ModifierType::CONTROL_MASK) {
                match key {
                    gtk4::gdk::Key::w | gtk4::gdk::Key::W => {
                        if let Some(w) = window_for_keys.upgrade() { w.close(); }
                        glib::Propagation::Stop
                    }
                    gtk4::gdk::Key::q | gtk4::gdk::Key::Q => {
                        app_for_keys.quit();
                        glib::Propagation::Stop
                    }
                    _ => glib::Propagation::Proceed,
                }
            } else {
                glib::Propagation::Proceed
            }
        });
        window.add_controller(key_ctrl);
    }

    // Show loading spinner
    let spinner_page = make_loading_page("Lade Daten...");
    nav_view.push(&spinner_page);

    // Async load via async_channel
    let (tx, rx) = async_channel::bounded::<Result<Box<DataBundle>, String>>(1);

    {
        let cfg = config.clone();
        spawn_task(async move {
            let result: Result<Box<DataBundle>, String> = async {
                let client = ApiClient::new(cfg.server_url.clone(), cfg.api_token.clone())
                    .map_err(|e| e.to_string())?;
                let user_data = client.get_blood_values().await.map_err(|e| e.to_string())?;
                let reference_db = client.get_reference().await.map_err(|e| e.to_string())?;
                // Try /api/auth/me (works after backend fix); fall back to UserData fields
                let user = client.get_me().await.unwrap_or_else(|_| crate::api::AuthUser {
                    authenticated: true,
                    user_id: Some(user_data.user_id.clone()),
                    display_name: Some(user_data.display_name.clone()),
                    email: Some(user_data.email.clone()),
                    gender: user_data.gender.clone(),
                    is_admin: None,
                });
                Ok(Box::new(DataBundle { user, user_data, reference_db }))
            }.await;
            tx.send(result).await.ok();
        });
    }

    // Receive result on GTK main thread
    let config_for_spawn = config.clone();
    glib::MainContext::default().spawn_local(clone!(#[weak] nav_view, #[weak] list_box, #[weak] toast_overlay, #[weak] window, async move {
        let config = config_for_spawn;
        if let Ok(result) = rx.recv().await {
            // Pop loading page
            nav_view.pop();

            match result {
                Ok(bundle) => {
                    let gender = bundle.user.gender.clone();
                    let ref_db = bundle.reference_db.values.clone();

                    // Build and show dashboard
                    let dash_page = build_dashboard_page(
                        &nav_view,
                        &bundle.user_data,
                        &ref_db,
                        gender.as_deref(),
                    );
                    nav_view.replace(&[dash_page]);

                    let ai_client = ApiClient::new(
                        config.server_url.clone(),
                        config.api_token.clone(),
                    ).ok();

                    // Sidebar selection
                    let user_data = bundle.user_data.clone();
                    let ref_db_clone = ref_db.clone();
                    let gender_clone = gender.clone();

                    list_box.connect_row_activated(clone!(#[weak] nav_view, move |_, row| {
                        match row.index() {
                            0 => {
                                let dash = build_dashboard_page(
                                    &nav_view,
                                    &user_data,
                                    &ref_db_clone,
                                    gender_clone.as_deref(),
                                );
                                nav_view.replace(&[dash]);
                            }
                            1 => {
                                if let Some(ref client) = ai_client {
                                    let chat = build_ai_chat_page(client.clone());
                                    nav_view.replace(&[chat]);
                                }
                            }
                            _ => {}
                        }
                    }));

                    list_box.select_row(list_box.row_at_index(0).as_ref());
                }
                Err(e) => {
                    let error_page = make_error_page(&e);
                    nav_view.replace(&[error_page]);

                    let toast = adw::Toast::new(&format!("Fehler beim Laden: {e}"));
                    toast.set_timeout(5);
                    toast_overlay.add_toast(toast);
                }
            }
        }
    }));

    // Settings button
    {
        let window_clone = window.clone();
        let app_clone = app.clone();
        let config_for_settings = config.clone();

        settings_btn.connect_clicked(move |_| {
            show_settings_window(&window_clone, config_for_settings.clone(), {
                let app = app_clone.clone();
                move |_new_config| {
                    app.quit();
                }
            });
        });
    }
}

fn make_sidebar_row(label: &str, icon_name: &str) -> adw::ActionRow {
    let row = adw::ActionRow::new();
    row.set_title(label);
    let icon = gtk4::Image::from_icon_name(icon_name);
    row.add_prefix(&icon);
    row.set_activatable(true);
    row
}

fn make_loading_page(msg: &str) -> adw::NavigationPage {
    let vbox = gtk4::Box::new(gtk4::Orientation::Vertical, 12);
    vbox.set_valign(gtk4::Align::Center);
    vbox.set_halign(gtk4::Align::Center);
    vbox.set_vexpand(true);

    let spinner = gtk4::Spinner::new();
    spinner.set_size_request(48, 48);
    spinner.start();

    let label = gtk4::Label::new(Some(msg));
    label.add_css_class("dim-label");

    vbox.append(&spinner);
    vbox.append(&label);

    let toolbar = adw::ToolbarView::new();
    toolbar.add_top_bar(&adw::HeaderBar::new());
    toolbar.set_content(Some(&vbox));

    adw::NavigationPage::new(&toolbar, "Laden")
}

fn make_error_page(error: &str) -> adw::NavigationPage {
    let vbox = gtk4::Box::new(gtk4::Orientation::Vertical, 12);
    vbox.set_valign(gtk4::Align::Center);
    vbox.set_halign(gtk4::Align::Center);
    vbox.set_vexpand(true);
    vbox.set_margin_start(32);
    vbox.set_margin_end(32);

    let icon = gtk4::Image::from_icon_name("network-offline-symbolic");
    icon.set_pixel_size(48);
    icon.add_css_class("error");

    let title = gtk4::Label::new(Some("Verbindungsfehler"));
    title.add_css_class("title-2");

    let label = gtk4::Label::new(Some(error));
    label.add_css_class("dim-label");
    label.set_wrap(true);
    label.set_justify(gtk4::Justification::Center);

    vbox.append(&icon);
    vbox.append(&title);
    vbox.append(&label);

    let toolbar = adw::ToolbarView::new();
    toolbar.add_top_bar(&adw::HeaderBar::new());
    toolbar.set_content(Some(&vbox));

    adw::NavigationPage::new(&toolbar, "Fehler")
}
