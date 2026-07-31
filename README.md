# Hospital HRM — Clinic Payroll App

React Native / Expo app for clinic attendance, shift scheduling, leave, and salary for **Doctors** and **Staff**.

## Features

- **Roles** — 2 Admin accounts (full access); Doctor / Staff self-service
- **Attendance** — Same-day in/out only; scheduled vs attended hours; absent days; OT only after 1 hour past shift end
- **Shifts** — Day / Night assignments with **per-person** start/end times; admin shift chart
- **Leave** — Doctors: 2 paid days/cycle · Staff: 4 paid days/cycle; unpaid auto after quota; admin insert leave; who's on leave today
- **Payroll** — Monthly fixed base salary − unpaid/absent deductions + OT pay + bus fare allowance
- **WiFi punch** — Optional office WiFi verification (manual punch needs admin approval)

## Demo logins

| Role | Email | Password |
|------|-------|----------|
| Doctor | `dr.smith@clinic.com` | `password123` |
| Staff | `nurse.patel@clinic.com` | `password123` |
| Admin 1 | `admin1@clinic.com` | `admin123` |
| Admin 2 | `admin2@clinic.com` | `admin123` |

## Admin tabs

Dashboard · Attendance · Shifts · Leave · Payroll · Staff · Add

## Doctor / Staff tabs

Home (punch, shifts, who's on leave) · Attendance · Leave · Salary · Chat

## Payroll assumptions

- **Cycle:** monthly
- **Doctors & staff:** fixed monthly base salary (not purely hourly)
- **Per-day rate:** `baseSalary / 26`
- **OT:** hours beyond shift end **+ 1 hour grace**, paid at hourly rate
- **Bus fare:** admin-entered allowance added to payslip

## Install & run

```bash
npm install
npm start
```

> On Windows, if `postinstall` fails on the bash CORS patch, dependencies are still installed; you can ignore that script or run under Git Bash.

## Tech stack

Expo SDK 56 · React Native · TypeScript · Firebase Firestore · Expo Router
