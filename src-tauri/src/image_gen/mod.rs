//! Module image_gen — re-exports plats pour compatibilité avec main.rs.

pub mod generate;
pub mod helpers;
pub mod server;

pub use generate::{generate_image, list_sd_models};
pub use helpers::ImageGenResult;
pub use server::{cleanup_sd_server, SdServerState};
