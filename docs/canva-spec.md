# Dorm system spec (from the owner's Canva design, 18 pages)

Owner's instruction: follow this FEATURE SET and page list, but KEEP the current LNU design system, layout and styling
(navy/gold, assets/DESIGN.md). Only ADD missing information, tabs and pages. Do not redesign existing pages.
The Canva look itself (blue gradient phone mockups) is NOT wanted.

## Roles

1. Student (dormer)
2. Dorm Administrator ("Dorm Administrator Dashboard")
3. Security Personnel ("SECURITY PERSONNEL" dashboard)
   Dorm personnel register themselves and choose a personnel type (admin / security); an existing admin approves them.

## Registration (pages 2-4)

- Entry choice: "Register as Student" / "Register as Dorm Personnel".
- Student form: Fullname (Last, First, Middle initial), Age, Gender, Student ID, Email contact, Permanent address,
  **Entrance Slip (file upload)**, Register.
- Dorm personnel form: Fullname, Age, Gender, **Personnel type (select: Dorm Administrator / Security Personnel)**,
  Email, Password, Register. Status after submit: pending admin approval.

## Login (page 1): email + password; role decides landing page (student / admin / security).

## Student (pages 5-9)

Sidebar tabs: HOME, PROFILE, ATTENDANCE, PAYMENT, VIOLATIONS, ANNOUNCEMENTS, ... SETTINGS (bottom). Top bar: menu + notification bell.

- Home: "WELCOME, (name) (date)" Student Dashboard. 4 tiles: ROOM NUMBER, ATTENDANCE, PAYMENT, VIOLATIONS.
  Below: **Today Attendance** card (Date, Time, Status) and **Latest Announcements** card.
- Profile: the student's own details (name, year level, email, address, student ID, room/floor, status).
- Attendance: "Your status" + Time in / Time out (QR; QR page labelled with Room e.g. "Room 3-5"), Recent History list (Time in / Time out rows).
- Violations: Offenses, Absent count (e.g. 12), Curfew (date, time).
- Payment: upload Proof of payment (file, preview, date/time of uploads).
- Announcements: list of announcements posted by admin.
- Settings: account settings (change password; basic preferences).
- Notification bell: shows new announcements.

## Dorm Administrator (pages 10-16)

Sidebar: HOME, MANAGE (v) > Manage Students, Student Violation, Proof of Payment, Room management; ATTENDANCE; ANNOUNCEMENTS; SETTINGS.

- Home: "WELCOME, (name) (date) Dorm Administrator Dashboard". Tiles: MANAGE STUDENTS, ATTENDANCE, ANNOUNCEMENT.
  Cards: "Manage Students" (newly validated student registrations/emails appear here) and "Latest Announcements".
- Manage Students: "List of student" (name, year level, View) — View panel shows name, year level, email and a button
  "Enroll him/her now in dorms?" (pick floor + room). "Students enrolled in dorms" (name, year level, floor and room, View) —
  View panel plus "Modification" form: name, year level, email, floor and room, **Update**.
- Student Violations: search students; list (name, year level, floor and room, View); modal "Student violation": name, floor and room,
  Absent Y/N, "Enter Dormer Offenses", Submit. (Already exists in staff/violations.html — keep, add search/room columns as needed.)
- Proof of Payment ("Proofs Records"): list (name, floor and room, status Recorded/Unrecorded, View). View shows name, floor and room,
  status, and the uploaded proof image (empty state when nothing sent) — admin can mark it Recorded.
- Room management: floors 1-3, rooms 1-10 each. Floor accordion lists rooms with status Checked / Unchecked and View.
  Room view: floor and room, list of student names, and button "Check" with text "Please click Check if room is clean".
- Announcements: textarea "Enter announcements" (e.g. "Floor 3 Room 1 and 3 please clean your rooms") + Submit Announcements.
- Approves pending dorm personnel registrations.

## Security Personnel (pages 17-18)

Sidebar: HOME, ATTENDANCE, SETTINGS. Home: "WELCOME, (name) SECURITY PERSONNEL", cards LATEST ANNOUNCEMENTS and ATTENDANCE.

- Attendance: buttons "Scan QR" and "Scan QR For Curfew". Two tables: attendance (name, year level, floor and room, status PRESENT)
  and curfew violations (name, year level, floor and room, Violation/curfew e.g. "1st warning"). Two scanner panels: "Scanner" and
  "Curfew Scanner" (camera).
