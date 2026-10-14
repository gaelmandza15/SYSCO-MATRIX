use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub debit: f64,
    pub credit: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountInput {
    pub code: String,
    pub name: String,
    pub debit: f64,
    pub credit: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Settings {
    pub company: String,
    pub nif: String,
    pub country: String,
    pub closing_date: String,
}
