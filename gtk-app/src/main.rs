mod app;
mod config;
mod state;
mod api;
mod ui;

fn main() -> glib::ExitCode {
    app::run()
}
