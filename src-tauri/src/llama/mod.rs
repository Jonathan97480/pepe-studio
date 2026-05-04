//! Module llama_sidecar — re-exports plats pour compatibilité avec main.rs.

pub mod lifecycle;
pub mod streaming;

pub use lifecycle::{
    cleanup_llama, get_llama_logs, is_llama_running, start_llama, stop_llama, ChatMessage,
    LlamaLogs, LlamaState, SERVER_PORT,
};
pub use streaming::{send_llama_prompt, SamplingParams};
