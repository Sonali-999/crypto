import boto3
from openai import OpenAI

# Initialize clients
s3_client = boto3.client('s3')
llm_client = OpenAI(api_key="YOUR_OPENAI_API_KEY")

# Example slot mapping per doctor (10 slots)
# slot_number: 1-10, status: free/booked, type: normal/priority
def get_doctor_slots(doctor_id):
    # In real implementation, fetch from DB or S3
    return [
        {"slot_number": 1, "status": "free", "type": "normal"},
        {"slot_number": 2, "status": "free", "type": "normal"},
        {"slot_number": 3, "status": "free", "type": "priority"},
        {"slot_number": 4, "status": "free", "type": "normal"},
        {"slot_number": 5, "status": "free", "type": "normal"},
        {"slot_number": 6, "status": "free", "type": "priority"},
        {"slot_number": 7, "status": "free", "type": "normal"},
        {"slot_number": 8, "status": "free", "type": "normal"},
        {"slot_number": 9, "status": "free", "type": "priority"},
        {"slot_number": 10,"status": "free", "type": "normal"},
    ]

def save_doctor_slots(doctor_id, slots):
    # Save updated slots back to DB or S3
    pass

# Fetch patient form from S3
def fetch_from_s3(bucket_name, key):
    obj = s3_client.get_object(Bucket=bucket_name, Key=key)
    import json
    return json.loads(obj['Body'].read())

# LLM to classify priority
def llm_classify_priority(condition_description):
    prompt = f"""
You are a hospital triage assistant.
Given a patient's condition description, classify the appointment as either "normal" or "critical".

Examples:
- "Mild headache and occasional cough" → normal
- "Severe chest pain, difficulty breathing" → critical
- "Sprained ankle, mild pain" → normal
- "High fever with fainting" → critical

Now classify this patient:
"{condition_description}"
"""
    response = llm_client.chat.completions.create(
        model="gpt-5-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0
    )
    classification = response.choices[0].message.content.strip().lower()
    return "critical" if "critical" in classification else "normal"

# Main function to assign token
def assign_token(doctor_id, bucket_name, patient_s3_key):
    # Step 1: Fetch patient data
    patient_data = fetch_from_s3(bucket_name, patient_s3_key)
    condition_desc = patient_data['condition_description']
    
    # Step 2: Classify priority
    priority = llm_classify_priority(condition_desc)

    # Step 3: Get doctor slots
    slots = get_doctor_slots(doctor_id)

    # Step 4: Assign slot
    assigned_slot = None
    normal_slots = [1,2,4,5,7,8,10]
    priority_slots = [3,6,9]

    if priority == 'normal':
        for slot_number in normal_slots:
            slot = slots[slot_number-1]
            if slot['status'] == 'free':
                assigned_slot = slot
                break
    else:  # critical
        # Check for empty normal slots **before priority slots**
        for slot_number in normal_slots:
            if slot_number < min(priority_slots):
                slot = slots[slot_number-1]
                if slot['status'] == 'free':
                    assigned_slot = slot
                    break
        # If none → first empty priority slot
        if not assigned_slot:
            for slot_number in priority_slots:
                slot = slots[slot_number-1]
                if slot['status'] == 'free':
                    assigned_slot = slot
                    break
        # If still none → any remaining normal slot
        if not assigned_slot:
            for slot_number in normal_slots:
                slot = slots[slot_number-1]
                if slot['status'] == 'free':
                    assigned_slot = slot
                    break

    if not assigned_slot:
        return {"error": "No available slots for today"}

    # Step 5: Book the slot
    assigned_slot['status'] = 'booked'
    assigned_slot['patient_id'] = patient_data['patient_id']
    assigned_slot['priority'] = priority

    save_doctor_slots(doctor_id, slots)

    # Step 6: Map slot to time (example mapping)
    slot_times = {
        1: "09:00", 2: "09:30", 3: "10:00", 4: "10:30",
        5: "11:00", 6: "11:30", 7: "12:00", 8: "12:30",
        9: "01:00", 10: "01:30"
    }

    return {
        "token": assigned_slot['slot_number'],
        "appointment_time": slot_times[assigned_slot['slot_number']],
        "doctor_id": doctor_id,
        "priority": priority
    }
