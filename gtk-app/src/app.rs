use libadwaita::prelude::*;
use libadwaita as adw;

use crate::config::{load_config, Config};
use crate::state::init_tokio;
use crate::ui::{setup_dialog::show_setup_dialog, window::build_ui};

pub fn run() -> glib::ExitCode {
    init_tokio();

    let app = adw::Application::builder()
        .application_id("de.blutwerte.app")
        .build();

    app.connect_activate(|app| {
        activate(app);
    });

    app.run()
}

fn activate(app: &adw::Application) {
    let config = load_config().unwrap_or_default();

    if config.is_configured() {
        build_ui(app, config);
    } else {
        // Show setup dialog in a minimal window
        let window = adw::ApplicationWindow::new(app);
        window.set_title(Some("Blutwerte"));
        window.set_default_size(480, 400);
        window.set_visible(false); // hidden backdrop for dialog

        let placeholder = gtk4::Box::new(gtk4::Orientation::Vertical, 0);
        window.set_content(Some(&placeholder));
        window.present();

        let app_clone = app.clone();
        let window_clone = window.clone();
        show_setup_dialog(&window, "", "", move |saved_config| {
            build_ui(&app_clone, saved_config);
            window_clone.close();
        });
    }
}
