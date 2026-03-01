from helper_scripts.lydo_backend import init_db, add_barangay, add_youth_record, list_youth

# Ensure DB and tables exist
init_db()

# Add entries
bid = add_barangay("Poblacion")
rid = add_youth_record(bid, "Juan Example", "juan@example.com", age=17, gender="Male", program="Skills")

# Print all youth records
for r in list_youth():
    print(r)
