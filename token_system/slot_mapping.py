def map_token_to_time(token_number):
    slot_times = {
        1: "09:00", 2: "09:30", 3: "10:00", 4: "10:30",
        5: "11:00", 6: "11:30", 7: "12:00", 8: "12:30",
        9: "01:00", 10: "01:30"
    }
    return slot_times.get(token_number, "N/A")

