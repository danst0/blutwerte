use std::cell::RefCell;
use tokio::runtime::Runtime;

use crate::api::types::*;

// ─── Data bundle returned by initial load ─────────────────────────────────────

#[derive(Debug)]
pub struct DataBundle {
    pub user: AuthUser,
    pub user_data: UserData,
    pub reference_db: ReferenceDatabase,
}

// ─── Tokio runtime (thread-local) ────────────────────────────────────────────

thread_local! {
    static TOKIO_RT: RefCell<Option<Runtime>> = const { RefCell::new(None) };
}

pub fn init_tokio() {
    TOKIO_RT.with(|rt| {
        *rt.borrow_mut() = Some(
            tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .expect("Failed to create Tokio runtime"),
        );
    });
}

pub fn spawn_task<F>(f: F)
where
    F: std::future::Future<Output = ()> + Send + 'static,
{
    TOKIO_RT.with(|rt| {
        if let Some(rt) = rt.borrow().as_ref() {
            rt.spawn(f);
        }
    });
}
