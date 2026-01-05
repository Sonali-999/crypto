import json
import os

MOCK_S3_DIR = "token_system/data/mock_s3/appointments"

def fetch_appointments(date_str):
    path = os.path.join(MOCK_S3_DIR, f"{date_str}.json")
    if os.path.exists(path):
        with open(path, "r") as f:
            return json.load(f)
    return []

def save_appointments(date_str, appointments):
    path = os.path.join(MOCK_S3_DIR, f"{date_str}.json")
    with open(path, "w") as f:
        json.dump(appointments, f, indent=2)
