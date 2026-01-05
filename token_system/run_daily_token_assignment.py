import datetime
from token_system.s3_utils import fetch_appointments, save_appointments
from token_system.token_assignment import assign_tokens
from token_system.notify import notify_patient

def run_daily_token_assignment():
    tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
    appointments = fetch_appointments(tomorrow)
    if not appointments:
        print("No appointments found.")
        return

    # Group by doctor and assign tokens
    updated_appointments = []
    for doctor_id in set(a["doctor_id"] for a in appointments):
        doctor_appts = [a for a in appointments if a["doctor_id"] == doctor_id]
        doctor_code = doctor_id[0].upper() if doctor_id else "X"
        updated = assign_tokens(doctor_appts, doctor_code)
        updated_appointments.extend(updated)

    save_appointments(tomorrow, updated_appointments)

    # Notify patients
    for appt in updated_appointments:
        notify_patient(appt)

if __name__ == "__main__":
    run_daily_token_assignment()
