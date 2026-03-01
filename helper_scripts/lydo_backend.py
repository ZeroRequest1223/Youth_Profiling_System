import os
from helper_scripts.db import (
    init_db,
    add_barangay,
    list_barangays,
    add_youth_record,
    list_youth,
    update_youth,
    delete_youth,
    seed_sample,
)


DB_LOCATION = os.path.relpath(os.path.join(os.path.dirname(__file__), "monitor.db"), start=os.getcwd())


def _print_rows(rows):
    for r in rows:
        print("-" * 40)
        for k, v in r.items():
            print(f"{k}: {v}")


def interactive_menu():
    init_db()
    print("LYDO Monitoring - with Email Support")
    # Show where the SQLite file is stored so users know the DB location
    print(f"Database file: {DB_LOCATION}")

    while True:
        print("\nChoose an option:")
        print("1) List barangays")
        print("2) Add barangay")
        print("3) List youth records")
        print("4) Add youth record")
        print("5) Update youth record")
        print("6) Delete youth record")
        print("7) Seed sample data")
        print("0) Exit")

        choice = input("> ").strip()

        if choice == "1":
            rows = list_barangays()
            _print_rows(rows)

        elif choice == "2":
            name = input("Barangay name: ").strip()
            if name:
                bid = add_barangay(name)
                print(f"Added/Found barangay id: {bid}")

        elif choice == "3":
            b = input("Filter by barangay id (enter to skip): ").strip()
            rows = list_youth(int(b)) if b else list_youth()
            _print_rows(rows)

        elif choice == "4":
            try:
                bids = list_barangays()
                print("Available barangays:")
                for r in bids:
                    print(f"{r['id']}: {r['name']}")

                bid = int(input("Barangay id: ").strip())
                name = input("Youth name: ").strip()
                email = input("Email Address: ").strip() or None

                age = input("Age (enter to skip): ").strip()
                age = int(age) if age else None
                gender = input("Gender: ").strip() or None
                program = input("Program: ").strip() or None
                notes = input("Notes: ").strip() or None

                rid = add_youth_record(bid, name, email, age, gender, program, None, notes)
                print(f"Added youth record id: {rid}")
            except Exception as e:
                print("Error adding youth:", e)

        elif choice == "5":
            try:
                ry = int(input("Youth id to update: ").strip())
                
                # --- NEW VALIDATION CODE STARTS HERE ---
                allowed_fields = ["name", "email", "age", "gender", "program", "notes"]
                field = input(f"Field to update ({', '.join(allowed_fields)}): ").strip()

                if field not in allowed_fields:
                    print("Invalid field name.")
                    continue  # Restarts the loop, effectively cancelling the update

                val = input("New value: ").strip()
                # --- NEW VALIDATION CODE ENDS HERE ---

                if field == "age":
                    val = int(val)

                update_youth(ry, **{field: val})
                print("Updated.")
            except Exception as e:
                print("Error updating:", e)

        elif choice == "6":
            try:
                ry = int(input("Youth id to delete: ").strip())
                delete_youth(ry)
                print("Deleted (if existed).")
            except Exception as e:
                print("Error deleting:", e)

        elif choice == "7":
            seed_sample()
            print("Sample data seeded.")

        elif choice == "0":
            print("Goodbye")
            break
        else:
            print("Unknown option")


if __name__ == "__main__":
    interactive_menu()
