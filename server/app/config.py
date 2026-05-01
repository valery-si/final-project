from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "TrustLens API"
    api_prefix: str = "/api"
    database_url: str = "postgresql+psycopg2://safebrowse:safebrowse@localhost:5432/safebrowse"
    client_base_url: str = "http://localhost:5173"
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"
    tldr_neural_model: str = "sshleifer/distilbart-cnn-12-6"
    preload_roberta: bool = True
    preload_tldr: bool = True
    roberta_enabled: bool = True
    roberta_model_name: str = "roberta-large-mnli"
    roberta_max_length: int = 512
    weight_emotional: float = 0.52
    weight_source_inverse: float = 0.33
    weight_structure: float = 0.15
    threshold_caution: float = 0.28
    threshold_no_go: float = 0.45
    threshold_hard_no_go: float = 0.65
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
