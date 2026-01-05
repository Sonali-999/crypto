def send_sms(contact, message):
    """
    Integrate AWS SNS or Twilio to send SMS
    """
    print(f"SMS to {contact}: {message}")
    # Replace print with actual SMS API call

def notify_patient(appt):
    """
    Notify patient of token and appointment time
    """
    message = f"Hello {appt['patient_name']}, your appointment with Dr.{appt['doctor_id']} is at {appt['appointment_time']}. Token: {appt['token']}"
    send_sms(appt['contact'], message)
