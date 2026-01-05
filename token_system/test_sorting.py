import json
from token_system.severity import SeverityScorer  # your BERT predictor

# Load mock appointments
with open("token_system/data/mock_s3/appointments/2025-09-28.json", "r") as f:
    appointments = json.load(f)

# Initialize scorer once
scorer = SeverityScorer()

# Compute severity for each appointment
for appt in appointments:
    appt['severity_score'] = scorer.predict(appt['description'])

# Sort appointments by severity descending
appointments.sort(key=lambda x: x['severity_score'], reverse=True)

# Print sorted queue
print("=== Sorted Queue by Severity ===")
for idx, appt in enumerate(appointments, start=1):
    print(f"{idx}. Patient: {appt['patient_id']}, Doctor: {appt['doctor_id']}, "
          f"Severity: {appt['severity_score']:.2f}, Description: {appt['description']}")
