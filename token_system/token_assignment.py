import boto3
import json
from .severity import compute_severity
from .slot_mapping import map_token_to_time

# AWS S3 config
S3_BUCKET = "your-bucket-name"
S3_REGION = "your-region"
s3_client = boto3.client('s3', region_name=S3_REGION)

# Doctor token prefixes
DOCTOR_TOKEN_PREFIX = {
    "Ajay": "A",
    "Vinay": "B",
    # Add more doctors here
}

def load_appointments(doctor_name, date_str):
    """Load appointments from S3 for a doctor on a specific date."""
    s3_key = f"appointments/{doctor_name}/{date_str}.json"
    try:
        obj = s3_client.get_object(Bucket=S3_BUCKET, Key=s3_key)
        data = json.loads(obj['Body'].read().decode('utf-8'))
        return data
    except s3_client.exceptions.NoSuchKey:
        return []  # No appointments yet

def save_appointments(doctor_name, date_str, appointments):
    """Save updated appointments with tokens back to S3."""
    s3_key = f"appointments/{doctor_name}/{date_str}.json"
    s3_client.put_object(
        Bucket=S3_BUCKET,
        Key=s3_key,
        Body=json.dumps(appointments, indent=2),
        ContentType='application/json'
    )

def assign_tokens(doctor_name, date_str):
    """Full workflow: load, compute severity, assign tokens, save back."""
    appointments = load_appointments(doctor_name, date_str)

    # Compute severity
    for appt in appointments:
        appt['severity_score'] = compute_severity(appt['condition_description'])

    # Sort descending by severity
    appointments.sort(key=lambda x: x['severity_score'], reverse=True)

    # Assign tokens + appointment times
    prefix = DOCTOR_TOKEN_PREFIX.get(doctor_name, "X")
    for idx, appt in enumerate(appointments, start=1):
        appt['token'] = f"{idx}{prefix}"
        appt['appointment_time'] = map_token_to_time(idx)

    # Save back to S3
    save_appointments(doctor_name, date_str, appointments)
    return appointments

# Example usage:
# updated = assign_tokens("Ajay", "2025-09-26")
# print(updated)
