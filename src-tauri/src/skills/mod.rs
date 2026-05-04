//! Module skills — re-exports plats pour compatibilité avec main.rs.

pub mod executor;
pub mod manager;

pub use executor::run_skill;
pub use manager::{
    CompositeSkillConfig, CompositeStep, HttpSkillConfig, RouteConfig, SkillMeta,
    create_skill, delete_skill, get_plan, list_skills, patch_skill, read_skill, save_plan,
};
