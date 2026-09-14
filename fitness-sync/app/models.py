"""Pydantic request bodies for the API. Responses are returned as plain dicts (rows
straight from sqlite3.Row) — this is a single-user hobby app, a response schema layer
would be pure ceremony. Request bodies still get validated/documented here since that's
what a caller (web UI form or LLM) needs to know to write correctly."""
from typing import Optional, Literal
from pydantic import BaseModel


class BodyMetricIn(BaseModel):
    weight_kg: Optional[float] = None
    body_fat_pct: Optional[float] = None
    body_water_pct: Optional[float] = None
    muscle_mass_kg: Optional[float] = None
    bone_mass_kg: Optional[float] = None
    visceral_fat: Optional[float] = None
    visceral_fat_rating: Optional[float] = None
    basal_met: Optional[float] = None
    active_met: Optional[float] = None
    metabolic_age: Optional[float] = None
    physique_rating: Optional[float] = None
    bmi: Optional[float] = None
    source: Optional[Literal["garmin_api", "user", "llm"]] = "user"


class WatchMetricIn(BaseModel):
    resting_hr: Optional[float] = None
    steps_total: Optional[float] = None
    steps_avg: Optional[float] = None
    distance_m: Optional[float] = None
    stress_avg: Optional[float] = None
    active_kcal: Optional[float] = None
    total_kcal: Optional[float] = None
    bmr_kcal: Optional[float] = None
    body_battery: Optional[float] = None
    respiration_avg: Optional[float] = None
    vo2max: Optional[float] = None
    fitness_age: Optional[float] = None
    spo2_avg: Optional[float] = None
    spo2_lowest: Optional[float] = None
    floors_climbed: Optional[float] = None
    hrv_last_night: Optional[float] = None
    hrv_weekly_avg: Optional[float] = None
    sleep_score: Optional[float] = None
    sleep_duration_hr: Optional[float] = None


class WorkoutIn(BaseModel):
    date: str
    exercise: str
    weight_kg: float = 0.0
    reps: int = 0
    title: Optional[str] = ""
    set_index: Optional[str] = ""
    set_type: Optional[str] = ""
    duration_seconds: Optional[int] = 0
    source: Optional[Literal["hevy_csv", "user"]] = "user"


class WorkoutUpdate(BaseModel):
    date: Optional[str] = None
    exercise: Optional[str] = None
    weight_kg: Optional[float] = None
    reps: Optional[int] = None
    title: Optional[str] = None
    set_index: Optional[str] = None
    set_type: Optional[str] = None
    duration_seconds: Optional[int] = None


class MeasurementIn(BaseModel):
    neck_cm: Optional[float] = None
    shoulders_cm: Optional[float] = None
    chest_cm: Optional[float] = None
    waist_cm: Optional[float] = None
    hips_cm: Optional[float] = None
    bicep_left_cm: Optional[float] = None
    bicep_right_cm: Optional[float] = None
    forearm_left_cm: Optional[float] = None
    forearm_right_cm: Optional[float] = None
    thigh_left_cm: Optional[float] = None
    thigh_right_cm: Optional[float] = None
    calf_left_cm: Optional[float] = None
    calf_right_cm: Optional[float] = None
    note: Optional[str] = None


class DailyLogIn(BaseModel):
    meal_breakfast: Optional[bool] = None
    meal_lunch: Optional[bool] = None
    meal_dinner: Optional[bool] = None
    meal_snack: Optional[bool] = None
    protein_g: Optional[float] = None
    note: Optional[str] = None


class NoteIn(BaseModel):
    author: Literal["user", "llm"]
    body: str
    title: Optional[str] = None
    related_date: Optional[str] = None
    related_week: Optional[str] = None
    tags: Optional[str] = None


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    related_date: Optional[str] = None
    related_week: Optional[str] = None
    tags: Optional[str] = None
