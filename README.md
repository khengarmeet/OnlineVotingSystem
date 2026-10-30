# Online Voting System - React + Node.js + MongoDB

College-friendly online voting project with a dark/low-dark dashboard inspired by the supplied reference layout.

## Stack
- React + Vite
- Node.js HTTP server
- MongoDB / MongoDB Compass
- No Express
- No Python
- No OTP

## Main features
- Voter registration with 18+ age rule
- Email format + confirm-email validation
- Duplicate email/username protection
- Candidate registration goes to admin for approval
- Candidate cannot login until approved
- Admin can search/update/delete voters
- Admin can search/approve/update/delete candidates
- Election create/update/delete
- Vote records and one-vote-per-election rule
- Admin notifications for voters/candidates
- Responsive dark/low-dark UI
- Public dashboard with statistics and feature cards

## Run
### Backend
```bat
cd backend
npm install
npm run seed
npm start
```
Backend: http://localhost:5000
Health check: http://localhost:5000/api/health

### Frontend
Open another terminal:
```bat
cd frontend
npm install
npm run dev
```
Open the Vite URL shown in the terminal, normally http://localhost:5173

## MongoDB
Local MongoDB URI used by this project:
```text
mongodb://127.0.0.1:27017
```
Database:
```text
online_voting_system
```

MongoDB Compass can connect using the same URI. The database appears after `npm run seed` or after the first write.

## Demo accounts after seed
- Admin: `admin` / `admin123`
- Voter: `voter1` / `voter123`
- Candidate: `candidate1` / `candidate123`
