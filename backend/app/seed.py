from datetime import date, datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models
from .security import hash_password
from .services import create_notification, log_activity, sync_equipment_availability, utcnow


def seed_database(db: Session) -> None:
    if (db.scalar(select(func.count(models.User.id))) or 0) > 0:
        return

    today = date.today()
    now = utcnow()
    password_hash = hash_password("Demo@1234")

    users = {
        "admin": models.User(
            full_name="Dr. Sarah Mitchell", email="admin@labtrack.edu", username="admin",
            hashed_password=password_hash, role="admin", department="Laboratory Administration",
            identifier="ADM-001", phone="+1 555 0101", last_login_at=now - timedelta(hours=2),
        ),
        "assistant": models.User(
            full_name="Omar Hassan", email="assistant@labtrack.edu", username="labassistant",
            hashed_password=password_hash, role="lab_assistant", department="Electronics Engineering",
            identifier="LAB-014", phone="+1 555 0102", last_login_at=now - timedelta(hours=5),
        ),
        "student": models.User(
            full_name="Ayesha Khan", email="student@labtrack.edu", username="student",
            hashed_password=password_hash, role="student", department="Electrical Engineering",
            identifier="STU-2024-001", phone="+1 555 0103", last_login_at=now - timedelta(days=1),
        ),
        "faculty": models.User(
            full_name="Dr. James Carter", email="faculty@labtrack.edu", username="faculty",
            hashed_password=password_hash, role="faculty", department="Biomedical Engineering",
            identifier="FAC-008", phone="+1 555 0104", last_login_at=now - timedelta(hours=8),
        ),
        "student2": models.User(
            full_name="Daniel Okafor", email="daniel.okafor@labtrack.edu", username="dokafor",
            hashed_password=password_hash, role="student", department="Mechanical Engineering",
            identifier="STU-2024-014", phone="+1 555 0105",
        ),
        "student3": models.User(
            full_name="Priya Nair", email="priya.nair@labtrack.edu", username="pnair",
            hashed_password=password_hash, role="student", department="Chemical Engineering",
            identifier="STU-2023-087", phone="+1 555 0106",
        ),
        "faculty2": models.User(
            full_name="Dr. Emily Wong", email="emily.wong@labtrack.edu", username="ewong",
            hashed_password=password_hash, role="faculty", department="Chemistry",
            identifier="FAC-012", phone="+1 555 0107",
        ),
        "assistant2": models.User(
            full_name="Michael Brown", email="michael.brown@labtrack.edu", username="mbrown",
            hashed_password=password_hash, role="lab_assistant", department="Chemistry",
            identifier="LAB-021", phone="+1 555 0108",
        ),
    }
    db.add_all(users.values())
    db.flush()

    labs = {
        "electronics": models.Laboratory(
            name="Electronics Lab", code="ELAB", building="Engineering Building", room="EB-201",
            description="Circuits, embedded systems, instrumentation and soldering stations.",
            contact_person="Omar Hassan",
        ),
        "chemistry": models.Laboratory(
            name="Chemistry Lab", code="CLAB", building="Science Center", room="SC-104",
            description="Analytical chemistry, sample preparation and wet lab work.",
            contact_person="Michael Brown",
        ),
        "biology": models.Laboratory(
            name="Biology Lab", code="BLAB", building="Science Center", room="SC-210",
            description="Microscopy, cell culture and life science teaching equipment.",
            contact_person="Dr. James Carter",
        ),
        "optics": models.Laboratory(
            name="Optics & Photonics Lab", code="OLAB", building="Physics Building", room="PH-305",
            description="Optical measurement, imaging and photonics experiments.",
            contact_person="Dr. Sarah Mitchell",
        ),
    }
    db.add_all(labs.values())
    db.flush()

    categories = {
        "electronics": models.EquipmentCategory(name="Electronics", description="Circuit testing, embedded systems and soldering equipment."),
        "analytical": models.EquipmentCategory(name="Analytical Instruments", description="Precision measurement and chemical analysis instruments."),
        "optics": models.EquipmentCategory(name="Optics", description="Microscopes, imaging systems and optical components."),
        "biology": models.EquipmentCategory(name="Biology", description="Life science preparation and analysis equipment."),
        "fabrication": models.EquipmentCategory(name="Fabrication", description="Rapid prototyping and workshop fabrication tools."),
    }
    db.add_all(categories.values())
    db.flush()

    def make_equipment(
        index: int, name: str, category: str, lab: str, quantity: int, manufacturer: str,
        model_number: str, condition: str = "good", calibration_required: bool = False,
        last_calibration: date | None = None, next_calibration: date | None = None,
        description: str = "", purchase_date: date | None = None, price: float | None = None,
    ) -> models.Equipment:
        equipment = models.Equipment(
            asset_tag=f"EQP-{index:04d}", name=name, category_id=categories[category].id,
            laboratory_id=labs[lab].id, description=description or f"{name} available for supervised laboratory work.",
            manufacturer=manufacturer, model_number=model_number,
            serial_number=f"SN-{index:04d}-{today.year}", quantity=quantity, available_quantity=quantity,
            purchase_date=purchase_date or today - timedelta(days=500), purchase_price=price,
            condition=condition, status="available", calibration_required=calibration_required,
            last_calibration_date=last_calibration, next_calibration_date=next_calibration,
            maintenance_status="operational",
        )
        for seq in range(1, quantity + 1):
            equipment.assets.append(
                models.EquipmentAsset(
                    asset_code=f"EQP-{index:04d}-A{seq:02d}",
                    serial_number=f"{equipment.serial_number}-{seq:02d}",
                    condition=condition, status="available",
                )
            )
        db.add(equipment)
        db.flush()
        return equipment

    equipment = {}
    equipment[1] = make_equipment(1, "Digital Multimeter", "electronics", "electronics", 5, "Fluke", "87V", "excellent", True, today - timedelta(days=240), today + timedelta(days=120), "True-RMS industrial multimeter for circuit diagnostics.", price=349.0)
    equipment[2] = make_equipment(2, "Digital Oscilloscope", "electronics", "electronics", 3, "Tektronix", "TBS2204B", "good", True, today - timedelta(days=359), today + timedelta(days=6), "Four-channel 200 MHz digital storage oscilloscope.", price=2190.0)
    equipment[3] = make_equipment(3, "Function Generator", "electronics", "electronics", 3, "Keysight", "33510B", "good", True, today - timedelta(days=150), today + timedelta(days=215), "20 MHz waveform generator with arbitrary signal support.", price=1480.0)
    equipment[4] = make_equipment(4, "DC Power Supply", "electronics", "electronics", 4, "Rohde & Schwarz", "NGE100B", "excellent", True, today - timedelta(days=100), today + timedelta(days=265), "Programmable triple-output bench power supply.", price=720.0)
    equipment[5] = make_equipment(5, "Digital Microscope", "optics", "optics", 2, "Keyence", "VHX-7000", "excellent", True, today - timedelta(days=80), today + timedelta(days=285), "High-resolution digital microscope with 4K imaging.", price=7800.0)
    equipment[6] = make_equipment(6, "Spectrophotometer", "analytical", "chemistry", 1, "Shimadzu", "UV-1900i", "excellent", True, today - timedelta(days=30), today + timedelta(days=335), "Double-beam UV-Vis spectrophotometer for quantitative analysis.", price=12500.0)
    equipment[7] = make_equipment(7, "Analytical Balance", "analytical", "chemistry", 2, "Mettler Toledo", "ME204E", "good", True, today - timedelta(days=345), today + timedelta(days=20), "Precision analytical balance, 220 g capacity, 0.1 mg readability.", price=3150.0)
    equipment[8] = make_equipment(8, "Laboratory Centrifuge", "biology", "biology", 2, "Eppendorf", "5810 R", "good", True, today - timedelta(days=200), today + timedelta(days=165), "Refrigerated benchtop centrifuge for sample separation.", price=6400.0)
    equipment[9] = make_equipment(9, "Soldering Station", "electronics", "electronics", 3, "Weller", "WT1010", "good", False, description="Temperature-controlled soldering station for electronics assembly.", price=280.0)
    equipment[10] = make_equipment(10, "Arduino Development Kit", "electronics", "electronics", 8, "Arduino", "UNO R4 WiFi", "good", False, description="Complete microcontroller development kit for embedded labs.", price=95.0)
    equipment[11] = make_equipment(11, "Raspberry Pi 4 Kit", "electronics", "electronics", 6, "Raspberry Pi Foundation", "Pi 4 Model B 8GB", "good", False, description="Single-board computer kit with sensors and accessories.", price=135.0)
    equipment[12] = make_equipment(12, "Thermal Imaging Camera", "electronics", "electronics", 1, "FLIR", "E54", "fair", True, today - timedelta(days=90), today + timedelta(days=275), "Handheld thermal camera for electronics and building diagnostics.", price=4200.0)
    equipment[13] = make_equipment(13, "Benchtop pH Meter", "analytical", "chemistry", 3, "Hanna Instruments", "HI5222", "good", True, today - timedelta(days=370), today - timedelta(days=5), "Research-grade pH and ORP benchtop meter.", price=890.0)
    equipment[14] = make_equipment(14, "Vortex Mixer", "biology", "biology", 2, "IKA", "Vortex 4 digital", "good", False, description="Digital vortex mixer for rapid sample mixing.", price=460.0)
    equipment[15] = make_equipment(15, "Laboratory Incubator", "biology", "biology", 1, "Thermo Fisher", "Heratherm IMH180", "good", True, today - timedelta(days=120), today + timedelta(days=245), "Forced-air incubator for controlled temperature studies.", price=5300.0)
    equipment[16] = make_equipment(16, "UV-Vis Spectrometer", "analytical", "chemistry", 1, "PerkinElmer", "Lambda 365", "excellent", True, today - timedelta(days=45), today + timedelta(days=320), "UV-Vis spectrometer for advanced analytical teaching.", price=16800.0)
    equipment[17] = make_equipment(17, "Signal Analyzer", "electronics", "electronics", 1, "Keysight", "N9020B", "good", True, today - timedelta(days=130), today + timedelta(days=230), "MXA signal analyzer for RF and communications labs.", price=24500.0)
    equipment[18] = make_equipment(18, "Precision Pipette Set", "biology", "biology", 4, "Eppendorf", "Research plus", "excellent", True, today - timedelta(days=60), today + timedelta(days=300), "Variable-volume precision pipette set (0.1–1000 µL).", price=980.0)
    equipment[19] = make_equipment(19, "Hot Plate Stirrer", "analytical", "chemistry", 3, "IKA", "C-MAG HS 7", "good", False, description="Ceramic hot plate stirrer for sample preparation.", price=520.0)
    equipment[20] = make_equipment(20, "3D Printer", "fabrication", "electronics", 1, "Prusa", "MK4", "good", False, description="FDM 3D printer for rapid prototyping and project fabrication.", price=1099.0)

    def make_borrowing(
        code: str, user_key: str, eq: models.Equipment, status: str, requested_days: int,
        due_days: int, asset_seq: int | None = None, purpose: str = "", returned_days: int | None = None,
        approved_by: str | None = None, issued_by: str | None = None, reason: str | None = None,
    ) -> models.Borrowing:
        requested = now - timedelta(days=requested_days)
        asset = eq.assets[asset_seq - 1] if asset_seq else None
        borrowing = models.Borrowing(
            transaction_code=code, user_id=users[user_key].id, equipment_id=eq.id,
            asset_id=asset.id if asset else None, quantity=1, purpose=purpose or "Laboratory coursework",
            request_date=requested,
            approval_date=requested + timedelta(hours=4) if status not in ("pending", "rejected") else None,
            issue_date=requested + timedelta(days=1) if status in ("issued", "return_requested", "returned", "overdue") else None,
            expected_return_date=today + timedelta(days=due_days),
            actual_return_date=now - timedelta(days=returned_days) if returned_days is not None else None,
            status=status, return_condition="good" if returned_days is not None else None,
            rejection_reason=reason,
            approved_by_id=users[approved_by].id if approved_by else None,
            issued_by_id=users[issued_by].id if issued_by else None,
        )
        if asset and status in ("issued", "return_requested", "overdue"):
            asset.status = "borrowed"
            borrowing.borrowed_assets.append(models.BorrowingAsset(asset_id=asset.id))
        elif asset and returned_days is not None:
            borrowing.borrowed_assets.append(
                models.BorrowingAsset(asset_id=asset.id, returned_at=now - timedelta(days=returned_days))
            )
        db.add(borrowing)
        return borrowing

    make_borrowing("BRW-2026-0001", "student", equipment[2], "issued", 3, 4, 1, "Signals and systems laboratory assignment", approved_by="assistant", issued_by="assistant")
    make_borrowing("BRW-2026-0002", "student", equipment[1], "overdue", 10, -2, 1, "Capstone prototype diagnostics", approved_by="assistant", issued_by="assistant")
    make_borrowing("BRW-2026-0003", "faculty", equipment[8], "issued", 5, 7, 1, "Biomedical sample preparation", approved_by="assistant", issued_by="assistant")
    make_borrowing("BRW-2026-0004", "student3", equipment[3], "returned", 40, -31, 2, "Analog circuits lab", returned_days=30, approved_by="assistant", issued_by="assistant")
    make_borrowing("BRW-2026-0005", "student", equipment[10], "returned", 30, -21, 1, "Embedded systems project", returned_days=20, approved_by="assistant", issued_by="assistant")
    make_borrowing("BRW-2026-0006", "faculty2", equipment[6], "returned", 65, -56, 1, "Water quality analysis", returned_days=55, approved_by="assistant", issued_by="assistant")
    make_borrowing("BRW-2026-0007", "student", equipment[11], "pending", 0, 7, None, "IoT laboratory practical")
    make_borrowing("BRW-2026-0008", "student2", equipment[12], "rejected", 8, 3, None, "Thermal analysis of PCB prototypes", reason="Equipment reserved for faculty research this week.")
    make_borrowing("BRW-2026-0009", "faculty", equipment[17], "approved", 0, 10, None, "RF communications research measurements", approved_by="assistant")
    make_borrowing("BRW-2026-0010", "student3", equipment[13], "return_requested", 2, 5, 2, "Chemistry titration experiment", approved_by="assistant", issued_by="assistant")

    reservation_specs = [
        ("RSV-2026-0001", "student", equipment[10], 1, 1, time(10, 0), time(12, 0), "approved", "assistant", "Embedded systems group work"),
        ("RSV-2026-0002", "student2", equipment[2], 3, 1, time(14, 0), time(16, 0), "pending", None, "Senior design signal testing"),
        ("RSV-2026-0003", "faculty2", equipment[6], 5, 1, time(9, 0), time(11, 0), "approved", "assistant", "Water sample analysis"),
        ("RSV-2026-0004", "student", equipment[20], 7, 1, time(13, 0), time(15, 0), "rejected", "assistant", "Prototype enclosure printing"),
        ("RSV-2026-0005", "student3", equipment[5], 5, 1, time(9, 0), time(10, 0), "cancelled", None, "Microscopy practical"),
    ]
    for code, user_key, eq, day_offset, qty, start, end, status, approver, purpose in reservation_specs:
        db.add(models.Reservation(
            reservation_code=code, user_id=users[user_key].id, equipment_id=eq.id, quantity=qty,
            reservation_date=today + timedelta(days=day_offset), start_time=start, end_time=end,
            purpose=purpose, status=status,
            approved_by_id=users[approver].id if approver else None,
            decision_note="Reserved for department workshop." if status == "rejected" else None,
        ))

    # Damage reports
    thermal_asset = equipment[12].assets[0]
    thermal_asset.status = "damaged"
    thermal_asset.condition = "damaged"
    ph_asset = equipment[13].assets[2]
    db.add_all([
        models.DamageReport(
            report_code="DMG-2026-0001", equipment_id=equipment[2].id, asset_id=equipment[2].assets[1].id,
            reported_by_id=users["student"].id, issue_category="Display fault",
            description="The display flickers after about ten minutes of operation and the trace occasionally freezes.",
            priority="high", status="under_review", created_at=now - timedelta(days=2),
        ),
        models.DamageReport(
            report_code="DMG-2026-0002", equipment_id=equipment[12].id, asset_id=thermal_asset.id,
            reported_by_id=users["student2"].id, issue_category="Sensor failure",
            description="Thermal image shows a persistent dead band and the temperature reading is inaccurate.",
            priority="critical", status="under_repair", reviewed_by_id=users["assistant"].id,
            created_at=now - timedelta(days=4),
        ),
        models.DamageReport(
            report_code="DMG-2026-0003", equipment_id=equipment[13].id, asset_id=ph_asset.id,
            reported_by_id=users["faculty2"].id, issue_category="Probe damage",
            description="pH probe tip was cracked during cleaning and readings were unstable.",
            priority="medium", status="resolved", reviewed_by_id=users["assistant"].id,
            resolution_notes="Probe replaced and meter recalibrated successfully.", created_at=now - timedelta(days=20),
        ),
    ])

    # Maintenance
    incubator_asset = equipment[15].assets[0]
    incubator_asset.status = "maintenance"
    db.add_all([
        models.MaintenanceRecord(
            maintenance_code="MNT-2026-0001", equipment_id=equipment[15].id, asset_id=incubator_asset.id,
            maintenance_type="corrective", title="Temperature sensor replacement",
            description="Incubator is showing a temperature deviation warning.", scheduled_date=today - timedelta(days=3),
            started_at=now - timedelta(days=2), status="in_progress", technician="Alex Morgan",
            service_provider="Thermo Fisher Service", cost=240.0, created_by_id=users["assistant"].id,
        ),
        models.MaintenanceRecord(
            maintenance_code="MNT-2026-0002", equipment_id=equipment[8].id, asset_id=equipment[8].assets[1].id,
            maintenance_type="preventive", title="Annual bearing service", description="Rotor bearing inspection and lubrication.",
            scheduled_date=today - timedelta(days=25), started_at=now - timedelta(days=25),
            completed_at=now - timedelta(days=24), status="completed", technician="TekServ Ltd",
            service_provider="TekServ Ltd", cost=180.0, created_by_id=users["assistant"].id,
        ),
        models.MaintenanceRecord(
            maintenance_code="MNT-2026-0003", equipment_id=equipment[2].id,
            maintenance_type="preventive", title="Preventive cleaning and calibration check",
            description="Routine cleaning of front panel and probe compensation check.", scheduled_date=today + timedelta(days=3),
            status="scheduled", technician="Omar Hassan", created_by_id=users["assistant"].id,
        ),
        models.MaintenanceRecord(
            maintenance_code="MNT-2026-0004", equipment_id=equipment[20].id,
            maintenance_type="inspection", title="Nozzle and bed inspection",
            description="Quarterly mechanical inspection of the 3D printer.", scheduled_date=today + timedelta(days=6),
            status="scheduled", technician="Michael Brown", created_by_id=users["assistant"].id,
        ),
        models.MaintenanceRecord(
            maintenance_code="MNT-2026-0005", equipment_id=equipment[14].id, asset_id=equipment[14].assets[1].id,
            maintenance_type="repair", title="Motor mount repair", description="Loose motor mount caused excessive vibration.",
            scheduled_date=today - timedelta(days=12), started_at=now - timedelta(days=12),
            completed_at=now - timedelta(days=10), status="completed", technician="Omar Hassan",
            cost=35.0, created_by_id=users["assistant"].id,
        ),
    ])

    calibration_specs = [
        ("CAL-2026-0001", equipment[6], today - timedelta(days=30), today + timedelta(days=335), "passed", "Shimadzu Service"),
        ("CAL-2026-0002", equipment[7], today - timedelta(days=345), today + timedelta(days=20), "passed", "Mettler Toledo Service"),
        ("CAL-2026-0003", equipment[13], today - timedelta(days=370), today - timedelta(days=5), "passed", "Hanna Instruments"),
        ("CAL-2026-0004", equipment[2], today - timedelta(days=359), today + timedelta(days=6), "passed", "Tektronix Service"),
        ("CAL-2026-0005", equipment[12], today - timedelta(days=90), today + timedelta(days=275), "adjusted", "FLIR Service"),
    ]
    for code, eq, calibrated, next_due, result, provider in calibration_specs:
        db.add(models.CalibrationRecord(
            calibration_code=code, equipment_id=eq.id, calibration_date=calibrated, next_due_date=next_due,
            result=result, technician="Certified Service Engineer", service_provider=provider,
            notes="Calibration completed within manufacturer tolerance.", created_by_id=users["assistant"].id,
        ))
        eq.last_calibration_date = calibrated
        eq.next_calibration_date = next_due

    consumable_specs = [
        ("Nitrile Gloves (Box of 100)", "Safety", 4, "boxes", 10, "VWR", 12.50, labs["chemistry"], 14, 10),
        ("Borosilicate Test Tubes", "Glassware", 35, "tubes", 20, "Cole-Parmer", 3.20, labs["chemistry"], 35, 0),
        ("Laboratory Ethanol 70%", "Chemicals", 12, "bottles", 6, "Sigma-Aldrich", 18.00, labs["chemistry"], 18, 6),
        ("Filter Paper (Grade 1)", "Consumables", 8, "packs", 10, "Whatman", 9.75, labs["chemistry"], 8, 0),
        ("Pasteur Pipettes", "Glassware", 200, "pieces", 100, "VWR", 0.18, labs["biology"], 250, 50),
        ("Copper Wire Spool", "Electronics", 2, "spools", 3, "Digi-Key", 24.00, labs["electronics"], 5, 3),
        ("Solder Wire (Lead-Free)", "Electronics", 5, "rolls", 4, "Weller", 21.50, labs["electronics"], 7, 2),
        ("Jumper Wire Set", "Electronics", 30, "sets", 15, "Arduino", 4.50, labs["electronics"], 30, 0),
        ("Microscope Slides", "Glassware", 45, "boxes", 25, "Thermo Fisher", 7.20, labs["biology"], 45, 0),
        ("pH Buffer Solution", "Chemicals", 3, "bottles", 5, "Hanna Instruments", 16.00, labs["chemistry"], 3, 0),
    ]
    for name, category, qty, unit, minimum, supplier, price, lab, initial, used in consumable_specs:
        consumable = models.Consumable(
            name=name, category=category, quantity=qty, unit=unit, minimum_stock=minimum,
            laboratory_id=lab.id, supplier=supplier, unit_price=price,
            description=f"{name} maintained by the laboratory stores.",
        )
        db.add(consumable)
        db.flush()
        db.add(models.ConsumableTransaction(
            consumable_id=consumable.id, user_id=users["assistant"].id, transaction_type="in",
            quantity=initial, balance_after=initial, note="Initial stock received",
            created_at=now - timedelta(days=60),
        ))
        if used:
            db.add(models.ConsumableTransaction(
                consumable_id=consumable.id, user_id=users["assistant"].id, transaction_type="out",
                quantity=used, balance_after=qty, note="Issued to laboratory practical",
                created_at=now - timedelta(days=5),
            ))

    db.flush()

    # Recalculate all equipment availability from asset state.
    for eq in equipment.values():
        sync_equipment_availability(eq)
        if eq.id in (equipment[2].id, equipment[20].id) and eq.maintenance_status != "under_maintenance":
            eq.maintenance_status = "scheduled"
    db.flush()

    # Demo notifications
    notifications = [
        ("admin", "Pending borrowing request", "Ayesha Khan requested a Raspberry Pi 4 Kit for an IoT laboratory practical.", "borrowing_request", "/borrowings", False, now - timedelta(minutes=35)),
        ("admin", "Calibration overdue", "Benchtop pH Meter calibration is overdue by 5 days.", "calibration", "/calibration", False, now - timedelta(hours=3)),
        ("assistant", "Damage report awaiting review", "Digital Oscilloscope display fault reported by Ayesha Khan.", "damage", "/damage-reports", False, now - timedelta(hours=5)),
        ("assistant", "Consumable stock running low", "Nitrile Gloves (Box of 100) has 4 boxes remaining (minimum 10).", "low_stock", "/consumables", False, now - timedelta(hours=6)),
        ("student", "Reservation approved", "Your reservation for Arduino Development Kit on the next lab day was approved.", "reservation", "/my-reservations", False, now - timedelta(hours=2)),
        ("student", "Equipment return reminder", "Digital Multimeter is overdue. Please return it to the Electronics Lab.", "overdue", "/borrowings", False, now - timedelta(hours=9)),
        ("faculty", "Reservation approved", "Your Spectrophotometer reservation was approved.", "reservation", "/my-reservations", True, now - timedelta(days=1)),
        ("admin", "Maintenance in progress", "Laboratory Incubator is under corrective maintenance.", "maintenance", "/maintenance", True, now - timedelta(days=2)),
    ]
    for user_key, title, message, ntype, link, is_read, created in notifications:
        db.add(models.Notification(
            user_id=users[user_key].id, title=title, message=message, notification_type=ntype,
            link=link, is_read=is_read, created_at=created,
        ))

    activity_specs = [
        ("assistant", "Issued equipment", "borrowing", 1, "Digital Oscilloscope issued to Ayesha Khan", 3),
        ("admin", "Approved borrowing request", "borrowing", 9, "Signal Analyzer request approved for Dr. James Carter", 0),
        ("student", "Submitted borrowing request", "borrowing", 7, "Raspberry Pi 4 Kit requested", 0),
        ("assistant", "Updated maintenance status", "maintenance", 1, "Laboratory Incubator moved to in progress", 2),
        ("faculty2", "Reported damaged equipment", "damage_report", 3, "pH probe damage report submitted", 20),
        ("assistant", "Recorded calibration", "calibration", 4, "Oscilloscope calibration recorded", 359),
        ("admin", "Updated equipment", "equipment", 7, "Analytical Balance calibration date updated", 5),
        ("student3", "Requested equipment return", "borrowing", 10, "Benchtop pH Meter return requested", 2),
    ]
    for user_key, action, entity_type, entity_id, details, days_ago in activity_specs:
        db.add(models.ActivityLog(
            user_id=users[user_key].id, action=action, entity_type=entity_type,
            entity_id=entity_id, details=details, created_at=now - timedelta(days=days_ago),
        ))

    db.commit()
